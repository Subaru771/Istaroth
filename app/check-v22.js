'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {ResinTelemetry,inQuiet}=require('./resin-telemetry');const {trayPng}=require('./tray-icon');const {newer,validRepo}=require('./update-service');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'teyvat-pulse-tests-'));const clock=Date.now();
try{
 const r=new ResinTelemetry(folder);const uid='800123456';const x={fetchedAt:clock,resin:{value:159,cap:200},account:{nickname:'Test'}};
 assert.equal(r.append(x,uid),true);assert.equal(r.append(x,uid),false);
 assert.equal(r.getHistory(uid).points.length,1);
 r.options({threshold:160,quietEnabled:false});assert.equal(r.shouldAlert(x,uid,clock),null);
 assert.match(r.shouldAlert(x,uid,clock+480000)?.title||'',/160/) ;assert.equal(r.shouldAlert(x,uid,clock+490000),null);
 assert.equal(r.options({threshold:160,quietStart:'22:00',quietEnd:'06:00'}).threshold,160);
 assert.equal(inQuiet(new Date('2026-10-30T23:00:00').getTime(),{quietEnabled:true,quietStart:'22:00',quietEnd:'06:00'}),true);
 assert.equal(inQuiet(new Date('2026-10-30T14:00:00').getTime(),{quietEnabled:true,quietStart:'22:00',quietEnd:'06:00'}),false);
 assert.equal(trayPng(182,200).subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(trayPng(null,200).length>200);
 assert.equal(newer('v2.3.0','2.2.0'),true);assert.equal(newer('2.1.9','2.2.0'),false);assert.equal(validRepo('Subaru771/Istaroth'),'Subaru771/Istaroth');assert.equal(validRepo('foo/bar'),'');assert.equal(validRepo('foo/../evil'),'');
 console.log('PASS telemetry/history/thresholds/quiet hours/tray PNG/update version & repo validation');
}finally{fs.rmSync(folder,{recursive:true,force:true});}
