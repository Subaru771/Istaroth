import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getRoles,getNotes,telegram} from '../src/lib.js';

const cookie='ltuid_v2=123456; ltoken_v2=this_is_a_test_secret_123456';
const fakeEnv={BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyzABCDE1234'};
const acceptOnlyCloudflareRedirect=async (url,options)=>{
  assert.equal(options.redirect,'manual','Cloudflare Workers rejects redirect:error');
  if(String(url).includes('getUserGameRolesByCookie'))return new Response(JSON.stringify({retcode:0,data:{list:[{game_uid:'800123456',region:'os_asia',nickname:'Traveler'}]}}),{status:200});
  if(String(url).includes('dailyNote'))return new Response(JSON.stringify({retcode:0,data:{current_resin:170,max_resin:200,resin_recovery_time:14400}}),{status:200});
  return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{status:200});
};

test('HoYoLAB role and resin requests use the Cloudflare-compatible redirect mode',async()=>{
  const roles=await getRoles(cookie,acceptOnlyCloudflareRedirect);
  assert.equal(roles[0].uid,'800123456');
  const note=await getNotes(cookie,'800123456','os_asia',acceptOnlyCloudflareRedirect);
  assert.equal(note.resin,170);
});
test('Telegram uses the Cloudflare-compatible redirect mode',async()=>{
  const result=await telegram(fakeEnv,'sendMessage',{chat_id:'111',text:'test'},acceptOnlyCloudflareRedirect);
  assert.equal(result.message_id,1);
});
test('redirects do not forward credential-bearing requests to a new host',async()=>{
  let calls=0;
  const redirect=async (url,options)=>{
    calls++;
    assert.equal(options.redirect,'manual');
    return new Response(null,{status:302,headers:{location:'https://attacker.example/steal'}});
  };
  await assert.rejects(getRoles(cookie,redirect),/redirected the request/);
  assert.equal(calls,2,'Only the two pre-approved HoYoLAB endpoints are tried');
  calls=0;
  await assert.rejects(telegram(fakeEnv,'sendMessage',{},redirect),/redirected the request/);
  assert.equal(calls,1);
});
test('worker source contains no unsupported redirect:error fetch options',()=>{
  assert.doesNotMatch(fs.readFileSync(new URL('../src/lib.js',import.meta.url),'utf8'),/redirect\s*:\s*['"]error['"]/);
  assert.doesNotMatch(fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8'),/redirect\s*:\s*['"]error['"]/);
});
