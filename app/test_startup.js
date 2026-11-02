'use strict';
const assert=require('node:assert/strict');
const {createStartupService,launchCommand,ENTRY_NAME,RUN_KEY,APPROVED_KEY}=require('./windows-startup');
const context={platform:'win32',env:{},execPath:'C:\\Users\\Me\\AppData\\Local\\Istaroth\\electron.exe',appPath:'C:\\Users\\Me\\AppData\\Local\\Istaroth\\resources\\app',isPackaged:false,isBundled:true};
let values={};let files={'C:\\Users\\Me\\AppData\\Roaming\\Istaroth\\startup-preference.json':'{"enabled":true}'};
function reg(program,args){
  assert.equal(program,'reg.exe');
  const [cmd,key,...options]=args;
  const name=options[options.indexOf('/v')+1];
  const id=key+'|'+name;
  if(cmd==='QUERY'){
    if(!(id in values)){const e=Error('not found');e.status=1;throw e;}
    return `HKEY_${key}\r\n    ${name}    ${values[id].type}    ${values[id].value}\r\n`;
  }
  if(cmd==='ADD'){
    values[id]={type:'REG_SZ',value:options[options.indexOf('/d')+1]};return 'OK';
  }
  if(cmd==='DELETE'){delete values[id];return 'OK';}
  throw Error('Unexpected REG command '+cmd);
}
const fs={
 readFileSync(p){if(!(p in files))throw Error('ENOENT');return files[p]},
 writeFileSync(p,c){files[p]=c},renameSync(old,newer){files[newer]=files[old];delete files[old]},
 mkdirSync(){},existsSync(p){return p===context.execPath||p in files}
};
const pref='C:\\Users\\Me\\AppData\\Roaming\\Istaroth\\startup-preference.json';
function service(){return createStartupService(null,context,pref,{execFileSync:reg,fs});}
// Previously saved 'enabled' does not prevent repair of a missing Run entry.
let s=service();assert.equal(s.initialize().enabled,true);
assert.equal(values[RUN_KEY+'|'+ENTRY_NAME].value,launchCommand(context));
// Moving installation should update stale launch command when restarted.
values[RUN_KEY+'|'+ENTRY_NAME].value='"C:\\old-location\\electron.exe"';
s=service();assert.equal(s.initialize().enabled,true);
assert.equal(values[RUN_KEY+'|'+ENTRY_NAME].value,launchCommand(context));
// Windows disabled the entry. Don't override Windows policy without an explicit request.
values[APPROVED_KEY+'|'+ENTRY_NAME]={type:'REG_BINARY',value:'03 00 00 00 00 00 00 00 00 00 00 00'};
assert.equal(s.get().disabledByWindows,true);
s=service();assert.equal(s.initialize().disabledByWindows,true);
// Explicit repair reverses the disabled marker and registers the correct path.
assert.equal(s.repair().enabled,true);
assert.equal(values[APPROVED_KEY+'|'+ENTRY_NAME],undefined);
// Turning off removes the Run entry, and disabled preference persists.
assert.equal(s.set(false).enabled,false);
assert.equal(values[RUN_KEY+'|'+ENTRY_NAME],undefined);
s=service();assert.equal(s.initialize().configured,false);
assert.equal(values[RUN_KEY+'|'+ENTRY_NAME],undefined);
// User opts back in, no CMD and no Genshin game executable involved.
assert.equal(s.set(true).enabled,true);
assert.match(values[RUN_KEY+'|'+ENTRY_NAME].value,/\\electron\.exe"$/);
assert.doesNotMatch(values[RUN_KEY+'|'+ENTRY_NAME].value,/GenshinImpact|cmd\.exe|bat/);
console.log('8 Windows startup tests passed.');
