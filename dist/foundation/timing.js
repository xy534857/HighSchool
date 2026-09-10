import {resolve,test} from './tuning.js';
import {distance,route,nearestFree} from './space.js';
import {accessReason} from './environment.js';

// One clock is shared by simulation, timetable labels and travel planning.
export function periodInfo(clock,time){
 const minute=((time%1440)+1440)%1440,day=Math.floor(time/1440),periods=clock.periods;
 const period=periods.find(p=>minute>=p.start&&minute<p.end),next=periods.find(p=>p.start>minute);
 return {time,minute,day,weekday:day%7,period:period?.id||'free',periodLabel:period?.label,
  periodStart:day*1440+(period?.start||0),periodEnd:day*1440+(period?.end||1440),
  minutesRemaining:(period?.end||1440)-minute,nextPeriod:next?.id||'free',nextLabel:next?.label,
  minutesToNext:next?next.start-minute:1440-minute,walkSpeed:clock.walkSpeed};
}

export function travelOrigin(state,actor,speed){
 const task=state.tasks?.[actor.id]||actor.task;
 if(task?.approach&&['enter','perform','return'].includes(task.phase))return {point:{...actor,...task.approach},minutes:distance(actor,task.approach)/speed};
 return {point:actor,minutes:0};
}

// Use the same static route and slot approaches as the executor; congestion is
// covered by a small buffer, not by a fixed ten-minute pre-bell interruption.
function minutes(world,actor,from,to){
 if(!to)return Infinity;
 const s=world.state,cache=world.travelTimeCache??={values:new Map()};
 if(cache.state!==s||cache.time!==s.time){
  const geometry=JSON.stringify([world.contentRevision,world.tuning.pack.clock.walkSpeed,s.navigation,s.rooms,Object.values(s.objects).filter(o=>!o.holder&&(o.colliders||o.footprint)).map(o=>[o.room,o.x,o.z,o.colliders,o.footprint])]);
  if(cache.geometry!==geometry){cache.values.clear();cache.geometry=geometry;}
  cache.state=s;cache.time=s.time;
 }
 const access=Object.keys(s.rooms).map(id=>!!accessReason(s,actor,id));
 const key=JSON.stringify([access,from.room,from.x,from.z,to.room,to.x,to.z]);
 if(cache.values.has(key))return cache.values.get(key);
 const points=route(world.state,{...from,id:actor.id},to,world.tuning.pack.clock.walkSpeed);
 const value=points?points.reduce((n,p)=>n+p.duration,0):Infinity;
 if(cache.values.size>=8192)cache.values.delete(cache.values.keys().next().value);
 cache.values.set(key,value);return value;
}
function approach(world,object,slotTag){
 if(!object)return null;
 const slots=world.tuning.pack.types[object.type]?.slots||[],slot=slotTag?(slots.find(s=>s.tags?.includes(slotTag)&&!world.state.leases[object.id+':'+s.id])||slots.find(s=>s.tags?.includes(slotTag))):slots.find(s=>s.approach);
 const point=slot?.approach||slot;
 return point?{room:object.room,x:object.x+point.x,z:object.z+point.z}:nearestFree(world.state,object,{},2);
}
export function upcomingCommitment(world,owner,clock=periodInfo(world.tuning.pack.clock,world.state.time)){
 const actor=world.state.actors[owner],definition=world.tuning.pack.clock.preparations?.find(p=>p.period===clock.nextPeriod&&(!p.weekdays||p.weekdays.includes(clock.weekday))&&test(p.when,{actor,clock}));
 if(!definition)return null;
 const object=world.state.objects[resolve(definition.object,{actor,clock})];
 // Plan only toward a personally known destination.
 if(!object||object.room!==actor.room&&!world.mind.get(owner,object.id+':room'))return null;
 const destination=approach(world,object,definition.slot);if(!destination)return null;
 const origin=travelOrigin(world.state,actor,world.tuning.pack.clock.walkSpeed),travel=origin.minutes+minutes(world,actor,origin.point,destination),buffer=definition.bufferMinutes;
 return {destination,group:definition.group,startsAt:clock.time+clock.minutesToNext,travel,buffer,available:clock.minutesToNext};
}
export function personalClock(world,owner){
 const clock=periodInfo(world.tuning.pack.clock,world.state.time),next=owner&&upcomingCommitment(world,owner,clock);
 return {...clock,returnDue:!!next&&next.available<=next.travel+next.buffer,
  returnTravel:next&&Number.isFinite(next.travel)?next.travel:null,
  minutesToReturn:next&&Number.isFinite(next.travel)?Math.max(0,next.available-next.travel-next.buffer):null};
}
export function activityTime(world,owner,spec,context){
 const clock=context.clock,next=upcomingCommitment(world,owner,clock);
 if(!next||spec.executor!=='physical'||spec.autonomyGroup===next.group)return null;
 const actor=world.state.actors[owner],target=resolve(spec.anchor||'$actor',context);
 const destination=target?.id&&world.state.objects[target.id]?approach(world,world.state.objects[target.id],spec.slot):target;
 if(!destination)return null;
 const origin=travelOrigin(world.state,actor,world.tuning.pack.clock.walkSpeed),outbound=origin.minutes+minutes(world,actor,origin.point,destination),back=minutes(world,actor,destination,next.destination);
 const total=outbound+spec.duration+back+next.buffer+world.tuning.pack.clock.step*2;
 return {outbound,activity:spec.duration,back,total,available:next.available,fits:total<=next.available};
}
