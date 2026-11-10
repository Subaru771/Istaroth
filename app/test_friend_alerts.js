'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {FriendAlerts,validToken}=require('./friend-alerts');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'istaroth-friend-test-'));
const secret='123456789:abcdefghijklmnopqrstuvwxyzABCDEFGHIJ';
const storage={
 isEncryptionAvailable:()=>true,
 encryptString:s=>Buffer.from('sealed:'+s,'utf8'),
 decryptString:b=>b.toString('utf8').replace(/^sealed:/,'')
};
const calls=[],updates=[];
const request=async(token,method,payload)=>{
 assert.equal(token,secret);
 calls.push({method,payload});
 if(method==='getMe')return {is_bot:true,username:'MyIstarothTestBot'};
 if(method==='getUpdates')return updates.splice(0);
 if(method==='sendMessage')return {message_id:calls.length};
 throw Error('Unexpected method '+method);
};
async function run(){
 assert.equal(validToken(secret),true);
 assert.equal(validToken('bad'),false);
 const f=new FriendAlerts(dir,storage,request);
 assert.equal(f.status().connected,false);
 await f.connect(secret);
 assert.equal(f.status().connected,true);
 const invite=f.status().inviteUrl.split('start=')[1];
 assert.match(invite,/^join_[A-Za-z0-9_-]+$/);
 assert.ok(!fs.readFileSync(f.file,'utf8').includes(secret),'Token must be encrypted at rest');
 const now=Date.now(),resin=amount=>({amount,cap:200,at:now,fullAt:now+(200-amount)*480000});
 const role={uid:'800123456',nickname:'Test Traveler'};
 updates.push({update_id:14,message:{chat:{type:'private',id:12345},
   from:{first_name:'Alex'},text:'/start '+invite}});
 await f.poll();
 assert.equal(f.status().recipients.length,1);
 assert.equal(f.status().recipients[0].enabled,false,'New friends must be paused by default');
 await f.notify(resin(200),role,false,now);
 assert.equal(calls.filter(x=>x.method==='sendMessage'&&x.payload.text.includes('Original Resin')).length,0);
 f.setRecipient('12345',{enabled:true,threshold:180});
 await f.notify(resin(179),role,false,now);
 assert.equal(calls.filter(x=>x.method==='sendMessage'&&x.payload.text.includes('Original Resin')).length,0);
 await f.notify(resin(180),role,false,now);
 assert.equal(calls.filter(x=>x.method==='sendMessage'&&x.payload.text.includes('Original Resin')).length,1);
 await f.notify(resin(190),role,false,now+2000);
 assert.equal(calls.filter(x=>x.method==='sendMessage'&&x.payload.text.includes('Original Resin')).length,1,'No duplicate at the same threshold');
 f.setRecipient('12345',{threshold:200});
 await f.notify(resin(200),role,true,now+3000);
 assert.equal(calls.filter(x=>x.method==='sendMessage'&&x.payload.text.includes('Original Resin')).length,1,'Quiet hours suppress outgoing alerts');
 await f.notify(resin(200),role,false,now+4000);
 assert.equal(calls.filter(x=>x.method==='sendMessage'&&x.payload.text.includes('Original Resin')).length,2,'New threshold sends one alert');
 await f.notify({...resin(200),at:now-60*60000},role,false,now+5000);
 assert.equal(calls.filter(x=>x.method==='sendMessage'&&x.payload.text.includes('Original Resin')).length,2,'Stale reads do not send');
 await f.notify(resin(170),role,false,now+6000);
 await f.notify(resin(200),role,false,now+7000);
 assert.equal(calls.filter(x=>x.method==='sendMessage'&&x.payload.text.includes('Original Resin')).length,3,'A new refill cycle can send');
 const restored=new FriendAlerts(dir,storage,request);
 assert.equal(restored.status().connected,true,'Encrypted token should survive app restart');
 assert.equal(restored.status().recipients[0].name,'Alex');
 updates.push({update_id:15,message:{chat:{type:'private',id:12345},from:{first_name:'Alex'},text:'/stop'}});
 await f.poll();
 assert.equal(f.status().recipients.length,0,'A friend must be able to unsubscribe');
 await f.disconnect();
 assert.equal(f.status().connected,false);
 assert.ok(!JSON.parse(fs.readFileSync(f.file,'utf8')).secret,'Disconnect should remove encrypted token');
 console.log('PASS Telegram friend invitations, opt-in, encrypted secrets, thresholds, privacy, deduplication and unsubscribe');
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(dir,{recursive:true,force:true}));
