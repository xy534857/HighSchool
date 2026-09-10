import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {SchoolService} from '../../dist/campus/service.js';
const options={read:p=>readFile(new URL(p,new URL('../../dist/foundation/',import.meta.url)),'utf8'),wasmBinary:await readFile(new URL('../../dist/soar/soar.wasm',import.meta.url))};
const evidence=[];
const until=(g,pred,max=45)=>{for(let i=0;i<max*2&&!pred();i++)g.advance(.5);assert.ok(pred(),'condition not reached');};
const lesson=g=>Object.values(g.world.state.obligations||{}).findLast(r=>r.owner===g.player);
function atClass(g){g.world.state.time=509;g.world.state.situationKeys.push('club-preparation:0');}
test('no-input player independently attends sustained class and then eats at lunch',async()=>{
 const g=await SchoolService.create(options);try{
  atClass(g);g.advance(40);const w=g.world;
  assert.equal(w.state.tasks.t.candidate.action,'attend-class');assert.notEqual(w.state.tasks.t.decision.rule,'player');
  assert.equal(lesson(g).status,'present');assert.equal(lesson(g).remedy,'none');assert.ok(lesson(g).attended>30);
  assert.ok(w.state.events.some(e=>e.actor==='t'&&e.kind==='lesson-progress'));
  w.state.time=719;g.advance(2);until(g,()=>w.state.events.some(e=>e.actor==='t'&&e.action==='eat'&&e.kind==='action-completed'));
  assert.equal(w.state.actors.t.room,'canteen');evidence.push({check:'no-input',classMinutes:40,classRule:'foundation*utility',ateLunch:true});
 }finally{g.destroy();}
});
test('manual takeover interrupts automatic class, queue stays manual; autonomy resumes after completion',async()=>{
 const g=await SchoolService.create(options);try{
  atClass(g);g.advance(4);const old=g.world.state.tasks.t.id;
  const command=g.enqueue('walk-to',{}, {room:'playground',x:0,z:4.5});
  assert.equal(g.world.state.receipts[old].status,'cancelled');
  until(g,()=>g.world.state.tasks.t?.id===command.id,5);
  g.enqueue('shoot-hoops',{item:'basketball-hoop'});
  until(g,()=>g.world.state.events.some(e=>e.commandId===command.id&&e.kind==='action-completed'));
  assert.equal(g.world.state.tasks.t.candidate.action,'shoot-hoops');assert.equal(g.world.state.tasks.t.decision.rule,'player');
  until(g,()=>g.world.state.tasks.t?.candidate.action==='attend-class');assert.notEqual(g.world.state.tasks.t.decision.rule,'player');
  evidence.push({check:'manual-takeover',interrupted:true,queueRespected:true,resumed:true});
 }finally{g.destroy();}
});
test('deliberate skipped class produces teacher memory and real makeup work; save never duplicates it',async()=>{
 const g=await SchoolService.create(options);let restored;try{
  atClass(g);g.advance(4);g.enqueue('skip-class');g.enqueue('walk-to',{}, {room:'playground',x:0,z:4.5});g.advance(24);
  const r=lesson(g);assert.equal(r.status,'absent');assert.equal(r.remedy,'pending');
  assert.notEqual(g.world.state.tasks.t?.candidate.action,'attend-class');
  assert.equal(g.world.mind.get('teacher',r.id+':attendance').value,'absent');assert.equal(g.world.mind.get('t',r.id+':remedy').value,'pending');
  const notices=g.world.state.events.filter(e=>e.obligation===r.id&&e.kind==='obligation-assigned');assert.equal(notices.length,1);
  restored=await SchoolService.create({...options,saved:g.save()});restored.advance(5);
  assert.equal(restored.world.state.events.filter(e=>e.obligation===r.id&&e.kind==='obligation-assigned').length,1);
  assert.equal(restored.snapshot().control.deferred.class,600);
  restored.enqueue('attend-class',{item:restored.world.state.actors.t.profile.desk});until(restored,()=>restored.world.state.events.some(e=>e.obligation===r.id&&e.kind==='attendance-returned'));
  assert.equal(restored.world.state.obligations[r.id].status,'absent');assert.equal(restored.snapshot().control.deferred.class,undefined);
  restored.world.state.time=899;restored.advance(3);until(restored,()=>restored.world.state.obligations[r.id].remedy==='completed');
  assert.ok(restored.world.state.events.some(e=>e.kind==='action-completed'&&e.action==='make-up-work'&&e.actor==='t'));
  assert.equal(restored.world.mind.get('t',r.id+':remedy').value,'completed');
  assert.equal(restored.world.state.obligations[r.id].status,'absent');
  evidence.push({check:'skip-save-return-remedy',teacherRecorded:true,duplicateAssignments:0,remedied:true,recordPreserved:true});
 }finally{g.destroy();restored?.destroy();}
});
test('late arrival is not absence; inactive teacher cannot observe missing students; autonomy setting persists',async()=>{
 const g=await SchoolService.create(options);let restored;try{
  atClass(g);Object.assign(g.world.state.actors.teacher,{room:'classroom',x:0,z:-3.2});g.setAutonomy(false);g.world.state.actors.t.room='classroom';until(g,()=>lesson(g)?.status==='late',14);
  assert.equal(lesson(g).status,'late');assert.equal(lesson(g).remedy,'none');assert.equal(g.world.state.tasks.t,undefined);
  g.enqueue('attend-class',{item:'desk-1'});until(g,()=>lesson(g).lastPresent,12);
  assert.equal(lesson(g).status,'late');assert.equal(lesson(g).remedy,'none');
  restored=await SchoolService.create({...options,saved:g.save()});assert.equal(restored.snapshot().control.enabled,false);
  const rw=restored.world;rw.cancel('teacher');rw.state.actors.teacher.presence='away';rw.cancel('t');rw.state.actors.t.room='playground';restored.advance(20);
  assert.equal(lesson(restored).remedy,'none');assert.equal(lesson(restored).status,'late');
  evidence.push({check:'late-vs-absence',lateWithoutPenalty:true,teacherNotOmniscient:true,settingRestored:true});
 }finally{g.destroy();restored?.destroy();}
});
test('old embedded school content upgrades without discarding custom actions or personal memory',async()=>{
 const g=await SchoolService.create(options);let restored;try{
  const w=g.world;w.extendContent({id:'legacy-extra',actions:{'legacy-custom':{...structuredClone(w.tuning.pack.actions.drink),label:'旧规则交互'}}});
  w.mind.write('t',{subject:'saved-note',predicate:'status',value:'kept',root:'legacy-fixture'});
  const old=JSON.parse(g.save());for(const id of old.content.schoolUpgradeActions)delete old.content.actions[id];
  old.content.routines=old.content.routines.filter(r=>old.content.actions[r.action]);
  delete old.content.schoolRevision;delete old.content.control;delete old.content.obligations;delete old.content.schoolUI;
  delete old.state.controls;delete old.policyRules.t;
  restored=await SchoolService.create({...options,saved:JSON.stringify(old)});
  assert.equal(restored.snapshot().control.enabled,true);assert.ok(restored.world.tuning.pack.obligations.length);
  assert.ok(restored.world.tuning.pack.actions['legacy-custom']);assert.equal(restored.world.mind.get('t','saved-note:status').value,'kept');
  assert.ok(restored.world.policyRules.t.length);assert.deepEqual(restored.world.policyRules.m,w.policyRules.m);
  evidence.push({check:'legacy-content-upgrade',customActionPreserved:true,personalMemoryPreserved:true,playerEnabled:true});
 }finally{g.destroy();restored?.destroy();}
});
test.after(()=>writeFile(new URL('../../research/campus/player-autonomy.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n'));
