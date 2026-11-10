'use strict';
// Friend alerts are optional and separate from HoYoLAB credentials.
// Users bring their own Telegram bot. The bot token is encrypted at rest.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const THRESHOLDS = [160, 180, 190, 200];
const MAX_FRIENDS = 30;
const FRESH_MS = 30 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const POLL_MS = 25 * 1000;

function telegramRequest(token, method, payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload || {}));
    const req = https.request({
      protocol: 'https:', hostname: 'api.telegram.org',
      path: '/bot' + token + '/' + method, method: 'POST',
      headers: {'Content-Type':'application/json','Content-Length':data.length},
      timeout: 12000
    }, res => {
      let response = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        response += chunk;
        if (response.length > 128000) req.destroy(new Error('Response too large'));
      });
      res.on('end', () => {
        try {
          const body = JSON.parse(response);
          if (res.statusCode !== 200 || body.ok !== true) {
            reject(new Error('Telegram rejected the request (HTTP ' + res.statusCode + ').'));
          } else resolve(body.result);
        } catch {
          reject(new Error('Invalid Telegram response.'));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Telegram timed out.')));
    req.on('error', () => reject(new Error('Cannot contact Telegram. Check your connection.')));
    req.end(data);
  });
}
function validToken(token) {
  return typeof token === 'string' && /^\d{5,16}:[A-Za-z0-9_-]{25,100}$/.test(token);
}
function cleanName(from) {
  const label = [from?.first_name,from?.last_name].filter(Boolean).join(' ') || from?.username || 'Telegram friend';
  return String(label).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,64);
}
function cleanRecipient(raw) {
  if (!raw || !/^\d{1,20}$/.test(String(raw.id)) || !THRESHOLDS.includes(Number(raw.threshold))) return null;
  return {id:String(raw.id),name:String(raw.name||'Telegram friend').slice(0,64),
    threshold:Number(raw.threshold),enabled:raw.enabled===true,
    sentUid:String(raw.sentUid||''),sentAt:Number(raw.sentAt)||0,
    lastAttempt:Number(raw.lastAttempt)||0};
}
function publicRecipient(r) {
  return {id:r.id,name:r.name,threshold:r.threshold,enabled:r.enabled,
    lastSentAt:r.sentAt || null};
}
class FriendAlerts {
  constructor(folder, storage, request=telegramRequest, onChange=()=>{}) {
    this.file=path.join(folder,'istaroth-friend-alerts.json');
    this.storage=storage;this.request=request;this.onChange=onChange;
    this.token='';this.username='';this.invite=crypto.randomBytes(18).toString('base64url');
    this.recipients=[];this.offset=0;this.lastError='';this.polling=null;this.sending=null;
    this.lastTest=0;this.timer=null;
    this.load();
  }
  load() {
    try {
      const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if (typeof raw.username==='string' && /^[A-Za-z0-9_]{5,32}$/.test(raw.username)) this.username=raw.username;
      if (typeof raw.invite==='string' && /^[A-Za-z0-9_-]{20,64}$/.test(raw.invite)) this.invite=raw.invite;
      this.recipients=(Array.isArray(raw.recipients)?raw.recipients:[]).map(cleanRecipient).filter(Boolean).slice(0,MAX_FRIENDS);
      this.offset=Number.isSafeInteger(raw.offset)&&raw.offset>=0?raw.offset:0;
      if (raw.secret) {
        if (!this.storage?.isEncryptionAvailable?.()) throw Error('OS encryption unavailable');
        const secret=this.storage.decryptString(Buffer.from(raw.secret,'base64'));
        if (!validToken(secret)) throw Error('Invalid saved token');
        this.token=secret;
      }
    } catch(e) {
      if(e.code!=='ENOENT')this.lastError='Bot credentials could not be restored securely. Reconnect your bot.';
    }
  }
  persist() {
    const object={version:1,username:this.username,invite:this.invite,offset:this.offset,
      recipients:this.recipients};
    if(this.token){
      if(!this.storage?.isEncryptionAvailable?.()) throw Error('OS encryption is unavailable. Bot token cannot be saved safely.');
      object.secret=this.storage.encryptString(this.token).toString('base64');
    }
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temporary=this.file+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify(object),{encoding:'utf8',mode:0o600});
    fs.renameSync(temporary,this.file);
  }
  status() {
    return {connected:!!this.token,username:this.username,
      inviteUrl:this.token&&this.username?'https://t.me/'+this.username+'?start=join_'+this.invite:'',
      recipients:this.recipients.map(publicRecipient),error:this.lastError,
      pcRequired:true};
  }
  changed() { try { this.onChange(this.status()); } catch {} }
  async connect(input) {
    const token=String(input||'').trim();
    if(!validToken(token))throw Error('Enter a valid bot token from @BotFather.');
    if(!this.storage?.isEncryptionAvailable?.())throw Error('Windows encryption is unavailable. Cannot securely save the bot token.');
    let bot;
    try{bot=await this.request(token,'getMe',{});}catch{throw Error('Telegram could not verify this token. Check @BotFather and your connection.');}
    if(!bot?.is_bot || !/^[A-Za-z0-9_]{5,32}$/.test(String(bot.username||'')))throw Error('Telegram did not return a valid bot username.');
    // Token changes invalidate old invitations and subscriptions.
    this.token=token;this.username=bot.username;this.invite=crypto.randomBytes(18).toString('base64url');
    this.recipients=[];this.offset=0;this.lastError='';
    this.persist();this.changed();
    await this.poll().catch(()=>{});
    return this.status();
  }
  disconnect() {
    this.token='';this.username='';this.invite=crypto.randomBytes(18).toString('base64url');
    this.recipients=[];this.offset=0;this.lastError='';
    this.persist();this.changed();return this.status();
  }
  rotateInvite() {
    if(!this.token)throw Error('Connect a bot first.');
    this.invite=crypto.randomBytes(18).toString('base64url');
    this.persist();this.changed();return this.status();
  }
  setRecipient(id,changes) {
    const r=this.recipients.find(x=>x.id===String(id));
    if(!r)throw Error('This friend has not opted in.');
    if(typeof changes?.enabled==='boolean')r.enabled=changes.enabled;
    if(THRESHOLDS.includes(Number(changes?.threshold))){
      if(r.threshold!==Number(changes.threshold)){r.sentUid='';r.sentAt=0;r.lastAttempt=0;}
      r.threshold=Number(changes.threshold);
    }
    this.persist();this.changed();return this.status();
  }
  removeRecipient(id) {
    const n=this.recipients.length;
    this.recipients=this.recipients.filter(x=>x.id!==String(id));
    if(this.recipients.length===n)throw Error('Friend not found.');
    this.persist();this.changed();return this.status();
  }
  async poll() {
    if(!this.token)return this.status();
    if(this.polling)return this.polling;
    this.polling=(async()=>{
      try {
        const updates=await this.request(this.token,'getUpdates',{
          offset:this.offset,limit:50,timeout:0,allowed_updates:['message']
        });
        if(!Array.isArray(updates))throw Error('Unexpected Telegram updates.');
        let dirty=false;
        for(const event of updates){
          if(!Number.isSafeInteger(event.update_id))continue;
          this.offset=Math.max(this.offset,event.update_id+1);dirty=true;
          const msg=event.message,chat=msg?.chat;
          if(!msg || chat?.type!=='private' || !/^\d{1,20}$/.test(String(chat.id)))continue;
          const id=String(chat.id),raw=String(msg.text||'').trim();
          const command=raw.split(/\s+/)[0].split('@')[0];
          if(command==='/stop'){
            this.recipients=this.recipients.filter(x=>x.id!==id);
            await this.request(this.token,'sendMessage',{chat_id:id,text:'You are unsubscribed from Istaroth resin alerts. To rejoin, use a new invitation link.'}).catch(()=>{});
          }else if(command==='/start' && raw.split(/\s+/)[1]==='join_'+this.invite) {
            let friend=this.recipients.find(x=>x.id===id);
            if(!friend && this.recipients.length<MAX_FRIENDS){
              friend={id,name:cleanName(msg.from),threshold:180,enabled:false,sentUid:'',sentAt:0,lastAttempt:0};
              this.recipients.push(friend);
            }
            if(friend){
              friend.name=cleanName(msg.from);
              await this.request(this.token,'sendMessage',{chat_id:id,text:'Invitation received! Ask your friend to enable your alerts in Istaroth. Send /stop to unsubscribe anytime.'}).catch(()=>{});
            }else await this.request(this.token,'sendMessage',{chat_id:id,text:'This Istaroth friend list is full.'}).catch(()=>{});
          }else if(command==='/help'||command==='/start'){
            await this.request(this.token,'sendMessage',{chat_id:id,text:'Istaroth resin alerts: open the invitation link from your friend to join. Send /stop to unsubscribe.'}).catch(()=>{});
          }
        }
        if(dirty){this.persist();this.changed();}
        this.lastError='';
      }catch(e){
        this.lastError=e.message==='Unexpected Telegram updates.'?e.message:'Telegram connection unavailable or another app is polling this bot.';
        this.changed();
      }
      return this.status();
    })();
    try{return await this.polling;}finally{this.polling=null;}
  }
  start() {
    if(this.timer)return;
    this.timer=setInterval(()=>this.poll().catch(()=>{}),POLL_MS);
    this.timer.unref?.();
    this.poll().catch(()=>{});
  }
  stop() {if(this.timer)clearInterval(this.timer);this.timer=null;}
  async test(id) {
    const r=this.recipients.find(x=>x.id===String(id));
    if(!r||!r.enabled)throw Error('Enable this friend before sending a test.');
    if(!this.token)throw Error('Connect a Telegram bot first.');
    if(Date.now()-this.lastTest<60000)throw Error('Wait one minute between test alerts.');
    this.lastTest=Date.now();
    try {await this.request(this.token,'sendMessage',{
      chat_id:r.id,text:'Istaroth test alert: your friend has enabled resin notifications for you.'
    });}catch{throw Error('Could not send the test. The friend may have blocked the bot.');}
    return this.status();
  }
  async notify(resin,role,quiet=false,now=Date.now()) {
    if(!this.token || quiet || !role?.uid || !resin || now-Number(resin.at)>FRESH_MS ||
      Number(resin.at)>now+60000 || !Number.isInteger(resin.amount) ||
      !Number.isInteger(resin.cap) || resin.amount<0 || resin.amount>resin.cap)return;
    if(this.sending)return this.sending;
    this.sending=(async()=>{
      let changed=false;
      for(const r of this.recipients){
        const threshold=Math.min(r.threshold,resin.cap);
        if(resin.amount<threshold){
          if(r.sentAt){r.sentAt=0;r.sentUid='';r.lastAttempt=0;changed=true;}
          continue;
        }
        if(!r.enabled || (r.sentAt && r.sentUid===String(role.uid)) ||
          now-r.lastAttempt<RETRY_MS)continue;
        r.lastAttempt=now;changed=true;
        const name=String(role.nickname||'Your friend').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,40);
        const msg='⏳ Istaroth · Resin alert\n'+name+' has approximately '+resin.amount+'/'+resin.cap+
          ' Original Resin'+(resin.amount>=resin.cap?' (full).':'.')+
          '\nEstimated from HoYoLAB. Send /stop to unsubscribe.';
        try{
          await this.request(this.token,'sendMessage',{chat_id:r.id,text:msg});
          r.sentAt=now;r.sentUid=String(role.uid);changed=true;
        }catch{this.lastError='A friend alert could not be delivered. Check bot access and connection.';}
      }
      if(changed){this.persist();this.changed();}
    })();
    try{await this.sending;}finally{this.sending=null;}
  }
}
module.exports={FriendAlerts,telegramRequest,validToken,cleanRecipient,THRESHOLDS};
