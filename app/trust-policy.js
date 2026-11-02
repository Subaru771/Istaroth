'use strict';
// Pure trust-boundary helpers, shared by Electron and Node regression tests.
const path=require('node:path');
const {fileURLToPath}=require('node:url');
const AUTH_DOMAINS=Object.freeze(['hoyolab.com','hoyoverse.com','mihoyo.com']);
function isOfficialHoYoUrl(input){
  try{
    const u=new URL(input);
    if(u.protocol!=='https:'||u.username||u.password)return false;
    return AUTH_DOMAINS.some(d=>u.hostname===d||u.hostname.endsWith('.'+d));
  }catch{return false;}
}
function isLocalAppUrl(input,appIndexPath){
  try{
    const u=new URL(input);
    if(u.protocol!=='file:'||u.host||u.search||u.username||u.password)return false;
    return path.resolve(fileURLToPath(u))===path.resolve(appIndexPath);
  }catch{return false;}
}
module.exports={isOfficialHoYoUrl,isLocalAppUrl};
