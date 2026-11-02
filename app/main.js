'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, shell, screen, session, powerMonitor, net, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const hoyo = require('./hoyolab-sync');
const chronicleApi = require('./chronicle-sync');
const {createStartupService} = require('./windows-startup');
const {ResinTelemetry} = require('./resin-telemetry');
const {trayPng} = require('./tray-icon');
const {UpdateService} = require('./update-service');
const {spawn} = require('node:child_process');

// Preserve the original Teyvat Pulse userData directory and Chromium partition.
// Changing this path would sign existing users out and hide their saved resin history.
app.setName('Istaroth');
const persistentProfile = path.join(app.getPath('appData'), 'Teyvat Pulse');
fs.mkdirSync(persistentProfile, {recursive:true});
app.setPath('userData', persistentProfile);
app.setAppUserModelId('com.community.istaroth');

let mainWindow = null;
let tray = null;
let allowQuit = false;
let closeToTray = false;
let loginWindow = null;
let hoyoSession = null;
let roleChoices = [];
let liveNotes = null;
let lastSyncError = '';
let lastSyncStartedAt = 0;
let refreshInFlight = null;
let selectedRole = null;
let refreshMinutes = 15;
let autoRefresh = true;
let refreshTimer = null;
let startupService=null;
let telemetry=null;let updates=null;let latestOnline=true;let retries=0;let nextRetryAt=0;let lastTrayAmount='';
let securityInfo={partition:'isolated HoYoLAB session',encryption:'checking'};
let chronicleState = null;
let chronicleTask = null;
let chronicleStarted = 0;
function chroniclePublic(){return {state:chronicleState,busy:!!chronicleTask};}
function chroniclePush(){if(mainWindow && !mainWindow.isDestroyed())mainWindow.webContents.send('chronicle:status',chroniclePublic());}
async function chronicleRefresh(force=false){
  if(!selectedRole)throw Error('Connect a Genshin account first.');
  if(chronicleTask)return chronicleTask;
  if(force && chronicleState?.uid===selectedRole.uid && Date.now()-chronicleStarted<60_000)return chroniclePublic();
  if(!force && chronicleState?.uid===selectedRole.uid && chronicleState?.region===selectedRole.region && Date.now()-chronicleStarted<60*60_000)return chroniclePublic();
  chronicleStarted=Date.now();
  const requested={...selectedRole};
  chronicleTask=(async()=>{
    try{
      const result=await chronicleApi.fetchChronicle(hoyoSession,requested,(incremental)=>{
        if(selectedRole?.uid!==requested.uid || selectedRole?.region!==requested.region)return;
        // Keep previously available sections if this individual endpoint fails.
        const merged={...incremental,sections:{...(chronicleState?.uid===requested.uid?chronicleState.sections:{}),...incremental.sections}};
        for(const [key,section] of Object.entries(incremental.sections)){
          if(section.status==='unavailable'&&chronicleState?.uid===requested.uid&&chronicleState?.sections[key]?.status==='ok'){
            merged.sections[key]={...chronicleState.sections[key],stale:true,error:section.error};
          }
        }
        chronicleState=merged;
        chroniclePush();
      });
      return result;
    }finally{chronicleTask=null;chroniclePush();}
  })();
  chroniclePush();
  return chronicleTask;
}
function clearChronicle(){chronicleState=null;chronicleStarted=0;chroniclePush();}


function accountConfigFile() { return path.join(app.getPath('userData'), 'teyvat-pulse-account.json'); }
function saveAccountConfig() {
  fs.mkdirSync(path.dirname(accountConfigFile()), { recursive: true });
  fs.writeFileSync(accountConfigFile(), JSON.stringify({ selectedRole, refreshMinutes, autoRefresh }));
}
function loadAccountConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(accountConfigFile(), 'utf8'));
    selectedRole = hoyo.safeRole({ game_uid: c?.selectedRole?.uid, region: c?.selectedRole?.region, nickname: c?.selectedRole?.nickname, level: c?.selectedRole?.level });
    refreshMinutes = hoyo.REFRESH_OPTIONS.includes(c?.refreshMinutes) ? c.refreshMinutes : 15;
    autoRefresh = c?.autoRefresh !== false;
  } catch { /* first run */ }
}
function publicSyncStatus() {
  return { connected: !!selectedRole, role: selectedRole, roles: roleChoices,
    refreshMinutes, autoRefresh, notes: liveNotes, error: lastSyncError,
    busy: !!refreshInFlight, lastSyncStartedAt };
}
function pushSyncStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('hoyolab:status', publicSyncStatus());
}
function officialSite(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ['hoyolab.com','hoyoverse.com','mihoyo.com'].some(d => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch { return false; }
}
function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) { loginWindow.show(); loginWindow.focus(); return true; }
  loginWindow = new BrowserWindow({
    title: 'Official HoYoLAB Sign-In · Istaroth', width: 970, height: 760,
    minWidth: 720, minHeight: 500, autoHideMenuBar: true,
    webPreferences: { partition: 'persist:teyvatpulse-hoyolab', nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true }
  });
  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Do not open untrusted OAuth, pop-up or third-party URLs with the shared login session.
    return { action: 'deny' };
  });
  loginWindow.webContents.on('will-navigate', (event, url) => { if (!officialSite(url)) event.preventDefault(); });
  loginWindow.webContents.on('will-redirect', (event, url) => { if (!officialSite(url)) event.preventDefault(); });
  loginWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  loginWindow.loadURL('https://www.hoyolab.com/').catch(() => {});
  loginWindow.on('closed', () => { loginWindow = null; });
  return true;
}
async function refreshLive() {
  if (!selectedRole) throw new Error('Connect a Genshin account first.');
  if (refreshInFlight) return refreshInFlight;
  lastSyncStartedAt = Date.now();
  lastSyncError = '';
  const role = { ...selectedRole };
  refreshInFlight = (async () => {
    try {
      const result = await hoyo.fetchNotes(hoyoSession, role);
      // Discard results from an account that was changed/disconnected mid-request.
      if (selectedRole?.uid === role.uid && selectedRole?.region === role.region) {
        liveNotes = result;
        lastSyncError = '';
        retries=0;nextRetryAt=0;
        telemetry?.append(result,role.uid);
        tickTelemetry();
      }
      if(!chronicleTask && Date.now()-chronicleStarted>=60*60_000)chronicleRefresh().catch(()=>{});
      return publicSyncStatus();
    } catch (err) {
      lastSyncError = err instanceof Error ? err.message.slice(0, 180) : 'Unknown synchronization error';
      retries=Math.min(retries+1,6);nextRetryAt=Date.now()+Math.min(30,Math.pow(2,retries-1))*60_000;
      throw new Error(lastSyncError);
    } finally {
      refreshInFlight = null;
      pushSyncStatus();
    }
  })();
  pushSyncStatus();
  return refreshInFlight;
}

const SIZE = { width: 610, height: 770 }; // Comfortable default for larger typography
const WALLPAPER_LIMIT = 8 * 1024 * 1024;
const wallpaperFile = () => path.join(app.getPath('userData'), 'teyvat-pulse-wallpaper.webp');
// Mini has a separate local file. Keep the original Main path untouched for upgrades.
const miniWallpaperFile = () => path.join(app.getPath('userData'), 'istaroth-mini-wallpaper.webp');
const resinWallpaperFile = () => path.join(app.getPath('userData'), 'istaroth-resin-card-wallpaper.webp');
function wallpaperBytes(data) {
  if (typeof data !== 'string' || !data.startsWith('data:image/webp;base64,') || data.length > WALLPAPER_LIMIT*1.5) throw new Error('Invalid wallpaper.');
  const raw=Buffer.from(data.slice('data:image/webp;base64,'.length),'base64');
  if(raw.length===0 || raw.length>WALLPAPER_LIMIT || raw.toString('ascii',0,4)!=='RIFF' || raw.toString('ascii',8,12)!=='WEBP') throw new Error('Only WebP images up to 8 MB are supported after processing.');
  return raw;
}

const allowedLinks = {
  hoyolab: 'https://www.hoyolab.com/',
  map: 'https://act.hoyolab.com/ys/app/interactive-map/index.html'
};

function dataFile() { return path.join(app.getPath('userData'), 'teyvat-pulse-data.json'); }
function readData() {
  try {
    const raw = fs.readFileSync(dataFile(), 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch { return null; }
}
function saveData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const content = JSON.stringify(value);
  if (content.length > 90000) return false;
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
    const tempfile = dataFile() + '.tmp';
    fs.writeFileSync(tempfile, content, 'utf8');
    fs.renameSync(tempfile, dataFile());
    return true;
  } catch (err) { console.error('Could not persist widget state', err); return false; }
}


function estimatedResin(now=Date.now()) {
  if(!liveNotes?.resin || !selectedRole)return null;
  const r=liveNotes.resin,at=Number(liveNotes.fetchedAt);
  if(!Number.isFinite(at)||!Number.isFinite(r.value)||!Number.isFinite(r.cap))return null;
  // Official Real-Time Notes supplies the recovery seconds; use its finish estimate.
  const fullAt=Number(r.fullAt)||at,step=480_000;
  const amount=r.value>=r.cap?r.cap:Math.min(r.cap,Math.max(r.value,r.cap-Math.ceil(Math.max(0,fullAt-now)/step)));
  return {amount,cap:r.cap,at,fullAt};
}
function trayUpdate() {
  if(!tray||tray.isDestroyed())return;
  const r=estimatedResin(),amount=r?.amount??null,stale=!r||Date.now()-r.at>30*60_000;
  const key=`${amount}|${r?.cap}|${stale}`;
  if(lastTrayAmount===key)return;
  lastTrayAmount=key;
  try{tray.setImage(nativeImage.createFromBuffer(trayPng(amount,r?.cap||200,stale)));}catch(e){console.warn('Tray icon update failed',e.message);}
  tray.setToolTip(r?`Istaroth · ${amount}/${r.cap} resin${stale?' (last known estimate)':''} · ${selectedRole?.nickname||''}`:'Istaroth · Connect HoYoLAB to see your resin');
}
function tickTelemetry() {
  trayUpdate();
  if(!liveNotes||!selectedRole||!telemetry)return;
  const alert=telemetry.shouldAlert(liveNotes,selectedRole.uid);
  if(alert&&Notification.isSupported())new Notification({...alert,icon:path.join(__dirname,'assets','icon.png')}).show();
}
async function reconnectSync(reason='network') {
  if(!selectedRole||!autoRefresh||refreshInFlight||!net.isOnline()||Date.now()<nextRetryAt)return false;
  if(Date.now()-lastSyncStartedAt<90_000)return false;
  try{await refreshLive();return true;}catch(e){console.warn('Resync after '+reason+':',e.message);return false;}
}
async function auditSessionSecurity(){
  try{const encrypted=await safeStorage.isAsyncEncryptionAvailable();
    let probe=false;if(encrypted){const secret='Istaroth security probe';const sealed=await safeStorage.encryptStringAsync(secret);const opened=await safeStorage.decryptStringAsync(sealed);probe=opened?.result===secret;}
    securityInfo={partition:'persist:teyvatpulse-hoyolab (dedicated)',encryption:probe?'OS encryption round-trip passed':encrypted?'OS encryption available; probe failed':'OS encryption unavailable',rawCookiesExposedToUI:false};
  }catch{securityInfo={partition:'persist:teyvatpulse-hoyolab (dedicated)',encryption:'unavailable',rawCookiesExposedToUI:false};}
  return securityInfo;
}
function updateWindowFloat(){
  if(!mainWindow||mainWindow.isDestroyed())return;
  const data=readData();const active=!!data?.ui?.miniMode&&!!data?.ui?.floatingMini;
  // Frame is always native-borderless. When floating, keep above other windows.
  mainWindow.setAlwaysOnTop(active||!!data?.ui?.pinned,'floating');
  mainWindow.setSkipTaskbar(active);
  mainWindow.setResizable(!active);
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
}
function createTray() {
  const icon = nativeImage.createFromBuffer(trayPng(null));
  tray = new Tray(icon);
  tray.setToolTip('Istaroth · Genshin desktop widget');
  const menu = Menu.buildFromTemplate([
    { label: 'Show Istaroth', click: showWindow },
    { label: 'Hide widget', click: () => mainWindow?.hide() },
    { label: 'Sync HoYoLAB now', click: () => refreshLive().catch(()=>{}) ,enabled:!!selectedRole},
    { type: 'separator' },
    { label: 'Quit completely', click: () => { allowQuit = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', showWindow);
  tray.on('click', showWindow);
  trayUpdate();
}
function createWindow() {
  const saved = readData();
  closeToTray = !!saved?.ui?.closeToTray;
  const workArea = screen.getPrimaryDisplay().workArea;
  const preferred = saved?.ui?.miniMode ? {width:360,height:296} : saved?.ui?.design?.size === 'compact' ? {width:510,height:680} : SIZE;
  const height = Math.max(240, Math.min(preferred.height, workArea.height - 18));
  const width = Math.max(320, Math.min(preferred.width, workArea.width - 18));
  const x = Math.round(workArea.x + workArea.width - width - 24);
  const y = Math.round(workArea.y + (workArea.height - height) / 2);

  mainWindow = new BrowserWindow({
    width, height, x, y,
    minWidth: 320, minHeight: 240,
    frame: false,
    resizable: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    skipTaskbar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      webSecurity: true
    }
  });
  mainWindow.setAlwaysOnTop(!!saved?.ui?.pinned || !!(saved?.ui?.miniMode&&saved?.ui?.floatingMini), 'floating');
  if(saved?.ui?.miniMode&&saved?.ui?.floatingMini){mainWindow.setResizable(false);mainWindow.setSkipTaskbar(true);}
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('close', (event) => {
    if (!allowQuit && closeToTray && tray && !tray.isDestroyed()) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    hoyoSession = session.fromPartition('persist:teyvatpulse-hoyolab');
    // Authentication cookies remain in Chromium's dedicated persisted session; never saved in JS settings.
    auditSessionSecurity().catch(()=>{});
    telemetry=new ResinTelemetry(app.getPath('userData'));
    updates=new UpdateService(app.getPath('userData'),app.getVersion());
    loadAccountConfig();
    startupService=createStartupService(app,{env:process.env,execPath:process.execPath,isPackaged:app.isPackaged,appPath:app.getAppPath(),isBundled:fs.existsSync(path.join(path.dirname(process.execPath),'resources','app','package.json'))},path.join(app.getPath('userData'),'startup-preference.json'));
    const startupResult=startupService.initialize();
    if(startupResult.error) console.warn('Windows startup registration:',startupResult.error);
    ipcMain.handle('startup:get',()=>startupService.get());
    ipcMain.handle('startup:set',(_event,enabled)=>startupService.set(enabled));
    ipcMain.handle('startup:repair',()=>startupService.repair());
    ipcMain.handle('hoyolab:status', () => publicSyncStatus());
    ipcMain.handle('hoyolab:test',async()=>{const result=await refreshLive();return {verified:!!result.notes,uid:result.role?.uid||'',fetchedAt:result.notes?.fetchedAt||null,source:'HoYoLAB Real-Time Notes',error:result.error||''};});
    ipcMain.handle('security:status',()=>securityInfo);
    ipcMain.handle('telemetry:history',()=>telemetry.getHistory(selectedRole?.uid));
    ipcMain.handle('telemetry:options',(_event,opts)=>telemetry.options(opts));
    ipcMain.handle('update:status',()=>updates.status());
    ipcMain.handle('update:settings',(_event,opts)=>updates.settings(opts));
    ipcMain.handle('update:check',(_event,download)=>updates.check(!!download));
    ipcMain.handle('update:install',()=>{if(!updates.ready||!fs.existsSync(updates.ready))throw Error('No verified update downloaded');const c=spawn(updates.ready,[],{detached:true,stdio:'ignore',windowsHide:true});c.unref();allowQuit=true;app.quit();return true;});
    ipcMain.handle('chronicle:status',()=>chroniclePublic());
    ipcMain.handle('chronicle:refresh',()=>chronicleRefresh(true).then(()=>chroniclePublic()));
    ipcMain.handle('hoyolab:login', () => openLoginWindow());
    ipcMain.handle('hoyolab:roles', async () => {
      roleChoices = await hoyo.fetchRoles(hoyoSession);
      pushSyncStatus();
      return publicSyncStatus();
    });
    ipcMain.handle('hoyolab:select', async (_event, uid) => {
      const choice = roleChoices.find(r => r.uid === String(uid));
      if (!choice) throw new Error('Choose one of the linked HoYoLAB accounts first.');
      selectedRole = choice;
      clearChronicle();
      liveNotes = null;
      lastSyncError = '';
      saveAccountConfig();
      pushSyncStatus();
      chronicleRefresh().catch(()=>{});
      return await refreshLive();
    });
    ipcMain.handle('hoyolab:manualRole', async (_event, uid, region) => {
      const choice = hoyo.safeRole({ game_uid: String(uid), region: String(region), nickname: 'Traveler' });
      if (!choice) throw new Error('Enter a valid UID and choose the matching Genshin server.');
      await hoyo.getAuthHeader(hoyoSession);
      selectedRole = choice;
      clearChronicle();
      liveNotes = null;
      lastSyncError = '';
      saveAccountConfig();
      pushSyncStatus();
      chronicleRefresh().catch(()=>{});
      return refreshLive();
    });
    ipcMain.handle('hoyolab:refresh', () => refreshLive());
    ipcMain.handle('hoyolab:options', (_event, opts) => {
      if (opts && hoyo.REFRESH_OPTIONS.includes(opts.minutes)) refreshMinutes = opts.minutes;
      if (opts && typeof opts.auto === 'boolean') autoRefresh = opts.auto;
      saveAccountConfig(); pushSyncStatus(); return publicSyncStatus();
    });
    ipcMain.handle('hoyolab:disconnect', async () => {
      selectedRole = null; roleChoices = []; liveNotes = null; lastSyncError = '';clearChronicle();
      saveAccountConfig();
      if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
      await hoyoSession.clearStorageData();
      // Delete cookies and other sign-in storage for this isolated partition only.
      await hoyoSession.clearCache();
      lastTrayAmount='';trayUpdate();
      pushSyncStatus(); return publicSyncStatus();
    });
    ipcMain.handle('wallpaper:set', (_event, data) => {
      const bytes=wallpaperBytes(data);
      const destination=wallpaperFile();fs.mkdirSync(path.dirname(destination),{recursive:true});
      const tmp=destination+'.tmp';fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,destination);
      return 'data:image/webp;base64,'+bytes.toString('base64');
    });
    ipcMain.handle('wallpaper:get', () => {
      try{const info=fs.statSync(wallpaperFile());if(info.size>WALLPAPER_LIMIT)return '';
        const bytes=fs.readFileSync(wallpaperFile());if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')return '';
        return 'data:image/webp;base64,'+bytes.toString('base64');
      }catch{return '';}
    });
    ipcMain.handle('wallpaper:clear', () => {try{fs.unlinkSync(wallpaperFile());}catch(e){if(e.code!=='ENOENT')throw e;}return true;});
    ipcMain.handle('wallpaper:mini:set', (_event, data) => {
      const bytes=wallpaperBytes(data);
      const destination=miniWallpaperFile();fs.mkdirSync(path.dirname(destination),{recursive:true});
      const tmp=destination+'.tmp';fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,destination);
      return 'data:image/webp;base64,'+bytes.toString('base64');
    });
    ipcMain.handle('wallpaper:mini:get', () => {
      try{const info=fs.statSync(miniWallpaperFile());if(info.size>WALLPAPER_LIMIT)return '';
        const bytes=fs.readFileSync(miniWallpaperFile());if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')return '';
        return 'data:image/webp;base64,'+bytes.toString('base64');
      }catch{return '';}
    });
    ipcMain.handle('wallpaper:mini:clear', () => {
      try{fs.unlinkSync(miniWallpaperFile());}catch(e){if(e.code!=='ENOENT')throw e;}
      return true;
    });
    // The resin card has a third, isolated wallpaper file. Never overwrite Main/Mini images.
    ipcMain.handle('wallpaper:resin:set', (_event,data) => {
      const bytes=wallpaperBytes(data);
      const dest=resinWallpaperFile();fs.mkdirSync(path.dirname(dest),{recursive:true});
      const temp=dest+'.tmp';fs.writeFileSync(temp,bytes);fs.renameSync(temp,dest);
      return 'data:image/webp;base64,'+bytes.toString('base64');
    });
    ipcMain.handle('wallpaper:resin:get', () => {
      try{const info=fs.statSync(resinWallpaperFile());if(info.size>WALLPAPER_LIMIT)return '';
        const bytes=fs.readFileSync(resinWallpaperFile());
        if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP')return '';
        return 'data:image/webp;base64,'+bytes.toString('base64');
      }catch{return '';}
    });
    ipcMain.handle('wallpaper:resin:clear', () => {
      try{fs.unlinkSync(resinWallpaperFile());}catch(e){if(e.code!=='ENOENT')throw e;}
      return true;
    });
    ipcMain.handle('window:size', (_event, mode) => {
      if (!mainWindow || mainWindow.isDestroyed()) return false;
      const sizes = { mini: [360, 296], floating: [360, 248], compact: [510, 680], standard: [610, 770], settings: [1060, 970] };
      const desired = sizes[mode];
      if (!desired) return false;
      const display = screen.getDisplayMatching(mainWindow.getBounds());
      const available = display.workArea;
      // Never position the app outside the visible desktop, even on smaller monitors.
      const w = Math.max(320, Math.min(desired[0], available.width - 16));
      const h = Math.max(240, Math.min(desired[1], available.height - 16));
      const bounds = mainWindow.getBounds();
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const x = Math.max(available.x, Math.min(Math.round(centerX - w/2), available.x + available.width - w));
      const y = Math.max(available.y, Math.min(Math.round(centerY - h/2), available.y + available.height - h));
      mainWindow.setBounds({ x, y, width:w, height:h }, true);
      return true;
    });
    ipcMain.handle('state:load', () => readData());
    ipcMain.handle('state:save', (_event, data) => {const success=saveData(data);if(success)updateWindowFloat();return success;});
    ipcMain.handle('window:pin', (_event, flag) => {
      mainWindow?.setAlwaysOnTop(!!flag, 'floating');
      return !!mainWindow?.isAlwaysOnTop();
    });
    ipcMain.handle('window:close-behavior', (_event, flag) => {
      closeToTray = !!flag;
      return closeToTray;
    });
    ipcMain.handle('window:close', () => {
      if (closeToTray && tray && !tray.isDestroyed()) mainWindow?.hide();
      else { allowQuit = true; app.quit(); }
      return true;
    });
    ipcMain.handle('window:hide', () => { mainWindow?.hide(); return true; });
    ipcMain.handle('window:minimize', () => { mainWindow?.minimize(); return true; });
    ipcMain.handle('window:quit', () => { allowQuit = true; app.quit(); });
    ipcMain.handle('shell:open', (_event, key) => {
      const url = allowedLinks[key];
      if (!url) return false;
      return shell.openExternal(url).then(() => true).catch(() => false);
    });
    ipcMain.handle('notify', (_event, payload) => {
      if (!Notification.isSupported() || typeof payload?.title !== 'string') return false;
      const title = payload.title.slice(0, 90);
      const body = typeof payload.body === 'string' ? payload.body.slice(0, 200) : '';
      new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icon.png') }).show();
      return true;
    });
    try { createTray(); } catch (err) { console.error('Tray unavailable', err); }
    createWindow();
    // Updates run even while hidden, with backoff on API failures.
    latestOnline=net.isOnline();
    powerMonitor.on('resume',()=>{setTimeout(()=>reconnectSync('wake'),3500);});
    refreshTimer = setInterval(() => {
      const online=net.isOnline();if(online&&!latestOnline)setTimeout(()=>reconnectSync('network restored'),1500);latestOnline=online;
      tickTelemetry();
      if (selectedRole && autoRefresh && !refreshInFlight &&
        online && Date.now()>=nextRetryAt && Date.now() - lastSyncStartedAt >= refreshMinutes * 60_000) {
        refreshLive().catch(() => {});
      }
    }, 30_000);
    setInterval(()=>{if(updates?.settings().repo&&updates.settings().autoCheck)updates.check().catch(()=>{});},6*3600_000).unref();
    setTimeout(()=>{if(updates?.settings().repo&&updates.settings().autoCheck)updates.check().catch(()=>{});},15_000);
    if (selectedRole && autoRefresh) setTimeout(() => refreshLive().catch(() => {}), 3500);
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { allowQuit = true; clearInterval(refreshTimer); });
  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else showWindow();
  });
}
