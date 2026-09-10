import http from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {complete} from './provider.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
if(existsSync(resolve(root,'.env')))process.loadEnvFile(resolve(root,'.env'));
const web=resolve(root,'dist'),spool=resolve(root,process.env.LLM_SPOOL_DIR||'.runtime-inbox');
const mode=process.env.LLM_PROVIDER||'manual',port=Number(process.env.PORT||3000),timeout=Number(process.env.LLM_TIMEOUT_MS||60000);
await mkdir(spool,{recursive:true});
const jobs=new Map(),starts=[],maxConcurrent=Number(process.env.LLM_CONCURRENCY||1),rpm=Number(process.env.LLM_REQUESTS_PER_MINUTE||4);
let active=0;
const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
async function input(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>120000)throw Error('Request too large');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString());}
const originAllowed=req=>{try { const host=new URL('http://'+req.headers.host).hostname;return ['localhost','127.0.0.1','[::1]',...(process.env.LLM_ALLOWED_HOSTS||'').split(',')].includes(host)&&(!req.headers.origin||new URL(req.headers.origin).host===req.headers.host); }catch{return false;}};
async function run(job){
 active++;job.status='running';job.started=Date.now();const controller=new AbortController();job.controller=controller;const timer=setTimeout(()=>controller.abort(),timeout);
 try{
  if(mode==='manual'){
   await writeFile(resolve(spool,job.id+'.request.json'),JSON.stringify(job.request,null,2));
   while(!controller.signal.aborted){
    try{job.reply=JSON.parse(await readFile(resolve(spool,job.id+'.reply.json'),'utf8'));break;}catch(e){if(e.code!=='ENOENT')throw e;}
    await new Promise(r=>setTimeout(r,200));
   }
   if(!job.reply)throw Error('Manual reasoning deadline exceeded');
  }else if(mode==='compatible'){const result=await complete(job.request,{signal:controller.signal});Object.assign(job,result);}
  else throw Error('Unknown LLM_PROVIDER');
  if(job.status!=='cancelled')job.status='completed';
 }catch(e){if(job.status!=='cancelled')job.status='failed';job.error=e.message;}finally{clearTimeout(timer);job.elapsedMs=Date.now()-job.started;delete job.controller;active--;}
}
const scheduler=setInterval(()=>{
 const now=Date.now();while(starts.length&&now-starts[0]>=60000)starts.shift();
 for(const [id,j] of jobs)if(now-j.created>600000&&j.status!=='running')jobs.delete(id);
 for(const job of jobs.values())if(job.status==='queued'&&active<maxConcurrent&&starts.length<rpm){starts.push(now);void run(job);}
},100);
export const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
   if(!originAllowed(req))return send(res,403,{error:'Cross-origin requests are disabled'});
   if(url.pathname==='/api/llm/config')return send(res,200,{enabled:true,mode,timeoutMs:timeout+2000,concurrency:maxConcurrent,startsPerMinute:rpm});
   if(url.pathname==='/api/llm/requests'&&req.method==='POST'){
    if(jobs.size>=32)return send(res,429,{error:'Inference queue full'});
    const request=await input(req);if(!request.id||!request.owner||!request.context)throw Error('Invalid reasoning request');
    const id=randomUUID();jobs.set(id,{id,request,status:'queued',created:Date.now()});return send(res,202,{id});
   }
   const id=url.pathname.split('/').at(-1),job=jobs.get(id);if(!job)return send(res,404,{error:'Unknown reasoning request'});
   if(req.method==='DELETE'){job.controller?.abort();job.status='cancelled';return send(res,200,{status:job.status});}
   if(job.status==='cancelled')return send(res,410,{error:'Inference cancelled'});
   if(job.status==='failed')return send(res,502,{error:job.error,elapsedMs:job.elapsedMs});
   return send(res,200,{status:job.status,reply:job.reply,elapsedMs:job.elapsedMs,usage:job.usage});
  }
  const file=resolve(web,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(web+sep))return send(res,403,{error:'Invalid path'});
  if(!(await stat(file)).isFile())return send(res,404,{error:'Not found'});
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(file));
 }catch(e){send(res,e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'Not found':e.message});}
});
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(JSON.stringify({url:'http://localhost:'+server.address().port,provider:mode,spool:mode==='manual'?spool:undefined})));
function close(){clearInterval(scheduler);for(const j of jobs.values())j.controller?.abort();server.close(()=>process.exit());}
process.on('SIGINT',close);process.on('SIGTERM',close);
