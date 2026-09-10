// Provider-neutral asynchronous scheduler. No model promise is awaited by a simulation tick.
export class InferenceBroker {
 constructor({source,provider,now=()=>performance.now(),concurrency=1,startsPerMinute=4,timeoutMs=60000,onChange=()=>{}}){
  Object.assign(this,{source,provider,now,concurrency,startsPerMinute,timeoutMs,onChange});this.running=new Map();this.starts=[];this.history=[];this.generation=0;this.pumping=false;this.closed=false;
 }
 async pump(){
  if(this.pumping||this.closed||!this.provider)return;this.pumping=true;
  try{
   this.starts=this.starts.filter(t=>this.now()-t<60000);
   while(this.running.size<this.concurrency&&this.starts.length<this.startsPerMinute){
    const request=await this.source.claim();if(!request)break;
    if(this.closed)break;
    const controller=new AbortController(),job={request,controller,started:this.now(),generation:this.generation,status:'thinking'};
    this.starts.push(job.started);this.running.set(request.id,job);this.notify();
    // run() owns its rejection; it is deliberately not awaited here.
    void this.run(job);
   }
  }finally{this.pumping=false;}
 }
 async run(job){
  const {request,controller}=job;let timer;
  try{
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Inference deadline exceeded'));},this.timeoutMs);});
   const reply=await Promise.race([this.provider(request,{signal:controller.signal}),timeout]);
   job.inferenceMs=this.now()-job.started;
   if(this.closed||job.generation!==this.generation)throw Error('Discarded old world response');
   const began=this.now();await this.source.apply(reply);job.applyMs=this.now()-began;job.status='applied';
  }catch(e){job.status=controller.signal.aborted?'timeout':'rejected';job.error=e.message;await this.source.fail?.(request.id,job.error).catch(()=>{});}
  finally{clearTimeout(timer);this.running.delete(request.id);this.history.push({id:request.id,owner:request.owner,reason:request.reason,status:job.status,error:job.error,inferenceMs:job.inferenceMs??this.now()-job.started,applyMs:job.applyMs||0});this.history=this.history.slice(-80);this.notify();}
 }
 notify(){this.onChange(this.snapshot());}
 snapshot(){return {pending:[...this.running.values()].map(j=>({id:j.request.id,owner:j.request.owner,elapsedMs:this.now()-j.started})),history:this.history,concurrency:this.concurrency,startsPerMinute:this.startsPerMinute};}
 close(){this.closed=true;this.generation++;for(const j of this.running.values())j.controller.abort();this.notify();}
}

export function httpProvider({base='/api/llm',pollMs=800}={}){
 return async(request,{signal})=>{
  const response=await fetch(base+'/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Inference service failed');if(data.reply)return data.reply;
  try{while(true){
   await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Cancelled'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},pollMs);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
   const r=await fetch(base+'/requests/'+encodeURIComponent(data.id),{signal});const result=await r.json();if(!r.ok)throw Error(result.error||'Inference failed');if(result.reply)return result.reply;
  }}finally{if(signal.aborted)await fetch(base+'/requests/'+encodeURIComponent(data.id),{method:'DELETE'}).catch(()=>{});}
 };
}
