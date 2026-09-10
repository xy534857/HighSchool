import {clone} from './tuning.js';
// The index contains keys, not belief values. SMem is the canonical personal state.
export class PersonalMemory {
 constructor(world){this.world=world;this.cache=new Map();this.goalCache=new Map();this.affectCache=new Map();}
 observe(owner,event){
  // Keep the shared provenance vocabulary at the native boundary as well as in beliefs.
  const normalize=v=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k==='root'?'provenance':k,normalize(x)])):v;
  const w=this.world;w.brain.observe(owner,normalize(event));
  w.state.observed[owner]??=[];w.state.observed[owner].push(event.uid);
  if(w.state.observed[owner].length>512)w.state.observed[owner].shift();
 }
 get(owner,key){
  const ck=owner+'|'+key;if(this.cache.has(ck))return this.cache.get(ck);
  const r=this.world.brain.recall(owner,{type:'mental-record',owner,key});
  const value=this.normalize(r.memory||null);this.cache.set(ck,value&&Object.freeze(value));return value;
 }
 write(owner,{subject,predicate,value,root,source='self',speaker=owner,domain='fact',kind='belief',explanation='unknown'}){
  const w=this.world,key=subject+':'+predicate;
  const p=w.state.actors[owner];
  const r=w.brain.perceive(owner,{key,subject,predicate,domain,energy:p.needs.energy,sensitivity:p.profile.sensitivity,coping:p.profile.coping,'goal-relevant':kind==='social'&&this.goals(owner).some(g=>g.status==='active'&&g.about?.includes(subject)),evidence:{class:kind,source,value,root,speaker,time:w.state.time,explanation}}).record;
  w.state.memoryKeys[owner]??=[];if(!w.state.memoryKeys[owner].includes(key))w.state.memoryKeys[owner].push(key);
  this.normalize(r);this.cache.set(owner+'|'+key,Object.freeze(r));this.affectCache.delete(owner+'|'+key);return clone(r);
 }
 normalize(r){if(r&&this.world.tuning.pack.predicates[r.predicate]?.type==='boolean'&&['yes','no'].includes(r.value))r.value=r.value==='yes';return r;}
 all(owner){return (this.world.state.memoryKeys[owner]||[]).map(k=>this.get(owner,k)).filter(Boolean);}
 affects(owner){return this.all(owner).filter(m=>m.domain==='social').slice(-4).map(m=>{const key=owner+'|'+m.key,bucket=Math.floor(this.world.state.time/5);let cached=this.affectCache.get(key);if(!cached||cached.bucket!==bucket){const r=this.world.brain.mindRead(owner,m.key,this.world.state.time);cached={bucket,value:{...r.record,intensity:r.active,mood:r.mood}};this.affectCache.set(key,cached);}return clone(cached.value);});}
 clear(){this.cache.clear();this.goalCache.clear();this.affectCache.clear();}
 emotion(owner,subject,predicate,event,explanation='unknown'){
  return this.write(owner,{subject,predicate,value:event.kind,root:event.uid,source:'heard',speaker:event.actor,domain:'social',kind:'social',explanation});
 }
 goal(owner,id){
  const key=owner+'|'+id;let template=this.goalCache.get(key);
  if(!template){const r=this.world.brain.recall(owner,{type:'foundation-goal',uid:'goal:'+id});if(!r.memory)return null;
  template=r.memory;Object.assign(template,JSON.parse(template.definition||'{}'));template.steps=[];const g=template;
  for(let i=0;i<g.stepCount;i++){
   const record=this.world.brain.recall(owner,{type:'foundation-step',uid:'goal:'+id+':step:'+i}).memory;
   if(!record)throw Error('Missing native goal step');
   const step={roles:{},args:{}};
   if(record.action)step.action=record.action;
   if(record['until-key'])step.until={key:record['until-key'],value:record['until-value']};
   for(const [k,v] of Object.entries(record)){if(k.startsWith('role-'))step.roles[k.slice(5)]=v;if(k.startsWith('arg-'))step.args[k.slice(4)]=v;}
   g.steps.push(record.encoded?JSON.parse(record.encoded):step);
  }
  this.goalCache.set(key,template);}
  const g=clone(template);g.stage=Number(this.get(owner,id+':stage')?.value||0);g.status=this.get(owner,id+':lifecycle')?.value||(g.stage>=g.steps.length?'completed':this.world.state.time>g.deadline?'expired':g.situation&&g.situation!=='none'&&(this.world.state.situations[g.situation]?.status!=='active'||this.world.state.situations[g.situation]?.phase!==g.situationPhase)?'expired':'active');return g;
 }
 goals(owner){return (this.world.state.goalKeys[owner]||[]).map(id=>this.goal(owner,id)).filter(Boolean);}
}
