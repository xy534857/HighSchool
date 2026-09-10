import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createFoundation,encodeFoundationSave,decodeFoundationSave,compilePolicy} from '../../dist/foundation/index.js';
const rootURL=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL('dist/foundation/'+p,rootURL),'utf8');
const content=JSON.parse(fs.readFileSync(new URL('dist/content/campus-tuning.json',rootURL))),scenario=JSON.parse(fs.readFileSync(new URL('dist/content/campus-scene.json',rootURL)));
const root=await createFoundation({read,content,scenario,wasmBinary:fs.readFileSync(new URL('dist/soar/soar.wasm',rootURL))});
const make=extra=>createFoundation({read,content,scenario,runtime:root.brain.native,...extra});
const results=[];
function floor(w,id){for(let n=0;n<24;n++){if(w.view(id).actor.hasFloor)return;w.advance(.5);}throw Error('No floor');}
function start(w){assert.equal(w.control('t','start-conversation',{roles:{target:'m'}}).ok,true);w.advance(2);}
function offer(w){floor(w,'t');assert.equal(w.control('t','ask-loan',{roles:{target:'m',item:'notes'},args:{due:w.state.time+40}}).ok,true);w.advance(2);return Object.values(w.state.offers)[0];}
function reply(w,r,rules,goals=[]){return {requestId:r.id,epoch:r.epoch,baseRevision:r.baseRevision,contentRevision:r.contentRevision,evidence:r.context.events.filter(e=>e.kind==='proposal'||e.kind==='question').map(e=>e.uid),rules,goals,source:compilePolicy(r.owner,rules,w.tuning)};}
async function acceptAndGive(w,o){
 const r=[...w.inbox.pending.values()].find(r=>r.owner==='m');assert.ok(r);
 await w.inbox.apply(reply(w,r,[{id:'fixture-accept',select:{action:'accept-offer','offer-kind':'loan'},priority:80,reason:'执行测试中的借阅策略。'}],[{id:'deliver-authorized-item',title:'交出已经同意借出的物品',steps:[{action:'hand-over',roles:{offer:o.id,target:'t',item:'notes'}}]}]));
 w.advance(4);
}

test('native Soar rules produce consent, anchored transfer, persistent goal and exactly-once return',async()=>{
 const w=await make();try{start(w);const o=offer(w);assert.equal(w.state.objects.notes.holder,'m');await acceptAndGive(w,o);
  assert.equal(w.state.offers[o.id].status,'accepted');assert.equal(w.state.objects.notes.holder,'t',JSON.stringify({offers:w.view('m').offers,goals:w.mind.goals('m'),candidates:w.candidates('m')}));
  assert.equal(w.mind.goal('m','deliver-authorized-item').status,'completed');
  assert.ok(w.state.events.some(e=>e.rule==='learned*m*fixture-accept'));
  const count=w.state.events.filter(e=>e.kind==='object-transferred').length;w.advance(2);assert.equal(w.state.events.filter(e=>e.kind==='object-transferred').length,count);
  const command='return-exactly-once';const ret=w.control('t','return-loan',{roles:{offer:o.id,target:'m',item:'notes'}},command);assert.equal(ret.ok,true);w.advance(2);
  assert.equal(w.state.objects.notes.holder,'m');assert.equal(w.state.appointments['appointment:'+o.id].status,'fulfilled');
  const after=w.state.events.length;assert.equal(w.control('t','return-loan',{},command).status,'completed');assert.equal(w.state.events.length,after);
  results.push({test:'loan-chain',rules:w.state.events.filter(e=>e.rule).map(e=>e.rule),goal:w.mind.goal('m','deliver-authorized-item').status,commitment:'fulfilled'});
 }finally{w.destroy();}
});

test('a new object and interaction are added by tuning alone, with atomic resource effects',async()=>{
 const w=await make();try{
  const extension=JSON.parse(fs.readFileSync(new URL('dist/content/club-extension.json',rootURL)));
  w.extendContent(extension,[{id:'art-kit',type:'drawing-kit',room:'classroom',x:0,z:1}]);
  const r=w.inbox.request('m','new-club-task');await w.inbox.apply(reply(w,r,[{id:'make-poster',select:{action:'draw-poster','goal-step':true},priority:70,reason:'使用新内容包提供的绘画能力。'}],[{id:'poster-task',title:'完成一张海报',steps:[{action:'draw-poster',roles:{item:'art-kit'}}]}]));
  for(let n=0;n<16&&w.mind.goal('m','poster-task').status!=='completed';n++)w.advance(.5);
  assert.equal(w.state.objects['art-kit'].state.paper,1);assert.ok(w.state.events.some(e=>e.kind==='poster-drawn'));
  // All role declarations may be serialized in any key order.
  const spec=w.tuning.pack.actions['hand-over'];spec.roles=Object.fromEntries(Object.entries(spec.roles).sort());w.tuning.validate();
  assert.throws(()=>w.extendContent({actions:{bad:{label:'bad',executor:'instant',duration:0,effects:[{type:'run-javascript'}]}}}),/Unknown effect/);
  const energy=w.state.actors.t.needs.energy;
  w.extendContent({actions:{'failed-bundle':{label:'失败事务',executor:'instant',duration:0,roles:{item:{from:'objects'}},effects:[{type:'need.change',need:'energy',amount:10},{type:'object.add',object:'$item.id',field:'paper',amount:-999}]}}});
  assert.equal(w.control('t','failed-bundle',{roles:{item:'art-kit'}}).ok,false);assert.equal(w.state.actors.t.needs.energy,energy);assert.equal(w.state.objects['art-kit'].state.paper,1);
  results.push({test:'tuning-only-extension',newType:'drawing-kit',newAction:'draw-poster',engineEdits:0,atomicFailure:true});
 }finally{w.destroy();}
});

test('beds and seats require travel and a unique slot; busy resources cannot duplicate',async()=>{
 const w=await make();try{
  const origin={...w.state.actors.t};assert.equal(w.control('t','rest',{roles:{item:'infirmary-bed'}}).ok,true);
  assert.equal(w.state.actors.t.pose,'standing');assert.equal(w.perform('m','rest',{roles:{item:'infirmary-bed'}}).ok,false);
  for(let n=0;n<50&&w.state.tasks.t?.phase!=='perform';n++)w.advance(.5,{autonomy:false});
  assert.equal(w.state.actors.t.room,'infirmary');assert.equal(w.state.actors.t.pose,'sleeping');assert.notEqual(w.state.actors.t.room,origin.room);
  w.advance(11,{autonomy:false});assert.equal(w.state.tasks.t,undefined);assert.deepEqual(w.state.leases,{});
  assert.throws(()=>w.control('m','wait'),/player-controlled/);
 }finally{w.destroy();}
});

test('conversation delivery, late joins, group consent and replies use actual participants',async()=>{
 const w=await make();try{
  start(w);const sid=w.state.actors.t.session;assert.equal(w.state.actors.m.session,sid);assert.equal(w.state.actors.f.session,null);
  assert.equal(w.control('t','say',{roles:{target:'m'},args:{text:'私下收到的一条信息'}}).ok,false,'M currently has the floor');
  floor(w,'t');const secret=w.control('t','ask-question',{roles:{target:'m'},args:{key:'notes:pages',text:'笔记有几页？'}});assert.equal(secret.ok,true);
  const question=w.state.events.findLast(e=>e.kind==='question');assert.equal(w.state.observed.f.includes(question.uid),false);assert.equal(w.state.observed.a.includes(question.uid),false);
  assert.equal(w.control('t','make-group',{roles:{target:'f'},args:{name:'学习组'}}).ok,true);const g=Object.values(w.state.groups)[0];assert.deepEqual(g.members,['t']);
  assert.equal(w.control('t','invite-group',{roles:{group:g.id}}).ok,true);w.advance(1);assert.equal(w.state.actors.f.session,sid);assert.ok(w.state.groups[g.id].members.includes('f'));
  assert.equal(w.state.observed.f.includes(question.uid),false,'Joining does not replay history');
  const context=w.modelContext('a');assert.equal(context.events.some(e=>e.uid===question.uid),false);
  floor(w,'t');assert.equal(w.control('t','say',{roles:{target:'m'},args:{text:'欢迎一起讨论'}}).ok,true);const shared=w.state.events.findLast(e=>e.kind==='speech');assert.ok(shared.recipients.includes('f'));
  results.push({test:'shared-conversation',members:3,noBackfill:true,noRemoteKnowledge:true});
 }finally{w.destroy();}
});

test('native plans, remaining action time and personal facts survive saves; old replies fail',async()=>{
 const w=await make();let restored;try{
  w.addGoal('m',{id:'study-once',title:'先完成这一段学习',steps:[{action:'study',roles:{item:'desk-1'}}]});
  for(let n=0;n<12&&w.state.tasks.m?.phase!=='perform';n++)w.advance(.5);
  assert.equal(w.state.tasks.m?.phase,'perform');const remaining=w.state.tasks.m.remaining;
  const request=w.inbox.request('m','later-reflection');
  const saved=decodeFoundationSave(encodeFoundationSave(w));restored=await make({saved});
  assert.equal(restored.state.tasks.m.remaining,remaining);assert.equal(restored.mind.goal('m','study-once').stage,0);
  const next=restored.inbox.request('m','later-reflection');assert.notEqual(next.epoch,request.epoch);
  await assert.rejects(()=>restored.inbox.apply(reply(w,request,[{id:'late',select:{action:'wait'},priority:1,reason:'旧请求'}])),/Stale/);
  restored.advance(10);assert.equal(restored.mind.goal('m','study-once').status,'completed');assert.equal(w.mind.goal('m','study-once').status,'active');
  results.push({test:'native-save',sameRemaining:true,goalResumed:true,oldReplyRejected:true});
 }finally{w.destroy();restored?.destroy();}
});

test('rule schemas reject unknown capabilities and stale evidence without replacing valid policy',async()=>{
 const w=await make();try{
  const r=w.inbox.request('m','initial-policy');const good=reply(w,r,[{id:'local-wait',select:{action:'wait'},priority:1,reason:'等待'}]);await w.inbox.apply(good);const revision=w.brain.rev.m;
  const r2=w.inbox.request('m','invalid-policy');const bad=reply(w,r2,[{id:'still-wait',select:{action:'wait'},priority:1,reason:'等待'}]);bad.evidence=['another-persons-secret'];await assert.rejects(()=>w.inbox.apply(bad),/Evidence/);assert.equal(w.brain.rev.m,revision);
  assert.throws(()=>compilePolicy('m',[{id:'bad',select:{action:'teleport-secret'},priority:20,reason:'bad'}],w.tuning),/Unknown/);
  bad.evidence=[];bad.source='sp {arbitrary --> (halt)}';await assert.rejects(()=>w.inbox.apply(bad),/Source differs/);assert.equal(w.brain.rev.m,revision);
  const r3=w.inbox.request('m','dependent',['notes:status']);w.mind.write('m',{subject:'notes',predicate:'status',value:'changed',root:'local-change'});
  await assert.rejects(()=>w.inbox.apply(reply(w,r3,[{id:'old',select:{action:'wait'},priority:1,reason:'旧认知'}])),/Changed relevant/);
 }finally{w.destroy();}
});

test('missed commitments produce one native directed social record, not global mood changes',async()=>{
 const w=await make();try{start(w);const o=offer(w);await acceptAndGive(w,o);w.advance(45,{autonomy:false});
  const id='appointment:'+o.id;assert.equal(w.state.appointments[id].status,'missed');assert.equal(w.state.events.filter(e=>e.kind==='brokenPromise'&&e.appointment===id).length,1);
  const record=w.mind.get('m','t:'+id);assert.equal(record.emotion,'angry');assert.equal(w.mind.get('a','t:'+id),null);
 }finally{w.destroy();}
});

test('paused work releases its slot, resumes remaining progress, and cancellation keeps the goal',async()=>{
 const w=await make();try{
  w.addGoal('m',{id:'finish-study',title:'继续自己的学习',steps:[{action:'study',roles:{item:'desk-1'}}]});
  for(let n=0;n<12&&w.state.tasks.m?.phase!=='perform';n++)w.advance(.5);
  const duration=w.state.tasks.m.remaining;start(w);assert.equal(w.state.tasks.m,undefined);assert.ok(w.state.suspended.m.remaining<duration);
  assert.equal(w.state.leases['desk-1:seat'],undefined);
  const remaining=w.state.suspended.m.remaining;assert.equal(w.control('t','leave-conversation').ok,true);w.advance(.5,{autonomy:false});
  assert.ok(w.state.tasks.m.remaining<=remaining);assert.equal(w.mind.goal('m','finish-study').stage,0);
  assert.equal(w.cancel('m','test-interruption'),true);assert.equal(w.state.tasks.m,undefined);assert.equal(w.mind.goal('m','finish-study').stage,0);
  w.advance(12);assert.equal(w.mind.goal('m','finish-study').status,'completed');
  results.push({test:'interrupt-resume',slotReleased:true,goalRetained:true});
 }finally{w.destroy();}
});

test('core modules contain no campus content IDs and observed provenance survives a multi-turn answer',async()=>{
 const files=fs.readdirSync(new URL('dist/foundation/',rootURL)).filter(p=>p.endsWith('.js')||p.endsWith('.soar'));
 for(const f of files){const source=fs.readFileSync(new URL('dist/foundation/'+f,rootURL),'utf8');assert.doesNotMatch(source,/['"](?:notes|classroom|loan|prom|drawing-kit|draw-poster|t|m|f)['"]|from ['"].*simulation\.js/,'Content leak in '+f);}
 const w=await make();try{
  start(w);const o=offer(w);await acceptAndGive(w,o);floor(w,'t');w.control('t','ask-question',{roles:{target:'m'},args:{key:o.id+':status',text:'刚才说好的还作数吗？'}});w.advance(2);
  const r=[...w.inbox.pending.values()].find(r=>r.reason.startsWith('unhandled-question'));assert.ok(r);
  await w.inbox.apply(reply(w,r,[{id:'answer-the-question',select:{action:'answer-known'},priority:80,reason:'用自己的已知事实回答对方。'}]));
  w.advance(3);const answer=w.state.events.findLast(e=>e.kind==='information');assert.ok(answer?.replyTo);assert.equal(answer.claim.value,'accepted');
  assert.equal(w.mind.get('t',o.id+':status').provenance,answer.claim.root);assert.equal(w.state.answers['m:'+answer.replyTo],answer.uid);
  assert.equal(w.state.observed.f.includes(answer.uid),false);assert.match(answer.text,/已经答应/);
  results.push({test:'multi-turn-answer',replyTo:answer.replyTo,preservedProvenance:true,noObserverLeak:true});
 }finally{w.destroy();}
});

test.after(()=>{fs.writeFileSync(new URL('research/foundation/mechanism-verification.json',rootURL),JSON.stringify({kind:'mechanism tests; not a personality quality benchmark',externalAPICalls:0,results},null,2)+'\n');root.destroy();});
