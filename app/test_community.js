'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {CommunityService,safeCommunityUrl,isCommunityNavigation,safeExternalAuth,probeCommunity}=require('./community-service');
assert.equal(safeCommunityUrl('https://istaroth-community.username.workers.dev/'),'https://istaroth-community.username.workers.dev');
for(const unsafe of [
  'http://example.workers.dev','file:///etc/passwd','http://localhost:3000',
  'https://localhost','https://127.0.0.1','https://user:pass@example.com',
  'https://example.com:444','https://example.com/login',
  'https://example.com?token=hello','https://example.com#fake','https://site.local',
  'https://[::1]/'
])assert.equal(safeCommunityUrl(unsafe),'',unsafe);
assert.equal(isCommunityNavigation('https://service.workers.dev/dashboard','https://service.workers.dev'),true);
assert.equal(isCommunityNavigation('https://evil.workers.dev','https://service.workers.dev'),false);
assert.equal(safeExternalAuth('https://t.me/example'),true);
assert.equal(safeExternalAuth('https://evil.t.me.attacker.com/example'),false);
async function mockHealth(){
  const fake={
    get(_url,_opts,callback){
      const req={on(event,cb){if(event==='error')this.error=cb;return this;},destroy(){}};
      process.nextTick(()=>{
        const response={statusCode:200,on(event,callback){
          if(event==='data')process.nextTick(()=>callback(JSON.stringify({service:'Istaroth Community',online:true})));
          if(event==='end')process.nextTick(callback);
          return this;
        },setEncoding(){}};
        callback(response);
      });
      return req;
    }
  };
  return await probeCommunity('https://demo.workers.dev',fake);
}
async function run(){
  const health=await mockHealth();
  assert.equal(health.online,true,'The actual community Worker /health contract is online:true');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'istaroth-community-'));
  try{
    let loads=0;
    const BrowserWindow=class {
      constructor(options){
        assert.equal(options.webPreferences.sandbox,true);
        assert.equal(options.webPreferences.nodeIntegration,false);
        assert.equal(options.webPreferences.contextIsolation,true);
        this.events={};this.closed=false;this.webContents={
          session:{setPermissionRequestHandler(cb){assert.equal(typeof cb,'function');}},
          setWindowOpenHandler(cb){this.windowHandler=cb;},
          on(name,cb){this[name]=cb;}
        };
      }
      on(name,fn){this.events[name]=fn;}
      loadURL(url){loads++;assert.equal(url,'https://test.example.com');return Promise.resolve();}
      isDestroyed(){return this.closed;}
      show(){}
      focus(){}
      close(){this.closed=true;this.events.closed?.();}
    };
    const community=new CommunityService(folder,{BrowserWindow,shell:{openExternal:()=>Promise.resolve()},session:{}});
    assert.equal(community.status().configured,false);
    assert.throws(()=>community.open(),/Deploy|Enter/);
    community.configure('https://test.example.com/');
    assert.equal(community.status().configured,true);
    community.open();community.open();
    assert.equal(loads,1,'Existing Community window should be reused');
    const recreated=new CommunityService(folder,{BrowserWindow,shell:{openExternal:()=>Promise.resolve()},session:{}});
    assert.equal(recreated.status().url,'https://test.example.com');
    const nav=community.window.webContents['will-navigate'];
    let blocked=false;
    nav({preventDefault(){blocked=true;}},'https://attacker.example');
    assert.equal(blocked,true);
    community.disconnect();
    assert.equal(community.status().configured,false);
    assert.equal(fs.existsSync(community.file),false);
  }finally{fs.rmSync(folder,{recursive:true,force:true});}
  console.log('PASS Istaroth Community HTTPS URL, isolated window, navigation guard, health probe, reconnect & disconnect');
}
run().catch(err=>{console.error(err);process.exitCode=1;});
