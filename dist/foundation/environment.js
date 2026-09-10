import {test,resolve} from './tuning.js';

// Authored access conditions and consumable economies, independent of any map.
export function accessReason(state,actor,room){
 const rule=state.rooms[room]?.access;
 return rule&&!test(rule.when,{actor})?rule.reason||'当前角色不能进入此区域。':'';
}
export function requirementReason(spec,context){
 for(const r of spec.requirements||[])if(!test(r.when,context))return r.reason;
 return '';
}
export function initializeResources(state,pack){
 for(const actor of Object.values(state.actors)){
  actor.resources??={};
  for(const [key,spec] of Object.entries(pack.resources||{}))actor.resources[key]??=spec.initial;
 }
}
export function tickEnvironment(world,dt){
 const s=world.state,pack=world.tuning.pack,start=s.time-dt;
 s.maintenance??={};
 for(const o of Object.values(s.objects)){
  const type=pack.types[o.type];
  for(const [field,c] of Object.entries(type.decay||{}))o.state[field]=Math.max(c.min,Math.min(c.max,o.state[field]+c.rate*dt));
  for(const [i,c] of (type.service||[]).entries()){
   const day=Math.floor((s.time-c.at)/1440),at=day*1440+c.at,key=o.id+':'+i;
   if(at>start&&at<=s.time&&s.maintenance[key]!==day){Object.assign(o.state,resolve(c.set,{}));s.maintenance[key]=day;}
  }
 }
 for(const a of Object.values(s.actors))for(const [key,c] of Object.entries(pack.resources||{}))if(c.daily){
  const day=Math.floor((s.time-c.daily.at)/1440),at=day*1440+c.daily.at;
  if(at>start&&at<=s.time)a.resources[key]=Math.min(c.max,a.resources[key]+c.daily.amount);
 }
}
