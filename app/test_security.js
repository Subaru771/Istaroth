'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {isOfficialHoYoUrl,isLocalAppUrl}=require('./trust-policy');
const {getAuthHeader,safeRole,parseNotes}=require('./hoyolab-sync');
const index=path.join(__dirname,'index.html');
const appUrl=pathToFileURL(index).href;
for(const url of [
 'https://www.hoyolab.com/',
 'https://api-account-os.hoyolab.com/',
 'https://hoyoverse.com/',
 'https://account.mihoyo.com/'
])assert.equal(isOfficialHoYoUrl(url),true,url);
for(const url of [
 'http://hoyolab.com/','https://hoyolab.com.attacker.example/',
 'https://hoyolab.com@attacker.example/',
 'https://attacker.example/?u=hoyolab.com',
 'https://hoyolab.com.evil.test/','file:///etc/hosts',
 'javascript:alert(1)','https://hoyolab.com:443@evil.test/'
])assert.equal(isOfficialHoYoUrl(url),false,url);
assert.equal(isLocalAppUrl(appUrl,index),true);
assert.equal(isLocalAppUrl(appUrl+'#widget',index),true);
assert.equal(isLocalAppUrl(pathToFileURL(path.join(__dirname,'preload.js')).href,index),false);
assert.equal(isLocalAppUrl('https://hoyolab.com/',index),false);
assert.equal(isLocalAppUrl('file://evil-host/index.html',index),false);
const main=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
assert.match(main,/function handleTrusted\(/);
assert.match(main,/event\.senderFrame\s*!==\s*mainWindow\.webContents\.mainFrame/);
assert.match(main,/isLocalAppUrl\(url,\s*path\.join\(__dirname,\s*'index\.html'\)\)/);
assert.match(main,/contextIsolation:\s*true/);
assert.match(main,/nodeIntegration:\s*false/);
assert.match(main,/sandbox:\s*true/);
const html=fs.readFileSync(index,'utf8');
assert.match(html,/Content-Security-Policy/);
assert.match(html,/object-src 'none'/);
assert.match(html,/script-src 'self'/);
assert.equal(safeRole({game_uid:'123456789',region:'os_asia'}).uid,'123456789');
assert.equal(safeRole({game_uid:'123456789',region:'unsafe'}),null);
assert.throws(()=>parseNotes({},{}),/valid resin/);
(async()=>{
  const header=await getAuthHeader({cookies:{get:async()=>[
    {name:'ltoken_v2',domain:'.hoyolab.com',value:'private-token'},
    {name:'ltuid_v2',domain:'hoyoverse.com',value:'valid-id'},
    {name:'cookie_token_v2',domain:'hoyoverse.com',value:'private-token-2'},
    {name:'stoken_v2',domain:'.hoyolab.com',value:'high-priv-token'},
    {name:'ltoken',domain:'.hoyolab.com.attacker.example',value:'attacker-token'},
    {name:'other_cookie',domain:'.hoyolab.com',value:'other-value'},
    {name:'stoken',domain:'example.com',value:'attacker-token'}
  ]}});
  assert.match(header,/ltoken_v2=private-token/);
  assert.match(header,/ltuid_v2=valid-id/);\n  assert.doesNotMatch(header,/cookie_token_v2|private-token-2|stoken_v2|high-priv-token/);
  assert.doesNotMatch(header,/attacker-token|other-value/);
  console.log('Istaroth trust boundaries, CSP, IPC, and cookie filtering checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
