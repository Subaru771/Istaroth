'use strict';
// Local observations only. Never extrapolate consumption or record an unobserved claim as fact.
const fs=require('node:fs');
const path=require('node:path');
const DEFAULT={notifications:true,threshold:180,quietStart:'23:00',quietEnd:'08:00',quietEnabled:false};
const MAX_POINTS=2500;
function validSettings(x){const s={...DEFAULT};if(x&&typeof x==='object'){
  if(typeof x.notifications==='boolean')s.notifications=x.notifications;
  if([80,120,160,180,200].includes(Number(x.threshold)))s.threshold=Number(x.threshold);
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(x.quietStart||''))s.quietStart=x.quietStart;
  if(/^([01]\d|2[0-3]):[0-5]\d$/.test(x.quietEnd||''))s.quietEnd=x.quietEnd;
  s.quietEnabled=!!x.quietEnabled;
}return s;}
function inQuiet(now,s){if(!s.quietEnabled)return false;const minutes=new Date(now).getHours()*60+new Date(now).getMinutes();const parse=h=>+h.slice(0,2)*60+ +h.slice(3);const a=parse(s.quietStart),b=parse(s.quietEnd);return a===b?false:a<b?minutes>=a&&minutes<b:minutes>=a||minutes<b;}
function cleanPoint(p){if(!p||typeof p!=='object')return null;const at=Number(p.at),value=Number(p.value),cap=Number(p.cap),uid=String(p.uid||'');if(!/^\d{8,12}$/.test(uid)||!Number.isFinite(at)||at<1577836800000||at>Date.now()+60000||!Number.isInteger(value)||!Number.isInteger(cap)||cap<1||cap>500||value<0||value>cap)return null;return {at,value,cap,uid};}
class ResinTelemetry{
 constructor(userData){this.file=path.join(userData,'resin-observations-v2.json');this.settingsFile=path.join(userData,'resin-alerts-v2.json');this.points=[];this.settings=DEFAULT;this.alerted={};this.load();}
 load(){try{const x=JSON.parse(fs.readFileSync(this.file,'utf8'));this.points=(Array.isArray(x)?x:[]).map(cleanPoint).filter(Boolean).slice(-MAX_POINTS);}catch{}try{const x=JSON.parse(fs.readFileSync(this.settingsFile,'utf8'));this.settings=validSettings(x.settings);this.alerted=x.alerted&&typeof x.alerted==='object'?x.alerted:{};}catch{}}
 write(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const f=file+'.tmp';fs.writeFileSync(f,JSON.stringify(data),{mode:0o600});fs.renameSync(f,file);}
 append(note,uid){const point=cleanPoint({at:note?.fetchedAt,value:note?.resin?.value,cap:note?.resin?.cap,uid});if(!point)return false;const prev=this.points[this.points.length-1];if(prev&&prev.uid===point.uid&&Math.abs(prev.at-point.at)<60000)return false;this.points.push(point);this.points=this.points.filter(p=>p.at>=Date.now()-90*86400000).slice(-MAX_POINTS);this.write(this.file,this.points);return true;}
 getHistory(uid){const p=this.points.filter(x=>x.uid===String(uid)).slice(-500);const seven=Date.now()-7*86400000;const recent=p.filter(x=>x.at>=seven);const daily=[];for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*86400000);const date=d.toLocaleDateString('en-CA');const values=recent.filter(x=>new Date(x.at).toLocaleDateString('en-CA')===date);daily.push({date,label:d.toLocaleDateString(undefined,{weekday:'short'}),count:values.length,average:values.length?Math.round(values.reduce((s,x)=>s+x.value,0)/values.length):null,atCap:values.filter(x=>x.value>=x.cap).length});}
 return {uid:String(uid||''),points:p.slice(-100),count:recent.length,observedCapped:recent.filter(x=>x.value>=x.cap).length,daily};}
 options(next){if(next){this.settings=validSettings({...this.settings,...next});this.write(this.settingsFile,{settings:this.settings,alerted:this.alerted});}return {...this.settings};}
 shouldAlert(note,uid,now=Date.now()){
   const point=cleanPoint({at:note?.fetchedAt,value:note?.resin?.value,cap:note?.resin?.cap,uid});if(!point)return null;
   // Alerts use authenticated readings and time projections; never generate new notifications from stale (>30m) readings.
   if(now-point.at>30*60000)return null;
   const key=point.uid;const threshold=Math.min(this.settings.threshold,point.cap);const projected=Math.min(point.cap,point.value+Math.floor(Math.max(0,now-point.at)/480000));
   if(projected<threshold){if(this.alerted[key]!==undefined){delete this.alerted[key];this.write(this.settingsFile,{settings:this.settings,alerted:this.alerted});}return null;}
   if(!this.settings.notifications||inQuiet(now,this.settings)||this.alerted[key]===threshold)return null;
   this.alerted[key]=threshold;this.write(this.settingsFile,{settings:this.settings,alerted:this.alerted});
   return {title:projected>=point.cap?'Original Resin is full':`Original Resin reached ${threshold}`,body:`Estimated ${projected}/${point.cap} resin · ${note.account?.nickname||'Genshin Impact'}.`};
 }
}
module.exports={ResinTelemetry,validSettings,inQuiet,cleanPoint};
