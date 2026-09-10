import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Household} from '../dist/simulation.js';
import {SoarController,loadSources} from '../dist/soar/controller.js';
import {DOMAIN} from '../dist/domain.js';
const read=p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8');
const sources=await loadSources(read);
const root=await SoarController.create(sources,{wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url))});
const fresh=()=>new SoarController(root.native,sources);
const epsilon=(b,id)=>Number(b.cli(id,'decide indifferent-selection --epsilon'));

test('all five native agents enable exploration on new games and restored saves',()=>{
 const s=new Household(123).attachBrain(fresh());let saved;
 try{for(const p of s.people){assert.equal(epsilon(s.brain,p.id),.1);assert.equal(s.brain.cli(p.id,'decide indifferent-selection').trim(),'epsilon-greedy');}saved=s.save();}finally{s.brain.destroy();}
 const resumed=new Household(123,saved).attachBrain(fresh());
 try{for(const p of resumed.people)assert.equal(epsilon(resumed.brain,p.id),.1);}finally{resumed.brain.destroy();}
});

test('identical social requests explore alternatives while explicit rejection remains binding',()=>{
 function sample(e,forbidAccept=false){
  const b=fresh();b.create('xing');b.initGoal('xing',1,DOMAIN.goals.xing);
  try{
   b.cli('xing',`decide indifferent-selection --epsilon ${e}`);b.cli('xing','decide srand 20260908');
   if(forbidAccept)b.loadNative(b.ids.get('xing'),`sp {test*forbid-accept
    (state <s> ^operator <o> +) (<o> ^name response-method ^method accommodate)
    --> (<s> ^operator <o> -)
   }`);
   const counts={accept:0,decline:0};
   for(let i=0;i<300;i++){
    const r=b.decide('xing',{mode:'response',request:'quiet',from:'xue',fun:30,busy:true,'active-task':'watch',contract:DOMAIN.contracts.quiet,time:1000},['accept','decline'].map((kind,ordinal)=>({id:'a'+ordinal,kind,target:'xue',ordinal})));
    assert.ok(r.kind in counts);assert.ok(r.rule&&r.reason);counts[r.kind]++;
   }
   return counts;
  }finally{b.destroy();}
 }
 const greedy=sample(0),exploring=sample(.1),constrained=sample(1,true);
 assert.equal(greedy.accept,0);assert.ok(exploring.accept>0);assert.ok(exploring.decline>exploring.accept);assert.equal(constrained.accept,0);
 console.log(JSON.stringify({greedy,epsilonPointOne:exploring,explicitRejection:constrained}));
});

test('a full autonomous day with exploration retains meals, physical needs and real situation actions',async()=>{
 const s=new Household(123).attachBrain(fresh());
 try{
  await s.brain.install('xing',read('soar/learned/xing-v2.soar'));
  s.brain.cli('xing','decide srand 20260908');let minimumNeed=100;
  for(let i=0;i<1440*4;i++){
   s.tick(.25);
   for(const p of s.people){minimumNeed=Math.min(minimumNeed,p.hunger,p.energy);assert.ok(p.hunger>0&&p.energy>0);if(p.task?.resource)assert.equal(s.leases[p.task.resource],p.id);}
   for(const key of ['food','ingredients','snacks','money'])assert.ok(s.home[key]>=0);
  }
  const events=[...s.reviews.flatMap(r=>r.report.events),...s.dayEvents];
  assert.ok(events.some(e=>e.type==='departed'));assert.ok(events.some(e=>e.type==='returned'));
  assert.equal(events.filter(e=>e.type==='missedMeal').length,0);
  const actions=s.incidents[0].events;assert.ok(actions.length>=5);assert.ok(actions.every(e=>e.rule?.startsWith('situation*')));
  console.log(JSON.stringify({simulationMinutes:1440,minimumNeed,missedMeals:0,situationActions:actions.map(e=>e.token)}));
 }finally{s.brain.destroy();}
});
test.after(()=>root.destroy());
