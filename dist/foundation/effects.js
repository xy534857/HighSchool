import {defer} from './autonomy.js';
import {complete as completeObligation} from './obligations.js';
import {clone,fail,list,test,resolve} from './tuning.js';
import {distance} from './space.js';
import * as sessions from './conversations.js';
import {respond as respondSituation,contribute} from './situations.js';
import {renderFact} from './presentation.js';

// New content combines these primitives. A new primitive is an explicit engine extension.
export function createEffects(){
 const effects=new Map(),add=(type,run)=>effects.set(type,{run});
 add('situation.respond',respondSituation);add('autonomy.defer',defer);add('obligation.complete',completeObligation);
 add('situation.contribute',contribute);
 add('goal.commit',(tx,c,e)=>{
  // A promise made by this actor creates only their own plan, never another's.
  const recipe=tx.world.tuning.pack.projects?.[e.project];fail(recipe,'Unknown commitment project');
  const goal={...clone(recipe),id:c.causeSituation+':'+c.action+':'+c.actor.id,origin:'self-commitment',deadline:tx.state.time+(e.withinMinutes||1440)};
  for(const step of goal.steps)for(const method of [step,...(step.alternatives||[])])for(const key of ['roles','args'])if(method[key])method[key]=resolve(method[key],c);
  if((tx.state.goalKeys[c.actor.id]||[]).includes(goal.id))return;
  tx.world.validateGoal(c.actor.id,goal);
  tx.defer(()=>tx.world.addGoal(c.actor.id,goal));
 });
 add('actor.add',(tx,c,e)=>{
  const p=tx.state.actors[e.actor||c.actor.id],spec=tx.world.tuning.pack.resources?.[e.resource];
  fail(p&&spec&&Number.isFinite(e.amount),'Invalid personal resource');
  const value=p.resources[e.resource]+e.amount;
  fail(e.clamp||value>=spec.min&&value<=spec.max,'Personal resource bounds');
  p.resources[e.resource]=Math.max(spec.min,Math.min(spec.max,value));
 });
 add('need.change',(tx,c,e)=>{
  const p=tx.state.actors[e.actor||c.actor.id];fail(p&&Object.hasOwn(p.needs,e.need)&&Number.isFinite(e.amount),'Invalid need effect');
  p.needs[e.need]=Math.max(0,Math.min(100,p.needs[e.need]+e.amount));
 });
 add('object.set',(tx,c,e)=>{
  const o=tx.state.objects[e.object];fail(o&&Object.hasOwn(o.state,e.field),'Undeclared object state');
  fail(typeof o.state[e.field]===typeof e.value,'Object state type mismatch');o.state[e.field]=e.value;
 });
 add('object.add',(tx,c,e)=>{
  const o=tx.state.objects[e.object];fail(o&&Number.isFinite(o.state[e.field])&&Number.isFinite(e.amount),'Invalid numeric object effect');
  const next=o.state[e.field]+e.amount;fail(next>=(e.min??0)&&next<=(e.max??Number.MAX_SAFE_INTEGER),'Object resource bounds');o.state[e.field]=next;
 });
 add('object.take',(tx,c,e)=>{
  const s=tx.state,o=s.objects[e.object],p=s.actors[c.actor.id];fail(o&&!o.holder&&distance(p,o)<=s.senses.reach,'Object out of reach');
  fail(o.tags.includes('portable'),'Object is not portable');o.holder=p.id;
  tx.emit('object-taken',p.id,tx.visible(p.id),{object:o.id,claim:{subject:o.id,predicate:'holder',value:p.id}});
 });
 add('object.put',(tx,c,e)=>{
  const s=tx.state,o=s.objects[e.object],p=s.actors[c.actor.id];fail(o?.holder===p.id,'Actor does not hold object');
  o.holder=null;Object.assign(o,{room:p.room,x:p.x,z:p.z});
  tx.emit('object-placed',p.id,tx.visible(p.id),{object:o.id,claim:{subject:o.id,predicate:'holder',value:'none'}});
 });
 add('object.transfer',(tx,c,e)=>{
  const s=tx.state,o=s.objects[e.object],from=s.actors[e.from],to=s.actors[e.to],offer=s.offers[e.authorization];
  fail(o&&from&&to&&o.holder===from.id&&c.actor.id===from.id,'Transfer ownership mismatch');
  fail(distance(from,to)<=s.senses.reach,'Recipient out of reach');
  const outward=offer?.giver===from.id&&offer?.receiver===to.id&&!offer?.transferred;
  const returning=e.return===true&&offer?.returnAllowed&&offer?.receiver===from.id&&offer?.giver===to.id&&offer?.transferred&&!offer?.returned;
  fail(offer?.status==='accepted'&&offer.transferAllowed&&offer.item===o.id&&(outward||returning),'No unused mutual transfer authorization');
  o.holder=to.id;if(returning)offer.returned=true;else offer.transferred=true;
  tx.emit('object-transferred',from.id,tx.visible(from.id),{object:o.id,target:to.id,offer:offer.id,claim:{subject:o.id,predicate:'holder',value:to.id}});
 });
 add('session.open',sessions.openSession);add('session.invite',sessions.invite);add('session.join',sessions.join);add('session.leave',sessions.leave);
 add('speech.emit',sessions.speak);
 add('knowledge.tell',(tx,c,e)=>{
  const fact=tx.world.mind.get(c.actor.id,e.key);fail(fact&&fact.value!=='unknown','Speaker does not know this fact');
  const r=sessions.speak(tx,c,{...e,text:e.text||renderFact(tx.world.tuning,fact),kind:'information',claim:{subject:fact.subject,predicate:fact.predicate,value:fact.value,root:fact.provenance},data:{knowledgeStatus:fact.status}});
  return r;
 });
 add('object.inspect',(tx,c,e)=>{
  const s=tx.state,o=s.objects[e.object],p=s.actors[c.actor.id];fail(o&&distance(p,o)<=s.senses.reach,'Inspection out of reach');
  const spec=tx.world.tuning.pack.types[o.type];
  for(const field of spec.inspect||[])tx.emit('inspection',p.id,[p.id],{claim:{subject:o.id,predicate:field,value:o.state[field]}});
 });
 add('offer.create',(tx,c,e)=>{
  const s=tx.state,spec=tx.world.tuning.pack.proposals[e.kind];fail(spec,'Unknown proposal kind');
  const id=tx.id('offer'),offer={id,situation:c.causeSituation||'none',kind:e.kind,from:c.actor.id,to:e.to,item:e.item||'none',giver:e.giver||c.actor.id,receiver:e.receiver||e.to,due:e.due??s.time+60,status:'pending',expires:s.time+s.limits.offerMinutes,session:c.actor.session,transferred:false,transferAllowed:!!spec.rights?.transfer,returnAllowed:!!spec.rights?.return,heardBy:[]};
  fail(s.actors[offer.to]&&Number.isFinite(offer.due)&&offer.due>s.time,'Invalid proposal recipient/deadline');
  fail(!Object.values(s.offers).some(o=>o.status==='pending'&&o.from===offer.from&&o.to===offer.to&&o.kind===offer.kind&&o.item===offer.item),'Duplicate pending proposal');
  const r=sessions.speak(tx,c,{to:offer.to,kind:'proposal',text:e.text||c.label,data:{offer:id,proposal:clone(offer)}});offer.heardBy=r.recipients;
  s.offers[id]=offer;
 });
 add('offer.resolve',(tx,c,e)=>{
  const s=tx.state,offer=s.offers[e.offer];fail(offer?.status==='pending'&&offer.to===c.actor.id&&offer.expires>=s.time,'No pending addressed proposal');
  fail(['accepted','declined'].includes(e.status),'Invalid proposal response');
  const spec=tx.world.tuning.pack.proposals[offer.kind],ctx={...c,offer};
  if(e.status==='accepted')fail(test(spec.when,ctx),'Proposal conditions changed');
  const r=sessions.speak(tx,c,{to:offer.from,kind:e.status==='accepted'?'cooperate':'refuse',text:e.text||c.label,claim:{subject:offer.id,predicate:'status',value:e.status},data:{offer:offer.id}});
  offer.status=e.status;offer.heardBy=[...new Set([...offer.heardBy,...r.recipients])];
  tx.apply(spec[e.status==='accepted'?'accept':'decline']||[],ctx);
 });
 add('appointment.create',(tx,c,e)=>{
  const s=tx.state,offer=s.offers[e.offer];fail(offer?.status==='accepted','Appointment requires an accepted proposal');
  const id='appointment:'+offer.id;fail(!s.appointments[id],'Duplicate appointment');
  s.appointments[id]={id,offer:offer.id,participants:[offer.from,offer.to],kind:e.kind||offer.kind,due:offer.due,item:offer.item,status:'pending'};
  offer.appointment=id;
  tx.emit('commitment',c.actor.id,[offer.from,offer.to],{appointment:id,due:offer.due,claim:{subject:id,predicate:'status',value:'pending'}});
 });
 add('appointment.fulfill',(tx,c,e)=>{
  const a=tx.state.appointments[e.appointment];fail(a?.status==='pending'&&a.participants.includes(c.actor.id),'Unknown personal commitment');
  // Physical terms are data-defined and rechecked at completion.
  fail(test(e.when,c),'Commitment not fulfilled');a.status='fulfilled';
  tx.emit('commitment-fulfilled',c.actor.id,a.participants,{appointment:a.id,claim:{subject:a.id,predicate:'status',value:'fulfilled'}});
 });
 add('group.create',(tx,c,e)=>{
  const s=tx.state;fail(typeof e.name==='string'&&e.name.length<=50,'Invalid group name');
  const id=tx.id('group');s.groups[id]={id,name:e.name,owner:c.actor.id,members:[c.actor.id],invited:list(e.invited).filter(id=>id!==c.actor.id&&s.actors[id])};
  tx.emit('group-created',c.actor.id,[c.actor.id],{group:id});
 });
 add('group.leave',(tx,c,e)=>{
  const g=tx.state.groups[e.group];fail(g?.members.includes(c.actor.id),'Not a group member');g.members=g.members.filter(id=>id!==c.actor.id);
  tx.emit('group-left',c.actor.id,[c.actor.id],{group:g.id});
 });
 add('event.emit',(tx,c,e)=>{tx.emit(e.kind,c.actor.id,e.audience==='visible'?tx.visible(c.actor.id):[c.actor.id],{text:e.text||c.label});});
 return effects;
}
