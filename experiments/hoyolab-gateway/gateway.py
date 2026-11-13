"""Istaroth international HoYoLAB login gateway.

EXPERIMENTAL / PRIVATE DEPLOYMENT ONLY. Users voluntarily provide a password to
this server. This is NOT HoYoverse's official authorization or an OAuth flow.
Never log request bodies or store HoYoLAB credentials on disk.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import hmac
import hashlib
import html
import os
import re
import secrets
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

COMMUNITY = os.getenv('COMMUNITY_ORIGIN', 'https://istaroth-community.gxcccgx123.workers.dev').rstrip('/')
if not COMMUNITY.startswith('https://') or not re.fullmatch(r'https://[a-zA-Z0-9.-]+', COMMUNITY):
    raise RuntimeError('COMMUNITY_ORIGIN must be one HTTPS host with no path.')

CSRF_SECRET = secrets.token_bytes(32)

def csrf_for_session(session: str) -> str:
    return hmac.new(CSRF_SECRET,session.encode('utf-8'),hashlib.sha256).hexdigest()

MAX_JOBS = 50
TTL_SECONDS = 300
app = FastAPI(title='Istaroth HoYoLAB Connector', docs_url=None, redoc_url=None, openapi_url=None)
app.mount('/static', StaticFiles(directory=os.path.join(os.path.dirname(__file__), 'static')), name='static')

@dataclass
class LoginJob:
    id: str
    session: str
    pairing_code: str
    created: float
    status: str = 'logging_in'
    message: str = 'Connecting to HoYoLAB...'
    cookie: str | None = None
    accounts: list[dict[str, Any]] = field(default_factory=list)
    challenge: dict[str, Any] | None = None
    mmt_type: str | None = None
    captcha_future: asyncio.Future | None = None
    task: asyncio.Task | None = None
    failed_attempts: int = 0
    client_ip: str = ''
    proof: str = ''

@dataclass
class PairReservation:
    code: str
    proof: str
    session: str
    created: float

jobs: dict[str, LoginJob] = {}
reservations: dict[str, PairReservation] = {}
attempts: dict[str, list[float]] = {}

class ClaimLogin(BaseModel):
    code: str = Field(min_length=24, max_length=24, pattern=r'^[A-Za-z0-9_-]{24} str = Field(min_length=24, max_length=24, pattern=r'^[A-Za-z0-9_-]{24}$')
    account: str = Field(min_length=3, max_length=180)
    password: str = Field(min_length=1, max_length=512)

class CaptchaAnswer(BaseModel):
    value: dict[str, Any]

class ApproveLink(BaseModel):
    uid: str = Field(pattern=r'^\d{8,12}$')
    region: str

@app.middleware('http')
async def secure_headers(request: Request, call_next):
    # Fail closed: this experimental credential-handling service remains private.
    # GATEWAY_PUBLIC_PAIRING is deliberately NOT an authorization bypass.
    # Do not enable public credential collection without an independent audit.
    # /health remains public for Render's health check only.
    if request.url.path != '/health':
        expected = os.getenv('GATEWAY_ACCESS_PASSWORD', '')
        authorized = False
        header = request.headers.get('authorization', '')
        if expected and len(expected) >= 16 and header.startswith('Basic '):
            try:
                raw = base64.b64decode(header[6:], validate=True).decode('utf-8')
                username, supplied = raw.split(':', 1)
                authorized = (hmac.compare_digest(username, 'owner')
                              and hmac.compare_digest(supplied, expected))
            except (ValueError, UnicodeError, binascii.Error):
                pass
        if not authorized:
            return Response('Private gateway: authentication required.', status_code=401,
                            headers={'WWW-Authenticate': 'Basic realm="Istaroth Private Gateway"',
                                     'Cache-Control': 'no-store'})
    if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        origin = request.headers.get('origin')
        if origin and origin != ('https://' + request.headers.get('host', '')) and origin != ('http://' + request.headers.get('host', '') if request.headers.get('host','').startswith(('localhost','127.0.0.1')) else ''):
            return JSONResponse({'error': 'Unexpected origin.'}, status_code=403)
        if request.headers.get('sec-fetch-site') == 'cross-site':
            return JSONResponse({'error': 'Cross-site requests are not accepted.'}, status_code=403)
        session=request.cookies.get('istaroth_gateway_session','')
        supplied=request.headers.get('x-istaroth-csrf','')
        if not re.fullmatch(r'[A-Za-z0-9_-]{35,65}',session) or not hmac.compare_digest(csrf_for_session(session),supplied):
            return JSONResponse({'error': 'Invalid session verification. Reload the gateway.'},status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    # CAPTCHA has dynamic GeeTest content and a separately scoped CSP.
    if '/captcha' not in request.url.path:
        response.headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    return response

@app.get('/health')
async def health():
    return {'online': True, 'mode': 'private-test', 'credentialsStoredOnDisk': False}

@app.get('/', response_class=HTMLResponse)
async def index(request: Request):
    page = open(os.path.join(os.path.dirname(__file__), 'static', 'index.html'), encoding='utf-8').read()
    session=request.cookies.get('istaroth_gateway_session') or ''
    if not re.fullmatch(r'[A-Za-z0-9_-]{35,65}',session):
        session=secrets.token_urlsafe(32)
        is_new=True
    else:
        is_new=False
    page=page.replace('</head>','<meta name="istaroth-csrf" content="'+csrf_for_session(session)+'"></head>',1)
    response = HTMLResponse(page)
    if is_new:
        response.set_cookie('istaroth_gateway_session', session, max_age=7200,
                            httponly=True, secure=True, samesite='strict', path='/')
    return response


def get_session(request: Request) -> str:
    session = request.cookies.get('istaroth_gateway_session') or ''
    if not re.fullmatch(r'[A-Za-z0-9_-]{35,65}', session):
        raise HTTPException(status_code=403, detail='Reload the page to begin a private session.')
    return session


def get_job(request: Request, job_id: str) -> LoginJob:
    job = jobs.get(job_id)
    if not job or not hmac.compare_digest(job.session, get_session(request)) or time.monotonic() - job.created > TTL_SECONDS:
        raise HTTPException(status_code=404, detail='Login session expired. Start again.')
    return job


def cleanup():
    now = time.monotonic()
    for job_id, job in list(jobs.items()):
        if now - job.created > TTL_SECONDS:
            if job.task and not job.task.done():
                job.task.cancel()
            if job.captcha_future and not job.captcha_future.done():
                job.captcha_future.cancel()
            job.cookie = None
            jobs.pop(job_id, None)
    for nonce,item in list(reservations.items()):
        if now-item.created > TTL_SECONDS:
            reservations.pop(nonce,None)
    for ip, ts in list(attempts.items()):
        attempts[ip] = [x for x in ts if now-x < 3600]
        if not attempts[ip]: attempts.pop(ip, None)


async def json_from_community(endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=25, follow_redirects=False, trust_env=False) as client:
        response = await client.post(COMMUNITY + endpoint, json=payload, headers={'User-Agent': 'IstarothPrivateGateway/1.0'})
    try: data = response.json()
    except ValueError: raise ValueError('Community returned a non-JSON response.') from None
    if not response.is_success or data.get('ok') is False or 'error' in data:
        raise ValueError(str(data.get('error') or 'Community could not verify the connection.')[:250])
    return data

async def perform_login(job: LoginJob, account: str, password: str):
    try:
        # Real, currently maintained implementation of HoYoLAB password auth.
        # CAPTCHA is performed by the user in this same session; no CAPTCHA bypass.
        import genshin
        from genshin.models.auth.geetest import SessionMMT, SessionMMTv4

        async def solver(mmt):
            if not isinstance(mmt, (SessionMMT, SessionMMTv4)):
                raise ValueError('HoYoLAB requested an unsupported CAPTCHA type.')
            job.mmt_type = 'v4' if isinstance(mmt, SessionMMTv4) else 'v3'
            job.challenge = mmt.model_dump(mode='json')
            job.captcha_future = asyncio.get_running_loop().create_future()
            job.status = 'captcha'; job.message = 'Complete the HoYoLAB verification challenge.'
            return await asyncio.wait_for(job.captcha_future, timeout=150)

        client = genshin.Client()
        try:
            result = await asyncio.wait_for(
                client.os_login_with_password(account, password, geetest_solver=solver), timeout=230)
        finally:
            close = getattr(client, 'close', None)
            if callable(close):
                maybe = close()
                if asyncio.iscoroutine(maybe): await maybe
        # Preserve only the cookies required for HoYoLAB read operations.
        raw = result.model_dump()
        allow = ('ltoken_v2','ltuid_v2','ltmid_v2','account_id_v2','account_mid_v2','cookie_token_v2')
        cookie = '; '.join(k + '=' + str(raw[k]) for k in allow if raw.get(k))
        if 'ltoken_v2=' not in cookie or 'ltuid_v2=' not in cookie:
            raise ValueError('HoYoLAB login completed but did not provide usable Battle Chronicle credentials.')
        job.cookie = cookie
        job.status = 'finding_accounts'
        job.message = 'Finding your Genshin characters...'
        result = await json_from_community('/api/link/preview', {'code':job.pairing_code,'proof':job.proof,'cookie':cookie})
        accounts = result.get('accounts') or []
        if not accounts: raise ValueError('No linked Genshin accounts were returned.')
        job.accounts = [
            {'uid': str(a.get('uid','')), 'region': str(a.get('region','')), 'nickname': str(a.get('nickname','Traveler'))[:80]}
            for a in accounts
        ]
        job.status='ready'; job.message='Choose the account you want to connect.'
    except asyncio.CancelledError:
        job.cookie = None
        job.status = 'expired'
        raise
    except Exception as e:
        # Do not expose potentially sensitive error details returned by account API.
        job.cookie = None
        job.status = 'failed'
        typename = type(e).__name__
        known = {'AccountLoginFail','AccountDoesNotExist','AccountLoginFail','AccountNotFound','AccountLoginRequiresVerification',
                 'InvalidCookies','BadRequest','GeetestError','CaptchaError'}
        if typename in known:
            job.message = 'HoYoLAB rejected the login ('+typename+'). Check credentials or required verification.'
        elif isinstance(e, ValueError):
            job.message = str(e)[:200]
        elif isinstance(e, asyncio.TimeoutError):
            job.message = 'HoYoLAB login timed out. Please try again.'
        else:
            job.message = 'Login failed ('+typename+'). This unofficial method may have changed or requires extra verification.'
    finally:
        password = ''

@app.post('/api/pairing/claim')
async def claim_login(payload: ClaimLogin, request: Request):
    # Password-free preflight: reserve the Telegram user's code atomically in D1.
    session = get_session(request)
    cleanup()
    ip = request.client.host if request.client else 'unknown'
    current = time.monotonic()
    recent = [t for t in attempts.get(ip, []) if current-t < 3600]
    if len(recent) >= 5:
        raise HTTPException(status_code=429, detail='Too many pairing attempts. Try later.')
    attempts[ip] = recent+[current]
    proof = secrets.token_urlsafe(32)
    try:
        result = await json_from_community('/api/link/claim', {'code':payload.code,'proof':proof})
        if result.get('ok') is not True:
            raise ValueError('Pairing could not be verified.')
    except (ValueError, httpx.HTTPError):
        raise HTTPException(status_code=403,detail='Community code expired or already used. Generate a new one.') from None
    nonce = secrets.token_urlsafe(32)
    reservations[nonce] = PairReservation(code=payload.code,proof=proof,session=session,created=current)
    return {'ok':True,'claimToken':nonce}

@app.post('/api/start')
async def start(payload: StartLogin, request: Request):
    session = get_session(request)
    cleanup()
    claim = reservations.get(payload.claim_token)
    if not claim or not hmac.compare_digest(claim.session,session) or claim.code != payload.code or time.monotonic()-claim.created > TTL_SECONDS:
        raise HTTPException(status_code=403,detail='Pairing claim expired or already used.')
    # Consume only after proving ownership; a different browser cannot burn the token.
    reservations.pop(payload.claim_token,None)
    if len(jobs) >= MAX_JOBS:
        raise HTTPException(status_code=503, detail='Too many active connections. Try again later.')
    ip = request.client.host if request.client else 'unknown'
    now=time.monotonic()
    # Pairing was verified and atomically reserved before password submission.
    job=LoginJob(id=secrets.token_urlsafe(20),session=session,pairing_code=payload.code,created=now,client_ip=ip,proof=claim.proof)
    jobs[job.id] = job
    # Don't log password or save it. The task keeps it in RAM only until login completes.
    job.task = asyncio.create_task(perform_login(job,payload.account,payload.password))
    return {'id':job.id,'status':job.status}

@app.get('/api/status/{job_id}')
async def status(job_id: str,request: Request):
    cleanup(); job=get_job(request,job_id)
    return {'status':job.status,'message':job.message,'accounts':job.accounts if job.status=='ready' else [],
            'captchaNeeded':job.status=='captcha'}

@app.get('/api/captcha/{job_id}')
async def captcha(job_id: str, request: Request):
    job=get_job(request, job_id)
    if job.status!='captcha' or not job.challenge:
        raise HTTPException(status_code=409,detail='No CAPTCHA pending.')
    page=open(os.path.join(os.path.dirname(__file__),'static','captcha.html'),encoding='utf-8').read()
    page=page.replace('__JOB_ID__',job.id).replace('</head>','<meta name="istaroth-csrf" content="'+csrf_for_session(job.session)+'"></head>',1)
    response=HTMLResponse(page)
    response.headers['Content-Security-Policy'] = (
        "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https://static.geetest.com https://*.geetest.com; "
        "style-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; img-src 'self' https: data: blob:; "
        "frame-src https:; frame-ancestors 'none'; base-uri 'none'"
    )
    return response

@app.get('/api/captcha/config/{job_id}')
async def captcha_config(job_id: str,request: Request):
    job=get_job(request,job_id)
    if job.status!='captcha' or not job.challenge:
        raise HTTPException(status_code=409,detail='No CAPTCHA pending.')
    return {'version':job.mmt_type,'challenge':job.challenge}

@app.post('/api/captcha/complete/{job_id}')
async def captcha_complete(job_id: str,payload: CaptchaAnswer,request: Request):
    job=get_job(request,job_id)
    if job.status!='captcha' or not job.captcha_future or job.captcha_future.done():
        raise HTTPException(status_code=409,detail='CAPTCHA not pending.')
    if job.failed_attempts>=3:
        raise HTTPException(status_code=429,detail='Too many failed CAPTCHA results.')
    from genshin.models.auth.geetest import SessionMMTResult, SessionMMTv4Result
    job.failed_attempts+=1
    try:
        result_type = SessionMMTv4Result if job.mmt_type=='v4' else SessionMMTResult
        answer=result_type(**payload.value)
    except Exception:
        raise HTTPException(status_code=400,detail='Invalid CAPTCHA result.') from None
    job.captcha_future.set_result(answer)
    job.status='logging_in'; job.message='Verifying CAPTCHA with HoYoLAB...'
    job.challenge=None
    return {'ok':True}

@app.post('/api/approve/{job_id}')
async def approve(job_id: str,payload: ApproveLink,request: Request):
    job=get_job(request,job_id)
    if job.status!='ready' or not job.cookie:
        raise HTTPException(status_code=409,detail='Complete HoYoLAB authentication first.')
    if not any(a['uid']==payload.uid and a['region']==payload.region for a in job.accounts):
        raise HTTPException(status_code=403,detail='This game account was not verified.')
    # Consume the in-memory session before making an outgoing request.
    job.status='finishing'
    cookie=job.cookie
    job.cookie=None
    try:
        result=await json_from_community('/api/link/complete',{
            'code':job.pairing_code,'proof':job.proof,'uid':payload.uid,'region':payload.region,'cookie':cookie
        })
        job.status='linked'; job.message='Your Genshin account is connected to Istaroth Community.'
        job.pairing_code=''
        job.accounts=[]
        return {'ok':True,'linked':True}
    except Exception as e:
        job.status='failed'; job.message='Community could not save the account: '+str(e)[:170]
        raise HTTPException(status_code=502,detail=job.message) from None
    finally:
        cookie=''

@app.post('/api/cancel/{job_id}')
async def cancel(job_id: str,request:Request):
    job=get_job(request,job_id)
    if job.task and not job.task.done(): job.task.cancel()
    if job.captcha_future and not job.captcha_future.done(): job.captcha_future.cancel()
    job.cookie=None
    jobs.pop(job_id,None)
    return {'ok':True}
)

class StartLogin(BaseModel):
    claim_token: str = Field(min_length=43, max_length=43, pattern=r'^[A-Za-z0-9_-]{43} str = Field(min_length=24, max_length=24, pattern=r'^[A-Za-z0-9_-]{24}$')
    account: str = Field(min_length=3, max_length=180)
    password: str = Field(min_length=1, max_length=512)

class CaptchaAnswer(BaseModel):
    value: dict[str, Any]

class ApproveLink(BaseModel):
    uid: str = Field(pattern=r'^\d{8,12}$')
    region: str

@app.middleware('http')
async def secure_headers(request: Request, call_next):
    # Fail closed: this experimental credential-handling service remains private.
    # GATEWAY_PUBLIC_PAIRING is deliberately NOT an authorization bypass.
    # Do not enable public credential collection without an independent audit.
    # /health remains public for Render's health check only.
    if request.url.path != '/health':
        expected = os.getenv('GATEWAY_ACCESS_PASSWORD', '')
        authorized = False
        header = request.headers.get('authorization', '')
        if expected and len(expected) >= 16 and header.startswith('Basic '):
            try:
                raw = base64.b64decode(header[6:], validate=True).decode('utf-8')
                username, supplied = raw.split(':', 1)
                authorized = (hmac.compare_digest(username, 'owner')
                              and hmac.compare_digest(supplied, expected))
            except (ValueError, UnicodeError, binascii.Error):
                pass
        if not authorized:
            return Response('Private gateway: authentication required.', status_code=401,
                            headers={'WWW-Authenticate': 'Basic realm="Istaroth Private Gateway"',
                                     'Cache-Control': 'no-store'})
    if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        origin = request.headers.get('origin')
        if origin and origin != ('https://' + request.headers.get('host', '')) and origin != ('http://' + request.headers.get('host', '') if request.headers.get('host','').startswith(('localhost','127.0.0.1')) else ''):
            return JSONResponse({'error': 'Unexpected origin.'}, status_code=403)
        if request.headers.get('sec-fetch-site') == 'cross-site':
            return JSONResponse({'error': 'Cross-site requests are not accepted.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    # CAPTCHA has dynamic GeeTest content and a separately scoped CSP.
    if '/captcha' not in request.url.path:
        response.headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    return response

@app.get('/health')
async def health():
    return {'online': True, 'mode': 'private-test', 'credentialsStoredOnDisk': False}

@app.get('/', response_class=HTMLResponse)
async def index(request: Request):
    page = open(os.path.join(os.path.dirname(__file__), 'static', 'index.html'), encoding='utf-8').read()
    response = HTMLResponse(page)
    if not request.cookies.get('istaroth_gateway_session'):
        response.set_cookie('istaroth_gateway_session', secrets.token_urlsafe(32), max_age=7200,
                            httponly=True, secure=True, samesite='strict', path='/')
    return response


def get_session(request: Request) -> str:
    session = request.cookies.get('istaroth_gateway_session') or ''
    if not re.fullmatch(r'[A-Za-z0-9_-]{35,65}', session):
        raise HTTPException(status_code=403, detail='Reload the page to begin a private session.')
    return session


def get_job(request: Request, job_id: str) -> LoginJob:
    job = jobs.get(job_id)
    if not job or not hmac.compare_digest(job.session, get_session(request)) or time.monotonic() - job.created > TTL_SECONDS:
        raise HTTPException(status_code=404, detail='Login session expired. Start again.')
    return job


def cleanup():
    now = time.monotonic()
    for job_id, job in list(jobs.items()):
        if now - job.created > TTL_SECONDS:
            if job.task and not job.task.done():
                job.task.cancel()
            if job.captcha_future and not job.captcha_future.done():
                job.captcha_future.cancel()
            job.cookie = None
            jobs.pop(job_id, None)
    for ip, ts in list(attempts.items()):
        attempts[ip] = [x for x in ts if now-x < 3600]
        if not attempts[ip]: attempts.pop(ip, None)


async def json_from_community(endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=25, follow_redirects=False, trust_env=False) as client:
        response = await client.post(COMMUNITY + endpoint, json=payload, headers={'User-Agent': 'IstarothPrivateGateway/1.0'})
    try: data = response.json()
    except ValueError: raise ValueError('Community returned a non-JSON response.') from None
    if not response.is_success or data.get('ok') is False or 'error' in data:
        raise ValueError(str(data.get('error') or 'Community could not verify the connection.')[:250])
    return data

async def perform_login(job: LoginJob, account: str, password: str):
    try:
        # Real, currently maintained implementation of HoYoLAB password auth.
        # CAPTCHA is performed by the user in this same session; no CAPTCHA bypass.
        import genshin
        from genshin.models.auth.geetest import SessionMMT, SessionMMTv4

        async def solver(mmt):
            if not isinstance(mmt, (SessionMMT, SessionMMTv4)):
                raise ValueError('HoYoLAB requested an unsupported CAPTCHA type.')
            job.mmt_type = 'v4' if isinstance(mmt, SessionMMTv4) else 'v3'
            job.challenge = mmt.model_dump(mode='json')
            job.captcha_future = asyncio.get_running_loop().create_future()
            job.status = 'captcha'; job.message = 'Complete the HoYoLAB verification challenge.'
            return await asyncio.wait_for(job.captcha_future, timeout=150)

        client = genshin.Client()
        try:
            result = await asyncio.wait_for(
                client.os_login_with_password(account, password, geetest_solver=solver), timeout=230)
        finally:
            close = getattr(client, 'close', None)
            if callable(close):
                maybe = close()
                if asyncio.iscoroutine(maybe): await maybe
        # Preserve only the cookies required for HoYoLAB read operations.
        raw = result.model_dump()
        allow = ('ltoken_v2','ltuid_v2','ltmid_v2','account_id_v2','account_mid_v2','cookie_token_v2')
        cookie = '; '.join(k + '=' + str(raw[k]) for k in allow if raw.get(k))
        if 'ltoken_v2=' not in cookie or 'ltuid_v2=' not in cookie:
            raise ValueError('HoYoLAB login completed but did not provide usable Battle Chronicle credentials.')
        job.cookie = cookie
        job.status = 'finding_accounts'
        job.message = 'Finding your Genshin characters...'
        result = await json_from_community('/api/link/preview', {'code':job.pairing_code,'cookie':cookie})
        accounts = result.get('accounts') or []
        if not accounts: raise ValueError('No linked Genshin accounts were returned.')
        job.accounts = [
            {'uid': str(a.get('uid','')), 'region': str(a.get('region','')), 'nickname': str(a.get('nickname','Traveler'))[:80]}
            for a in accounts
        ]
        job.status='ready'; job.message='Choose the account you want to connect.'
    except asyncio.CancelledError:
        job.cookie = None
        job.status = 'expired'
        raise
    except Exception as e:
        # Do not expose potentially sensitive error details returned by account API.
        job.cookie = None
        job.status = 'failed'
        typename = type(e).__name__
        known = {'AccountLoginFail','AccountDoesNotExist','AccountLoginFail','AccountNotFound','AccountLoginRequiresVerification',
                 'InvalidCookies','BadRequest','GeetestError','CaptchaError'}
        if typename in known:
            job.message = 'HoYoLAB rejected the login ('+typename+'). Check credentials or required verification.'
        elif isinstance(e, ValueError):
            job.message = str(e)[:200]
        elif isinstance(e, asyncio.TimeoutError):
            job.message = 'HoYoLAB login timed out. Please try again.'
        else:
            job.message = 'Login failed ('+typename+'). This unofficial method may have changed or requires extra verification.'
    finally:
        password = ''

@app.post('/api/start')
async def start(payload: StartLogin, request: Request):
    session = get_session(request)
    cleanup()
    if len(jobs) >= MAX_JOBS:
        raise HTTPException(status_code=503, detail='Too many active connections. Try again later.')
    ip = request.client.host if request.client else 'unknown'
    now=time.monotonic()
    recent = [t for t in attempts.get(ip, []) if now-t<3600]
    if len(recent) >= 5:
        raise HTTPException(status_code=429, detail='Too many attempts. Try in an hour.')
    # In public mode, verify the Telegram-issued Community code BEFORE processing
    # credentials. Never trust a code solely because its syntax looks valid.
    attempts[ip] = recent+[now]
    # Verify the Community-issued code BEFORE accepting HoYoLAB credentials.
    try:
        verified = await json_from_community('/api/link/check', {'code':payload.code})
        if verified.get('ok') is not True:
            raise ValueError('Invalid Community pairing code.')
    except ValueError:
        raise HTTPException(status_code=403, detail='Community pairing code is invalid or expired. Generate a new code.') from None
    job=LoginJob(id=secrets.token_urlsafe(20),session=session,pairing_code=payload.code,created=now,client_ip=ip)
    jobs[job.id] = job
    # Don't log password or save it. The task keeps it in RAM only until login completes.
    job.task = asyncio.create_task(perform_login(job,payload.account,payload.password))
    return {'id':job.id,'status':job.status}

@app.get('/api/status/{job_id}')
async def status(job_id: str,request: Request):
    cleanup(); job=get_job(request,job_id)
    return {'status':job.status,'message':job.message,'accounts':job.accounts if job.status=='ready' else [],
            'captchaNeeded':job.status=='captcha'}

@app.get('/api/captcha/{job_id}')
async def captcha(job_id: str, request: Request):
    job=get_job(request, job_id)
    if job.status!='captcha' or not job.challenge:
        raise HTTPException(status_code=409,detail='No CAPTCHA pending.')
    page=open(os.path.join(os.path.dirname(__file__),'static','captcha.html'),encoding='utf-8').read()
    response=HTMLResponse(page.replace('__JOB_ID__',job.id))
    response.headers['Content-Security-Policy'] = (
        "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https://static.geetest.com https://*.geetest.com; "
        "style-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; img-src 'self' https: data: blob:; "
        "frame-src https:; frame-ancestors 'none'; base-uri 'none'"
    )
    return response

@app.get('/api/captcha/config/{job_id}')
async def captcha_config(job_id: str,request: Request):
    job=get_job(request,job_id)
    if job.status!='captcha' or not job.challenge:
        raise HTTPException(status_code=409,detail='No CAPTCHA pending.')
    return {'version':job.mmt_type,'challenge':job.challenge}

@app.post('/api/captcha/complete/{job_id}')
async def captcha_complete(job_id: str,payload: CaptchaAnswer,request: Request):
    job=get_job(request,job_id)
    if job.status!='captcha' or not job.captcha_future or job.captcha_future.done():
        raise HTTPException(status_code=409,detail='CAPTCHA not pending.')
    if job.failed_attempts>=3:
        raise HTTPException(status_code=429,detail='Too many failed CAPTCHA results.')
    from genshin.models.auth.geetest import SessionMMTResult, SessionMMTv4Result
    job.failed_attempts+=1
    try:
        result_type = SessionMMTv4Result if job.mmt_type=='v4' else SessionMMTResult
        answer=result_type(**payload.value)
    except Exception:
        raise HTTPException(status_code=400,detail='Invalid CAPTCHA result.') from None
    job.captcha_future.set_result(answer)
    job.status='logging_in'; job.message='Verifying CAPTCHA with HoYoLAB...'
    job.challenge=None
    return {'ok':True}

@app.post('/api/approve/{job_id}')
async def approve(job_id: str,payload: ApproveLink,request: Request):
    job=get_job(request,job_id)
    if job.status!='ready' or not job.cookie:
        raise HTTPException(status_code=409,detail='Complete HoYoLAB authentication first.')
    if not any(a['uid']==payload.uid and a['region']==payload.region for a in job.accounts):
        raise HTTPException(status_code=403,detail='This game account was not verified.')
    # Consume the in-memory session before making an outgoing request.
    job.status='finishing'
    cookie=job.cookie
    job.cookie=None
    try:
        result=await json_from_community('/api/link/complete',{
            'code':job.pairing_code,'uid':payload.uid,'region':payload.region,'cookie':cookie
        })
        job.status='linked'; job.message='Your Genshin account is connected to Istaroth Community.'
        job.pairing_code=''
        job.accounts=[]
        return {'ok':True,'linked':True}
    except Exception as e:
        job.status='failed'; job.message='Community could not save the account: '+str(e)[:170]
        raise HTTPException(status_code=502,detail=job.message) from None
    finally:
        cookie=''

@app.post('/api/cancel/{job_id}')
async def cancel(job_id: str,request:Request):
    job=get_job(request,job_id)
    if job.task and not job.task.done(): job.task.cancel()
    if job.captcha_future and not job.captcha_future.done(): job.captcha_future.cancel()
    job.cookie=None
    jobs.pop(job_id,None)
    return {'ok':True}
)
    code: str = Field(min_length=24, max_length=24, pattern=r'^[A-Za-z0-9_-]{24}$')
    account: str = Field(min_length=3, max_length=180)
    password: str = Field(min_length=1, max_length=512)

class CaptchaAnswer(BaseModel):
    value: dict[str, Any]

class ApproveLink(BaseModel):
    uid: str = Field(pattern=r'^\d{8,12}$')
    region: str

@app.middleware('http')
async def secure_headers(request: Request, call_next):
    # Fail closed: this experimental credential-handling service remains private.
    # GATEWAY_PUBLIC_PAIRING is deliberately NOT an authorization bypass.
    # Do not enable public credential collection without an independent audit.
    # /health remains public for Render's health check only.
    if request.url.path != '/health':
        expected = os.getenv('GATEWAY_ACCESS_PASSWORD', '')
        authorized = False
        header = request.headers.get('authorization', '')
        if expected and len(expected) >= 16 and header.startswith('Basic '):
            try:
                raw = base64.b64decode(header[6:], validate=True).decode('utf-8')
                username, supplied = raw.split(':', 1)
                authorized = (hmac.compare_digest(username, 'owner')
                              and hmac.compare_digest(supplied, expected))
            except (ValueError, UnicodeError, binascii.Error):
                pass
        if not authorized:
            return Response('Private gateway: authentication required.', status_code=401,
                            headers={'WWW-Authenticate': 'Basic realm="Istaroth Private Gateway"',
                                     'Cache-Control': 'no-store'})
    if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        origin = request.headers.get('origin')
        if origin and origin != ('https://' + request.headers.get('host', '')) and origin != ('http://' + request.headers.get('host', '') if request.headers.get('host','').startswith(('localhost','127.0.0.1')) else ''):
            return JSONResponse({'error': 'Unexpected origin.'}, status_code=403)
        if request.headers.get('sec-fetch-site') == 'cross-site':
            return JSONResponse({'error': 'Cross-site requests are not accepted.'}, status_code=403)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    # CAPTCHA has dynamic GeeTest content and a separately scoped CSP.
    if '/captcha' not in request.url.path:
        response.headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
    return response

@app.get('/health')
async def health():
    return {'online': True, 'mode': 'private-test', 'credentialsStoredOnDisk': False}

@app.get('/', response_class=HTMLResponse)
async def index(request: Request):
    page = open(os.path.join(os.path.dirname(__file__), 'static', 'index.html'), encoding='utf-8').read()
    response = HTMLResponse(page)
    if not request.cookies.get('istaroth_gateway_session'):
        response.set_cookie('istaroth_gateway_session', secrets.token_urlsafe(32), max_age=7200,
                            httponly=True, secure=True, samesite='strict', path='/')
    return response


def get_session(request: Request) -> str:
    session = request.cookies.get('istaroth_gateway_session') or ''
    if not re.fullmatch(r'[A-Za-z0-9_-]{35,65}', session):
        raise HTTPException(status_code=403, detail='Reload the page to begin a private session.')
    return session


def get_job(request: Request, job_id: str) -> LoginJob:
    job = jobs.get(job_id)
    if not job or not hmac.compare_digest(job.session, get_session(request)) or time.monotonic() - job.created > TTL_SECONDS:
        raise HTTPException(status_code=404, detail='Login session expired. Start again.')
    return job


def cleanup():
    now = time.monotonic()
    for job_id, job in list(jobs.items()):
        if now - job.created > TTL_SECONDS:
            if job.task and not job.task.done():
                job.task.cancel()
            if job.captcha_future and not job.captcha_future.done():
                job.captcha_future.cancel()
            job.cookie = None
            jobs.pop(job_id, None)
    for ip, ts in list(attempts.items()):
        attempts[ip] = [x for x in ts if now-x < 3600]
        if not attempts[ip]: attempts.pop(ip, None)


async def json_from_community(endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=25, follow_redirects=False, trust_env=False) as client:
        response = await client.post(COMMUNITY + endpoint, json=payload, headers={'User-Agent': 'IstarothPrivateGateway/1.0'})
    try: data = response.json()
    except ValueError: raise ValueError('Community returned a non-JSON response.') from None
    if not response.is_success or data.get('ok') is False or 'error' in data:
        raise ValueError(str(data.get('error') or 'Community could not verify the connection.')[:250])
    return data

async def perform_login(job: LoginJob, account: str, password: str):
    try:
        # Real, currently maintained implementation of HoYoLAB password auth.
        # CAPTCHA is performed by the user in this same session; no CAPTCHA bypass.
        import genshin
        from genshin.models.auth.geetest import SessionMMT, SessionMMTv4

        async def solver(mmt):
            if not isinstance(mmt, (SessionMMT, SessionMMTv4)):
                raise ValueError('HoYoLAB requested an unsupported CAPTCHA type.')
            job.mmt_type = 'v4' if isinstance(mmt, SessionMMTv4) else 'v3'
            job.challenge = mmt.model_dump(mode='json')
            job.captcha_future = asyncio.get_running_loop().create_future()
            job.status = 'captcha'; job.message = 'Complete the HoYoLAB verification challenge.'
            return await asyncio.wait_for(job.captcha_future, timeout=150)

        client = genshin.Client()
        try:
            result = await asyncio.wait_for(
                client.os_login_with_password(account, password, geetest_solver=solver), timeout=230)
        finally:
            close = getattr(client, 'close', None)
            if callable(close):
                maybe = close()
                if asyncio.iscoroutine(maybe): await maybe
        # Preserve only the cookies required for HoYoLAB read operations.
        raw = result.model_dump()
        allow = ('ltoken_v2','ltuid_v2','ltmid_v2','account_id_v2','account_mid_v2','cookie_token_v2')
        cookie = '; '.join(k + '=' + str(raw[k]) for k in allow if raw.get(k))
        if 'ltoken_v2=' not in cookie or 'ltuid_v2=' not in cookie:
            raise ValueError('HoYoLAB login completed but did not provide usable Battle Chronicle credentials.')
        job.cookie = cookie
        job.status = 'finding_accounts'
        job.message = 'Finding your Genshin characters...'
        result = await json_from_community('/api/link/preview', {'code':job.pairing_code,'cookie':cookie})
        accounts = result.get('accounts') or []
        if not accounts: raise ValueError('No linked Genshin accounts were returned.')
        job.accounts = [
            {'uid': str(a.get('uid','')), 'region': str(a.get('region','')), 'nickname': str(a.get('nickname','Traveler'))[:80]}
            for a in accounts
        ]
        job.status='ready'; job.message='Choose the account you want to connect.'
    except asyncio.CancelledError:
        job.cookie = None
        job.status = 'expired'
        raise
    except Exception as e:
        # Do not expose potentially sensitive error details returned by account API.
        job.cookie = None
        job.status = 'failed'
        typename = type(e).__name__
        known = {'AccountLoginFail','AccountDoesNotExist','AccountLoginFail','AccountNotFound','AccountLoginRequiresVerification',
                 'InvalidCookies','BadRequest','GeetestError','CaptchaError'}
        if typename in known:
            job.message = 'HoYoLAB rejected the login ('+typename+'). Check credentials or required verification.'
        elif isinstance(e, ValueError):
            job.message = str(e)[:200]
        elif isinstance(e, asyncio.TimeoutError):
            job.message = 'HoYoLAB login timed out. Please try again.'
        else:
            job.message = 'Login failed ('+typename+'). This unofficial method may have changed or requires extra verification.'
    finally:
        password = ''

@app.post('/api/start')
async def start(payload: StartLogin, request: Request):
    session = get_session(request)
    cleanup()
    if len(jobs) >= MAX_JOBS:
        raise HTTPException(status_code=503, detail='Too many active connections. Try again later.')
    ip = request.client.host if request.client else 'unknown'
    now=time.monotonic()
    recent = [t for t in attempts.get(ip, []) if now-t<3600]
    if len(recent) >= 5:
        raise HTTPException(status_code=429, detail='Too many attempts. Try in an hour.')
    # In public mode, verify the Telegram-issued Community code BEFORE processing
    # credentials. Never trust a code solely because its syntax looks valid.
    attempts[ip] = recent+[now]
    # Verify the Community-issued code BEFORE accepting HoYoLAB credentials.
    try:
        verified = await json_from_community('/api/link/check', {'code':payload.code})
        if verified.get('ok') is not True:
            raise ValueError('Invalid Community pairing code.')
    except ValueError:
        raise HTTPException(status_code=403, detail='Community pairing code is invalid or expired. Generate a new code.') from None
    job=LoginJob(id=secrets.token_urlsafe(20),session=session,pairing_code=payload.code,created=now,client_ip=ip)
    jobs[job.id] = job
    # Don't log password or save it. The task keeps it in RAM only until login completes.
    job.task = asyncio.create_task(perform_login(job,payload.account,payload.password))
    return {'id':job.id,'status':job.status}

@app.get('/api/status/{job_id}')
async def status(job_id: str,request: Request):
    cleanup(); job=get_job(request,job_id)
    return {'status':job.status,'message':job.message,'accounts':job.accounts if job.status=='ready' else [],
            'captchaNeeded':job.status=='captcha'}

@app.get('/api/captcha/{job_id}')
async def captcha(job_id: str, request: Request):
    job=get_job(request, job_id)
    if job.status!='captcha' or not job.challenge:
        raise HTTPException(status_code=409,detail='No CAPTCHA pending.')
    page=open(os.path.join(os.path.dirname(__file__),'static','captcha.html'),encoding='utf-8').read()
    response=HTMLResponse(page.replace('__JOB_ID__',job.id))
    response.headers['Content-Security-Policy'] = (
        "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https://static.geetest.com https://*.geetest.com; "
        "style-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; img-src 'self' https: data: blob:; "
        "frame-src https:; frame-ancestors 'none'; base-uri 'none'"
    )
    return response

@app.get('/api/captcha/config/{job_id}')
async def captcha_config(job_id: str,request: Request):
    job=get_job(request,job_id)
    if job.status!='captcha' or not job.challenge:
        raise HTTPException(status_code=409,detail='No CAPTCHA pending.')
    return {'version':job.mmt_type,'challenge':job.challenge}

@app.post('/api/captcha/complete/{job_id}')
async def captcha_complete(job_id: str,payload: CaptchaAnswer,request: Request):
    job=get_job(request,job_id)
    if job.status!='captcha' or not job.captcha_future or job.captcha_future.done():
        raise HTTPException(status_code=409,detail='CAPTCHA not pending.')
    if job.failed_attempts>=3:
        raise HTTPException(status_code=429,detail='Too many failed CAPTCHA results.')
    from genshin.models.auth.geetest import SessionMMTResult, SessionMMTv4Result
    job.failed_attempts+=1
    try:
        result_type = SessionMMTv4Result if job.mmt_type=='v4' else SessionMMTResult
        answer=result_type(**payload.value)
    except Exception:
        raise HTTPException(status_code=400,detail='Invalid CAPTCHA result.') from None
    job.captcha_future.set_result(answer)
    job.status='logging_in'; job.message='Verifying CAPTCHA with HoYoLAB...'
    job.challenge=None
    return {'ok':True}

@app.post('/api/approve/{job_id}')
async def approve(job_id: str,payload: ApproveLink,request: Request):
    job=get_job(request,job_id)
    if job.status!='ready' or not job.cookie:
        raise HTTPException(status_code=409,detail='Complete HoYoLAB authentication first.')
    if not any(a['uid']==payload.uid and a['region']==payload.region for a in job.accounts):
        raise HTTPException(status_code=403,detail='This game account was not verified.')
    # Consume the in-memory session before making an outgoing request.
    job.status='finishing'
    cookie=job.cookie
    job.cookie=None
    try:
        result=await json_from_community('/api/link/complete',{
            'code':job.pairing_code,'uid':payload.uid,'region':payload.region,'cookie':cookie
        })
        job.status='linked'; job.message='Your Genshin account is connected to Istaroth Community.'
        job.pairing_code=''
        job.accounts=[]
        return {'ok':True,'linked':True}
    except Exception as e:
        job.status='failed'; job.message='Community could not save the account: '+str(e)[:170]
        raise HTTPException(status_code=502,detail=job.message) from None
    finally:
        cookie=''

@app.post('/api/cancel/{job_id}')
async def cancel(job_id: str,request:Request):
    job=get_job(request,job_id)
    if job.task and not job.task.done(): job.task.cancel()
    if job.captcha_future and not job.captcha_future.done(): job.captcha_future.cancel()
    job.cookie=None
    jobs.pop(job_id,None)
    return {'ok':True}
