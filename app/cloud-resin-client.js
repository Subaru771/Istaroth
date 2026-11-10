'use strict';
// Local Cloudflare Worker admin credentials are only held in Electron main.
// Renderer never receives the owner API key, HoYoLAB cookie, or Telegram bot token.
const fs=require('node:fs');
const path=require('node:path');
const https=require('node:https');

function safeWorkerUrl(value){
  try{
    const u=new URL(String(value||'').trim());
    if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev$/i.test(u.hostname)||
      (u.pathname!=='/'&&u.pathname!==''))return '';
    return u.origin;
  }catch{return '';}
}
function requestJson(origin,key,method,endpoint,data){
  return new Promise((resolve,reject)=>{
    const url=new URL(endpoint,origin);
    if(url.origin!==origin||!['/api/status','/api/bootstrap','/api/sync','/api/recipient','/api/remove','/api/test','/api/pause','/api/resume'].includes(url.pathname)){
      reject(Error('Invalid cloud operation.'));return;
    }
    const raw=data?Buffer.from(JSON.stringify(data),'utf8'):null;
    const req=https.request(url,{
      method,timeout:18000,
      headers:{Authorization:'Bearer '+key,Accept:'application/json',
        ...(raw?{'Content-Type':'application/json','Content-Length':raw.length}:{})}
    },response=>{
      let text='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{text+=chunk;if(text.length>160000)req.destroy(Error('Cloud response too large.'));});
      response.on('end',()=>{
        try{
          const parsed=JSON.parse(text);
          if(response.statusCode<200||response.statusCode>=300){
            reject(Error(response.statusCode===401?'Incorrect cloud owner key.':
              response.statusCode===404?'Cloud endpoint not found. Check Worker URL.':
              parsed?.error||'Cloud request failed.'));
          }else resolve(parsed);
        }catch(e){reject(e instanceof SyntaxError?Error('Invalid cloud response.'):e);}
      });
    });
    req.on('timeout',()=>req.destroy(Error('Cloud connection timed out.')));
    req.on('error',e=>reject(Error(/timed out/.test(e.message)?e.message:'Cannot reach your Cloudflare Worker.')));
    req.end(raw);
  });
}
class CloudResinClient{
  constructor(folder,storage){
    this.file=path.join(folder,'istaroth-cloud-resin.json');
    this.storage=storage;this.origin='';this.key='';this.lastError='';
    this.load();
  }
  load(){
    try{
      const info=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(!this.storage?.isEncryptionAvailable?.())throw Error('Windows credential encryption unavailable.');
      const url=safeWorkerUrl(info.url);
      const key=this.storage.decryptString(Buffer.from(info.key,'base64'));
      if(!url||!key||key.length>240)throw Error('Saved cloud configuration is invalid.');
      this.origin=url;this.key=key;
    }catch(e){if(e.code!=='ENOENT')this.lastError='Could not restore cloud owner key. Reconnect to your Worker.';}
  }
  persist(){
    if(!this.storage?.isEncryptionAvailable?.())throw Error('Windows encryption is unavailable.');
    const data=JSON.stringify({url:this.origin,key:this.storage.encryptString(this.key).toString('base64')});
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    const temp=this.file+'.tmp';
    fs.writeFileSync(temp,data,{encoding:'utf8',mode:0o600});
    fs.renameSync(temp,this.file);
  }
  isConfigured(){return !!(this.origin&&this.key);}
  async status(){
    if(!this.isConfigured())return {configured:false,error:this.lastError||''};
    try{
      const remote=await requestJson(this.origin,this.key,'GET','/api/status');
      return {configured:true,url:this.origin,remote};
    }catch(e){return {configured:true,url:this.origin,error:e.message};}
  }
  async configure(url,secret){
    const origin=safeWorkerUrl(url),key=String(secret||'').trim();
    if(!origin)throw Error('Use the HTTPS address of your Cloudflare workers.dev service.');
    if(key.length<24||key.length>240)throw Error('Enter the private cloud owner key (at least 24 characters).');
    if(!this.storage?.isEncryptionAvailable?.())throw Error('Windows encryption is unavailable.');
    // Verify credentials against the remote Worker before changing local state.
    const remote=await requestJson(origin,key,'GET','/api/status');
    this.origin=origin;this.key=key;this.lastError='';
    this.persist();
    return {configured:true,url:origin,remote};
  }
  disconnect(){
    this.origin='';this.key='';this.lastError='';
    try{fs.unlinkSync(this.file);}catch(e){if(e.code!=='ENOENT')throw e;}
    return {configured:false};
  }
  async action(name,payload){
    if(!this.isConfigured())throw Error('Connect your cloud Worker first.');
    const routes={bootstrap:'/api/bootstrap',sync:'/api/sync',recipient:'/api/recipient',
      remove:'/api/remove',test:'/api/test',pause:'/api/pause',resume:'/api/resume'};
    if(!Object.hasOwn(routes,name))throw Error('Unsupported cloud command.');
    const body=['recipient','remove','test'].includes(name)?payload:null;
    await requestJson(this.origin,this.key,'POST',routes[name],body);
    return this.status();
  }
}
module.exports={CloudResinClient,safeWorkerUrl,requestJson};
