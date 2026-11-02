'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {UpdateService,validRepo,newer,versionParts}=require('./update-service');

assert.equal(validRepo('Subaru771/Istaroth'),'Subaru771/Istaroth');
assert.equal(validRepo('other/repo'),'');
assert.deepEqual(versionParts('1.0'),[1,0,0]);
assert.deepEqual(versionParts('v1.0.1'),[1,0,1]);
assert.equal(versionParts('v1.0.1-evil'),null);
assert.equal(newer('v1.0.1','1.0.0'),true);
assert.equal(newer('v1.0','1.0.0'),false);
assert.equal(newer('v1.0.0','1.0'),false);
assert.equal(newer('v1.2','1.11.0'),false);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'istaroth-update-test-'));
(async()=>{
  try{
    const updater=new UpdateService(dir,'1.0.0');
    assert.equal(updater.settings().repo,'Subaru771/Istaroth');
    assert.equal(updater.settings().autoDownload,false);
    updater.settings({repo:'attacker/repo',autoDownload:true,autoCheck:false});
    assert.equal(updater.settings().repo,'Subaru771/Istaroth');
    assert.equal(updater.settings().autoDownload,false);
    await assert.rejects(updater.check(true),/unsigned|automatic download/i);
    assert.equal(updater.status().ready,false);
    const reloaded=new UpdateService(dir,'1.0.0');
    assert.equal(reloaded.settings().autoCheck,false);
    assert.equal(reloaded.settings().autoDownload,false);
    console.log('11 release discovery/security assertions passed.');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
