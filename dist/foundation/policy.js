import {validateEvolution,applyEvolution} from './social.js';
import {finishReflection} from './reflection.js';
import {fail,idOK,clone} from './tuning.js';
export const CONTRACT_VERSION=2;
export const CANDIDATE_FIELDS=['obligation','obligation-status','situation','situation-role','action','target','target-role','item','offer','offer-kind','offer-status','invitation','group','message','message-key','goal','goal-step','category','utility','target-trust','target-affinity','target-grievance','target-respect','session-size'];
export const FRAME_FIELDS=['activity','room','period','session','phase','energy','hunger','social','bladder'];
const selfFields=tuning=>[...new Set([...FRAME_FIELDS,...Object.keys(tuning.pack.needs.initial),...Object.keys(tuning.pack.resources||{}).map(k=>'resource-'+k),...Object.keys(tuning.pack.cognition||{}).map(k=>'profile-'+k)])];
const operators={eq:'',ne:'<> ',lt:'< ',lte:'<= ',gt:'> ',gte:'>= '};
const symbol=v=>{
 if(typeof v==='boolean')return v?'yes':'no';
 if(typeof v==='number'){fail(Number.isFinite(v),'Nonfinite rule number');return String(v);}
 fail(typeof v==='string'&&v.length<=600&&!/[|\\\r\n]/.test(v),'Invalid Soar constant');
 return /^[a-zA-Z][a-zA-Z0-9:_*-]*$/.test(v)?v:'|'+v+'|';
};
export function compilePolicy(owner,rules,tuning){
 fail(idOK(owner)&&Array.isArray(rules)&&rules.length>0&&rules.length<=64,'Invalid policy owner/count');
 const names=new Set();return rules.map(r=>{
  fail(idOK(r.id)&&!names.has(r.id),'Duplicate/invalid rule id');names.add(r.id);
  fail(Number.isInteger(r.priority)&&r.priority>=1&&r.priority<=900,'Priority outside [1,900]');
  fail(typeof r.reason==='string'&&r.reason.length<=400,'Missing rule explanation');
  fail(r.select&&Object.keys(r.select).length>0,'A rule needs a candidate selector');
  if(r.select.action)fail(tuning.pack.actions[r.select.action],'Unknown selected action');
  const lhs=[`(state <s> ^superstate nil ^io <io>)`,`(<io> ^input-link <il>)`,`(<il> ^frame <f>)`,`(<f> ^mode foundation ^self ${symbol(owner)} ^available <a>)`];
  for(const [k,v] of Object.entries(r.select)){fail(CANDIDATE_FIELDS.includes(k),'Unknown candidate field '+k);lhs.push(`(<a> ^${k} ${symbol(v)})`);}
  for(const [i,c] of (r.when||[]).entries()){
   fail(i<24&&Object.hasOwn(operators,c.op||'eq'),'Invalid rule condition');
   if(c.scope==='memory'){
    fail(typeof c.key==='string'&&c.key.length<=150,'Invalid memory key');
    const field=c.field||'value';fail(['value','emotion','coping','intensity','predicate'].includes(field),'Invalid memory field');
    lhs.push(`(<f> ^known <m${i}>)`,`(<m${i}> ${c.key==='*'?'':`^key ${symbol(c.key)}`} ^${field} ${operators[c.op||'eq']}${symbol(c.value)})`);
    if(c.matchTarget)lhs.push(`(<m${i}> ^subject <subject${i}>)`,`(<a> ^target <subject${i}>)`);
    if(c.minIntensity!==undefined){fail(Number.isFinite(c.minIntensity)&&c.minIntensity>=0,'Invalid emotional threshold');lhs.push(`(<m${i}> ^intensity >= ${c.minIntensity})`);}
    if(c.maxAgeMinutes!==undefined){fail(Number.isFinite(c.maxAgeMinutes)&&c.maxAgeMinutes>=0,'Invalid memory age');lhs.push(`(<m${i}> ^age <= ${c.maxAgeMinutes})`);}
    if(c.status)lhs.push(`(<m${i}> ^status ${symbol(c.status)})`);
   }else if(c.scope==='candidate'){
    fail(CANDIDATE_FIELDS.includes(c.field),'Unknown candidate condition');lhs.push(`(<a> ^${c.field} ${operators[c.op||'eq']}${symbol(c.value)})`);
   }else{
    fail(c.scope==='self'&&selfFields(tuning).includes(c.field),'Unknown self field');
    lhs.push(`(<f> ^${c.field} ${operators[c.op||'eq']}${symbol(c.value)})`);
   }
  }
  const name=`learned*${owner}*${r.id}`;
  return `sp {${name}\n ${lhs.join('\n ')}\n -->\n (<s> ^operator <o> +)\n (<o> ^name choose ^choice <a> ^priority ${r.priority} ^rule ${name} ^reason ${symbol(r.reason)})\n}`;
 }).join('\n\n');
}
export function modelContract(tuning){return {
 version:CONTRACT_VERSION,ruleLanguage:'typed rules compiled into native Soar; do not return arbitrary code',candidateFields:CANDIDATE_FIELDS,selfFields:selfFields(tuning),conditionOperators:Object.keys(operators),
 memoryConditions:{fields:['value','emotion','coping','intensity','predicate'],key:'exact key or *',matchTarget:true,minIntensity:'optional'},
 goalSchema:{fields:['id','title','motive','priority','deadline','activeWhen','about','successWhen','abandonWhen','windowLabel','steps'],stepFields:['label','action','roles','args','until','repeatUntil','skipWhen','spacingMinutes','alternatives','blockedReason'],expression:{op:'eq/ne/lt/lte/gt/gte/exists/includes',left:'$knownByKey.subject:predicate or $relationships.person.trust or $clock.period',right:'literal'},wait:{until:{key:'personal memory key',value:'expected value'}},semantics:'Only personal knowledge is available. Action completion is not consent. Others decide independently. Use outcome checks and waits; never force another actor.'},
 cognition:tuning.pack.cognition||{},relationships:tuning.pack.relationships||{},
 reply:{requestId:'copy request.id',epoch:'copy',baseRevision:'copy',contentRevision:'copy',evidence:['observed event IDs from this request'],summary:'first-person reflection, grounded in evidence; may retain existing strategy',rules:[],retireRules:[],goals:[],cancelGoals:[],cognition:[{field:'mutable cognition field',delta:'bounded number',reason:'evidence-based reason'}]},
 actions:Object.fromEntries(Object.entries(tuning.pack.actions).map(([id,a])=>[id,{label:a.label,roles:a.roles,parameters:a.parameters,when:a.when,requires:a.requires,duration:a.duration,effects:a.effects.filter(e=>['speech.emit','offer.create','offer.resolve','group.create','session.open','knowledge.tell'].includes(e.type))}]))
};}
export class PolicyInbox {
 constructor(world){this.world=world;this.pending=new Map();this.serial=0;this.requests=[];this.claimed=new Set();this.failedUntil=new Map();}
 request(owner,reason,dependencies=[],meta={}){
  const w=this.world,existing=[...this.pending.values()].find(r=>r.owner===owner&&r.reason===reason);
  if(existing)return clone(existing);
  if(this.pending.size>=24||w.state.time<(this.failedUntil.get(owner+'|'+reason)||0))return null;
  const context=w.modelContext(owner,meta),request={id:`knowledge-${++this.serial}`,owner,reason,meta:clone(meta),epoch:w.epoch,baseRevision:w.brain.rev[owner],contentRevision:w.contentRevision,dependencies:dependencies.map(key=>({key,value:w.mind.get(owner,key)?.value??'unknown'})),context};
  this.pending.set(request.id,request);this.requests.push(clone(request));if(this.requests.length>32)this.requests.shift();return clone(request);
 }
 async apply(reply){
  const w=this.world,r=this.pending.get(reply.requestId);fail(r,'Unknown or cancelled knowledge request');
  fail(reply.epoch===r.epoch&&w.epoch===r.epoch,'Stale world generation');
  fail(reply.baseRevision===r.baseRevision&&w.brain.rev[r.owner]===r.baseRevision,'Stale policy revision');
  fail(reply.contentRevision===r.contentRevision&&w.contentRevision===r.contentRevision,'Stale content revision');
  for(const d of r.dependencies)fail((w.mind.get(r.owner,d.key)?.value??'unknown')===d.value,'Changed relevant knowledge: '+d.key);
  fail(Array.isArray(reply.evidence)&&reply.evidence.every(id=>r.context.events.some(e=>e.uid===id)),'Evidence outside the actor context');
  fail(JSON.stringify(reply).length<60000,'Reply too large');const rules=clone(reply.rules||[]),goals=clone(reply.goals||[]);
  fail(rules.length<=16,'Too many generated rules');
  const summary=reply.summary||'';fail(typeof summary==='string'&&summary.length<=1400,'Invalid reflection summary');
  const changes=validateEvolution(w,r.owner,reply.cognition||[],reply.evidence);
  const cancel=reply.cancelGoals||[],retire=reply.retireRules||[];fail(Array.isArray(cancel)&&cancel.length<=8&&Array.isArray(retire)&&retire.length<=16,'Invalid retirement');
  for(const id of cancel)fail(w.mind.goal(r.owner,id)&&reply.evidence.length,'Goal cancellation requires an owned goal and evidence');
  w.generatedRuleIds??={};const generated=w.generatedRuleIds[r.owner]||[];for(const id of retire)fail(generated.includes(id),'Cannot retire a base rule');
  fail(rules.length+goals.length+changes.length+cancel.length+retire.length>0||summary.length>0,'Empty patch');
  fail(goals.length<=8&&new Set(goals.map(g=>g.id)).size===goals.length,'Duplicate or excessive goals');
  for(const g of goals)w.validateGoal(r.owner,g);
  const prior=w.policyRules[r.owner]||[],byId=new Map(prior.filter(p=>!retire.includes(p.id)).map(p=>[p.id,p]));for(const rule of rules){fail(!byId.has(rule.id)||generated.includes(rule.id),'Cannot overwrite a base rule');byId.set(rule.id,rule);}
  const next=[...byId.values()],source=next.length?compilePolicy(r.owner,next,w.tuning):'';
  if(reply.source!==undefined)fail(reply.source===compilePolicy(r.owner,rules,w.tuning),'Source differs from validated rule declarations');
  // Native parser and a replay of the latest real candidate set gate installation.
  if(rules.length||retire.length)await w.brain.install(r.owner,source,{requestId:r.id,evidence:reply.evidence,contract:CONTRACT_VERSION});
  w.policyRules[r.owner]=next;w.generatedRuleIds[r.owner]=[...new Set(generated.filter(id=>!retire.includes(id)).concat(rules.map(p=>p.id)))];
  for(const id of cancel)w.mind.write(r.owner,{subject:id,predicate:'lifecycle',value:'superseded',root:reply.evidence[0]});
  applyEvolution(w,changes);
  for(const g of goals)w.addGoal(r.owner,g);
  finishReflection(w,r,summary);this.pending.delete(r.id);w.policyHistory.push({request:clone(r),reply:clone(reply),source,installedAt:w.state.time,revision:w.brain.rev[r.owner]});
  if(w.policyHistory.length>32)w.policyHistory.shift();return {owner:r.owner,revision:w.brain.rev[r.owner],source};
 }
 failRequest(id,message){const r=this.pending.get(id);if(!r)return;this.failedUntil.set(r.owner+'|'+r.reason,this.world.state.time+30);const job=this.world.state.social.reflections[r.meta?.job];if(job){job.status='failed';job.error=message;}this.pending.delete(id);this.claimed.delete(id);}
 cancelAll(){this.pending.clear();this.claimed.clear();}
}
