import {initializeSocial,socialEvent,rememberContacts} from './social.js';
import {tickReflection,restoreReflection} from './reflection.js';
import {seedProjects} from './projects.js';
import {canDecide,allowsAutomatic} from './autonomy.js';
import {initializeResources,tickEnvironment} from './environment.js';
import {tickObligations} from './obligations.js';
import * as perception from './perception.js';
import * as affordances from './affordances.js';
import * as execution from './execution.js';
import * as goals from './goals.js';
import * as calendar from './calendar.js';
import * as situations from './situations.js';
import {Tuning,clone,fail,idOK,resolve,test} from './tuning.js';
import {createEffects} from './effects.js';
import {validateMap,canSee} from './space.js';
import {tickSessions} from './conversations.js';
import {PersonalMemory} from './memory.js';
import {PolicyInbox,modelContract} from './policy.js';

export class World {
 constructor({brain,content,scenario,saved}){
  this.brain=brain;this.effects=createEffects();this.tuning=new Tuning(saved?.content||content,this.effects);
  this.epoch=(saved?.epoch||0)+1;this.contentRevision=saved?.contentRevision||1;this.generatedRuleIds=clone(saved?.generatedRuleIds||{});this.policyRules=clone(saved?.policyRules||{});this.policyHistory=clone(saved?.policyHistory||[]);
  this.state=saved?clone(saved.state):{
   version:1,time:scenario.time??480,serial:0,rooms:clone(scenario.rooms),actors:{},objects:{},tasks:{},suspended:{},leases:{},sessions:{},offers:{},groups:{},appointments:{},events:[],answers:{},receipts:{},observed:{},memoryKeys:{},goalKeys:{},situationKeys:[],
   senses:clone(content.senses),limits:clone(content.limits),seed:scenario.seed||1,navigation:clone(content.navigation||null),
  };
  if(!saved){
   fail(scenario.actors.length<=11&&scenario.actors.filter(p=>p.controlled).length===1,'One player and at most ten NPCs');
   for(const a of scenario.actors){fail(idOK(a.id)&&!this.state.actors[a.id],'Invalid actor ID');this.state.actors[a.id]={presence:'here',pose:'standing',session:null,needs:clone(content.needs.initial),last:{},profile:{sensitivity:10,coping:'verify'},...clone(a)};}
   for(const o of scenario.objects)this.addObject(o);
  }
  initializeResources(this.state,this.tuning.pack);validateMap(this.state);this.mind=new PersonalMemory(this);this.inbox=new PolicyInbox(this);
  if(saved)this.brain.restore(saved.cognition);
  else for(const p of Object.values(this.state.actors)){
   this.brain.create(p.id);
   this.transaction(tx=>tx.emit('arrived',p.id,[p.id],{text:'进入场景。'}));
   for(const o of Object.values(this.state.objects))if(o.mapKnown){
    for(const [predicate,value] of Object.entries({room:o.room,x:o.x,z:o.z}))this.mind.write(p.id,{subject:o.id,predicate,value,root:'map:'+o.id+':'+predicate});
   }
  }
  this.state.situations??={};this.state.nextDecision??={};this.metrics={decisions:0,advanceMs:0};
  initializeSocial(this,scenario);restoreReflection(this);this.syncObjects();seedProjects(this);
 }
 addObject(o){
  fail(idOK(o.id)&&!this.state.objects[o.id],'Invalid/duplicate object');const type=this.tuning.pack.types[o.type];fail(type,'Unknown object type');
  const state={...clone(type.state||{}),...clone(o.state||{})};
  fail(Object.keys(state).every(k=>Object.hasOwn(type.state||{},k)&&typeof state[k]===typeof type.state[k]),'Undeclared object state');
  this.state.objects[o.id]={holder:null,owner:'none',...clone(o),tags:clone(type.tags),footprint:clone(type.footprint||null),colliders:clone(type.colliders||null),state};
 }
 extendContent(pack,objects=[]){
  const old=this.tuning,oldObjects=clone(this.state.objects);
  try{this.tuning=new Tuning(old.pack,this.effects).extend(pack);for(const o of objects)this.addObject(o);validateMap(this.state);initializeResources(this.state,this.tuning.pack);this.contentRevision++;}
  catch(e){this.tuning=old;this.state.objects=oldObjects;throw e;}
 }
 id(prefix){return prefix+'-'+(++this.state.serial);}
 syncObjects(){for(const o of Object.values(this.state.objects))if(o.holder){const p=this.state.actors[o.holder];Object.assign(o,{room:p.room,x:p.x,z:p.z});}}
 transaction(run){
  const draft=clone(this.state),events=[],after=[];
  const tx={world:this,state:draft,defer:fn=>after.push(fn),id:prefix=>prefix+'-'+(++draft.serial),visible:actor=>Object.keys(draft.actors).filter(id=>id===actor||canSee(draft,draft.actors[id],draft.actors[actor])),
   emit:(kind,actor,recipients,data={})=>{
    fail(typeof kind==='string'&&draft.actors[actor],'Invalid event');
    const uid='event-'+(++draft.serial),e={uid,kind,actor,room:draft.actors[actor].room,time:draft.time,...clone(data),recipients:[...new Set(recipients)].filter(id=>draft.actors[id])};events.push(e);return uid;
   },
  };
  tx.apply=(effects,context)=>{for(const raw of effects){
   const live={...context,actor:draft.actors[context.actor.id]};
   for(const [role,collection] of Object.entries({target:'actors',item:'objects',offer:'offers',group:'groups'}))if(context[role]?.id)live[role]=draft[collection][context[role].id];
   const e=resolve(raw,live),handler=this.effects.get(e.type);fail(handler,'Unknown primitive');handler.run(tx,live,e);
  }};
  const result=run(tx);draft.events.push(...events);this.state=draft;this.syncObjects();
  for(const event of events)this.deliver(event);for(const fn of after)fn();return result;
 }
 deliver(event){
  for(const owner of event.recipients){
   const self=event.actor===owner,spoken=['speech','information','proposal','cooperate','refuse'].includes(event.kind),source=self?'self':spoken||event.delivery==='notification'?'heard':'seen';
   // Event observer lists and private selection reasons are not copied to the character.
   const {recipients,...body}=event;this.mind.observe(owner,{...body,type:'event',source});
   if(event.claim){const c=event.claim;this.mind.write(owner,{...c,root:c.root||event.uid,source,speaker:event.actor});}
   if(['cooperate','refuse','brokenPromise'].includes(event.kind)&&!self)this.mind.emotion(owner,event.actor,event.offer||event.appointment||'interaction',event);
   if(this.state.social)socialEvent(this,event,owner);
  }
 }
 view(...args){return perception.view(this,...args);}
 context(...args){return affordances.context(this,...args);}
 roleBindings(...args){return affordances.roleBindings(this,...args);}
 candidates(...args){return affordances.candidates(this,...args);}
 facts(...args){return perception.facts(this,...args);}
 choose(owner){
  rememberContacts(this,owner);const options=this.candidates(owner);if(!options.length)return null;
  const facts=this.facts(owner);this.brain.inputs[owner]={facts:{self:owner,...facts},options:clone(options)};
  const decision=this.brain.transact(owner,facts,options),candidate=options.find(a=>a.id===decision.id);fail(candidate,'Soar returned a non-candidate command');
  this.brain.traces[owner]=decision;this.metrics.decisions++;this.state.waiting??={};delete this.state.waiting[owner];if(candidate.fallback&&candidate.utility>=900)this.state.waiting[owner]=candidate['utility-reason'];
  if(candidate.fallback){
   const pending=options.find(a=>['response','answer'].includes(a.category));
   if(pending)this.inbox.request(owner,pending.category==='response'?'unhandled-proposal:'+pending.offer:'unhandled-question:'+pending.message,pending.category==='response'?[pending.offer+':status']:[]);
  }
  return {candidate,decision};
 }
 control(owner,action,options={},commandId){fail(this.state.actors[owner]?.controlled,'Only the player-controlled actor can receive player commands');return this.perform(owner,action,options,commandId||this.id('player-command'));}
 perform(...args){return execution.perform(this,...args);}
 cancel(...args){return execution.cancel(this,...args);}
 execute(...args){return execution.execute(this,...args);}
 finish(...args){return execution.finish(this,...args);}
 tickTasks(...args){return execution.tickTasks(this,...args);}
 resumeTasks(...args){return execution.resumeTasks(this,...args);}
 advance(minutes,{autonomy=true,decisionBudget=Infinity}={}){
  fail(Number.isFinite(minutes)&&minutes>=0&&minutes<=10080,'Invalid advance duration');
  const started=performance.now();let remaining=minutes;while(remaining>1e-8){const dt=Math.min(remaining,this.tuning.pack.clock.step);remaining-=dt;this.state.time+=dt;
   for(const p of Object.values(this.state.actors))for(const [need,rate] of Object.entries(this.tuning.pack.needs.decay))p.needs[need]=Math.max(0,Math.min(100,p.needs[need]-rate*dt));
   seedProjects(this);tickEnvironment(this,dt);tickObligations(this,dt);this.tickTasks(dt);this.syncObjects();tickSessions(this,dt);this.resumeTasks();this.tickAppointments();this.tickSituations();tickReflection(this);
   const actors=Object.values(this.state.actors),cursor=this.state.decisionCursor||0;let decisionsLeft=decisionBudget;
   const priority=p=>{const task=this.state.tasks[p.id],period=perception.clockInfo(this);return (Object.values(this.state.sessions).some(s=>s.status==='open'&&s.members[p.id]?.status==='invited')?400:0)+(Object.values(this.tuning.pack.actions).some(a=>a.interruptWhen&&(!task||task.attention!=='block')&&(!task||a!==this.tuning.pack.actions[task.candidate.action])&&test(a.interruptWhen,{actor:p,clock:period}))?300:0)+(Math.min(...Object.values(p.needs))<15?200:0);};
   const order=Number.isFinite(decisionBudget)?actors.slice(cursor).concat(actors.slice(0,cursor)).sort((a,b)=>priority(b)-priority(a)):actors;
   if(autonomy)for(const p of order)if(p.presence==='here'&&canDecide(this,p.id)){
    const pendingInvite=Object.values(this.state.sessions).some(s=>s.status==='open'&&s.members[p.id]?.status==='invited');
    const task=this.state.tasks[p.id],minute=this.state.time%1440,period=this.tuning.pack.clock.periods.find(c=>minute>=c.start&&minute<c.end)?.id;
    const scheduleChange=task&&task.attention!=='block'&&Object.entries(this.tuning.pack.actions).some(([id,a])=>a.interruptWhen&&allowsAutomatic(this,p.id,a)&&id!==task.candidate.action&&test(a.interruptWhen,{actor:p,clock:perception.clockInfo(this)}));
    const situationDue=situations.situationDecisionDue(this,p.id);
    if(task&&!pendingInvite&&!scheduleChange&&!situationDue)continue;
    if(this.state.time+1e-7<(this.state.nextDecision[p.id]||0))continue;
    // Urgent schedule changes and invitations may exceed the ordinary budget; ordinary work stays round-robin.
    if(decisionsLeft<=0&&priority(p)===0)continue;
    if(situationDue){this.state.situationDecisionAt??={};this.state.situationDecisionAt[p.id]=this.state.time;}
    this.state.nextDecision[p.id]=this.state.time+this.tuning.pack.clock.step;decisionsLeft--;this.state.decisionCursor=(actors.findIndex(a=>a.id===p.id)+1)%actors.length;
    const choice=this.choose(p.id);if(choice&&!choice.candidate.fallback)this.execute(p.id,choice.candidate,this.id('autonomy'),choice.decision);
   }
  }this.metrics.advanceMs+=performance.now()-started;
 }
 validateGoal(...args){return goals.validateGoal(this,...args);}
 addGoal(...args){return goals.addGoal(this,...args);}
 completeGoalStep(...args){return goals.completeGoalStep(this,...args);}
 advanceWaitingGoals(...args){return goals.advanceWaitingGoals(this,...args);}
 tickAppointments(...args){return calendar.tickAppointments(this,...args);}
 tickSituations(...args){return situations.tickSituations(this,...args);}
 modelContext(owner,{day}={}){
  const view=this.view(owner),allowed=new Set(this.state.observed[owner]||[]);
  const meaningful=new Set(['social-act','cooperate','refuse','brokenPromise','commitment','commitment-fulfilled','proposal','information']);
  const observed=this.state.events.filter(e=>allowed.has(e.uid)&&(day===undefined||Math.floor(e.time/1440)===day));
  const selected=[...observed.filter(e=>meaningful.has(e.kind)).slice(-24),...observed.filter(e=>!meaningful.has(e.kind)&&!['arrived','action-cancelled'].includes(e.kind)).slice(-16)];
  const events=selected.sort((a,b)=>a.time-b.time).map(({recipients,reason,rule,...e})=>e);
  return {actor:owner,time:this.state.time,profile:clone(view.actor.profile),facts:this.facts(owner),relationships:view.relationships,contacts:view.contacts,map:Object.entries(this.state.rooms).map(([id,r])=>({id,name:r.name,connections:r.connections})),available:this.candidates(owner,{advanceGoals:false}).slice(0,32).map(({key,...c})=>c),goals:this.mind.goals(owner).slice(-10).map(({definition,type,source,actor,kind,...g})=>g),previousReflections:this.policyHistory.filter(h=>h.request.owner===owner).slice(-2).map(h=>({time:h.installedAt,summary:h.reply.summary})),events,currentRules:clone(this.policyRules[owner]||[]),contract:modelContract(this.tuning)};
 }
 save(){return {version:1,epoch:this.epoch,contentRevision:this.contentRevision,content:clone(this.tuning.pack),state:clone(this.state),generatedRuleIds:clone(this.generatedRuleIds),policyRules:clone(this.policyRules),policyHistory:clone(this.policyHistory),cognition:this.brain.snapshot()};}
 destroy(){this.inbox.cancelAll();this.brain.destroy();}
}
