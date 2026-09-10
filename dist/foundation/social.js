import {clone,fail,test,idOK} from './tuning.js';
import {canSee} from './space.js';

// Directed appraisals live in each Soar agent's semantic memory. No shared relationship bar.
export function relationship(world,owner,subject){
 const out={id:subject};
 for(const [key,spec] of Object.entries(world.tuning.pack.relationships||{}))out[key]=world.mind.get(owner,subject+':relationship-'+key)?.value??spec.initial;
 return out;
}
export function initializeSocial(world,scenario){
 world.state.social??={initialized:false,contactAt:{},baseline:{},evolution:[],reflections:{},goalSeeds:{}};
 const s=world.state.social;
 for(const a of Object.values(world.state.actors))s.baseline[a.id]??=clone(a.profile);
 if(s.initialized)return;s.initialized=true;
 for(const edge of scenario.relationships||[])for(const [key,value] of Object.entries(edge.values)){
  const spec=world.tuning.pack.relationships?.[key];fail(spec&&world.state.actors[edge.owner]&&world.state.actors[edge.subject]&&Number.isFinite(value)&&value>=spec.min&&value<=spec.max,'Invalid initial relationship');
  world.mind.write(edge.owner,{subject:edge.subject,predicate:'relationship-'+key,value,root:'background:'+edge.owner+':'+edge.subject,domain:'relationship'});
 }
}
export function socialEvent(world,event,owner){
 const p=world.state.actors[owner];
 const offer=world.state.offers[event.offer];
 if(offer&&[offer.from,offer.to].includes(owner)&&['proposal','cooperate','refuse','proposal-expired','proposal-cancelled'].includes(event.kind)){const subject=owner===offer.from?offer.to:offer.from;world.mind.write(owner,{subject,predicate:'response-'+offer.kind,value:event.kind==='proposal'?'pending':offer.status,root:event.uid,source:owner===event.actor?'self':'heard',speaker:event.actor,kind:'interaction-result'});}
 if(event.kind==='social-act')world.mind.write(owner,{subject:event.actor,predicate:'social-'+event.intent,value:event.to,root:event.uid,source:owner===event.actor?'self':'heard',speaker:event.actor});
 for(const rule of world.tuning.pack.appraisals||[]){
  const context={event,actor:p,observer:owner,relation:relationship(world,owner,event.actor)};
  if(!test(rule.when,context))continue;
  const subject=rule.subject==='addressee'?event.to:event.actor;
  if(!world.state.actors[subject]||subject===owner)continue;
  const prior=relationship(world,owner,subject);
  for(const [key,delta] of Object.entries(rule.changes)){
   const spec=world.tuning.pack.relationships[key];
   world.mind.write(owner,{subject,predicate:'relationship-'+key,value:Math.max(spec.min,Math.min(spec.max,prior[key]+delta)),root:event.uid,source:'self',speaker:owner,domain:'relationship',explanation:rule.reason});
  }
 }
}
export function rememberContacts(world,owner){
 const s=world.state,p=s.actors[owner];if(!s.social||s.time<(s.social.contactAt[owner]??-Infinity)+10)return;s.social.contactAt[owner]=s.time;
 for(const a of Object.values(s.actors))if(a.id!==owner&&canSee(s,p,a)){
  const value=JSON.stringify({id:a.id,name:a.name,role:a.role,room:a.room,x:a.x,z:a.z,seenAt:s.time});
  world.mind.write(owner,{subject:a.id,predicate:'last-seen',value,root:'sight:'+s.time,source:'seen'});
 }
}
export function contacts(world,owner,visible){
 const seen=new Map(visible.map(a=>[a.id,{...a,visible:true}]));
 for(const id of Object.keys(world.state.actors))if(id!==owner&&!seen.has(id)){
  const record=world.mind.get(owner,id+':last-seen');if(record)seen.set(id,{...JSON.parse(record.value),visible:false});
 }
 return [...seen.values()];
}
export function validateEvolution(world,owner,patch,evidence){
 fail(Array.isArray(patch)&&patch.length<=4,'Too many cognition changes');
 const a=world.state.actors[owner],baseline=world.state.social.baseline[owner],day=Math.floor(world.state.time/1440),out=[];
 for(const change of patch){
  const spec=world.tuning.pack.cognition?.[change.field];fail(spec?.mutable&&typeof change.reason==='string'&&change.reason.length<=400,'Cognition field is not evolvable');
  fail(evidence.length>0,'Personality change needs observed evidence');
  const prior=world.state.social.evolution.filter(e=>e.owner===owner&&e.field===change.field&&e.day===day);
  fail(!prior.length,'Cognition field already changed today');
  let value;
  if(spec.type==='number'){
   fail(Number.isFinite(change.delta)&&Math.abs(change.delta)<=spec.maxDailyChange,'Personality change exceeds daily limit');value=a.profile[change.field]+change.delta;
   fail(value>=spec.min&&value<=spec.max&&Math.abs(value-baseline[change.field])<=spec.maxDrift,'Personality drift exceeds trait bounds');
  }else{fail(new Set(evidence).size>=3&&spec.values.includes(change.value),'A coping change needs three observed events and a declared value');value=change.value;}
  fail(!out.some(e=>e.field===change.field),'Duplicate cognition field');out.push({...change,owner,day,from:a.profile[change.field],to:value,evidence:clone(evidence)});
 }return out;
}
export function applyEvolution(world,changes){
 for(const c of changes){world.state.actors[c.owner].profile[c.field]=c.to;world.mind.write(c.owner,{subject:c.owner,predicate:'trait-'+c.field,value:c.to,root:c.evidence[0],domain:'cognition',explanation:c.reason});world.state.social.evolution.push({...c,time:world.state.time});}
 world.state.social.evolution=world.state.social.evolution.slice(-160);
}
export function validateSocialTuning(pack){
 for(const [key,s] of Object.entries(pack.relationships||{}))fail(idOK(key)&&[s.min,s.max,s.initial].every(Number.isFinite)&&s.min<=s.initial&&s.initial<=s.max,'Invalid relationship dimension');
 for(const a of pack.appraisals||[]){fail(idOK(a.id)&&a.changes&&typeof a.reason==='string','Invalid appraisal');for(const [k,v] of Object.entries(a.changes))fail(pack.relationships[k]&&Number.isFinite(v)&&Math.abs(v)<=100,'Invalid appraisal change');}
}
