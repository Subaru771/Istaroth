'use strict';
const $=id=>document.getElementById(id), LOGIN=$('login');let JOB='',timer=null,shownReady=false;
async function api(path,method='GET',body){const opts={method,credentials:'same-origin',headers:{}};if(body!==undefined){opts.headers['content-type']='application/json';opts.headers['x-istaroth-csrf']=document.querySelector('meta[name="istaroth-csrf"]')?.content||'';opts.body=JSON.stringify(body)}const r=await fetch(path,opts);let d;try{d=await r.json()}catch{d={detail:'Server response was not JSON.'}}if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:(d.error||`HTTP ${r.status}`));return d;}
function message(text){$('message').textContent=text;}
async function update(){if(!JOB)return;try{const s=await api('/api/status/'+encodeURIComponent(JOB));$('state').textContent=s.status==='ready'?'Choose your Genshin account':s.status==='failed'?'Connection failed':s.status==='linked'?'Connected':s.status==='captcha'?'Verification required':'Connecting…';message(s.message);$('captcha').hidden=s.status!=='captcha';$('captcha').href='/api/captcha/'+encodeURIComponent(JOB);if(s.status==='ready'&&!shownReady){shownReady=true;const host=$('accounts');host.replaceChildren();for(const account of s.accounts){const card=document.createElement('div');card.className='acc';const title=document.createElement('strong');title.textContent=account.nickname||'Traveler';const sub=document.createElement('small');sub.textContent=`${account.uid} · ${account.region}`;const button=document.createElement('button');button.textContent='Approve and connect';button.onclick=async()=>{try{button.disabled=true;await api('/api/approve/'+encodeURIComponent(JOB),'POST',{uid:account.uid,region:account.region});clearInterval(timer);$('work').hidden=true;$('success').hidden=false;}catch(e){message(e.message);button.disabled=false}};card.append(title,sub,button);host.append(card)}}if(s.status==='linked'){clearInterval(timer);$('work').hidden=true;$('success').hidden=false;}if(s.status==='failed'||s.status==='expired')clearInterval(timer);}catch(e){message(e.message);clearInterval(timer)}}
let CLAIM_TOKEN='';
const pairFromUrl=new URLSearchParams(location.hash.slice(1)).get('code')||'';
if(/^[A-Za-z0-9_-]{24}$/.test(pairFromUrl)){
  LOGIN.elements.namedItem('code').value=pairFromUrl;
  history.replaceState(null,'',location.pathname+location.search);
}
$('verify-code').onclick=async()=>{
  const field=LOGIN.elements.namedItem('code'),code=String(field.value||'').trim();
  const button=$('verify-code');button.disabled=true;
  try{
    const result=await api('/api/pairing/claim','POST',{code});
    CLAIM_TOKEN=result.claimToken;
    $('pair-step').hidden=true;
    $('credential-step').hidden=false;
    $('password-notice').textContent='Your Community account is verified. This unofficial gateway receives your HoYoLAB password. Use a dedicated test account.';
  }catch(e){alert(e.message)}finally{button.disabled=false}
};
LOGIN.onsubmit=async e=>{e.preventDefault();$('begin').disabled=true;try{const form=new FormData(LOGIN);if(!CLAIM_TOKEN)throw Error('Verify your Community pairing code first.');const result=await api('/api/start','POST',{code:form.get('code').toString().trim(),claim_token:CLAIM_TOKEN,account:form.get('account').toString().trim(),password:form.get('password').toString()});CLAIM_TOKEN='';LOGIN.querySelector('[name=password]').value='';LOGIN.reset();JOB=result.id;LOGIN.hidden=true;$('work').hidden=false;timer=setInterval(update,1300);await update();}catch(err){alert(err.message);}finally{$('begin').disabled=false}};
$('cancel').onclick=async()=>{if(JOB){try{await api('/api/cancel/'+encodeURIComponent(JOB),'POST')}catch{}}clearInterval(timer);location.reload()};
