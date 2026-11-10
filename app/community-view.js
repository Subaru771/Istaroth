'use strict';
// Embed a deployed Community PWA with Electron's sandboxed WebContentsView.
// The PWA keeps its own first-party Telegram login cookies. No Node preload, no
// HoYoLAB session partition sharing, no automatic credential export.
const {WebContentsView,shell}=require('electron');
const {
  isAllowedCommunityNavigation,telegramLoginLink,boundedViewRect
}=require('./community-integration');

class CommunityView {
  constructor(getWindow,onState){
    this.getWindow=getWindow;
    this.onState=onState;
    this.url='';
    this.view=null;
    this.attached=false;
  }
  send(status,message=''){
    this.onState?.({state:status,message});
  }
  create(url){
    this.destroy();
    this.url=url;
    const view=new WebContentsView({
      webPreferences:{
        partition:'persist:istaroth-community',
        nodeIntegration:false,
        contextIsolation:true,
        sandbox:true,
        webSecurity:true,
        allowRunningInsecureContent:false,
        webviewTag:false
      }
    });
    this.view=view;
    view.setBackgroundColor('#0d1020');
    const web=view.webContents;
    web.setWindowOpenHandler(({url:href})=>{
      const login=telegramLoginLink(href);
      if(login)shell.openExternal(login).catch(()=>{});
      return {action:'deny'};
    });
    const navigation=(event,href)=>{
      const destination=typeof href==='string'?href:event?.url;
      if(!isAllowedCommunityNavigation(destination,url))event.preventDefault();
    };
    web.on('will-navigate',navigation);
    web.on('will-redirect',navigation);
    // The standalone PWA requires no microphone, webcam, location, or notifications.
    web.session.setPermissionRequestHandler((_sender,_permission,callback)=>callback(false));
    web.session.setPermissionCheckHandler(()=>false);
    web.on('did-finish-load',()=>this.send('ready','Community is loaded. Sign in with Telegram to continue.'));
    web.on('did-fail-load',(_event,code,_description,_url,mainFrame)=>{
      if(mainFrame&&code!==-3)this.send('offline','Community could not be loaded. Check the deployed Worker address.');
    });
    web.on('render-process-gone',()=>this.send('offline','Community was interrupted. Select Reload.'));
    this.send('loading','Connecting to Istaroth Community…');
    web.loadURL(url).catch(()=>this.send('offline','Could not reach the Community service. Deploy it first.'));
  }
  show(url,rect){
    const window=this.getWindow();
    if(!window||window.isDestroyed()||!url)return false;
    const box=boundedViewRect(rect,window.getContentSize());
    if(!box){this.hide();return false;}
    if(!this.view||this.view.webContents.isDestroyed()||url!==this.url)this.create(url);
    if(!this.attached){window.contentView.addChildView(this.view);this.attached=true;}
    this.view.setBounds(box);
    return true;
  }
  hide(){
    const win=this.getWindow();
    if(this.view&&this.attached&&win&&!win.isDestroyed())win.contentView.removeChildView(this.view);
    this.attached=false;
  }
  reload(){
    if(!this.view||this.view.webContents.isDestroyed())return false;
    this.send('loading','Refreshing Community…');
    this.view.webContents.reload();
    return true;
  }
  destroy(){
    this.hide();
    if(this.view&&!this.view.webContents.isDestroyed())this.view.webContents.close();
    this.view=null;this.url='';
  }
  async disconnect(){
    this.destroy();
    // The community PWA is not the personal HoYoLAB profile or personal Cloud Worker.
    // Clear only the dedicated Community login and cache partition.
    const {session}=require('electron');
    const partition=session.fromPartition('persist:istaroth-community');
    await partition.clearStorageData();
    await partition.clearCache();
    this.send('disconnected','This PC is signed out of Community. The cloud service remains online.');
  }
}
module.exports={CommunityView};
