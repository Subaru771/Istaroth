import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Website provides real HoYoLAB pairing and existing Windows path without fake OAuth',()=>{
 const html=readFileSync('public/index.html','utf8'),js=readFileSync('public/app.js','utf8');
 for(const id of ['web-cookie','web-preview','web-role-select','web-consent','web-connect','begin-pair','save-estimate'])
   assert.match(html,new RegExp('id="'+id+'"'));
 for(const endpoint of ['/api/account/preview','/api/account/connect','/api/account/estimate'])
   assert.ok(js.includes(endpoint));
 assert.match(html,/hoyolab\.com/);
 assert.match(html,/cannot pair the accounts/);
 assert.doesNotMatch(html,/id="estimate-start"/);
 assert.doesNotMatch(html,/Istaroth Mobile Connector/);
 assert.match(js,/istaroth:\/\/community\/connect/);
});
