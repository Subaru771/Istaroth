'use strict';
// Private connection to an owner-deployed Istaroth Community service.
// A URL alone is stored on disk. Sign-in is handled by an isolated Chromium session.
const fs=require('node:fs');
const path=require('node:path');
const {URL}=require('node:url');

function safeCommunityUrl(input){
  try{
    if(typeof input!=='string'||input.length>240)return '';
    const value=input.trim();
    const parsed=new URL(value);
    const labels=parsed.hostname.toLowerCase().split('.');
    // Only accept the dedicated Istaroth Community Worker, not arbitrary websites
    // or the separate single-user Istaroth resin Worker.
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
       parsed.search||parsed.hash||(parsed.pathname!=='/'&&parsed.pathname!=='')||
       labels.length!==4||labels[0]!=='istaroth-community'||
       !/^[a-z0-9-]{1,63}$/.test(labels[1])||
       labels[2]!=='workers'||labels[3]!=='dev')return '';
    return parsed.origin;
  }catch{return '';}
}
function isAllowedCommunityNavigation(input,origin){
  try{
    const url=new URL(input);
    return url.protocol==='https:'&&url.origin===origin&&!url.username&&!url.password;
  }catch{return false;}
}
function telegramLoginLink(input){
  try{
    const url=new URL(input);
    if(url.protocol!=='https:'||url.hostname!=='t.me'||url.port||url.username||url.password||
       url.pathname.length>96||!/^\/[A-Za-z0-9_]{5,64}\/?$/.test(url.pathname))return '';
    return url.toString();
  }catch{return '';}
}
class CommunityLink{
  constructor(folder){
    this.file=path.join(folder,'istaroth-community-url.json');
    this.url='';
    try{
      const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));
      this.url=safeCommunityUrl(raw?.url);
    }catch{/* first use */}
  }
  status(){return {configured:!!this.url,url:this.url};}
  connect(input){
    const url=safeCommunityUrl(input);
    if(!url)throw Error('Enter your deployed Istaroth Community HTTPS workers.dev address.');
    const temp=this.file+'.tmp';
    fs.mkdirSync(path.dirname(this.file),{recursive:true});
    fs.writeFileSync(temp,JSON.stringify({url})+'\n',{mode:0o600,encoding:'utf8'});
    fs.renameSync(temp,this.file);
    this.url=url;
    return this.status();
  }
  disconnect(){
    this.url='';
    try{fs.unlinkSync(this.file);}catch(e){if(e.code!=='ENOENT')throw e;}
    return this.status();
  }
}
function boundedViewRect(rect,contentSize){
  if(!rect||typeof rect!=='object'||!Array.isArray(contentSize))return null;
  const [w,h]=contentSize;
  if(![w,h].every(n=>Number.isFinite(n)&&n>=220))return null;
  const fields=['x','y','width','height'];
  if(fields.some(k=>!Number.isFinite(rect[k])))return null;
  const x=Math.max(0,Math.min(w,Math.round(rect.x)));
  const y=Math.max(0,Math.min(h,Math.round(rect.y)));
  const width=Math.max(0,Math.min(w-x,Math.round(rect.width)));
  const height=Math.max(0,Math.min(h-y,Math.round(rect.height)));
  return width>=220&&height>=160?{x,y,width,height}:null;
}
module.exports={CommunityLink,safeCommunityUrl,isAllowedCommunityNavigation,telegramLoginLink,boundedViewRect};
