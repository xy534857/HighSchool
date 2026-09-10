import {nearestFree,route} from '../foundation/space.js';
// Migrate presentation/navigation data without replacing authored cognition.
export function upgradeSpatialSave(saved,content,scenario){
 if(!saved||(saved.content.spatialRevision||0)>=(content.spatialRevision||0))return false;
 const old=saved.content,s=saved.state;
 old.navigation=structuredClone(content.navigation);s.navigation=structuredClone(content.navigation);
 for(const [id,type] of Object.entries(content.types))if(old.types[id]){
  for(const key of ['colliders','private'])if(type[key]!==undefined)old.types[id][key]=structuredClone(type[key]);
  for(const slot of type.slots||[]){const prior=old.types[id].slots?.find(a=>a.id===slot.id);if(prior)Object.assign(prior,structuredClone(slot));}
 }
 for(const [id,action] of Object.entries(content.actions))if(old.actions[id])for(const key of ['animation','motion','repeatUntilPeriodEnd','transition'])if(action[key]!==undefined)old.actions[id][key]=structuredClone(action[key]);
 for(const [rid,r] of Object.entries(scenario.rooms))if(s.rooms[rid])for(const key of ['map','portals','decorations','obstacles'])s.rooms[rid][key]=structuredClone(r[key]);
 for(const o of Object.values(s.objects)){
  o.colliders=structuredClone(old.types[o.type]?.colliders||null);
  const authored=scenario.objects.find(a=>a.id===o.id);if(authored&&o.room===authored.room&&!o.holder&&['meal-table','cafe-counter'].includes(o.type)){o.x=authored.x;o.z=authored.z;}
 }
 for(const [id,actor] of Object.entries(s.actors)){
  const task=s.tasks[id];let positioned=false;
  for(const t of [task,s.suspended[id]].filter(Boolean))if(t.slot){
   const [oid,slotId]=t.slot.split(':'),o=s.objects[oid];let slot=old.types[o?.type]?.slots?.find(a=>a.id===slotId);
   if(!slot&&o){slot=old.types[o.type]?.slots?.find(a=>a.tags?.includes(old.actions[t.candidate.action].slot)&&!s.leases[oid+':'+a.id]);if(slot){delete s.leases[t.slot];t.slot=oid+':'+slot.id;s.leases[t.slot]={actor:id,task:t.id};}}
   if(!slot)continue;
   Object.assign(t,{resource:oid,privateUse:!!slot.private,anchor:{room:o.room,x:o.x+slot.x,z:o.z+slot.z,pose:slot.pose,facing:slot.facing,render:slot.render},approach:{room:o.room,x:o.x+slot.approach.x,z:o.z+slot.approach.z}});
   t.exitPoint={...t.approach,x:t.approach.x+s.navigation.separation+.4,z:t.approach.z+.25};
   t.attention=slot.private?'block':old.actions[t.candidate.action].attention;
   if(t===task&&t.phase==='perform'){Object.assign(actor,t.anchor,{private:t.privateUse});positioned=true;}
  }
  if(!positioned){const free=nearestFree(s,actor,{owner:id,dynamic:true},5);if(free)Object.assign(actor,{x:free.x,z:free.z,pose:'standing',private:false});}
  if(task&&task.phase!=='perform'){
   const points=route(s,actor,task.approach||task.anchor,old.clock.walkSpeed);
   if(points)Object.assign(task,{phase:'travel',points,point:0,pointRemaining:points[0]?.duration||.01});
   else{delete s.tasks[id];for(const [key,l] of Object.entries(s.leases))if(l.actor===id)delete s.leases[key];}
  }
 }
 old.spatialRevision=content.spatialRevision;saved.contentRevision++;return true;
}
