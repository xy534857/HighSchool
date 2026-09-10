import {claimReflection,reflectionState} from '../foundation/reflection.js';
import {relationship} from '../foundation/social.js';
import {describePlans} from '../foundation/projects.js';
import {createFoundation,compilePolicy,encodeFoundationSave,decodeFoundationSave} from '../foundation/index.js';
import {controlState} from '../foundation/autonomy.js';
import {upgradeSpatialSave} from './spatial-upgrade.js';
import {upgradeCampusSave} from './campus-upgrade.js';
import {upgradeClassroomSave} from './classroom-upgrade.js';
import {allowsDuringTask} from '../foundation/participation.js';
import {accessReason,requirementReason} from '../foundation/environment.js';
import {resolve,test} from '../foundation/tuning.js';

export class SchoolService {
 constructor(world){this.world=world;this.queue=[];this.notices=[];this.player=Object.values(world.state.actors).find(p=>p.controlled).id;this.serial=0;}
 static async create({read,wasmBinary,saved}={}){
  const json=async path=>JSON.parse(await (read?read('../'+path):fetch(new URL('../'+path,import.meta.url)).then(r=>r.text())));
  const [content,scenario,policies]=await Promise.all(['content/school-tuning.json','content/school-scene.json','content/school-policies.json'].map(json));
  const restored=saved?decodeFoundationSave(saved):undefined;
  // Versioned additive upgrade keeps runtime-authored rules, goals and memories.
  if(restored&&(restored.content.schoolRevision||0)<2){
   const old=restored.content;
   for(const id of content.schoolUpgradeActions)old.actions[id]=structuredClone(content.actions[id]);
   old.routines=old.routines.filter(r=>!content.routines.some(n=>n.id===r.id)).concat(content.routines);
   Object.assign(old,{control:content.control,obligations:content.obligations,schoolUI:content.schoolUI,schoolRevision:2});
   restored.contentRevision++;
  }
  let socialUpgraded=false;
  if(restored&&(restored.content.socialRevision||0)<(content.socialRevision||0)){
   const c=restored.content;for(const key of ['actions','proposals','cognition','projects'])Object.assign(c[key],structuredClone(content[key]));
   for(const key of ['relationships','appraisals','reflection','socialRevision'])c[key]=structuredClone(content[key]);
   for(const p of scenario.actors){const a=restored.state.actors[p.id];for(const k of Object.keys(content.cognition))a.profile[k]??=p.profile[k];a.profile.projects=[...new Set([...a.profile.projects,...p.profile.projects])];}
   restored.contentRevision++;socialUpgraded=true;
  }
  const campusUpgraded=upgradeCampusSave(restored,content,scenario);
  const spatialUpgraded=upgradeSpatialSave(restored,content,scenario)||campusUpgraded;
  const classroomUpgraded=upgradeClassroomSave(restored,content);
  const world=await createFoundation({read,wasmBinary,content,scenario,saved:restored});
  if(spatialUpgraded)for(const a of Object.values(world.state.actors))for(const o of Object.values(world.state.objects).filter(o=>o.mapKnown))for(const key of ['room','x','z'])world.mind.write(a.id,{subject:o.id,predicate:key,value:o[key],root:'map:'+o.id+':'+key});
  for(const p of scenario.actors.filter(a=>!saved||campusUpgraded||socialUpgraded||classroomUpgraded||!world.policyRules[a.id]?.length)){
   const authored=saved&&classroomUpgraded&&!campusUpgraded&&!socialUpgraded&&world.policyRules[p.id]?.length?policies.common.filter(r=>r.id.startsWith('classroom-')):policies.common.concat(policies.people[p.id]||[]);
   const rules=authored.concat((world.policyRules[p.id]||[]).filter(r=>!authored.some(n=>n.id===r.id)&&r.id!=='social-initiate'));
   await world.brain.install(p.id,compilePolicy(p.id,rules,world.tuning),{source:'authored-school-policy'});world.policyRules[p.id]=rules;
  }
  const service=new SchoolService(world);if(saved){const data=JSON.parse(saved);service.queue=data.playerQueue||[];service.serial=data.commandSerial||0;}controlState(world,service.player).queued=service.queue.length;return service;
 }
 enqueue(action,roles={},args={}){
  if(this.queue.length>=5)return {ok:false,reason:'最多安排五个行动，请先完成或取消。'};
  if(!this.world.tuning.pack.actions[action])return {ok:false,reason:'这个交互不存在。'};
  const dest=args.room||this.world.state.objects[roles.item]?.room,denied=dest&&accessReason(this.world.state,this.world.state.actors[this.player],dest);if(denied)return {ok:false,reason:denied};
  const command={id:'ui-'+this.world.epoch+'-'+(++this.serial)+'-'+Math.floor(this.world.state.time*100),action,roles,args};this.queue.push(command);controlState(this.world,this.player).queued=this.queue.length;this.pump();return {ok:true,queued:true,id:command.id};
 }
 pump(){
  const w=this.world,owner=this.player,c=controlState(w,owner);
  c.queued=this.queue.length;if(!this.queue.length)return;
  const command=this.queue[0],spec=w.tuning.pack.actions[command.action];
  const active=w.state.tasks[owner]||w.state.suspended[owner];
  if(active&&!allowsDuringTask(spec,active)){if(active.decision?.rule==='player'||active.attention==='block')return;w.cancel(owner,'玩家接管了当前自主行动。');if(w.state.tasks[owner])return;}
  if(spec.executor==='physical'&&w.state.actors[owner].session){w.perform(owner,'leave-conversation');c.manualSession=null;}
  if(spec.executor==='speech'&&w.state.actors[owner].session&&!w.view(owner).actor.hasFloor)return;
  const r=w.control(owner,command.action,{roles:command.roles,args:command.args},command.id);this.queue.shift();
  const live=controlState(w,owner);live.queued=this.queue.length;
  if(r.ok){if(spec.autonomyGroup)delete live.deferred[spec.autonomyGroup];live.holdUntil=w.state.time+(w.tuning.pack.control?.manualGrace||2);live.manualSession=w.state.actors[owner].session;}
  if(!r.ok)this.notices.push({id:command.id,text:this.failure(r.reason),error:true});
 }
 advance(minutes){for(let n=0;n<minutes;n+=.5){this.pump();this.world.advance(Math.min(.5,minutes-n),{decisionBudget:2});this.pump();}return this.snapshot({staticContent:false});}
 cancel(id){
  if(id)this.queue=this.queue.filter(c=>c.id!==id);
  else{this.queue=[];this.world.cancel(this.player,'玩家取消');}
  const c=controlState(this.world,this.player);c.queued=this.queue.length;c.holdUntil=this.world.state.time+(this.world.tuning.pack.control?.cancelGrace||3);
  return this.snapshot();
 }
 setAutonomy(enabled){
  const w=this.world,c=controlState(w,this.player);c.enabled=!!enabled;c.holdUntil=w.state.time;
  if(!enabled&&w.state.tasks[this.player]?.decision?.rule!=='player')w.cancel(this.player,'已关闭自主行动。');
  return this.snapshot();
 }
 failure(reason){return ({'Resource occupied':'这个位置有人使用，稍后再试。','No executable candidate':'条件已经变化：请检查距离、谈话状态或冷却时间。','Unreachable':'这里无法到达，请换一个位置。','Candidate expired':'目标状态已变化，请重新选择。','Actor busy':'先完成当前行动。','Interaction target moved':'对方离开了原来的位置，请重新接近。'})[reason]||reason;}
 menu(selection){
  const w=this.world,v=w.view(this.player),rows=[];
  const preview={...v,actor:{...v.actor,busy:false,hasFloor:!!v.actor.session}};
  for(const [id,spec] of Object.entries(w.tuning.pack.actions)){
   if(spec.ui?.visible===false||spec.fallback)continue;
   for(const bindings of w.roleBindings(this.player,spec,undefined,v)){
    const hasSelected=selection?.kind==='object'?bindings.item?.id===selection.id:selection?.kind==='actor'?bindings.target?.id===selection.id||bindings.offer?.from===selection.id||bindings.offer?.to===selection.id||bindings.invitation?.from===selection.id:false;
    if(!hasSelected)continue;
    let args;try{args=w.tuning.parameters(id,{});}catch{continue;}
    if(Object.hasOwn(args,'due'))args.due=w.state.time+60;
    const context={...preview,...bindings,args};
    if(!test(spec.when,context))continue;
    const actual=w.context(this.player,bindings,args),key=JSON.stringify([id,Object.fromEntries(Object.entries(bindings).map(([k,b])=>[k,b.id])),args]);
    const cooldown=Math.max(0,(v.actor.last[key]??-Infinity)+(spec.cooldown||0)-w.state.time);
    let disabled='',detail=spec.duration?spec.duration+' 分钟':'即时';
    if(cooldown>0)disabled='稍等 '+Math.ceil(cooldown)+' 分钟';
    const unknown=[...JSON.stringify(spec.requires||{}).matchAll(/\$[a-zA-Z0-9_.-]+/g)].some(m=>resolve(m[0],actual)===undefined);
    if(!test(spec.requires,actual)&&!unknown)disabled=spec.ui?.unavailable||'材料或资源不足';
    if(unknown)detail='抵达后确认材料';
    if(spec.slot&&bindings.item){const o=w.state.objects[bindings.item.id],slots=w.tuning.pack.types[o.type].slots?.filter(s=>s.tags.includes(spec.slot))||[];if(slots.length&&slots.every(s=>w.state.leases[o.id+':'+s.id]))disabled='使用中';}
    disabled=accessReason(w.state,v.actor,bindings.item?.room||v.actor.room)||requirementReason(spec,actual)||disabled;
    if(spec.ui?.hint)detail+=' · '+spec.ui.hint;
    rows.push({action:id,label:spec.label,roles:Object.fromEntries(Object.entries(bindings).map(([k,b])=>[k,b.id])),args,duration:spec.duration,detail,disabled,category:spec.ui?.category||'交互'});
   }
  }return rows.filter((r,i,a)=>a.findIndex(x=>x.action===r.action&&JSON.stringify(x.roles)===JSON.stringify(r.roles))===i);
 }
 claimInference(){let request=[...this.world.inbox.pending.values()].find(r=>!this.world.inbox.claimed.has(r.id));request??=claimReflection(this.world);if(request)this.world.inbox.claimed.add(request.id);return request;}
 situationView(){
  const w=this.world,owner=this.player,observed=new Set(w.state.observed[owner]||[]);
  const runs=Object.values(w.state.situations),local=runs.some(r=>r.ambient&&r.status==='active'&&r.participants[owner]?.status==='present');
  const choices=local?w.candidates(owner,{advanceGoals:false}).filter(c=>w.tuning.pack.actions[c.action].ui?.situation).map(c=>({situation:c.situation,action:c.action,label:w.tuning.pack.actions[c.action].label,roles:c.roles,args:c.args})):[];
  return runs.map(run=>{const spec=w.tuning.pack.situations.find(s=>s.id===run.spec);return {...run,room:spec?.phases?.[run.phase]?.room||run.room,phaseLabel:spec?.phases?.[run.phase]?.label,
   choices:choices.filter(c=>c.situation===run.id),turns:run.ambient?w.state.events.filter(e=>e.situation===run.id&&e.delivery==='room'&&observed.has(e.uid)).slice(-6).map(e=>({id:e.uid,actor:e.actor,text:e.text,time:e.time})):[]};});
 }
 snapshot({staticContent=true}={}){
  const w=this.world,s=w.state,p=s.actors[this.player],observed=new Set(s.observed[this.player]);
  const taskView=t=>t?{id:t.id,action:t.candidate.action,label:w.tuning.pack.actions[t.candidate.action].label,phase:t.phase,remaining:t.remaining,duration:w.tuning.pack.actions[t.candidate.action].duration,anchor:t.anchor,approach:t.approach,blockedBy:t.blockedBy,privateUse:t.privateUse,performedAt:t.performedAt,animation:w.tuning.pack.actions[t.candidate.action].animation,reason:t.decision?.reason,source:t.decision?.rule==='player'?'player':'autonomy'}:null;
  return {reflection:reflectionState(w),relationshipTypes:w.tuning.pack.relationships||{},evolution:s.social.evolution,cognitionTypes:w.tuning.pack.cognition||{},resourceTypes:w.tuning.pack.resources||{},navigation:s.navigation,control:{...controlState(w,this.player)},attendance:Object.values(s.obligations||{}).filter(r=>r.owner===this.player).filter((r,i,a)=>r.remedy==='pending'||i>=a.length-12),schoolUI:w.tuning.pack.schoolUI,clock:w.view(this.player).clock,time:s.time,player:this.player,actors:Object.values(s.actors).map(a=>({...a,waiting:s.waiting?.[a.id],task:taskView(s.tasks[a.id]),suspended:taskView(s.suspended[a.id]),reason:s.tasks[a.id]?.decision?.reason||w.brain.traces[a.id]?.reason||'',plans:this.planView(a.id,staticContent),relationships:Object.values(s.actors).filter(b=>a.id!==b.id).map(b=>relationship(w,a.id,b.id)),emotions:w.mind.affects(a.id).map(m=>({subject:m.subject,emotion:m.emotion,intensity:m.intensity,coping:m.coping,reason:m.reason,status:m.status,provenance:m.provenance})),nativeDecisions:w.brain.frames.get(a.id)||0})),objects:Object.values(s.objects),...(staticContent?{rooms:s.rooms,types:w.tuning.pack.types,actions:Object.fromEntries(Object.entries(w.tuning.pack.actions).map(([id,a])=>[id,{label:a.label,duration:a.duration}]))}:{}),performance:{...w.metrics},situations:this.situationView(),leases:s.leases,session:p.session?s.sessions[p.session]:null,offers:w.view(this.player).offers,groups:w.view(this.player).groups,queue:this.queue.map(c=>({...c,label:w.tuning.pack.actions[c.action].label})),ambient:s.events.filter(e=>e.text&&e.time>s.time-4&&['speech','question','cooperate','refuse','proposal','information','social-act','situation-act'].includes(e.kind)&&(s.sessions[e.session]?.access==='public'||e.delivery==='room')).map(({recipients,claim,...e})=>e),events:s.events.filter(e=>observed.has(e.uid)).slice(-45),appointments:Object.values(s.appointments).filter(a=>a.participants.includes(this.player)),pending:[...w.inbox.pending.values()].map(r=>({id:r.id,owner:r.owner,reason:r.reason})),notices:this.notices.splice(0),memory:w.mind.all(this.player).filter(m=>!['x','z','room'].includes(m.predicate)).slice(-20),goals:w.mind.goals(this.player)};
 }
 planView(owner,force){this.planCache??=new Map();const key=Math.floor(this.world.state.time/3)+'|'+this.world.brain.rev[owner];let entry=this.planCache.get(owner);if(force||entry?.key!==key){entry={key,value:describePlans(this.world,owner)};this.planCache.set(owner,entry);}return entry.value;}
 save(){const save=JSON.parse(encodeFoundationSave(this.world));save.playerQueue=this.queue;save.commandSerial=this.serial;return JSON.stringify(save);}
 destroy(){this.world.destroy();}
}
