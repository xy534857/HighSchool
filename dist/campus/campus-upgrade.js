import {upgradeSpatialSave} from './spatial-upgrade.js';

// Add the new campus without replacing native memories or runtime-only content.
export function upgradeCampusSave(saved,pack,scenario){
 if(!saved||(saved.content.campusRevision||0)>=(pack.campusRevision||0))return false;
 const c=saved.content,s=saved.state;
 for(const section of ['types','actions','cognition','projects'])for(const [id,value] of Object.entries(pack[section])){c[section]??={};c[section][id]=structuredClone(value);}
 c.resources={...structuredClone(pack.resources),...c.resources};
 c.routines=(c.routines||[]).filter(r=>!pack.routines.some(n=>n.id===r.id)).concat(structuredClone(pack.routines));
 for(const [id,room] of Object.entries(scenario.rooms))s.rooms[id]=structuredClone(room);
 for(const o of scenario.objects){
  const t=c.types[o.type],old=s.objects[o.id];
  if(old){old.state={...structuredClone(t.state),...old.state};old.owner=o.owner||'none';old.colliders=structuredClone(t.colliders||null);old.tags=structuredClone(t.tags);if(!old.holder)Object.assign(old,{room:o.room,x:o.x,z:o.z});}
  else s.objects[o.id]={holder:null,owner:'none',...structuredClone(o),state:structuredClone(t.state),tags:structuredClone(t.tags),footprint:structuredClone(t.footprint||null),colliders:structuredClone(t.colliders||null)};
 }
 for(const p of scenario.actors){s.actors[p.id].profile={...p.profile,...s.actors[p.id].profile};for(const k of ['sensitivity','sociability','persistence','coping','projects','biography'])s.actors[p.id].profile[k]=structuredClone(p.profile[k]);const a=s.actors[p.id];a.resources??={};for(const [id,r] of Object.entries(c.resources))a.resources[id]??=r.initial;if(s.tasks[p.id]?.candidate.action==='eat')a.resources.meal=1;}
 c.spatialRevision=0;upgradeSpatialSave(saved,pack,scenario);
 c.campusRevision=pack.campusRevision;c.planningRevision=pack.planningRevision;saved.contentRevision++;return true;
}
