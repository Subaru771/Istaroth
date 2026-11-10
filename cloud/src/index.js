import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

// One private Worker deployment per Istaroth owner.
// Tokens and HoYoLAB cookies are Cloudflare secrets, never stored in D1 or UI.
const NOTE_ENDPOINTS=[
  'https://bbs-api-os.hoyolab.com/game_record/genshin/api/dailyNote',
  'https://bbs-api-os.hoyoverse.com/game_record/genshin/api/dailyNote'
];
const THRESHOLDS=[160,180,190,200];
const MAX_RECIPIENTS=30;
const STEP_MS=480_000;
const MAX_NOTE_AGE=30*60_000;
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const encoder=new TextEncoder();

function json(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:JSON_HEADERS});
}
function secureEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
  const x=encoder.encode(a),y=encoder.encode(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
function authorized(request,env){
  const authorization=request.headers.get('authorization')||'';
  return secureEqual(authorization,'Bearer '+env.OWNER_API_KEY);
}
function validEnv(env){
  return !!(env.DB&&env.TELEGRAM_BOT_TOKEN&&env.OWNER_API_KEY&&env.TELEGRAM_WEBHOOK_SECRET&&env.INVITE_CODE&&/^\d{8,12}$/.test(String(env.ROLE_UID||''))&&
    ['os_asia','os_euro','os_usa','os_cht'].includes(env.ROLE_REGION));
}
function envProblem(env){
  if(!validEnv(env))return 'Missing Worker secrets, role settings or D1 binding.';
  if(!env.HOYOLAB_COOKIE)return 'Cloud HoYoLAB session is not configured. Add HOYOLAB_COOKIE as a Worker secret.';
  return '';
}
function validateCookie(cookie){
  return typeof cookie==='string' && cookie.length<5000 &&
    /(?:^|;\s*)(?:ltoken_v2|ltoken|cookie_token_v2|cookie_token|stoken_v2|stoken)=/.test(cookie);
}
function nickname(value){
  return String(value||'Traveler').replace(/[\r\n\u0000-\u001f\u007f]/g,' ').slice(0,45);
}
function estimated(note,now=Date.now()){
  if(!note || !Number.isFinite(note.at)||note.at>now+60_000||now-note.at>MAX_NOTE_AGE||
    !Number.isInteger(note.value)||!Number.isInteger(note.cap)||note.cap<=0||note.cap>500||
    note.value<0||note.value>note.cap||!Number.isFinite(note.fullAt))return null;
  const amount=note.value>=note.cap?note.cap:
    Math.min(note.cap,Math.max(note.value,note.cap-Math.ceil(Math.max(0,note.fullAt-now)/STEP_MS)));
  return {amount,cap:note.cap};
}
function inQuiet(env,now=Date.now()){
  const from=String(env.QUIET_START||''),to=String(env.QUIET_END||'');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(from)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(to)||from===to)return false;
  let parts;
  try{
    parts=new Intl.DateTimeFormat('en-GB',{timeZone:env.TIMEZONE||'Asia/Baghdad',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
  }catch{return false;}
  const h=Number(parts.find(p=>p.type==='hour')?.value),m=Number(parts.find(p=>p.type==='minute')?.value);
  const nowMin=h*60+m,parse=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
  const a=parse(from),b=parse(to);
  return a<b?nowMin>=a&&nowMin<b:nowMin>=a||nowMin<b;
}
async function telegram(env,method,payload,fetcher=fetch){
  const response=await fetcher('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/'+method,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
    redirect:'error',signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Error('Telegram HTTP '+response.status);
  const data=await response.json();
  if(!data.ok)throw Error('Telegram rejected '+method);
  return data.result;
}
function dsHeader(now=Date.now()){
  const t=Math.floor(now/1000),r=randomBytes(6).toString('hex');
  const hash=createHash('md5').update('salt=6s25p5ox5y14umn1p61aqyyvbvvl3lrt&t='+t+'&r='+r).digest('hex');
  return t+','+r+','+hash;
}
async function fetchNotes(env,now=Date.now(),fetcher=fetch){
  if(!validateCookie(env.HOYOLAB_COOKIE))throw Error('Invalid or missing HoYoLAB session secret.');
  if(!/^\d{8,12}$/.test(String(env.ROLE_UID||'')))throw Error('Invalid Genshin UID.');
  if(!['os_asia','os_euro','os_usa','os_cht'].includes(env.ROLE_REGION))throw Error('Invalid server.');
  let lastError='HoYoLAB unavailable';
  for(const endpoint of NOTE_ENDPOINTS){
    const u=new URL(endpoint);
    u.searchParams.set('role_id',String(env.ROLE_UID));
    u.searchParams.set('server',env.ROLE_REGION);
    try{
      const response=await fetcher(u.toString(),{
        method:'GET',redirect:'error',
        headers:{
          'Cookie':env.HOYOLAB_COOKIE,
          'Accept':'application/json',
          'Referer':'https://www.hoyolab.com/',
          'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'x-rpc-client_type':'4','x-rpc-app_version':'1.5.0','x-rpc-language':'en-us',
          'DS':dsHeader(now)
        },
        signal:AbortSignal.timeout(15000)
      });
      if(!response.ok){lastError='HoYoLAB HTTP '+response.status;continue;}
      const body=await response.json();
      if(body?.retcode!==0){
        // Don't treat expired sessions or disabled Real-Time Notes as fresh data.
        lastError='HoYoLAB returned error code '+String(body?.retcode||'unknown').slice(0,16);
        if([10001,-100,-101,-10001,10102,10103].includes(body.retcode))break;
        continue;
      }
      const data=body.data;
      if(!data||!Number.isFinite(Number(data.current_resin)))throw Error('No valid resin reading.');
      const cap=Math.trunc(Number(data.max_resin)||200);
      const value=Math.trunc(Number(data.current_resin));
      const seconds=Math.trunc(Number(data.resin_recovery_time)||0);
      if(!Number.isInteger(value)||!Number.isInteger(cap)||cap<1||cap>500||value<0||value>cap||
        !Number.isFinite(seconds)||seconds<0||seconds>200*3600)throw Error('Invalid resin fields.');
      return {at:now,value,cap,fullAt:value===cap?now:now+seconds*1000};
    }catch(e){
      lastError=/Invalid resin|No valid resin/.test(e.message)?e.message:'HoYoLAB request failed';
    }
  }
  throw Error(lastError);
}
async function savedStatus(env){
  return await env.DB.prepare('SELECT at,value,cap,full_at AS fullAt,last_error AS lastError FROM resin_state WHERE id=1').first();
}
async function recipients(env){
  const found=await env.DB.prepare('SELECT chat_id AS id,display_name AS name,enabled,threshold,last_sent_at AS lastSentAt,last_threshold AS lastThreshold FROM recipients ORDER BY joined_at DESC LIMIT ?')
    .bind(MAX_RECIPIENTS).all();
  return (found.results||[]).map(row=>({...row,enabled:!!row.enabled}));
}
async function setError(env,message){
  // Never write cookie values or raw request objects into the database.
  await env.DB.prepare('INSERT INTO resin_state(id,last_error) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET last_error=excluded.last_error')
    .bind(String(message).slice(0,140)).run();
}
async function sync(env,fetcher=fetch,now=Date.now()){
  if(!validEnv(env))throw Error('Cloud service is not configured.');
  let note;
  try{
    note=await fetchNotes(env,now,fetcher);
  }catch(e){
    await setError(env,e.message);
    return {ok:false,error:e.message};
  }
  await env.DB.prepare('INSERT INTO resin_state(id,at,value,cap,full_at,last_error) VALUES(1,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET at=excluded.at,value=excluded.value,cap=excluded.cap,full_at=excluded.full_at,last_error=NULL')
    .bind(note.at,note.value,note.cap,note.fullAt).run();
  const calc=estimated(note,now);
  if(!calc)return {ok:false,error:'HoYoLAB resin estimate was invalid.'};
  const items=await recipients(env);
  let delivered=0;
  for(const person of items){
    const threshold=Math.min(person.threshold,calc.cap);
    if(calc.amount<threshold){
      if(person.lastThreshold===person.threshold){
        await env.DB.prepare('UPDATE recipients SET last_threshold=NULL WHERE chat_id=? AND last_threshold=?')
          .bind(person.id,person.threshold).run();
      }
      continue;
    }
    if(!person.enabled || person.lastThreshold===person.threshold || inQuiet(env,now))continue;
    // Claim before send to prevent repeated cron executions double-sending;
    // a failed send releases the claim so the next scheduled check can retry.
    const claimed=await env.DB.prepare('UPDATE recipients SET last_threshold=?,last_sent_at=? WHERE chat_id=? AND enabled=1 AND (last_threshold IS NULL OR last_threshold!=?)')
      .bind(person.threshold,now,person.id,person.threshold).run();
    if((claimed.meta?.changes||0)<1)continue;
    try{
      const message='⏳ Istaroth · Resin alert\n'+nickname(env.ROLE_NAME)+' has approximately '+
        calc.amount+'/'+calc.cap+' Original Resin'+(calc.amount>=calc.cap?' (full).':'.')+
        '\nSynced through HoYoLAB. Send /stop to unsubscribe.';
      await telegram(env,'sendMessage',{chat_id:person.id,text:message},fetcher);
      delivered++;
    }catch{
      await env.DB.prepare('UPDATE recipients SET last_threshold=NULL WHERE chat_id=? AND last_threshold=? AND last_sent_at=?')
        .bind(person.id,person.threshold,now).run();
    }
  }
  return {ok:true,estimated:calc,delivered,at:note.at};
}
async function handleWebhook(request,env,fetcher=fetch){
  if(!secureEqual(request.headers.get('x-telegram-bot-api-secret-token')||'',env.TELEGRAM_WEBHOOK_SECRET))return json({error:'Unauthorized'},401);
  if(Number(request.headers.get('content-length')||0)>16000)return json({error:'Too large'},413);
  const event=await request.json();
  const m=event?.message;
  if(m?.chat?.type!=='private'||!/^\d{1,20}$/.test(String(m?.chat?.id||'')))return json({ok:true});
  const id=String(m.chat.id);
  const raw=String(m.text||'').trim().slice(0,180),command=raw.split(/\s+/)[0].split('@')[0];
  if(command==='/stop'){
    await env.DB.prepare('DELETE FROM recipients WHERE chat_id=?').bind(id).run();
    await telegram(env,'sendMessage',{chat_id:id,text:'You are unsubscribed from Istaroth resin alerts.'},fetcher);
  } else if(command==='/start'&&raw.split(/\s+/)[1]==='join_'+env.INVITE_CODE){
    const count=(await env.DB.prepare('SELECT COUNT(*) AS count FROM recipients').first())?.count||0;
    const existing=await env.DB.prepare('SELECT chat_id FROM recipients WHERE chat_id=?').bind(id).first();
    if(existing||count<MAX_RECIPIENTS){
      const name=nickname([m.from?.first_name,m.from?.last_name].filter(Boolean).join(' ')||m.from?.username||'Telegram friend');
      await env.DB.prepare('INSERT INTO recipients(chat_id,display_name,joined_at) VALUES(?,?,?) ON CONFLICT(chat_id) DO UPDATE SET display_name=excluded.display_name')
        .bind(id,name,Date.now()).run();
      await telegram(env,'sendMessage',{chat_id:id,text:'Invitation accepted! Your friend can now enable your resin alerts. Send /stop to unsubscribe anytime.'},fetcher);
    } else {
      await telegram(env,'sendMessage',{chat_id:id,text:'This Istaroth friend list is full.'},fetcher);
    }
  }else if(command==='/status'){
    const r=await env.DB.prepare('SELECT enabled,threshold FROM recipients WHERE chat_id=?').bind(id).first();
    if(r)await telegram(env,'sendMessage',{chat_id:id,text:r.enabled?
      'Istaroth notifications enabled at '+r.threshold+' Original Resin. Send /stop to unsubscribe.':
      'Your Istaroth subscription is currently paused. Send /stop to unsubscribe.'},fetcher);
  }else if(command==='/start'||command==='/help'){
    await telegram(env,'sendMessage',{chat_id:id,text:'Open the private invitation link from your friend to subscribe. Send /stop to unsubscribe.'},fetcher);
  }
  return json({ok:true});
}
async function api(request,env,fetcher=fetch){
  if(!authorized(request,env))return json({error:'Unauthorized'},401);
  if(!validEnv(env))return json({error:'Missing Worker secrets, UID/region or D1 database binding'},503);
  const u=new URL(request.url),method=request.method;
  if(method==='GET'&&u.pathname==='/api/status'){
    const saved=await savedStatus(env);
    const value=saved?.at&&saved?.lastError===null?estimated({at:saved.at,value:saved.value,cap:saved.cap,fullAt:saved.fullAt}):null;
    const bot=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('bot_username').first();
    return json({mode:'cloud',active:true,autoSync:!!env.HOYOLAB_COOKIE,role:{uid:env.ROLE_UID,region:env.ROLE_REGION,nickname:nickname(env.ROLE_NAME)},
      botUsername:bot?.value||'',inviteUrl:bot?.value?'https://t.me/'+bot.value+'?start=join_'+env.INVITE_CODE:'',
      notes:value,updatedAt:saved?.at||null,error:saved?.lastError||envProblem(env)||'',
      recipients:await recipients(env),quiet:{start:env.QUIET_START||'',end:env.QUIET_END||'',timeZone:env.TIMEZONE||'Asia/Baghdad'}});
  }
  if(method==='POST'&&u.pathname==='/api/bootstrap'){
    const me=await telegram(env,'getMe',{},fetcher);
    if(!me?.is_bot||!/^[A-Za-z0-9_]{5,32}$/.test(me.username||''))throw Error('Invalid Telegram bot.');
    const base=new URL(request.url).origin;
    await telegram(env,'setWebhook',{url:base+'/telegram',secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message'],drop_pending_updates:false},fetcher);
    await env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .bind('bot_username',me.username).run();
    return json({ok:true,username:me.username,inviteUrl:'https://t.me/'+me.username+'?start=join_'+env.INVITE_CODE});
  }
  if(method==='POST'&&u.pathname==='/api/sync')return json(await sync(env,fetcher,Date.now()));
  if(method==='POST'&&u.pathname==='/api/recipient'){
    const body=await request.json();
    const id=String(body?.id||''),threshold=Number(body?.threshold),enabled=body?.enabled;
    if(!/^\d{1,20}$/.test(id)||!THRESHOLDS.includes(threshold)||typeof enabled!=='boolean')return json({error:'Invalid recipient settings'},400);
    const result=await env.DB.prepare('UPDATE recipients SET enabled=?,threshold=?,last_threshold=NULL WHERE chat_id=?')
      .bind(enabled?1:0,threshold,id).run();
    return json({ok:true,updated:(result.meta?.changes||0)>0});
  }
  if(method==='POST'&&u.pathname==='/api/remove'){
    const body=await request.json(),id=String(body?.id||'');
    if(!/^\d{1,20}$/.test(id))return json({error:'Invalid recipient'},400);
    await env.DB.prepare('DELETE FROM recipients WHERE chat_id=?').bind(id).run();
    return json({ok:true});
  }
  if(method==='POST'&&u.pathname==='/api/test'){
    const body=await request.json(),id=String(body?.id||'');
    if(!/^\d{1,20}$/.test(id))return json({error:'Invalid recipient'},400);
    const r=await env.DB.prepare('SELECT enabled FROM recipients WHERE chat_id=?').bind(id).first();
    if(!r?.enabled)return json({error:'Enable this friend first'},400);
    await telegram(env,'sendMessage',{chat_id:id,text:'Istaroth cloud test alert. Notifications work even when the PC is off.'},fetcher);
    return json({ok:true});
  }
  return json({error:'Not found'},404);
}
export default {
  async fetch(request,env){
    try{
      const route=new URL(request.url).pathname;
      if(route==='/health'&&request.method==='GET')return json({service:'Istaroth cloud resin alerts',status:'online'});
      if(route==='/telegram'&&request.method==='POST')return await handleWebhook(request,env);
      if(route.startsWith('/api/'))return await api(request,env);
      return json({error:'Not found'},404);
    }catch(e){
      // No cookie contents, bot tokens, recipient data, or secrets are logged.
      if(e?.name==='SyntaxError')return json({error:'Invalid JSON'},400);
      return json({error:'Operation failed. Check your deployment and cloud configuration.'},502);
    }
  },
  async scheduled(_event,env,ctx){
    ctx.waitUntil(sync(env).catch(()=>{}));
  }
};
export {estimated,inQuiet,fetchNotes,sync,handleWebhook,secureEqual,authorized,validEnv};
