'use strict';
// Only this page consumes public friend metadata; token never comes back from IPC.
(() => {
  const bridge=window.pulseDesktop;
  const $=id=>document.getElementById(id);
  let status=null;
  function message(text) {$('friendHelp').textContent=String(text);}
  function button(text,kind,callback) {
    const b=document.createElement('button');
    b.type='button';b.className=kind;b.textContent=text;
    b.addEventListener('click',callback);return b;
  }
  async function action(fn,success) {
    try {
      const next=await fn();
      if(next && typeof next==='object' && 'connected' in next)paint(next);
      if(success)message(success);
    } catch(e) {
      message('Telegram: '+(e?.message||'Operation failed.'));
    }
  }
  function paint(info) {
    if(!info)return;status=info;
    $('friendConnectPanel').classList.toggle('hidden',info.connected);
    $('friendInvitePanel').classList.toggle('hidden',!info.connected);
    $('friendBotStatus').textContent=info.connected?
      'Connected · @'+info.username+' · '+info.recipients.length+' friend(s) joined':
      'Not connected · Create a Telegram bot to enable friend alerts';
    if(info.connected) {
      $('friendInvite').value=info.inviteUrl||'';
      const root=$('friendPeople');root.replaceChildren();
      if(!info.recipients.length){
        const empty=document.createElement('p');
        empty.className='field-note';empty.textContent='No friends joined yet. Share the invitation link, then select Refresh friends.';
        root.append(empty);
      }
      for(const r of info.recipients){
        const wrap=document.createElement('div');wrap.className='friend-person';
        const details=document.createElement('div');details.className='friend-person-details';
        const name=document.createElement('strong');name.textContent=r.name;
        const sub=document.createElement('small');sub.textContent=r.enabled?'Alerts enabled':'Paused until you enable alerts';
        details.append(name,sub);
        const select=document.createElement('select');select.setAttribute('aria-label','Notify '+r.name+' at resin amount');
        for(const threshold of [160,180,190,200]){
          const opt=document.createElement('option');opt.value=String(threshold);
          opt.textContent=threshold===200?'200 · Full':threshold+' resin';
          select.append(opt);
        }
        select.value=String(r.threshold);
        select.addEventListener('change',()=>action(()=>bridge.friendsRecipient(r.id,{threshold:Number(select.value)}),'Threshold saved for '+r.name+'.'));
        const controls=document.createElement('div');controls.className='friend-person-actions';
        controls.append(button(r.enabled?'Pause':'Enable','solid-small',()=>action(
          ()=>bridge.friendsRecipient(r.id,{enabled:!r.enabled}),r.enabled?'Friend paused.':'Friend alerts enabled.')));
        controls.append(button('Test','small-quiet',()=>action(()=>bridge.friendsTest(r.id),'Test alert sent to '+r.name+'.')));
        controls.append(button('Remove','small-quiet',()=>action(()=>bridge.friendsRemove(r.id),'Friend removed.')));
        wrap.append(details,select,controls);root.append(wrap);
      }
    }
    if(info.error)message(info.error);
  }
  async function initialize(){
    if(!bridge?.friendsStatus){
      $('friendBotStatus').textContent='Telegram notifications require the Windows app.';
      $('friendConnect').disabled=true;return;
    }
    bridge.onFriendsStatus?.(paint);
    await action(()=>bridge.friendsStatus());
  }
  $('friendConnect').addEventListener('click',async()=>{
    const token=$('friendBotToken').value.trim();
    const btn=$('friendConnect');btn.disabled=true;
    await action(()=>bridge.friendsConnect(token),'Bot connected. Share the private invitation link with your friends.');
    $('friendBotToken').value='';
    btn.disabled=false;
  });
  $('friendRefresh').addEventListener('click',()=>action(()=>bridge.friendsPoll(),'Friend list refreshed.'));
  $('friendRotateInvite').addEventListener('click',()=>action(()=>bridge.friendsRotate(),'New invitation link generated. Previous invite links no longer work.'));
  $('friendCopyInvite').addEventListener('click',()=>action(async()=>{
    if(!await bridge.friendsCopyInvite())throw Error('No invitation link to copy.');
  },'Invitation link copied.'));
  $('friendDisconnect').addEventListener('click',()=>action(()=>bridge.friendsDisconnect(),'Bot disconnected. Friend subscriptions removed.'));
  initialize().catch(e=>message('Could not load friend notifications: '+e.message));
})();
