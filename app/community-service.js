'use strict';
// The Community app is a separately hosted, multi-user HTTPS service.
// No HoYoLAB/Telegram credentials are transferred from desktop to Community.
// All remote content loads in an isolated, sandboxed BrowserWindow with no preload.
const fs=require('node:fs');
const path=require('node:path');
const https=require('node:https');

function safeCommunityUrl(value){
  try{
    const url=new URL(String(value||'').trim());
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port||
      url.pathname!=='/'||url.hostname.length>253)return '';
    const host=url.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
      host.endsWith('.internal')||host.endsWith('.onion')||host==='127.0.0.1'||
      host==='[::1]'||/^\d+(?:\.\d+){3}$/.test(host)||
      host.indexOf('.')<1)return '';
    return url.origin;
  }catch{return '';}
}
function isCommunityNavigation(url,origin){
  try{
    const parsed=new URL(url);
    return parsed.protocol==='https:'&&parsed.origin===origin&&!parsed.username&&!parsed.password;
  }catch{return false;}
}
function safeExternalAuth(url){
  try{
    const u=new URL(url);
    return u.protocol==='https:'&&
      ['t.me','telegram.me','telegram.org'].includes(u.hostname)&&!u.username&&!u.password;
  }catch{return false;}
}
function probeCommunity(origin,request=https){
  return new Promise(resolve=>{
    const url=new URL('/health',origin);
    const req=request.get(url,{
      timeout:8000,
      headers:{Accept:'application/json'}
    },response=>{
      let text='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{text+=chunk;if(text.length>8192)req.destroy();});
      response.on('end',()=>{
        let healthy=false;
        try{
          const obj=JSON.parse(text);
          healthy=response.statusCode===200 && typeof obj==='object' &&
            (obj.ok===true||obj.status==='online'||obj.status==='ok');
        }catch{}
        resolve({online:healthy,reason:healthy?'Connected':response.statusCode===404?'App health endpoint not found':'Server did not confirm its readiness'});
      });
      response.on('error',()=>resolve({online:false,reason:'Server response failed'}));
    });
    req.on('timeout',()=>req.destroy());
    req.on('error',()=>resolve({online:false,reason:'Cannot reach Community server'}));
  });
}
class CommunityService{
  constructor(userData,dependencies){
    this.file=path.join(userData,'istaroth-community-config.json');
    this.BrowserWindow=dependencies.BrowserWindow;
    this.shell=dependencies.shell;
    this.session=dependencies.session;
    this.icon=dependencies.icon;
    this.request=dependencies.https||https;
    this.window=null;
    this.url='';
    try{
      const data=JSON.parse(fs.readFileSync(this.file,'utf8'));
      this.url=safeCommunityUrl(data?.url);
    }catch{}
  }
  status(){return {configured:!!this.url,url:this.url,windowOpen:!!this.window&&!this.window.isDestroyed()};}
  configure(value){
    const url=safeCommunityUrl(value);
    if(!url)throw Error('Enter the HTTPS URL of your deployed Istaroth Community app (not the personal resin Worker).');
    const previous=this.url;
    this.url=url;
    try{
      fs.mkdirSync(path.dirname(this.file),{recursive:true});
      fs.writeFileSync(this.file+'.tmp',JSON.stringify({url}),{encoding:'utf8',mode:0o600});
      fs.renameSync(this.file+'.tmp',this.file);
    }catch(e){this.url=previous;throw Error('Cannot save Community URL.');}
    if(this.window&&!this.window.isDestroyed())this.window.close();
    return this.status();
  }
  disconnect(){
    this.url='';
    if(this.window&&!this.window.isDestroyed())this.window.close();
    try{fs.unlinkSync(this.file);}catch(e){if(e.code!=='ENOENT')throw e;}
    return this.status();
  }
  async check(){
    if(!this.url)return { ...this.status(),online:false,reason:'Configure the shared app address first.'};
    const status=await probeCommunity(this.url,this.request);
    return {...this.status(),...status};
  }
  open(){
    if(!this.url)throw Error('Enter your deployed Community app address first.');
    if(this.window&&!this.window.isDestroyed()){
      this.window.show();this.window.focus();
      return this.status();
    }
    const origin=this.url;
    const win=new this.BrowserWindow({
      title:'Istaroth · Community',width:1100,height:790,
      minWidth:640,minHeight:520,autoHideMenuBar:true,
      backgroundColor:'#151324',
      icon:this.icon,
      webPreferences:{
        partition:'persist:istaroth-community',
        nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,
        javascript:true
      }
    });
    this.window=win;
    const wc=win.webContents;
    wc.session.setPermissionRequestHandler((_contents,_permission,reply)=>reply(false));
    wc.setWindowOpenHandler(({url})=>{
      if(safeExternalAuth(url))this.shell.openExternal(url).catch(()=>{});
      return {action:'deny'};
    });
    wc.on('will-navigate',(event,url)=>{
      if(!isCommunityNavigation(url,origin)){
        event.preventDefault();
        if(safeExternalAuth(url))this.shell.openExternal(url).catch(()=>{});
      }
    });
    wc.on('will-redirect',(event,url)=>{
      if(!isCommunityNavigation(url,origin))event.preventDefault();
    });
    win.on('closed',()=>{if(this.window===win)this.window=null;});
    win.loadURL(origin).catch(()=>{});
    return this.status();
  }
}
module.exports={CommunityService,safeCommunityUrl,isCommunityNavigation,safeExternalAuth,probeCommunity};
