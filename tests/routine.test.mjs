import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Household,SPOTS} from '../dist/simulation.js';import {SoarController,loadSources} from '../dist/soar/controller.js';import {applyReflection,validateReflection,rollbackReflection,ReflectionService} from '../dist/reflection.js';import {encodeSave,decodeSave} from '../dist/storage.js';
const sources=await loadSources(p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8'));
const root=await SoarController.create(sources,{wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url))});
const make=(saved=null)=>new Household(2026,saved, {calendar:false,director:false}).attachBrain(new SoarController(root.native,sources));let firstDay;const evidence=[];
const worldPatch=s=>({schemaVersion:1,requestId:s.reviews[0].report.requestId,baseRuleVersion:s.rulesVersion,author:'mechanical test fixture',summary:'测试根据一份真实日结修改未来饭点的执行机制',changes:[{kind:'world',path:'routine.meals.dinner.start',value:1140,reason:'用于验证未来饭点变化，引用本日实际用餐事件；并非模型质量评测',evidence:[s.reviews[0].report.people.dad.meals[0].id]},{kind:'world',path:'routine.meals.dinner.end',value:1185,reason:'保持饭点窗口长度',evidence:[s.reviews[0].report.people.dad.meals[0].id]}]});
test('shared mealtime produces one ordinary dinner per person and planned overnight sleep',()=>{
 const s=make();try{s.advance(1440-s.time);const r=s.reviews[0].report;
  for(const p of s.people){const meals=r.people[p.id].meals;assert.equal(meals.length,1,p.id);assert.equal(meals[0].slot,'dinner');assert.ok(meals[0].time>=1110&&meals[0].time<1155);assert.equal(p.action,'sleep');assert.ok(p.task.remaining>300);assert.ok(p.plan.uid);}
  const times=Object.values(r.people).map(p=>p.meals[0].time);assert.ok(Math.max(...times)-Math.min(...times)<15);assert.ok(!r.events.some(e=>e.type==='missedMeal'));
  firstDay=s.save();evidence.push({name:'ordinary-shared-dinner',times,mealCount:5,offWindowMeals:0,nativePlans:s.people.map(p=>p.plan)});
 }finally{s.brain.destroy();}
});
test('overnight sleep, shared breakfast, and an unfinished native intention survive midnight and portable reload',()=>{
 const s=make(decodeSave(encodeSave(firstDay)));try{const dad=s.person('dad'),uid=dad.plan.uid,before=dad.goals[0].progress;assert.ok(before<100);s.advance(370);for(const p of s.people)assert.equal(p.action,'sleep',p.id);assert.equal(dad.plan.uid,uid);s.advance(130);
  const starts=s.dayEvents.filter(e=>e.type==='taskStarted'&&e.task==='eat');assert.equal(starts.length,5);assert.ok(starts.every(e=>e.meal==='breakfast'&&e.time%1440>=435&&e.time%1440<465));assert.equal(dad.plan.uid,uid);assert.equal(dad.goals[0].progress,before);
  s.advance(90);assert.ok(dad.goals[0].progress>before||dad.plan.milestones>0);assert.equal(dad.plan.uid,uid);
  evidence.push({name:'cross-midnight',uid,breakfast:starts.map(e=>({who:e.actor,time:e.time%1440})),progress:dad.goals[0].progress});
 }finally{s.brain.destroy();}
});
test('blocked furniture selects another registered route; player interruption preserves the same project and explanation',()=>{
 const s=make();try{const p=s.person('xue');Object.assign(p,SPOTS.deskXue);p.fun=p.hunger=p.energy=90;s.home.deskClosed=true;s.decide(p);assert.equal(p.action,'studyTable');const uid=p.plan.uid;assert.equal(p.explanation.basis,'advance-milestone');assert.ok(p.explanation.alternatives.some(a=>a.action==='studyTable'));assert.ok(!p.explanation.alternatives.some(a=>a.action==='study'));assert.match(p.explanation.reason,/有效工作/);s.advance(12);const progress=p.goals[0].progress;assert.ok(s.command(p.id,'rest').ok);s.advance(2);assert.equal(p.decision.rule,'core*honor-player-action');assert.equal(p.plan.uid,uid);const saved=s.save(),resumed=make(saved);try{resumed.advance(48);resumed.advance(1200-resumed.minute+45);const q=resumed.person('xue');assert.equal(q.plan.uid,uid);assert.ok(q.goals[0].progress>progress);assert.ok(q.planning.fired.some(n=>n.startsWith('plan*')));}finally{resumed.brain.destroy();}
 }finally{s.brain.destroy();}
});
test('urgent nutrition is an explicit exception to normal mealtimes and is explained as such',()=>{
 const s=make();try{const p=s.person('xue');p.hunger=8;p.fun=90;s.decide(p);assert.ok(['eat','snack','cook','groceries'].includes(p.action));assert.equal(p.decision.rule,'base*urgent-food');assert.match(p.explanation.reason,/紧急/);assert.equal(s.routine(p)['meal-window'],false);}finally{s.brain.destroy();}
});
test('day-end world patch changes future native choices; rollback preserves observed memory, goals, and events',async()=>{
 const s=make(firstDay);try{const p=s.person('dad'),uid=p.plan.uid,eventCount=s.events.length;const beforeMemory=s.brain.recall('dad',{type:'event',actor:'dad',kind:'distraction'}).memory;const patch=worldPatch(s);await applyReflection(s,patch);assert.equal(s.rulesVersion,2);assert.equal(s.domain.routine.meals.dinner.start,1140);assert.equal(p.plan.uid,uid);assert.ok(s.events.length>eventCount);assert.deepEqual(s.brain.recall('dad',{type:'event',actor:'dad',kind:'distraction'}).memory,beforeMemory);
  for(const q of s.people)s.release(q);s.time=1440+1110;s.home.food=5;s.perceive(p,'pot','stock',5);p.hunger=80;p.fun=90;p.energy=90;s.decide(p);assert.notEqual(p.action,'eat');s.release(p);s.time=1440+1140;s.decide(p);assert.equal(p.action,'eat');assert.equal(p.explanation.basis,'routine*attend-the-meal-window');
  s.emit('cooperate',p,'补丁之后实际发生的一次合作',['xing']);const remembered=s.brain.recall('dad',{type:'event',actor:'dad',kind:'cooperate'}).memory.uid;await rollbackReflection(s);assert.equal(s.domain.routine.meals.dinner.start,1110);assert.equal(s.brain.recall('dad',{type:'event',actor:'dad',kind:'cooperate'}).memory.uid,remembered);assert.equal(p.plan.uid,uid);assert.equal(s.rulesVersion,3);
  evidence.push({name:'world-patch-and-rollback',nativeActionAfterPatch:'eat',retainedMemory:remembered,version:s.rulesVersion});
 }finally{s.brain.destroy();}
});
test('new personal productions are parsed by Soar and affect only the specified agent',async()=>{
 const s=make(firstDay);try{const patch=worldPatch(s);patch.changes=[{kind:'person',person:'dad',reason:'测试可执行个人规则，不代表模型质量',evidence:[s.reviews[0].report.people.dad.meals[0].id],source:`sp {learned*test-person (state <s> ^context <c>) (<c> ^frame <f> ^memory-ready yes) (<f> ^mode act ^busy no ^work-window yes ^available <a>) (<a> ^kind read) --> (<s> ^operator <o> +) (<o> ^name choose ^choice <a> ^priority 120 ^rule learned*test-person ^reason |测试规则|)}`}];await applyReflection(s,patch);s.release(s.person('dad'));s.time=1980;s.decide(s.person('dad'));assert.equal(s.person('dad').action,'read');assert.equal(s.person('dad').decision.rule,'learned*test-person');assert.ok(!s.brain.cli('xue','print --all --full').includes('learned*test-person'));
  const resumed=make(decodeSave(encodeSave(s.save())));try{assert.equal(resumed.rulesVersion,2);assert.equal(resumed.reviews[0].status,'applied');assert.ok(resumed.brain.rules.dad[0].names.includes('learned*test-person'));}finally{resumed.brain.destroy();}
 }finally{s.brain.destroy();}
});
test('invalid evidence, stale versions, and malformed Soar reject an entire multi-change patch',async()=>{
 const s=make(firstDay);try{const original=s.domain.routine.meals.dinner.start,patch=worldPatch(s);patch.changes.push({kind:'person',person:'dad',reason:'测试错误源码的事务隔离',evidence:patch.changes[0].evidence,source:'sp {learned*invalid this is not a production}'});await assert.rejects(()=>applyReflection(s,patch));assert.equal(s.rulesVersion,1);assert.equal(s.domain.routine.meals.dinner.start,original);assert.equal(s.reviews[0].status,'pending');assert.equal(s.reviewApplying,false);
  const unknown=worldPatch(s);unknown.changes[0].evidence=[-1];assert.throws(()=>validateReflection(s,unknown),/真实/);const stale=worldPatch(s);s.rulesVersion++;assert.throws(()=>validateReflection(s,stale),/版本/);s.rulesVersion--;
  const privateEvent=s.reviews[0].report.events.find(e=>e.actor==='xue'&&!e.observedBy?.includes('dad'));assert.ok(privateEvent);patch.changes[2].evidence=[privateEvent.id];assert.throws(()=>validateReflection(s,patch),/不知道/);
  const control=s.person('dad').plan.uid;s.advance(2);assert.equal(s.person('dad').plan.uid,control);
 }finally{s.brain.destroy();}
});
test('missing, slow, failed, and cancelled reflection providers never fabricate rules or block life',async()=>{
 const s=make(firstDay);try{const r=s.reviews[0],none=new ReflectionService();assert.equal(none.submit(s,r),null);assert.equal(s.rulesVersion,1);
  let finish;const slow=new ReflectionService(()=>new Promise(resolve=>finish=resolve));const task=slow.submit(s,r);await Promise.resolve();const before=s.time;s.advance(5);assert.equal(s.time,before+5);assert.equal(s.rulesVersion,1);slow.cancel();finish(worldPatch(s));await task;assert.equal(s.rulesVersion,1);assert.equal(r.status,'pending');
  const throws=new ReflectionService(()=>{throw Error('连接失败')});await throws.submit(s,r);assert.match(r.error,/连接失败/);assert.equal(throws.pending.size,0);
  const timed=new ReflectionService(()=>new Promise(()=>{}),{timeoutMs:5});await timed.submit(s,r);assert.match(r.error,/超时/);assert.equal(s.rulesVersion,1);s.advance(1);
  // This provider is explicitly a test double; the production default remains unconnected.
  const provider=new ReflectionService(async()=>worldPatch(s));await provider.submit(s,r);assert.equal(s.rulesVersion,2);assert.equal(r.status,'applied');
 }finally{s.brain.destroy();}
});
test('a day-end decision to keep current rules creates no fake version or rollback entry',async()=>{const s=make(firstDay);try{const p=worldPatch(s);p.changes=[];p.summary='本日不需要修改规则';await applyReflection(s,p);assert.equal(s.rulesVersion,1);assert.equal(s.ruleHistory?.length||0,0);assert.equal(s.reviews[0].status,'applied');}finally{s.brain.destroy();}});
test.after(()=>{fs.writeFileSync(new URL('../research/routine-verification.json',import.meta.url),JSON.stringify({kernel:'Soar 9.6.5',tests:'routine, persistent intentions, day-end patch execution (provider fixtures do not test LLM quality)',evidence},null,2));root.destroy();});
