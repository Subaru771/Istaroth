'use strict';
(() => {
  const bridge=window.pulseDesktop;
  const $=id=>document.getElementById(id);
  let active=null;
  const say=text=>{$('cloudHelp').textContent=String(text);};
  const action=async(fn,message)=>{
    try{
      const result=await fn();
      if(result && typeof result==='object' && 'configured' in result)render(result);
      if(message)say(message);
    }catch(e){say('Cloud: '+(e?.message||'Request failed.'));}
  };
  function button(label,kind,callback){
    const el=document.createElement('button');el.type='button';el.className=kind;el.textContent=label;
    el.addEventListener('click',callback);return el;
  }
  function people(list){
    const root=$('cloudPeople');root.replaceChildren();
    if(!list?.length){
      const p=document.createElement('p');p.className='field-note';
      p.textContent='No subscribers yet. Activate Telegram, copy the cloud invite and ask friends to tap Start.';
      root.append(p);return;
    }
    for(const person of list){
      const wrap=document.createElement('div');wrap.className='friend-person';
      const details=document.createElement('div');details.className='friend-person-details';
      const name=document.createElement('strong');name.textContent=person.name;
      const status=document.createElement('small');
      status.textContent=person.enabled?'Alerts enabled':'Paused — not yet approved';
      details.append(name,status);
      const select=document.createElement('select');
      select.setAttribute('aria-label','Resin threshold for '+person.name);
      for(const threshold of [160,180,190,200]){
        const opt=document.createElement('option');opt.value=String(threshold);
        opt.textContent=threshold===200?'200 · Full':threshold+' resin';
        select.append(opt);
      }
      select.value=String(person.threshold);
      select.addEventListener('change',()=>action(
        ()=>bridge.cloudAction('recipient',{id:person.id,enabled:person.enabled,threshold:Number(select.value)}),
        'Cloud recipient threshold updated.'));
      const controls=document.createElement('div');controls.className='friend-person-actions';
      controls.append(
        button(person.enabled?'Pause':'Enable','solid-small',()=>action(
          ()=>bridge.cloudAction('recipient',{id:person.id,enabled:!person.enabled,threshold:person.threshold}),
          'Cloud recipient preference saved.')),
        button('Test','small-quiet',()=>action(()=>bridge.cloudAction('test',{id:person.id}),'Test alert sent.')),
        button('Remove','small-quiet',()=>action(()=>bridge.cloudAction('remove',{id:person.id}),'Recipient removed.'))
      );
      wrap.append(details,select,controls);root.append(wrap);
    }
  }
  function render(data){
    active=data;
    const configured=!!data.configured,root=$('friendsSetup');
    root.classList.toggle('cloud-connected',configured);
    $('cloudConnectPanel').classList.toggle('hidden',configured);
    $('cloudControlPanel').classList.toggle('hidden',!configured);
    $('cloudStatus').textContent=!configured?'Cloud mode is off · Local Telegram alerts are available':
      data.error?'Cloud connection issue · '+data.error:
      data.remote?.paused?'Cloud mode connected · Alerts paused':
      'Cloud mode connected · Windows may be switched off';
    if(!configured)return;
    const remote=data.remote;
    $('cloudWorkerUrl').value=data.url||'';
    $('cloudPause').textContent=remote?.paused?'Resume cloud alerts':'Pause cloud alerts';
    $('cloudInvite').value=remote?.inviteUrl||'';
    if(!remote){
      $('cloudDetail').textContent='Your Worker could not be contacted. Verify deployment and owner key.';
      people([]);return;
    }
    const when=remote.updatedAt?new Date(remote.updatedAt).toLocaleString():'Never';
    const resin=remote.notes?remote.notes.amount+'/'+remote.notes.cap:'Unavailable';
    $('cloudDetail').textContent=
      'Genshin · '+(remote.role?.nickname||'Traveler')+' · UID '+(remote.role?.uid||'—')+
      ' · Resin '+resin+' · Last cloud sync '+when+
      (remote.error?' · '+remote.error:'')+
      (!remote.autoSync?' · HoYoLAB auto-sync secret missing':'');
    people(remote.recipients);
  }
  async function refresh(){if(bridge?.cloudStatus)await action(()=>bridge.cloudStatus());}
  $('cloudConnect').addEventListener('click',async()=>{
    const button=$('cloudConnect');button.disabled=true;
    await action(()=>bridge.cloudConfigure($('cloudWorkerUrl').value,$('cloudOwnerKey').value),
      'Cloud connected. Activate the Telegram webhook and run Test HoYoLAB sync.');
    $('cloudOwnerKey').value='';
    button.disabled=false;
  });
  $('cloudBootstrap').addEventListener('click',()=>action(
    ()=>bridge.cloudAction('bootstrap'),'Telegram cloud webhook activated. Send the invite to your friends.'));
  $('cloudRefresh').addEventListener('click',refresh);
  $('cloudSync').addEventListener('click',()=>action(
    ()=>bridge.cloudAction('sync'),'Cloud sync was requested. Check the updated resin reading and any error.'));
  $('cloudPause').addEventListener('click',()=>action(
    ()=>bridge.cloudAction(active?.remote?.paused?'resume':'pause'),
    active?.remote?.paused?'Cloud alerts resumed.':'Cloud alerts paused.'));
  $('cloudDisconnect').addEventListener('click',()=>action(
    ()=>bridge.cloudDisconnect(),'This PC is disconnected. The Worker still runs independently until paused or removed.'));
  $('cloudCopyInvite').addEventListener('click',()=>action(async()=>{
    if(!await bridge.cloudCopyInvite())throw Error('Activate your Telegram bot first to create an invite.');
  },'Cloud invitation link copied.'));
  if(!bridge?.cloudStatus){
    $('cloudStatus').textContent='Cloud setup is available in the Windows version.';
    $('cloudConnect').disabled=true;
    return;
  }
  refresh();
  setInterval(()=>{
    if(!$('settingsScreen')?.classList.contains('hidden')&&active?.configured)refresh();
  },60000);
})();
