import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Household,SPOTS,route} from '../dist/simulation.js';
import {FURNITURE,OWN_DESK,interactionPose} from '../dist/layout.js';
import {SoarController,loadSources} from '../dist/soar/controller.js';
import {senses} from '../dist/perception.js';
import {planEpisode,episodeResult,validateEpisode} from '../dist/director.js';
import {applyReflection,reportForModel,ReflectionService} from '../dist/reflection.js';
import {encodeSave,decodeSave} from '../dist/storage.js';
const sources=await loadSources(p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8'));
const root=await SoarController.create(sources,{wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url))});
const make=(saved=null,options={})=>new Household(123,saved,{scenario:'show',...options}).attachBrain(new SoarController(root.native,sources));
const evidence=[];let firstNight;

test('all five beds and personal desks are reachable; walking, sleeping and waking use distinct physical poses',()=>{
 const s=make(null,{calendar:false,director:false});try{
  for(const p of s.people){
   for(const q of s.people){s.release(q);q.nextDecision=1e9;}
   const bed='bed'+(p.index+1),desk=OWN_DESK[p.id],dest=SPOTS[bed];
   const path=route(SPOTS.delivery,dest);assert.ok(path?.length);assert.ok(Math.hypot(path.at(-1).x-dest.x,path.at(-1).z-dest.z)<.4);
   Object.assign(p,{x:SPOTS.delivery.x,z:SPOTS.delivery.z});assert.ok(s.commandAt(p.id,'sleep',bed).ok);
   assert.equal(interactionPose(p).kind,'stand','must walk before lying down');
   for(let i=0;i<100&&p.moving;i++)s.tickTask(p,.25);
   const pose=interactionPose(p),f=FURNITURE[bed];assert.equal(p.task.phase,'doing');assert.equal(pose.kind,'sleep');assert.equal(pose.x,f.x);assert.ok(pose.y>.65&&pose.y<.9);assert.equal(pose.pitch,-Math.PI/2);
   assert.equal(s.commandAt(s.people[(p.index+1)%5].id,'sleep',bed).ok,false);
   s.release(p);assert.equal(interactionPose(p).pitch,0);assert.ok(route(p,SPOTS[desk]));assert.equal(FURNITURE[desk].owner,p.id);
  }
  assert.equal(new Set(Object.values(OWN_DESK)).size,5);evidence.push({case:'furniture',beds:5,personalDesks:5,arrivalBeforePose:true});
 }finally{s.brain.destroy();}
});

test('one ordinary weekday produces native counteroffers, revised commitments, physical preparation and an actual shared activity',()=>{
 const s=make();try{
  s.advance(450);const result=s.director.history[0],events=s.reviews[0].report.events;
  assert.ok(events.some(e=>e.act==='scene-pitch'));assert.ok(events.some(e=>e.actor==='me'&&e.act==='scene-counter'));assert.ok(events.some(e=>e.actor==='xing'&&e.act==='scene-revise'));
  assert.equal(result.status,'completed');assert.equal(result.prepared.length,5);assert.equal(result.performed.length,5);
  for(const p of s.people){assert.equal(p.action,'sleep');assert.equal(interactionPose(p).kind,'sleep');assert.ok(p.hunger>25);assert.ok(s.brain.mindRead(p.id,'episode-1:prepared',s.time).record.value==='yes');}
  const prep=events.filter(e=>e.type==='scene-prepared');assert.ok(prep.every(e=>events.some(a=>a.actor===e.actor&&a.act==='scene-accept'&&a.time<e.time)));
  assert.equal(events.filter(e=>e.type==='missedMeal').length,0);
  firstNight=s.save();evidence.push({case:'weekday-episode',result,turns:events.filter(e=>e.type==='scene-turn').map(e=>({actor:e.actor,at:e.time,act:e.act,text:e.text}))});
 }finally{s.brain.destroy();}
});

test('a ChatGPT-authored native rule changes the same day into an unresolved story, which changes the next day rather than forcing an ending',async()=>{
 const s=make();try{
  await s.brain.install('xing',`sp {learned*protect-homework-from-a-family-meeting
   (state <s> ^io.input-link.frame <f>) (<f> ^mode act ^scene.ready yes ^available <a>) (<a> ^kind study)
   --> (<s> ^operator <o> +) (<o> ^name choose ^choice <a> ^priority 750 ^rule learned*protect-homework-from-a-family-meeting ^reason |今天我想先写作业，这次碰头先不去。|)
  }`,{author:'ChatGPT',purpose:'Counterfactual participation test; not a forced story outcome'});
  s.advance(450);const result=s.director.history[0];assert.equal(result.status,'unresolved');assert.equal(result.performed.length,0);
  assert.equal(s.episode.title,'昨天的事，换个办法');assert.equal(s.episode.basedOn,1);assert.equal(s.episode.effort,8);assert.notEqual(s.episode.title,firstNight.episode.title);
  assert.ok(s.reviews[0].report.events.some(e=>e.type==='planStep'&&e.basis==='learned*protect-homework-from-a-family-meeting'));
  evidence.push({case:'same-seed-different-policy',result,nextDay:{title:s.episode.title,effort:s.episode.effort,basedOn:s.episode.basedOn}});
 }finally{s.brain.destroy();}
});

test('weekday attendance leaves the house through the door, blocks remote conversation, supplies lunch and returns on schedule',()=>{
 const s=make(decodeSave(encodeSave(firstNight)));try{
  s.director.enabled=false;s.advance(540);assert.ok(s.people.every(p=>p.presence==='away'));
  const departures=s.dayEvents.filter(e=>e.type==='departed');assert.equal(departures.length,5);
  for(const e of departures){const p=s.person(e.actor);assert.ok(e.time%1440>=s.calendarFor(p).leave-12&&e.time%1440<=s.calendarFor(p).leave+20);assert.ok(Math.hypot(p.x-SPOTS.delivery.x,p.z-SPOTS.delivery.z)<.6);}
  assert.equal(s.openConversation('xing',['dad'],{topic:'day'}).ok,false);assert.equal(s.command('dad','work').ok,false);assert.equal(senses(s,s.person('xing'),s.person('dad')).understood,false);
  s.advance(440);assert.equal(s.person('xiaoyu').presence,'home');assert.equal(s.person('xing').presence,'home');assert.equal(s.person('xue').presence,'away');assert.equal(s.person('dad').presence,'away');
  s.advance(70);assert.ok(s.people.every(p=>p.presence==='home'));assert.ok(s.people.every(p=>p.meals.lunch===s.day));assert.equal(s.dayEvents.filter(e=>e.type==='returned').length,5);
  evidence.push({case:'weekday-calendar',departures:departures.map(e=>({who:e.actor,at:e.time%1440})),returns:s.dayEvents.filter(e=>e.type==='returned').map(e=>({who:e.actor,at:e.time%1440}))});
 }finally{s.brain.destroy();}
});

test('weekend keeps the family home and opens daytime situations; no imaginary school attendance is recorded',()=>{
 const s=make(null,{startWeekday:5,time:550});try{
  assert.ok(s.people.every(p=>p.presence==='home'));s.episode=null;s.beginEpisode();
  assert.equal(s.episode.meet,600);assert.ok(!s.episode.roles.xing.memory.includes('今天我在班里'));
  s.advance(180);assert.ok(s.people.every(p=>p.presence==='home'));assert.equal(s.dayEvents.filter(e=>e.type==='departed').length,0);assert.ok(s.dayEvents.some(e=>e.type==='scene-turn'));
  evidence.push({case:'weekend',daytimeMeeting:s.episode.meet,departures:0});
 }finally{s.brain.destroy();}
});

test('private briefs enter only their own native memories; saving preserves both story state and provenance',()=>{
 const s=make();let restored;try{
  s.advance(.25);const x=s.person('xing'),dad=s.person('dad');assert.ok(s.known(x,'episode-1','premise'));assert.ok(!s.known(dad,'episode-1','premise'));assert.ok(!s.episode.briefed.includes('dad'));
  const note=s.events.find(e=>e.type==='scene-brief'&&e.actor==='xing');assert.deepEqual(note.observedBy,['xing']);
  assert.equal(s.brain.recall('xing',{uid:'event-'+note.id}).kind,'recalled');assert.equal(s.brain.recall('xue',{uid:'event-'+note.id}).kind,'not-found');
  restored=make(decodeSave(encodeSave(s.save())));assert.deepEqual(restored.episode,s.episode);assert.deepEqual(restored.known(restored.person('xing'),'episode-1','want'),s.known(x,'episode-1','want'));
  const before=s.brain.frames.get('xing');s.refreshAffect(x,true);assert.equal(s.brain.frames.get('xing'),before,'ordinary story facts must not incur an emotion refresh');assert.equal(x.affect.length,0);
  evidence.push({case:'private-native-briefs',ownMemory:true,otherMemory:false,portable:true});
 }finally{s.brain.destroy();restored?.brain.destroy();}
});

test('a delayed day-end provider can author the next situation; stale or invalid setups cannot rewrite a delivered opening',async()=>{
 const s=make(decodeSave(encodeSave(firstNight)));try{
  const review=s.reviews[0],context=reportForModel(review.report,'director');assert.equal(context.episode.status,'completed');
  const next=planEpisode(s,s.director.history.at(-1));next.title='店长也要干活';next.premise='今天想把小餐馆办起来，但先要把店长究竟做什么讲清楚。';next.evidence=[review.report.events.find(e=>e.type==='scene-outcome').id];
  let resolve;const service=new ReflectionService(()=>new Promise(r=>resolve=r),{timeoutMs:5000});const request=service.submit(s,review);await Promise.resolve();s.advance(2);assert.ok(s.people.every(p=>p.action==='sleep'));
  resolve({schemaVersion:1,requestId:review.report.requestId,baseRuleVersion:s.rulesVersion,author:'ChatGPT structured provider fixture',summary:'根据已经完成的节目，安排一次有分工冲突的小餐馆活动。',changes:[],nextEpisode:next});await request;
  assert.equal(review.status,'applied');assert.equal(s.episode.title,'店长也要干活');assert.equal(s.episode.briefed.length,0);
  const p=s.person('xing');s.release(p);s.time=(s.day-1)*1440+430;s.deliverStoryBrief(p);review.status='pending';await assert.rejects(()=>applyReflection(s,{...review.patch,nextEpisode:{...next,title:'不应覆盖已读开场'}}),/已经开始/);
  assert.throws(()=>validateEpisode({...next,lead:'someone-else'},s.day));assert.throws(()=>validateEpisode({...next,effort:Infinity},s.day));assert.equal(s.episode.title,'店长也要干活');
  evidence.push({case:'async-director-interface',continuedSleeping:true,newSituationInstalled:true,lateRewriteRejected:true,runtimeProvider:'controlled fixture, not live LLM'});
 }finally{s.brain.destroy();}
});

test.after(()=>{fs.writeFileSync(new URL('../research/episode-verification.json',import.meta.url),JSON.stringify({kernel:'Soar 9.6.5 native WASM',liveModelCalls:0,results:evidence},null,2));root.destroy();});
