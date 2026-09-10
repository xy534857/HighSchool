import {clone} from './tuning.js';

// Game-time scheduling only. Transport, wall-clock deadlines and backpressure live outside Soar.
export function tickReflection(world){
 const spec=world.tuning.pack.reflection;if(!spec?.enabled)return;
 const day=Math.floor(world.state.time/1440),minute=world.state.time%1440;
 if(minute<spec.at||world.reflectionDay===day)return;world.reflectionDay=day;
 for(const [key,j] of Object.entries(world.state.social.reflections))if(j.day<day-14&&!['pending','queued'].includes(j.status))delete world.state.social.reflections[key];
 for(const a of Object.values(world.state.actors)){
  if(a.controlled&&!spec.includePlayer||spec.owners&&!spec.owners.includes(a.id))continue;
  const key=day+':'+a.id;if(world.state.social.reflections[key])continue;
  world.state.social.reflections[key]={key,owner:a.id,day,status:'queued',reason:'daily-reflection',created:world.state.time};
 }
}
export function reflectionJobs(world){return Object.values(world.state.social?.reflections||{}).filter(j=>j.status==='queued');}
export function claimReflection(world){
 for(const j of reflectionJobs(world))if(world.state.time-j.created>1440){j.status='skipped';j.error='A newer day superseded this queued reflection';}
 const job=reflectionJobs(world).find(j=>![...world.inbox.pending.values()].some(r=>r.owner===j.owner));if(!job)return null;
 const r=world.inbox.request(job.owner,job.reason,[],{day:job.day,job:job.key});if(!r)return null;job.status='pending';job.requestId=r.id;return r;
}
export function finishReflection(world,request,summary){
 const job=world.state.social.reflections[request.meta?.job];if(job){job.status='completed';job.completed=world.state.time;job.summary=summary;}
 world.mind.observe(request.owner,{uid:'reflection:'+request.id+':'+world.epoch,type:'daily-reflection',kind:'reflection',actor:request.owner,time:world.state.time,source:'self',summary,evidence:JSON.stringify(request.context.events.map(e=>e.uid))});
}
export function restoreReflection(world){
 for(const job of Object.values(world.state.social.reflections))if(job.status==='pending'){job.status='queued';delete job.requestId;}
}
export function reflectionState(world){return {jobs:clone(Object.values(world.state.social.reflections).slice(-32)),pending:[...world.inbox.pending.values()].map(r=>({id:r.id,owner:r.owner,reason:r.reason})),history:clone(world.policyHistory.slice(-12).map(h=>({owner:h.request.owner,at:h.installedAt,summary:h.reply.summary,reason:h.request.reason,revision:h.revision}))) };}
