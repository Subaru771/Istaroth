'use strict';
// Release checks are automatic once a publisher configures a trusted GitHub release feed.
// Downloads are SHA-256 verified against a companion .sha256 asset from that same release.
// Never executes unsigned or unverified downloads, never guesses a repository URL.
const fs=require('node:fs');const path=require('node:path');const https=require('node:https');const crypto=require('node:crypto');
const PUBLISHER_REPO='Subaru771/Istaroth';
const TRUSTED_HOSTS=new Set(['api.github.com','github.com','objects.githubusercontent.com','release-assets.githubusercontent.com']);
const MAX_BYTES=250*1024*1024;
function validRepo(repo){return repo===PUBLISHER_REPO?PUBLISHER_REPO:'';}
function versionParts(v){const x=String(v||'').replace(/^v/,'').match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);return x?[Number(x[1]),Number(x[2]),Number(x[3]||0)]:null;}
function newer(a,b){const x=versionParts(a),y=versionParts(b);if(!x||!y)return false;for(let i=0;i<3;i++){if(x[i]>y[i])return true;if(x[i]<y[i])return false;}return false;}
function fromUrl(url,limit=1024*1024,redirects=0){return new Promise((resolve,reject)=>{let u;try{u=new URL(url);if(u.protocol!=='https:'||!TRUSTED_HOSTS.has(u.hostname))throw Error('Untrusted update host');}catch(e){reject(e);return;}
 const req=https.get(u,{headers:{'Accept':'application/vnd.github+json','User-Agent':'Istaroth-Windows-Updater/2.2','X-GitHub-Api-Version':'2022-11-28'},timeout:22000},res=>{
 if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location&&redirects<5){res.resume();return fromUrl(new URL(res.headers.location,u).toString(),limit,redirects+1).then(resolve,reject);}
 if(res.statusCode!==200){res.resume();return reject(Error(`Release service returned HTTP ${res.statusCode}`));}
 const out=[];let length=0;res.on('data',d=>{length+=d.length;if(length>limit){req.destroy(Error('Update exceeds size limit'));return;}out.push(d);});res.on('end',()=>resolve(Buffer.concat(out)));res.on('error',reject);
 });req.on('timeout',()=>req.destroy(Error('Update request timed out')));req.on('error',reject);
 });}
function safeAsset(asset,pattern){return asset&&typeof asset.name==='string'&&pattern.test(asset.name)&&typeof asset.browser_download_url==='string'&&asset.size<MAX_BYTES?asset:null;}
class UpdateService {
 constructor(dir,version){this.dir=dir;this.version=version;this.file=path.join(dir,'updates.json');this.conf={repo:PUBLISHER_REPO,autoCheck:true,autoDownload:false};this.latest=null;this.ready='';this.busy=false;try{const x=JSON.parse(fs.readFileSync(this.file,'utf8'));this.conf={repo:PUBLISHER_REPO,autoCheck:x.autoCheck!==false,autoDownload:false};}catch{}}
 settings(x){if(x){this.conf={repo:PUBLISHER_REPO,autoCheck:x.autoCheck!==false,autoDownload:false};fs.mkdirSync(this.dir,{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.conf),{mode:0o600});}return {...this.conf};}
 status(){return {version:this.version,settings:this.settings(),latest:this.latest,ready:!!this.ready,busy:this.busy,configured:!!this.conf.repo};}
 async check(download=false){if(this.busy)throw Error('Update check already in progress');if(download)throw Error('Automatic download and execution of unsigned updates is disabled. Use the official GitHub release page.');this.busy=true;try{
  const body=await fromUrl(`https://api.github.com/repos/${this.conf.repo}/releases/latest`);const release=JSON.parse(body.toString());
  if(!newer(release.tag_name,this.version)){this.latest=null;return this.status();}
  const assets=Array.isArray(release.assets)?release.assets:[];
  const exe=assets.find(a=>safeAsset(a,/^Istaroth[-_].*\.exe$/i));
  const sha=exe&&assets.find(a=>a.name===exe.name+'.sha256'&&safeAsset(a,/\.sha256$/i));
  this.latest={version:release.tag_name,name:exe?.name||'',shaAvailable:!!sha,releaseUrl:`https://github.com/${this.conf.repo}/releases/tag/${encodeURIComponent(release.tag_name)}`};
  if(false&&exe&&sha){ // intentionally disabled: checksums accompanying unsigned EXEs do not authenticate the publisherconst digestText=(await fromUrl(sha.browser_download_url,4096)).toString();const match=digestText.match(/\b([0-9a-f]{64})\b/i);if(!match)throw Error('Update has no valid SHA-256 checksum');const target=await fromUrl(exe.browser_download_url,MAX_BYTES);if(target.toString('ascii',0,2)!=='MZ')throw Error('Update is not a Windows executable');const digest=crypto.createHash('sha256').update(target).digest('hex');if(digest!==match[1].toLowerCase())throw Error('Update checksum mismatch');fs.mkdirSync(path.join(this.dir,'downloads'),{recursive:true});const dest=path.join(this.dir,'downloads','Istaroth-Verified-Update.exe');fs.writeFileSync(dest,target,{mode:0o600});this.ready=dest;}
  return this.status();
 }finally{this.busy=false;}}
}
module.exports={UpdateService,validRepo,newer,versionParts};
