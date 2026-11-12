import asyncio
import importlib.util
import sys
import types
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gateway

@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.setenv('GATEWAY_ACCESS_PASSWORD', 'test-private-access-password')
    for job in list(gateway.jobs.values()):
        if job.task and not job.task.done(): job.task.cancel()
    gateway.jobs.clear()
    gateway.attempts.clear()
    yield

@pytest.mark.asyncio
async def test_health_and_static_page():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as client:
        response=await client.get('/health')
        assert response.json()['online'] is True
        response=await client.get('/')
        assert 'Connect your Traveler' in response.text
        assert 'not HoYoLAB' in response.text
        assert 'HttpOnly' in response.headers['set-cookie']
        assert 'Secure' in response.headers['set-cookie']

@pytest.mark.asyncio
async def test_invalid_pairing_code_rejected():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as client:
        await client.get('/')
        resp=await client.post('/api/start',json={'code':'123','account':'user@example.com','password':'1234567'})
        assert resp.status_code==422
        assert len(gateway.jobs)==0

@pytest.mark.asyncio
async def test_csrf_cross_site_rejected():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as client:
        await client.get('/')
        resp=await client.post('/api/start',headers={'origin':'https://evil.example'},json={})
        assert resp.status_code==403
        assert not gateway.jobs

@pytest.mark.asyncio
async def test_real_backend_login_flow_with_mocked_hoyolab(monkeypatch):
    class FakeMMT: pass
    class FakeMMTV4: pass
    class FakeResult:
        def model_dump(self):
            return {'ltoken_v2':'secret-token-123','ltuid_v2':'123456789','ltmid_v2':'abc','account_id_v2':'123456789'}
    class FakeClient:
        async def os_login_with_password(self,account,password,geetest_solver):
            assert account=='user@example.com'
            assert password=='never-store-me'
            return FakeResult()
        async def close(self): pass
    fake_genshin=types.ModuleType('genshin');fake_genshin.Client=FakeClient
    fake_models=types.ModuleType('genshin.models')
    fake_auth=types.ModuleType('genshin.models.auth')
    fake_geetest=types.ModuleType('genshin.models.auth.geetest')
    fake_geetest.SessionMMT=FakeMMT; fake_geetest.SessionMMTv4=FakeMMTV4
    for name,mod in [('genshin',fake_genshin),('genshin.models',fake_models),('genshin.models.auth',fake_auth),('genshin.models.auth.geetest',fake_geetest)]:
        monkeypatch.setitem(sys.modules,name,mod)
    async def simulate(endpoint,payload):
        assert payload['code']=='A'*24
        if endpoint=='/api/link/preview':
            assert 'ltoken_v2=secret-token-123' in payload['cookie']
            return {'accounts':[{'uid':'801234567','region':'os_asia','nickname':'Lumine'}]}
        assert endpoint=='/api/link/complete'
        assert payload['uid']=='801234567'
        return {'ok':True}
    monkeypatch.setattr(gateway,'json_from_community',simulate)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as client:
        await client.get('/')
        resp=await client.post('/api/start',json={'code':'A'*24,'account':'user@example.com','password':'never-store-me'})
        assert resp.status_code==200
        job_id=resp.json()['id']
        for _ in range(100):
            status=(await client.get('/api/status/'+job_id)).json()
            if status['status'] not in ['logging_in','finding_accounts']:break
            await asyncio.sleep(.005)
        assert status['status']=='ready',status
        assert status['accounts']==[{'uid':'801234567','region':'os_asia','nickname':'Lumine'}]
        assert 'secret-token-123' not in str(status)
        assert 'never-store-me' not in str(status)
        resp=await client.post('/api/approve/'+job_id,json={'uid':'801234567','region':'os_asia'})
        assert resp.status_code==200,resp.text
        assert resp.json()['linked']
        assert gateway.jobs[job_id].cookie is None
        resp=await client.post('/api/approve/'+job_id,json={'uid':'801234567','region':'os_asia'})
        assert resp.status_code==409

@pytest.mark.asyncio
async def test_account_selection_must_match_authenticated_hoyolab():
    job=gateway.LoginJob(id='job',session='x'*43,pairing_code='y'*24,created=__import__('time').monotonic(),status='ready',cookie='ltoken_v2=secret',accounts=[{'uid':'801234567','region':'os_asia','nickname':'A'}])
    gateway.jobs['job']=job
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password'),cookies={'istaroth_gateway_session':'x'*43}) as client:
        resp=await client.post('/api/approve/job',json={'uid':'999999999','region':'os_euro'})
        assert resp.status_code==403
        assert job.cookie=='ltoken_v2=secret'

@pytest.mark.asyncio
async def test_session_isolation_and_expiry():
    job=gateway.LoginJob(id='job',session='x'*43,pairing_code='y'*24,created=__import__('time').monotonic(),status='ready',cookie='secret')
    gateway.jobs['job']=job
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password'),cookies={'istaroth_gateway_session':'z'*43}) as client:
        resp=await client.get('/api/status/job')
        assert resp.status_code==404
    job.created-=1000
    gateway.cleanup()
    assert 'job' not in gateway.jobs
    assert job.cookie is None

@pytest.mark.asyncio
async def test_gateway_rejects_unauthenticated_access(monkeypatch):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example') as client:
        assert (await client.get('/health')).status_code == 200
        assert (await client.get('/')).status_code == 401
        assert (await client.get('/static/app.js')).status_code == 401
        assert (await client.post('/api/start',json={})).status_code == 401
        assert (await client.get('/',auth=('owner','wrong-password'))).status_code == 401
    monkeypatch.delenv('GATEWAY_ACCESS_PASSWORD')
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example') as client:
        assert (await client.get('/')).status_code == 401

@pytest.mark.asyncio
async def test_public_mode_requires_valid_community_code(monkeypatch):
    monkeypatch.setenv('GATEWAY_PUBLIC_PAIRING', '1')
    async def reject(endpoint,payload):
        assert endpoint == '/api/link/check'
        raise ValueError('Code expired')
    monkeypatch.setattr(gateway, 'json_from_community', reject)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example') as client:
        await client.get('/')
        result=await client.post('/api/start',json={'code':'A'*24,'account':'user@example.com','password':'not-sent'})
        assert result.status_code == 403
        assert not gateway.jobs
