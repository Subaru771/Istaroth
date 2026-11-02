'use strict';

// Read-only, publisher-pinned release discovery for unsigned builds.
// Checksums shipped alongside unsigned executables are not an authentication
// mechanism: Istaroth does NOT auto-download or launch a release executable.
const fs=require('node:fs');
const path=require('node:path');
const https=require('node:https');
const PUBLISHER_REPO='Subaru771/Istaroth';
const RELEASE_URL='https://github.com/'+PUBLISHER_REPO+'/releases';
const API_URL='https://api.github.com/repos/'+PUBLISHER_REPO+'/releases/latest';
function validRepo(repo){return repo===PUBLISHER_REPO?PUBLISHER_REPO:'';}
function versionParts(v){
  const x=String(v||'').replace(/^v/i,'').match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  return x?[Number(x[1]),Number(x[2]),Number(x[3]||0)]:null;
}
function newer(a,b){
  const x=versionParts(a),y=versionParts(b);
  if(!x||!y)return false;
  for(let i=0;i<3;i++){if(x[i]>y[i])return true;if(x[i]<y[i])return false;}
  return false;
}
function fetchLatest(){
  return new Promise((resolve,reject)=>{
    const req=https.get(API_URL,{headers:{
      'Accept':'application/vnd.github+json',
      'User-Agent':'Istaroth-Windows-Updater/1.0',
      'X-GitHub-Api-Version':'2022-11-28'
    },timeout:22000},res=>{
      if(res.statusCode!==200){res.resume();reject(Error('GitHub release check failed: HTTP '+res.statusCode));return;}
      const bytes=[];let size=0;
      res.on('data',chunk=>{
        size+=chunk.length;
        if(size>1024*1024){req.destroy(Error('GitHub release response too large'));return;}
        bytes.push(chunk);
      });
      res.on('end',()=>{
        try{resolve(JSON.parse(Buffer.concat(bytes).toString('utf8')));}
        catch(e){reject(Error('Invalid response from GitHub releases'));}
      });
      res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(Error('GitHub release check timed out')));
    req.on('error',reject);
  });
}
class UpdateService{
  constructor(dir,version){
    this.dir=dir;this.version=version;this.file=path.join(dir,'updates.json');
    this.conf={repo:PUBLISHER_REPO,autoCheck:true,autoDownload:false};
    this.latest=null;this.ready='';this.busy=false;
    try{
      const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
      this.conf.autoCheck=saved.autoCheck!==false;
    }catch{}
  }
  settings(opts){
    if(opts){
      this.conf={repo:PUBLISHER_REPO,autoCheck:opts.autoCheck!==false,autoDownload:false};
      fs.mkdirSync(this.dir,{recursive:true});
      fs.writeFileSync(this.file,JSON.stringify(this.conf),{mode:0o600});
    }
    return {...this.conf};
  }
  status(){
    return {version:this.version,settings:this.settings(),latest:this.latest,
      ready:false,busy:this.busy,configured:true,automaticInstallEnabled:false};
  }
  async check(download=false){
    if(download)throw Error('Unsigned automatic downloads are disabled. Open the official GitHub release page to download updates.');
    if(this.busy)throw Error('A release check is already in progress.');
    this.busy=true;
    try{
      const release=await fetchLatest();
      if(typeof release.tag_name!=='string'||!versionParts(release.tag_name)){
        throw Error('GitHub release has an invalid version tag.');
      }
      if(!newer(release.tag_name,this.version)){
        this.latest=null;
        return this.status();
      }
      const assets=Array.isArray(release.assets)?release.assets:[];
      const installer=assets.find(a=>typeof a.name==='string'&&/^Istaroth[-_].*\.exe$/i.test(a.name));
      const checksum=installer&&assets.some(a=>a.name===installer.name+'.sha256');
      this.latest={
        version:release.tag_name,name:installer?.name||'',shaAvailable:!!checksum,
        releaseUrl:RELEASE_URL+'/tag/'+encodeURIComponent(release.tag_name)
      };
      return this.status();
    }finally{this.busy=false;}
  }
}
module.exports={UpdateService,validRepo,newer,versionParts};
