import {validateSocialTuning} from './social.js';
// Content vocabulary and pure declarative evaluation. No character or story IDs.
export const clone=x=>structuredClone(x);
export const list=x=>x==null?[]:Array.isArray(x)?x:[x];
export const fail=(ok,message)=>{if(!ok)throw new Error(message);};
export const idOK=s=>typeof s==='string'&&/^[a-z][a-z0-9:_-]{0,79}$/.test(s);
const forbidden=new Set(['__proto__','constructor','prototype']);
export function path(object,key){
 if(!key)return object;
 return key.split('.').reduce((o,k)=>forbidden.has(k)?undefined:o?.[k],object);
}
export function resolve(value,context){
 if(typeof value==='string'&&value.startsWith('$'))return path(context,value.slice(1));
 if(Array.isArray(value))return value.map(v=>resolve(v,context));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,context)]));
 return value;
}
const comparisons={eq:(a,b)=>a===b,ne:(a,b)=>a!==b,lt:(a,b)=>a<b,lte:(a,b)=>a<=b,gt:(a,b)=>a>b,gte:(a,b)=>a>=b,includes:(a,b)=>Array.isArray(a)&&a.includes(b),exists:a=>a!==undefined&&a!==null};
export function test(expression,context){
 if(expression===undefined)return true;
 if(expression.all)return expression.all.every(e=>test(e,context));
 if(expression.any)return expression.any.some(e=>test(e,context));
 if(expression.not)return !test(expression.not,context);
 const left=resolve(expression.left,context),right=resolve(expression.right,context);
 if(expression.op!=='exists'&&(left===undefined||right===undefined))return false;
 return comparisons[expression.op](left,right);
}
export function validateExpression(e,depth=0){
 fail(depth<12&&e&&typeof e==='object','Invalid/deep condition');
 if(e.all||e.any){const a=e.all||e.any;fail(Array.isArray(a)&&a.length<=24,'Invalid condition list');a.forEach(x=>validateExpression(x,depth+1));}
 else if(e.not)validateExpression(e.not,depth+1);
 else fail(Object.hasOwn(comparisons,e.op)&&Object.hasOwn(e,'left'),'Unknown condition operator');
}
export function orderedRoles(roles={}){
 const pending=new Map(Object.entries(roles)),done=new Set(),out=[];
 while(pending.size){let progress=false;
  for(const [name,spec] of pending){
   const deps=[...JSON.stringify(spec.where||{}).matchAll(/\$(target|item|offer|invitation|group|message|situation|obligation)\./g)].map(m=>m[1]);
   fail(deps.every(d=>Object.hasOwn(roles,d)),'Condition references an undeclared role');
   if(!deps.every(d=>done.has(d)))continue;
   out.push([name,spec]);done.add(name);pending.delete(name);progress=true;
  }
  fail(progress,'Cyclic role bindings');
 }return out;
}
function safeJSON(value){
 fail(JSON.stringify(value).length<500000,'Content pack too large');
 const walk=v=>{if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){fail(!forbidden.has(k),'Unsafe content key');walk(x);}};walk(value);
}
export class Tuning {
 constructor(pack,effects){this.pack=clone(pack);this.effects=effects;this.validate();}
 validate(){
  const p=this.pack;safeJSON(p);validateSocialTuning(p);fail(p.version===1&&idOK(p.id),'Unknown tuning version/id');
  for(const key of ['types','actions','proposals','predicates'])fail(p[key]&&typeof p[key]==='object','Missing tuning '+key);
  for(const [id,c] of Object.entries(p.cognition||{}))fail(idOK(id)&&typeof c.label==='string'&&['number','string'].includes(c.type),'Invalid cognition field');
  for(const [id,g] of Object.entries(p.projects||{})){fail(idOK(id)&&typeof g.title==='string'&&Array.isArray(g.steps)&&g.steps.length>0&&g.steps.length<=24,'Invalid project');if(g.activeWhen)validateExpression(g.activeWhen);for(const s of g.steps){fail(p.actions[s.action]||s.until,'Invalid project action');for(const k of ['when','skipWhen','repeatUntil'])if(s[k])validateExpression(s[k]);for(const a of s.alternatives||[]){fail(p.actions[a.action],'Invalid alternative');if(a.when)validateExpression(a.when);}}}
  for(const [id,r] of Object.entries(p.resources||{}))fail(idOK(id)&&[r.min,r.max,r.initial].every(Number.isFinite)&&r.min<=r.initial&&r.initial<=r.max&&(!r.daily||Number.isFinite(r.daily.at)&&r.daily.at>=0&&r.daily.at<1440&&Number.isFinite(r.daily.amount)),'Invalid personal resource');
  const effectList=effects=>{fail(Array.isArray(effects)&&effects.length<=20,'Invalid effect list');for(const e of effects){fail(this.effects.has(e.type),'Unknown effect primitive: '+e.type);this.effects.get(e.type).validate?.(e);}};
  for(const [id,spec] of Object.entries(p.types)){fail(idOK(id)&&Array.isArray(spec.tags),'Invalid object type');fail(!spec.slots||spec.slots.every(s=>idOK(s.id)&&Number.isFinite(s.x)&&Number.isFinite(s.z)&&typeof s.pose==='string'),'Invalid interaction slots');
   for(const s of spec.slots||[])fail((!s.approach||Number.isFinite(s.approach.x)&&Number.isFinite(s.approach.z))&&(s.facing===undefined||Number.isFinite(s.facing)),'Invalid slot approach/facing');
   if(spec.colliders)fail(Array.isArray(spec.colliders)&&spec.colliders.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.z)&&c.w>0&&c.d>0&&Number.isFinite(c.w)&&Number.isFinite(c.d)),'Invalid colliders');
   for(const [field,c] of Object.entries(spec.decay||{}))fail(Number.isFinite(spec.state[field])&&[c.rate,c.min,c.max].every(Number.isFinite)&&c.min<=c.max,'Invalid object decay');
   for(const c of spec.service||[])fail(c.at>=0&&c.at<1440&&c.set&&Object.entries(c.set).every(([k,v])=>Object.hasOwn(spec.state,k)&&typeof v===typeof spec.state[k]),'Invalid facility service');
  }
  for(const [id,spec] of Object.entries(p.actions)){
   fail(idOK(id)&&typeof spec.label==='string','Invalid action id/label');
   fail(['instant','physical','speech'].includes(spec.executor),'Unknown action executor');
   fail(Number.isFinite(spec.duration)&&spec.duration>=0&&spec.duration<=480,'Invalid duration');
   fail(Number.isFinite(spec.cooldown||0)&&(spec.cooldown||0)>=0,'Invalid cooldown');
   fail(['none','pause','block'].includes(spec.attention||'none'),'Invalid attention mode');
   for(const [role,b] of Object.entries(spec.roles||{})){
    fail(['target','item','offer','invitation','group','message','situation','obligation'].includes(role),'Unknown role '+role);
    fail(['actors','objects','offers','invitations','groups','messages','situations','obligations','contacts'].includes(b.from),'Unknown binding source');
    if(b.where)validateExpression(b.where);
   }
   orderedRoles(spec.roles);
   for(const r of spec.requirements||[]){validateExpression(r.when);fail(typeof r.reason==='string','Missing requirement reason');}
   if(spec.transition){fail(p.actions[spec.transition.action]&&p.actions[spec.transition.action].slot===spec.slot,'Invalid continuation');validateExpression(spec.transition.when);}
   if(spec.repeatUntilPeriodEnd)fail(spec.stopAtPeriodEnd&&spec.duration>0,'Repeating actions require a period boundary');
   if(spec.animation)fail(typeof spec.animation.clip==='string','Invalid animation');if(spec.motion)fail(Array.isArray(spec.motion.loop)&&spec.motion.loop.length>=2&&spec.motion.loop.length<=32&&spec.motion.loop.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)),'Invalid motion loop');if(spec.interruptWhen)validateExpression(spec.interruptWhen);if(spec.when)validateExpression(spec.when);if(spec.requires)validateExpression(spec.requires);effectList(spec.effects);
   for(const [name,param] of Object.entries(spec.parameters||{})){fail(idOK(name)&&['string','number','boolean'].includes(param.type),'Invalid parameter');}
  }
  for(const [id,spec] of Object.entries(p.proposals)){fail(idOK(id),'Invalid proposal');effectList(spec.accept||[]);effectList(spec.decline||[]);if(spec.interruptWhen)validateExpression(spec.interruptWhen);if(spec.when)validateExpression(spec.when);}
  for(const [id,spec] of Object.entries(p.predicates)){fail(idOK(id)&&['string','number','boolean'].includes(spec.type),'Invalid predicate');}
  for(const rule of p.routines||[]){fail(idOK(rule.id)&&p.actions[rule.action],'Invalid routine');validateExpression(rule.when);}
  for(const o of p.obligations||[]){
   fail(idOK(o.id)&&typeof o.label==='string'&&typeof o.room==='string'&&p.clock.periods.some(p=>p.id===o.period),'Invalid obligation');
   validateExpression(o.members);validateExpression(o.supervisor);
   fail(o.grace>=0&&o.absentAfter>o.grace&&Array.isArray(o.actions)&&Array.isArray(o.supervisorActions)&&[...o.actions,...o.supervisorActions,o.remedyAction].every(a=>p.actions[a]),'Invalid obligation work/thresholds');
   fail(!o.weekdays||o.weekdays.every(n=>Number.isInteger(n)&&n>=0&&n<7),'Invalid weekdays');
   fail(['reminder','absence','assigned','returned','remedied'].every(k=>typeof o.text?.[k]==='string'),'Missing obligation messages');
  }
  for(const s of p.situations||[]){
   fail(idOK(s.id)&&Number.isFinite(s.at),'Invalid situation');
   if(!s.phases){fail(Array.isArray(s.seeds),'Invalid situation seed');for(const seed of s.seeds)fail(idOK(seed.actor)&&seed.claim&&typeof seed.claim.subject==='string'&&typeof seed.claim.predicate==='string','Invalid private situation fact');continue;}
   fail(s.duration>0&&s.duration<=480&&s.phases[s.initial]&&s.cast&&typeof s.room==='string','Invalid situation lifecycle');
   if(s.repeat!==undefined)fail(s.repeat>=s.duration,'Invalid situation recurrence');
   for(const r of Object.values(s.cast))fail(idOK(r.actor),'Invalid cast');
   for(const e of Object.values(s.signals||{}))validateExpression(e);
   for(const phase of Object.values(s.phases)){
    for(const t of phase.transitions||[]){validateExpression(t.when);fail(t.result||s.phases[t.next],'Unknown situation phase');}
    for(const [role,plan] of Object.entries(phase.plans||{})){fail(s.cast[role]&&Array.isArray(plan.steps)&&plan.steps.length<=24&&typeof plan.title==='string','Invalid role plan');for(const step of plan.steps){fail(p.actions[step.action]||step.until,'Unknown situation action');if(step.skipWhen)validateExpression(step.skipWhen);}}
   }
  }
  fail((p.clock?.step||.5)>0&&(p.clock?.step||.5)<=1,'Clock step must be in (0,1]');
  return this;
 }
 parameters(action,args={}){
  const spec=this.pack.actions[action];fail(spec,'Unknown action '+action);
  fail(Object.keys(args).every(k=>Object.hasOwn(spec.parameters||{},k)),'Undeclared action parameter');
  const out={};for(const [k,s] of Object.entries(spec.parameters||{})){
   const v=args[k]??s.default;fail(v!==undefined&&typeof v===s.type,'Parameter type: '+k);
   if(s.type==='number')fail(Number.isFinite(v)&&(s.min===undefined||v>=s.min)&&(s.max===undefined||v<=s.max),'Parameter bounds: '+k);
   if(s.type==='string')fail(v.length<8000,'Parameter too long');
   if(s.enum)fail(s.enum.includes(v),'Parameter enum: '+k);out[k]=v;
  }return out;
 }
 extend(addition){
  const pack=clone(this.pack);safeJSON(addition);
  for(const key of ['types','actions','proposals','predicates','resources','cognition','projects','relationships'])for(const [id,spec] of Object.entries(addition[key]||{})){pack[key]??={};fail(!pack[key][id],'Content ID already registered: '+id);pack[key][id]=clone(spec);}
  for(const key of ['routines','situations','obligations','appraisals'])for(const spec of addition[key]||[]){pack[key]??=[];fail(!pack[key].some(s=>s.id===spec.id),'Content ID already registered: '+spec.id);pack[key].push(clone(spec));}
  for(const k of Object.keys(addition))fail(['id','types','actions','proposals','predicates','resources','cognition','projects','relationships','routines','situations','obligations','appraisals'].includes(k),'Unsupported extension section '+k);
  const next=new Tuning(pack,this.effects);this.pack=next.pack;return this;
 }
 describe(){return clone({version:this.pack.version,id:this.pack.id,types:this.pack.types,actions:this.pack.actions,cognition:this.pack.cognition||{},projects:this.pack.projects||{},resources:this.pack.resources||{},proposals:this.pack.proposals,predicates:this.pack.predicates,routines:this.pack.routines||[],obligations:this.pack.obligations||[],effects:[...this.effects.keys()]});}
}
