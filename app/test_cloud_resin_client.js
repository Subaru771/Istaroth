'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {CloudResinClient,safeWorkerUrl}=require('./cloud-resin-client');
assert.equal(safeWorkerUrl('https://istaroth-demo.osman.workers.dev/'),'https://istaroth-demo.osman.workers.dev');
for(const rejected of [
  'http://demo.workers.dev','https://localhost','https://127.0.0.1',
  'https://workers.dev.evil.example','https://evil.example',
  'https://demo.workers.dev/path','https://u:p@demo.workers.dev',
  'https://demo.workers.dev?secret=x'
])assert.equal(safeWorkerUrl(rejected),'','Blocked invalid Worker URL: '+rejected);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'istaroth-cloud-tests-'));
try{
  const encryption={
    isEncryptionAvailable:()=>true,
    encryptString:s=>Buffer.from('sealed:'+s,'utf8'),
    decryptString:b=>b.toString('utf8').replace(/^sealed:/,'')
  };
  const cloud=new CloudResinClient(dir,encryption);
  assert.equal(cloud.isConfigured(),false);
  cloud.origin='https://istaroth-demo.osman.workers.dev';
  cloud.key='local_test_owner_secret_long_enough';
  cloud.persist();
  const bytes=fs.readFileSync(cloud.file,'utf8');
  assert.ok(!bytes.includes(cloud.key),'Owner API key must be encrypted on disk');
  const restored=new CloudResinClient(dir,encryption);
  assert.equal(restored.isConfigured(),true);
  assert.equal(restored.origin,cloud.origin);
  restored.disconnect();
  assert.equal(fs.existsSync(restored.file),false,'Local credential file must be removable');
  console.log('PASS Cloud Worker domain validation and local encrypted owner credentials');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
