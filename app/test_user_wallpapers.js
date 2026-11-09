'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'wallpaper-v2413.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'custom-wallpapers.css'),'utf8');
const themeCss=fs.readFileSync(path.join(__dirname,'color-only.css'),'utf8');
const img=label=>'data:image/webp;base64,'+Buffer.from(label).toString('base64');

async function createStudio(values,usingBridge=true){
  const styles=new Map(),miniStyles=new Map();
  const root={
    dataset:{},
    style:{setProperty:(key,value)=>styles.set(key,value)}
  };
  const mini={
    dataset:{},
    style:{setProperty:(key,value)=>miniStyles.set(key,value)}
  };
  const bridge={
    wallpaperGet:async()=>values.main||'',
    wallpaperMiniGet:async()=>values.mini||'',
    wallpaperResinGet:async()=>values.resin||''
  };
  const persisted={
    'teyvat-pulse-wallpaper':values.main||'',
    'teyvat-pulse-mini-wallpaper':values.mini||'',
    'istaroth-resin-card-wallpaper':values.resin||''
  };
  const prefs={dim:45,blur:0,zoom:110,x:50,y:50};
  const state={ui:{
    design:{...prefs,wallpaperTarget:'full'},
    resinAppearance:{...prefs},
    miniAppearance:{...prefs,textSize:100,showReady:true,showNext:true}
  }};
  const context={
    console, state,
    window: {pulseDesktop:usingBridge?bridge:null},
    document:{
      documentElement:root,
      getElementById:id=>id==='miniScreen'?mini:null
    },
    localStorage:{getItem:key=>persisted[key]||''},
    queueSave:()=>{},
    resinClean:obj=>obj
  };
  vm.runInNewContext(source+'\n;globalThis.__studio=WallpaperStudio;',context);
  const studio=context.__studio;
  await studio.load();
  studio.apply();
  return {studio,root,styles,mini,miniStyles};
}

(async()=>{
  const photos={main:img('Main'),resin:img('Resin'),mini:img('Mini')};
  for(const usingBridge of [true,false]){
    const {studio,root,styles,mini,miniStyles}=await createStudio(photos,usingBridge);
    assert.equal(root.dataset.wallTarget,'full','Main image must activate only Main background');
    assert.equal(root.dataset.resinWallpaper,'yes','Resin photo must activate only Resin card');
    assert.equal(mini.dataset.wallpaper,'yes','Mini photo must activate only Mini background');
    assert.equal(styles.get('--wall-image'),'url("'+photos.main+'")');
    assert.equal(styles.get('--resin-wall-image'),'url("'+photos.resin+'")');
    assert.equal(miniStyles.get('--wp13-mini-image'),'url("'+photos.mini+'")');
    assert.ok(studio._diagnostic().images.main===photos.main);
    assert.ok(studio._diagnostic().images.resin===photos.resin);
    assert.ok(studio._diagnostic().images.mini===photos.mini);
  }
  const empty=await createStudio({main:'',resin:'',mini:''});
  assert.equal(empty.root.dataset.wallTarget,'none');
  assert.equal(empty.root.dataset.resinWallpaper,'no');
  assert.equal(empty.mini.dataset.wallpaper,'no');
  assert.equal(empty.styles.get('--wall-image'),'none');
  assert.equal(empty.styles.get('--resin-wall-image'),'none');
  assert.equal(empty.miniStyles.get('--wp13-mini-image'),'none');
  // Malicious/unsupported URL must never be interpolated into a CSS background.
  const invalid=await createStudio({main:'https://example.com/photo.webp',resin:'javascript:alert(1)',mini:'data:image/svg+xml;base64,PHN2Zz4='});
  assert.equal(invalid.styles.get('--wall-image'),'none');
  assert.equal(invalid.root.dataset.resinWallpaper,'no');
  assert.equal(invalid.mini.dataset.wallpaper,'no');

  assert.ok(css.includes('#backgroundArt::after'));
  assert.ok(css.includes('.resin-card .card-wallpaper'));
  assert.ok(css.includes('.mini-wallpaper-layer'));
  assert.ok(themeCss.includes('--realm-scene: none !important'));
  assert.ok(!themeCss.includes('--wall-image: none !important'));
  assert.ok(!themeCss.includes('--resin-wall-image: none !important'));
  console.log('Main, Resin and Mini personal wallpaper loading, isolation and fallbacks passed.');
})().catch(err=>{console.error(err);process.exitCode=1;});
