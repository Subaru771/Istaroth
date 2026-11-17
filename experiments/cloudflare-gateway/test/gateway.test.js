import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
test('staging health explicitly refuses to claim auth readiness',async()=>{
 const r=await worker.fetch(new Request('https://example.com/health'),{});
 assert.equal(r.status,200);
 const j=await r.json();
 assert.equal(j.authenticationReady,false);
});
test('password login is never accepted by staging worker',async()=>{
 const r=await worker.fetch(new Request('https://example.com/api/start',{method:'POST',body:'{}'}),{});
 assert.equal(r.status,501);
});
