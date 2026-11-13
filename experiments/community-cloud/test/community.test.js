import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import worker,{syncAccount,sendQueued,sendApprovalEvents,configuration} from '../src/worker.js';
import {validCookie,estimatedResin,encryptCookie,decryptCookie,secureEqual,hash,getRoles,getNotes,sameOrigin} from '../src/lib.js';

class D1{
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(fs.readFileSync(new URL('../db/0001_initial.sql',import.meta.url),'utf8'));this.db.exec(fs.readFileSync(new URL('../db/0002_desktop_pairings.sql',import.meta.url),'utf8'));this.db.exec(fs.readFileSync(new URL('../db/0003_custom_resin_reminders.sql',import.meta.url),'utf8'));this.db.exec(fs.readFileSync(new URL('../db/0004_friend_resin_rules.sql',import.meta.url),'utf8'));this.db.exec(fs.readFileSync(new URL('../db/0005_notification_delivery.sql',import.meta.url),'utf8'));this.db.exec(fs.readFileSync(new URL('../db/0006_phone_estimates.sql',import.meta.url),'utf8'));this.db.exec(fs.readFileSync(new URL('../db/0007_notification_quiet_hours.sql',import.meta.url),'utf8'));this.db.exec(fs.readFileSync(new URL('../db/0008_gateway_claim.sql',import.meta.url),'utf8'));}
  prepare(sql){
    const stmt=this.db.prepare(sql);let args=[];
    return {bind(...values){args=values;return this;},
      async first(){return stmt.get(...args)||null;},
      async all(){return {results:stmt.all(...args)};},
      async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes||0)}};}
    };
  }
}
function env(){
  return {
    DB:new D1(),BOT_TOKEN:'1234567:abcdefghijklmnopqrstuvwxyzABCDE1234',
    BOT_USERNAME:'IstarothTestBot',WEBHOOK_SECRET:'webhook_secret_for_tests_abcdefghijklmnopqrstuvwxyz',
    DATA_KEY:randomBytes(32).toString('base64url'),ADMIN_SETUP_KEY:'admin_test_only_abcdefghijklmnopqrstuvwxyz12345678',
    ASSETS:{fetch:async()=>new Response('static shell')}
  };
}
const cookie='ltuid_v2=123456; ltoken_v2=this_is_a_test_secret_123456';
function harness(){
  let resin=180;
  const telegramMessages=[];
  const calls=[];
  let telegramAvailable=true;
  const original=globalThis.fetch;
  globalThis.fetch=async(url,opts={})=>{
    calls.push({url:String(url),opts});
    if(String(url).startsWith('https://api.telegram.org/')){
      if(!telegramAvailable)throw Error('Simulated Telegram network connection failed');
      const method=String(url).split('/').pop();
      const payload=JSON.parse(opts.body||'{}');
      if(method==='sendMessage')telegramMessages.push(payload);
      if(method==='getMe')return new Response(JSON.stringify({ok:true,result:{is_bot:true,username:'IstarothTestBot'}}),{status:200});
      return new Response(JSON.stringify({ok:true,result:{message_id:44}}),{status:200});
    }
    if(String(url).includes('getUserGameRolesByCookie')){
      assert.equal(opts.headers.Cookie,cookie);
      return new Response(JSON.stringify({retcode:0,data:{list:[
        {game_uid:'800123456',region:'os_asia',nickname:'Cloud Traveler'},
        {game_uid:'600321321',region:'os_usa',nickname:'Other Game Role'}
      ]}}),{status:200});
    }
    if(String(url).includes('dailyNote')){
      assert.equal(opts.headers.Cookie,cookie);
      return new Response(JSON.stringify({retcode:0,data:{current_resin:resin,max_resin:200,resin_recovery_time:(200-resin)*480}}),{status:200});
    }
    throw Error('Test caught an unexpected network request: '+String(url));
  };
  return {messages:telegramMessages,calls,setResin:n=>resin=n,setTelegramAvailable:val=>telegramAvailable=val,restore(){globalThis.fetch=original;}};
}
function request(path,method='GET',payload,headers={}){
  return new Request('https://istaroth-test.workers.dev'+path,{
    method,headers:{...(payload?{'content-type':'application/json'}:{}),...headers},
    ...(payload?{body:JSON.stringify(payload)}:{})
  });
}
function webhook(envv,id,message){return worker.fetch(request('/telegram','POST',{message:{chat:{id,type:'private'},from:{id,first_name:'User '+id,username:'Traveler_'+id},text:message}},
  {'x-telegram-bot-api-secret-token':envv.WEBHOOK_SECRET}),envv);}
function sessionHeaders(session){return {cookie:'istaroth_session='+session};}
async function signIn(envv,harnessValue,id){
  const start=await worker.fetch(request('/api/auth/start','POST',{}),envv);
  assert.equal(start.status,200);
  const {ticket}=await start.json();
  const botResponse=await webhook(envv,id,'/start login_'+ticket);assert.equal(botResponse.status,200);
  const reply=await botResponse.json();
  assert.equal(reply.method,'sendMessage','Telegram code is sent using the webhook response');
  const msg=reply.text;
  const code=msg.match(/code:\s*(\d{6})/)[1];
  const complete=await worker.fetch(request('/api/auth/complete','POST',{ticket,code}),envv);
  assert.equal(complete.status,200);
  const header=complete.headers.get('set-cookie');
  assert.match(header,/HttpOnly; Secure; SameSite=Strict/);
  return header.match(/istaroth_session=([A-Za-z0-9_-]{40,100})/)[1];
}
test('credential handling: encrypted with user-specific authenticated data',async()=>{
  const e=env();assert.ok(validCookie(cookie));
  assert.ok(!validCookie(cookie+'\r\nInjection: yes'));
  const cipher=await encryptCookie(e,'12345',cookie);
  assert.ok(!cipher.ciphertext.includes('ltoken'));
  assert.equal(await decryptCookie(e,'12345',{credential_ciphertext:cipher.ciphertext,credential_iv:cipher.iv}),cookie);
  await assert.rejects(decryptCookie(e,'98765',{credential_ciphertext:cipher.ciphertext,credential_iv:cipher.iv}));
  assert.equal(secureEqual('ab','ab'),true);
  assert.equal(secureEqual('ab','abc'),false);
});
test('resin counts do not use readings older than 30 minutes',()=>{
  const ts=Date.now();
  const row={resin:180,cap:200,full_at:ts+20*480000,last_sync_at:ts};
  assert.equal(estimatedResin(row,ts).resin,180);
  assert.equal(estimatedResin(row,ts+480000).resin,181);
  assert.equal(estimatedResin(row,ts+31*60000),null);
});
test('multi-user workflow: login -> private account -> follow -> approval -> resin -> unsubscribe',async()=>{
  const f=harness();const e=env();
  try{
    assert.equal(configuration(e),'');
    assert.equal((await worker.fetch(request('/telegram','POST',{message:{chat:{id:1,type:'private'},text:'/start'}}),e)).status,401);
    const probe=await worker.fetch(request('/api/admin/telegram-check','POST',{}, {'x-setup-key':e.ADMIN_SETUP_KEY}),e);
    assert.equal(probe.status,200);
    assert.equal((await probe.json()).stage,'getMe');
    const admin=await worker.fetch(request('/api/admin/webhook','POST',{}, {'x-setup-key':e.ADMIN_SETUP_KEY}),e);
    assert.equal(admin.status,200);
    const ownerToken=await signIn(e,f,'111111');
    const followerToken=await signIn(e,f,'222222');
    const owner=sessionHeaders(ownerToken),follower=sessionHeaders(followerToken);
    const bad=await worker.fetch(request('/api/account/connect','POST',{
      uid:'999999999',region:'os_asia',cookie},owner),e);
    assert.equal(bad.status,403,'Accounts must validate UID ownership');
    const connected=await worker.fetch(request('/api/account/connect','POST',{
      uid:'800123456',region:'os_asia',cookie},owner),e);
    assert.equal(connected.status,200);
    const disk=e.DB.db.prepare('SELECT credential_ciphertext,credential_iv FROM accounts WHERE user_id=?').get('111111');
    assert.ok(!disk.credential_ciphertext.includes('ltoken_v2'));
    assert.ok(disk.credential_iv);
    const ownerMe=await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json();
    const followerMe=await (await worker.fetch(request('/api/me','GET',undefined,follower),e)).json();
    assert.equal(ownerMe.account.uid,'800123456');
    assert.equal(followerMe.account,null,'Another session cannot read owner account');
    const invite=ownerMe.inviteLink.split('start=')[1];
    assert.equal((await webhook(e,'222222','/start '+invite)).status,200);
    const subscribersBefore=await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json();
    assert.equal(subscribersBefore.followers.length,1);
    assert.equal(subscribersBefore.followers[0].enabled,false,'Opt-in starts paused');
    const foreign=await worker.fetch(request('/api/friends/update','POST',{id:'222222',enabled:true,threshold:180},follower),e);
    assert.equal(foreign.status,404,'Followers cannot approve themselves');
    const approval=await worker.fetch(request('/api/friends/update','POST',{id:'222222',enabled:true,threshold:180},owner),e);
    assert.equal(approval.status,200);
    let note=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('111111');
    await syncAccount(e,note);
    assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS c FROM delivery_queue').get().c,2,'Self + approved friend queued');
    let numBefore=f.messages.length;
    await sendQueued(e);
    assert.equal(f.messages.length-numBefore,2,'Two delivered resin messages');
    assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS c FROM delivery_queue').get().c,0);
    note=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('111111');
    await syncAccount(e,note);
    assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS c FROM delivery_queue').get().c,0,'Threshold is deduplicated');
    f.setResin(100);
    note=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('111111');
    await syncAccount(e,note);
    f.setResin(180);
    note=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('111111');
    await syncAccount(e,note);
    assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS c FROM delivery_queue').get().c,2,'Crossing after spending rearms alerts');
    const unsub=await webhook(e,'222222','/stop');assert.equal(unsub.status,200);
    assert.equal((await unsub.json()).method,'sendMessage');
    assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS c FROM delivery_queue WHERE recipient_id=?').get('222222').c,0);
    numBefore=f.messages.length;
    await sendQueued(e);
    assert.equal(f.messages.length-numBefore,1,'Unsubscribed friend receives no queued alert');
    const logout=await worker.fetch(request('/api/auth/logout','POST',{},owner),e);assert.equal(logout.status,200);
    const after=await worker.fetch(request('/api/me','GET',undefined,owner),e);assert.equal(after.status,401);
  }finally{f.restore();}
});
test('request origin restriction prevents cross-site write requests',()=>{
  assert.equal(sameOrigin(request('/api/account/remove','POST',{}, {Origin:'https://evil.example'})),false);
  assert.equal(sameOrigin(request('/api/account/remove','POST',{}, {Origin:'https://istaroth-test.workers.dev'})),true);
});
test('public health endpoint has no credentials or account data',async()=>{
  const e=env();const res=await worker.fetch(request('/health'),e);
  const data=await res.json();assert.equal(data.online,true);
  assert.ok(!JSON.stringify(data).includes(e.BOT_TOKEN));
});

test('admin probe reports safe stage when outbound Telegram access fails',async()=>{
  const f=harness();const e=env();
  try{
    globalThis.fetch=async (url)=>{
      if(String(url).startsWith('https://api.telegram.org/'))throw Error('private token leaked? '+e.BOT_TOKEN);
      throw Error('Unexpected');
    };
    const check=await worker.fetch(request('/api/admin/telegram-check','POST',{}, {'x-setup-key':e.ADMIN_SETUP_KEY}),e);
    assert.equal(check.status,502);
    const result=await check.json();
    assert.deepEqual(result,{ok:false,stage:'getMe',error:'Telegram getMe network connection failed.'});
    assert.ok(!JSON.stringify(result).includes(e.BOT_TOKEN));
    const refused=await worker.fetch(request('/api/admin/telegram-check','POST',{}, {'x-setup-key':'incorrect-secret'}),e);
    assert.equal(refused.status,401);
  }finally{f.restore();}
});
test('webhook reports setWebhook failure separately from getMe, without leaking credentials',async()=>{
  const f=harness();const e=env();
  try{
    globalThis.fetch=async(url)=>{
      if(String(url).endsWith('/getMe'))return new Response(JSON.stringify({ok:true,result:{is_bot:true,username:e.BOT_USERNAME}}),{status:200});
      if(String(url).endsWith('/setWebhook'))return new Response(JSON.stringify({ok:false,description:'private '+e.BOT_TOKEN}),{status:400});
      throw Error('Unexpected call');
    };
    const result=await worker.fetch(request('/api/admin/webhook','POST',{}, {'x-setup-key':e.ADMIN_SETUP_KEY}),e);
    assert.equal(result.status,502);
    const diagnostic=await result.json();
    assert.equal(diagnostic.stage,'setWebhook');
    assert.equal(diagnostic.error,'Telegram setWebhook returned HTTP 400');
    assert.ok(!JSON.stringify(diagnostic).includes(e.BOT_TOKEN));
  }finally{f.restore();}
});

test('consent-based Windows desktop pairing: authenticated owner, one-time proof, encrypted credential, replay denied',async()=>{
 const net=harness(),e=env();
 try{
  const owner=sessionHeaders(await signIn(e,net,'414141'));
  const other=sessionHeaders(await signIn(e,net,'424242'));
  const unauth=await worker.fetch(request('/api/link/start','POST',{}),e);
  assert.equal(unauth.status,401);
  const pair=await (await worker.fetch(request('/api/link/start','POST',{},owner),e)).json();
  assert.match(pair.code,/^[A-Za-z0-9_-]{24}$/);
  assert.ok(pair.expiresAt>Date.now());
  let status=await (await worker.fetch(request('/api/link/status','GET',undefined,owner),e)).json();
  assert.equal(status.pending,true);
  const bad=await worker.fetch(request('/api/link/complete','POST',{code:pair.code,uid:'999999999',region:'os_asia',cookie}),e);
  assert.equal(bad.status,403,'Owner UID must be verified against their HoYoLAB session');
  const consumed=await worker.fetch(request('/api/link/complete','POST',{code:pair.code,uid:'800123456',region:'os_asia',cookie}),e);
  assert.equal(consumed.status,400,'Invalid attempted connection consumes the pairing code');
  const second=await (await worker.fetch(request('/api/link/start','POST',{},owner),e)).json();
  const wrong=await worker.fetch(request('/api/link/complete','POST',{code:'a'.repeat(24),uid:'800123456',region:'os_asia',cookie}),e);
  assert.equal(wrong.status,400);
  const linked=await worker.fetch(request('/api/link/complete','POST',{code:second.code,uid:'800123456',region:'os_asia',cookie}),e);
  assert.equal(linked.status,200);const answer=await linked.json();assert.equal(answer.account.uid,'800123456');
  const replay=await worker.fetch(request('/api/link/complete','POST',{code:second.code,uid:'800123456',region:'os_asia',cookie}),e);
  assert.equal(replay.status,400,'Pairing code is single-use');
  const ownerData=await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json();
  const otherData=await (await worker.fetch(request('/api/me','GET',undefined,other),e)).json();
  assert.equal(ownerData.account.uid,'800123456');assert.equal(otherData.account,null);
  status=await (await worker.fetch(request('/api/link/status','GET',undefined,owner),e)).json();
  assert.equal(status.linked,true);assert.equal(status.pending,false);
  const stored=e.DB.db.prepare('SELECT credential_ciphertext FROM accounts WHERE user_id=?').get('414141');
  assert.ok(stored.credential_ciphertext);assert.ok(!stored.credential_ciphertext.includes('ltoken_v2'));
  const foreignOrigin=await worker.fetch(request('/api/link/complete','POST',{code:second.code,uid:'800123456',region:'os_asia',cookie},{Origin:'https://attacker.example'}),e);
  assert.equal(foreignOrigin.status,403,'Desktop handoff must come from same HTTPS origin');
 }finally{net.restore();}
});
test('relay uses a private auth header and never transmits the BotFather token to the relay',async()=>{
 const {telegram}=await import('../src/lib.js');const e=env();e.TELEGRAM_RELAY_URL='https://private.example.org';e.TELEGRAM_RELAY_KEY='only-for-tests-really-long-private-key-12345';
 const requests=[];
 const fetcher=async(url,opts)=>{requests.push([url,opts]);return new Response(JSON.stringify({ok:true,result:{message_id:99}}),{status:200});};
 const result=await telegram(e,'sendMessage',{chat_id:'111111',text:'Test'},fetcher);
 assert.equal(result.message_id,99);assert.equal(requests.length,1);
 assert.equal(requests[0][0],'https://private.example.org/send');
 assert.equal(requests[0][1].headers.Authorization,'Bearer '+e.TELEGRAM_RELAY_KEY);
 assert.ok(!JSON.stringify(requests).includes(e.BOT_TOKEN));
});

test('custom reminders accept all individual amounts, arbitrary lists, and every resin step', async()=>{
  const {parseReminderInput,thresholdsCrossed,isRuleThreshold,storedRule}=await import('../src/reminders.js');
  assert.deepEqual(parseReminderInput({mode:'single',threshold:1}),{mode:'single',thresholds:[1],step:0});
  assert.deepEqual(parseReminderInput({mode:'single',threshold:200}),{mode:'single',thresholds:[200],step:0});
  assert.deepEqual(parseReminderInput({mode:'multiple',thresholds:[200,40,40,15]}).thresholds,[15,40,200]);
  assert.deepEqual(thresholdsCrossed(parseReminderInput({mode:'every',step:1}),9,12,200),[10,11,12]);
  assert.deepEqual(thresholdsCrossed(parseReminderInput({mode:'every',step:40}),190,200,200),[200]);
  assert.deepEqual(thresholdsCrossed(parseReminderInput({mode:'single',threshold:13}),12,13,200),[13]);
  assert.deepEqual(thresholdsCrossed(parseReminderInput({mode:'multiple',thresholds:[12,35,85]}),12,36,200),[35]);
  assert.deepEqual(thresholdsCrossed(parseReminderInput({mode:'every',step:5}),13,10,200),[],'Spending never triggers notification');
  assert.equal(isRuleThreshold(parseReminderInput({mode:'every',step:25}),200,200),true);
  assert.equal(isRuleThreshold(parseReminderInput({mode:'every',step:25}),201,200),false);
  assert.equal(storedRule({mode:'every',thresholds:'[]',step:2}).step,2);
  assert.throws(()=>parseReminderInput({mode:'single',threshold:0}));
  assert.throws(()=>parseReminderInput({mode:'single',threshold:6.5}));
  assert.throws(()=>parseReminderInput({mode:'single',threshold:'20'}));
  assert.throws(()=>parseReminderInput({mode:'every',step:3}));
  assert.throws(()=>parseReminderInput({mode:'multiple',thresholds:Array.from({length:41},(_,i)=>i+1)}));
});

test('single custom 13 resin reminder triggers only once per crossing and rearms after spending',async()=>{
 const f=harness(),e=env();
 try{
  const owner=sessionHeaders(await signIn(e,f,'333333'));
  assert.equal((await worker.fetch(request('/api/account/connect','POST',{uid:'800123456',region:'os_asia',cookie},owner),e)).status,200);
  let response=await worker.fetch(request('/api/account/preferences','POST',{enabled:true,mode:'single',threshold:13},owner),e);
  assert.equal(response.status,200);
  assert.equal(e.DB.db.prepare('SELECT self_threshold FROM accounts WHERE user_id=?').get('333333').self_threshold,180,'Legacy CHECK column is not changed');
  let me=await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json();
  assert.deepEqual(me.account.reminderRule,{mode:'single',thresholds:[13],step:0});
  let row=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('333333');
  await syncAccount(e,row); // Baseline: no spam at already-high count.
  assert.equal(e.DB.db.prepare('SELECT count(*) AS n FROM delivery_queue').get().n,0);
  f.setResin(0);await syncAccount(e,row);
  f.setResin(12);await syncAccount(e,row);
  assert.equal(e.DB.db.prepare('SELECT count(*) AS n FROM delivery_queue').get().n,0);
  f.setResin(13);await syncAccount(e,row);
  assert.equal(e.DB.db.prepare('SELECT threshold FROM delivery_queue').get().threshold,13);
  let n=f.messages.length;await sendQueued(e);assert.equal(f.messages.length-n,1);
  await syncAccount(e,row);assert.equal(e.DB.db.prepare('SELECT count(*) AS n FROM delivery_queue').get().n,0);
  f.setResin(2);await syncAccount(e,row);
  f.setResin(13);await syncAccount(e,row);
  assert.equal(e.DB.db.prepare('SELECT count(*) AS n FROM delivery_queue').get().n,1,'A new crossing triggers after spending resin');
  response=await worker.fetch(request('/api/account/preferences','POST',{enabled:true,mode:'single',threshold:0},owner),e);
  assert.equal(response.status,400,'Invalid amounts are rejected');
 }finally{f.restore();}
});

test('every 1 resin and multiple thresholds work without backlog spam or duplicate sends',async()=>{
 const f=harness(),e=env();
 try{
  const owner=sessionHeaders(await signIn(e,f,'444444'));
  assert.equal((await worker.fetch(request('/api/account/connect','POST',{uid:'800123456',region:'os_asia',cookie},owner),e)).status,200);
  let rule={enabled:true,mode:'every',step:1};
  assert.equal((await worker.fetch(request('/api/account/preferences','POST',rule,owner),e)).status,200);
  let row=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('444444');
  f.setResin(0);await syncAccount(e,row);
  f.setResin(1);await syncAccount(e,row);await sendQueued(e);
  assert.equal(f.messages.at(-1).text.includes('1/200'),true);
  f.setResin(12);await syncAccount(e,row);
  assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS n FROM delivery_queue').get().n,1,'Missed amounts yield one catch-up alert');
  assert.equal(e.DB.db.prepare('SELECT threshold FROM delivery_queue').get().threshold,12);
  await sendQueued(e);
  assert.equal((await worker.fetch(request('/api/account/preferences','POST',{enabled:true,mode:'multiple',thresholds:[20,40,60]},owner),e)).status,200);
  await syncAccount(e,row); // Reset baseline
  f.setResin(19);await syncAccount(e,row);
  f.setResin(20);await syncAccount(e,row);
  assert.equal(e.DB.db.prepare('SELECT threshold FROM delivery_queue').get().threshold,20);
  await sendQueued(e);
  f.setResin(61);await syncAccount(e,row);
  assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS n FROM delivery_queue').get().n,1);
  assert.equal(e.DB.db.prepare('SELECT threshold FROM delivery_queue').get().threshold,60);
  await worker.fetch(request('/api/account/preferences','POST',{enabled:false,mode:'every',step:1},owner),e);
  assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS n FROM delivery_queue').get().n,0,'Disabling clears queued alerts');
  await syncAccount(e,row);
  const me=await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json();
  assert.equal(me.account.selfEnabled,false);
 }finally{f.restore();}
});

test('each approved friend can be alerted at any resin amount, without changing other friends or legacy settings',async()=>{
 const network=harness(),e=env();
 try{
  const owner=sessionHeaders(await signIn(e,network,'555555'));
  const friend=sessionHeaders(await signIn(e,network,'666666'));
  const secondFriend=sessionHeaders(await signIn(e,network,'777777'));
  assert.equal((await worker.fetch(request('/api/account/connect','POST',{uid:'800123456',region:'os_asia',cookie},owner),e)).status,200);
  const invitation=(await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json()).inviteLink.split('start=')[1];
  await webhook(e,'666666','/start '+invitation);
  await webhook(e,'777777','/start '+invitation);
  const cannotEdit=await worker.fetch(request('/api/friends/update','POST',{id:'666666',enabled:true,mode:'single',threshold:13},friend),e);
  assert.equal(cannotEdit.status,404,'The follower cannot enable their own notification setting');
  const result=await worker.fetch(request('/api/friends/update','POST',{id:'666666',enabled:true,mode:'single',threshold:13},owner),e);
  assert.equal(result.status,200);
  assert.equal((await worker.fetch(request('/api/friends/update','POST',{id:'777777',enabled:true,threshold:180},owner),e)).status,200);
  const bad=await worker.fetch(request('/api/friends/update','POST',{id:'666666',enabled:true,mode:'single',threshold:201},owner),e);
  assert.equal(bad.status,400,'Friend amounts cannot exceed the owner resin cap');
  const invalid=await worker.fetch(request('/api/friends/update','POST',{id:'666666',enabled:true,mode:'single',threshold:6.5},owner),e);
  assert.equal(invalid.status,400);
  let info=(await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json());
  const details=info.followers.find(u=>u.id==='666666');
  assert.deepEqual(details.reminderRule,{mode:'single',thresholds:[13],step:0});
  assert.deepEqual(info.followers.find(u=>u.id==='777777').reminderRule,{mode:'single',thresholds:[180],step:0});
  assert.equal(e.DB.db.prepare('SELECT threshold FROM subscriptions WHERE owner_id=? AND subscriber_id=?').get('555555','666666').threshold,180,'Existing constrained column is preserved');
  let row=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('555555');
  await syncAccount(e,row); // Baseline should not emit 13 from existing resin 180.
  let recipientQueue=()=>e.DB.db.prepare('SELECT * FROM delivery_queue WHERE recipient_id=?').all('666666');
  assert.equal(recipientQueue().length,0);
  network.setResin(0);await syncAccount(e,row);
  network.setResin(12);await syncAccount(e,row);
  assert.equal(recipientQueue().length,0);
  network.setResin(13);await syncAccount(e,row);
  assert.equal(recipientQueue().length,1);
  assert.equal(recipientQueue()[0].threshold,13);
  await syncAccount(e,row);
  assert.equal(recipientQueue().length,1,'No duplicate at the same resin');
  await sendQueued(e);
  assert.ok(network.messages.some(m=>m.chat_id==='666666'&&m.text.includes('13/200')));
  assert.equal(network.messages.some(m=>m.chat_id==='777777'&&m.text.includes('Original Resin')),false,'Second friend uses their own 180 threshold');
  network.setResin(1);await syncAccount(e,row);
  network.setResin(13);await syncAccount(e,row);
  assert.equal(recipientQueue().length,1,'Spending resin rearms friend notification');
  const queued=await worker.fetch(request('/api/friends/update','POST',{id:'666666',enabled:true,mode:'multiple',thresholds:[25,40,80]},owner),e);
  assert.equal(queued.status,200);
  assert.equal(recipientQueue().length,0,'Changing friend preferences removes stale messages');
  network.setResin(0);await syncAccount(e,row); // baseline
  network.setResin(81);await syncAccount(e,row);
  assert.equal(recipientQueue().length,1);
  assert.equal(recipientQueue()[0].threshold,80,'At most one catch-up notification on a jump');
  await sendQueued(e);
  assert.ok(network.messages.some(m=>m.chat_id==='666666'&&m.text.includes('81/200')));
  const rule=e.DB.db.prepare('SELECT mode,thresholds FROM friend_reminder_rules WHERE owner_id=? AND subscriber_id=?').get('555555','666666');
  assert.equal(rule.mode,'multiple');assert.deepEqual(JSON.parse(rule.thresholds),[25,40,80]);
  await worker.fetch(request('/api/friends/remove','POST',{id:'666666'},owner),e);
  assert.equal(e.DB.db.prepare('SELECT count(*) AS n FROM friend_reminder_rules WHERE owner_id=?').get('555555').n,0,'Removing a friend removes their custom rule');
  assert.equal(e.DB.db.prepare('SELECT count(*) AS n FROM subscriptions WHERE owner_id=?').get('555555').n,1,'Other friend retained');
 }finally{network.restore();}
});

test('every-1 friend alerts have independent baselines, bounded pending queue and pause/resume',async()=>{
 const network=harness(),e=env();
 try{
  const owner=sessionHeaders(await signIn(e,network,'888888'));
  await signIn(e,network,'999999');
  await worker.fetch(request('/api/account/connect','POST',{uid:'800123456',region:'os_asia',cookie},owner),e);
  const invitation=(await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json()).inviteLink.split('start=')[1];
  await webhook(e,'999999','/start '+invitation);
  const setting={id:'999999',enabled:true,mode:'every',step:1};
  assert.equal((await worker.fetch(request('/api/friends/update','POST',setting,owner),e)).status,200);
  let row=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('888888');
  network.setResin(0);await syncAccount(e,row); // Start baseline at 0.
  network.setResin(1);await syncAccount(e,row);
  let queues=()=>e.DB.db.prepare('SELECT * FROM delivery_queue WHERE recipient_id=?').all('999999');
  assert.equal(queues().length,1);assert.equal(queues()[0].threshold,1);
  network.setResin(10);await syncAccount(e,row);
  assert.equal(queues().length,1,'Only the newest pending alert remains');assert.equal(queues()[0].threshold,10);
  await sendQueued(e);
  assert.equal(network.messages.filter(m=>m.chat_id==='999999'&&m.text.includes('Original Resin')).length,1);
  assert.equal((await worker.fetch(request('/api/friends/update','POST',{id:'999999',enabled:false,mode:'every',step:1},owner),e)).status,200);
  network.setResin(11);await syncAccount(e,row);
  assert.equal(queues().length,0,'Paused friend gets no alerts');
  assert.equal((await worker.fetch(request('/api/friends/update','POST',setting,owner),e)).status,200);
  network.setResin(12);await syncAccount(e,row); // Fresh saved baseline lets us catch this increment.
  assert.equal(queues().length,1);assert.equal(queues()[0].threshold,12);
  network.setResin(13);await syncAccount(e,row);
  assert.equal(queues().length,1);assert.equal(queues()[0].threshold,13);
 }finally{network.restore();}
});


test('approval message is dispatched once, not on every reminder edit, and delivery can be inspected',async()=>{
 const network=harness(),e=env();
 try{
  const owner=sessionHeaders(await signIn(e,network,'880001'));
  await signIn(e,network,'880002');
  const invitation=(await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json()).inviteLink.split('start=')[1];
  await webhook(e,'880002','/start '+invitation);
  const approved=await worker.fetch(request('/api/friends/update','POST',{id:'880002',enabled:true,threshold:180},owner),e);
  assert.equal(approved.status,200);
  assert.equal((await approved.json()).approvalNotification,'sent');
  assert.ok(network.messages.some(m=>m.chat_id==='880002'&&m.text.includes('approved your follow request')));
  const messages=network.messages.length;
  const edited=await worker.fetch(request('/api/friends/update','POST',{id:'880002',enabled:true,threshold:190},owner),e);
  assert.equal(edited.status,200);
  assert.equal((await edited.json()).approvalNotification,'not_applicable');
  assert.equal(network.messages.length,messages,'No second approval notification on changing thresholds');
  const status=await (await worker.fetch(request('/api/notifications/status','GET',undefined,owner),e)).json();
  assert.equal(status.approvalPending,0);
  assert.equal(status.deliveries.find(x=>x.kind==='friend_approved').status,'sent');
  const other=sessionHeaders(await signIn(e,network,'880003'));
  const otherStatus=await (await worker.fetch(request('/api/notifications/status','GET',undefined,other),e)).json();
  assert.equal(otherStatus.deliveries.length,0,'Other accounts cannot read notification diagnostics');
 }finally{network.restore();}
});

test('network outage preserves pending approval and resin alerts, then sends after recovery',async()=>{
 const network=harness(),e=env();
 try{
  const owner=sessionHeaders(await signIn(e,network,'881001'));
  await signIn(e,network,'881002');
  await worker.fetch(request('/api/account/connect','POST',{uid:'800123456',region:'os_asia',cookie},owner),e);
  const invite=(await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json()).inviteLink.split('start=')[1];
  await webhook(e,'881002','/start '+invite);
  network.setTelegramAvailable(false);
  const approved=await worker.fetch(request('/api/friends/update','POST',{id:'881002',enabled:true,mode:'single',threshold:190},owner),e);
  assert.equal(approved.status,200,'Friend approval persists despite Telegram outage');
  const result=await approved.json();
  assert.equal(result.approvalNotification,'retrying');
  assert.match(result.deliveryError,/Telegram/);
  assert.equal(e.DB.db.prepare("SELECT status FROM notification_events WHERE recipient_id=?").get('881002').status,'pending');
  const testResult=await worker.fetch(request('/api/notifications/test','POST',{},owner),e);
  assert.equal(testResult.status,502);
  let status=await (await worker.fetch(request('/api/notifications/status','GET',undefined,owner),e)).json();
  assert.equal(status.approvalPending,1);
  assert.equal(status.deliveries.find(x=>x.kind==='test').status,'blocked');
  assert.equal(status.deliveries.find(x=>x.kind==='friend_approved').status,'retrying');
  network.setResin(189);let row=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('881001');await syncAccount(e,row);
  network.setResin(190);await syncAccount(e,row);
  assert.equal(e.DB.db.prepare("SELECT COUNT(*) AS n FROM delivery_queue WHERE recipient_id=?").get('881002').n,1);
  await sendQueued(e);
  assert.equal(e.DB.db.prepare("SELECT COUNT(*) AS n FROM delivery_queue WHERE recipient_id=?").get('881002').n,1,'Not silently deleted on failure');
  network.setTelegramAvailable(true);
  const future=Date.now()+3*60*1000;
  assert.equal(await sendApprovalEvents(e,future),1);
  assert.ok((await sendQueued(e,future))>=1);
  status=await (await worker.fetch(request('/api/notifications/status','GET',undefined,owner),e)).json();
  assert.equal(status.approvalPending,0);
  assert.equal(status.resinPending,0);
  assert.equal(status.deliveries.find(x=>x.kind==='friend_approved').status,'sent');
  assert.equal(status.deliveries.find(x=>x.kind==='resin'&&x.recipient_id==='881002').status,'sent');
 }finally{network.restore();}
});

test('updater includes additive delivery migration and visible notification diagnostics',()=>{
 const sql=fs.readFileSync(new URL('../db/0005_notification_delivery.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS notification_events/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS notification_delivery_state/);
 assert.doesNotMatch(sql,/DROP TABLE|ALTER TABLE|DELETE FROM|UPDATE accounts/i);
 const page=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(page,/id="delivery-state"/);
 const js=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/api\/notifications\/status/);
});


test('resend approval works for previously approved friends and refuses unapproved subscribers',async()=>{
 const network=harness(),e=env();
 try{
  const owner=sessionHeaders(await signIn(e,network,'886001'));
  const another=sessionHeaders(await signIn(e,network,'886003'));
  await signIn(e,network,'886002');
  const invite=(await (await worker.fetch(request('/api/me','GET',undefined,owner),e)).json()).inviteLink.split('start=')[1];
  await webhook(e,'886002','/start '+invite);
  assert.equal((await worker.fetch(request('/api/friends/notify','POST',{id:'886002'},owner),e)).status,403);
  assert.equal((await worker.fetch(request('/api/friends/notify','POST',{id:'886002'},another),e)).status,403);
  assert.equal((await worker.fetch(request('/api/friends/update','POST',{id:'886002',enabled:true,threshold:180},owner),e)).status,200);
  const before=network.messages.length;
  const resent=await worker.fetch(request('/api/friends/notify','POST',{id:'886002'},owner),e);
  assert.equal(resent.status,200);assert.equal((await resent.json()).alreadySent,true);
  assert.equal(network.messages.length,before,'Repeated clicks cannot spam the friend');
 }finally{network.restore();}
});

test('saving a custom rule seeds from the cached resin, so the next threshold is not missed',async()=>{
 const network=harness(),e=env();
 try{
  network.setResin(179);
  const owner=sessionHeaders(await signIn(e,network,'887001'));
  await worker.fetch(request('/api/account/connect','POST',{uid:'800123456',region:'os_asia',cookie},owner),e);
  const saved=await worker.fetch(request('/api/account/preferences','POST',{enabled:true,mode:'single',threshold:180},owner),e);
  assert.equal(saved.status,200);
  const baseline=e.DB.db.prepare('SELECT last_resin FROM self_reminder_rules WHERE user_id=?').get('887001');
  assert.equal(baseline.last_resin,179);
  network.setResin(180);
  await syncAccount(e,e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('887001'));
  assert.equal(e.DB.db.prepare('SELECT threshold FROM delivery_queue WHERE recipient_id=?').get('887001').threshold,180);
 }finally{network.restore();}
});

test('Website-only HoYoLAB pairing: preview requires Telegram sign-in, never stores cookies, explicit connect saves encrypted',async()=>{
  const fixture=harness(),e=env();
  try{
    const noLogin=await worker.fetch(request('/api/account/preview','POST',{cookie}),e);
    assert.equal(noLogin.status,401);
    const session=await signIn(e,fixture,'45123');
    const owner=sessionHeaders(session);
    const noCrossOrigin=await worker.fetch(request('/api/account/preview','POST',{cookie},{...owner,Origin:'https://unsafe.example'}),e);
    assert.equal(noCrossOrigin.status,403);
    const bad=await worker.fetch(request('/api/account/preview','POST',{cookie:'bad'} ,owner),e);
    assert.equal(bad.status,400);
    const preview=await worker.fetch(request('/api/account/preview','POST',{cookie},owner),e);
    assert.equal(preview.status,200);
    const result=await preview.json();
    assert.deepEqual(result.accounts.map(({uid,region})=>({uid,region})),[
      {uid:'800123456',region:'os_asia'},{uid:'600321321',region:'os_usa'}]);
    assert.ok(!JSON.stringify(result).includes('this_is_a_test_secret'),'session is never returned');
    assert.equal((await e.DB.prepare('SELECT COUNT(*) AS count FROM accounts').first()).count,0,'preview does not save cookies');
    const connect=await worker.fetch(request('/api/account/connect','POST',{cookie,uid:result.accounts[0].uid,region:result.accounts[0].region},owner),e);
    assert.equal(connect.status,200);
    const record=await e.DB.prepare('SELECT credential_ciphertext,tracking_mode FROM accounts WHERE user_id=?').bind('45123').first();
    assert.equal(record.tracking_mode,'hoyolab');
    assert.ok(record.credential_ciphertext&&!record.credential_ciphertext.includes('this_is_a_test_secret'));
  }finally{fixture.restore();}
});

test('GitHub extension pairing: private preview, user approval and one-time connect, unrelated origins blocked',async()=>{
  const network=harness(),e=env();
  try{
    const owner=sessionHeaders(await signIn(e,network,'730001'));
    const start=await worker.fetch(request('/api/link/start','POST',{},owner),e);
    assert.equal(start.status,200);
    const {code}=await start.json();
    const extension={'Origin':'chrome-extension://abcdefghijklmnopabcdefghijklmnop','Sec-Fetch-Site':'cross-site'};
    const args={code,cookie};
    const attack=await worker.fetch(request('/api/link/preview','POST',args,{'Origin':'https://attacker.example'}),e);
    assert.equal(attack.status,403);
    const noCode=await worker.fetch(request('/api/link/preview','POST',{code:'a'.repeat(24),cookie},extension),e);
    assert.equal(noCode.status,400);
    const preview=await worker.fetch(request('/api/link/preview','POST',args,extension),e);
    assert.equal(preview.status,200);
    const data=await preview.json();
    assert.equal(data.accounts[0].uid,'800123456');
    assert.ok(!JSON.stringify(data).includes('ltoken'));
    const stillPending=e.DB.db.prepare('SELECT COUNT(*) AS n FROM desktop_pairings WHERE user_id=?').get('730001').n;
    assert.equal(stillPending,1,'Preview does not consume one-time code');
    const linked=await worker.fetch(request('/api/link/complete','POST',{...args,uid:'800123456',region:'os_asia'},extension),e);
    assert.equal(linked.status,200);
    assert.equal((await linked.json()).ok,true);
    const row=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('730001');
    assert.equal(await decryptCookie(e,'730001',row),cookie);
    assert.equal(row.credential_ciphertext.includes('ltoken'),false);
    const repeat=await worker.fetch(request('/api/link/complete','POST',{...args,uid:'800123456',region:'os_asia'},extension),e);
    assert.equal(repeat.status,400);
  } finally{network.restore();}
});

test('gateway pairing reservation is atomic, proof-bound and single use',async()=>{
  const f=harness(),e=env();
  try{
    const session=await signIn(e,f,'455001');
    const headers=sessionHeaders(session);
    const started=await worker.fetch(request('/api/link/start','POST',{},headers),e);
    assert.equal(started.status,200);
    const {code}=await started.json();
    const proof=randomBytes(32).toString('base64url');
    assert.equal((await worker.fetch(request('/api/link/check','POST',{code}),e)).status,200);
    const first=await worker.fetch(request('/api/link/claim','POST',{code,proof}),e);
    assert.equal(first.status,200);
    assert.equal((await worker.fetch(request('/api/link/check','POST',{code}),e)).status,403);
    const retry=await worker.fetch(request('/api/link/claim','POST',{code,proof:randomBytes(32).toString('base64url')}),e);
    assert.equal(retry.status,409);
    const wrongPreview=await worker.fetch(request('/api/link/preview','POST',{code,cookie},{}),e);
    assert.equal(wrongPreview.status,403);
    const goodPreview=await worker.fetch(request('/api/link/preview','POST',{code,proof,cookie}),e);
    assert.equal(goodPreview.status,200);
    const wrongComplete=await worker.fetch(request('/api/link/complete','POST',{code,uid:'800123456',region:'os_asia',cookie}),e);
    assert.equal(wrongComplete.status,403);
    const goodComplete=await worker.fetch(request('/api/link/complete','POST',{code,proof,uid:'800123456',region:'os_asia',cookie}),e);
    assert.equal(goodComplete.status,200);
    assert.equal((await worker.fetch(request('/api/link/complete','POST',{code,proof,uid:'800123456',region:'os_asia',cookie}),e)).status,400);
  } finally{f.restore();}
});

test('quiet hours belong to each Telegram user and reject invalid timezones',async()=>{
  const f=harness(),e=env();
  try{
    const a=sessionHeaders(await signIn(e,f,'455002'));
    const b=sessionHeaders(await signIn(e,f,'455003'));
    const invalid=await worker.fetch(request('/api/notifications/quiet-hours','POST',
      {enabled:true,start:'23:00',end:'08:00',timezone:'../../etc/passwd'},a),e);
    assert.equal(invalid.status,400);
    const saved=await worker.fetch(request('/api/notifications/quiet-hours','POST',
      {enabled:true,start:'22:30',end:'07:15',timezone:'Asia/Baghdad'},a),e);
    assert.equal(saved.status,200);
    const [owner,friend]=await Promise.all([
      worker.fetch(request('/api/me','GET',undefined,a),e),
      worker.fetch(request('/api/me','GET',undefined,b),e)
    ]);
    assert.deepEqual((await owner.json()).quietHours,{enabled:true,start:'22:30',end:'07:15',timezone:'Asia/Baghdad'});
    assert.equal((await friend.json()).quietHours.enabled,false);
  }finally{f.restore();}
});

test('recipient quiet hours suppress stale resin alerts without contacting Telegram',async()=>{
  const f=harness(),e=env();
  try{
    const ownerId='455004',session=sessionHeaders(await signIn(e,f,ownerId));
    const ts=Date.parse('2026-11-13T23:35:00Z');
    const configured=await worker.fetch(request('/api/notifications/quiet-hours','POST',
      {enabled:true,start:'23:00',end:'08:00',timezone:'UTC'},session),e);
    assert.equal(configured.status,200);
    await qMockEstimate(e,ownerId,180,ts);
    const note=e.DB.db.prepare('SELECT * FROM accounts WHERE user_id=?').get(ownerId);
    assert.equal(await syncAccount(e,note,ts),true);
    // Ensure the reminder crossing is eligible under the legacy rule.
    e.DB.db.prepare('INSERT INTO delivery_queue(owner_id,recipient_id,threshold,resin,cap,created_at,next_attempt_at) VALUES(?,?,?,?,?,?,?)')
      .run(ownerId,ownerId,180,180,200,ts,ts);
    const before=f.messages.length;
    assert.equal(await sendQueued(e,ts),0);
    assert.equal(f.messages.length,before,'Quiet hours must never send Telegram message');
    assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS count FROM delivery_queue').get().count,0);
    assert.equal(e.DB.db.prepare('SELECT last_error FROM notification_delivery_state WHERE owner_id=? AND recipient_id=? AND kind=?').get(ownerId,ownerId,'resin').last_error,'Muted by recipient quiet hours.');
  }finally{f.restore();}
});
async function qMockEstimate(envv,userId,resin,ts){
  const cap=200;
  await envv.DB.prepare(`INSERT INTO accounts(user_id,genshin_uid,region,nickname,credential_iv,credential_ciphertext,
    resin,cap,full_at,last_sync_at,next_sync_at,last_error,tracking_mode,self_enabled,self_threshold)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(userId,'','','','','',resin,cap,ts+(cap-resin)*480000,ts,ts,null,'estimate',1,180).run();
}
