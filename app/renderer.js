'use strict';
/* Istaroth 2.1 · UI deliberately isolated from HoYoLAB credential access. */
const bridge = window.pulseDesktop || null;
const $ = id => document.getElementById(id);
const $all = selector => [...document.querySelectorAll(selector)];
const switchValue = id => $(id).getAttribute('aria-checked') === 'true';
const setSwitch = (id,value) => $(id).setAttribute('aria-checked',String(!!value));
const REALM_IDENTITY = Object.freeze({
  istaroth: ['THE THOUSAND WINDS · CHRONICLE', '✦'],
  mondstadt: ['CITY OF FREEDOM · ANEMO', '✧'],
  liyue: ['HARBOR OF CONTRACTS · GEO', '◆'],
  inazuma: ['ISLANDS OF ETERNITY · ELECTRO', '✦'],
  sumeru: ['FOREST & DESERT · WISDOM', '❀'],
  fontaine: ['TERRESTRIAL SEA · HYDRO', '◈'],
  natlan: ['NATION OF OATHS · PYRO', '✹'],
  nodkrai: ['LAND OF THE WELKIN MOON', '☾'],
  snezhnaya: ['NATION OF ETERNAL WINTER', '❄']
});
const RESIN_MS = 8 * 60 * 1000;
const ARC = 2 * Math.PI * 98;
const PALETTES = new Set(["istaroth","mondstadt","liyue","inazuma","sumeru","fontaine","natlan","nodkrai","snezhnaya"]);
const DEFAULT_DESIGN = Object.freeze({palette:'istaroth',accent:'',font:'serif',fontSize:120,radius:18,
  wallpaperTarget:'full',dim:55,blur:0,zoom:110,x:50,y:50,size:'standard',gauge:'ornate',dial:235,
  title:'The Clock of Resin',subtitle:true,times:true,border:true,motion:true});
let state;
let layoutSettingsScope='main';
let syncInfo = null;
let lastNoteApplied = 0;
let lastNotification = false; // Deprecated renderer alert retained for migrated preferences only.
let telemetrySettings=null;
let currentView = 'widget';
let syncBusy = false;
let saveTimer;
let toastTimer;

function bounded(value, lo, hi, def) {const n=Number(value);return Number.isFinite(n)?Math.min(hi,Math.max(lo,Math.round(n))):def;}
function color(value) {return typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():'';}
function hexBlend(a,b,f=0.35) {const ca=a.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16)),cb=b.match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));return '#'+ca.map((v,i)=>Math.round(v*(1-f)+cb[i]*f).toString(16).padStart(2,'0')).join('');}
function designClean(src) {
  let d={...DEFAULT_DESIGN};if(!src||typeof src!=='object')return d;
  d.palette=PALETTES.has(src.palette)?src.palette:(PALETTES.has(src.preset)?src.preset:d.palette);
  d.accent=color(src.accent);
  d.font=['serif','clean','rounded'].includes(src.font)?src.font:({journal:'serif',classic:'serif',modern:'clean'}[src.font]||d.font);
  for(const [name,lo,hi,old] of [ ['fontSize',100,155,'scale'],['radius',0,34,'radius'],['dim',0,90,'shade'],['blur',0,18,'blur'],['zoom',100,220,'zoom'],['x',0,100,'posX'],['y',0,100,'posY'],['dial',205,270,'dialSize'] ]) {
    if(src[name]!==undefined)d[name]=bounded(src[name],lo,hi,d[name]);
    else if(src[old]!==undefined)d[name]=bounded(src[old],lo,hi,d[name]);
  }
  d.wallpaperTarget=['card','full'].includes(src.wallpaperTarget)?src.wallpaperTarget:(src.wallpaperTarget==='scene'?'card':d.wallpaperTarget);
  d.size=['standard','compact'].includes(src.size)?src.size:d.size;
  d.gauge=['ornate','simple','heavy'].includes(src.gauge)?src.gauge:({classic:'ornate',minimal:'simple',bold:'heavy'}[src.dialStyle]||d.gauge);
  if(typeof src.title==='string')d.title=src.title.trim().slice(0,34)||DEFAULT_DESIGN.title;
  for(const name of ['subtitle','border','motion','times']) if(typeof src[name]==='boolean')d[name]=src[name];
  if(typeof src.frame==='boolean')d.border=src.frame;
  return d;
}
const DEFAULT_RESIN_APPEARANCE=Object.freeze({dim:30,blur:0,zoom:110,x:50,y:50});
function resinClean(src){
  const d={...DEFAULT_RESIN_APPEARANCE};
  if(!src||typeof src!=='object')return d;
  for(const [key,lo,hi] of [['dim',0,90],['blur',0,18],['zoom',100,220],['x',0,100],['y',0,100]])d[key]=bounded(src[key],lo,hi,d[key]);
  return d;
}
const DEFAULT_MINI_APPEARANCE=Object.freeze({dim:45,blur:0,zoom:110,x:50,y:50,textSize:100,showReady:true,showNext:true});
function miniClean(src){
  const d={...DEFAULT_MINI_APPEARANCE};
  if(!src || typeof src!=='object')return d;
  for(const [key,lo,hi] of [['dim',0,90],['blur',0,18],['zoom',100,220],['x',0,100],['y',0,100],['textSize',80,130]])
    d[key]=bounded(src[key],lo,hi,d[key]);
  for(const key of ['showReady','showNext'])if(typeof src[key]==='boolean')d[key]=src[key];
  return d;
}
function cleanState(raw){
  const start={version:5,resin:{value:0,cap:200,anchor:Date.now(),syncedAt:null,source:'none'},ui:{design:designClean(null),miniAppearance:miniClean(null),resinAppearance:resinClean(null),pinned:false,closeToTray:false,notifications:true,miniMode:false,floatingMini:false,profiles:[]}};
  if(!raw||typeof raw!=='object')return start;
  if(raw.resin&&typeof raw.resin==='object'){
    start.resin.value=bounded(raw.resin.value,0,500,0);
    start.resin.cap=bounded(raw.resin.cap,1,500,200);
    start.resin.value=Math.min(start.resin.cap,start.resin.value);
    start.resin.anchor=Number.isFinite(Number(raw.resin.anchor))&&Number(raw.resin.anchor)>0?Math.min(Date.now(),Number(raw.resin.anchor)):Date.now();
    start.resin.syncedAt=Number(raw.resin.syncedAt)>0?Number(raw.resin.syncedAt):null;
    start.resin.source=raw.resin.source==='hoyolab'?'hoyolab':'none';
    if(start.resin.source!=='hoyolab'){start.resin.value=0;start.resin.syncedAt=null;start.resin.anchor=Date.now();}
  }
  if(raw.ui&&typeof raw.ui==='object'){
    start.ui.design=designClean(raw.ui.design||{palette:raw.ui.tone==='night'?'istaroth':'mondstadt'});
    // Legacy versions only had the main wallpaper. Mini gets its own fresh settings.
    start.ui.miniAppearance=miniClean(raw.ui.miniAppearance);
    start.ui.resinAppearance=resinClean(raw.ui.resinAppearance);
    // Earlier releases stored tiny typography; keep a readable baseline.
    if(raw.version<4)start.ui.design.fontSize=Math.max(120,start.ui.design.fontSize);
    start.ui.pinned=!!raw.ui.pinned;start.ui.miniMode=!!raw.ui.miniMode;start.ui.floatingMini=!!raw.ui.floatingMini;start.ui.closeToTray=!!raw.ui.closeToTray;start.ui.notifications=raw.ui.notifications!==false;
    if(Array.isArray(raw.ui.profiles)) start.ui.profiles=raw.ui.profiles.slice(0,12).filter(p=>p&&typeof p.name==='string').map(p=>({name:p.name.slice(0,28),design:designClean(p.design)}));
  }
  return start;
}
async function loadState(){if(bridge?.load){try{return await bridge.load();}catch(e){console.warn('Read settings failed',e);}}
  try{return JSON.parse(localStorage.getItem('teyvat-pulse-v1')||'null');}catch{return null;}}
async function saveState(){try{if(bridge?.save){const ok=await bridge.save(state);if(!ok)throw Error('Could not save to disk');}
  else localStorage.setItem('teyvat-pulse-v1',JSON.stringify(state));}catch(e){console.warn(e);toast('Could not save settings; check disk permissions.');}}
function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveState,220);}
function toast(msg){const el=$('toast');if(currentView==='settings'){$('statusText').textContent=String(msg);el.classList.add('hidden');return;}el.textContent=String(msg);el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),4500);
  if(currentView==='settings')$('statusText').textContent=String(msg);}
function timeLength(ms){if(ms<=0)return 'Ready';const s=Math.ceil(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;
  return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m}m ${String(sec).padStart(2,'0')}s`;}
function dateTime(ms){return new Date(ms).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
function resinStatus(now=Date.now()){
  const r=state.resin;if(r.source!=='hoyolab'||!r.syncedAt)return null;
  const elapsed=Math.max(0,now-r.anchor);const elapsedSteps=Math.floor(elapsed/RESIN_MS);const amount=Math.min(r.cap,r.value+elapsedSteps);
  return {amount,cap:r.cap,fullAt:r.value>=r.cap?now:r.anchor+(r.cap-r.value)*RESIN_MS,nextAt:amount>=r.cap?null:r.anchor+(elapsedSteps+1)*RESIN_MS};
}
function isFresh(now=Date.now()) {return !!(syncInfo?.connected && syncInfo.notes && !syncInfo.error && now-syncInfo.notes.fetchedAt<Math.max(10,(syncInfo.refreshMinutes||15)*2)*60_000 && state.resin.source==='hoyolab');}
function renderResin(){if(!state)return;
  const now=Date.now(),r=resinStatus(now),connected=!!syncInfo?.connected,fresh=isFresh(now),stored=!!r&&state.resin.source==='hoyolab';
  $('resinNumber').textContent=r?String(r.amount):'—';$('resinCap').textContent=state.resin.cap;
  $('progressCircle').style.strokeDasharray=ARC.toFixed(2);$('progressCircle').style.strokeDashoffset=r?(ARC*(1-r.amount/r.cap)).toFixed(2):ARC.toFixed(2);
  $('resinProgressFill').style.width=r?`${Math.min(100,100*r.amount/r.cap).toFixed(2)}%`:'0%';
  $('progressTrack').setAttribute('aria-valuenow',String(r?r.amount:0));
  $('progressTrack').setAttribute('aria-valuemax',String(state.resin.cap));
  $('resinState').textContent=!r?'AWAITING SYNC':r.amount>=r.cap?'FULL':'REFILLING';
  $('fullIn').textContent=!r?'—':r.amount>=r.cap?'Ready':timeLength(r.fullAt-now);
  $('fullAt').textContent=!r?'—':r.amount>=r.cap?'Now':dateTime(r.fullAt);
  $('fullHelp').textContent=!r?'No estimate yet':r.amount>=r.cap?'Ready for adventure':'Until full resin';
  $('nextResin').textContent=!r?'Next resin: —':r.amount>=r.cap?'Fully recovered':`Next +1 in ${timeLength(r.nextAt-now)}`;
  $('statusLamp').className='status-lamp'+(fresh?' live':connected?' error':'');
  $('syncLabel').textContent=fresh?'SYNCED':connected?'SYNC OFFLINE':stored?'SAVED READING':'CONNECT ACCOUNT';
  $('refreshText').textContent=syncBusy||syncInfo?.busy?'Synchronizing…':connected?'Sync now':'Connect HoYoLAB';
  $('refreshButton').disabled=syncBusy||!!syncInfo?.busy;
  // Both the journal and the mini widget use the same HoYoLAB reading; neither permits editing.
  $('miniResinNumber').textContent=r?String(r.amount):'—';
  $('miniResinCap').textContent=String(state.resin.cap);
  $('miniFill').style.width=r?`${Math.min(100,100*r.amount/r.cap).toFixed(2)}%`:'0%';
  $('miniProgressTrack').setAttribute('aria-valuenow',String(r?r.amount:0));
  $('miniProgressTrack').setAttribute('aria-valuemax',String(state.resin.cap));
  $('miniFullIn').textContent=!r?'—':r.amount>=r.cap?'Ready':timeLength(r.fullAt-now);
  $('miniFullAt').textContent=!r?'—':r.amount>=r.cap?'Now':dateTime(r.fullAt);
  $('miniNextResin').textContent=!r?'Waiting for account':r.amount>=r.cap?'Fully recovered':`Next +1 · ${timeLength(r.nextAt-now)}`;
  $('miniLamp').className=fresh?'live':connected?'offline':'';
  $('miniSyncLabel').textContent=fresh?'LIVE':connected?'OFFLINE':stored?'SAVED':'NOT CONNECTED';
  $('miniRefreshButton').disabled=syncBusy||!!syncInfo?.busy;
  const lastObserved=stored&&Number.isFinite(Number(state.resin.syncedAt))?
    ` · Last confirmed ${new Date(state.resin.syncedAt).toLocaleString()} · estimate only`:'';
  const problem=String(syncInfo?.error||'');
  const failureHint=/session expired|sign in again|No HoYoLAB session/i.test(problem)?'Session expired — reconnect HoYoLAB':
    /API|endpoint|unreadable|rejected this request|valid resin value|HTTP 404|HTTP 410/i.test(problem)?'HoYoLAB API may have changed — check for an Istaroth update':
    'HoYoLAB sync unavailable';
  $('liveInfo').textContent=fresh?`HoYoLAB · ${syncInfo.role?.nickname||'Traveler'} · Updated ${dateTime(syncInfo.notes.fetchedAt)}`:
    connected?(problem?`${failureHint}: ${problem}${lastObserved}`:`Awaiting HoYoLAB update${lastObserved}`):
    stored?`Last HoYoLAB reading${lastObserved}`:'Sign in to HoYoLAB to display your resin';
  renderMiniDaily();
  WallpaperStudio.updateReadings();
  // Smart alerts are sent from the background process even while the window is hidden.
}

function applyAppearance(){const d=state.ui.design,root=document.documentElement;
  root.dataset.palette=d.palette;root.dataset.font=d.font;root.dataset.layout=d.size;root.dataset.gauge=d.gauge;root.dataset.subtitle=d.subtitle?'on':'off';root.dataset.times=d.times?'on':'off';root.dataset.border=d.border?'on':'off';root.dataset.motion=d.motion?'on':'off';
  root.style.setProperty('--scale',(d.fontSize/100).toFixed(2));root.style.setProperty('--round',d.radius+'px');root.style.setProperty('--dial',d.dial+'px');
  root.style.setProperty('--dim',(d.dim/100).toFixed(2));root.style.setProperty('--blur',d.blur+'px');root.style.setProperty('--zoom',(d.zoom/100).toFixed(2));
  root.style.setProperty('--pos-x',d.x+'%');root.style.setProperty('--pos-y',d.y+'%');
  // If custom accent is unset, use the selected regional palette variables instead of an old inline override.
  if(d.accent){root.style.setProperty('--accent',d.accent);root.style.setProperty('--accent-soft',hexBlend(d.accent,'#ffffff',.35));}
  else{root.style.removeProperty('--accent');root.style.removeProperty('--accent-soft');}
  const identity=REALM_IDENTITY[d.palette]||REALM_IDENTITY.istaroth;
  $('realmEyebrow').textContent=identity[0];$('miniRealmMark').textContent=identity[1];
  $('mainTitle').textContent=d.title;
  $('pinButton').setAttribute('aria-pressed',String(state.ui.pinned));
  WallpaperStudio.apply();
}
function renderForm(){const d=state.ui.design;
  const fields={fontSelect:d.font,accentInput:d.accent||getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),fontSizeInput:d.fontSize,radiusInput:d.radius,
    titleInput:d.title,sizeInput:d.size,gaugeInput:d.gauge,dialInput:d.dial};
  for(const [id,value] of Object.entries(fields)){if($(id))$(id).value=value;}
  for(const [id,val] of Object.entries({floatingMiniInput:state.ui.floatingMini,miniInput:state.ui.miniMode,borderInput:d.border,motionInput:d.motion,subtitleInput:d.subtitle,timesInput:d.times,pinInput:state.ui.pinned,trayInput:state.ui.closeToTray,notificationsInput:state.ui.notifications}))setSwitch(id,val);
  for(const [id,suffix] of [['fontSize','%'],['radius','px'],['dial','px']])$(id+'Output').textContent=$(id+'Input').value+suffix;
  $all('[data-palette]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.palette===d.palette)));
  renderProfiles();
  updateMiniButtons();
  WallpaperStudio.render();
  renderMiniLayout();
  if(telemetrySettings){setSwitch('quietInput',telemetrySettings.quietEnabled);$('alertThreshold').value=String(telemetrySettings.threshold);$('quietStart').value=telemetrySettings.quietStart;$('quietEnd').value=telemetrySettings.quietEnd;}
  // Read current Windows startup state without changing the visual settings.
  updateStartupControls();
}
function renderMiniLayout(){
  if(!state)return;
  const d=state.ui.miniAppearance;
  $('miniTextSizeInput').value=d.textSize;
  $('miniTextSizeOutput').textContent=d.textSize+'%';
  setSwitch('miniReadyInput',d.showReady);
  setSwitch('miniNextInput',d.showNext);
  document.querySelectorAll('[data-layout-scope]').forEach(btn=>{
    const active=layoutSettingsScope===btn.dataset.layoutScope;
    btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));
  });
  $('layoutMainSettings').classList.toggle('hidden',layoutSettingsScope!=='main');
  $('layoutMiniSettings').classList.toggle('hidden',layoutSettingsScope!=='mini');
}
function updateMiniSetting(key,value){
  state.ui.miniAppearance=miniClean({...state.ui.miniAppearance,[key]:value});
  applyAppearance();
  renderMiniLayout();
  queueSave();
}
function changeDesign(key,value){state.ui.design=designClean({...state.ui.design,[key]:value});applyAppearance();queueSave();
  if(key==='size' && currentView==='widget')resizeWindow();
  if(key==='palette' || key==='accent'){
    $all('[data-palette]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.palette===state.ui.design.palette)));
    if(key==='palette' && !state.ui.design.accent)$('accentInput').value=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  }
}
function renderProfiles(){const list=$('profilesList');list.replaceChildren();const profiles=state.ui.profiles;
  if(!profiles.length){const p=document.createElement('p');p.className='profile-empty';p.textContent='No saved looks yet.';list.append(p);return;}
  profiles.forEach((p,i)=>{const row=document.createElement('div');row.className='profile-entry';const title=document.createElement('span');title.textContent=p.name;
    const apply=document.createElement('button');apply.type='button';apply.textContent='Apply';apply.addEventListener('click',async()=>{
      state.ui.design=designClean(p.design);applyAppearance();renderForm();queueSave();await resizeWindow();toast(`Applied ${p.name}`);});
    const remove=document.createElement('button');remove.type='button';remove.textContent='Delete';remove.addEventListener('click',()=>{state.ui.profiles.splice(i,1);queueSave();renderProfiles();toast('Look removed');});
    row.append(title,apply,remove);list.append(row);
  });
}
function tab(key){$all('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===key);b.setAttribute('aria-selected',String(b.dataset.tab===key));});
  $all('[data-page]').forEach(el=>el.classList.toggle('hidden',el.dataset.page!==key));$('settingsScreen').querySelector('.settings-scroll').scrollTop=0;
  const label=$('doneLabel');if(label)label.textContent='Done';}
async function resizeWindow(){if(!bridge?.size)return;try{await bridge.size(currentView==='settings'?'settings':currentView==='mini'?(state.ui.floatingMini?'floating':'mini'):state.ui.design.size);}catch(e){toast(`Window resizing unavailable: ${e.message}`);}}
function updateMiniButtons(){
  document.documentElement.dataset.mini=state.ui.miniMode?'on':'off';
  document.documentElement.dataset.floating=state.ui.floatingMini?'on':'off';
  $('modeButton').setAttribute('aria-pressed',String(state.ui.miniMode));
  $('modeButton').title=state.ui.miniMode?'Open full journal':'Switch to mini resin widget';
  $('modeButton').setAttribute('aria-label',$('modeButton').title);
  setSwitch('miniInput',state.ui.miniMode);
}
async function setMiniMode(enabled,{navigate=true}={}){
  state.ui.miniMode=!!enabled;updateMiniButtons();queueSave();
  if(navigate){await switchView('widget');}else{await resizeWindow();}
}

async function finishSettings(){ await switchView('widget'); }
async function switchView(where,section='style'){currentView=where==='widget' && state.ui.miniMode?'mini':where;document.documentElement.dataset.screen=currentView;$('toast').classList.add('hidden');clearTimeout(toastTimer);
  $('widgetScreen').classList.toggle('hidden',currentView!=='widget');$('miniScreen').classList.toggle('hidden',currentView!=='mini');$('settingsScreen').classList.toggle('hidden',currentView!=='settings');
  if(where==='settings'){tab(section);renderForm();}await resizeWindow();}
function applySync(info){if(!info||typeof info!=='object')return;syncInfo=info;
  const note=info.notes,at=Number(note?.fetchedAt);
  if(note&&Number.isFinite(at)&&at>lastNoteApplied&&state){
    const cap=bounded(note.resin?.cap,1,500,200),value=bounded(note.resin?.value,0,cap,0),fullAt=Number(note.resin?.fullAt);
    const anchor=value>=cap?at:Number.isFinite(fullAt)&&fullAt>=at?fullAt-(cap-value)*RESIN_MS:at;
    state.resin={value,cap,anchor:Math.min(Date.now(),anchor),syncedAt:at,source:'hoyolab'};lastNoteApplied=at;
    lastNotification=value>=cap;queueSave();
  }
  setSwitch('autoInput',info.autoRefresh!==false);
  $('intervalInput').value=String(info.refreshMinutes||15);
  $('connectedLabel').textContent=info.connected?`Connected · ${info.role?.nickname||'Traveler'} · UID ${info.role?.uid||'—'}`:'Not connected · Sync required';
  $('disconnectButton').classList.toggle('hidden',!info.connected);
  const roles=Array.isArray(info.roles)?info.roles:[];
  $('rolePicker').classList.toggle('hidden',roles.length===0);
  if(roles.length){const select=$('roleSelect'),current=select.value||info.role?.uid;
    select.replaceChildren(...roles.map(r=>{const opt=document.createElement('option');opt.value=r.uid;opt.textContent=`${r.nickname} · ${r.server} · ${r.uid}`;return opt;}));
    if(roles.some(r=>r.uid===current))select.value=current;
  }
  if(info.error && currentView==='settings' && !$('settingsScreen').classList.contains('hidden'))$('statusText').textContent=`Sync error: ${info.error}`;
  renderResin();
}
async function setPin(value){if(!bridge?.pin){toast('Always on top works in the Windows app, not in a browser preview.');renderForm();return;}
  try{state.ui.pinned=!!(await bridge.pin(value));applyAppearance();setSwitch('pinInput',state.ui.pinned);queueSave();toast(state.ui.pinned?'Widget pinned on top.':'Always on top disabled.');}
  catch(e){toast('Unable to toggle always on top.');renderForm();}}
async function refresh(){if(!bridge?.hoyolabRefresh||!syncInfo?.connected){if(!bridge)toast('HoYoLAB synchronization requires the Windows app.');await switchView('settings','account');return;}
  syncBusy=true;renderResin();try{applySync(await bridge.hoyolabRefresh());toast('HoYoLAB sync complete.');}catch(e){toast(`Sync failed: ${e.message}`);
    try{applySync(await bridge.hoyolabStatus());}catch{}}
  finally{syncBusy=false;renderResin();}}
async function syncOption(){if(!bridge?.hoyolabOptions){toast('Sync options require the Windows app.');return;}
  try{applySync(await bridge.hoyolabOptions({auto:switchValue('autoInput'),minutes:Number($('intervalInput').value)}));toast('Refresh preference saved.');}catch(e){toast(e.message);}}
function bind(id,event,handler){const element=$(id);if(!element)throw Error('Missing control: '+id);element.addEventListener(event,handler);}
let startupKnown=null;
function updateStartupControls(){
  const input=$('startupInput'),note=$('startupNote'),repair=$('repairStartupButton');if(!input||!note)return;
  if(!bridge?.startupGet){input.disabled=true;if(repair)repair.disabled=true;setSwitch('startupInput',false);note.textContent='Windows app only — unavailable in the browser preview.';return;}
  if(repair)repair.disabled=false;
  if(startupKnown){
    setSwitch('startupInput',!!startupKnown.configured);
    note.textContent=startupKnown.error?'Registration error: '+startupKnown.error:
      startupKnown.disabledByWindows?'Disabled in Windows Startup Apps. Enable Istaroth there, or click Repair Windows startup.':
      startupKnown.needsRepair?'The Windows startup entry is missing or points to an old location. Click Repair Windows startup.':
      startupKnown.enabled?'Verified Windows startup entry: '+(startupKnown.launchPath||'Istaroth'):
      'Not registered for Windows sign-in.';
  }
}
async function checkStartupStatus(){
  if(!bridge?.startupGet){updateStartupControls();return;}
  try{startupKnown=await bridge.startupGet();updateStartupControls();}catch(e){startupKnown={configured:false,error:e.message};updateStartupControls();}
}
async function toggleStartup(){
  if(!bridge?.startupSet)return;
  const input=$('startupInput');input.disabled=true;
  try{
    const requested=!switchValue('startupInput');
    startupKnown=await bridge.startupSet(requested);
    updateStartupControls();
    toast(startupKnown.enabled?'Windows startup registered.':requested?'Registration needs attention; see message below.':'Windows startup disabled.');
  }catch(e){toast('Startup setting failed: '+e.message);await checkStartupStatus();}
  finally{input.disabled=false;}
}
async function repairStartup(){
  if(!bridge?.startupRepair)return;
  const button=$('repairStartupButton');button.disabled=true;
  try{startupKnown=await bridge.startupRepair();updateStartupControls();toast(startupKnown.enabled?'Windows startup repaired.':'Check Windows Startup Apps for a disabled entry.');}
  catch(e){toast('Repair failed: '+e.message);await checkStartupStatus();}
  finally{button.disabled=false;}
}

function renderMiniDaily(){
  const n=syncInfo?.notes,root=$('miniOverviewContents');if(!root)return;root.replaceChildren();
  const lines=n?[['Commissions',`${n.commissions?.completed??'—'} / ${n.commissions?.total??'—'}`],['Expeditions',`${(n.expeditions||[]).filter(e=>e.status==='finished').length} ready / ${(n.expeditions||[]).length}`],['Realm Currency',`${n.realm?.value??'—'} / ${n.realm?.cap??'—'}`],['Weekly discounts',`${n.weeklyDiscounts?.remaining??'—'} / ${n.weeklyDiscounts?.limit??'—'}`]]:[['Status','Connect HoYoLAB to access live notes']];
  for(const [a,b] of lines){const row=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong');label.textContent=a;value.textContent=b;row.append(label,value);root.append(row);}
  $('overviewTimestamp').textContent=n?`Last updated ${new Date(n.fetchedAt).toLocaleTimeString()}`:'Unavailable';
}
function renderHistory(h){const dest=$('dash-history');if(!dest)return;dest.replaceChildren();
  if(!h?.points?.length){const p=document.createElement('p');p.className='field-note';p.textContent='No readings yet. Connect HoYoLAB and sync; only observed readings will appear here.';dest.append(p);return;}
  const summary=document.createElement('div');summary.className='history-summary';
  for(const [label,value] of [['Readings this week',h.count],['Observed at cap',h.observedCapped]]){const tile=document.createElement('div');tile.innerHTML=`<small>${label}</small><strong>${value}</strong>`;summary.append(tile);}dest.append(summary);
  const desc=document.createElement('p');desc.className='field-note';desc.textContent='Seven-day readings, grouped by local calendar date. Missing days are not estimated; this is not a complete resin-spend history.';dest.append(desc);
  const chart=document.createElement('div');chart.className='history-chart';for(const day of h.daily){const bar=document.createElement('div');bar.className='history-day';const fill=document.createElement('i');fill.style.height=day.average===null?'3px':`${Math.max(4,Math.round(day.average/200*118))}px`;fill.title=day.average===null?'No reading':`${day.average} average resin (${day.count} readings)`;const t=document.createElement('b');t.textContent=day.label;const value=document.createElement('small');value.textContent=day.average===null?'—':String(day.average);bar.append(value,fill,t);chart.append(bar);}dest.append(chart);
  const recent=document.createElement('p');recent.className='field-note';recent.textContent=`Most recent observed reading: ${new Date(h.points[h.points.length-1].at).toLocaleString()} · ${h.points[h.points.length-1].value}/${h.points[h.points.length-1].cap}`;dest.append(recent);
}
async function refreshHistory(){if(!bridge?.telemetryHistory)return;try{renderHistory(await bridge.telemetryHistory());}catch(e){$('dash-history').textContent='History unavailable: '+e.message;}}
async function alertSettingsChanged(){if(!bridge?.telemetryOptions)return;
 const config={notifications:state.ui.notifications,threshold:Number($('alertThreshold').value),quietEnabled:switchValue('quietInput'),quietStart:$('quietStart').value,quietEnd:$('quietEnd').value};
 try{telemetrySettings=await bridge.telemetryOptions(config);}catch(e){toast('Could not save alert settings: '+e.message);}}

function setupEvents(){
  bind('startupInput','click',toggleStartup);
  bind('repairStartupButton','click',repairStartup);
  bind('modeButton','click',()=>setMiniMode(!state.ui.miniMode));
  bind('miniInput','click',()=>setMiniMode(!state.ui.miniMode,{navigate:false}));
  bind('miniOpenButton','click',()=>setMiniMode(false));
  bind('miniRefreshButton','click',refresh);
  bind('miniOverviewButton','click',()=>$('miniOverviewPanel').classList.toggle('hidden'));
  bind('miniFloatPin','click',()=>setPin(!state.ui.pinned));
  bind('miniHideButton','click',()=>bridge?.minimize?.());
  bind('miniCloseButton','click',()=>bridge?.close?.());
  bind('floatingMiniInput','click',async()=>{state.ui.floatingMini=!state.ui.floatingMini;updateMiniButtons();setSwitch('floatingMiniInput',state.ui.floatingMini);queueSave();await saveState();await resizeWindow();});
  bind('historyRefresh','click',refreshHistory);
  bind('testLiveSync','click',async()=>{const output=$('liveTestStatus');output.textContent='Contacting HoYoLAB with your existing private session…';try{if(!bridge?.hoyolabTest)throw Error('This test requires the installed Windows application');const v=await bridge.hoyolabTest();output.textContent=v.verified?`LIVE VERIFIED · UID ${v.uid} · ${new Date(v.fetchedAt).toLocaleString()} · Real-Time Notes received successfully`:'HoYoLAB did not return a verified response.';}catch(e){output.textContent='FAILED · '+e.message;}});
  window.addEventListener('pulse:history',refreshHistory);
  bind('alertThreshold','change',alertSettingsChanged);
  bind('quietInput','click',()=>{setSwitch('quietInput',!switchValue('quietInput'));alertSettingsChanged();});
  bind('quietStart','change',alertSettingsChanged);bind('quietEnd','change',alertSettingsChanged);
  bind('settingsButton','click',()=>switchView(currentView==='settings'?'widget':'settings'));
  bind('backButton','click',()=>switchView('widget'));bind('doneButton','click',finishSettings);
  bind('pinButton','click',()=>setPin(!state.ui.pinned));bind('pinInput','click',()=>setPin(!state.ui.pinned));
  bind('minimizeButton','click',async()=>{try{if(!bridge?.minimize)throw Error('Only available in the Windows app');await bridge.minimize();}catch(e){toast(e.message);}});
  bind('closeButton','click',async()=>{try{if(!bridge?.close)throw Error('Only available in the Windows app');await bridge.close();}catch(e){toast(e.message);}});
  bind('accountButton','click',()=>switchView('settings','account'));
  bind('refreshButton','click',refresh);
  $all('[data-tab]').forEach(el=>el.addEventListener('click',()=>tab(el.dataset.tab)));
  $all('[data-palette]').forEach(el=>el.addEventListener('click',()=>{state.ui.design.accent='';changeDesign('palette',el.dataset.palette);renderForm();}));
  for(const [id,key] of Object.entries({fontSelect:'font',sizeInput:'size',gaugeInput:'gauge'}))
    bind(id,'change',()=>{changeDesign(key,$(id).value);if(key==='size')toast('Widget size saved.');});
  for(const [id,key] of Object.entries({fontSizeInput:'fontSize',radiusInput:'radius',dialInput:'dial'}))
    bind(id,'input',()=>{changeDesign(key,Number($(id).value));$(id.replace('Input','Output')).textContent=$(id).value+((key==='blur'||key==='radius'||key==='dial')?'px':'%');});
  document.querySelectorAll('[data-layout-scope]').forEach(btn=>btn.addEventListener('click',()=>{layoutSettingsScope=btn.dataset.layoutScope;renderMiniLayout();}));
  bind('miniTextSizeInput','input',()=>updateMiniSetting('textSize',Number($('miniTextSizeInput').value)));
  bind('miniReadyInput','click',()=>updateMiniSetting('showReady',!state.ui.miniAppearance.showReady));
  bind('miniNextInput','click',()=>updateMiniSetting('showNext',!state.ui.miniAppearance.showNext));
  for(const [id,key] of Object.entries({borderInput:'border',motionInput:'motion',subtitleInput:'subtitle',timesInput:'times'}))
    bind(id,'click',()=>{const value=!state.ui.design[key];changeDesign(key,value);setSwitch(id,value);});
  // Do not rerender the form on each keystroke; that previously caused inputs to lose editing position.
  bind('titleInput','input',()=>changeDesign('title',$('titleInput').value));
  bind('accentInput','input',()=>changeDesign('accent',$('accentInput').value));
  bind('accentReset','click',()=>{changeDesign('accent','');renderForm();toast('Accent reset to region colour.');});
  bind('restoreStyle','click',()=>{const prev=state.ui.design;state.ui.design=designClean({...DEFAULT_DESIGN,wallpaperTarget:prev.wallpaperTarget,dim:prev.dim,blur:prev.blur,zoom:prev.zoom,x:prev.x,y:prev.y});applyAppearance();renderForm();queueSave();toast('Style restored.');});
  bind('saveProfileButton','click',()=>{const name=$('profileName').value.trim().slice(0,28);if(!name){toast('Please name the look first.');return;}
    const index=state.ui.profiles.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());if(index<0 && state.ui.profiles.length>=12){toast('Maximum 12 saved looks.');return;}
    const entry={name,design:designClean(state.ui.design)};if(index>=0)state.ui.profiles[index]=entry;else state.ui.profiles.push(entry);
    $('profileName').value='';queueSave();renderProfiles();toast(`Saved ${name}.`);});
  bind('restoreAllButton','click',async()=>{state.ui.design=designClean(null);applyAppearance();renderForm();queueSave();await resizeWindow();toast('Appearance restored.');});
  bind('loginButton','click',async()=>{try{if(!bridge?.hoyolabLogin)throw Error('HoYoLAB sign-in requires Windows app');await bridge.hoyolabLogin();toast('Sign in on HoYoLAB, then click Find my accounts.');}catch(e){toast(e.message);}});
  bind('discoverButton','click',async()=>{try{if(!bridge?.hoyolabRoles)throw Error('Account sync requires Windows app');$('statusText').textContent='Looking for linked accounts…';applySync(await bridge.hoyolabRoles());toast('Accounts found. Select your Genshin account.');}catch(e){toast(`Could not discover accounts: ${e.message}`);}});
  bind('selectRoleButton','click',async()=>{try{if(!bridge?.hoyolabSelect)throw Error('Connect from the Windows app');$('statusText').textContent='Reading HoYoLAB Real-Time Notes…';applySync(await bridge.hoyolabSelect($('roleSelect').value));toast('Account connected.');await switchView('widget');}catch(e){toast(`Account connection failed: ${e.message}`);}});
  bind('uidConnectButton','click',async()=>{try{if(!bridge?.hoyolabManualRole)throw Error('Connect from the Windows app');const uid=$('uidInput').value.trim();if(!/^\d{8,12}$/.test(uid))throw Error('UID must contain 8 to 12 digits');applySync(await bridge.hoyolabManualRole(uid,$('regionInput').value));toast('Account connected.');await switchView('widget');}catch(e){toast(`UID connection failed: ${e.message}`);}});
  bind('disconnectButton','click',async()=>{try{if(!bridge?.hoyolabDisconnect)throw Error('Unavailable in browser preview');applySync(await bridge.hoyolabDisconnect());toast('HoYoLAB session cleared.');}catch(e){toast(e.message);}});
  bind('autoInput','click',()=>{setSwitch('autoInput',!switchValue('autoInput'));syncOption();});bind('intervalInput','change',syncOption);
  bind('trayInput','click',async()=>{if(!bridge?.closeBehavior){setSwitch('trayInput',state.ui.closeToTray);toast('Close-to-tray works in the Windows app.');return;}
    try{state.ui.closeToTray=!!(await bridge.closeBehavior(!state.ui.closeToTray));setSwitch('trayInput',state.ui.closeToTray);queueSave();toast(state.ui.closeToTray?'X will hide to tray.':'X will quit the app.');}
    catch(e){setSwitch('trayInput',state.ui.closeToTray);toast(e.message);}});
  bind('notificationsInput','click',()=>{state.ui.notifications=!state.ui.notifications;setSwitch('notificationsInput',state.ui.notifications);queueSave();alertSettingsChanged();toast('Notification preference saved.');});
  $all('.check-row').forEach(row=>row.addEventListener('click',e=>{if(e.target.closest('button'))return;row.querySelector('button.switch')?.click();}));
}
async function boot(){state=cleanState(await loadState());currentView=state.ui.miniMode?'mini':'widget';document.documentElement.dataset.screen=currentView;if(state.ui.miniMode){$('widgetScreen').classList.add('hidden');$('miniScreen').classList.remove('hidden');}if(!bridge)$all('.desktop-only').forEach(b=>b.classList.add('hidden'));
  await WallpaperStudio.load();applyAppearance();renderForm();setupEvents();WallpaperStudio.bind();renderResin();setInterval(renderResin,1000);
  if(bridge?.hoyolabStatus){bridge.onHoyolabStatus?.(applySync);try{applySync(await bridge.hoyolabStatus());}catch(e){toast('Unable to load HoYoLAB state.');}}
  await resizeWindow();
  if(bridge?.telemetryOptions){try{telemetrySettings=await bridge.telemetryOptions();renderForm();}catch{}}
  if(bridge?.securityStatus){try{const s=await bridge.securityStatus();$('securityNote').textContent=`HoYoLAB cookies: ${s.partition}. Device encryption: ${s.encryption}. Credentials are not exposed to the widget.`;}catch{}}
  await checkStartupStatus();
}
boot().catch(e=>{console.error('Istaroth startup failed',e);toast('Startup failed: '+e.message);});
