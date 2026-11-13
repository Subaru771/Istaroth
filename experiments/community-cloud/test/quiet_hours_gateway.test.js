import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inQuietHours} from '../src/worker.js';
const p=(file)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('quiet hours follow recipient timezone and support overnight spans',()=>{
  const overnight={enabled:true,start:'23:00',end:'08:00',timezone:'UTC'};
  assert.equal(inQuietHours(overnight,Date.parse('2026-11-13T23:59:00Z')),true);
  assert.equal(inQuietHours(overnight,Date.parse('2026-11-14T01:30:00Z')),true);
  assert.equal(inQuietHours(overnight,Date.parse('2026-11-14T08:00:00Z')),false);
  assert.equal(inQuietHours(overnight,Date.parse('2026-11-14T14:30:00Z')),false);
  assert.equal(inQuietHours({...overnight,enabled:false},Date.parse('2026-11-13T23:59:00Z')),false);
  assert.equal(inQuietHours({enabled:true,start:'22:00',end:'06:00',timezone:'Asia/Baghdad'},Date.parse('2026-11-13T20:00:00Z')),true);
});
test('mobile Community has direct gateway call to action with fragment-only handoff and private legacy methods',()=>{
  const html=p('public/index.html'),js=p('public/app.js');
  assert.match(html,/id="gateway-start"/);
  assert.match(html,/id="gateway-link"/);
  assert.match(html,/<summary>Other connection methods<\/summary>/);
  assert.match(js,/\/#code=/);
  assert.match(js,/api\('\/api\/link\/start'/);
});
test('quiet-hours storage is additive and does not alter existing users and sessions',()=>{
  const schema=p('db/0007_notification_quiet_hours.sql');
  assert.match(schema,/CREATE TABLE IF NOT EXISTS notification_quiet_hours/);
  assert.doesNotMatch(schema,/DROP TABLE|DELETE FROM|DATA_KEY|WEBHOOK_SECRET/i);
});
