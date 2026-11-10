'use strict';
(() => {
 const bridge=window.pulseDesktop;
 const $=id=>document.getElementById(id);
 let current=null;
 function report(text){$('communityState').textContent=String(text);}
 function render(state){
   current=state;
   const ready=!!state?.configured;
   $('communityConnectPanel').classList.toggle('hidden',ready);
   $('communityActions').classList.toggle('hidden',!ready);
   if(ready){
     $('communityUrl').value=state.url||'';
     $('communityAddress').textContent='Connected app: '+state.url;
     report(state.online===true?'Community is online. Open it to sign in with Telegram.':
       state.online===false?'Community is not responding yet · '+(state.reason||'Check deployment.'):
       'Community address saved · Check connection or open the app.');
   }else report('Community is not connected. Deploy your shared Istaroth Community app, then enter its HTTPS address.');
 }
 async function perform(work,onSuccess){
   try{
     const data=await work();
     if(data&&typeof data==='object')render(data);
     if(onSuccess)report(onSuccess);
   }catch(e){report(e?.message||'Unable to complete Community request.');}
 }
 $('communityConnect').addEventListener('click',async()=>{
   const el=$('communityConnect');el.disabled=true;
   await perform(()=>bridge.communityConfigure($('communityUrl').value));
   el.disabled=false;
 });
 $('communityOpen').addEventListener('click',()=>perform(()=>bridge.communityOpen(),
   'Community opened in its own secure window. Sign in there using Telegram.'));
 $('communityRefresh').addEventListener('click',()=>perform(()=>bridge.communityCheck()));
 $('communityChange').addEventListener('click',()=>{
   $('communityConnectPanel').classList.remove('hidden');
   $('communityUrl').focus();
   report('Paste the new Community address and press Connect Community.');
 });
 $('communityHow').addEventListener('click',()=>{
   report('Deploy the separate Istaroth Community app package to Cloudflare first. This screen connects to its published HTTPS URL; a personal resin Worker URL will not work.');
 });
 if(!bridge?.communityStatus){
   report('Community requires the Windows desktop build.');
   $('communityConnect').disabled=true;
   return;
 }
 perform(()=>bridge.communityStatus());
 document.querySelector('[data-dash="community"]')?.addEventListener('click',()=>{
   if(current?.configured)perform(()=>bridge.communityCheck());
 });
})();
