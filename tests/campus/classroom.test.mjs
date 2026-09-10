import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SchoolService} from '../../dist/campus/service.js';
import {relationship} from '../../dist/foundation/social.js';
const options={read:p=>readFileSync(new URL('../../dist/foundation/'+p,import.meta.url),'utf8'),wasmBinary:readFileSync(new URL('../../dist/soar/soar.wasm',import.meta.url))};
const runOf=w=>Object.values(w.state.situations).find(s=>s.spec==='classroom-discussion');
async function classroom(){
 const g=await SchoolService.create(options),w=g.world;
 w.state.time=500;w.state.situationKeys.push('club-preparation:0');w.advance(23.5);w.advance(.5,{autonomy:false});
 for(const a of Object.values(w.state.actors))w.state.controls[a.id].enabled=false;
 assert.equal(w.state.tasks.t?.phase,'perform');return g;
}
function act(w,owner,name){
 const run=runOf(w);if(w.state.time<run.nextTurnAt)w.advance(run.nextTurnAt-w.state.time,{autonomy:false});
 const result=w.perform(owner,'classroom-'+name,{roles:{situation:run.id}});
 assert.equal(result.ok,true,JSON.stringify({name,owner,result,phase:run.phase,state:run.state}));
 w.advance(.5,{autonomy:false});return result;
}

test('ordinary Soar autonomy can open, question and resolve a classroom exchange while keeping attendance',async()=>{
 const g=await SchoolService.create(options),w=g.world;
 try{
  w.state.time=500;w.state.situationKeys.push('club-preparation:0');w.advance(85);
  const run=runOf(w),turns=w.state.events.filter(e=>e.situation===run.id&&e.delivery==='room');
  assert.equal(run.status,'completed');assert.ok(turns.length>=4);
  assert.ok(turns.some(e=>e.intent==='classroom-question'));
  assert.ok(turns.every(e=>w.state.events.some(a=>a.kind==='action-completed'&&a.actor===e.actor&&a.time===e.time&&a.situation===run.id&&a.rule!=='player')));
  for(let i=1;i<turns.length;i++)assert.ok(turns[i].time-turns[i-1].time>=3);
  assert.ok(!Object.values(w.state.goalKeys).flat().some(id=>id.startsWith(run.id)&&!id.includes('classroom-admit')),'The situation installed no role plan');
  for(const a of Object.values(w.state.actors))assert.equal(w.state.tasks[a.id]?.candidate.action,a.role==='teacher'?'teach-class':'attend-class');
  assert.ok(Object.values(w.state.obligations).every(o=>o.remedy!=='pending'));
 }finally{g.destroy();}
});

test('player classroom contributions preserve the same seat, ongoing lesson and manual queue',async()=>{
 const g=await classroom(),w=g.world;
 try{
  act(w,'teacher','open');w.advance(3,{autonomy:false});
  const task=w.state.tasks.t,slot=task.slot,lease=structuredClone(w.state.leases[slot]);
  const choice=g.snapshot().situations.find(s=>s.id===runOf(w).id).choices.find(c=>c.action==='classroom-try');assert.ok(choice);
  g.enqueue(choice.action,choice.roles,choice.args);assert.equal(g.queue.length,0);
  assert.equal(runOf(w).state.presenter,'t');assert.equal(w.state.tasks.t.id,task.id);
  assert.deepEqual(w.state.leases[slot],lease);assert.equal(w.state.tasks.t.remaining,task.remaining);
  assert.ok(!w.state.events.some(e=>e.kind==='action-cancelled'&&e.commandId===task.id));
 }finally{g.destroy();}
});

test('a personal admission makes a real after-class commitment; a deflection changes the listener relationship',async()=>{
 const g=await classroom(),w=g.world;
 try{
  act(w,'teacher','open');act(w,'t','try');act(w,'r','question');
  const before=relationship(w,'r','t');act(w,'t','admit');
  assert.equal(relationship(w,'r','t').respect,before.respect+3);
  const goal=w.mind.goals('t').find(g=>g.origin==='self-commitment');assert.ok(goal);assert.equal(goal.stage,0);
  assert.equal(goal.activeWhen.left,'$clock.period','The future condition must remain an expression');
  assert.ok(w.modelContext('t').events.some(e=>e.intent==='classroom-question'));
  act(w,'teacher','close-open');
  assert.equal(runOf(w).state.outcome,'unresolved');assert.equal(w.mind.goal('t',goal.uid.slice(5)).status,'active');
  w.state.time=600;for(const a of Object.values(w.state.actors))if(a.id!=='t')a.presence='away';w.state.controls.t.enabled=true;
  for(let i=0;i<45&&w.mind.goal('t',goal.uid.slice(5)).status==='active';i++)w.advance(.5);
  assert.equal(w.mind.goal('t',goal.uid.slice(5)).status,'completed');
  assert.ok(w.state.events.some(e=>e.actor==='t'&&e.action==='study'&&e.kind==='action-completed'));
 }finally{g.destroy();}
 const h=await classroom(),v=h.world;
 try{act(v,'teacher','open');act(v,'m','try');act(v,'r','question');const before=relationship(v,'r','m');act(v,'m','deflect');assert.equal(relationship(v,'r','m').grievance,before.grievance+4);assert.ok(!v.mind.goals('m').some(g=>g.origin==='self-commitment'));}finally{h.destroy();}
});

test('unseen classmates get no discussion context; late turns and absent addressees cannot change the scene',async()=>{
 const g=await classroom(),w=g.world;
 try{
  w.state.actors.a.room='library';w.advance(.5,{autonomy:false});act(w,'teacher','open');act(w,'m','try');
  assert.equal(w.view('a').situations.length,0);
  assert.ok(!w.modelContext('a').events.some(e=>e.situation===runOf(w).id&&e.delivery==='room'));
  w.advance(3,{autonomy:false});const candidate=w.candidates('r',{action:'classroom-question'})[0];assert.ok(candidate);
  act(w,'q','encourage');const before=structuredClone(runOf(w).state);
  assert.equal(w.execute('r',candidate,'stale-turn',{rule:'test'}).ok,false);assert.deepEqual(runOf(w).state,before);
  w.state.actors.m.room='library';w.advance(3,{autonomy:false});assert.equal(w.perform('r','classroom-question').ok,false);
  assert.equal(runOf(w).state.challenger,'none');
 }finally{g.destroy();}
});

test('save/load preserves a pending question and its cooldown; old saves gain the pack without resetting plans',async()=>{
 const g=await classroom(),w=g.world;let restored,upgraded;
 try{
  act(w,'teacher','open');act(w,'m','try');act(w,'r','question');
  const before=structuredClone(runOf(w));restored=await SchoolService.create({...options,saved:g.save()});
  assert.deepEqual(runOf(restored.world),before);act(restored.world,'m','admit');
  assert.equal(restored.world.mind.goals('m').filter(g=>g.origin==='self-commitment').length,1);
  const save=JSON.parse(g.save());delete save.content.classroomRevision;delete save.content.classroomActions;
  save.content.situations=save.content.situations.filter(s=>s.id!=='classroom-discussion');
  for(const id of Object.keys(save.content.actions))if(id.startsWith('classroom-'))delete save.content.actions[id];
  delete save.content.projects['classroom-followup'];delete save.state.situations[before.id];save.state.situationKeys=save.state.situationKeys.filter(id=>id!==before.id);
  const originalGoals=w.state.goalKeys.m.length;
  upgraded=await SchoolService.create({...options,saved:JSON.stringify(save)});
  assert.ok(upgraded.world.tuning.pack.actions['classroom-admit']);assert.equal(upgraded.world.state.goalKeys.m.length,originalGoals);
  assert.equal(upgraded.world.state.actors.m.resources.homework,w.state.actors.m.resources.homework);
  assert.ok(upgraded.world.policyRules.m.some(r=>r.id==='classroom-question'));
 }finally{g.destroy();restored?.destroy();upgraded?.destroy();}
});
