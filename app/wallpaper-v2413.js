"use strict";
/* Istaroth v1.0 Wallpaper Studio: two independent channels with no shared visual state.
   The real Main and Mini widget DOMs have independent wallpaper layers.
   Legacy Main settings (state.ui.design) and Mini (state.ui.miniAppearance) are retained. */
const WallpaperStudio=(()=>{
  const selectors={main:'mainWp',mini:'miniWp',resin:'resinWp'};
  const files={main:'',mini:'',resin:''};
  const defaults={dim:45,blur:0,zoom:110,x:50,y:50};
  const miniKeys={get:()=>window.pulseDesktop?.wallpaperMiniGet?.(),set:data=>window.pulseDesktop?.wallpaperMiniSet?.(data),clear:()=>window.pulseDesktop?.wallpaperMiniClear?.()};
  const mainKeys={get:()=>window.pulseDesktop?.wallpaperGet?.(),set:data=>window.pulseDesktop?.wallpaperSet?.(data),clear:()=>window.pulseDesktop?.wallpaperClear?.()};
  const keyName={main:'teyvat-pulse-wallpaper',mini:'teyvat-pulse-mini-wallpaper',resin:'istaroth-resin-card-wallpaper'};
  const $id=id=>document.getElementById(id);
  let active='main',observer=null,bound=false;
  const getPrefs=scope=>scope==='main'?state.ui.design:scope==='resin'?state.ui.resinAppearance:state.ui.miniAppearance;
  const resinKeys={get:()=>window.pulseDesktop?.wallpaperResinGet?.(),set:data=>window.pulseDesktop?.wallpaperResinSet?.(data),clear:()=>window.pulseDesktop?.wallpaperResinClear?.()};
  const store=scope=>scope==='main'?mainKeys:scope==='resin'?resinKeys:miniKeys;
  function imageValue(image){return image?`url("${image.replaceAll('"','%22')}")`:'none';}
  function apply(){
    if(!state)return;
    const m=getPrefs('main'),n=getPrefs('mini'),r=getPrefs('resin');
    const root=document.documentElement;
    // Main wallpaper may only be consumed by the Main widget background and card.
    root.style.setProperty('--wall-image',imageValue(files.main));
    root.dataset.wallTarget=files.main?'full':'none';
    for(const [prop,val] of [['--dim',m.dim/100],['--blur',m.blur+'px'],['--zoom',m.zoom/100],['--pos-x',m.x+'%'],['--pos-y',m.y+'%']]) root.style.setProperty(prop,String(val));
    // Resin card wallpaper has its own file, layer and appearance controls.
    // It never reads the Main or Mini image or their transform variables.
    root.style.setProperty('--resin-wall-image',imageValue(files.resin));
    root.style.setProperty('--resin-present',files.resin?'1':'0');
    root.style.setProperty('--resin-dim',String(r.dim/100));
    root.style.setProperty('--resin-blur',r.blur+'px');
    root.style.setProperty('--resin-zoom',String(r.zoom/100));
    root.style.setProperty('--resin-x',r.x+'%');
    root.style.setProperty('--resin-y',r.y+'%');
    // Mini artwork lives on a dedicated child INSIDE #miniScreen. Never use --wall-image here.
    const mini=$id('miniScreen');
    if(mini){
      mini.style.setProperty('--wp13-mini-image',imageValue(files.mini));
      mini.style.setProperty('--wp13-mini-dim',String(n.dim/100));
      mini.style.setProperty('--wp13-mini-blur',n.blur+'px');
      mini.style.setProperty('--wp13-mini-zoom',String(n.zoom/100));
      mini.style.setProperty('--wp13-mini-x',n.x+'%');
      mini.style.setProperty('--wp13-mini-y',n.y+'%');
      mini.dataset.wallpaper=files.mini?'yes':'no';
    }
    // Preserve existing Mini layout controls that are outside Wallpaper section.
    root.style.setProperty('--mini-text-size',String(n.textSize/100));
    root.dataset.miniReady=n.showReady?'on':'off';
    root.dataset.miniNext=n.showNext?'on':'off';
    render();
    refreshPreview();
  }
  async function load(){
    for(const scope of ['main','mini','resin']){
      try{
        const getter=store(scope).get;
        files[scope]=(window.pulseDesktop && typeof window.pulseDesktop[scope==='main'?'wallpaperGet':scope==='resin'?'wallpaperResinGet':'wallpaperMiniGet']==='function')
          ? (await getter()||'') : (localStorage.getItem(keyName[scope])||'');
      }catch(error){files[scope]='';console.warn(scope+' wallpaper load failed',error);}
    }
    // Migrate old card-only wallpaper once, preserving its image and adjustment values.
    // Do not remove Main's historical file, so an interrupted migration loses nothing.
    if(state.ui.design.wallpaperTarget==='card' && files.main){
      if(!files.resin){
        await persistFile('resin',files.main);
        files.resin=files.main;
        state.ui.resinAppearance=resinClean(state.ui.design);
      }
      // Old card-only image should not unexpectedly become a full Main background.
      await persistFile('main','',true);
      files.main='';
      state.ui.design.wallpaperTarget='full';
      queueSave();
    }
  }
  function render(){
    if(!state)return;
    for(const scope of ['main','mini','resin']){
      const id=selectors[scope],prefs=getPrefs(scope),present=!!files[scope];
      const thumbnail=$id(id+'Thumbnail');
      if(!thumbnail)continue;
      thumbnail.style.backgroundImage=present?imageValue(files[scope]):'';
      $id(id+'Empty').hidden=present;
      $id(id+'Clear').disabled=!present;
      for(const key of ['dim','blur','zoom','x','y']){
        const el=$id(id+key[0].toUpperCase()+key.slice(1));
        el.value=prefs[key];
        $id(el.id+'Output').textContent=prefs[key]+(key==='blur'?'px':'%');
      }

    }
  }
  async function persistFile(scope,data,clear=false){
    const method=store(scope);
    const ipcName=scope==='main'?'wallpaperSet':scope==='resin'?'wallpaperResinSet':'wallpaperMiniSet';
    const ipcClear=scope==='main'?'wallpaperClear':scope==='resin'?'wallpaperResinClear':'wallpaperMiniClear';
    if(window.pulseDesktop && typeof window.pulseDesktop[clear?ipcClear:ipcName]==='function'){
      if(clear)await method.clear();else await method.set(data);
    } else if(clear){localStorage.removeItem(keyName[scope]);}
    else localStorage.setItem(keyName[scope],data);
  }
  async function chooseFile(scope,file){
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))return toast('Choose a PNG, JPG or WebP image.');
    if(file.size>8*1024*1024)return toast('Wallpaper must be 8 MB or smaller.');
    let bitmap=null,url=null;
    try{
      let image;
      if(typeof createImageBitmap==='function'){bitmap=await createImageBitmap(file);image=bitmap;}
      else{url=URL.createObjectURL(file);image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
      const ratio=Math.min(1,1800/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/webp',.86);
      if(!data.startsWith('data:image/webp;base64,'))throw Error('WebP encoding unavailable');
      await persistFile(scope,data);
      files[scope]=data;
      apply();toast((scope==='main'?'Main background':scope==='resin'?'Resin card':'Mini')+' wallpaper saved.');
    }catch(error){console.error(error);toast('Could not save wallpaper: '+error.message);}
    finally{bitmap?.close?.();if(url)URL.revokeObjectURL(url);$id(selectors[scope]+'File').value='';}
  }
  async function clear(scope){
    try{await persistFile(scope,'',true);files[scope]='';apply();toast((scope==='main'?'Main background':scope==='resin'?'Resin card':'Mini')+' wallpaper removed.');}
    catch(error){toast('Could not remove '+scope+' wallpaper.');}
  }
  function change(scope,key,value){
    // Never re-use the opposite scope's preferences or overwrite the other channel.
    if(scope==='main')state.ui.design=designClean({...state.ui.design,[key]:value});
    else if(scope==='resin')state.ui.resinAppearance=resinClean({...state.ui.resinAppearance,[key]:value});
    else state.ui.miniAppearance=miniClean({...state.ui.miniAppearance,[key]:value});
    apply();queueSave();
  }

  function strippedClone(source){
    const node=source.cloneNode(true);
    for(const child of [node,...node.querySelectorAll('[id]')]){
      if(child.id){child.dataset.wpSource=child.id;child.removeAttribute('id');}
      if(child.matches('button,input,a,select'))child.setAttribute('tabindex','-1');
    }
    node.classList.remove('hidden');
    return node;
  }
  function buildPreview(scope){
    if(!$id(selectors[scope]+'Stage'))return;
    const stage=$id(selectors[scope]+'Stage');
    const frame=document.createElement('div');frame.className='app-frame wp13-frame';
    const header=strippedClone(document.querySelector('.chrome'));
    frame.append(header);
    if(scope==='main'){
      // Use same real wallpaper frame as the Main widget, never create a Mini image layer.
      frame.prepend(strippedClone($id('backgroundArt')));
      const widget=strippedClone($id('widgetScreen'));
      widget.querySelectorAll('.dash-pane').forEach(p=>{
        if(p.dataset.wpSource==='pane-resin'){p.classList.remove('hidden');p.classList.add('wp-resin-pane');}
        else p.remove();
      });
      frame.append(widget);
    }else{
      const mini=strippedClone($id('miniScreen'));
      mini.style.setProperty('--wp13-mini-image',imageValue(files.mini));
      const n=state.ui.miniAppearance;
      mini.style.setProperty('--wp13-mini-dim',String(n.dim/100));
      mini.style.setProperty('--wp13-mini-blur',n.blur+'px');
      mini.style.setProperty('--wp13-mini-zoom',String(n.zoom/100));
      mini.style.setProperty('--wp13-mini-x',n.x+'%');
      mini.style.setProperty('--wp13-mini-y',n.y+'%');
      mini.dataset.wallpaper=files.mini?'yes':'no';
      frame.append(mini);
    }
    stage.replaceChildren(frame);
    fit(scope);
  }
  function fit(scope){
    const stage=$id(selectors[scope]+'Stage'),viewport=$id(selectors[scope]+'Viewport');
    if(!stage?.firstChild||!viewport)return;
    const w=scope==='main'?610:360,h=scope==='main'?770:296;
    const available=Math.max(160,viewport.clientWidth-18);
    const scale=Math.min(scope==='main'?.76:1,available/w,(scope==='main'?375:320)/h);
    stage.style.width=w+'px';stage.style.height=h+'px';
    stage.style.transform=`scale(${scale})`;
    stage.style.left=Math.max(0,(viewport.clientWidth-w*scale)/2)+'px';
    viewport.style.height=Math.ceil(h*scale+25)+'px';
  }
  function refreshPreview(force=false){
    if(!state||!$id(selectors[active]+'Stage'))return;
    const stage=$id(selectors[active]+'Stage');
    if(force || !stage.firstElementChild)buildPreview(active);
    else {
      if(active==='mini'){
        const mini=stage.querySelector('.mini-screen');
        if(mini){const n=state.ui.miniAppearance;
          mini.style.setProperty('--wp13-mini-image',imageValue(files.mini));
          mini.style.setProperty('--wp13-mini-dim',String(n.dim/100));
          mini.style.setProperty('--wp13-mini-blur',n.blur+'px');
          mini.style.setProperty('--wp13-mini-zoom',String(n.zoom/100));
          mini.style.setProperty('--wp13-mini-x',n.x+'%');mini.style.setProperty('--wp13-mini-y',n.y+'%');
          mini.dataset.wallpaper=files.mini?'yes':'no';
        }
      }
    }
  }
  function updateReadings(){
    const stage=$id(selectors[active]+'Stage');if(!stage?.firstElementChild)return;
    for(const copy of stage.querySelectorAll('[data-wp-source]')){
      const original=$id(copy.dataset.wpSource);
      if(!original)continue;
      if(original.childElementCount===0 && copy.textContent!==original.textContent)copy.textContent=original.textContent;
      if(['resinProgressFill','miniFill'].includes(copy.dataset.wpSource))copy.style.width=original.style.width;
    }
  }
  function bind(){
    if(bound)return;bound=true;
    for(const scope of ['main','mini','resin']){
      const prefix=selectors[scope];
      $id(prefix+'Choose').addEventListener('click',()=>$id(prefix+'File').click());
      $id(prefix+'File').addEventListener('change',()=>chooseFile(scope,$id(prefix+'File').files?.[0]));
      $id(prefix+'Clear').addEventListener('click',()=>clear(scope));
      for(const key of ['dim','blur','zoom','x','y']){
        const id=prefix+key[0].toUpperCase()+key.slice(1);
        $id(id).addEventListener('input',()=>change(scope,key,Number($id(id).value)));
      }
      $id(prefix+'Reset').addEventListener('click',()=>{for(const key of ['dim','blur','zoom','x','y']){
        if(scope==='main')state.ui.design[key]=defaults[key];else if(scope==='resin')state.ui.resinAppearance[key]=DEFAULT_RESIN_APPEARANCE[key];else state.ui.miniAppearance[key]=defaults[key];
      }apply();queueSave();});
    }
    if(typeof ResizeObserver==='function'){
      observer=new ResizeObserver(()=>fit(active));
      observer.observe($id('mainWpViewport'));observer.observe($id('miniWpViewport'));
    }
    // Main and Mini have independent top-level settings pages.
  }
  function show(scope){active=scope==='mini'?'mini':'main';render();refreshPreview(true);}
  return Object.freeze({load,apply,render,bind,show,updateReadings, _diagnostic:()=>({images:{main:files.main,mini:files.mini,resin:files.resin},prefs:{main:{...getPrefs('main')},mini:{...getPrefs('mini')},resin:{...getPrefs('resin')}}})});
})();
