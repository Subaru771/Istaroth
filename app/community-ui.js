'use strict';
// Coordinates the original Istaroth journal with a separate, sandboxed
// first-party Community web session. Only geometry and the selected Worker URL
// cross IPC; the remote website cannot call desktop APIs.
(() => {
  const bridge=window.pulseDesktop;
  const $=id=>document.getElementById(id);
  let connected=false, tab='resin', raf=0, lastBounds='';
  const status=$('communityState');
  const message=text=>{
    const field=connected?$('communityMessage'):$('communitySetupMessage');
    field.textContent=String(text||'');
  };
  function active(){
    return connected&&tab==='community'&&
      document.documentElement.dataset.screen==='widget'&&
      !$('pane-community').classList.contains('hidden');
  }
  function sendBounds(){
    raf=0;
    const visible=active();
    if(!visible){
      lastBounds='';
      bridge?.communityShow?.(false,null).catch(()=>{});
      return;
    }
    const r=$('communityViewport').getBoundingClientRect();
    if(r.width<220||r.height<160||!Number.isFinite(r.x))return;
    const bounds={x:r.x,y:r.y,width:r.width,height:r.height};
    const sig=[bounds.x,bounds.y,bounds.width,bounds.height].map(n=>Math.round(n)).join(':');
    if(sig===lastBounds)return;
    lastBounds=sig;
    bridge?.communityShow?.(true,bounds).catch(error=>{
      status.textContent='View unavailable';
      message(error?.message||'Could not open the Community view.');
    });
  }
  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(sendBounds);
  }
  function render(info){
    connected=!!info?.configured;
    $('communitySetup').classList.toggle('hidden',connected);
    $('communityConnected').classList.toggle('hidden',!connected);
    status.textContent=connected?'Connected · Cloud':'Not connected';
    $('communityOrigin').textContent=connected?info.url.replace(/^https:\/\//,''):'';
    $('communityUrl').value=info?.url||'';
    lastBounds='';
    schedule();
  }
  async function action(fn,success){
    try{
      const result=await fn();
      if(result&&typeof result==='object'&&Object.hasOwn(result,'configured'))render(result);
      if(success)message(success);
    }catch(error){
      message(error?.message||'Community operation failed.');
    }
  }
  $('communityConnect').addEventListener('click',async()=>{
    const button=$('communityConnect');
    button.disabled=true;
    await action(()=>bridge.communityConnect($('communityUrl').value),
      'Connected to your service. Sign in with Telegram in the Community page.');
    button.disabled=false;
  });
  $('communityUrl').addEventListener('keydown',e=>{
    if(e.key==='Enter')$('communityConnect').click();
  });
  $('communityGuide').addEventListener('click',()=>action(async()=>{
    if(!await bridge.open('communityGuide'))throw Error('Could not open the setup instructions.');
  }));
  $('communityReload').addEventListener('click',()=>action(async()=>{
    const ok=await bridge.communityReload();
    if(!ok)throw Error('Connect a working Community service first.');
  },'Refreshing the Community page…'));
  $('communityExpand').addEventListener('click',()=>action(async()=>{
    await bridge.size('community');
    lastBounds='';schedule();
  }));
  $('communityForget').addEventListener('click',()=>action(async()=>{
    if(!confirm('Disconnect Community from this PC? Your cloud account, invited friends and alerts will remain active.'))return;
    // Disconnect clears only the community Chromium partition, not the
    // desktop HoYoLAB login, local preferences, or other cloud connections.
    const result=await bridge.communityDisconnect();
    render(result);
    message('Disconnected locally. The cloud service continues independently.');
  }));
  $('communityCopySession').addEventListener('click',()=>action(async()=>{
    const yes=await bridge.communityCopyHoyolab();
    if(!yes)throw Error('Session copy cancelled.');
  },'Sensitive HoYoLAB session copied. Paste it only into a Community service you trust, then clear your clipboard.'));
  $('communityClearClipboard').addEventListener('click',()=>action(
    ()=>bridge.communityClearClipboard(),'Clipboard cleared.'));
  window.addEventListener('istaroth:dashboard-tab',e=>{
    tab=e.detail?.tab||'resin';
    lastBounds='';
    schedule();
  });
  window.addEventListener('istaroth:screen-view',()=>{lastBounds='';schedule();});
  window.addEventListener('resize',()=>{lastBounds='';schedule();});
  document.addEventListener('visibilitychange',()=>{lastBounds='';schedule();});
  if(typeof ResizeObserver!=='undefined'){
    new ResizeObserver(()=>schedule()).observe($('communityViewport'));
  }
  bridge?.onCommunityState?.(state=>{
    if(!connected)return;
    if(state?.state==='ready')status.textContent='Connected · Online';
    else if(state?.state==='loading')status.textContent='Connecting…';
    else if(state?.state==='offline')status.textContent='Cloud offline';
    if(state?.message)message(state.message);
  });
  if(!bridge?.communityStatus){
    status.textContent='Desktop app required';
    $('communityConnect').disabled=true;
    message('Community is available in the Windows Istaroth build.');
    return;
  }
  bridge.communityStatus().then(render).catch(e=>message(e?.message||'Community status unavailable.'));
})();
