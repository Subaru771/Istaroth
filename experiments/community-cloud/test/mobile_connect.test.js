import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('No native mobile connector routes or app links remain in cloud-only build',()=>{
 const worker=readFileSync('src/worker.js','utf8');
 const page=readFileSync('public/index.html','utf8');
 const js=readFileSync('public/app.js','utf8');
 assert.ok(!worker.includes("route==='/api/link/roles'"));
 assert.ok(!worker.includes('async function pairingRoles('));
 assert.ok(!page.includes('Istaroth Mobile Connector'));
 assert.ok(!js.includes('istaroth-connect://'));
});
