import {roomPath} from './space.js';
import {goalMethods,stepReady} from './projects.js';
import {allowsAutomatic} from './autonomy.js';
import {allowsDuringTask} from './participation.js';
import {activityTime} from './timing.js';
import {accessReason,requirementReason} from './environment.js';
import {clone,fail,resolve,test,orderedRoles} from './tuning.js';

export function context(world,owner,bindings={},args={}){return {...world.view(owner),...bindings,args};}

export function roleBindings(world,owner,spec,explicit,view=world.view(owner)){
  let combos=[{}];
  for(const [name,rule] of orderedRoles(spec.roles)){
   const values=view[rule.from].filter(v=>explicit?.[name]===undefined||v.id===explicit[name]);const next=[];
   for(const prior of combos)for(const v of values){const c={...view,...prior,[name]:v,bound:v};if(test(rule.where,c))next.push({...prior,[name]:v});}
   combos=next;fail(combos.length<=256,'Action binding budget exceeded');
  }return combos;
 }

export function candidates(world,owner,{action,roles,args,ignoreBusy=false,advanceGoals=true}={}){
  const s=world.state,p=s.actors[owner],out=[],blockedNeeds=new Set(),goals=world.mind.goals(owner),view=world.view(owner);if(advanceGoals)world.advanceWaitingGoals(owner,goals);
  for(const [name,spec] of Object.entries(world.tuning.pack.actions)){
   if(action&&name!==action)continue;
   if(!action&&!allowsAutomatic(world,owner,spec))continue;
   if(s.tasks[owner]&&!ignoreBusy&&!spec.fallback&&spec.category!=='invitation'&&!allowsDuringTask(spec,s.tasks[owner])&&!(spec.interruptWhen&&s.tasks[owner].attention!=='block'&&s.tasks[owner].candidate.action!==name&&test(spec.interruptWhen,view)))continue;
   if(p.session&&spec.executor==='physical'&&spec.attention!=='none')continue;
   const variants=[{roles,args},...goals.filter(g=>g.status==='active'&&test(g.activeWhen,view)&&stepReady(world,owner,g)).flatMap(g=>goalMethods(g).filter(m=>m.action===name&&test(m.when,view)).map(m=>({roles:m.roles,args:m.args,goal:g})))];
   for(const variant of variants)for(const bindings of world.roleBindings(owner,spec,variant.roles,view)){
    let parameters;try{parameters=world.tuning.parameters(name,resolve(variant.args||{},{...view,...bindings}));}catch{continue;}
    const c={...view,...bindings,args:parameters};if(!test(spec.when,c))continue;
    const anchor=resolve(spec.anchor,c);
    if(anchor?.room&&accessReason(s,p,anchor.room)||requirementReason(spec,c))continue;
    if(spec.slot&&bindings.item){const slots=world.tuning.pack.types[s.objects[bindings.item.id]?.type]?.slots||[];if(!slots.some(slot=>slot.tags?.includes(spec.slot)&&!s.leases[bindings.item.id+':'+slot.id])){if(spec.need&&p.needs[spec.need]<15)blockedNeeds.add(spec.need);continue;}}
    const unknownRequirement=[...JSON.stringify(spec.requires||{}).matchAll(/\$[a-zA-Z0-9_.-]+/g)].some(m=>resolve(m[0],c)===undefined);
    if(!unknownRequirement&&!test(spec.requires,c))continue;
    if(!action&&!(spec.need&&p.needs[spec.need]<15)&&activityTime(world,owner,spec,c)?.fits===false)continue;
    const roleIDs=Object.fromEntries(Object.entries(bindings).map(([k,v])=>[k,v.id]));
    const key=JSON.stringify([name,roleIDs,parameters]);const routines=(world.tuning.pack.routines||[]).filter(r=>r.action===name&&test(r.when,c)&&(r.repeat||s.time-(p.last['routine:'+r.id+':'+c.clock.day]??-Infinity)>1440));
    if(!routines.some(r=>r.repeat)&&(p.last[key]??-Infinity)+(spec.cooldown||0)>s.time)continue;
    const target=bindings.target?.id||bindings.item?.id||(bindings.offer?(bindings.offer.to===owner?bindings.offer.from:bindings.offer.to):null)||bindings.invitation?.from||'none';
    let utility=0;
    if(spec.need){const deficit=100-p.needs[spec.need];if(deficit>=(spec.needThreshold||35))utility=deficit*.4;if(p.needs[spec.need]<15)utility=950+deficit;}
    for(const r of routines)utility=Math.max(utility,r.priority||100);
    if(spec.defaultPriority)utility=Math.max(utility,spec.defaultPriority);
    if(spec.localPreference&&anchor){utility-=anchor.room===p.room?Math.hypot(anchor.x-p.x,anchor.z-p.z)*.08:spec.localPreference;}
    const path=anchor?.room&&roomPath(s.rooms,p.room,anchor.room);if(anchor?.room&&!path)continue;
    const goalPriority=variant.goal?(variant.goal.priority||60)-(anchor?.room===p.room?Math.min(1,Math.hypot(anchor.x-p.x,anchor.z-p.z)*.02):(path?.length||1)*1.2):60;
    const old=out.find(a=>a.key===key);if(old){if(variant.goal&&(!old['goal-step']||goalPriority>old['goal-priority'])){old.goal=variant.goal.uid.slice(5);old['goal-step']=true;old.goalStage=variant.goal.stage;old['goal-priority']=goalPriority;old['goal-title']=variant.goal.title+'：'+(variant.goal.steps[variant.goal.stage].label||spec.label);old.situation=variant.goal.situation||'none';}continue;}
    out.push({id:'candidate-'+out.length,key,kind:name,action:name,target,roles:roleIDs,args:parameters,item:bindings.item?.id||bindings.offer?.item||'none',offer:bindings.offer?.id||'none','offer-kind':bindings.offer?.kind||'none',obligation:bindings.obligation?.id||'none','obligation-status':bindings.obligation?.remedy||'none','offer-status':bindings.offer?.status||'none',invitation:bindings.invitation?.id||'none',group:bindings.group?.id||'none',message:bindings.message?.id||'none','message-key':bindings.message?.key||'none','target-role':bindings.target?.role||'none',category:spec.category||'ordinary',...Object.fromEntries(Object.entries(view.relationships[target]||{}).filter(([k,v])=>typeof v==='number').map(([k,v])=>['target-'+k,v])),'session-size':view.session?.active.length||0,utility,'utility-reason':routines.sort((a,b)=>b.priority-a.priority)[0]?.reason||spec.reason||(spec.need?'照顾身体：'+spec.label:'按当前作息行动。'),'goal-priority':goalPriority,'goal-title':variant.goal?variant.goal.title+'：'+(variant.goal.steps[variant.goal.stage].label||spec.label):'',situation:bindings.situation?.id||variant.goal?.situation||'none','situation-role':bindings.situation?.role||'none',fallback:!!spec.fallback,goal:variant.goal?.uid.slice(5)||'none','goal-step':!!variant.goal,goalStage:variant.goal?.stage??-1,ordinal:out.length});
   }
  }
  if(!action&&blockedNeeds.size&&!out.some(c=>blockedNeeds.has(world.tuning.pack.actions[c.action].need))){
   for(const c of out.filter(c=>c.fallback)){c.utility=1000;c['utility-reason']='需求很急，等可用设施空出来。';}
  }
  return out;
 }
