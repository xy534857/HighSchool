import {clone,fail,resolve,test} from './tuning.js';

// Situations coordinate opportunities and inspect real results. They never pick an
// operator, teleport a participant, write a reply, or fabricate completion.
export function personalSituations(world,owner){
 return Object.values(world.state.situations||{}).filter(s=>s.status==='active'&&s.participants[owner]).map(s=>({id:s.id,label:s.label,phase:s.phase,room:s.room,ends:s.ends,...clone(s.participants[owner])}));
}
function specFor(world,run){return world.tuning.pack.situations.find(s=>s.id===run.spec);}
function installPlan(world,id,owner){
 const run=world.state.situations[id],spec=specFor(world,run),person=run.participants[owner];
 const plan=spec.phases[run.phase]?.plans?.[person.role];if(!plan||person.status!=='accepted'||world.state.actors[owner].controlled)return;
 const cast=Object.fromEntries(Object.entries(run.participants).map(([id,p])=>[p.role,id]));
 const goal=clone(plan),context={actor:world.state.actors[owner],cast,situation:run};
 for(const step of goal.steps){if(step.roles)step.roles=resolve(step.roles,context);if(step.args)step.args=resolve(step.args,context);}
 goal.id=id+':'+run.phase+':'+owner;goal.situation=id;goal.situationPhase=run.phase;goal.deadline=run.ends;
 if(!(world.state.goalKeys[owner]||[]).includes(goal.id))world.addGoal(owner,goal);
}
export function respond(tx,c,e){
 const run=tx.state.situations[c.situation?.id],member=run?.participants[c.actor.id];
 fail(run?.status==='active'&&member&&member.status==='invited','No open activity invitation');
 fail(['accepted','declined'].includes(e.status),'Invalid participation response');
 member.status=e.status;
 tx.emit('situation-response',c.actor.id,[c.actor.id],{situation:run.id,text:e.status==='accepted'?'决定参加：'+run.label:'决定不参加：'+run.label,claim:{subject:run.id,predicate:'participation',value:e.status}});
 if(e.status==='accepted')tx.defer(()=>installPlan(tx.world,run.id,c.actor.id));
}
function announce(world,run,text,kind){
 for(const owner of run.audience){const event={uid:world.id('situation-event'),kind,actor:owner,recipients:[owner],time:world.state.time,text,situation:run.id,claim:{subject:run.id,predicate:'status',value:run.status}};world.state.events.push(event);world.deliver(event);}
}
function end(world,run,status,label){
 run.status=status;run.result=label;run.finished=world.state.time;
 for(const [owner,t] of Object.entries(world.state.tasks))if(t.candidate.situation===run.id)world.cancel(owner,'活动结束，保留实际进度。');
 announce(world,run,label,'situation-ended');
}
export function tickSituations(world){
 const s=world.state;
 for(const spec of world.tuning.pack.situations||[]){
  // Retain seed-only content compatibility, without treating a notice as a story.
  if(!spec.phases){if(!s.situationKeys.includes(spec.id)&&s.time>=spec.at){s.situationKeys.push(spec.id);for(const seed of spec.seeds||[]){const e={uid:world.id('situation-event'),kind:'situation-notice',actor:seed.actor,recipients:[seed.actor],time:s.time,text:spec.label,claim:seed.claim};s.events.push(e);world.deliver(e);}}continue;}
  const cycle=spec.repeat?Math.floor((s.time-spec.at)/spec.repeat):0,start=spec.at+cycle*(spec.repeat||0),id=spec.id+':'+cycle;
  if(cycle<0||s.time<start||s.time>=start+spec.duration||s.situationKeys.includes(id))continue;
  s.situationKeys.push(id);
  const participants=Object.fromEntries(Object.entries(spec.cast).filter(([,r])=>s.actors[r.actor]).map(([role,r])=>[r.actor,{role,status:'invited'}]));
  const run={id,spec:spec.id,label:spec.label,room:spec.room,status:'active',phase:spec.initial,phaseStarted:s.time,started:start,ends:start+spec.duration,participants,audience:spec.audience||Object.keys(s.actors)};
  s.situations[id]=run;announce(world,run,spec.notice||spec.label,'situation-notice');
 }
 for(const run of Object.values(world.state.situations)){
  if(run.status!=='active')continue;
  const spec=specFor(world,run);if(!spec)continue;
  if(world.state.time>=run.ends){end(world,run,'expired',spec.expiredText||'活动时间结束，未完成的部分没有被自动补齐。');continue;}
  const phase=spec.phases[run.phase],events=world.state.events.filter(e=>e.time>=run.started),signals={};
  for(const [name,filter] of Object.entries(spec.signals||{}))signals[name]=events.filter(event=>test(filter,{event,offer:world.state.offers[event.offer],situation:run})).length;
  const accepted=Object.entries(run.participants).filter(([,p])=>p.status==='accepted');
  const metrics={accepted:accepted.length,gathered:accepted.filter(([id])=>world.state.actors[id].room===run.room&&!world.state.tasks[id]).length,phaseMinutes:world.state.time-run.phaseStarted};
  for(const transition of phase.transitions||[]){
   if(!test(transition.when,{signals,metrics,situation:run}))continue;
   if(transition.result){end(world,run,transition.result,transition.text);break;}
   run.phase=transition.next;run.phaseStarted=world.state.time;
   // A new opportunity preserves who opted in; Soar still arbitrates each plan.
   for(const [owner] of accepted)installPlan(world,run.id,owner);
   announce(world,run,spec.phases[run.phase].label,'situation-phase');break;
  }
 }
}
