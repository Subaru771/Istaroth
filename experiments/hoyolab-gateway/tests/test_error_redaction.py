"""Security regression: upstream exceptions must not expose secrets to clients."""
import time
import httpx
import pytest
import gateway

@pytest.mark.asyncio
async def test_approval_redacts_upstream_error(monkeypatch):
    monkeypatch.setenv('GATEWAY_ACCESS_PASSWORD', 'test-private-access-password')
    gateway.jobs.clear()
    secret = 'upstream-private-token-should-not-leak'
    async def fail(endpoint, payload):
        raise ValueError(secret)
    monkeypatch.setattr(gateway, 'json_from_community', fail)
    job = gateway.LoginJob(id='redaction-test', session='x'*43, pairing_code='A'*24,
                           created=time.monotonic(), status='ready', cookie='sensitive-cookie',
                           accounts=[{'uid':'801234567','region':'os_asia','nickname':'Traveler'}])
    gateway.jobs[job.id] = job
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),
                base_url='https://gateway.example', auth=('owner','test-private-access-password'),
                cookies={'istaroth_gateway_session':'x'*43}) as client:
            result = await client.post('/api/approve/redaction-test',
                                       json={'uid':'801234567','region':'os_asia'})
            assert result.status_code == 502
            assert secret not in result.text
            assert 'sensitive-cookie' not in result.text
            assert secret not in job.message
            assert job.cookie is None
    finally:
        gateway.jobs.clear()
