import {clone,fail,idOK,test,validateExpression} from './tuning.js';

export function validateGoal(world,owner,g){
  fail(world.state.actors[owner]&&idOK(g.id)&&typeof g.title==='string'&&g.title.length<=200,'Invalid goal');
  if(g.priority!==undefined)fail(Number.isInteger(g.priority)&&g.priority>=1&&g.priority<=900,'Invalid goal priority');
  for(const k of ['activeWhen','successWhen','abandonWhen'])if(g[k])validateExpression(g[k]);
  if(g.motive!==undefined)fail(typeof g.motive==='string'&&g.motive.length<600,'Invalid motive');
  if(g.about!==undefined)fail(Array.isArray(g.about)&&g.about.every(x=>typeof x==='string'),'Invalid personal concern');
  if(g.deadline!==undefined)fail(Number.isFinite(g.deadline),'Invalid goal deadline');
  fail(!(world.state.goalKeys[owner]||[]).includes(g.id),'Goal ID already exists');
  fail(Array.isArray(g.steps)&&g.steps.length>0&&g.steps.length<=24,'Invalid goal steps');
  for(const step of g.steps){if(step.spacingMinutes!==undefined)fail(Number.isFinite(step.spacingMinutes)&&step.spacingMinutes>=0&&step.spacingMinutes<=10080,'Invalid practice spacing');if(step.alternatives)fail(Array.isArray(step.alternatives)&&step.alternatives.length<=8,'Too many alternative methods');for(const k of ['when','repeatUntil'])if(step[k])validateExpression(step[k]);
   for(const m of step.alternatives||[]){fail(world.tuning.pack.actions[m.action],'Unknown alternative');world.tuning.parameters(m.action,m.args||{});if(m.when)validateExpression(m.when);for(const k of Object.keys(m.roles||{}))fail(world.tuning.pack.actions[m.action].roles?.[k],'Invalid alternative role');}
   if(step.skipWhen)validateExpression(step.skipWhen);if(step.until){fail(typeof step.until.key==='string'&&['string','number','boolean'].includes(typeof step.until.value),'Invalid wait condition');continue;}
   fail(world.tuning.pack.actions[step.action],'Unknown goal action');world.tuning.parameters(step.action,step.args||{});
   for(const [role,id] of Object.entries(step.roles||{}))fail(world.tuning.pack.actions[step.action].roles?.[role]&&typeof id==='string','Invalid goal role');
  }
 }

export function addGoal(world,owner,g){
  world.validateGoal(owner,g);const uid='goal:'+g.id;
  world.mind.observe(owner,{uid,type:'foundation-goal',kind:'personal-plan',actor:owner,source:'self',time:world.state.time,definition:JSON.stringify({motive:g.motive||'',activeWhen:g.activeWhen,about:g.about||[],windowLabel:g.windowLabel||'',origin:g.origin||'generated',successWhen:g.successWhen,abandonWhen:g.abandonWhen}),title:g.title,deadline:g.deadline??world.state.time+1440,stepCount:g.steps.length,priority:g.priority??60,situation:g.situation||'none',situationPhase:g.situationPhase||'none'});
  for(const [i,step] of g.steps.entries()){
   const fields={};for(const [k,v] of Object.entries(step.roles||{}))fields['role-'+k]=v;for(const [k,v] of Object.entries(step.args||{}))fields['arg-'+k]=v;
   if(step.until)Object.assign(fields,{'until-key':step.until.key,'until-value':step.until.value});
   world.mind.observe(owner,{uid:uid+':step:'+i,type:'foundation-step',kind:'plan-step',actor:owner,source:'self',time:world.state.time,action:step.action,encoded:JSON.stringify(step),...fields});
  }
  world.state.goalKeys[owner]??=[];world.state.goalKeys[owner].push(g.id);
  world.mind.write(owner,{subject:g.id,predicate:'stage',value:0,root:uid});
 }

export function completeGoalStep(world,owner,id,stage,event){const g=world.mind.goal(owner,id);const e=world.state.events.find(e=>e.uid===event);if(e&&e.action!==g?.steps[stage]?.action)return;if(g?.stage===stage&&e?.action===g.steps[stage]?.action)world.mind.write(owner,{subject:id,predicate:'last-step-'+stage,value:world.state.time,root:event});if(g?.stage===stage&&(!g.steps[stage]?.repeatUntil||test(g.steps[stage].repeatUntil,world.view(owner))))world.mind.write(owner,{subject:id,predicate:'stage',value:stage+1,root:event});}

export function advanceWaitingGoals(world,owner,goals){for(const g of goals){if(g.status==='active'&&((g.successWhen&&test(g.successWhen,world.view(owner)))||(g.abandonWhen&&test(g.abandonWhen,world.view(owner))))){world.mind.write(owner,{subject:g.uid.slice(5),predicate:'lifecycle',value:g.status=g.successWhen&&test(g.successWhen,world.view(owner))?'completed':'abandoned',root:'condition:'+world.state.time});continue;}const step=g.steps[g.stage];if(g.status==='active'&&step&&(step.until&&world.mind.get(owner,step.until.key)?.value===step.until.value||step.skipWhen&&test(step.skipWhen,world.view(owner)))){world.completeGoalStep(owner,g.uid.slice(5),g.stage,'wait:'+g.uid+':'+g.stage);g.stage++;g.status=g.stage>=g.steps.length?'completed':'active';}}}
