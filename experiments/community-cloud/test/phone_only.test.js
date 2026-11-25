import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import worker,{setEstimatedResin,syncAccount,sendQueued} from '../src/worker.js';
import {hash,projectedResin} from '../src/lib.js';
function harness(){
 const db=new DatabaseSync(':memory:');
 for(const n of [1,2,3,4,5,6,7,8]){const f=new URL('../db/'+String(n).padStart(4,'0')+'_'+({1:'initial',2:'desktop_pairings',3:'custom_resin_reminders',4:'friend_resin_rules',5:'notification_delivery',6:'phone_estimates',7:'notification_quiet_hours',8:'gateway_claim'}[n])+'.sql',import.meta.url);db.exec(readFileSync(f,'utf8'));}
 const env={DB:{prepare(sql){let values=[];const stmt=db.prepare(sql);return{bind(...args){values=args;return this;},async first(){return stmt.get(...values)||null;},async all(){return{results:stmt.all(...values)};},async run(){const r=stmt.run(...values);return{meta:{changes:Number(r.changes)}};}};}},
  BOT_TOKEN:'1234567:abcdefghijklmnopqrstuvwxyzABCDE1234',BOT_USERNAME:'IstarothTestBot',WEBHOOK_SECRET:'webhook_secret_abcdefghijklmnopqrstuvwxyz12345678',
  DATA_KEY:randomBytes(32).toString('base64url'),ADMIN_SETUP_KEY:'admin_key_abcdefghijklmnopqrstuvwxyz1234567890',ASSETS:{fetch:async()=>new Response('static')}};
 function user(id='123456'){db.prepare('INSERT INTO users(id,name,username,invite_code,created_at) VALUES(?,?,?,?,?)').run(id,'Test Traveler','','invite_'+id,Date.now());}
 function login(id='123456'){
  const raw='A'.repeat(43),ts=Date.now();db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hash(raw),id,ts+360000,ts);
  return {cookie:'istaroth_session='+raw};
 }
 const req=(route,method='GET',body,headers={})=>new Request('https://example.workers.dev'+route,{method,headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
 return {db,env,user,login,req};
}
test('phone-only mode computes resin without HoYoLAB cookies and cannot mutate another user',async()=>{
 const h=harness();h.user();const cookie=h.login();
 assert.equal((await worker.fetch(h.req('/api/account/estimate','POST',{resin:75}),h.env)).status,401);
 assert.equal((await worker.fetch(h.req('/api/account/estimate','POST',{resin:75},{...cookie,Origin:'https://evil.example'}),h.env)).status,403);
 const bad=await worker.fetch(h.req('/api/account/estimate','POST',{resin:201},cookie),h.env);assert.equal(bad.status,400);
 const ok=await worker.fetch(h.req('/api/account/estimate','POST',{resin:75},cookie),h.env);assert.equal(ok.status,200);
 const saved=h.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('123456');
 assert.equal(saved.tracking_mode,'estimate');assert.equal(saved.credential_ciphertext,'');assert.equal(saved.credential_iv,'');
 const me=await(await worker.fetch(h.req('/api/me','GET',undefined,cookie),h.env)).json();
 assert.equal(me.account.trackingMode,'estimate');assert.equal(me.account.resin.resin,75);assert.equal(me.account.uid,'');
 assert.equal(projectedResin(saved,saved.last_sync_at+8*60000).resin,76);
 assert.equal(projectedResin(saved,saved.last_sync_at+125*8*60000).resin,200);
});
test('estimated custom self reminders trigger on crossing and rearm after correction without fake retroactive alerts',async()=>{
 const h=harness();h.user();const cookie=h.login(),ts=Date.now();
 await setEstimatedResin(h.env,'123456',78,ts);
 const configured=await worker.fetch(h.req('/api/account/preferences','POST',{enabled:true,mode:'single',threshold:80},cookie),h.env);
 assert.equal(configured.status,200);
 let row=h.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('123456');
 assert.equal(await syncAccount(h.env,row,ts+8*60000),true);assert.equal(h.db.prepare('SELECT COUNT(*) AS c FROM delivery_queue').get().c,0);
 row=h.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('123456');
 assert.equal(await syncAccount(h.env,row,ts+16*60000),true);
 assert.equal(h.db.prepare('SELECT threshold FROM delivery_queue').get().threshold,80);
 await setEstimatedResin(h.env,'123456',190,ts+20*60000);
 assert.equal(h.db.prepare('SELECT COUNT(*) AS c FROM delivery_queue').get().c,0,'reset clears old alerts');
 row=h.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('123456');
 await syncAccount(h.env,row,ts+28*60000);
 assert.equal(h.db.prepare('SELECT COUNT(*) AS c FROM delivery_queue').get().c,0,'no retroactive crossing after manual update');
});
test('friend estimated alerts are clearly marked estimated, not live verified data',async()=>{
 const h=harness();h.user('123456');h.user('987654');const ts=Date.now();
 await setEstimatedResin(h.env,'123456',79,ts);
 h.db.prepare('INSERT INTO subscriptions(owner_id,subscriber_id,enabled,threshold,joined_at) VALUES(?,?,?,?,?)').run('123456','987654',1,180,ts);
 h.db.prepare('INSERT INTO friend_reminder_rules(owner_id,subscriber_id,mode,thresholds,step,last_resin,updated_at) VALUES(?,?,?,?,?,?,?)')
 .run('123456','987654','single','[80]',0,79,ts);
 const row=h.db.prepare('SELECT * FROM accounts WHERE user_id=?').get('123456');
 await syncAccount(h.env,row,ts+8*60000);
 const queued=h.db.prepare('SELECT recipient_id,threshold FROM delivery_queue').all();
 assert.deepEqual(queued.map(r=>({...r})),[{recipient_id:'987654',threshold:80}]);
 const sent=[];const previous=globalThis.fetch;globalThis.fetch=async(url,opts)=>{
  assert.match(String(url),/api.telegram.org/);sent.push(JSON.parse(opts.body));return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{status:200});
 };
 try{assert.equal(await sendQueued(h.env,ts+8*60000),1);}
 finally{globalThis.fetch=previous;}
 assert.equal(sent.length,1);assert.match(sent[0].text,/Estimated from the last manually entered resin/);
 assert.equal(sent[0].chat_id,'987654');
});
test('Telegram /resin and /status work without outgoing Telegram fetch',async()=>{
 const h=harness();const webhook=(text)=>worker.fetch(h.req('/telegram','POST',{message:{chat:{id:123456,type:'private'},from:{first_name:'Traveler'},text}},{'x-telegram-bot-api-secret-token':h.env.WEBHOOK_SECRET}),h.env);
 const result=await webhook('/resin 35');assert.equal(result.status,200);
 const answer=await result.json();assert.match(answer.text,/estimate set to 35\/200/);
 const status=await (await webhook('/status')).json();assert.match(status.text,/Resin 35\/200 \(estimate\)/);
 const bad=await(await webhook('/resin 501')).json();assert.match(bad.text,/0-200/);
 assert.equal(h.db.prepare('SELECT resin FROM accounts WHERE user_id=?').get('123456').resin,35);
});
test('already verified HoYoLAB account cannot be replaced by unverified phone estimate',async()=>{
 const h=harness();h.user();const cookie=h.login();
 const t=Date.now();h.db.prepare(`INSERT INTO accounts(user_id,genshin_uid,region,nickname,credential_iv,credential_ciphertext,resin,cap,full_at,last_sync_at,next_sync_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run('123456','800123456','os_asia','Verified Traveler','secret-iv','secret-cipher',40,200,t,t,t+60000);
 const res=await worker.fetch(h.req('/api/account/estimate','POST',{resin:90},cookie),h.env);
 assert.equal(res.status,409);const after=h.db.prepare('SELECT tracking_mode,resin,genshin_uid FROM accounts WHERE user_id=?').get('123456');
 assert.deepEqual({...after},{tracking_mode:'hoyolab',resin:40,genshin_uid:'800123456'});
});
test('Telegram-only /remind supports exact counts, multiple counts, every N, and off',async()=>{
 const h=harness();const webhook=async(text)=>{
   const r=await worker.fetch(h.req('/telegram','POST',{message:{chat:{id:123456,type:'private'},from:{first_name:'Traveler'},text}}, {'x-telegram-bot-api-secret-token':h.env.WEBHOOK_SECRET}),h.env);
   assert.equal(r.status,200);return (await r.json()).text;
 };
 assert.match(await webhook('/remind 90'),/Start by sending/);
 await webhook('/resin 75');
 assert.match(await webhook('/remind 80'),/saved: 80/);
 assert.match(await webhook('/remind 20,40,80'),/saved: 20, 40, 80/);
 assert.match(await webhook('/remind every 10'),/saved: every 10/);
 let saved=h.db.prepare('SELECT mode,step FROM self_reminder_rules WHERE user_id=?').get('123456');
 assert.equal(saved.mode,'every');assert.equal(saved.step,10);
 assert.match(await webhook('/remind every 3'),/Examples/);
 assert.match(await webhook('/remind off'),/are off/);
 assert.equal(h.db.prepare('SELECT self_enabled FROM accounts WHERE user_id=?').get('123456').self_enabled,0);
});
