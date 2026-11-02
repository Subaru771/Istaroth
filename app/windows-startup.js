'use strict';

// Startup for the *widget only*. The entry points directly to Electron's GUI
// executable, never a batch file, cmd.exe, or the Genshin game executable.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APPROVED_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const ENTRY_NAME = 'Istaroth';

function getLaunchOptions(context) {
  const executable = context.env?.PORTABLE_EXECUTABLE_FILE || context.execPath;
  if (!executable || !(path.isAbsolute(executable)||path.win32.isAbsolute(executable))) throw new Error('Cannot locate the Istaroth executable.');
  // During development, Electron needs the source directory argument. A
  // bundled app in resources/app or resources/app.asar needs no arguments.
  const args = context.env?.PORTABLE_EXECUTABLE_FILE || context.isBundled || context.isPackaged
    ? [] : [context.appPath];
  return {path:executable,args};
}
function quoteArg(arg) {
  // Windows executable arguments must be quoted so paths with spaces survive.
  // Reject embedded double quotes (illegal in filesystem paths on Windows).
  if (arg.includes('"') || /[\r\n\0]/.test(arg)) throw new Error('Unsafe startup argument.');
  return '"'+arg+'"';
}
function launchCommand(context) {
  const launch=getLaunchOptions(context);
  // Never register a game executable or a shell script as the companion.
  if (/(?:genshinimpact|yuanshen|hoyoplay|cmd|powershell|wscript)\.exe$/i.test(launch.path)) {
    throw new Error('The startup executable is not Istaroth.');
  }
  return [launch.path,...launch.args].map(quoteArg).join(' ');
}
function runReg(args, runner=execFileSync) {
  try {
    return String(runner('reg.exe',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:5000}));
  } catch(err) {
    if (/^QUERY$/i.test(args[0]) && (err.status === 1 || err.status === 2)) return '';
    throw new Error('Windows registry operation failed: '+String(err.stderr||err.message).trim().slice(0,220));
  }
}
function readValue(key, name, runner=execFileSync) {
  const text=runReg(['QUERY',key,'/v',name],runner);
  const match=text.match(/^\s*([^\r\n]+?)\s+(REG_\w+)\s+([^\r\n]*)\s*$/im);
  return match?.[1]?.trim()===name ? {type:match[2],value:match[3].trim()} : null;
}
function writeValue(key,name,value,runner=execFileSync){
  runReg(['ADD',key,'/v',name,'/t','REG_SZ','/d',value,'/f'],runner);
}
function deleteValue(key,name,runner=execFileSync){
  if(readValue(key,name,runner))runReg(['DELETE',key,'/v',name,'/f'],runner);
}
function approvalStatus(runner=execFileSync){
  const v=readValue(APPROVED_KEY,ENTRY_NAME,runner);
  if(!v || v.type!=='REG_BINARY')return {disabled:false};
  const bytes=v.value.replace(/[^a-fA-F0-9]/g,'');
  return {disabled:bytes.slice(0,2).toLowerCase()==='03'};
}
function createStartupService(electronApp, context, file, deps={}) {
  const platform=context.platform||process.platform;
  const runner=deps.execFileSync||execFileSync;
  const storage=deps.fs||fs;
  let pref=true;
  function readPref(){
    try {const parsed=JSON.parse(storage.readFileSync(file,'utf8'));pref=parsed.enabled!==false;return true;}
    catch {pref=true;return false;}
  }
  function savePref(enabled){
    storage.mkdirSync(path.dirname(file),{recursive:true});
    const temp=file+'.tmp';storage.writeFileSync(temp,JSON.stringify({enabled:!!enabled}),{encoding:'utf8'});
    storage.renameSync(temp,file);
  }
  function status(){
    if(platform!=='win32')return {available:false,enabled:false,configured:pref,note:'Windows-only setting'};
    try{
      const expected=launchCommand(context);
      const entry=readValue(RUN_KEY,ENTRY_NAME,runner);
      const registered=!!entry && entry.type==='REG_SZ';
      const matches=registered&&entry.value.toLowerCase()===expected.toLowerCase();
      const disabled=registered&&approvalStatus(runner).disabled;
      return {available:true,configured:pref,registered,matches,enabled:matches&&!disabled,
        disabledByWindows:!!disabled,launchPath:getLaunchOptions(context).path,
        needsRepair:pref&&(!registered||!matches),
        note:!registered?'Windows startup entry is missing.':!matches?'Windows startup entry points to an outdated path.':disabled?'Disabled in Windows Startup Apps.':'Registered for the current user.'};
    }catch(e){return {available:true,enabled:false,configured:pref,error:e.message};}
  }
  function apply(enabled,explicit=false){
    if(platform!=='win32')return status();
    const launch=getLaunchOptions(context);
    if(enabled && !storage.existsSync(launch.path)) throw new Error('Cannot register startup: application executable not found.');
    // Electron's native API updates StartupApproved as well as the Run entry.
    // Use it when the user explicitly enables or repairs startup. During
    // silent automatic recovery, preserve any Windows-disabled entry.
    if(electronApp && typeof electronApp.setLoginItemSettings==='function' && (!enabled || explicit)){
      try {electronApp.setLoginItemSettings({openAtLogin:!!enabled,path:launch.path,
        args:launch.args,name:ENTRY_NAME,enabled:!!enabled});}
      catch(err){ /* Registry fallback below is authoritative. */ }
    }
    if(enabled){
      const expected=launchCommand(context);
      const entry=readValue(RUN_KEY,ENTRY_NAME,runner);
      if(entry?.value?.toLowerCase()!==expected.toLowerCase()) writeValue(RUN_KEY,ENTRY_NAME,expected,runner);
      // Never clear Windows user-disabled entries silently.
      if(explicit)deleteValue(APPROVED_KEY,ENTRY_NAME,runner);
    } else deleteValue(RUN_KEY,ENTRY_NAME,runner);
    return status();
  }
  return {
    initialize(){
      readPref();
      if(platform!=='win32')return status();
      try{
        const current=status();
        // Crucial fix: an existing saved preference is not proof that Windows
        // still has a valid Run entry. Repair stale/missing paths at every start.
        if(pref&&current.needsRepair&&!current.disabledByWindows)apply(true,false);
        else if(!pref&&current.registered)apply(false,false);
        if(!storage.existsSync(file))savePref(pref);
        return status();
      }catch(e){return {available:true,enabled:false,configured:pref,error:e.message};}
    },
    get(){return status();},
    set(enabled){
      const requested=!!enabled;
      // Persist only after the registry operation succeeds.
      const updated=apply(requested,requested);
      savePref(requested);pref=requested;
      return {...updated,configured:requested};
    },
    repair(){
      const updated=apply(true,true);savePref(true);pref=true;
      return {...updated,configured:true};
    }
  };
}
module.exports={getLaunchOptions,launchCommand,readValue,approvalStatus,createStartupService,RUN_KEY,APPROVED_KEY,ENTRY_NAME};
