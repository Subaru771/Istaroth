'use strict';
/* Istaroth 1.6 — readable tabs, all personal values come from HoYoLAB response.
   No HTML from HoYoLAB is ever injected into the DOM. */
(() => {
 const panes=['resin','daily','account','explore','combat','cards','history','community'];
 const get=id=>document.getElementById(id);
 let active='resin', chronicle=null, busy=false, previousIdentity='';
 const has=val=>val!==undefined && val!==null && val!=='';
 const fmt=val=>has(val)?Number(val).toLocaleString('en-US'):'—';
 const asText=val=>has(val)?String(val):'—';
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
 const append=(parent,...children)=>{parent.append(...children);return parent;};
 const content=id=>get('dash-'+id);
 function row(title,value,description=''){
   const e=node('div','data-row');const t=node('span','data-row-label',title),v=node('strong','data-row-value',value);
   append(e,t,v);if(description)e.append(node('small','data-row-help',description));return e;
 }
 function tile(label,val){return append(node('div','metric-tile'),node('small','metric-title',label),node('strong','metric-value',val));}
 function grid(items){const el=node('div','metric-grid');for(const [k,v] of items)el.append(tile(k,v));return el;}
 function section(title){const e=node('section','data-section');e.append(node('h3','data-section-title',title));return e;}
 function hint(text,status='info') {return node('div','dash-hint '+status,text);}
 function readySection(key){
   const current=chronicle?.state;
   if(!syncInfo?.connected)return {ok:false,notice:hint('Connect your HoYoLAB account in Settings → Account to load this section.','empty')};
   if(!current||current.uid!==syncInfo.role?.uid||current.region!==syncInfo.role?.region)
     return {ok:false,notice:hint(busy?'Loading Battle Chronicle…':'Waiting for your Battle Chronicle data. Press ↻ to refresh.','empty')};
   const record=current.sections?.[key];
   if(!record)return {ok:false,notice:hint(busy?'Loading this section…':'No data received yet. Press ↻ to retry.','empty')};
   if(record.status!=='ok')return {ok:false,notice:hint('Unavailable: '+(record.error||'HoYoLAB did not return this section.'),'error')};
   return {ok:true,data:record.data,record};
 }
 function note(){return syncInfo?.notes&&syncInfo?.connected?syncInfo.notes:null;}
 function clock(ms){if(!has(ms))return '—';let secs=Math.max(0,Math.ceil(ms/1000));const days=Math.floor(secs/86400),h=Math.floor(secs%86400/3600),m=Math.floor(secs%3600/60);return days?`${days}d ${h}h`:h?`${h}h ${m}m`:`${m}m`;}
 function timestamp(ts){return ts?new Date(ts).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';}
 function emptyMessage(parent,text){parent.append(hint(text,'empty'));}
 function freshness(parent,record){if(!record?.at)return;parent.append(node('p','data-fresh',`${record.stale?'Last successful reading · ': 'Updated '}${timestamp(record.at)}${record.stale?' · Current refresh failed':''}`));}
 function daily(){const target=content('daily');target.replaceChildren();const n=note();if(!n){emptyMessage(target,'Connect to HoYoLAB to see live commissions, expeditions and Serenitea Pot.');return;}
   if(syncInfo?.error)target.append(hint('Last sync failed: '+syncInfo.error,'error'));
   target.append(grid([['Commissions',`${fmt(n.commissions?.completed)} / ${fmt(n.commissions?.total)}`],['Realm Currency',`${fmt(n.realm?.value)} / ${fmt(n.realm?.cap)}`],['Weekly discounts',`${fmt(n.weeklyDiscounts?.remaining)} / ${fmt(n.weeklyDiscounts?.limit)}`],['Expeditions',`${(n.expeditions||[]).length} / ${fmt(n.expeditionSlots)}`]]));
   const rewards=section('Daily rewards');rewards.append(row('Commission reward',n.commissions?.rewardClaimed?'Claimed':'Not claimed'));
   if(n.encounter)rewards.append(row('Encounter Points',`${fmt(n.encounter.finished)} / ${fmt(n.encounter.total)}`));
   const checkin=readySection('checkin');
   if(checkin.ok)rewards.append(row('HoYoLAB daily check-in',checkin.data.checkedIn?'Checked in':'Not checked in',`Total check-in days: ${fmt(checkin.data.days)}`));
   else if(syncInfo?.connected)rewards.append(row('HoYoLAB daily check-in','Unavailable'));
   target.append(rewards);
   const ex=section('Expeditions');
   if(n.expeditions?.length)n.expeditions.forEach((x,i)=>ex.append(row(`Expedition ${i+1}`,x.status==='finished'?'Ready':clock(x.endAt-Date.now()))));
   else emptyMessage(ex,'No expeditions in this reading.');target.append(ex);
   const t=section('Other timers');
   t.append(row('Realm Currency full in',clock((n.realm?.recoverySeconds||0)*1000)));
   if(n.transformer){const time=n.transformer.recovery;if(n.transformer.obtained)t.append(row('Parametric Transformer',n.transformer.ready?'Ready':time?`${time[0]}d ${time[1]}h ${time[2]}m`:'Unavailable'));}
   else t.append(row('Parametric Transformer','Not returned'));
   if(n.quests?.title)t.append(row('Archon quest',n.quests.title));
   target.append(t,node('p','data-fresh','Real-Time Notes · '+timestamp(n.fetchedAt)));
 }
 function account(){const target=content('account');target.replaceChildren();const z=readySection('profile');if(!z.ok){target.append(z.notice);return;}const d=z.data;
   const hero=append(node('div','account-identity'),node('strong','account-name',d.name||syncInfo?.role?.nickname||'Traveler'),node('span','account-meta',`AR ${fmt(d.level||syncInfo?.role?.level)} · ${syncInfo?.role?.server||''} · UID ${syncInfo?.role?.uid||'—'}`));target.append(hero);
   target.append(grid([['Days active',fmt(d.days)],['Achievements',fmt(d.achievements)],['Characters',fmt(d.characters)],['Waypoints',fmt(d.waypoints)],['Domains',fmt(d.domains)],['Spiral Abyss',d.abyss||'—']]));
   if(d.chests?.length){const s=section('Chests opened');for(const e of d.chests)s.append(row(e.name,fmt(e.count)));target.append(s);}
   if(d.oculi?.length){const s=section('Oculi found');for(const e of d.oculi)s.append(row(e.name,fmt(e.count)));target.append(s);}
   if(d.homes?.length){const s=section('Serenitea Pot');for(const h of d.homes)s.append(row(h.name||'Realm',`Lv ${fmt(h.level)}`,`Comfort: ${fmt(h.comfort)} · Furnishings: ${fmt(h.items)}`));target.append(s);}
   freshness(target,z.record);
 }
 function explore(){const target=content('explore');target.replaceChildren();const z=readySection('profile');if(!z.ok){target.append(z.notice);return;}
   if(!z.data.explorations?.length)emptyMessage(target,'HoYoLAB did not provide world exploration data for this account.');
   for(const w of z.data.explorations||[]){const s=section(w.name||'Unnamed area');const pct=w.percent===null?null:w.percent>100?w.percent/10:w.percent;
     const bar=node('div','area-track');const fill=node('div','area-fill');fill.style.width=`${Math.max(0,Math.min(100,pct||0))}%`;bar.append(fill);
     s.append(row('Exploration',pct===null?'—':`${Number(pct.toFixed(1))}%`),bar);
     if(w.level!==null)s.append(row('Regional offering level',fmt(w.level)));
     for(const o of w.offerings||[])s.append(row(o.name||'Offering',`Lv ${fmt(o.level)}`));target.append(s);
   }
   freshness(target,z.record);
 }
 function subsectionStatus(parent,key,title,render){const sect=section(title);const z=readySection(key);if(!z.ok)sect.append(z.notice);else{render(sect,z.data);freshness(sect,z.record);}parent.append(sect);}
 function combat(){const target=content('combat');target.replaceChildren();
   subsectionStatus(target,'abyss','Spiral Abyss — Current', (s,d)=>{s.append(grid([['Highest floor',d.maxFloor||'—'],['Stars',fmt(d.stars)],['Battles',fmt(d.battles)],['Wins',fmt(d.wins)]]));for(const f of d.floors||[]){const a=append(node('details','combat-floor'),node('summary','',`Floor ${fmt(f.floor)} · ${fmt(f.stars)} / ${fmt(f.max)} stars`));const b=node('div','floor-chambers');for(const c of f.chambers||[])b.append(row(`Chamber ${fmt(c.chamber)}`,`${fmt(c.stars)} / ${fmt(c.max)} stars`));a.append(b);s.append(a);}});
   subsectionStatus(target,'abyssPrevious','Spiral Abyss — Previous', (s,d)=>s.append(grid([['Highest floor',d.maxFloor||'—'],['Stars',fmt(d.stars)],['Battles',fmt(d.battles)],['Wins',fmt(d.wins)]])));
   subsectionStatus(target,'theater','Imaginarium Theater', (s,d)=>s.append(grid([['Max act',fmt(d.maxAct)],['Stars',fmt(d.stars)],['Medals',fmt(d.medals)]])));
   subsectionStatus(target,'stygian','Stygian Onslaught', (s,d)=>{s.append(grid([['Max difficulty',fmt(d.maxDifficulty)],['Challenges',fmt(d.challengeCount)]]));for(const r of d.records||[])s.append(row(`Difficulty ${fmt(r.difficulty)}`,r.time===null?'—':`${fmt(r.time)} sec`));});
 }
 function tcg(){const target=content('cards');target.replaceChildren();const z=readySection('tcg');if(!z.ok){target.append(z.notice);return;}const d=z.data;
   target.append(grid([['Player level',fmt(d.level)],['Cards owned',fmt(d.cards)],['Achievements',fmt(d.achievements)],['Wins',fmt(d.wins)],['Matches',fmt(d.matches)]]));
   target.append(hint('The TCG overview depends on your HoYoLAB privacy settings and endpoint availability.','info'));freshness(target,z.record);
 }
 const painters={daily,account,explore,combat,cards:tcg};
 function paint(tab){if(painters[tab])painters[tab]();}
 function activate(tab){if(!panes.includes(tab))return;active=tab;
  document.querySelectorAll('[data-dash]').forEach(b=>{const on=b.dataset.dash===tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});
  panes.forEach(key=>get('pane-'+key).classList.toggle('hidden',key!==tab));
  window.dispatchEvent(new CustomEvent('istaroth:dashboard-tab',{detail:{tab}}));
  paint(tab);if(tab==='history')window.dispatchEvent(new Event('pulse:history'));get('widgetScreen').scrollTo?.({top:0,behavior:'instant'});
  // Never replace user-chosen design or the manually controlled resin settings.
 }
 async function force(kind){if(!window.pulseDesktop){activate('resin');get('accountButton')?.click();return;}
  try{if(kind==='notes'){await bridge.hoyolabRefresh();}else{busy=true;paint(active);await bridge.chronicleRefresh();}}
  catch(e){const t=content(active);if(t)t.prepend(hint('Refresh failed: '+(e?.message||'Unknown error'),'error'));}
  finally{busy=false;paint(active);}
 }
 function init(){
  document.querySelectorAll('[data-dash]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.dash)));
  document.querySelectorAll('[data-refresh]').forEach(b=>b.addEventListener('click',()=>force(b.dataset.refresh)));
  if(bridge?.onChronicleStatus){bridge.onChronicleStatus(v=>{chronicle=v;busy=!!v.busy;paint(active);});bridge.chronicleStatus().then(v=>{chronicle=v;busy=!!v.busy;paint(active);}).catch(()=>{});}
  setInterval(()=>{
   const ident=syncInfo?.role?`${syncInfo.role.uid}:${syncInfo.role.region}`:'';
   if(previousIdentity!==ident){previousIdentity=ident;if(chronicle?.state?.uid!==syncInfo?.role?.uid)chronicle=null;paint(active);}
   if(active==='daily')paint('daily');
  },6000);
  activate('resin');
 }
 setTimeout(init,0);
})();
