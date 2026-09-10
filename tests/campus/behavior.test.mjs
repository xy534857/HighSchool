import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {SchoolService} from '../../dist/campus/service.js';
const options={read:p=>readFile(new URL(p,new URL('../../dist/foundation/',import.meta.url)),'utf8'),wasmBinary:await readFile(new URL('../../dist/soar/soar.wasm',import.meta.url))};
const evidence=[];
const tickUntil=(g,fn,max=45)=>{for(let i=0;i<max*2&&!fn();i++)g.world.advance(.5);assert.ok(fn(),'condition not reached: '+JSON.stringify({runs:g.world.state.situations,actor:g.world.state.actors.q,plans:g.world.mind.goals('q'),decision:g.world.brain.traces.q,tasks:Object.fromEntries(Object.entries(g.world.state.tasks).map(([id,t])=>[id,{action:t.candidate.action,phase:t.phase,reason:t.decision.reason}])),events:g.world.state.events.slice(-15)}));};
const runOf=g=>Object.values(g.world.state.situations)[0];
const afterSchool=g=>{g.world.state.time=3*1440+910;};
test('a whole class stays at assigned classroom seats, while busy agents do not choose every tick',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 w.state.time=500;w.state.situationKeys.push('club-preparation:0');const before=w.metrics.decisions;w.advance(20);for(const a of Object.values(w.state.actors).filter(a=>!a.controlled))assert.equal(a.room,'classroom','morning-to-class: '+a.id);w.advance(65);
 for(const a of Object.values(w.state.actors).filter(a=>!a.controlled)){
  assert.equal(a.room,'classroom',a.id);assert.equal(w.state.tasks[a.id]?.candidate.action,a.role==='teacher'?'teach-class':'attend-class',a.id);
  assert.ok(w.state.events.filter(e=>e.actor===a.id&&e.kind==='action-completed'&&['attend-class','teach-class'].includes(e.action)).length>=2,a.id);
 }
 assert.ok(w.metrics.decisions-before<120);evidence.push({check:'sustained-class',minutes:85,decisions:w.metrics.decisions-before,allNPCsInClass:true});
 }finally{g.destroy();}
});
test('autonomous situation negotiates consent, then real complementary work; no player takeover',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 afterSchool(g);tickUntil(g,()=>runOf(g)?.status==='completed',80);const run=runOf(g);
 assert.equal(run.phase,'together',JSON.stringify({run,events:w.state.events.filter(e=>e.kind==='action-failed')}));assert.equal(run.participants.m.status,'declined');
 assert.ok(w.state.events.some(e=>e.kind==='cooperate'&&w.state.offers[e.offer]?.kind==='project'));
 for(const action of ['draw-poster','play-guitar'])assert.ok(w.state.events.some(e=>e.kind==='action-completed'&&e.action===action&&e.situation===run.id));
 assert.ok(!run.participants.t,'situation never casts the player');assert.ok(!w.mind.goals('t').some(g=>g.situation===run.id));assert.ok(!w.state.events.some(e=>e.actor==='t'&&e.kind==='action-completed'&&e.situation===run.id),'ordinary player autonomy is not a situation command');
 evidence.push({check:'consensual-situation',phase:run.phase,status:run.status,finished:run.finished,playerNotCast:true,declinedParticipation:'m'});
 }finally{g.destroy();}
});
test('a runtime Soar rule can refuse the proposal and change the shared outcome',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 afterSchool(g);
 // Stop before the offer is answered. The replacement is installed through the
 // same request/evidence/native compilation path available to runtime authors.
 tickUntil(g,()=>Object.values(w.state.offers).some(o=>o.kind==='project'&&o.status==='pending'),25);
 const r=w.inbox.request('f','consider-project');
 await w.inbox.apply({requestId:r.id,epoch:r.epoch,baseRevision:r.baseRevision,contentRevision:r.contentRevision,evidence:r.context.events.filter(e=>e.kind==='proposal').map(e=>e.uid),rules:[{id:'decline-project-test',select:{action:'decline-offer','offer-kind':'project'},priority:180,reason:'我还没练好自己的曲目，这次不答应额外的准备工作。'}],goals:[]});
 tickUntil(g,()=>runOf(g).status==='completed',runOf(g).ends-w.state.time);assert.equal(runOf(g).phase,'solo');
 assert.ok(w.state.events.some(e=>e.kind==='refuse'&&e.actor==='f'));assert.ok(!w.state.events.some(e=>e.action==='play-guitar'&&e.situation===runOf(g).id));
 evidence.push({check:'runtime-refusal',outcome:runOf(g).phase,nativeRule:w.state.events.find(e=>e.rule==='learned*f*decline-project-test')?.rule});
 }finally{g.destroy();}
});
test('missing resources cannot fake completion; situation and native plans survive save/load',async()=>{
 const g=await SchoolService.create(options),w=g.world;let restored;
 try{
 afterSchool(g);w.state.objects['art-table'].state.paper=0;
 // Keep resources genuinely unavailable even when personal goals can procure supplies.
 for(const o of Object.values(w.state.objects))if(o.tags.includes('supplies'))o.state.stock=0;for(const a of Object.values(w.state.actors))a.resources.supplies=0;
 tickUntil(g,()=>runOf(g)?.phase==='together',35);
 const before=runOf(g).id,saved=g.save();restored=await SchoolService.create({...options,saved});const rw=restored.world;
 assert.equal(runOf(restored).id,before);assert.ok(rw.mind.goals('q').some(g=>g.status==='active'));
 rw.advance(runOf(restored).ends-rw.state.time+1);assert.equal(runOf(restored).status,'expired');assert.ok(!rw.state.events.some(e=>e.action==='draw-poster'&&e.situation===before&&e.kind==='action-completed'));
 assert.equal(Object.keys(rw.state.situations).length,1);assert.equal(new Set(rw.state.goalKeys.q).size,rw.state.goalKeys.q.length);
 evidence.push({check:'resource-save-expiry',status:runOf(restored).status,duplicateGoals:false,fakeCompletion:false});
 }finally{g.destroy();restored?.destroy();}
});
test.after(()=>writeFile(new URL('../../research/campus/behavior-regression.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n'));
