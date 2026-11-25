// Staging-only Cloudflare Gateway. Does not handle HoYoLAB passwords or credentials.
// Never proxy password requests to Render: login must be ported and audited separately.
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
export class GatewaySession {
  constructor(state){this.state=state;}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/create'&&request.method==='POST'){
      const session=crypto.randomUUID(),expires=Date.now()+300000;
      await this.state.storage.put('session',{session,expires});
      return reply({session,expires});
    }
    if(url.pathname==='/check'&&request.method==='POST'){
      const {session}=await request.json().catch(()=>({}));
      const stored=await this.state.storage.get('session');
      return reply({valid:!!stored&&stored.expires>Date.now()&&stored.session===session});
    }
    return reply({error:'Not found'},404);
  }
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/health')
      return reply({online:true,service:'Istaroth Cloudflare Gateway staging',authenticationReady:false});
    if(request.method==='GET'&&url.pathname==='/')
      return new Response('Istaroth Cloudflare Gateway staging: password authentication is not available. Use the existing Community connection flow.',{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
    return reply({error:'HoYoLAB authentication is not implemented on Cloudflare. Existing Render Gateway remains active.'},501);
  }
};
