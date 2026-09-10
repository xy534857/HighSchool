import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SchoolService} from '../../dist/campus/service.js';
import {relationship} from '../../dist/foundation/social.js';
import {InferenceBroker} from '../../dist/llm/broker.js';
const options={read:p=>readFileSync(new URL('../../dist/foundation/'+p,import.meta.url),'utf8'),wasmBinary:readFileSync(new URL('../../dist/soar/soar.wasm',import.meta.url))};
const reply=(r,extra={})=>({requestId:r.id,epoch:r.epoch,baseRevision:r.baseRevision,contentRevision:r.contentRevision,evidence:[],rules:[],goals:[],...extra});
const delay=ms=>new Promise(r=>setTimeout(r,ms));

test('experienced appraisals update directed native relationships; unseen actors learn nothing',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
  const before=relationship(w,'m','f');
  w.transaction(tx=>tx.emit('social-act','f',['f','m','t'],{to:'t',intent:'exclusion',text:'不一起走。'}));
  assert.equal(relationship(w,'m','f').trust,before.trust-4);
  assert.equal(relationship(w,'t','f').grievance,15);
  assert.equal(w.mind.get('a','f:social-exclusion'),null);
  w.transaction(tx=>tx.emit('social-act','f',['f','m','t'],{to:'t',intent:'exclusion',text:'这次也不一起。'}));
  assert.equal(relationship(w,'m','f').trust,before.trust-8,'Appraisals are new own judgments, not conflicting hearsay');
  assert.equal(relationship(w,'t','f').grievance,30);
 }finally{g.destroy();}
});

test('a prerequisite cannot complete a speech goal; personality and strategy patches require evidence',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
  const goal={id:'boundary-test',title:'说清楚自己的界限',steps:[{action:'set-boundary',roles:{target:'f'},alternatives:[{action:'seek-contact',roles:{target:'f'}}]}]};w.addGoal('m',goal);
  let evidence;w.transaction(tx=>{evidence=tx.emit('action-completed','m',['m'],{action:'seek-contact'});});
  w.completeGoalStep('m',goal.id,0,evidence);assert.equal(w.mind.goal('m',goal.id).stage,0);
  const request=w.inbox.request('m','reflect-test');const original=w.state.actors.m.profile.assertiveness;
  await assert.rejects(w.inbox.apply(reply(request,{summary:'改变',evidence:['unseen'],cognition:[{field:'assertiveness',delta:2,reason:'没有经历'}]})),/Evidence/);
  await assert.rejects(w.inbox.apply(reply(request,{summary:'改变',evidence:[evidence],cognition:[{field:'assertiveness',delta:99,reason:'改变太大'}]})),/daily limit/);
  assert.equal(w.state.actors.m.profile.assertiveness,original);
  await w.inbox.apply(reply(request,{summary:'找人没有说成，先保留目标，下次更明确地表达。',evidence:[evidence],cognition:[{field:'assertiveness',delta:2,reason:'找人之后还没有表达出来，需要更主动一点。'}]}));
  assert.equal(w.state.actors.m.profile.assertiveness,original+2);assert.equal(w.mind.get('m','m:trait-assertiveness').value,original+2);
  assert.equal(w.facts('m')['profile-assertiveness'],original+2);
  const second=w.inbox.request('m','same-day-again');await assert.rejects(w.inbox.apply(reply(second,{summary:'再次改变',evidence:[evidence],cognition:[{field:'assertiveness',delta:2,reason:'反复加值'}]})),/already changed today/);
 }finally{g.destroy();}
});

test('daily reflection queues once and survives loading while old in-flight replies are rejected',async()=>{
 const g=await SchoolService.create(options),w=g.world;let restored;try{
  w.state.time=1079.5;w.advance(.5,{autonomy:false});assert.equal(Object.keys(w.state.social.reflections).length,7);
  w.advance(2,{autonomy:false});assert.equal(Object.keys(w.state.social.reflections).length,7);
  const request=g.claimInference();assert.ok(request);assert.equal(request.reason,'daily-reflection');
  restored=await SchoolService.create({...options,saved:g.save()});const next=restored.claimInference();assert.ok(next);assert.notEqual(next.epoch,request.epoch);
  await assert.rejects(restored.world.inbox.apply(reply(request,{summary:'old'})),/Stale/);
  await restored.world.inbox.apply(reply(next,{summary:'今天没有足够新证据，保持已有目标。'}));
  assert.equal(restored.world.state.social.reflections[next.meta.job].status,'completed');
 }finally{g.destroy();restored?.destroy();}
});

test('inference latency does not block ticks; concurrency and rolling request budgets are enforced',async()=>{
 let clock=0,active=0,peak=0,applied=0;const queue=Array.from({length:5},(_,i)=>({id:String(i),owner:String(i)})),resolvers=[];
 const b=new InferenceBroker({source:{claim:async()=>queue.shift()||null,apply:async()=>{applied++;}},provider:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>resolvers.push(r));active--;return {};},concurrency:2,startsPerMinute:2,timeoutMs:2000,now:()=>clock});
 try{
  await b.pump();assert.equal(peak,2);let ticks=0;for(let i=0;i<8;i++){ticks++;await delay(1);}assert.equal(ticks,8);assert.equal(applied,0);
  resolvers.splice(0).forEach(r=>r());await delay(2);await b.pump();assert.equal(applied,2);assert.equal(queue.length,3);
  clock=60001;await b.pump();assert.equal(queue.length,1);assert.equal(peak,2);resolvers.splice(0).forEach(r=>r());await delay(2);
 }finally{b.close();}
});

test('timeouts and reload cancellation discard late model results',async()=>{
 let applied=0,failed=0,resolve;const request={id:'late',owner:'person'};let used=false;
 const b=new InferenceBroker({source:{claim:async()=>used?null:(used=true,request),apply:async()=>applied++,fail:async()=>failed++},provider:()=>new Promise(r=>resolve=r),timeoutMs:20});
 await b.pump();await delay(35);assert.equal(failed,1);resolve({});await delay(2);assert.equal(applied,0);b.close();
 let done;used=false;const c=new InferenceBroker({source:{claim:async()=>used?null:(used=true,request),apply:async()=>applied++},provider:()=>new Promise(r=>done=r),timeoutMs:100});
 await c.pump();c.close();done({});await delay(2);assert.equal(applied,0);
});

test('witnessed acceptance replaces pending Soar memory and completes the consent wait',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
  w.addGoal('m',{id:'receipt-chain',title:'等待对方自己决定',steps:[{until:{key:'t:response-reconnect',value:'accepted'}}]});
  w.state.offers['receipt-offer']={id:'receipt-offer',from:'m',to:'t',kind:'reconnect',status:'pending',heardBy:['m','t']};
  w.transaction(tx=>tx.emit('proposal','m',['m','t'],{offer:'receipt-offer'}));
  assert.equal(w.mind.get('m','t:response-reconnect').value,'pending');
  w.state.offers['receipt-offer'].status='accepted';w.transaction(tx=>tx.emit('cooperate','t',['m','t'],{offer:'receipt-offer'}));
  assert.equal(w.mind.get('m','t:response-reconnect').value,'accepted');
  w.advanceWaitingGoals('m',w.mind.goals('m'));assert.equal(w.mind.goal('m','receipt-chain').status,'completed');
 }finally{g.destroy();}
});

test('experience-based assertiveness changes native operator eligibility, not just a label',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
  let evidence;w.transaction(tx=>{evidence=tx.emit('social-act','f',['m','f','t'],{to:'t',intent:'exclusion',text:'别一起。'});});
  const choices=[{id:'boundary',kind:'set-boundary',action:'set-boundary',target:'f',category:'ordinary',utility:0,ordinal:0},{id:'wait',kind:'wait',action:'wait',target:'none',category:'ordinary',utility:1,'utility-reason':'等一下',fallback:true,ordinal:1}];
  const before=w.brain.transact('m',w.facts('m'),choices);assert.notEqual(before.id,'boundary');
  const request=w.inbox.request('m','event-reflection');await w.inbox.apply(reply(request,{summary:'看见朋友被排斥，我决定更明确地表达界限。',evidence:[evidence],cognition:[{field:'assertiveness',delta:3,reason:'亲眼看见排斥，原来的犹豫让我不满意。'}]}));
  const after=w.brain.transact('m',w.facts('m'),choices);assert.equal(after.id,'boundary');assert.match(after.rule,/speak-up-against-exclusion/);
 }finally{g.destroy();}
});

test('a distant social goal still drives travel instead of losing to repeated nearby leisure',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
  w.choose('f'); // She really sees her classmates before leaving the classroom.
  w.state.actors.f.room='music-room';w.state.actors.f.x=0;w.state.actors.f.z=3;w.state.time=950;
  for(const key in w.state.actors.f.needs)w.state.actors.f.needs[key]=95;
  const reply=JSON.parse(readFileSync(new URL('../../research/runtime/06-f.json',import.meta.url),'utf8')).reply;
  w.addGoal('f',reply.goals[0]);
  assert.equal(w.view('f').actors.some(a=>a.id==='t'),false);
  const selected=w.choose('f');assert.equal(selected.candidate.goal,'f-retract-exclusion-privately');
  assert.equal(selected.candidate.action,'seek-contact');assert.equal(selected.candidate.target,'t');
  assert.ok(w.execute('f',selected.candidate,'travel-for-personal-goal',selected.decision).ok);
  assert.equal(w.state.tasks.f.phase,'travel');assert.ok(w.state.tasks.f.points.some(p=>p.room==='classroom'));
 }finally{g.destroy();}
});
