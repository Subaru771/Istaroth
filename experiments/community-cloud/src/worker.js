import {randomInt} from 'node:crypto';
import {parseReminderInput,storedRule,thresholdsCrossed,isRuleThreshold} from './reminders.js';
import {
  token,hash,safeString,isTelegramId,secureEqual,validCookie,THRESHOLDS,REGIONS,
  LOGIN_TTL,SESSION_TTL,sessionCookie,parseSession,sameOrigin,encryptCookie,decryptCookie,
  getRoles,getNotes,estimatedResin,projectedResin,telegram,errorMessage
} from './lib.js';

const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const now=()=>Date.now();
const json=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{...HEADERS,...headers}});
const err=(message,status=400)=>json({error:message},status);
const q=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
// Telegram supports delivering a message directly from a webhook response.
// This avoids a second outbound HTTP request for sign-in and join confirmations.
const webhookReply=(chatId,text)=>json({method:'sendMessage',chat_id:chatId,text});
const DELIVERY_RETRY_MS=2*60*1000;
// Store only safe diagnostic messages; never save tokens, cookies, or raw HTTP URLs.
function deliveryError(e){return errorMessage(e);}
async function deliveryState(env,ownerId,recipientId,kind,status,error=null,ts=now()){
  await q(env,`INSERT INTO notification_delivery_state(owner_id,recipient_id,kind,status,last_error,last_attempt_at,last_success_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,recipient_id,kind) DO UPDATE SET
    status=excluded.status,last_error=excluded.last_error,last_attempt_at=excluded.last_attempt_at,
    last_success_at=CASE WHEN excluded.status='sent' THEN excluded.last_success_at
      ELSE notification_delivery_state.last_success_at END`,
    ownerId,recipientId,kind,status,error,ts,status==='sent'?ts:null).run();
}
function retryDelay(attempt){return Math.min(30,Math.max(1,2**Math.min(5,attempt)))*60*1000;}


function configuration(env){
  if(!env.DB||!/^\d+:[\w-]{20,}$/.test(env.BOT_TOKEN||'')||
    !/^[A-Za-z0-9_]{5,32}$/.test(env.BOT_USERNAME||'')||
    !/^[A-Za-z0-9_-]{32,}$/.test(env.WEBHOOK_SECRET||'')||
    !/^[A-Za-z0-9_-]{43}$/.test(env.DATA_KEY||'')||
    !/^[A-Za-z0-9_-]{32,}$/.test(env.ADMIN_SETUP_KEY||''))
    return 'The administrator has not finished configuring the server.';
  return '';
}
async function bodyJson(request){
  if(Number(request.headers.get('content-length')||0)>9000)throw Error('Request body is too large.');
  const text=await request.text();if(text.length>9000)throw Error('Request body is too large.');
  return JSON.parse(text||'{}');
}
async function limitByIp(env,request,topic,maximum,periodMs){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const id=hash(topic+'|'+ip+'|'+env.DATA_KEY),ts=now();
  await q(env,`INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET
    window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END,
    count=CASE WHEN window_start<? THEN 1 ELSE count+1 END`,id,ts,ts-periodMs,ts-periodMs).run();
  const state=await q(env,'SELECT count FROM rate_limits WHERE key=?',id).first();
  return Number(state?.count||0)<=maximum;
}
async function authenticate(request,env){
  const raw=parseSession(request);
  if(!raw)return null;
  const session=await q(env,`SELECT sessions.user_id AS id,users.name AS name,users.username AS username,
    users.invite_code AS invite FROM sessions JOIN users ON users.id=sessions.user_id
    WHERE sessions.token_hash=? AND sessions.expires_at>?`,hash(raw),now()).first();
  return session||null;
}
async function ensureUser(env,id,name,username=''){
  await q(env,`INSERT INTO users(id,name,username,invite_code,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username`,
    id,safeString(name||'Traveler',55),safeString(username,40),token(18),now()).run();
}
function botLink(env,parameter){return 'https://t.me/'+env.BOT_USERNAME+'?start='+parameter;}
async function authBegin(request,env){
  if(!await limitByIp(env,request,'auth',6,10*60*1000))return err('Too many sign-in requests. Try later.',429);
  const value=token(18),ts=now();
  await q(env,'INSERT INTO logins(token_hash,expires_at) VALUES(?,?)',hash(value),ts+LOGIN_TTL).run();
  return json({ticket:value,botLink:botLink(env,'login_'+value),expiresAt:ts+LOGIN_TTL});
}
async function authComplete(request,env){
  const {ticket,code}=await bodyJson(request);
  if(!/^[A-Za-z0-9_-]{24}$/.test(String(ticket||''))||!/^[0-9]{6}$/.test(String(code||'')))return err('Invalid code.',400);
  const row=await q(env,'SELECT telegram_id,code_hash,expires_at,attempts FROM logins WHERE token_hash=?',hash(ticket)).first();
  if(!row||+row.expires_at<now()||+row.attempts>=5)return err('Sign-in expired. Start again.',400);
  // Increment before comparing so even incorrect attempts consume the limit.
  const attempt=await q(env,'UPDATE logins SET attempts=attempts+1 WHERE token_hash=? AND attempts<5 AND expires_at>?',hash(ticket),now()).run();
  if(attempt.meta?.changes!==1)return err('Sign-in expired or too many attempts.',429);
  if(!row.telegram_id||!secureEqual(row.code_hash||'',hash(ticket+'|'+code)))return err('Incorrect code. Check Telegram.',401);
  const consumed=await q(env,'DELETE FROM logins WHERE token_hash=? AND telegram_id=?',hash(ticket),row.telegram_id).run();
  if(!(consumed.meta?.changes))return err('This sign-in has already been used.',409);
  const sessionToken=token(32),ts=now();
  await q(env,'INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)',
    hash(sessionToken),row.telegram_id,ts+SESSION_TTL,ts).run();
  return json({ok:true},200,{'Set-Cookie':sessionCookie(sessionToken)});
}
function validateTime(value){return typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);}
function toMinute(value){return Number(value.slice(0,2))*60+Number(value.slice(3));}
function fromMinute(value){return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
function validTimezone(zone){
  if(typeof zone!=='string'||zone.length>64||!(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(zone)))return false;
  try{new Intl.DateTimeFormat('en-US',{timeZone:zone}).format(0);return true;}catch{return false;}
}
async function quietPreference(env,id){
  const row=await q(env,'SELECT enabled,start_min,end_min,timezone FROM notification_quiet_hours WHERE user_id=?',id).first();
  return row?{enabled:row.enabled===1,start:fromMinute(row.start_min),end:fromMinute(row.end_min),timezone:row.timezone}:
    {enabled:false,start:'23:00',end:'08:00',timezone:'UTC'};
}
async function setQuietPreference(request,env,user){
  const data=await bodyJson(request);
  if(typeof data.enabled!=='boolean'||!validateTime(data.start)||!validateTime(data.end)||
    data.start===data.end||!validTimezone(data.timezone))return err('Choose valid quiet hours and a supported timezone.');
  await q(env,`INSERT INTO notification_quiet_hours(user_id,enabled,start_min,end_min,timezone)
    VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,start_min=excluded.start_min,
    end_min=excluded.end_min,timezone=excluded.timezone`,user.id,data.enabled?1:0,toMinute(data.start),toMinute(data.end),data.timezone).run();
  return json({ok:true,quietHours:await quietPreference(env,user.id)});
}
function inQuietHours(preference,ts){
  if(!preference?.enabled)return false;
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:preference.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ts));
  const hour=Number(parts.find(p=>p.type==='hour')?.value),minute=Number(parts.find(p=>p.type==='minute')?.value);
  const current=hour*60+minute,start=toMinute(preference.start),end=toMinute(preference.end);
  return start<end?(current>=start&&current<end):(current>=start||current<end);
}
async function me(env,user){
  const a=await q(env,`SELECT genshin_uid AS uid,region,nickname,resin,cap,full_at AS fullAt,
    last_sync_at AS lastSyncAt,next_sync_at AS nextSyncAt,last_error AS lastError,
    self_enabled AS selfEnabled,self_threshold AS selfThreshold,tracking_mode AS trackingMode
    FROM accounts WHERE user_id=?`,user.id).first();
  const subs=await q(env,`SELECT s.subscriber_id AS id,u.name,s.threshold,s.enabled,s.joined_at AS joinedAt,
    fr.mode AS rule_mode,fr.thresholds AS rule_thresholds,fr.step AS rule_step
    FROM subscriptions s JOIN users u ON u.id=s.subscriber_id
    LEFT JOIN friend_reminder_rules fr ON fr.owner_id=s.owner_id AND fr.subscriber_id=s.subscriber_id
    WHERE s.owner_id=? ORDER BY s.joined_at DESC LIMIT 30`,user.id).all();
  const following=await q(env,`SELECT u.name,a.nickname,subscriptions.enabled,subscriptions.threshold
    FROM subscriptions JOIN users u ON u.id=subscriptions.owner_id
    LEFT JOIN accounts a ON a.user_id=subscriptions.owner_id
    WHERE subscriptions.subscriber_id=? ORDER BY subscriptions.joined_at DESC LIMIT 30`,user.id).all();
  const ownRule=a?storedRule(await q(env,'SELECT mode,thresholds,step FROM self_reminder_rules WHERE user_id=?',user.id).first()):null;
  const account=a?{
    uid:a.uid,region:a.region,nickname:a.nickname,
    resin:a.resin===null?null:(a.trackingMode==='estimate'?projectedResin({resin:a.resin,cap:a.cap,full_at:a.fullAt}):estimatedResin({resin:a.resin,cap:a.cap,full_at:a.fullAt,last_sync_at:a.lastSyncAt})),
    trackingMode:a.trackingMode,lastSyncAt:a.lastSyncAt,nextSyncAt:a.nextSyncAt,lastError:a.lastError,
    selfEnabled:!!a.selfEnabled,selfThreshold:a.selfThreshold,reminderRule:ownRule||{mode:'single',thresholds:[a.selfThreshold],step:0}
  }:null;
  return {user:{name:user.name,username:user.username},account,quietHours:await quietPreference(env,user.id),
    inviteLink:botLink(env,'follow_'+user.invite),
    followers:(subs.results||[]).map(s=>({id:s.id,name:s.name,threshold:s.threshold,enabled:!!s.enabled,
      joinedAt:s.joinedAt,reminderRule:storedRule(s.rule_mode?{mode:s.rule_mode,thresholds:s.rule_thresholds,step:s.rule_step}:null)
        ||{mode:'single',thresholds:[s.threshold],step:0}})),
    following:(following.results||[]).map(s=>({...s,enabled:!!s.enabled}))};
}
// Website-only HoYoLAB connection: preview roles without storing a credential.
// Caller must be logged in to Community via Telegram; cookie never appears in a URL.
async function previewAccount(request,env,user){
  if(!await limitByIp(env,request,'preview-'+user.id,8,15*60*1000))
    return err('Too many pairing attempts. Try again later.',429);
  const body=await bodyJson(request);
  const cookie=String(body.cookie||'').trim();
  if(!validCookie(cookie))return err('Enter a valid HoYoLAB session cookie string.',400);
  const accounts=await getRoles(cookie);
  if(!accounts.length)return err('No Genshin Impact accounts were found for this HoYoLAB session.',404);
  // Only the game UID, region and nickname are returned. Never echo the session.
  return json({accounts});
}
async function connectAccount(request,env,user){
  if(!await limitByIp(env,request,'connect-'+user.id,6,15*60*1000))return err('Too many connection attempts. Try later.',429);
  const b=await bodyJson(request);
  const uid=String(b.uid||''),region=String(b.region||''),cookie=String(b.cookie||'');
  if(!/^[0-9]{8,12}$/.test(uid)||!REGIONS.has(region)||!validCookie(cookie))return err('Enter your correct UID, region and HoYoLAB session cookie.');
  // Verify the provided UID genuinely belongs to the authenticated HoYoLAB session.
  const roles=await getRoles(cookie);
  const selected=roles.find(r=>r.uid===uid&&r.region===region);
  if(!selected)return err('The selected Genshin UID is not linked to this HoYoLAB session.',403);
  const note=await getNotes(cookie,uid,region);
  const encrypted=await encryptCookie(env,user.id,cookie);
  await q(env,`INSERT INTO accounts(user_id,genshin_uid,region,nickname,credential_iv,credential_ciphertext,
      resin,cap,full_at,last_sync_at,next_sync_at,last_error)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)
    ON CONFLICT(user_id) DO UPDATE SET
      genshin_uid=excluded.genshin_uid,region=excluded.region,nickname=excluded.nickname,
      credential_iv=excluded.credential_iv,credential_ciphertext=excluded.credential_ciphertext,
      resin=excluded.resin,cap=excluded.cap,full_at=excluded.full_at,tracking_mode='hoyolab',
      last_sync_at=excluded.last_sync_at,next_sync_at=excluded.next_sync_at,last_error=NULL`,
    user.id,uid,region,selected.name,encrypted.iv,encrypted.ciphertext,note.resin,note.cap,note.full_at,note.last_sync_at,now()+5*60*1000).run();
  await q(env,'UPDATE self_reminder_rules SET last_resin=NULL WHERE user_id=?',user.id).run();
  await q(env,'UPDATE friend_reminder_rules SET last_resin=NULL WHERE owner_id=?',user.id).run();
  await q(env,'DELETE FROM alert_state WHERE owner_id=?',user.id).run();
  await q(env,'DELETE FROM delivery_queue WHERE owner_id=?',user.id).run();
  return json({ok:true,account:{uid,nickname:selected.name,region,resin:note.resin,cap:note.cap}});
}

// Website + Telegram-only resin tracking, with no password, cookie or native app.
// An entered resin value is a forecast baseline, not HoYoLAB verification.
async function setEstimatedResin(env,userId,amount,ts=now()){
  if(!Number.isInteger(amount)||amount<0||amount>200)throw Error('Enter a whole resin amount from 0 to 200.');
  const existing=await q(env,'SELECT tracking_mode FROM accounts WHERE user_id=?',userId).first();
  if(existing&&existing.tracking_mode!=='estimate')throw Error('HoYoLAB is already connected. Your live account will not be replaced by an estimate.');
  const fullAt=ts+(200-amount)*8*60*1000;
  await q(env,`INSERT INTO accounts(user_id,genshin_uid,region,nickname,credential_iv,credential_ciphertext,
      resin,cap,full_at,last_sync_at,next_sync_at,last_error,tracking_mode)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,'estimate')
    ON CONFLICT(user_id) DO UPDATE SET
      resin=excluded.resin,cap=200,full_at=excluded.full_at,last_sync_at=excluded.last_sync_at,
      next_sync_at=excluded.next_sync_at,last_error=NULL,tracking_mode='estimate'`,
    userId,'','','Estimated resin (unverified)','','',amount,200,fullAt,ts,ts+60000).run();
  // A manual correction is a new baseline, never a retroactive reminder.
  await q(env,'UPDATE self_reminder_rules SET last_resin=? WHERE user_id=?',amount,userId).run();
  await q(env,'UPDATE friend_reminder_rules SET last_resin=? WHERE owner_id=?',amount,userId).run();
  await q(env,'DELETE FROM delivery_queue WHERE owner_id=?',userId).run();
  await q(env,'DELETE FROM alert_state WHERE owner_id=?',userId).run();
  const friends=await q(env,'SELECT subscriber_id,threshold FROM subscriptions WHERE owner_id=? AND enabled=1',userId).all();
  const legacy=await q(env,'SELECT self_threshold FROM accounts WHERE user_id=?',userId).first();
  await q(env,'INSERT INTO alert_state(owner_id,recipient_id,threshold,armed) VALUES(?,?,?,?)',
    userId,userId,legacy.self_threshold,amount<legacy.self_threshold?1:0).run();
  for(const friend of friends.results||[]){
    await q(env,'INSERT INTO alert_state(owner_id,recipient_id,threshold,armed) VALUES(?,?,?,?)',
      userId,friend.subscriber_id,friend.threshold,amount<friend.threshold?1:0).run();
  }
  return {resin:amount,cap:200,estimated:true};
}
async function setEstimateFromWeb(request,env,user){
  if(!await limitByIp(env,request,'manual-resin-'+user.id,15,15*60*1000))return err('Too many resin updates. Try later.',429);
  const input=await bodyJson(request);
  if(typeof input.resin!=='number'||!Number.isInteger(input.resin)||input.resin<0||input.resin>200)
    return err('Enter a whole resin amount from 0 to 200.');
  try{return json({ok:true,account:await setEstimatedResin(env,user.id,input.resin)});}
  catch(e){return err(errorMessage(e),409);}
}

// One-time, high-entropy pairing code binds a user's Telegram-authenticated
// Community account to a desktop-approved HoYoLAB session transfer.
async function beginPairing(request,env,user){
  if(!await limitByIp(env,request,'pair-'+user.id,8,10*60*1000))return err('Too many pairing attempts. Try again later.',429);
  const code=token(18),ts=now();
  await q(env,'DELETE FROM desktop_pairings WHERE user_id=?',user.id).run();
  await q(env,'INSERT INTO desktop_pairings(code_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)',
    hash(code),user.id,ts+5*60*1000,ts).run();
  return json({code,expiresAt:ts+5*60*1000});
}
// Browser extensions may preview a one-time code without consuming it.
// The code is generated only by a Telegram-authenticated Community user.
// Neither the account session nor any HoYoLAB credential is returned.
// Public, non-consuming check for a Telegram-authenticated user's high-entropy pairing code.
// Returns no user identifiers or session data. Called before gateway accepts passwords.
async function checkPairing(request,env){
  if(!await limitByIp(env,request,'pair-check',8,10*60*1000))return err('Too many checks. Try later.',429);
  const body=await bodyJson(request);
  const code=String(body.code||'');
  if(!/^[A-Za-z0-9_-]{24}$/.test(code))return err('Invalid pairing code.',400);
  const record=await q(env,'SELECT user_id FROM desktop_pairings WHERE code_hash=? AND expires_at>? AND claim_hash IS NULL',hash(code),now()).first();
  if(!record)return err('Pairing code expired or invalid.',403);
  return json({ok:true});
}
// Atomically reserves a one-time Community pairing code for a gateway job.
// The proof is generated by the gateway and never appears in a URL.
async function claimPairing(request,env){
  if(!await limitByIp(env,request,'pair-claim',6,10*60*1000))return err('Too many pairing claims.',429);
  const body=await bodyJson(request),code=String(body.code||''),proof=String(body.proof||'');
  if(!/^[A-Za-z0-9_-]{24}$/.test(code)||!/^[A-Za-z0-9_-]{43}$/.test(proof))return err('Invalid claim.',400);
  const claimed=await q(env,`UPDATE desktop_pairings SET claim_hash=?,claimed_at=?
    WHERE code_hash=? AND claim_hash IS NULL AND expires_at>?`,hash(proof),now(),hash(code),now()).run();
  if(claimed.meta?.changes!==1)return err('Code expired or already reserved.',409);
  return json({ok:true});
}
async function previewPairing(request,env){
  if(!await limitByIp(env,request,'pair-browser-preview',6,10*60*1000))
    return err('Too many preview attempts. Please try later.',429);
  const body=await bodyJson(request);
  const code=String(body.code||'');
  if(!/^[A-Za-z0-9_-]{24}$/.test(code))return err('Invalid or expired pairing code.',400);
  const record=await q(env,'SELECT user_id,claim_hash FROM desktop_pairings WHERE code_hash=? AND expires_at>?',hash(code),now()).first();
  if(!record)return err('Invalid or expired pairing code.',400);
  if(record.claim_hash&&!secureEqual(record.claim_hash,hash(String(body.proof||''))))return err('Pairing proof required.',403);
  const cookie=String(body.cookie||'').trim();
  if(!validCookie(cookie))return err('No usable HoYoLAB session found. Sign in through HoYoLAB first.',400);
  const accounts=await getRoles(cookie);
  if(!accounts.length)return err('No linked Genshin accounts were found for this HoYoLAB login.',404);
  return json({accounts,expiresSoon:true});
}
async function pairingStatus(env,user){
  const pending=await q(env,'SELECT expires_at FROM desktop_pairings WHERE user_id=? AND expires_at>?',user.id,now()).first();
  const linked=await q(env,'SELECT genshin_uid AS uid FROM accounts WHERE user_id=?',user.id).first();
  return json({pending:!!pending,linked:!!linked,uid:linked?.uid||null});
}
async function finishPairing(request,env){
  if(!await limitByIp(env,request,'pair-complete',12,10*60*1000))return err('Too many pairing attempts. Try again later.',429);
  const body=await bodyJson(request);
  const code=String(body.code||'');
  if(!/^[A-Za-z0-9_-]{24}$/.test(code))return err('Invalid or expired pairing code.',400);
  const record=await q(env,'SELECT user_id,expires_at,claim_hash FROM desktop_pairings WHERE code_hash=?',hash(code)).first();
  if(!record||record.expires_at<now())return err('Invalid or expired pairing code.',400);
  if(record.claim_hash&&!secureEqual(record.claim_hash,hash(String(body.proof||''))))return err('Pairing proof required.',403);
  // Consume before checking the HoYoLAB credential. Codes are single-use,
  // including if HoYoLAB cannot verify the account. Create a new code to retry.
  const claimed=await q(env,'DELETE FROM desktop_pairings WHERE code_hash=? AND expires_at>?',hash(code),now()).run();
  if(claimed.meta?.changes!==1)return err('Pairing code already used.',409);
  const user={id:record.user_id};
  const response=await connectAccount(new Request(request.url,{
    method:'POST',headers:{'content-type':'application/json','CF-Connecting-IP':request.headers.get('CF-Connecting-IP')||''},
    body:JSON.stringify({uid:body.uid,region:body.region,cookie:body.cookie})
  }),env,user);
  return response;
}

async function updatePreferences(request,env,user){
  const data=await bodyJson(request);
  if(typeof data.enabled!=='boolean')return err('Invalid alert preferences.');
  const legacy=!Object.hasOwn(data,'mode')&&THRESHOLDS.includes(Number(data.threshold));
  let rule;
  if(!legacy){
    try{rule=parseReminderInput(data);}catch(e){return err(e.message);}
  }
  if(legacy){
    await q(env,'UPDATE accounts SET self_enabled=?,self_threshold=? WHERE user_id=?',data.enabled?1:0,+data.threshold,user.id).run();
    await q(env,'DELETE FROM self_reminder_rules WHERE user_id=?',user.id).run();
  }else{
    const account=await q(env,'SELECT cap,resin,full_at,last_sync_at,tracking_mode FROM accounts WHERE user_id=?',user.id).first();
    if(!account)return err('Connect Genshin first.');
    if(rule.mode!=='every'&&rule.thresholds.some(v=>v>Number(account.cap||200)))return err('Resin amounts cannot exceed your current resin capacity.');
    // Seed from the fresh cached resin NOW, not from the first future sync.
    // Otherwise a threshold crossed before that first sync would be missed.
    const baseline=(account.tracking_mode==='estimate'?projectedResin:estimatedResin)(account,now())?.resin??null;
    await q(env,'UPDATE accounts SET self_enabled=? WHERE user_id=?',data.enabled?1:0,user.id).run();
    await q(env,`INSERT INTO self_reminder_rules(user_id,mode,thresholds,step,last_resin,updated_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode,thresholds=excluded.thresholds,
        step=excluded.step,last_resin=excluded.last_resin,updated_at=excluded.updated_at`,
      user.id,rule.mode,JSON.stringify(rule.thresholds),rule.step,baseline,now()).run();
  }
  await q(env,'DELETE FROM alert_state WHERE owner_id=? AND recipient_id=?',user.id,user.id).run();
  await q(env,'DELETE FROM delivery_queue WHERE owner_id=? AND recipient_id=?',user.id,user.id).run();
  return json({ok:true});
}
async function updateFriend(request,env,user){
  const data=await bodyJson(request),id=String(data.id||'');
  if(!isTelegramId(id)||typeof data.enabled!=='boolean')return err('Invalid friend preferences.');
  const legacy=!Object.hasOwn(data,'mode')&&THRESHOLDS.includes(Number(data.threshold));
  let rule;
  if(!legacy){try{rule=parseReminderInput(data);}catch(e){return err(e.message);}}
  if(!legacy&&rule.mode!=='every'){
    const account=await q(env,'SELECT cap FROM accounts WHERE user_id=?',user.id).first();
    const cap=Number(account?.cap||200);
    if(rule.thresholds.some(value=>value>cap))return err('Friend resin amounts cannot exceed your current resin capacity ('+cap+').');
  }
  const exists=await q(env,'SELECT enabled FROM subscriptions WHERE owner_id=? AND subscriber_id=?',user.id,id).first();
  if(!exists)return err('Friend is not subscribed.',404);
  // Keep the legacy constrained threshold column unchanged when using a custom rule.
  const result=legacy?await q(env,'UPDATE subscriptions SET enabled=?,threshold=? WHERE owner_id=? AND subscriber_id=?',
    data.enabled?1:0,Number(data.threshold),user.id,id).run():
    await q(env,'UPDATE subscriptions SET enabled=? WHERE owner_id=? AND subscriber_id=?',data.enabled?1:0,user.id,id).run();
  if(!(result.meta?.changes))return err('Friend is not subscribed.',404);
  if(legacy)await q(env,'DELETE FROM friend_reminder_rules WHERE owner_id=? AND subscriber_id=?',user.id,id).run();
  else {
    const current=await q(env,'SELECT resin,cap,full_at,last_sync_at,tracking_mode FROM accounts WHERE user_id=?',user.id).first();
    const baseline=(current?.tracking_mode==='estimate'?projectedResin:estimatedResin)(current,now())?.resin??null;
    await q(env,`INSERT INTO friend_reminder_rules(owner_id,subscriber_id,mode,thresholds,step,last_resin,updated_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,subscriber_id) DO UPDATE SET
        mode=excluded.mode,thresholds=excluded.thresholds,step=excluded.step,
        last_resin=excluded.last_resin,updated_at=excluded.updated_at`,
      user.id,id,rule.mode,JSON.stringify(rule.thresholds),rule.step,baseline,now()).run();
  }
  await q(env,'DELETE FROM alert_state WHERE owner_id=? AND recipient_id=?',user.id,id).run();
  await q(env,'DELETE FROM delivery_queue WHERE owner_id=? AND recipient_id=?',user.id,id).run();
  if(!data.enabled){
    await q(env,`UPDATE notification_events SET status='cancelled',updated_at=?
      WHERE owner_id=? AND recipient_id=? AND status='pending'`,now(),user.id,id).run();
    return json({ok:true,approvalNotification:'not_applicable'});
  }
  if(!exists.enabled){
    await queueFriendApproval(env,user,id);
    await sendApprovalEvents(env,now(),user.id,id);
    const delivery=await q(env,`SELECT status,last_error FROM notification_delivery_state
      WHERE owner_id=? AND recipient_id=? AND kind='friend_approved'`,user.id,id).first();
    return json({ok:true,approvalNotification:delivery?.status||'queued',deliveryError:delivery?.last_error||null});
  }
  return json({ok:true,approvalNotification:'not_applicable'});
}
async function notificationStatus(env,user){
  const rows=await q(env,`SELECT recipient_id,kind,status,last_error,last_attempt_at,last_success_at
    FROM notification_delivery_state WHERE owner_id=? ORDER BY last_attempt_at DESC LIMIT 60`,user.id).all();
  const counts=await q(env,`SELECT
    (SELECT COUNT(*) FROM delivery_queue WHERE owner_id=?) AS resin_pending,
    (SELECT COUNT(*) FROM notification_events WHERE owner_id=? AND status='pending') AS approvals_pending`,user.id,user.id).first();
  const account=await q(env,'SELECT last_sync_at,last_error,next_sync_at FROM accounts WHERE user_id=?',user.id).first();
  return json({relayConfigured:!!(env.TELEGRAM_RELAY_URL&&env.TELEGRAM_RELAY_KEY),
    resinPending:Number(counts?.resin_pending||0),approvalPending:Number(counts?.approvals_pending||0),
    lastSyncAt:account?.last_sync_at||null,syncError:account?.last_error||null,
    deliveries:(rows.results||[])});
}
async function queueFriendApproval(env,user,id,ts=now()){
  const owner=await q(env,'SELECT name FROM users WHERE id=?',user.id).first();
  const friendName=safeString(owner?.name||'Your friend',50);
  const text='✅ Istaroth · '+friendName+' approved your follow request. Resin reminders are now enabled. Send /stop to unsubscribe.';
  await q(env,`INSERT INTO notification_events(owner_id,recipient_id,kind,text,created_at,next_attempt_at,updated_at)
    VALUES(?,?,?,?,?,?,?)`,user.id,id,'friend_approved',text,ts,ts,ts).run();
  await deliveryState(env,user.id,id,'friend_approved','queued',null,ts);
}
async function sendApprovalEvents(env,ts=now(),onlyOwner=null,onlyRecipient=null){
  const rows=await q(env,`SELECT e.* FROM notification_events e JOIN subscriptions s
    ON s.owner_id=e.owner_id AND s.subscriber_id=e.recipient_id
    WHERE e.status='pending' AND e.next_attempt_at<=? AND s.enabled=1
      AND (? IS NULL OR e.owner_id=?) AND (? IS NULL OR e.recipient_id=?)
    ORDER BY e.id ASC LIMIT 10`,ts,onlyOwner,onlyOwner,onlyRecipient,onlyRecipient).all();
  let sent=0;
  for(const event of rows.results||[]){
    if(ts-event.created_at>24*3600*1000){
      await q(env,`UPDATE notification_events SET status='expired',last_error=?,updated_at=? WHERE id=?`,
        'Delivery window expired.',ts,event.id).run();
      await deliveryState(env,event.owner_id,event.recipient_id,'friend_approved','expired','Delivery window expired.',ts);
      continue;
    }
    try{
      await telegram(env,'sendMessage',{chat_id:event.recipient_id,text:event.text});
      await q(env,`UPDATE notification_events SET status='sent',delivered_at=?,last_error=NULL,updated_at=? WHERE id=?`,ts,ts,event.id).run();
      await deliveryState(env,event.owner_id,event.recipient_id,'friend_approved','sent',null,ts);
      sent++;
    }catch(e){
      const reason=deliveryError(e);
      await q(env,`UPDATE notification_events SET attempts=attempts+1,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?`,
        ts+retryDelay(event.attempts+1),reason,ts,event.id).run();
      await deliveryState(env,event.owner_id,event.recipient_id,'friend_approved','retrying',reason,ts);
    }
  }
  return sent;
}
async function notifyFriend(request,env,user){
  const {id:raw}=await bodyJson(request),id=String(raw||'');
  if(!isTelegramId(id))return err('Invalid friend.',400);
  const friend=await q(env,'SELECT enabled FROM subscriptions WHERE owner_id=? AND subscriber_id=?',user.id,id).first();
  if(!friend?.enabled)return err('Approve this friend before sending the approval message.',403);
  const ts=now();
  const latest=await q(env,`SELECT id,status,created_at FROM notification_events
    WHERE owner_id=? AND recipient_id=? AND kind='friend_approved' ORDER BY id DESC LIMIT 1`,user.id,id).first();
  if(latest?.status==='pending'){
    // Retry the existing queued message; never create duplicate pending approvals.
    await q(env,'UPDATE notification_events SET next_attempt_at=? WHERE id=?',ts,latest.id).run();
  }else if(latest?.status==='sent'&&ts-latest.created_at<10*60*1000){
    return json({ok:true,approvalNotification:'sent',alreadySent:true});
  }else{
    await queueFriendApproval(env,user,id,ts);
  }
  await sendApprovalEvents(env,ts,user.id,id);
  const delivery=await q(env,`SELECT status,last_error FROM notification_delivery_state
    WHERE owner_id=? AND recipient_id=? AND kind='friend_approved'`,user.id,id).first();
  return json({ok:true,approvalNotification:delivery?.status||'queued',deliveryError:delivery?.last_error||null});
}
async function removeFriend(request,env,user){
  const {id}=await bodyJson(request);
  if(!isTelegramId(id))return err('Invalid friend.');
  await q(env,'DELETE FROM subscriptions WHERE owner_id=? AND subscriber_id=?',user.id,String(id)).run();
  await q(env,'DELETE FROM alert_state WHERE owner_id=? AND recipient_id=?',user.id,String(id)).run();
  await q(env,'DELETE FROM delivery_queue WHERE owner_id=? AND recipient_id=?',user.id,String(id)).run();
  await q(env,`UPDATE notification_events SET status='cancelled',updated_at=?
    WHERE owner_id=? AND recipient_id=? AND status='pending'`,now(),user.id,String(id)).run();
  return json({ok:true});
}
async function removeAccount(env,user){
  await q(env,'DELETE FROM self_reminder_rules WHERE user_id=?',user.id).run();
  await q(env,'UPDATE friend_reminder_rules SET last_resin=NULL WHERE owner_id=?',user.id).run();
  await q(env,'DELETE FROM accounts WHERE user_id=?',user.id).run();
  await q(env,'DELETE FROM alert_state WHERE owner_id=?',user.id).run();
  await q(env,'DELETE FROM delivery_queue WHERE owner_id=?',user.id).run();
  return json({ok:true});
}
async function syncAccount(env,row,ts=now()){
  let note;
  try{
    if(row.tracking_mode==='estimate'){
      const projected=projectedResin(row,ts);
      if(!projected)throw Error('Resin estimate invalid. Enter your amount again in Telegram or Community.');
      note={...projected,full_at:row.full_at,last_sync_at:ts};
    }else{
      const cookie=await decryptCookie(env,row.user_id,row);
      note=await getNotes(cookie,row.genshin_uid,row.region);
    }
  }catch(e){
    await q(env,'UPDATE accounts SET last_error=?,next_sync_at=? WHERE user_id=?',errorMessage(e),ts+15*60*1000,row.user_id).run();
    return false;
  }
  await q(env,`UPDATE accounts SET resin=?,cap=?,full_at=?,last_sync_at=?,last_error=NULL,next_sync_at=? WHERE user_id=?`,
    note.resin,note.cap,note.full_at,note.last_sync_at,ts+(row.tracking_mode==='estimate'?60*1000:5*60*1000),row.user_id).run();
  const audience=[];
  const rawRule=await q(env,'SELECT mode,thresholds,step,last_resin FROM self_reminder_rules WHERE user_id=?',row.user_id).first();
  const customRule=storedRule(rawRule);
  if(row.self_enabled&&!customRule)audience.push({id:row.user_id,threshold:row.self_threshold});
  const followers=await q(env,`SELECT s.subscriber_id,s.threshold,
    fr.mode AS rule_mode,fr.thresholds AS rule_thresholds,fr.step AS rule_step,fr.last_resin
    FROM subscriptions s LEFT JOIN friend_reminder_rules fr
      ON fr.owner_id=s.owner_id AND fr.subscriber_id=s.subscriber_id
    WHERE s.owner_id=? AND s.enabled=1 LIMIT 30`,row.user_id).all();
  const customFriends=[];
  for(const f of followers.results||[]){
    const rule=storedRule(f.rule_mode?{mode:f.rule_mode,thresholds:f.rule_thresholds,step:f.rule_step}:null);
    if(rule)customFriends.push({id:f.subscriber_id,rule,lastResin:f.last_resin});
    else audience.push({id:f.subscriber_id,threshold:f.threshold});
  }
  const current=row.tracking_mode==='estimate'?projectedResin(note,ts):estimatedResin(note,ts);
  if(!current)return true;
  if(customRule){
    // The first sync after saving creates a baseline, not a flood of past reminders.
    const previous=rawRule.last_resin===null?null:Number(rawRule.last_resin);
    const hits=row.self_enabled?thresholdsCrossed(customRule,previous,current.resin,current.cap):[];
    if(hits.length){
      // If many amounts were passed during a sync gap, report only the most recent.
      const threshold=hits[hits.length-1];
      await q(env,`INSERT INTO delivery_queue(owner_id,recipient_id,threshold,resin,cap,created_at,next_attempt_at)
        VALUES(?,?,?,?,?,?,?)`,row.user_id,row.user_id,threshold,current.resin,current.cap,ts,ts).run();
      await deliveryState(env,row.user_id,row.user_id,'resin','queued',null,ts);
    }
    await q(env,'UPDATE self_reminder_rules SET last_resin=? WHERE user_id=?',current.resin,row.user_id).run();
  }
  for(const friend of customFriends){
    // Each approved friend has their own baseline and receives at most one
    // catch-up alert per sync, even if many increments occurred while offline.
    const previous=friend.lastResin===null?null:Number(friend.lastResin);
    const hits=thresholdsCrossed(friend.rule,previous,current.resin,current.cap);
    if(hits.length){
      // Replace older pending messages with the latest threshold so a relay
      // outage cannot create a backlog of noisy notifications to a friend.
      await q(env,'DELETE FROM delivery_queue WHERE owner_id=? AND recipient_id=?',row.user_id,friend.id).run();
      await q(env,`INSERT INTO delivery_queue(owner_id,recipient_id,threshold,resin,cap,created_at,next_attempt_at)
        VALUES(?,?,?,?,?,?,?)`,row.user_id,friend.id,hits[hits.length-1],current.resin,current.cap,ts,ts).run();
      await deliveryState(env,row.user_id,friend.id,'resin','queued',null,ts);
    }
    await q(env,`UPDATE friend_reminder_rules SET last_resin=? WHERE owner_id=? AND subscriber_id=?`,
      current.resin,row.user_id,friend.id).run();
  }
  for(const item of audience){
    const threshold=Number(item.threshold),id=item.id;
    const state=await q(env,'SELECT threshold,armed FROM alert_state WHERE owner_id=? AND recipient_id=?',row.user_id,id).first();
    if(!state||state.threshold!==threshold){
      await q(env,'INSERT INTO alert_state(owner_id,recipient_id,threshold,armed) VALUES(?,?,?,1) ON CONFLICT(owner_id,recipient_id) DO UPDATE SET threshold=excluded.threshold,armed=1',
        row.user_id,id,threshold).run();
      await q(env,'DELETE FROM delivery_queue WHERE owner_id=? AND recipient_id=?',row.user_id,id).run();
    }
    if(current.resin<threshold){
      await q(env,'UPDATE alert_state SET armed=1 WHERE owner_id=? AND recipient_id=?',row.user_id,id).run();
      await q(env,'DELETE FROM delivery_queue WHERE owner_id=? AND recipient_id=?',row.user_id,id).run();
      continue;
    }
    // Transactional claim + enqueue. A notification becomes eligible exactly once per resin crossing.
    const claimed=await q(env,'UPDATE alert_state SET armed=0 WHERE owner_id=? AND recipient_id=? AND threshold=? AND armed=1',
      row.user_id,id,threshold).run();
    if((claimed.meta?.changes||0)===1){
      await q(env,'INSERT INTO delivery_queue(owner_id,recipient_id,threshold,resin,cap,created_at,next_attempt_at) VALUES(?,?,?,?,?,?,?)',
        row.user_id,id,threshold,current.resin,current.cap,ts,ts).run();
      await deliveryState(env,row.user_id,id,'resin','queued',null,ts);
    }
  }
  return true;
}
async function sendQueued(env,ts=now()){
  const items=await q(env,`SELECT d.*,u.name AS owner_name,a.resin AS live_resin,a.cap AS live_cap,
    a.full_at AS live_full_at,a.last_sync_at AS last_sync_at,a.self_enabled,a.self_threshold,a.tracking_mode,
    s.enabled AS follower_enabled,s.threshold AS follower_threshold,
    r.mode AS reminder_mode,r.thresholds AS reminder_thresholds,r.step AS reminder_step,
    fr.mode AS friend_mode,fr.thresholds AS friend_thresholds,fr.step AS friend_step
    FROM delivery_queue d JOIN users u ON u.id=d.owner_id
    LEFT JOIN accounts a ON a.user_id=d.owner_id
    LEFT JOIN subscriptions s ON s.owner_id=d.owner_id AND s.subscriber_id=d.recipient_id
    LEFT JOIN self_reminder_rules r ON r.user_id=d.owner_id
    LEFT JOIN friend_reminder_rules fr ON fr.owner_id=d.owner_id AND fr.subscriber_id=d.recipient_id
    WHERE d.next_attempt_at<=? ORDER BY d.id ASC LIMIT 12`,ts).all();
  let sent=0;
  for(const item of items.results||[]){
    const isSelf=item.owner_id===item.recipient_id;
    const custom=item.reminder_mode?storedRule({mode:item.reminder_mode,thresholds:item.reminder_thresholds,step:item.reminder_step}):null;
    const friendCustom=item.friend_mode?storedRule({mode:item.friend_mode,thresholds:item.friend_thresholds,step:item.friend_step}):null;
    const allowed=isSelf?item.self_enabled===1&&(item.reminder_mode?isRuleThreshold(custom,item.threshold,item.live_cap):item.self_threshold===item.threshold):
      item.follower_enabled===1&&(item.friend_mode?isRuleThreshold(friendCustom,item.threshold,item.live_cap):item.follower_threshold===item.threshold);
    const actual=(item.tracking_mode==='estimate'?projectedResin:estimatedResin)
      ({resin:item.live_resin,cap:item.live_cap,full_at:item.live_full_at,last_sync_at:item.last_sync_at},ts);
    if(!allowed||actual&&actual.resin<item.threshold){
      await q(env,'DELETE FROM delivery_queue WHERE id=?',item.id).run();continue;
    }
    if(!actual){
      await q(env,'DELETE FROM delivery_queue WHERE id=?',item.id).run();
      await deliveryState(env,item.owner_id,item.recipient_id,'resin','expired','Resin data is stale; no unverified alert was sent.',ts);
      continue;
    }
    if(ts-item.created_at>90*60*1000){
      await q(env,'DELETE FROM delivery_queue WHERE id=?',item.id).run();
      await deliveryState(env,item.owner_id,item.recipient_id,'resin','expired','Telegram delivery did not recover within 90 minutes.',ts);
      continue;
    }
    // User-controlled local quiet hours: suppress resin messages rather than
    // sending an obsolete backlog when quiet hours end.
    const quiet=await quietPreference(env,item.recipient_id);
    if(inQuietHours(quiet,ts)){
      await q(env,'DELETE FROM delivery_queue WHERE id=?',item.id).run();
      await deliveryState(env,item.owner_id,item.recipient_id,'resin','blocked','Muted by recipient quiet hours.',ts);
      continue;
    }
    try{
      await telegram(env,'sendMessage',{
        chat_id:item.recipient_id,
        text:'⏳ Istaroth · '+safeString(item.owner_name,45)+' has '+actual.resin+'/'+actual.cap+
          ' Original Resin'+(actual.resin>=actual.cap?' (full)':'')+'.\n'+
          (item.tracking_mode==='estimate'?'Estimated from the last manually entered resin. Update with /resin AMOUNT after spending.':'Based on fresh HoYoLAB notes.')+
          ' Send /stop to unsubscribe.',
        disable_web_page_preview:true
      });
      await q(env,'DELETE FROM delivery_queue WHERE id=?',item.id).run();
      await deliveryState(env,item.owner_id,item.recipient_id,'resin','sent',null,ts);sent++;
    }catch(e){
      const reason=deliveryError(e);
      await q(env,'UPDATE delivery_queue SET attempts=attempts+1,next_attempt_at=? WHERE id=?',
        ts+retryDelay(item.attempts+1),item.id).run();
      await deliveryState(env,item.owner_id,item.recipient_id,'resin','retrying',reason,ts);
    }
  }
  return sent;
}
async function scheduled(env){
  if(configuration(env))return;
  const ts=now();
  // Always process the oldest due accounts first; no one account can monopolize the free tier.
  // HoYoLAB requests are network-bound; keep their per-cron batch small.
  // Phone-only estimates are local computations and can run in a larger batch.
  for(const [mode,limit] of [['hoyolab',4],['estimate',30]]){
    const due=await q(env,`SELECT user_id,genshin_uid,region,credential_iv,credential_ciphertext,
      self_enabled,self_threshold,resin,cap,full_at,last_sync_at,tracking_mode
      FROM accounts WHERE next_sync_at<=? AND tracking_mode=? ORDER BY next_sync_at ASC LIMIT `+limit,ts,mode).all();
    for(const a of due.results||[])await syncAccount(env,a,ts);
  }
  await sendQueued(env,ts);
  await sendApprovalEvents(env,ts);
  // Best-effort removal of abandoned authentication and expired notification rows.
  if(new Date(ts).getUTCMinutes()===0){
    await q(env,'DELETE FROM logins WHERE expires_at<?',ts).run();
    await q(env,'DELETE FROM sessions WHERE expires_at<?',ts).run();
    await q(env,'DELETE FROM rate_limits WHERE window_start<?',ts-24*3600*1000).run();
    await q(env,'DELETE FROM desktop_pairings WHERE expires_at<?',ts).run();
    await q(env,'DELETE FROM delivery_queue WHERE created_at<?',ts-2*3600*1000).run();
    await q(env,`UPDATE notification_events SET status='expired',last_error='Delivery window expired.',updated_at=?
      WHERE status='pending' AND created_at<?`,ts,ts-24*3600*1000).run();
    await q(env,`DELETE FROM notification_events WHERE created_at<?`,ts-14*24*3600*1000).run();
  }
}
async function webhook(request,env){
  if(!secureEqual(request.headers.get('x-telegram-bot-api-secret-token')||'',env.WEBHOOK_SECRET))return err('Unauthorized',401);
  const data=await bodyJson(request),m=data?.message;
  if(m?.chat?.type!=='private'||!isTelegramId(m.chat.id))return json({ok:true});
  const id=String(m.chat.id),input=String(m.text||'').trim().slice(0,130);
  const first=input.split(/\s+/)[0].split('@')[0];
  const name=safeString([m.from?.first_name,m.from?.last_name].filter(Boolean).join(' ')||m.from?.username||'Traveler',55);
  const username=safeString(m.from?.username,40);
  if(first==='/start'&&input.split(/\s+/)[1]?.startsWith('login_')){
    const ticket=input.split(/\s+/)[1].slice(6);
    if(!/^[A-Za-z0-9_-]{24}$/.test(ticket))return json({ok:true});
    const login=await q(env,'SELECT telegram_id,expires_at FROM logins WHERE token_hash=?',hash(ticket)).first();
    if(!login||login.telegram_id||login.expires_at<now())return json({ok:true});
    await ensureUser(env,id,name,username);
    const code=String(randomInt(0,1_000_000)).padStart(6,'0');
    const changed=await q(env,'UPDATE logins SET telegram_id=?,code_hash=? WHERE token_hash=? AND telegram_id IS NULL AND expires_at>?',
      id,hash(ticket+'|'+code),hash(ticket),now()).run();
    if(changed.meta?.changes)return webhookReply(id,'🔐 Istaroth sign-in code: '+code+'\nEnter this code in the Istaroth app. Expires in 10 minutes.\nOnly use this if you just started signing in yourself.');
    return json({ok:true});
  }
  if(first==='/start'&&input.split(/\s+/)[1]?.startsWith('follow_')){
    const code=input.split(/\s+/)[1].slice(7);
    if(!/^[A-Za-z0-9_-]{24}$/.test(code))return json({ok:true});
    const owner=await q(env,'SELECT id,name FROM users WHERE invite_code=?',code).first();
    if(!owner||owner.id===id)return json({ok:true});
    const count=await q(env,'SELECT COUNT(*) AS total FROM subscriptions WHERE owner_id=?',owner.id).first();
    const existing=await q(env,'SELECT owner_id FROM subscriptions WHERE owner_id=? AND subscriber_id=?',owner.id,id).first();
    if(!existing&&+count.total>=30){
      return webhookReply(id,'This Istaroth friend list is full.');
    }
    await ensureUser(env,id,name,username);
    await q(env,'INSERT OR IGNORE INTO subscriptions(owner_id,subscriber_id,enabled,threshold,joined_at) VALUES(?,?,0,180,?)',
      owner.id,id,now()).run();
    return webhookReply(id,'✅ You subscribed to '+safeString(owner.name)+'. Notifications start only after they approve you. Send /stop to unsubscribe anytime.');
  }
  if(first==='/resin'){
    const raw=input.split(/\s+/)[1];
    if(!raw||!/^(?:[0-9]|[1-9][0-9]|1[0-9][0-9]|200)$/.test(raw))
      return webhookReply(id,'To track resin without a PC, send /resin 75 (replace 75 with your current 0-200 resin). Repeat after spending. This is an estimate, not live HoYoLAB sync.');
    await ensureUser(env,id,name,username);
    try{
      const value=await setEstimatedResin(env,id,Number(raw));
      return webhookReply(id,'Resin estimate set to '+value.resin+'/200. Cloud tracking runs without a PC. Telegram alerts require a working cloud delivery route. Update after spending with /resin AMOUNT.');
    }catch(e){return webhookReply(id,errorMessage(e));}
  }
  if(first==='/remind'){
    const account=await q(env,'SELECT resin,cap,full_at,last_sync_at,tracking_mode FROM accounts WHERE user_id=?',id).first();
    if(!account)return webhookReply(id,'Start by sending /resin 75 with your current Genshin resin, or connect HoYoLAB on the website.');
    const raw=input.slice(first.length).trim().toLowerCase();
    if(raw==='off'){
      await q(env,'UPDATE accounts SET self_enabled=0 WHERE user_id=?',id).run();
      await q(env,'DELETE FROM delivery_queue WHERE owner_id=? AND recipient_id=?',id,id).run();
      return webhookReply(id,'Your own resin reminders are off. Send /remind 80 to turn them back on at 80 resin.');
    }
    let rule;
    try{
      if(raw.startsWith('every '))rule=parseReminderInput({mode:'every',step:Number(raw.slice(6).trim())});
      else if(raw.includes(','))rule=parseReminderInput({mode:'multiple',thresholds:raw.split(',').map(v=>Number(v.trim()))});
      else rule=parseReminderInput({mode:'single',threshold:Number(raw)});
    }catch{return webhookReply(id,'Examples: /remind 80, /remind 20,40,80, /remind every 10, /remind off. Amounts must be within 1–200.');}
    if(rule.mode!=='every'&&rule.thresholds.some(n=>n>Number(account.cap||200)))
      return webhookReply(id,'Reminder amount exceeds your resin capacity.');
    const current=(account.tracking_mode==='estimate'?projectedResin:estimatedResin)(account)?.resin??null;
    await q(env,`INSERT INTO self_reminder_rules(user_id,mode,thresholds,step,last_resin,updated_at)
       VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
       mode=excluded.mode,thresholds=excluded.thresholds,step=excluded.step,
       last_resin=excluded.last_resin,updated_at=excluded.updated_at`,
       id,rule.mode,JSON.stringify(rule.thresholds),rule.step,current,now()).run();
    await q(env,'UPDATE accounts SET self_enabled=1 WHERE user_id=?',id).run();
    await q(env,'DELETE FROM alert_state WHERE owner_id=? AND recipient_id=?',id,id).run();
    await q(env,'DELETE FROM delivery_queue WHERE owner_id=? AND recipient_id=?',id,id).run();
    const display=rule.mode==='every'?'every '+rule.step:rule.thresholds.join(', ');
    return webhookReply(id,'Resin reminder saved: '+display+'. The cloud checks for future increases. This is '+
      (account.tracking_mode==='estimate'?'an estimate, not live data. Update with /resin AMOUNT after spending.':'based on HoYoLAB data.')+
      ' Telegram delivery must be working for scheduled alerts.');
  }
  if(first==='/stop'){
    await q(env,'DELETE FROM subscriptions WHERE subscriber_id=?',id).run();
    await q(env,'UPDATE accounts SET self_enabled=0 WHERE user_id=?',id).run();
    await q(env,'DELETE FROM delivery_queue WHERE recipient_id=?',id).run();
    await q(env,`UPDATE notification_events SET status='cancelled',updated_at=? WHERE recipient_id=? AND status='pending'`,now(),id).run();
    return webhookReply(id,'Notifications stopped. You can turn your own alerts back on inside Istaroth.');
  }else if(first==='/help'||first==='/start'){
    return webhookReply(id,'Istaroth Community: Open the website to sign in. No PC? Start estimated resin reminders with /resin 75 (replace with your current amount). Update after spending. Set alerts with /remind 80 or /remind every 10. /status shows tracking. /stop disables alerts.');
  }else if(first==='/status'){
    const row=await q(env,'SELECT COUNT(*) AS total FROM subscriptions WHERE subscriber_id=? AND enabled=1',id).first();
    const a=await q(env,'SELECT self_enabled,resin,cap,full_at,last_sync_at,tracking_mode FROM accounts WHERE user_id=?',id).first();
    const projection=a?(a.tracking_mode==='estimate'?projectedResin(a):estimatedResin(a)):null;
    const resinInfo=projection?' Resin '+projection.resin+'/'+projection.cap+(a.tracking_mode==='estimate'?' (estimate).':' (HoYoLAB).'):'';
    return webhookReply(id,'Istaroth: '+(a?.self_enabled?'Your resin alerts are enabled. ':'Your own resin alerts are off. ')+
      (+row.total)+' friend subscriptions enabled.'+resinInfo+' /resin AMOUNT updates estimates. /stop disables alerts.');
  }
  return json({ok:true});
}
async function route(request,env){
  const url=new URL(request.url),route=url.pathname;
  if(route==='/health'&&request.method==='GET')return json({service:'Istaroth Community',online:true});
  if(route==='/'&&request.method==='GET')return env.ASSETS.fetch(request);
  if(route==='/telegram'&&request.method==='POST')return webhook(request,env);
  if(!route.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(configuration(env))return err(configuration(env),503);
  // Extension background scripts have their own origin. Allow them ONLY on
  // high-entropy, one-time-code pairing endpoints. Ordinary website requests
  // and all authenticated routes retain same-origin protections.
  const extensionPair=['/api/link/preview','/api/link/complete'].includes(route)&&request.method==='POST';
  const origin=request.headers.get('Origin')||'';
  const isExtension=/^(?:chrome|moz)-extension:\/\/[a-zA-Z0-9-]{10,128}$/.test(origin);
  if(request.method!=='GET'&&!sameOrigin(request)&&!(extensionPair&&isExtension))
    return err('Invalid request origin.',403);
  if(route==='/api/public'&&request.method==='GET')return json({botUsername:env.BOT_USERNAME,app:'Istaroth Community',installed:true});
  if(route==='/api/auth/start'&&request.method==='POST')return authBegin(request,env);
  if(route==='/api/auth/complete'&&request.method==='POST')return authComplete(request,env);
  if(route==='/api/link/check'&&request.method==='POST')return checkPairing(request,env);
  if(route==='/api/link/claim'&&request.method==='POST')return claimPairing(request,env);
  if(route==='/api/link/preview'&&request.method==='POST')return previewPairing(request,env);
  if(route==='/api/link/complete'&&request.method==='POST')return finishPairing(request,env);
  // Stage-specific, credential-free diagnostics. Authentication is mandatory; never
  // include the BotFather token, Telegram URL, or setup key in the response.
  if(request.method==='POST'&&(route==='/api/admin/webhook'||route==='/api/admin/telegram-check')){
    if(!secureEqual(request.headers.get('x-setup-key')||'',env.ADMIN_SETUP_KEY))return err('Unauthorized.',401);
    let info;
    try{info=await telegram(env,'getMe',{});}
    catch(e){return json({ok:false,stage:'getMe',error:errorMessage(e)},502);}
    if(!info?.is_bot||info.username?.toLowerCase()!==env.BOT_USERNAME.toLowerCase())
      return json({ok:false,stage:'getMe',error:'Bot username does not match configuration.'},400);
    if(route==='/api/admin/telegram-check')return json({ok:true,stage:'getMe',bot:info.username});
    try{await telegram(env,'setWebhook',{
      url:url.origin+'/telegram',secret_token:env.WEBHOOK_SECRET,
      allowed_updates:['message'],drop_pending_updates:false
    });}
    catch(e){return json({ok:false,stage:'setWebhook',error:errorMessage(e)},502);}
    return json({ok:true,stage:'setWebhook',bot:info.username});
  }
  const user=await authenticate(request,env);
  if(!user)return err('Please sign in again.',401);
  if(route==='/api/me'&&request.method==='GET')return json(await me(env,user));
  if(route==='/api/notifications/status'&&request.method==='GET')return notificationStatus(env,user);
  if(route==='/api/notifications/quiet-hours'&&request.method==='POST')return setQuietPreference(request,env,user);
  if(route==='/api/link/start'&&request.method==='POST')return beginPairing(request,env,user);
  if(route==='/api/link/status'&&request.method==='GET')return pairingStatus(env,user);
  if(route==='/api/auth/logout-all'&&request.method==='POST'){
    await q(env,'DELETE FROM sessions WHERE user_id=?',user.id).run();
    return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
  }
  if(route==='/api/auth/logout'&&request.method==='POST'){
    const raw=parseSession(request);if(raw)await q(env,'DELETE FROM sessions WHERE token_hash=?',hash(raw)).run();
    return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
  }
  if(route==='/api/account/preview'&&request.method==='POST')return previewAccount(request,env,user);
  if(route==='/api/account/connect'&&request.method==='POST')return connectAccount(request,env,user);
  if(route==='/api/account/estimate'&&request.method==='POST')return setEstimateFromWeb(request,env,user);
  if(route==='/api/account/preferences'&&request.method==='POST')return updatePreferences(request,env,user);
  if(route==='/api/notifications/test'&&request.method==='POST'){
    try{
      await telegram(env,'sendMessage',{chat_id:user.id,text:'Istaroth test alert: your cloud can send Telegram notifications while Windows is closed.'});
      await deliveryState(env,user.id,user.id,'test','sent');return json({ok:true});
    }catch(e){
      const reason=deliveryError(e);
      await deliveryState(env,user.id,user.id,'test','blocked',reason);
      return json({ok:false,error:'Telegram delivery failed: '+reason+' Configure the private relay to restore notifications.'},502);
    }
  }
  if(route==='/api/account/remove'&&request.method==='POST'){await q(env,'DELETE FROM desktop_pairings WHERE user_id=?',user.id).run();return removeAccount(env,user);}
  if(route==='/api/friends/update'&&request.method==='POST')return updateFriend(request,env,user);
  if(route==='/api/friends/notify'&&request.method==='POST')return notifyFriend(request,env,user);
  if(route==='/api/friends/remove'&&request.method==='POST')return removeFriend(request,env,user);
  if(route==='/api/invite/rotate'&&request.method==='POST'){
    const invite=token(18);await q(env,'UPDATE users SET invite_code=? WHERE id=?',invite,user.id).run();
    return json({ok:true,inviteLink:botLink(env,'follow_'+invite)});
  }
  if(route==='/api/account/sync'&&request.method==='POST'){
    const a=await q(env,'SELECT user_id,genshin_uid,region,credential_iv,credential_ciphertext,self_enabled,self_threshold,last_sync_at FROM accounts WHERE user_id=?',user.id).first();
    if(!a)return err('Connect Genshin first.');
    const mode=await q(env,'SELECT tracking_mode FROM accounts WHERE user_id=?',user.id).first();
    if(mode?.tracking_mode==='estimate')return err('Estimated resin updates automatically. Enter your current amount after spending.',400);
    if(a.last_sync_at&&now()-a.last_sync_at<3*60*1000)return err('Syncs are limited to every three minutes.',429);
    const ok=await syncAccount(env,a,now());
    if(!ok)return err('HoYoLAB sync failed. Check your account or refresh the session.',502);
    return json({ok:true});
  }
  if(route==='/api/account/delete-all'&&request.method==='POST'){
    const data=await bodyJson(request);
    if(data.confirm!=='DELETE')return err('Type DELETE to confirm.',400);
    await q(env,'DELETE FROM delivery_queue WHERE owner_id=? OR recipient_id=?',user.id,user.id).run();
    await q(env,'DELETE FROM alert_state WHERE owner_id=? OR recipient_id=?',user.id,user.id).run();
    await q(env,'DELETE FROM notification_events WHERE owner_id=? OR recipient_id=?',user.id,user.id).run();
    await q(env,'DELETE FROM notification_delivery_state WHERE owner_id=? OR recipient_id=?',user.id,user.id).run();
    await q(env,'DELETE FROM users WHERE id=?',user.id).run();
    return json({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
  }
  return err('Route not found.',404);
}
export default {
  async fetch(request,env){
    try{return await route(request,env);}
    catch(e){
      if(e instanceof SyntaxError)return err('Invalid JSON.',400);
      // Never return or log credentials, tokens, stack traces, Telegram URLs or raw requests.
      return err(errorMessage(e),502);
    }
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(scheduled(env).catch(()=>{}));}
};
export {route,authBegin,authComplete,beginPairing,pairingStatus,finishPairing,claimPairing,webhook,syncAccount,setEstimatedResin,sendQueued,sendApprovalEvents,notificationStatus,scheduled,configuration,inQuietHours};
