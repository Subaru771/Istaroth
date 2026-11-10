import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{estimated,inQuiet,fetchNotes,sync,secureEqual} from '../src/index.js';

const now=Date.now();
function env(){
  return {
    ROLE_UID:'800123456',ROLE_REGION:'os_asia',ROLE_NAME:'Test Traveler',
    TELEGRAM_BOT_TOKEN:'123456789:abcdefghijklmnopqrstuvwxyzABCDEFGHIJ',
    OWNER_API_KEY:'unit_test_only_secret_token_123456789',
    TELEGRAM_WEBHOOK_SECRET:'unit_test_only_webhook_123456789',
    INVITE_CODE:'private_testing_invite_123456789',
    HOYOLAB_COOKIE:'ltuid_v2=123456; ltoken_v2=fake_for_test',
    TIMEZONE:'Asia/Baghdad',
    DB:new FakeDB()
  };
}
class FakeDB {
  constructor(){
    this.rows=new Map();this.settings=new Map();this.state=null;
  }
  prepare(query){
    const db=this;
    const statement={
      values:[],
      bind(...vals){this.values=vals;return this;},
      async first(){
        const x=this.values[0];
        if(query.includes('COUNT(*)'))return {count:db.rows.size};
        if(query.includes('FROM resin_state'))return db.state?{at:db.state.at,value:db.state.value,cap:db.state.cap,fullAt:db.state.fullAt,lastError:db.state.lastError}:null;
        if(query.includes('FROM settings'))return db.settings.has(x)?{value:db.settings.get(x)}:null;
        if(query.includes('FROM recipients'))return db.rows.get(String(x))||null;
        throw Error('Unrecognized first query '+query);
      },
      async all(){
        if(!query.includes('FROM recipients'))throw Error('Unrecognized all query');
        return {results:[...db.rows.values()].map(x=>({
          id:x.id,name:x.name,enabled:x.enabled,threshold:x.threshold,lastThreshold:x.lastThreshold,lastSentAt:x.lastSentAt
        }))};
      },
      async run(){
        const v=this.values;
        if(query.startsWith('INSERT INTO resin_state')){
          if(query.includes('last_error) VALUES')){
            db.state??={};db.state.lastError=v[0];return {meta:{changes:1}};
          }
          db.state={at:v[0],value:v[1],cap:v[2],fullAt:v[3],lastError:null};
          return {meta:{changes:1}};
        }
        if(query.startsWith('INSERT INTO settings')){db.settings.set(v[0],v[1]);return {meta:{changes:1}};}
        if(query.startsWith('INSERT INTO recipients')){
          if(!db.rows.has(String(v[0])))db.rows.set(String(v[0]),{
            id:String(v[0]),name:v[1],enabled:0,threshold:180,lastThreshold:null,lastSentAt:null
          });
          else db.rows.get(String(v[0])).name=v[1];
          return {meta:{changes:1}};
        }
        if(query.startsWith('DELETE FROM recipients')){db.rows.delete(String(v[0]));return {meta:{changes:1}};}
        if(query.startsWith('UPDATE recipients SET last_threshold=NULL')){
          const row=db.rows.get(String(v[0]));
          if(row&&row.lastThreshold===v[1])row.lastThreshold=null;
          return {meta:{changes:row?1:0}};
        }
        if(query.startsWith('UPDATE recipients SET last_threshold=?')){
          const row=db.rows.get(String(v[2]));
          if(!row||!row.enabled||row.lastThreshold===v[3])return {meta:{changes:0}};
          row.lastThreshold=v[0];row.lastSentAt=v[1];return {meta:{changes:1}};
        }
        throw Error('Unrecognized run query '+query);
      }
    };
    return statement;
  }
}
function makeFetch(initial=180){
  let reading=initial;
  const calls=[];
  const fetcher=async(url,opts)=>{
    calls.push({url,opts});
    if(url.startsWith('https://api.telegram.org/')){
      return new Response(JSON.stringify({ok:true,result:{message_id:calls.length}}),{status:200});
    }
    assert.ok(url.startsWith('https://bbs-api-os.hoyolab.com/'),'Unexpected external API host '+url);
    assert.equal(opts.headers.Cookie,'ltuid_v2=123456; ltoken_v2=fake_for_test');
    assert.match(opts.headers.DS,/^\d+,[a-f0-9]+,[a-f0-9]{32}$/);
    return new Response(JSON.stringify({retcode:0,data:{
      current_resin:reading,max_resin:200,resin_recovery_time:(200-reading)*480
    }}),{status:200});
  };
  return {fetcher,calls,setReading:v=>{reading=v;}};
}
test('resin projection is bounded and freshness enforced',()=>{
  assert.deepEqual(estimated({at:now,value:179,cap:200,fullAt:now+21*480000},now),{amount:179,cap:200});
  assert.deepEqual(estimated({at:now,value:179,cap:200,fullAt:now+21*480000},now+480000),{amount:180,cap:200});
  assert.equal(estimated({at:now-31*60000,value:200,cap:200,fullAt:now},now),null);
  assert.equal(estimated({at:now,value:-2,cap:200,fullAt:now},now),null);
});
test('quiet hours apply in Baghdad timezone',()=>{
  const e=env();
  e.QUIET_START='23:00';e.QUIET_END='08:00';
  assert.equal(inQuiet(e,new Date('2026-11-10T00:10:00+03:00').getTime()),true);
  assert.equal(inQuiet(e,new Date('2026-11-10T12:10:00+03:00').getTime()),false);
  assert.equal(secureEqual('testing','testing'),true);
  assert.equal(secureEqual('testing','different'),false);
});
test('cloud notes use the official HoYoLAB endpoint and a private cookie',async()=>{
  const e=env(),f=makeFetch(150);
  const note=await fetchNotes(e,now,f.fetcher);
  assert.equal(note.value,150);
  assert.equal(note.fullAt,now+50*480000);
});
test('Telegram opt-in and cloud alert are one per threshold and reset on spending',async()=>{
  const e=env(),f=makeFetch(180);
  const bad=new Request('https://test.workers.dev/telegram',{
    method:'POST',headers:{'x-telegram-bot-api-secret-token':'incorrect','Content-Type':'application/json'},
    body:JSON.stringify({message:{chat:{type:'private',id:1234},text:'/start join_'+e.INVITE_CODE}})
  });
  const badResult=await worker.fetch(bad,e);
  assert.equal(badResult.status,401);
  assert.equal(e.DB.rows.size,0);
  const good=new Request('https://test.workers.dev/telegram',{
    method:'POST',headers:{'x-telegram-bot-api-secret-token':e.TELEGRAM_WEBHOOK_SECRET,'Content-Type':'application/json'},
    body:JSON.stringify({message:{chat:{type:'private',id:1234},from:{first_name:'Alex'},text:'/start join_'+e.INVITE_CODE}})
  });
  const goodResult=await worker.fetch(good,e);
  assert.equal(goodResult.status,200);
  const r=e.DB.rows.get('1234');assert.equal(r.enabled,0);
  r.enabled=1;
  await sync(e,f.fetcher,now);
  assert.equal(f.calls.filter(x=>x.url.includes('/sendMessage')&&x.opts.body.includes('Original Resin')).length,1);
  await sync(e,f.fetcher,now+60000);
  assert.equal(f.calls.filter(x=>x.url.includes('/sendMessage')&&x.opts.body.includes('Original Resin')).length,1);
  f.setReading(100);
  await sync(e,f.fetcher,now+120000);
  assert.equal(r.lastThreshold,null);
  f.setReading(180);
  await sync(e,f.fetcher,now+180000);
  assert.equal(f.calls.filter(x=>x.url.includes('/sendMessage')&&x.opts.body.includes('Original Resin')).length,2);
});
test('cloud health endpoint exposes no sensitive data',async()=>{
  const result=await worker.fetch(new Request('https://test.workers.dev/health'),env());
  const body=await result.json();
  assert.equal(result.status,200);
  assert.ok(!JSON.stringify(body).includes('ltoken'));
});
