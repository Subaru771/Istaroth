'use strict';
// Read-only HoYoLAB Battle Chronicle enrichment. Each endpoint fails independently.
// No credentials or unfiltered API response are ever passed to the renderer.
const https = require('node:https');
const {getAuthHeader,safeRole} = require('./hoyolab-sync');
const ORIGIN = 'https://bbs-api-os.hoyolab.com';
const DIARY_ORIGIN = 'https://sg-hk4e-api.hoyolab.com';
const MAX_RESPONSE = 3_000_000;
function nn(v) {const x=Number(v);return Number.isFinite(x)&&v!==null&&v!==''?x:null;}
function str(v,max=90){return typeof v==='string'?v.slice(0,max):'';}
function list(v,max=80){return Array.isArray(v)?v.slice(0,max):[];}
function value(v){return nn(v)??null;}
function request(url,cookie,body){return new Promise((resolve,reject)=>{
 const u=new URL(url);
 if(u.protocol!=='https:'||![new URL(ORIGIN).host,new URL(DIARY_ORIGIN).host].includes(u.host))return reject(Error('Endpoint not allowed'));
 const payload=body===undefined?null:JSON.stringify(body);
 const req=https.request(u,{method:payload?'POST':'GET',timeout:12000,headers:{
  'Cookie':cookie,'Accept':'application/json','Referer':'https://www.hoyolab.com/',
  'x-rpc-language':'en-us','x-rpc-client_type':'5',
  'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  ...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})
 }},res=>{
  if(res.statusCode!==200){res.resume();return reject(Error('HTTP '+res.statusCode));}
  let chunks='',size=0;
  res.setEncoding('utf8');res.on('data',part=>{size+=Buffer.byteLength(part);if(size>MAX_RESPONSE)res.destroy(Error('Response too large'));else chunks+=part;});
  res.on('end',()=>{try{const obj=JSON.parse(chunks);if(obj.retcode!==0)reject(Error('HoYoLAB code '+String(obj.retcode)+': '+str(obj.message,75)));else resolve(obj.data||{});}catch(e){reject(e);}});
  res.on('error',reject);
 });req.on('timeout',()=>req.destroy(Error('Request timed out')));req.on('error',reject);if(payload)req.write(payload);req.end();
});}
const params=role=>new URLSearchParams({role_id:role.uid,server:role.region});
function parseOverview(d){const s=d.stats||{};const r=d.role||{};
 return {name:str(r.nickname),level:value(r.level),
  days:value(s.active_day_number),achievements:value(s.achievement_number),
  characters:value(s.avatar_number),waypoints:value(s.way_point_number),domains:value(s.domain_number),
  abyss:str(s.spiral_abyss,30),
  oculi:list(s.anemoculus_number!==undefined?[['Anemoculus',s.anemoculus_number],['Geoculus',s.geoculus_number],['Electroculus',s.electroculus_number],['Dendroculus',s.dendroculus_number],['Hydroculus',s.hydroculus_number],['Pyroculus',s.pyroculus_number]]:[],12).filter(p=>p[1]!==undefined).map(p=>({name:p[0],count:value(p[1])})),
  chests:[['Common',s.common_chest_number],['Exquisite',s.exquisite_chest_number],['Precious',s.precious_chest_number],['Luxurious',s.luxurious_chest_number],['Remarkable',s.magic_chest_number]].map(([name,count])=>({name,count:value(count)})).filter(v=>v.count!==null),
  explorations:list(d.world_explorations,30).map(w=>({name:str(w.name),percent:value(w.exploration_percentage),level:value(w.level),type:str(w.type,24),offerings:list(w.offerings,12).map(o=>({name:str(o.name),level:value(o.level)}))})),
  homes:list(d.homes,8).map(h=>({level:value(h.level),name:str(h.name),comfort:value(h.comfort_num),items:value(h.item_num),visitors:value(h.visit_num)})),
  featured:list(d.avatars,25).map(a=>({id:value(a.id),name:str(a.name),element:str(a.element),level:value(a.level),rarity:value(a.rarity),friendship:value(a.fetter),constellations:value(a.actived_constellation_num)}))
 };}
function parseCharacters(d){const arr=list(d.avatars||d.list,130);return arr.map(c=>({id:value(c.id),name:str(c.name||c.name_text||('Character '+c.id)),level:value(c.level),rarity:value(c.rarity),element:str(c.element),friendship:value(c.fetter),constellations:value(c.actived_constellation_num),weapon:c.weapon?{name:str(c.weapon.name),level:value(c.weapon.level),refinement:value(c.weapon.affix_level),rarity:value(c.weapon.rarity)}:null,artifacts:list(c.reliquaries,7).map(a=>({name:str(a.name),level:value(a.level),rarity:value(a.rarity),position:value(a.pos)}))}));}
function parseAbyss(d){return {maxFloor:str(d.max_floor,40),stars:value(d.total_star),battles:value(d.total_battle_times),wins:value(d.total_win_times),schedule:str(d.schedule_id,40),floors:list(d.floors,20).map(f=>({floor:value(f.index),stars:value(f.star),max:value(f.max_star),chambers:list(f.levels,8).map(l=>({chamber:value(l.index),stars:value(l.star),max:value(l.max_star)}))}))};}
function parseTheater(d){const s=d.stat||d.stats||{};return {schedule:str(d.schedule_id,35),maxAct:value(s.max_round_id??d.max_round_id),stars:value(s.star_challenge_stella??d.star_challenge_stella),medals:value(s.medal_num??d.medal_num),detailAvailable:!!(d.data||d.detail||d.has_data),rounds:list(d.rounds||d.round_data||d.data?.rounds,20).map(r=>({round:value(r.round_id??r.round),stars:value(r.star)}))};}
function parseStygian(d){const s=d.data||d;return {schedule:str(s.schedule_id,36),challengeCount:value(s.challenge_num??s.total_challenge_num),maxDifficulty:value(s.max_difficulty??s.best_difficulty),records:list(s.records||s.challenge_records,30).map(r=>({difficulty:value(r.difficulty),time:value(r.time)}))};}
function parseDiary(d){const m=d.month_data||{},day=d.day_data||{};return {month:value(d.data_month??d.month),primogems:value(m.current_primogems),mora:value(m.current_mora),todayPrimogems:value(day.current_primogems),todayMora:value(day.current_mora),lastPrimogems:value(m.last_primogems),lastMora:value(m.last_mora),categories:list(m.group_by,24).map(g=>({name:str(g.action),count:value(g.num),percent:value(g.percent)}))};}
function parseCheckin(d){return {checkedIn:!!d.is_sign,days:value(d.total_sign_day),missed:value(d.sign_cnt_missed),firstTime:!!d.first_bind};}
function parseTCG(d){const s=d.stats||d;return {level:value(s.level??d.level),cards:value(s.card_num??d.card_num),achievements:value(s.achievement_num??d.achievement_num),wins:value(s.win_num??d.win_num),matches:value(s.total_battle_num??d.total_battle_num),nickname:str(d.nickname)};}
const DEFINITIONS=[
 {key:'profile',url:r=>`${ORIGIN}/game_record/genshin/api/index?${params(r)}`,parser:parseOverview},
 {key:'abyss',url:r=>`${ORIGIN}/game_record/genshin/api/spiralAbyss?${params(r)}&schedule_type=1`,parser:parseAbyss},
 {key:'abyssPrevious',url:r=>`${ORIGIN}/game_record/genshin/api/spiralAbyss?${params(r)}&schedule_type=2`,parser:parseAbyss},
 {key:'theater',url:r=>`${ORIGIN}/game_record/genshin/api/role_combat?${params(r)}`,parser:parseTheater},
 {key:'stygian',url:r=>`${ORIGIN}/game_record/genshin/api/hard_challenge?${params(r)}`,parser:parseStygian},
 {key:'checkin',url:()=>`${DIARY_ORIGIN}/event/sol/info?act_id=e202102251931481`,parser:parseCheckin},
 {key:'tcg',url:r=>`${ORIGIN}/game_record/genshin/api/gcg/basicInfo?${params(r)}`,parser:parseTCG}
];
async function fetchChronicle(hoyoSession,role,onUpdate=()=>{}){
 const safe=safeRole({game_uid:role?.uid,region:role?.region,nickname:role?.nickname,level:role?.level});
 if(!safe)throw Error('Invalid Genshin account');
 const cookie=await getAuthHeader(hoyoSession);
 const result={uid:safe.uid,region:safe.region,updatedAt:Date.now(),sections:{}};
 // Sequential small number of queries to avoid flooding HoYoLAB.
 for(const item of DEFINITIONS){
  try{
   let data=await request(item.url(safe),cookie,item.body?.(safe));
   result.sections[item.key]={status:'ok',at:Date.now(),data:item.parser(data)};
  }catch(e){result.sections[item.key]={status:'unavailable',at:Date.now(),error:String(e.message||e).slice(0,140)};}
  onUpdate(result,item.key);
 }
 return result;
}
module.exports={fetchChronicle,parseOverview,parseCharacters,parseAbyss,parseDiary,parseTCG,parseTheater,parseStygian,parseCheckin,DEFINITIONS};
