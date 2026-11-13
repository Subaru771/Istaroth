import asyncio
import importlib.util
import sys
import types
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gateway

async def initialize(client):
    response=await client.get('/')
    session=client.cookies.get('istaroth_gateway_session')
    assert session
    client.headers['x-istaroth-csrf']=gateway.csrf_for_session(session)
    return response

@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.setenv('GATEWAY_ACCESS_PASSWORD', 'test-private-access-password')
    for job in list(gateway.jobs.values()):
        if job.task and not job.task.done(): job.task.cancel()
    gateway.jobs.clear()
    gateway.reservations.clear()
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
        await initialize(client)
        resp=await client.post('/api/start',json={'code':'123','account':'user@example.com','password':'1234567'})
        assert resp.status_code==422
        assert len(gateway.jobs)==0

@pytest.mark.asyncio
async def test_csrf_cross_site_rejected():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as client:
        await initialize(client)
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
        if endpoint=='/api/link/claim':
            return {'ok':True}
        if endpoint=='/api/link/preview':
            assert 'ltoken_v2=secret-token-123' in payload['cookie']
            assert len(payload['proof']) == 43
            return {'accounts':[{'uid':'801234567','region':'os_asia','nickname':'Lumine'}]}
        assert endpoint=='/api/link/complete'
        assert payload['uid']=='801234567'
        assert len(payload['proof']) == 43
        return {'ok':True}
    monkeypatch.setattr(gateway,'json_from_community',simulate)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as client:
        await initialize(client)
        preflight=await client.post('/api/pairing/claim',json={'code':'A'*24})
        assert preflight.status_code==200
        resp=await client.post('/api/start',json={'code':'A'*24,'claim_token':preflight.json()['claimToken'],'account':'user@example.com','password':'never-store-me'})
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
        client.headers['x-istaroth-csrf']=gateway.csrf_for_session('x'*43)
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
        assert endpoint == '/api/link/claim'
        raise ValueError('Code expired')
    monkeypatch.setattr(gateway, 'json_from_community', reject)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example') as client:
        assert (await client.get('/')).status_code == 401
        result=await client.post('/api/start',json={'code':'A'*24,'account':'user@example.com','password':'not-sent'})
        assert result.status_code == 401
        assert not gateway.jobs

@pytest.mark.asyncio
async def test_invalid_community_code_stops_before_password_login(monkeypatch):
    async def deny(endpoint,payload):
        assert endpoint == '/api/link/claim'
        raise ValueError('Pairing code expired or invalid.')
    monkeypatch.setattr(gateway,'json_from_community',deny)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as client:
        await initialize(client)
        response = await client.post('/api/pairing/claim',json={'code':'A'*24})
        assert response.status_code == 403
        assert not gateway.jobs

@pytest.mark.asyncio
async def test_community_check_must_explicitly_return_ok(monkeypatch):
    async def ambiguous(endpoint, payload):
        assert endpoint == '/api/link/claim'
        return {'message': 'unexpected response'}
    monkeypatch.setattr(gateway, 'json_from_community', ambiguous)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as client:
        await initialize(client)
        result=await client.post('/api/pairing/claim',json={'code':'A'*24})
        assert result.status_code == 403
        assert not gateway.jobs

@pytest.mark.asyncio
async def test_pairing_claim_cannot_be_replayed_or_used_by_another_browser(monkeypatch):
    async def mock_community(endpoint,payload):
        assert endpoint == '/api/link/claim'
        assert len(payload['proof']) == 43
        return {'ok':True}
    async def fake_login(job,account,password):
        job.status='failed'
    monkeypatch.setattr(gateway,'json_from_community',mock_community)
    monkeypatch.setattr(gateway,'perform_login',fake_login)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as first:
        await initialize(first)
        claim=await first.post('/api/pairing/claim',json={'code':'A'*24})
        assert claim.status_code==200
        ticket=claim.json()['claimToken']
        fields={'code':'A'*24,'claim_token':ticket,'account':'user@example.com','password':'test'}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as second:
            await initialize(second)
            assert (await second.post('/api/start',json=fields)).status_code==403
        assert (await first.post('/api/start',json=fields)).status_code==200
        assert (await first.post('/api/start',json=fields)).status_code==403

@pytest.mark.asyncio
async def test_csrf_required_even_with_valid_http_basic_and_session():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),base_url='https://gateway.example',auth=('owner','test-private-access-password')) as client:
        page=await client.get('/')
        assert page.status_code==200
        assert 'istaroth-csrf' in page.text
        result=await client.post('/api/pairing/claim',json={'code':'A'*24})
        assert result.status_code==403
        assert not gateway.reservations
