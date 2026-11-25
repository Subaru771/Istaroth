// Private outbound Telegram relay. Deploy to a host that can reach api.telegram.org.
// Cloudflare Worker sends authenticated requests; this service keeps the bot token server-side.
import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
const key=String(process.env.RELAY_KEY||'');
const bot=String(process.env.BOT_TOKEN||'');
const port=Number(process.env.PORT||3000);
if(key.length<32||!/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(bot)){
  console.error('Missing RELAY_KEY (32+ characters) or BOT_TOKEN.');process.exit(1);
}
const auth=(value)=>{
  if(!value?.startsWith('Bearer '))return false;
  const a=Buffer.from(value.slice(7)),b=Buffer.from(key);
  return a.length===b.length&&timingSafeEqual(a,b);
};
function send(res,code,data){res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{online:true,service:'Istaroth Telegram Relay'});
  if(req.url!=='/send'||req.method!=='POST')return send(res,404,{ok:false});
  if(!auth(req.headers.authorization))return send(res,401,{ok:false});
  let raw='';
  try{
    for await(const chunk of req){raw+=chunk;if(raw.length>5000)throw Error('Body too large');}
    const {method,payload}=JSON.parse(raw);
    if(!['getMe','setWebhook','sendMessage'].includes(method)||!payload||typeof payload!=='object')return send(res,400,{ok:false});
    if(method==='sendMessage'&&(!/^[0-9]{1,20}$/.test(String(payload.chat_id))||typeof payload.text!=='string'||payload.text.length>2500))return send(res,400,{ok:false});
    if(method==='setWebhook'){
      const url=new URL(payload.url);
      if(url.protocol!=='https:'||url.pathname!=='/telegram'||!url.hostname.endsWith('.workers.dev')||
         !/^[A-Za-z0-9_-]{32,}$/.test(String(payload.secret_token||'')))return send(res,400,{ok:false});
    }
    const reply=await fetch('https://api.telegram.org/bot'+bot+'/'+method,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),
      redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!reply.ok)return send(res,502,{ok:false});
    const data=await reply.json();
    if(!data?.ok)return send(res,502,{ok:false});
    return send(res,200,{ok:true,result:data.result});
  }catch{return send(res,502,{ok:false});}
});
server.headersTimeout=15000;server.requestTimeout=20000;
server.listen(port,'0.0.0.0',()=>console.log('Istaroth relay listening on port '+port));
