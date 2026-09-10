import {controlState} from './autonomy.js';
import {accessReason,requirementReason} from './environment.js';
import {clone,fail,resolve,test} from './tuning.js';
import {route,localPath,distance,nearestFree,pointFree,bodyBlocker,socialSpot,clearsEgress} from './space.js';

function pathTask(task,points,phase){Object.assign(task,{phase,points,point:0,pointRemaining:points[0]?.duration||.01,blockedBy:null,blockedMinutes:0});}
function directPoints(from,targets,speed){const points=[];let last=from;for(const p of targets){points.push({...p,duration:Math.max(.01,distance(last,p)/speed)});last=p;}return points;}
function release(world,owner){const s=world.state,t=s.tasks[owner];if(!t)return;for(const [key,l] of Object.entries(s.leases))if(l.task===t.id)delete s.leases[key];delete s.tasks[owner];s.actors[owner].pose='standing';s.actors[owner].private=false;}
export function stageExit(state,owner,speed=4){
 const t=state.tasks[owner],p=state.actors[owner];if(!t?.approach)return false;
 const dest=nearestFree(state,t.exitPoint||t.approach,{owner,dynamic:true},2)||t.approach;
 const tail=route(state,{...t.approach,id:owner},dest,speed,{dynamic:true})||[];
 pathTask(t,[...directPoints(p,[t.approach],speed),...tail],'exit');t.attention='block';p.private=false;p.pose='standing';return true;
}
export function cancel(world,owner,reason='interrupted'){
 const task=world.state.tasks[owner]||world.state.suspended[owner];if(!task)return false;
 if(task.phase==='exit')return false;
 if(world.state.tasks[owner]&&task.approach&&['enter','perform','return'].includes(task.phase)){
  task.cancelReason=reason;delete world.state.suspended[owner];stageExit(world.state,owner,world.tuning.pack.clock.walkSpeed);
  world.state.receipts[task.id]={ok:false,status:'cancelled',commandId:task.id,reason};
 }else{if(world.state.tasks[owner])release(world,owner);delete world.state.suspended[owner];world.state.receipts[task.id]={ok:false,status:'cancelled',commandId:task.id,reason};}
 world.transaction(tx=>tx.emit('action-cancelled',owner,[owner],{action:task.candidate.action,commandId:task.id,reason}));return true;
}

export function perform(world,owner,action,{roles,args}={},commandId=world.id('command')){
  if(world.state.receipts[commandId])return clone(world.state.receipts[commandId]);
  const candidates=world.candidates(owner,{action,roles,args}),candidate=candidates[0];
  if(!candidate)return {ok:false,reason:'No executable candidate',action};
  return world.execute(owner,candidate,commandId,{rule:'player',reason:'玩家操作'});
 }

export function execute(world,owner,candidate,commandId,decision){
  if(world.state.receipts[commandId])return clone(world.state.receipts[commandId]);
  const fresh=world.candidates(owner,{action:candidate.action,roles:candidate.roles,args:candidate.args}).find(a=>a.key===candidate.key);
  if(!fresh)return {ok:false,reason:'Candidate expired'};
  const spec=world.tuning.pack.actions[candidate.action],bindings=world.roleBindings(owner,spec,candidate.roles)[0],context=world.context(owner,bindings,candidate.args);context.label=spec.label;context.action=candidate.action;context.causeSituation=candidate.situation||'none';
  if(spec.executor==='physical'){
   if(world.state.tasks[owner]){if(spec.interruptWhen&&world.state.tasks[owner].attention!=='block'&&test(spec.interruptWhen,context))world.cancel(owner,'共同作息发生变化，转入当前安排。');else return {ok:false,reason:'Actor busy'};if(world.state.tasks[owner])return {ok:false,reason:'Actor busy'};}
   const target=resolve(spec.anchor||'$actor',context);if(!target)return {ok:false,reason:'No interaction anchor'};
   let anchor={room:target.room,x:target.x,z:target.z,pose:spec.pose||'standing'},slot=null,approach=null,exitPoint=null,resource=null,privateUse=false;
   if(world.state.navigation&&world.state.actors[target.id]){anchor=socialSpot(world.state,owner,target);if(!anchor)return {ok:false,reason:'No clear approach'};}
   else if(world.state.navigation&&spec.anchor==='$args'){anchor=nearestFree(world.state,anchor,{owner,dynamic:true},1);if(!anchor)return {ok:false,reason:'Unreachable'};}
   if(!spec.slot&&world.state.objects[target.id]){
    const o=world.state.objects[target.id],entry=world.tuning.pack.types[o.type].slots?.find(s=>s.approach)?.approach;
    if(world.state.navigation){
     const desired=entry?{...anchor,x:o.x+entry.x,z:o.z+entry.z}:anchor;
     anchor=nearestFree(world.state,desired,{owner,dynamic:true},2);if(!anchor)return {ok:false,reason:'No clear approach'};
    }else if(o.footprint)anchor.z+=o.footprint.d/2+.5;
   }
   if(spec.slot){
    const object=world.state.objects[target.id],type=world.tuning.pack.types[object?.type];if(!type)return {ok:false,reason:'Target has no slots'};
    const available=(type.slots||[]).find(a=>(!spec.slot||a.tags?.includes(spec.slot))&&!world.state.leases[target.id+':'+a.id]);
    if(!available)return {ok:false,reason:'Resource occupied'};slot=target.id+':'+available.id;anchor={room:object.room,x:object.x+available.x,z:object.z+available.z,pose:available.pose,facing:available.facing,render:available.render};resource=object.id;privateUse=!!available.private;
    if(available.approach){approach={room:object.room,x:object.x+available.approach.x,z:object.z+available.approach.z};exitPoint={room:object.room,x:approach.x+(world.state.navigation?.separation||.6)+.4,z:approach.z+.25};}

   }
   const points=route(world.state,world.state.actors[owner],approach||anchor,world.tuning.pack.clock.walkSpeed);if(!points)return {ok:false,reason:'Unreachable'};
   const task={id:commandId,actor:owner,candidate:clone(candidate),decision:clone(decision),attention:spec.attention||'none',phase:'travel',points,point:0,pointRemaining:points[0]?.duration||0,remaining:spec.duration,anchor,approach,exitPoint,resource,privateUse,slot,started:world.state.time};
   if(spec.stopAtPeriodEnd){const period=world.tuning.pack.clock.periods.find(p=>context.clock.minute>=p.start&&context.clock.minute<p.end);if(period)task.periodEnd=world.state.time+period.end-context.clock.minute;}
   delete world.state.waiting?.[owner];world.state.tasks[owner]=task;if(slot)world.state.leases[slot]={actor:owner,task:commandId};
   return world.state.receipts[commandId]={ok:true,status:'running',commandId};
  }
  try{world.finish(owner,candidate,context,commandId,decision);return world.state.receipts[commandId];}
  catch(e){return world.state.receipts[commandId]={ok:false,status:'failed',reason:e.message,commandId};}
 }

export function finish(world,owner,candidate,context,commandId,decision){
  const spec=world.tuning.pack.actions[candidate.action];
  world.transaction(tx=>{
   const live={...context,actor:tx.state.actors[owner]};for(const [role,collection] of Object.entries({target:'actors',item:'objects',offer:'offers'}))if(context[role]?.id)live[role]=tx.state[collection][context[role].id];
   fail(!accessReason(tx.state,live.actor,live.item?.room||live.actor.room),'Access conditions changed');
   fail(!requirementReason(spec,live),requirementReason(spec,live));
   fail(test(spec.requires,live),'Execution requirement failed');
   tx.apply(spec.effects,context);
   const p=tx.state.actors[owner];p.last[candidate.key]=tx.state.time;
   for(const r of world.tuning.pack.routines||[])if(r.action===candidate.action&&test(r.when,context))p.last['routine:'+r.id+':'+context.clock.day]=tx.state.time;
   const uid=tx.emit('action-completed',owner,[owner],{action:candidate.action,commandId,rule:decision.rule,reason:decision.reason,situation:candidate.situation||'none'});
   tx.state.receipts[commandId]={ok:true,status:'completed',commandId,event:uid};
  });
  if(decision.rule==='player'&&world.state.actors[owner].controlled)controlState(world,owner).holdUntil=world.state.time+(world.tuning.pack.control?.manualGrace||2);
  if(candidate.goal!=='none')world.completeGoalStep(owner,candidate.goal,candidate.goalStage,world.state.receipts[commandId].event);
 }

function makeRoom(world,owner,leader){
 const s=world.state,t=s.tasks[owner],p=s.actors[owner],other=s.actors[leader];
 if(!t||t.phase!=='travel'||t.detour)return false;
 const choices=[];
 for(const r of [1.2,1.8,2.4])for(let i=0;i<16;i++){
  const a=i*Math.PI/8,q={room:p.room,x:p.x+Math.sin(a)*r,z:p.z+Math.cos(a)*r};
  if(!pointFree(s,q,{owner,dynamic:true})||distance(q,other)<1.4)continue;
  const path=localPath(s,p,q,{owner,dynamic:true});if(!path)continue;
  const points=directPoints(p,path.map(a=>({...a,room:p.room})),world.tuning.pack.clock.walkSpeed),length=points.reduce((n,a)=>n+a.duration,0);
  if(length<=1.2)choices.push({points,length});
 }
 const best=choices.sort((a,b)=>a.length-b.length)[0];if(!best)return false;
 pathTask(t,best.points,'travel');t.detour={leader};t.yieldTo=null;return true;
}
function move(world,owner,task,dt){
 const s=world.state,p=s.actors[owner];let left=dt;task.blockedBy=null;
 if(!task.detour&&task.yieldTo&&s.time<task.yieldUntil&&s.tasks[task.yieldTo]&&distance(p,s.actors[task.yieldTo])<2.5){task.blockedBy=task.yieldTo;return 0;}
 task.yieldTo=null;
 while(task.point<task.points.length&&left>1e-8){
  const point=task.points[task.point],used=Math.min(left,task.pointRemaining),fraction=task.pointRemaining?used/task.pointRemaining:1;
  const dest=point.room===p.room?{room:p.room,x:p.x+(point.x-p.x)*fraction,z:p.z+(point.z-p.z)*fraction}:{room:point.room,x:point.x,z:point.z};
  const blocker=bodyBlocker(s,owner,p,dest);
  if(blocker){task.blockedBy=blocker;task.blockedMinutes=(task.blockedMinutes||0)+left;
   const other=s.tasks[blocker];
   if(task.phase==='travel'&&other?.phase==='travel'&&p.room===s.actors[blocker].room){
    if(task.started>other.started||task.started===other.started&&owner>blocker){task.yieldTo=blocker;task.yieldUntil=s.time+2;return 0;}
    other.yieldTo=owner;other.yieldUntil=s.time+2;
   }
   if(task.blockedMinutes>=(s.navigation?.replanAfter||.75)&&task.phase!=='enter'){
    let goal=task.phase==='travel'?(task.approach||task.anchor):task.points.at(-1);
    if(!task.slot)goal=nearestFree(s,goal,{owner,dynamic:true},1.5)||goal;
    const reroute=route(s,p,goal,world.tuning.pack.clock.walkSpeed,{dynamic:true,ignoreObject:task.phase==='exit'?task.resource:null});
    if(reroute){const phase=task.phase;pathTask(task,reroute,phase);}else{if(task.phase==='travel'&&other?.phase==='travel')makeRoom(world,blocker,owner);task.blockedMinutes=0;}
   }return 0;
  }
  if(point.room===p.room&&(Math.abs(dest.x-p.x)+Math.abs(dest.z-p.z))>.00001)p.facing=Math.atan2(dest.x-p.x,dest.z-p.z);
  if(point.room===p.room||task.pointRemaining-used<=.00001)Object.assign(p,dest);
  task.pointRemaining-=used;left-=used;
  if(task.pointRemaining<=.00001){Object.assign(p,{room:point.room,x:point.x,z:point.z});task.point++;task.pointRemaining=task.points[task.point]?.duration||0;}
 }
 task.blockedMinutes=0;return left;
}
function completeTask(world,owner){
 const task=world.state.tasks[owner],p=world.state.actors[owner];let retry=false;
 try{
  const spec=world.tuning.pack.actions[task.candidate.action],bindings=world.roleBindings(owner,spec,task.candidate.roles)[0];fail(bindings,'Target no longer perceived');
  const context=world.context(owner,bindings,task.candidate.args);context.label=spec.label;context.action=task.candidate.action;context.causeSituation=task.candidate.situation||'none';
  fail(test(spec.when,context),'Action conditions changed');const target=resolve(spec.anchor||'$actor',context);
  if(target&&(distance(p,target)>world.state.senses.reach||world.state.navigation&&!clearsEgress(world.state,target,p))&&task.candidate.roles.target&&(task.retargets||0)<5){
   const dest=world.state.navigation?socialSpot(world.state,owner,target):target;if(!dest)throw new Error('No clear approach');
   const points=route(world.state,p,dest,world.tuning.pack.clock.walkSpeed);if(points){pathTask(task,points,'travel');task.remaining=spec.duration;task.retargets=(task.retargets||0)+1;retry=true;return;}
  }
  const object=world.state.objects[task.resource],slot=object&&world.tuning.pack.types[object.type].slots?.find(s=>task.slot===object.id+':'+s.id);
  const atReservedSlot=slot&&world.state.leases[task.slot]?.task===task.id&&distance(p,{room:object.room,x:object.x+slot.x,z:object.z+slot.z})<.12;
  fail(target&&(atReservedSlot||distance(p,target)<=world.state.senses.reach),'Interaction target moved');world.finish(owner,task.candidate,context,task.id,task.decision);
  if(spec.repeatUntilPeriodEnd&&world.state.time<task.periodEnd){
   const live=world.state.tasks[owner];live.id=world.id('continuation');live.remaining=spec.duration;live.performedAt=world.state.time;
   if(live.slot)world.state.leases[live.slot]={actor:owner,task:live.id};
   world.state.receipts[live.id]={ok:true,status:'running',commandId:live.id};retry=true;
  }
 }catch(e){world.state.receipts[task.id]={ok:false,status:'failed',commandId:task.id,reason:e.message};world.transaction(tx=>tx.emit('action-failed',owner,[owner],{action:task.candidate.action,reason:e.message}));}
 finally{if(!retry){const live=world.state.tasks[owner];live.finalized=true;if(!stageExit(world.state,owner,world.tuning.pack.clock.walkSpeed))release(world,owner);}}
}
export function tickTasks(world,dt){
 for(const owner of Object.keys(world.state.tasks)){
  const task=world.state.tasks[owner],p=world.state.actors[owner];let spec=world.tuning.pack.actions[task.candidate.action];
  if(spec.transition&&['travel','enter','perform'].includes(task.phase)){
   const bindings=world.roleBindings(owner,spec,task.candidate.roles)[0],ctx=bindings&&world.context(owner,bindings,task.candidate.args),next=world.tuning.pack.actions[spec.transition.action];
   if(ctx&&test(spec.transition.when,ctx)&&next.slot===spec.slot&&test(next.when,ctx)){
    world.state.receipts[task.id]={ok:true,status:'completed',commandId:task.id};
    task.id=world.id('transition');task.candidate.action=task.candidate.kind=spec.transition.action;task.candidate.key=JSON.stringify([task.candidate.action,task.candidate.roles,task.candidate.args]);
    spec=next;task.remaining=spec.duration;task.performedAt=world.state.time;
    const period=world.tuning.pack.clock.periods.find(c=>ctx.clock.minute>=c.start&&ctx.clock.minute<c.end);task.periodEnd=world.state.time+period.end-ctx.clock.minute;
    if(task.slot)world.state.leases[task.slot]={actor:owner,task:task.id};world.state.receipts[task.id]={ok:true,status:'running',commandId:task.id};
   }
  }
  if(task.phase!=='exit'&&task.periodEnd!==undefined&&world.state.time>=task.periodEnd){world.cancel(owner,'当前课程时段结束。');continue;}
  let left=dt;
  if(['travel','enter','exit','return'].includes(task.phase)){
   left=move(world,owner,task,left);if(task.point<task.points.length)continue;
   if(task.detour){const leader=task.detour.leader;task.detour=null;const points=route(world.state,p,task.approach||task.anchor,world.tuning.pack.clock.walkSpeed);if(points){pathTask(task,points,'travel');task.yieldTo=leader;task.yieldUntil=world.state.time+2;continue;}world.cancel(owner,'让行后目标暂时不可达。');continue;}
   if(task.phase==='exit'){release(world,owner);continue;}
   if(task.phase==='return'){completeTask(world,owner);continue;}
   if(task.phase==='travel'&&task.approach){pathTask(task,directPoints(p,[task.anchor],world.tuning.pack.clock.walkSpeed),'enter');continue;}
   task.phase='perform';task.performedAt=world.state.time;p.pose=spec.pose||task.anchor.pose;p.private=task.privateUse;p.facing=task.anchor.facing??p.facing;
  }
  if(task.phase==='perform'){
   if(spec.motion){
    if(!task.motionPoints){const targets=spec.motion.loop.map(o=>({room:task.anchor.room,x:task.anchor.x+o.x,z:task.anchor.z+o.z}));
     if(!targets.every(q=>pointFree(world.state,q,{owner}))){world.cancel(owner,'运动路线被占用。');continue;}
     let cursor=p;const points=[];for(const target of targets){const part=route(world.state,{...cursor,id:owner},target,spec.motion.speed||4);if(!part)break;points.push(...part);cursor=target;}
     if(cursor!==targets.at(-1)){world.cancel(owner,'运动路线不可达。');continue;}
     task.motionPoints=points;pathTask(task,task.motionPoints,'perform');
    }
    move(world,owner,task,left);if(task.blockedBy)continue;
    if(task.point>=task.points.length)pathTask(task,task.motionPoints,'perform');
   }
   task.remaining-=left;
   if(task.remaining<=0){
    if(spec.motion&&distance(p,task.anchor)>.1){pathTask(task,route(world.state,p,task.anchor,world.tuning.pack.clock.walkSpeed)||directPoints(p,[task.anchor],4),'return');continue;}
    completeTask(world,owner);
   }
  }
 }
}
export function resumeTasks(world){
 for(const [owner,saved] of Object.entries(world.state.suspended)){
  if(world.state.actors[owner].session||world.state.tasks[owner]||saved.slot&&world.state.leases[saved.slot])continue;
  const points=route(world.state,world.state.actors[owner],saved.approach||saved.anchor,world.tuning.pack.clock.walkSpeed);if(!points)continue;
  const task={...saved,suspending:false};pathTask(task,points,'travel');world.state.tasks[owner]=task;delete world.state.suspended[owner];
  if(saved.slot)world.state.leases[saved.slot]={actor:owner,task:saved.id};
 }
}
