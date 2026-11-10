'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {
  CommunityLink,safeCommunityUrl,isAllowedCommunityNavigation,
  telegramLoginLink,boundedViewRect
}=require('./community-integration');

const valid='https://istaroth-community.traveler77.workers.dev';
assert.equal(safeCommunityUrl(valid+'/'),valid);
assert.equal(safeCommunityUrl(valid),valid);
for(const invalid of [
  'http://istaroth-community.traveler77.workers.dev',
  'https://istaroth-community.traveler77.workers.dev.evil.test',
  'https://evil.example','https://127.0.0.1','http://localhost:3000',
  'https://istaroth-community.traveler77.workers.dev:444',
  'https://istaroth-cloud-resin.traveler77.workers.dev',
  'https://istaroth-community.traveler77.workers.dev/not-the-app',
  'https://istaroth-community.traveler77.workers.dev?key=secret',
  'https://u:p@istaroth-community.traveler77.workers.dev',
  'https://istaroth-community.traveler77.workers.dev#tab'
])assert.equal(safeCommunityUrl(invalid),'','A non-Community service must not be embedded: '+invalid);
assert.equal(isAllowedCommunityNavigation(valid+'/api/me',valid),true);
assert.equal(isAllowedCommunityNavigation('https://t.me/Example_bot',valid),false);
assert.equal(isAllowedCommunityNavigation(valid+'.evil.example',valid),false);
assert.equal(isAllowedCommunityNavigation('javascript:alert(1)',valid),false);
assert.equal(telegramLoginLink('https://t.me/My_Resin_Bot?start=hello').startsWith('https://t.me/'),true);
assert.equal(telegramLoginLink('https://t.me.evil.example/My_Resin_Bot'),'');
assert.equal(telegramLoginLink('http://t.me/My_Resin_Bot'),'');
assert.deepEqual(boundedViewRect({x:10,y:55,width:490,height:460},[610,770]),
  {x:10,y:55,width:490,height:460});
assert.deepEqual(boundedViewRect({x:-22,y:760,width:500,height:1000},[610,770]),null);
assert.equal(boundedViewRect({x:5,y:50,width:NaN,height:200},[610,770]),null);

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'istaroth-community-'));
try{
  const client=new CommunityLink(folder);
  assert.deepEqual(client.status(),{configured:false,url:''});
  assert.throws(()=>client.connect('https://phishing.example'),/Community/);
  assert.equal(client.connect(valid).configured,true);
  assert.equal(new CommunityLink(folder).status().url,valid,'Cloud service URL must persist');
  const disk=fs.readFileSync(path.join(folder,'istaroth-community-url.json'),'utf8');
  assert.ok(!disk.includes('token')&&!disk.includes('cookie')&&!disk.includes('key'),
    'Local Community file must store only a URL, not account credentials');
  client.disconnect();
  assert.equal(new CommunityLink(folder).status().configured,false);
}finally{fs.rmSync(folder,{recursive:true,force:true});}

const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'preload.js'),'utf8');
const main=fs.readFileSync(path.join(__dirname,'main.js'),'utf8');
const native=fs.readFileSync(path.join(__dirname,'community-view.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'community-ui.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'community-integration.css'),'utf8');
const pkg=require('./package.json');
const expected=[
  'pane-community','communityConnect','communityUrl','communityViewport','communityReload',
  'communityCopySession','communityClearClipboard','communityForget','communityExpand'
];
for(const id of expected)assert.ok(html.includes('id="'+id+'"'),'Missing Community UI element '+id);
for(const filename of ['community-integration.js','community-view.js','community-ui.js','community-integration.css'])
  assert.ok(pkg.build.files.includes(filename),'Windows EXE missing '+filename);
assert.ok(native.includes('persist:istaroth-community'),'Community session must be isolated');
assert.ok(native.includes('nodeIntegration:false')&&native.includes('sandbox:true'),'Community view must be sandboxed');
assert.ok(native.includes("return {action:'deny'}"),'Popups must be blocked');
assert.ok(native.includes('removeChildView')&&native.includes('webContents.close()'),'Native view cleanup must be explicit');
assert.ok(main.includes('requireLocalSender(event)'),'Community IPC must reject untrusted origins');
assert.ok(preload.includes("community:connect")&&preload.includes("community:show"),'Narrow Community IPC missing');
assert.ok(ui.includes("istaroth:screen-view")&&ui.includes("istaroth:dashboard-tab"),'Community overlay must hide on navigation');
assert.ok(css.includes('#pane-community')&&!/url\s*\(/i.test(css),'Community styling should use color only');
console.log('PASS Community service URL isolation, browser navigation, file persistence, IPC, layout and Windows bundle');
