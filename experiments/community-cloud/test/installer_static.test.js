import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Cloud updater preserves database, encryption, Telegram bot and webhook',()=>{
 const updater=fs.readFileSync(path.join(process.cwd(),'scripts','quick_update.ps1'),'utf8');
 assert.match(updater,/d1','migrations','apply/);
 assert.match(updater,/Wrangler @\('deploy'\)/);
 assert.match(updater,/be0700c0-6848-4ca7-bdba-b3c84313395c/);
 for(const forbidden of [/secret put/,/d1','create/,/api\/admin\/webhook/,/DATA_KEY\s*=/])
   assert.doesNotMatch(updater,forbidden);
 assert.ok(fs.readFileSync(path.join(process.cwd(),'scripts','quick_update.ps1')).subarray(0,3).equals(Buffer.from([239,187,191])));
});
test('Website contains only the intended connection choices; no native mobile installer',()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(html,/id="web-cookie"/);
 assert.match(html,/id="web-preview"/);
 assert.match(html,/id="web-role-select"/);
 assert.match(html,/id="web-consent"/);
 assert.match(html,/id="web-connect"/);
 assert.doesNotMatch(html,/id="start-estimate"/);
 assert.doesNotMatch(html,/Istaroth Mobile Connector/);
});
test('custom reminder migration is additive, preserves the legacy account data, and Worker update applies it',()=>{
  const migration=fs.readFileSync('db/0003_custom_resin_reminders.sql','utf8');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS self_reminder_rules/);
  assert.doesNotMatch(migration,/DROP TABLE|ALTER TABLE|DELETE FROM|UPDATE accounts/i);
  const page=fs.readFileSync('public/index.html','utf8');
  assert.match(page,/id="self-mode"/);
  assert.match(page,/id="self-thresholds"/);
  assert.match(page,/id="self-step"/);
  assert.match(fs.readFileSync('public/app.js','utf8'),/reminderInput\(\)/);
});

test('per-friend reminder migration is additive and frontend lets approved friends choose any resin count',()=>{
 const migration=fs.readFileSync('db/0004_friend_resin_rules.sql','utf8');
 assert.match(migration,/CREATE TABLE IF NOT EXISTS friend_reminder_rules/);
 assert.match(migration,/ON DELETE CASCADE/);
 assert.doesNotMatch(migration,/DROP TABLE|ALTER TABLE|DELETE FROM|UPDATE accounts/i);
 const js=fs.readFileSync('public/app.js','utf8');
 assert.match(js,/Notify this friend/);
 assert.match(js,/At several amounts/);
 assert.match(js,/Every N resin/);
 assert.match(js,/api\/friends\/update/);
});

test('private relay helper is opt-in and never resets existing Cloudflare secrets',()=>{
  const helper=fs.readFileSync(path.join(process.cwd(),'scripts','configure_relay.ps1'),'utf8');
  assert.match(helper,/secret put TELEGRAM_RELAY_KEY/);
  assert.match(helper,/TELEGRAM_RELAY_URL/);
  assert.match(helper,/wrangler\.toml/);
  assert.doesNotMatch(helper,/secret put (BOT_TOKEN|DATA_KEY|WEBHOOK_SECRET|ADMIN_SETUP_KEY)/);
  assert.doesNotMatch(helper,/d1 (create|delete|execute|migrations)/);
  assert.ok(fs.readFileSync(path.join(process.cwd(),'scripts','configure_relay.ps1')).subarray(0,3).equals(Buffer.from([239,187,191])),'Windows PowerShell 5.1 should read UTF-8 BOM');
});
