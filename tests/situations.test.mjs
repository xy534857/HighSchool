import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Household,SPOTS} from '../dist/simulation.js';
import {SoarController,loadSources} from '../dist/soar/controller.js';
import {SITUATIONS} from '../dist/situations/catalog.js';
import {validateSituation,compileSituation} from '../dist/situations/schema.js';
import {situationResult} from '../dist/situations/runtime.js';
import {buildDayReport,applyReflection,reportForModel,ReflectionService} from '../dist/reflection.js';
import {planEpisode} from '../dist/director.js';
import {encodeSave,decodeSave} from '../dist/storage.js';
const sources=await loadSources(p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8'));
const root=await SoarController.create(sources,{wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url))});
const make=(scenario='detective',saved=null)=>new Household(123,saved,{scenario}).attachBrain(new SoarController(root.native,sources));
const evidence=[];
function run(s,minutes){const end=s.time+minutes;while(s.time<end)s.tick(.25);return s.incidents[0].events;}
function record(s,label){const c=s.incidents[0];evidence.push({label,events:c.events.map(e=>({id:e.id,time:e.time,actor:e.actor,token:e.token,text:e.text,reason:e.reason,rule:e.rule,heardBy:e.observedBy})),objects:c.objects,economy:s.storyEconomy,debts:c.debts,needs:s.people.map(p=>({id:p.id,hunger:p.hunger,energy:p.energy})),missedMeals:s.reviews.flatMap(r=>r.report.events).concat(s.dayEvents).filter(e=>e.type==='missedMeal').map(e=>({day:e.day,id:e.actor,slot:e.slot}))});}

test('four authored situation packages compile into actual native Soar rules and produce distinct autonomous interactions',()=>{
 for(const id of ['detective','reports','chores','fear']){const s=make(id);try{
  const events=run(s,1850);assert.ok(events.length>=5,id+' had no meaningful interactions');
  assert.ok(events.every(e=>e.reason&&e.rule?.startsWith('situation*')),id+' did not use Soar');
  assert.ok(events.filter(e=>e.effects.some(f=>f.op==='tell')).every(e=>e.observedBy.length>=2));
  const c=s.incidents[0],tokens=events.map(e=>e.token);
  if(id==='detective'){assert.ok(tokens.includes('repair-toy'));assert.ok(tokens.includes('return-album'));assert.ok(!events.some(e=>e.token==='decline-repair'&&e.time>events.find(e=>e.token==='repair-toy').time));assert.equal(c.objects.find(o=>o.id==='toy').condition,'repaired');assert.ok(c.debts.every(d=>d.paid));assert.equal(s.storyEconomy.wallets.dad,50);}
  if(id==='reports'){assert.ok(tokens.includes('accept-secret-deal'));assert.ok(tokens.includes('pay-for-promise'));assert.ok(tokens.includes('discuss-incentive'));assert.equal(s.storyEconomy.policies['pay-for-reports'],false);assert.equal(s.storyEconomy.wallets.xing,5);}
  if(id==='chores'){assert.ok(tokens.includes('reject-quick-job'));assert.ok(tokens.includes('redo-job'));assert.ok(tokens.includes('pay-xing'));const pay=events.find(e=>e.token==='pay-xing');assert.ok(events.some(e=>e.token==='redo-job'&&e.time<pay.time));assert.equal(c.work.xing.quality,3);assert.ok(!tokens.includes('proper-job'),'must not redo an already finished job');const re=events.find(e=>e.token==='resubmit');assert.ok(re&&re.time<pay.time,'repayment must follow the renewed inspection request');}
  if(id==='fear'){assert.ok(tokens.includes('question-bravery'));assert.ok(tokens.includes('comfort-child'));assert.ok(tokens.includes('leave-light'));assert.equal(s.storyEconomy.policies['night-light'],true);assert.equal(s.brain.mindRead('xing','habit-fear:avoid-scary',s.time).record.value,'yes');}
  for(const p of s.people)assert.ok(p.hunger>15&&p.energy>15);
  record(s,id);console.log('observed situation',id,'events',events.length);
 }finally{s.brain.destroy();}}
});

test('same starting world diverges after an assistant-authored rule change: early confession prevents the misplaced album and accusation',async()=>{
 const s=make();try{
  const pack=structuredClone(SITUATIONS[0]);const move=pack.actions.find(a=>a.id==='put-album-aside');pack.facts.permission='unknown';move.when.push(['permission','eq',true]);move.reason='画册不是我的，得到主人许可才能挪用。';
  const confess=pack.actions.find(a=>a.id==='confess');confess.priority=680;
  // Waiting for dad is a native choice, not moving him home or forcing a reply.
  // The same move capability remains available; the new native rule requires permission.
  await s.installSituationPackage(pack);const events=run(s,1850);
  assert.ok(events.some(e=>e.token==='confess'));assert.ok(!events.some(e=>e.token==='suspect-xing'));assert.equal(s.incidents[0].objects.find(o=>o.id==='album').location,'book');assert.equal(situationResult(s,{...s.episode,caseId:s.incidents[0].id}).status,'completed');
  record(s,'assistant-rule-variant');
 }finally{s.brain.destroy();}
});

test('private seeds and undelivered speech cannot teach other agents the secret; physical effects require arrival',()=>{
 const s=make();try{
  s.tickSituations();const c=s.incidents[0];assert.equal(s.known(s.person('xiaoyu'),c.id,'culprit').value,'xiaoyu');
  for(const id of ['me','dad','xue','xing'])assert.equal(s.known(s.person(id),c.id,'culprit'),undefined);
  const yu=s.person('xiaoyu'),a=c.pack.actions.find(a=>a.id==='ask-brother');s.recordIncidentTurn({topic:{kind:'incident'}},yu,{caseId:c.id,token:a.id,deliveredTo:[],stamp:1});assert.equal(s.known(s.person('xing'),c.id,'culprit'),undefined);
  const repair=c.pack.actions.find(a=>a.id==='repair-toy');assert.equal(s.applyIncident(c,s.person('xue'),repair),false);
 }finally{s.brain.destroy();}
});

test('native memories, in-flight actions, money, item conditions and scenario version survive save/load without duplicate payment',()=>{
 const s=make();let saved;try{run(s,160);saved=decodeSave(encodeSave(s.save()));}finally{s.brain.destroy();}
 const r=make('detective',saved);try{run(r,1900);const c=r.incidents[0],payments=r.storyEconomy.ledger.filter(e=>e.caseId===c.id);assert.ok(payments.filter(e=>e.from==='dad').length<=1);assert.ok(payments.filter(e=>e.from==='xiaoyu').length<=1);assert.ok(c.events.some(e=>e.token==='repair-toy'));assert.equal(r.brain.mindRead('xiaoyu',c.id+':culprit',r.time).record.value,'xiaoyu');record(r,'resume');}finally{r.brain.destroy();}
});

test('delivered turns and individual reflection contexts contain public speech without another actors private candidate beliefs',async()=>{
 const s=make();try{
  const pack=structuredClone(SITUATIONS[0]);pack.facts['private-thought']='unknown';pack.seeds.xiaoyu['private-thought']='private-canary';await s.installSituationPackage(pack);for(let i=0;i<720&&!s.incidents[0].events.some(e=>e.token==='ask-brother');i++)s.tick(.25);
  const heard=s.conversations.flatMap(c=>Object.values(c.members).flatMap(m=>m.heard));assert.ok(heard.length>0);
  assert.ok(heard.every(t=>!Object.hasOwn(t,'belief')));const context=reportForModel(buildDayReport(s),'xing');
  const received=context.events.filter(e=>e.type==='incident-event'&&e.actor!=='xing');assert.ok(received.length);assert.ok(received.every(e=>!e.reason&&!e.effects));assert.ok(!JSON.stringify(context).includes('private-canary'));
 }finally{s.brain.destroy();}
});

test('a carried object follows its actor to the destination and survives a save while moving',()=>{
 const s=make();let saved;try{for(let i=0;i<200&&!s.person('xiaoyu').task?.transport;i++)s.tick(.25);assert.ok(s.person('xiaoyu').task?.transport);assert.equal(s.incidents[0].objects.find(o=>o.id==='album').carrier,'xiaoyu');saved=decodeSave(encodeSave(s.save()));}finally{s.brain.destroy();}
 const r=make('detective',saved);try{run(r,35);const event=r.incidents[0].events.find(e=>e.token==='put-album-aside');assert.ok(event);assert.ok(Math.hypot(event.position.x-SPOTS.deskYu.x,event.position.z-SPOTS.deskYu.z)<1.5);assert.equal(r.incidents[0].objects.find(o=>o.id==='album').carrier,undefined);}finally{r.brain.destroy();}
});

test('invalid model capabilities and overwriting an already observed opening are rejected',async()=>{
 const s=make();try{const p=structuredClone(SITUATIONS[0]);p.actions[0].effects=[{op:'force-ending'}];assert.throws(()=>validateSituation(p));s.tickSituations();await assert.rejects(s.installSituationPackage(SITUATIONS[0]));assert.ok(compileSituation(SITUATIONS[0]).includes('^belief.culprit'));}finally{s.brain.destroy();}
});
test('an observed day can produce a new model-authored situation package that is validated and executed on the next day',async()=>{
 const s=make();try{
  run(s,451);assert.equal(s.day,2);const review=s.reviews[0],context=reportForModel(review.report,'director');
  const borrowed=review.report.events.find(e=>e.token==='advance-money');assert.ok(borrowed);
  const pack=structuredClone(SITUATIONS.find(p=>p.id==='chores'));pack.id='repayment-and-work';pack.title='借钱以后，家务怎么算';pack.premise='昨天家里垫过一笔赔偿钱，爸爸想把今天的家务和零用钱也说清楚。';pack.roles.dad.memory='昨天我给小雨垫过赔玩具的钱，今天希望把家里的钱与责任讲清楚。';
  const next={...planEpisode(s,s.director.history.at(-1)),continuation:null,template:pack.id,situation:pack,title:pack.title,premise:pack.premise,roles:pack.roles,basedOn:1,evidence:[borrowed.id]};
  const patch={schemaVersion:1,requestId:review.report.requestId,baseRuleVersion:s.rulesVersion,author:'ChatGPT 根据自主运行结果编写',summary:'根据实际垫款事件，安排家务验收与报酬的新情景。',changes:[],nextEpisode:next};
  fs.writeFileSync(new URL('../research/situation-model-response.json',import.meta.url),JSON.stringify({input:{episode:context.episode,evidence:borrowed},response:patch},null,2));
  let release;const service=new ReflectionService(()=>new Promise(r=>release=r));const job=service.submit(s,review);await Promise.resolve();const before=s.time;run(s,4);assert.ok(s.time>before);release(patch);await job;assert.equal(review.status,'applied');assert.equal(s.episode.template,pack.id);
  run(s,1390);const c=s.incidents.find(c=>c.pack.id===pack.id);assert.ok(c.events.some(e=>e.token==='quick-job'));assert.ok(c.events.some(e=>e.token==='reject-quick-job'));assert.ok(s.brain.cli('xing','print --all').includes('repayment-and-work'));
  evidence.push({label:'actual-day-to-new-package',basedOn:borrowed.id,package:pack.id,status:review.status,events:c.events.map(e=>({actor:e.actor,time:e.time,token:e.token,text:e.text,rule:e.rule}))});
 }finally{s.brain.destroy();}
});
test.after(()=>{if(evidence.length)fs.writeFileSync(new URL('../research/situation-verification.json',import.meta.url),JSON.stringify({kernel:'Soar 9.6.5 native WASM',liveAPICalls:0,author:'ChatGPT',observation:'unattended simulation with the same world engine used by the browser',results:evidence},null,2));root.destroy();});
