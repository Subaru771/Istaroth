'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const desktopNonce=/^[A-Za-z0-9_-]{24}$/.test(new URL(location.href).searchParams.get('desktop_connect')||'')?new URL(location.href).searchParams.get('desktop_connect'):null;
 const state={data:null,delivery:null,ticket:null,expiresAt:0,busy:false,installEvent:null,pairCode:null,pairExpiresAt:0,pairTimer:null,pairMode:null,siteCookie:null,siteRoles:[],toastTimer:null};
 function notify(message,error=false){
   const el=$('toast');el.textContent=message;el.style.background=error?'#fac8c8':'#e4ca9e';
   el.classList.remove('hidden');clearTimeout(state.toastTimer);
   state.toastTimer=setTimeout(()=>el.classList.add('hidden'),4500);
 }
 function message(text,bad=false){const el=state.data?$('app-status'):$('auth-error');el.textContent=text||'';el.style.color=bad?'#f4aaaa':'#e4ca9e';}
 async function api(path,body){
   const options={method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}};
   if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
   let response;
   try{response=await fetch(path,options);}catch{throw Error('Cannot connect to Community right now.');}
   let data;try{data=await response.json();}catch{throw Error('Invalid server response.');}
   if(!response.ok)throw Error(data?.error||'Server returned '+response.status);
   return data;
 }
 async function task(fn,success){
   if(state.busy)return;state.busy=true;
   try{await fn();message('');if(success)notify(success);}catch(e){message(e?.message||'Something went wrong.',true);notify(e?.message||'Something went wrong.',true);}
   finally{state.busy=false;}
 }
 function showApp(loggedIn){$('auth-screen').classList.toggle('hidden',loggedIn);$('app-shell').classList.toggle('hidden',!loggedIn);}
 function tab(name){
   for(const id of ['overview','friends','settings'])$(id).classList.toggle('hidden',id!==name);
   for(const b of document.querySelectorAll('[data-tab]')){const active=b.dataset.tab===name;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 }
 function element(type,cls,content){const el=document.createElement(type);if(cls)el.className=cls;if(content!==undefined)el.textContent=content;return el;}
 function tinyButton(label,callback){const btn=element('button','button subtle',label);btn.type='button';btn.addEventListener('click',()=>task(callback));return btn;}
 function followers(list){
   $('follower-count').textContent=String(list.length)+' people';const host=$('followers');host.replaceChildren();
   if(!list.length){host.append(element('p','empty','Nobody yet. Share your invite link to get started.'));return;}
   const cap=Number(state.data?.account?.resin?.cap||200);
   for(const f of list){
     const card=element('div','friend friend-editor');
     const header=element('div','friend-header'),text=element('div');
     text.append(element('strong','',f.name||'Traveler'),element('small','',f.enabled?'Receiving alerts':'Alerts paused'));
     const approval=state.delivery?.deliveries?.find(d=>d.recipient_id===String(f.id)&&d.kind==='friend_approved');
     if(approval){
       const label=approval.status==='sent'?'Approval message delivered':approval.status==='retrying'||approval.status==='blocked'?'Approval message waiting for Telegram':approval.status==='expired'?'Approval message expired':approval.status==='queued'?'Approval message queued':'';
       if(label)text.append(element('span','friend-delivery',label));
     }
     const actions=element('div','friend-actions');
     const enabled=element('input','toggle');enabled.type='checkbox';enabled.checked=!!f.enabled;
     enabled.setAttribute('aria-label','Enable resin alerts for '+(f.name||'friend'));
     actions.append(enabled);header.append(text,actions);
     const rule=f.reminderRule||{mode:'single',thresholds:[f.threshold||180],step:0};
     const editor=element('div','friend-rule');
     const modeLabel=element('label','','Notify this friend');const mode=element('select');
     for(const [value,label] of [['single','At a chosen amount'],['multiple','At several amounts'],['every','Every N resin']]){
       const option=element('option','',label);option.value=value;mode.append(option);
     }
     mode.value=rule.mode;modeLabel.append(mode);
     const amount=element('input');amount.type='number';amount.min='1';amount.max=String(cap);amount.step='1';amount.inputMode='numeric';amount.value=String(rule.thresholds[0]||Math.min(180,cap));
     amount.setAttribute('aria-label','Resin amount for '+f.name);
     const amounts=element('input');amounts.type='text';amounts.inputMode='text';amounts.maxLength=240;
     amounts.placeholder='40, 80, 120, 160, 200';amounts.value=(rule.mode==='multiple'?rule.thresholds:[40,80,120,160,200].filter(n=>n<=cap)).join(', ');
     amounts.setAttribute('aria-label','Resin amounts for '+f.name);
     const step=element('select');step.setAttribute('aria-label','Resin interval for '+f.name);
     for(const n of [1,2,5,10,20,25,40,50,100]){const option=element('option','',n===1?'Every 1 resin':'Every '+n+' resin');option.value=String(n);step.append(option);}
     step.value=String(rule.step||10);
     const hint=element('p','reminder-hint','Only future resin increases trigger reminders. Click Save to apply changes.');
     const updateFields=()=>{amount.classList.toggle('hidden',mode.value!=='single');amounts.classList.toggle('hidden',mode.value!=='multiple');step.classList.toggle('hidden',mode.value!=='every');
       hint.textContent=mode.value==='every'&&step.value==='1'?'Every 1 resin can send frequent Telegram messages.':'Only future resin increases trigger reminders. Click Save to apply.';};
     mode.addEventListener('change',updateFields);step.addEventListener('change',updateFields);updateFields();
     const preferences=()=>{
       if(mode.value==='single'){
         const raw=amount.value.trim();if(!/^\d+$/.test(raw)||+raw<1||+raw>cap)throw Error('Choose a resin amount from 1 to '+cap+'.');
         return {mode:'single',threshold:Number(raw)};
       }
       if(mode.value==='multiple'){
         const parts=amounts.value.split(',').map(s=>s.trim());
         if(parts.length<1||parts.length>40||parts.some(s=>!/^\d+$/.test(s)||+s<1||+s>cap))throw Error('Enter 1 to 40 resin amounts between 1 and '+cap+', separated by commas.');
         return {mode:'multiple',thresholds:parts.map(Number)};
       }
       return {mode:'every',step:Number(step.value)};
     };
     const save=async()=>{
       const config=preferences();
       if(config.mode==='every'&&config.step===1&&!confirm('Every 1 resin can send many notifications to this friend. Continue?'))return;
       const result=await api('/api/friends/update',{id:f.id,enabled:enabled.checked,...config});await refresh();
       if(result.approvalNotification==='retrying')notify('Friend approved. Telegram could not be reached; the message is queued for retry.',true);
       else if(result.approvalNotification==='sent')notify('Friend approved and notified in Telegram.');
       else notify('Friend reminder saved.');
     };
     const buttons=element('div','friend-buttons');
     const saveButton=tinyButton('Save reminder',save);
     const remove=tinyButton('Remove',async()=>{if(!confirm('Remove this friend?'))return;await api('/api/friends/remove',{id:f.id});await refresh();});
     if(f.enabled){
       const resend=tinyButton('Resend approval',async()=>{
         const result=await api('/api/friends/notify',{id:f.id});await refresh();
         if(result.approvalNotification==='retrying')notify('Telegram is unreachable. The approval message is queued for retry.',true);
         else notify(result.alreadySent?'Approval already sent recently.':'Approval message delivered to your friend.');
       });
       buttons.append(resend);
     }
     buttons.append(saveButton,remove);editor.append(modeLabel,amount,amounts,step,hint,buttons);card.append(header,editor);host.append(card);
   }
 }
 function following(list){
   const host=$('following');host.replaceChildren();if(!list.length){host.append(element('p','empty','No friends followed yet.'));return;}
   for(const f of list){const card=element('div','friend'),text=element('div');text.append(element('strong','',f.name||'Traveler'),element('small','',f.enabled?'Alerts enabled':'Waiting for approval'));card.append(text);host.append(card);}
 }
 function lastSynced(time){if(!time)return 'Not synced';const diff=Math.max(0,Date.now()-time);return diff<60000?'Just synced':diff<3600000?Math.floor(diff/60000)+'m ago':new Date(time).toLocaleString();}
 function reminderFields(){
   const mode=$('self-mode').value;
   for(const m of ['single','multiple','every'])$('self-'+m).classList.toggle('hidden',m!==mode);
   $('reminder-explanation').textContent=mode==='every'&&$('self-step').value==='1'
     ?'Every 1 resin can send around 180+ messages per day. Only enable if you really want frequent alerts.'
     :'Only future increases trigger alerts. If several amounts are passed during an outage, one catch-up alert is sent.';
 }
 function reminderInput(){
   const mode=$('self-mode').value,cap=Number(state.data?.account?.resin?.cap||200);
   if(mode==='single'){
     const text=$('self-threshold').value.trim(),value=Number(text);
     if(!/^\d+$/.test(text)||!Number.isInteger(value)||value<1||value>cap)throw Error('Enter a whole resin amount between 1 and '+cap+'.');
     return {mode,threshold:value};
   }
   if(mode==='multiple'){
     const parts=$('self-thresholds').value.split(',').map(v=>v.trim());
     if(!parts.length||parts.length>40||parts.some(v=>!/^\d+$/.test(v)||+v<1||+v>cap))throw Error('Enter up to 40 amounts from 1 to '+cap+', separated by commas.');
     return {mode,thresholds:parts.map(Number)};
   }
   return {mode,step:Number($('self-step').value)};
 }
 function redraw(data){
   const first=!state.data;state.data=data;showApp(true);
   const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
   const quiet=data.quietHours||{};
   const selected=quiet.timezone||zone;
   const tz=$('quiet-timezone');
   if(![...tz.options].some(o=>o.value===selected)){const opt=document.createElement('option');opt.value=selected;opt.textContent=selected;tz.append(opt);}
   if(![...tz.options].some(o=>o.value===zone)){const opt=document.createElement('option');opt.value=zone;opt.textContent=zone;tz.append(opt);}
   tz.value=selected;$('quiet-enabled').checked=!!quiet.enabled;
   $('quiet-start').value=quiet.start||'23:00';$('quiet-end').value=quiet.end||'08:00';
   $('greeting').textContent=(data.user?.name||'Traveler').split(' ')[0];$('invite-link').value=data.inviteLink||'';
   const account=data.account,ready=!!account;
   if(ready){state.siteCookie=null;state.siteRoles=[];$('web-cookie').value='';$('web-roles').classList.add('hidden');}
   $('connect-panel').classList.toggle('hidden',ready);$('connected-card').classList.toggle('hidden',!ready);
   $('sync-notes').disabled=!ready;$('save-alert').disabled=!ready;$('self-enabled').disabled=!ready;$('self-threshold').disabled=!ready;$('self-thresholds').disabled=!ready;$('self-mode').disabled=!ready;$('self-step').disabled=!ready;$('test-alert').disabled=!ready;
   $('self-enabled').checked=!!account?.selfEnabled;
   const rule=account?.reminderRule||{mode:'single',thresholds:[account?.selfThreshold||180],step:10};
   $('self-mode').value=rule.mode;$('self-threshold').value=String(rule.thresholds[0]||180);
   $('self-thresholds').value=(rule.mode==='multiple'?rule.thresholds:[40,80,120,160,200]).join(', ');
   $('self-step').value=String(rule.step||10);reminderFields();
   const resin=account?.resin;const current=resin?.resin??null,cap=resin?.cap||200;
   $('self-threshold').max=String(cap);
   $('resin-number').textContent=current===null?'—':String(current);$('resin-denominator').textContent='/ '+cap;
   $('resin-ring').style.setProperty('--pct',(current!==null?Math.min(100,Math.round(current/cap*100)):0)+'%');
   $('resin-heading').textContent=current===null?'Time is on your side.':current>=cap?'Resin is full!':'Keep the journey going.';
   $('resin-caption').textContent=current===null?(ready?'Waiting for resin data.':'Connect HoYoLAB on this website for live resin tracking.'):
     (account?.trackingMode==='estimate'?'Estimated · ':'')+(current>=cap?'Ready to spend.':(cap-current)+' resin until full.')+(account?.trackingMode==='estimate'?' Update after using resin.':'');
   $('resin-sync').textContent=ready?(account.trackingMode==='estimate'?'Estimated':'HoYoLAB · '+lastSynced(account.lastSyncAt)):'Not connected';
   $('estimate-editor').classList.toggle('hidden',account?.trackingMode!=='estimate');
   $('sync-notes').classList.toggle('hidden',account?.trackingMode==='estimate');
   $('credential-status').textContent=account?.trackingMode==='estimate'?'No HoYoLAB credentials stored':'Encrypted in the cloud';
   if(account?.trackingMode==='estimate')$('estimate-current').value=String(current??0);
   $('cloud-state').textContent=!ready?'Not connected':account.lastError?'● Needs attention':account.trackingMode==='estimate'?'● Estimate active':'● Synced to cloud';
   $('account-heading').textContent=account?.trackingMode==='estimate'?'Phone-only estimate':account?.nickname||'Traveler';
   $('account-detail').textContent=ready?(account.trackingMode==='estimate'?'No verified UID · update resin after spending':'UID '+account.uid+' · '+account.region.replace('os_','').toUpperCase()):'';
   $('subtitle').textContent=account?.lastError?account.lastError:account?.trackingMode==='estimate'?'Cloud forecast enabled. Use /resin in Telegram after spending.':ready?'Cloud monitoring is on. You can close Windows.':'Connect once. Your clock keeps going.';
   followers(data.followers||[]);following(data.following||[]);
   if(ready&&state.pairCode){clearInterval(state.pairTimer);state.pairCode=null;$('pair-area').classList.add('hidden');notify('HoYoLAB connected successfully.');}
   if(first)tab('overview');
 }
 function showDelivery(health){
   const el=$('delivery-state');if(!el)return;
   if(!health){el.dataset.status='error';el.textContent='Telegram delivery status unavailable. Reload to try again.';return;}
   const recent=(health.deliveries||[]).find(d=>d.kind==='test')||null;
   const issue=(health.deliveries||[]).find(d=>(d.status==='retrying'||d.status==='blocked'||d.status==='expired')&&d.last_error!=='Muted by recipient quiet hours.');
   let summary;
   if(issue){
     const note=issue.last_error||'The Telegram delivery request did not succeed.';
     summary='Telegram not delivering: '+note+(health.relayConfigured?' Check your private relay.':' Cloudflare may need the private Telegram relay.');
     el.dataset.status='error';
   }else if(recent?.status==='sent'){
     summary='Telegram test delivered successfully.';el.dataset.status='ok';
   }else{
     summary='Telegram delivery not yet verified. Press Send a test notification.';el.dataset.status='unknown';
   }
   if(!issue&&(health.deliveries||[]).some(d=>d.last_error==='Muted by recipient quiet hours.'))summary+=' A previous resin alert was muted by quiet hours.';
   if(health.resinPending||health.approvalPending)summary+=' Queued: '+health.resinPending+' resin, '+health.approvalPending+' approval.';
   if(health.syncError)summary+=' HoYoLAB sync error: '+health.syncError;
   el.textContent=summary;
 }
 async function refresh(){
   try{
     const [data,delivery]=await Promise.all([api('/api/me'),api('/api/notifications/status').catch(()=>null)]);
     state.delivery=delivery;redraw(data);showDelivery(delivery);
   }catch(e){if(e.message.includes('Please sign in')){state.data=null;state.delivery=null;showApp(false);}else message(e.message,true);}
 }
 async function startLogin(){
   const response=await api('/api/auth/start',{});state.ticket=response.ticket;state.expiresAt=response.expiresAt;
   $('auth-begin').classList.add('hidden');$('auth-code').classList.remove('hidden');$('telegram-login').href=response.botLink;$('login-code').value='';
 }
 async function finishLogin(){
   if(!state.ticket||Date.now()>state.expiresAt)throw Error('Login expired. Start again.');
   const code=$('login-code').value.trim();if(!/^\d{6}$/.test(code))throw Error('Enter the six-digit Telegram code.');
   await api('/api/auth/complete',{ticket:state.ticket,code});state.ticket=null;await refresh();notify('Welcome to Istaroth.');
 }
 function stopPairing(){clearInterval(state.pairTimer);state.pairTimer=null;state.pairCode=null;$('pair-area').classList.add('hidden');$('launch-istaroth').classList.add('hidden');}
 async function createPairing(mode='windows'){
   state.pairMode=mode;
   const result=await api('/api/link/start',{});stopPairing();state.pairCode=result.code;state.pairExpiresAt=result.expiresAt;
   $('pair-code').textContent=result.code;$('pair-area').classList.remove('hidden');$('pair-status').textContent='Waiting for Windows Istaroth…';
   $('pair-instructions').textContent='If Istaroth does not open, paste the code into Windows Istaroth → Community → Pair using code. Expires in 5 minutes.';
   if(mode==='windows'&&desktopNonce){
     const link=$('launch-istaroth');link.href='istaroth://community/connect?code='+encodeURIComponent(result.code)+'&nonce='+encodeURIComponent(desktopNonce)+'&origin='+encodeURIComponent(location.origin);
     link.classList.remove('hidden');$('pair-status').textContent='Click Open Istaroth below to approve the transfer.';
   }
   state.pairTimer=setInterval(async()=>{
     if(!state.pairCode)return;
     if(Date.now()>state.pairExpiresAt){stopPairing();notify('Pairing code expired. Get a new one.',true);return;}
     if(document.visibilityState==='hidden')return;
     try{const status=await api('/api/link/status');if(status.linked){stopPairing();await refresh();}}catch{}
   },4500);
 }
 $('begin-login').addEventListener('click',()=>task(startLogin));$('finish-login').addEventListener('click',()=>task(finishLogin));
 $('login-code').addEventListener('keyup',e=>{if(e.key==='Enter')task(finishLogin);});
 $('reset-login').addEventListener('click',()=>{state.ticket=null;$('auth-begin').classList.remove('hidden');$('auth-code').classList.add('hidden');message('');});
 for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>tab(button.dataset.tab));
 $('refresh-all').addEventListener('click',()=>task(refresh,'Up to date.'));$('logout').addEventListener('click',()=>task(async()=>{await api('/api/auth/logout',{});stopPairing();resetWebPair();state.data=null;showApp(false);}));
 $('gateway-start').addEventListener('click',()=>task(async()=>{
   const response=await api('/api/link/start',{});
   const link=$('gateway-link');
   // Fragment isn't transmitted in the initial HTTP request or Referer.
   link.href='https://istaroth-hoyolab-gateway.onrender.com/#code='+encodeURIComponent(response.code);
   $('gateway-ready').classList.remove('hidden');
   notify('Your 5-minute connection is ready. Open the gateway tab.');
 }));
 $('save-quiet').addEventListener('click',()=>task(async()=>{
   const data={enabled:$('quiet-enabled').checked,start:$('quiet-start').value,end:$('quiet-end').value,timezone:$('quiet-timezone').value};
   await api('/api/notifications/quiet-hours',data);await refresh();
 },'Quiet hours saved.'));
 $('begin-github-pair').addEventListener('click',()=>task(async()=>{
   // Uses the same one-time code as Windows pairing, never the session cookie.
   const result=await api('/api/link/start',{});
   $('github-pair-code').textContent=result.code;
   $('github-pair-area').classList.remove('hidden');
 },'Helper code ready. Open your browser helper and enter it.'));
 $('github-copy-code').addEventListener('click',()=>task(async()=>{
   const code=$('github-pair-code').textContent;
   if(!/^[A-Za-z0-9_-]{24}$/.test(code))throw Error('Generate a helper code first.');
   await navigator.clipboard.writeText(code);
 },'One-time helper code copied.'));
 $('begin-pair').addEventListener('click',()=>task(()=>createPairing('windows')));$('cancel-pair').addEventListener('click',()=>task(()=>createPairing('windows')));
 function resetWebPair(){
   state.siteCookie=null;state.siteRoles=[];
   $('web-cookie').value='';$('web-role-select').replaceChildren();
   $('web-consent').checked=false;$('web-roles').classList.add('hidden');
 }
 $('web-cookie').addEventListener('input',()=>{
   state.siteCookie=null;state.siteRoles=[];$('web-roles').classList.add('hidden');
   $('web-consent').checked=false;
 });
 $('web-reset').addEventListener('click',resetWebPair);
 $('web-preview').addEventListener('click',()=>task(async()=>{
   const cookie=$('web-cookie').value.trim();
   if(cookie.length<15||cookie.length>5000||/[\r\n\x00]/.test(cookie))throw Error('Paste valid HoYoLAB session cookies on one line.');
   const result=await api('/api/account/preview',{cookie});
   if(!Array.isArray(result.accounts)||!result.accounts.length)throw Error('No Genshin account found for this HoYoLAB login.');
   state.siteCookie=cookie;state.siteRoles=result.accounts;
   // Clear the visible field immediately; credentials remain in volatile memory only until approval.
   $('web-cookie').value='';
   const select=$('web-role-select');select.replaceChildren();
   result.accounts.forEach((account,index)=>{
     const option=document.createElement('option');option.value=String(index);
     option.textContent=(account.name||'Traveler')+' · UID '+account.uid+' · '+account.region.replace('os_','').toUpperCase();
     select.append(option);
   });
   $('web-consent').checked=false;$('web-roles').classList.remove('hidden');
 },'Genshin account found. Choose your character and approve the connection.'));
 $('web-connect').addEventListener('click',()=>task(async()=>{
   if(!state.siteCookie||!state.siteRoles.length)throw Error('Start by finding your Genshin account.');
   if(!$('web-consent').checked)throw Error('Approve encrypted session storage to connect.');
   const role=state.siteRoles[Number($('web-role-select').value)];
   if(!role)throw Error('Select a Genshin account.');
   const cookie=state.siteCookie;
   try{
     await api('/api/account/connect',{cookie,uid:role.uid,region:role.region});
     resetWebPair();await refresh();
   }finally{state.siteCookie=null;}
 },'Your Genshin account is connected to Istaroth Community.'));
 // Cross-tab bookmarklet bridge. Not a cookie bypass: HttpOnly cookies are
 // unavailable to bookmarklets. Verify the exact HoYoLAB origin and never
 // auto-save: the user must select a role and tick the existing consent box.
 const allowedHoyoOrigins=new Set(['https://www.hoyolab.com','https://hoyolab.com']);
 window.addEventListener('message',event=>{
   if(!state.data||!allowedHoyoOrigins.has(event.origin))return;
   if(event.data?.type!=='istaroth-hoyo-bridge-v1')return;
   const cookie=event.data.cookie;
   if(typeof cookie!=='string'||cookie.length>5000||cookie.length<15||/[\r\n\x00]/.test(cookie))return;
   if(!/(?:^|;\s*)(?:ltoken_v2|ltoken|cookie_token_v2|cookie_token)=/.test(cookie))return;
   if(state.data.account)return;
   $('web-cookie').value=cookie;
   tab('overview');
   $('connect-panel').scrollIntoView({behavior:'smooth',block:'center'});
   $('web-preview').click();
   if(event.source)event.source.postMessage({type:'istaroth-hoyo-ack-v1'},event.origin);
 });
 window.addEventListener('pagehide',()=>{state.siteCookie=null;});
 async function saveEstimate(input){
   const raw=input.value.trim();if(!/^(?:[0-9]|[1-9][0-9]|1[0-9][0-9]|200)$/.test(raw))throw Error('Enter your actual resin from 0 to 200.');
   await api('/api/account/estimate',{resin:Number(raw)});await refresh();
 }

 $('save-estimate').addEventListener('click',()=>task(()=>saveEstimate($('estimate-current')),'Resin estimate updated.'));
 $('copy-pair').addEventListener('click',()=>task(async()=>{await navigator.clipboard.writeText(state.pairCode);},'Pairing code copied.'));
 $('self-mode').addEventListener('change',reminderFields);
 $('self-step').addEventListener('change',reminderFields);
 $('save-alert').addEventListener('click',()=>task(async()=>{
   const rule=reminderInput();
   if(rule.mode==='every'&&rule.step===1&&!confirm('This can send roughly 180 or more Telegram alerts per day, potentially hitting rate limits. Enable every 1 resin?'))return;
   await api('/api/account/preferences',{enabled:$('self-enabled').checked,...rule});await refresh();
 },'Reminder saved. Future resin increases will trigger your alerts.'));
 $('test-alert').addEventListener('click',()=>task(async()=>{let failure=null;try{await api('/api/notifications/test',{});}catch(e){failure=e;}await refresh();if(failure)throw failure;},'Telegram confirms test notification sent.'));
 $('sync-notes').addEventListener('click',()=>task(async()=>{await api('/api/account/sync',{});await refresh();},'Resin updated.'));
 $('copy-invite').addEventListener('click',()=>task(async()=>{await navigator.clipboard.writeText($('invite-link').value);},'Invitation copied.'));
 $('rotate-invite').addEventListener('click',()=>task(async()=>{if(!confirm('Old invitation links will stop working. Continue?'))return;await api('/api/invite/rotate',{});await refresh();},'Invitation link refreshed.'));
 $('remove-hoyolab').addEventListener('click',()=>task(async()=>{if(!confirm('Disconnect resin tracking? Cloud alerts will stop.'))return;await api('/api/account/remove',{});await refresh();},'HoYoLAB disconnected.'));
 $('delete-account').addEventListener('click',()=>task(async()=>{if(prompt('Type DELETE to erase your Istaroth Community data.')!=='DELETE')return;await api('/api/account/delete-all',{confirm:'DELETE'});state.data=null;showApp(false);},'Community data deleted.'));
 if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
 // If the desktop app paired in the background, update without forcing manual refresh.
 setInterval(()=>{if(state.data&&!state.data.account&&document.visibilityState==='visible'&&!state.busy)refresh();},18000);
 refresh();
})();
