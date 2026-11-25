import {createHash, randomBytes} from 'node:crypto';

export const REGIONS=new Set(['os_asia','os_euro','os_usa','os_cht']);
export const THRESHOLDS=[160,180,190,200];
export const RESIN_STEP_MS=8*60*1000;
export const LOGIN_TTL=10*60*1000;
export const SESSION_TTL=30*24*3600*1000;
const API_HOSTS=new Set(['api-os-takumi.mihoyo.com','api-account-os.hoyolab.com','bbs-api-os.hoyolab.com','bbs-api-os.hoyoverse.com']);
const ROLE_ENDPOINTS=[
  'https://api-os-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_global',
  'https://api-account-os.hoyolab.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_global'
];
const NOTES_ENDPOINTS=[
  'https://bbs-api-os.hoyolab.com/game_record/genshin/api/dailyNote',
  'https://bbs-api-os.hoyoverse.com/game_record/genshin/api/dailyNote'
];

export function token(bytes=24){return randomBytes(bytes).toString('base64url');}
export function hash(value){return createHash('sha256').update(String(value)).digest('hex');}
export function safeString(value,max=64){return String(value||'').replace(/[\x00-\x1f\x7f<>]/g,' ').trim().slice(0,max);}
export function isTelegramId(value){return /^\d{1,20}$/.test(String(value||''));}
export function secureEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  if(!x.length||x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
  return diff===0;
}
export function validCookie(value){
  return typeof value==='string'&&value.length>=15&&value.length<=5000&&
    !/[\r\n\x00]/.test(value)&&/(?:^|;\s*)(?:ltoken_v2|ltoken|cookie_token_v2|cookie_token|stoken_v2|stoken)=/.test(value);
}
export function estimatedResin(note,now=Date.now()){
  if(!note||!Number.isFinite(+note.last_sync_at)||+note.last_sync_at<=0||
    now-Number(note.last_sync_at)>30*60*1000||
    !Number.isInteger(Number(note.resin))||!Number.isInteger(Number(note.cap))||
    Number(note.cap)<1||Number(note.cap)>500||Number(note.resin)<0||Number(note.resin)>Number(note.cap)||
    !Number.isFinite(Number(note.full_at)))return null;
  const cap=+note.cap,resin=+note.resin,fullAt=+note.full_at;
  return {resin:Math.max(resin,Math.min(cap,cap-Math.ceil(Math.max(0,fullAt-now)/RESIN_STEP_MS))),cap};
}
// Phone-only forecast: no HoYoLAB credentials, explicitly NOT live game data.
// This intentionally has no 30-minute freshness limit, unlike HoYoLAB readings.
export function projectedResin(note,currentTime=Date.now()){
  if(!note||!Number.isInteger(Number(note.resin))||!Number.isInteger(Number(note.cap))||
    Number(note.cap)<1||Number(note.cap)>500||Number(note.resin)<0||Number(note.resin)>Number(note.cap)||
    !Number.isFinite(Number(note.full_at)))return null;
  const cap=Number(note.cap),base=Number(note.resin),fullAt=Number(note.full_at);
  return {resin:Math.max(base,Math.min(cap,cap-Math.ceil(Math.max(0,fullAt-currentTime)/RESIN_STEP_MS))),cap};
}
export function sessionCookie(value,maxAge=Math.floor(SESSION_TTL/1000)){
  return `istaroth_session=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function parseSession(request){
  const raw=request.headers.get('cookie')||'';
  const match=raw.match(/(?:^|;\s*)istaroth_session=([A-Za-z0-9_-]{40,100})(?:;|$)/);
  return match?.[1]||'';
}
export function sameOrigin(request){
  const origin=request.headers.get('Origin');
  const site=request.headers.get('Sec-Fetch-Site');
  return (!origin||origin===new URL(request.url).origin)&&(!site||['same-origin','none'].includes(site));
}
function keyBytes(env){
  const v=String(env.DATA_KEY||'');
  if(!/^[A-Za-z0-9_-]{43}$/.test(v))throw Error('DATA_KEY is missing or invalid.');
  const b=Buffer.from(v,'base64url');
  if(b.length!==32)throw Error('DATA_KEY must contain 32 bytes.');
  return b;
}
export async function encryptCookie(env,owner,cookie){
  if(!validCookie(cookie))throw Error('Please provide a valid HoYoLAB cookie header.');
  const key=await crypto.subtle.importKey('raw',keyBytes(env),'AES-GCM',false,['encrypt']);
  const iv=randomBytes(12);
  const bytes=new TextEncoder().encode(cookie);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(owner)},key,bytes);
  return {iv:iv.toString('base64url'),ciphertext:Buffer.from(cipher).toString('base64url')};
}
export async function decryptCookie(env,owner,row){
  const key=await crypto.subtle.importKey('raw',keyBytes(env),'AES-GCM',false,['decrypt']);
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(row.credential_iv,'base64url'),additionalData:new TextEncoder().encode(owner)},
    key,Buffer.from(row.credential_ciphertext,'base64url'));
  return new TextDecoder().decode(plaintext);
}
export function dsHeader(now=Date.now()){
  const t=Math.floor(now/1000),r=randomBytes(6).toString('hex');
  const digest=createHash('md5').update(`salt=6s25p5ox5y14umn1p61aqyyvbvvl3lrt&t=${t}&r=${r}`).digest('hex');
  return `${t},${r},${digest}`;
}
async function hoyolabGet(url,cookie,notes=false,fetcher=fetch){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!API_HOSTS.has(parsed.hostname))throw Error('Untrusted HoYoLAB API host.');
  const res=await fetcher(parsed.toString(),{
    method:'GET',redirect:'manual',headers:{Cookie:cookie,Accept:'application/json',Referer:'https://www.hoyolab.com/',
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ...(notes?{DS:dsHeader(),'x-rpc-client_type':'4','x-rpc-app_version':'1.5.0','x-rpc-language':'en-us'}:{})},
    signal:AbortSignal.timeout(12000)
  });
  // Cloudflare Workers supports only 'follow' and 'manual'. We must not
  // follow HoYoLAB redirects because the Cookie header is sensitive.
  if(res.status>=300&&res.status<400)throw Error('HoYoLAB redirected the request. Please sign in to HoYoLAB again.');
  if(!res.ok)throw Error('HoYoLAB HTTP '+res.status);
  const body=await res.text();
  if(body.length>300000)throw Error('HoYoLAB response exceeds limit.');
  const data=JSON.parse(body);
  if(data?.retcode!==0)throw Error('HoYoLAB returned error '+String(data?.retcode).slice(0,14));
  return data?.data;
}
async function firstSuccess(urls,cookie,isNotes,fetcher){
  let error;
  for(const url of urls){
    try{return await hoyolabGet(url,cookie,isNotes,fetcher);}
    catch(e){error=e; if(/returned error/.test(e.message))break;}
  }
  throw error||Error('HoYoLAB unavailable.');
}
export async function getRoles(cookie,fetcher=fetch){
  if(!validCookie(cookie))throw Error('Invalid HoYoLAB session cookie.');
  const data=await firstSuccess(ROLE_ENDPOINTS,cookie,false,fetcher);
  return (Array.isArray(data?.list)?data.list:[]).filter(x=>/^[0-9]{8,12}$/.test(String(x.game_uid||''))&&REGIONS.has(x.region))
    .map(x=>({uid:String(x.game_uid),region:x.region,name:safeString(x.nickname,45)}));
}
export async function getNotes(cookie,uid,region,fetcher=fetch,now=Date.now()){
  if(!validCookie(cookie)||!/^[0-9]{8,12}$/.test(String(uid))||!REGIONS.has(region))throw Error('Invalid account parameters.');
  const query=new URLSearchParams({role_id:String(uid),server:region});
  const data=await firstSuccess(NOTES_ENDPOINTS.map(x=>x+'?'+query),cookie,true,fetcher);
  if(!data||!Number.isInteger(Number(data.current_resin))||!Number.isInteger(Number(data.max_resin)))throw Error('Invalid resin response.');
  const resin=Math.trunc(+data.current_resin),cap=Math.trunc(+data.max_resin);
  const seconds=Math.trunc(+data.resin_recovery_time||0);
  if(cap<1||cap>500||resin<0||resin>cap||seconds<0||seconds>500*480)throw Error('HoYoLAB resin data is out of range.');
  return {resin,cap,full_at:resin>=cap?now:now+seconds*1000,last_sync_at:now};
}
export async function telegram(env,method,payload,fetcher=fetch){
  if(!['getMe','setWebhook','sendMessage'].includes(method)||!/^\d+:[\w-]{20,}$/.test(env.BOT_TOKEN||''))throw Error('Invalid Telegram configuration.');
  let res;
  const relayUrl=String(env.TELEGRAM_RELAY_URL||'').trim().replace(/\/$/,'');
  const relayKey=String(env.TELEGRAM_RELAY_KEY||'');
  const viaRelay=relayUrl&&relayKey;
  if(viaRelay){
    const address=new URL(relayUrl);
    if(address.protocol!=='https:'||address.username||address.password||address.search||address.hash)
      throw Error('Telegram relay configuration invalid.');
  }
  try {
    res=await fetcher(viaRelay?relayUrl+'/send':'https://api.telegram.org/bot'+env.BOT_TOKEN+'/'+method,{
      method:'POST',headers:viaRelay?{'Content-Type':'application/json','Authorization':'Bearer '+relayKey}:{'Content-Type':'application/json'},
      body:JSON.stringify(viaRelay?{method,payload}:payload),redirect:'manual',signal:AbortSignal.timeout(15000)});
  } catch (e) {
    if(e?.name==='TimeoutError'||e?.name==='AbortError')throw Error('Telegram '+method+' request timed out.');
    throw Error('Telegram '+method+' network connection failed.');
  }
  // Refuse redirects explicitly so bot credentials cannot be forwarded.
  if(res.status>=300&&res.status<400)throw Error('Telegram '+method+' redirected the request.');
  if(!res.ok)throw Error('Telegram '+method+' returned HTTP '+res.status);
  const body=await res.json();if(!body?.ok)throw Error('Telegram '+method+' was rejected.');
  return body.result;
}
export function errorMessage(e){
  const message=String(e?.message||'Unknown error');
  if(/HoYoLAB|resin|session|cookie|account|Telegram|time|server|UID|invalid|missing|subscrib/i.test(message))return safeString(message,120);
  return 'Service request failed. Try again.';
}
