import {resolve,test,fail} from './tuning.js';

// Recipes are content. Goal definitions and execution stages live in each agent's SMem.
export function seedProjects(world){
 const cycle=Math.floor(world.state.time/10080);if(world.projectCycle===cycle)return;world.projectCycle=cycle;
 for(const a of Object.values(world.state.actors)){
  for(const [key,c] of Object.entries(world.tuning.pack.cognition||{})){
   const v=a.profile[key];fail(typeof v===c.type&&(c.type!=='number'||Number.isFinite(v)&&v>=c.min&&v<=c.max)&&(!c.values||c.values.includes(v)),'Invalid personal cognition: '+key);
  }
  for(const template of a.profile.projects||[]){
   const recipe=world.tuning.pack.projects?.[template];fail(recipe,'Unknown personal project');
   const id='project-'+template+'-'+cycle+'-'+a.id;if((world.state.goalKeys[a.id]||[]).includes(id))continue;
   const definition=structuredClone(recipe);
   for(const step of definition.steps)for(const method of [step,...(step.alternatives||[])]){method.roles=resolve(method.roles||{},{actor:a});method.args=resolve(method.args||{},{actor:a});}
   if(recipe.relativeProgress)for(const step of definition.steps)if(step.progress){const key=recipe.steps[definition.steps.indexOf(step)].progress.value.slice('$actor.resources.'.length),offset=a.resources[key]||0;const ceiling=world.tuning.pack.resources[key].max;step.progress.target=Math.min(ceiling,step.progress.target+offset);step.repeatUntil.right=step.progress.target;step.skipWhen.right=step.progress.target;}
   world.addGoal(a.id,{...definition,id,deadline:(cycle+1)*10080-1,origin:'personal-project'});
  }
 }
}
export const stepReady=(world,owner,g)=>!g.steps[g.stage]?.spacingMinutes||world.state.time-(world.mind.get(owner,g.uid.slice(5)+':last-step-'+g.stage)?.value??-Infinity)>=g.steps[g.stage].spacingMinutes;
export const goalMethods=g=>{const s=g.steps[g.stage];return s?[s,...(s.alternatives||[])]:[];};

// Observation view: reflects actual plan state and candidate availability, never invents a backstory.
export function describePlans(world,owner){
 const view=world.view(owner),task=world.state.tasks[owner],goals=world.mind.goals(owner);
 let options;const available=()=>options??=(world.candidates(owner,{ignoreBusy:true,advanceGoals:false}));
 return goals.filter(g=>g.status==='active'||g.origin==='personal-project'&&g.deadline>=world.state.time).map(g=>{
  const step=g.steps[g.stage];let status=g.status,reason='';
  if(status==='active'){
   if(!test(g.activeWhen,view)){status='scheduled';reason=g.windowLabel||'等待合适的时间，进度保留。';}
   else if(task?.candidate.goal===g.uid.slice(5)){status='running';reason=task.decision.reason;}
   else if(!stepReady(world,owner,g)){status='scheduled';reason='这轮练习已完成，下一次练习留到后一天；累计进度保留。';}
   else if(task){status='paused';reason='先完成'+world.tuning.pack.actions[task.candidate.action].label+'，之后继续。';}
   else if(!available().some(c=>c.goal===g.uid.slice(5))){status='blocked';reason=step?.blockedReason||'当前没有可执行步骤：等待前置条件、可见对象或可用设施。';}
   else {status='ready';reason='条件允许，等待与课程、约定及身体需求一起选择。';}
  }
  return {id:g.uid,title:g.title,motive:g.motive||'',origin:g.origin,stage:g.stage,total:g.steps.length,deadline:g.deadline,status,reason,steps:g.steps.map((s,i)=>({label:s.label||world.tuning.pack.actions[s.action]?.label||'等待约定结果',status:i<g.stage?'done':i===g.stage?'current':'later',methods:goalMethods({steps:[s],stage:0}).map(m=>world.tuning.pack.actions[m.action]?.label).filter(Boolean),progress:s.progress?{label:s.progress.label,value:resolve(s.progress.value,view),target:s.progress.target}:null}))};
 });
}
