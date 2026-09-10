import test from 'node:test';
import assert from 'node:assert/strict';
import {SchoolService} from '../../dist/campus/service.js';
import {activityTime} from '../../dist/foundation/timing.js';
import {schoolOptions} from '../../scripts/observe-school-timing.mjs';

test('late leisure trips are filtered by full round-trip cost, while player intent remains executable',async()=>{
 const g=await SchoolService.create(schoolOptions),w=g.world;
 try{
  w.state.time=595;
  const roles={item:'student-chess'},spec=w.tuning.pack.actions['solve-chess'],binding=w.roleBindings('t',spec,roles)[0];
  const cost=activityTime(w,'t',spec,w.context('t',binding,{}));assert.equal(cost.fits,false);assert.ok(cost.outbound>5);
  assert.ok(!w.candidates('t').some(c=>c.action==='solve-chess'&&c.item==='student-chess'));
  assert.ok(w.candidates('t',{action:'solve-chess',roles}).length,'explicit player action is not silently blocked');
  w.state.time=555;
  assert.ok(w.candidates('t').some(c=>c.action==='solve-chess'&&c.item==='student-chess'));
  const p=w.state.actors.t;Object.assign(p,{room:'student-center',x:-2,z:4.5});w.state.time=588;
  assert.ok(Number.isFinite(w.view('t').clock.returnTravel));
  assert.equal(w.view('t').clock.returnDue,true,'a distant student starts returning sooner');
  Object.assign(p,{room:'classroom',x:0,z:4.5});assert.equal(w.view('t').clock.returnDue,false,'a nearby student keeps their remaining break');
  w.state.time=5*1440+595;assert.equal(w.view('t').clock.returnDue,false,'weekends do not create return obligations');
  Object.assign(w.state.actors.t,{room:'student-center',x:-2,z:4.5});w.state.time=599.5;
  const returning=w.perform('t','prepare-class',{roles:{item:p.profile.desk}});assert.equal(returning.ok,true,JSON.stringify(returning));
  const path=w.state.tasks.t.points;w.advance(.5,{autonomy:false});
  assert.equal(w.state.tasks.t.candidate.action,'attend-class');assert.equal(w.state.tasks.t.phase,'travel');assert.deepEqual(w.state.tasks.t.points,path,'the bell preserves the return route');
  assert.ok(!w.state.events.some(e=>e.commandId===returning.commandId&&e.kind==='action-cancelled'));
 }finally{g.destroy();}
});

test('old saves adopt the timetable and walking speed without changing time, memories, queued commands or old attendance',async()=>{
 const g=await SchoolService.create(schoolOptions),w=g.world;let restored;
 try{
  w.state.time=609;
  w.mind.write('t',{subject:'timetable-note',predicate:'status',value:'kept',root:'timing-fixture'});
  g.setAutonomy(false);const command=g.enqueue('walk-to',{}, {room:'student-center',x:0,z:4.5});
  w.state.obligations??={};w.state.obligations['legacy-lesson']={id:'legacy-lesson',spec:'lessons',owner:'t',start:510,end:600,closed:true,attended:65,missed:25,status:'absent',remedy:'pending'};
  const old=JSON.parse(g.save());delete old.content.timetableRevision;old.content.clock.walkSpeed=4;
  old.content.clock.periods=[{id:'morning',start:0,end:510},{id:'class',start:510,end:600},{id:'break',start:600,end:625},{id:'class',start:625,end:720},{id:'lunch',start:720,end:790},{id:'class',start:790,end:900},{id:'after-school',start:900,end:1110},{id:'night',start:1110,end:1440}];
  restored=await SchoolService.create({...schoolOptions,saved:JSON.stringify(old)});const rw=restored.world;
  assert.equal(rw.state.time,609);assert.equal(rw.tuning.pack.clock.walkSpeed,12);assert.equal(rw.state.tasks.t.id,command.id);
  assert.equal(rw.mind.get('t','timetable-note:status').value,'kept');assert.deepEqual(rw.state.obligations['legacy-lesson'],old.state.obligations['legacy-lesson']);
  restored.advance(2);const record=Object.values(rw.state.obligations).find(r=>r.owner==='t'&&r.start===600);
  assert.equal(record.missed,0);assert.equal(record.remedy,'none');assert.equal(record.status,'expected');
  const saved=restored.save();const again=await SchoolService.create({...schoolOptions,saved});try{assert.equal(again.world.state.obligationGraceUntil,rw.state.obligationGraceUntil,'reloading does not renew the transition grace');}finally{again.destroy();}
 }finally{g.destroy();restored?.destroy();}
});
