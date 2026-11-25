import test from 'node:test';
import assert from 'node:assert/strict';
import {telegram,errorMessage} from '../src/lib.js';
const env={BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'};
test('Telegram bad token returns safe getMe error, not secret',async()=>{
  const bad=()=>Promise.resolve(new Response(JSON.stringify({ok:false,description:'Bad token'}),{status:401}));
  await assert.rejects(telegram(env,'getMe',{},bad),e=>e.message==='Telegram getMe returned HTTP 401'&&!e.message.includes(env.BOT_TOKEN));
});
test('Telegram fetch failure is classified by operation, never raw URL',async()=>{
  const bad=()=>Promise.reject(new Error('Failed to fetch https://api.telegram.org/bot'+env.BOT_TOKEN));
  await assert.rejects(telegram(env,'getMe',{},bad),e=>e.message==='Telegram getMe network connection failed.'&&!e.message.includes(env.BOT_TOKEN));
});
test('Telegram timeout classified safely',async()=>{
  const bad=()=>Promise.reject(Object.assign(new Error('timeout'),{name:'TimeoutError'}));
  await assert.rejects(telegram(env,'setWebhook',{},bad),e=>e.message==='Telegram setWebhook request timed out.');
});
test('Sanitized error messages remain useful to the owner',()=>{
  assert.equal(errorMessage(Error('Telegram setWebhook returned HTTP 400')),'Telegram setWebhook returned HTTP 400');
});
