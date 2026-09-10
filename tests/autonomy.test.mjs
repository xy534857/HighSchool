import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Household,SPOTS,route,ACTIONS} from '../dist/simulation.js';
import {SoarController,loadSources,splitProductions} from '../dist/soar/controller.js';
import {DOMAIN} from '../dist/domain.js';import {registerAction} from '../dist/domain/validate.js';
import {encodeSave,decodeSave} from '../dist/storage.js';
const read=p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8');
const sources=await loadSources(read),learned=read('soar/learned/xing-v2.soar');
const wasm=fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url));
const root=await SoarController.create(sources,{wasmBinary:wasm});
const fresh=()=>new SoarController(root.native,sources),make=(seed=123,saved=null)=>new Household(seed,saved, {calendar:false,director:false}).attachBrain(fresh());
const evidence=[];
function init(b,id){b.create(id);b.initGoal(id,1,DOMAIN.goals[id]);}
function response(b,id,kind='quiet',from='xue',extra={}){return b.decide(id,{mode:'response',request:kind,from,fun:30,busy:true,'active-task':'watch',contract:DOMAIN.contracts[kind],time:1000,...extra},(kind==='help'?['accept','decline','defer']:['accept','decline']).map((kind,i)=>({id:'a'+i,kind,target:from,ordinal:i})));}
function event(uid,kind,actor,extra={}){return {uid,type:'event',kind,actor,source:'self',time:100,text:kind,action:'none',...extra};}
function qvalue(b,id,concern,method){const text=b.cli(id,`print rl*${id}*${concern}*${method}`);return Number(text.match(/=\s*(-?[\d.]+)/)?.[1]);}

test('five native agents select actual actions and distinct character productions',()=>{
 assert.equal(wasm.subarray(0,4).toString('hex'),'0061736d');const s=make();try{s.advance(4);assert.equal(s.brain.ids.size,5);for(const p of s.people){assert.ok(p.decision.ok);assert.ok(p.task||p.conversationId);assert.ok(p.decision.fired.includes('core*emit-selected-command'));}assert.equal(s.person('xing').task.rule,'plan*execute-guided-step');assert.equal(s.person('xing').plan.method,'break-first');assert.equal(s.person('xing').task.planBasis,'agreed-break');assert.equal(s.person('xue').task.planBasis,'advance-milestone');assert.equal(s.person('xue').plan.method,'focus');}finally{s.brain.destroy();}
});

test('native SMem stores beliefs and updates a persistent goal, never a JavaScript history counter',()=>{
 const b=fresh();init(b,'xing');try{b.observe('xing',event('own','distraction','xing'));assert.equal(b.recall('xing',{type:'belief',owner:'xing',predicate:'disrupts-my-goal'}).memory.evidence,'own');assert.equal(b.progress('xing','study',20).progress,20);assert.equal(b.initGoal('xing',2,DOMAIN.goals.xing).progress,20);assert.equal(b.progress('xing','study',46).status,'done');assert.equal(b.initGoal('xing',2,DOMAIN.goals.xing).progress,0);}finally{b.destroy();}
});

test('personal perception and hearsay remain isolated; EpMem-based revision requires first-hand evidence',async()=>{
 const b=fresh();init(b,'xing');init(b,'xue');try{await b.install('xing',learned);assert.equal(response(b,'xing').kind,'decline');b.observe('xue',event('remote','distraction','xue'));assert.equal(b.recall('xing',{uid:'remote'}).kind,'not-found');b.observe('xing',event('hearsay','distraction','xing',{source:'heard',informant:'xue'}));assert.equal(response(b,'xing').kind,'decline');assert.equal(b.recall('xing',{type:'belief',predicate:'disrupts-my-goal'}).kind,'not-found');b.observe('xing',event('own','distraction','xing'));const d=response(b,'xing');assert.equal(d.kind,'accept');assert.equal(d.recollection.uid,'own');assert.equal(d['memory-source'],'epmem');assert.equal(d.interpretation.evidence,'own');assert.equal(response(b,'xing','quiet','dad').kind,'accept');assert.equal(response(b,'xing','help','dad').kind,'decline');evidence.push({name:'episodic-cognitive-revision',kind:d.kind,memory:d.recollection,interpretation:d.interpretation,trace:d.fired});}finally{b.destroy();}
});

test('different people recall different evidence and change their appraisal, not just personality text',()=>{
 const b=fresh();for(const id of ['xue','dad','me','xiaoyu'])init(b,id);try{
 const before=response(b,'xue','help','me',{'active-task':'study'});assert.equal(before.kind,'defer');b.observe('xue',event('helped','cooperate','me',{source:'seen',target:'xue'}));const after=response(b,'xue','help','me',{'active-task':'study'});assert.equal(after.kind,'accept');assert.equal(after.concern,'return-help');assert.equal(after.interpretation.evidence,'helped');
 assert.equal(response(b,'dad','help','xing').kind,'accept');b.observe('dad',event('refused','refuse','xing',{source:'seen',target:'xue'}));const dad=response(b,'dad','help','xing');assert.equal(dad.kind,'defer');assert.equal(dad.concern,'repair-trust');
 assert.equal(response(b,'me','help','xing').kind,'accept');b.observe('me',event('owe','commitment','xing',{source:'seen',target:'me',action:'tidy',deadline:1100}));assert.equal(response(b,'me','help','xing').concern,'accountability');
 assert.equal(response(b,'xiaoyu','help','me',{fun:20}).kind,'decline');assert.equal(response(b,'xiaoyu','help','me',{fun:80}).kind,'accept');evidence.push({name:'personal-appraisal',xueBefore:before.concern,xueAfter:after.concern,dad:dad.concern});
 }finally{b.destroy();}
});

test('native chunking compiles a subgoal and reuses its reasoning with correct conditions',()=>{
 const b=fresh();init(b,'xing');try{const first=response(b,'xing');assert.ok(first.fired.includes('cognition*evaluate-compatible-request'));const chunks=b.cli('xing','print --chunks --full');assert.match(chunks,/sp \{chunk/);b.cli('xing','excise cognition*evaluate-compatible-request');const again=response(b,'xing');assert.equal(again.kind,first.kind);assert.ok(again.fired.some(n=>n.startsWith('chunk')));const incompatible=response(b,'xing','help');assert.equal(incompatible['goal-threat'],'yes');assert.ok(incompatible.fired.includes('cognition*evaluate-interruption'));evidence.push({name:'native-chunking',firstCycles:first.cycles,reuseCycles:again.cycles,source:chunks});}finally{b.destroy();}
});

test('native RL learns from measured outcomes, changes a choice, and consumes each outcome once',()=>{
 const b=fresh();init(b,'xing');init(b,'dad');try{const decision=response(b,'xing');const before=qvalue(b,'xing','self-direction','protect-plan'),other=qvalue(b,'dad','common-ground','accommodate');assert.equal(before,3);const fx={'outcome-id':'r0','kept-activity':0,'request-satisfied':0,'social-cost':1};b.feedback('xing',decision,fx);const once=qvalue(b,'xing','self-direction','protect-plan');assert.ok(once<before);b.feedback('xing',decision,fx);assert.equal(qvalue(b,'xing','self-direction','protect-plan'),once);for(let i=1;i<8;i++)b.feedback('xing',decision,{...fx,'outcome-id':'r'+i});assert.equal(response(b,'xing').kind,'accept');assert.equal(qvalue(b,'dad','common-ground','accommodate'),other);const trained=qvalue(b,'xing','self-direction','protect-plan');for(let i=0;i<3;i++)b.observe('xing',event('normal'+i,'daily','xing'));assert.equal(qvalue(b,'xing','self-direction','protect-plan'),trained);evidence.push({name:'native-rl',before,once,trained,nextChoice:'accept',personalReward:b.training.xing.at(-1).reward});}finally{b.destroy();}
});

test('commitments are native records with completion, breach, and cancellation semantics',()=>{
 const s=make();const b=s.brain,p=s.person('xing');try{for(const id of ['xing','me'])b.observe(id,event('promise1','commitment','xing',{target:'me',action:'tidy',deadline:s.time+10,source:id==='xing'?'self':'seen'}));p.fun=90;p.hunger=90;p.energy=90;const d=b.decide('xing',s.facts(p),s.affordances(p));assert.equal(d.kind,'tidy');assert.equal(d.commitment.uid,'promise1');const overdue=b.decide('xing',{...s.facts(p),time:s.time+11},s.affordances(p));assert.equal(overdue.breach.uid,'promise1');b.updateCommitment('xing','promise1','broken');assert.equal(b.recall('xing',{type:'commitment',uid:'promise1'}).memory.status,'broken');assert.equal(b.completeAction('xing','tidy').commitment.status,'fulfilled');assert.equal(b.completeAction('xing','tidy').kind,'no-contract');b.observe('xing',event('cancel1','commitment','xing',{target:'me',action:'tidy',deadline:2000}));b.updateCommitment('xing','cancel1','cancelled');assert.equal(b.completeAction('xing','tidy').kind,'no-contract');}finally{b.destroy();}
});

test('a deferred request waits for the current task and earns no reward until real fulfilment',()=>{
 const s=make();try{for(const p of s.people)p.nextDecision=s.time+100;const x=s.person('xue'),m=s.person('me');x.x=SPOTS.desk.x;x.z=SPOTS.desk.z;m.x=x.x+1;m.z=x.z;assert.ok(s.command('xue','study').ok);s.beginDoing(x);s.home.clean=40;s.ask(m,x,'help');const r=s.requests.at(-1);s.resolveRequest(r);assert.equal(r.result,'deferred');assert.equal(s.brain.training.xue.length,0);assert.equal(x.action,'study');x.nextDecision=s.time;for(let i=0;i<260&&r.learning.status==='waiting';i++)s.tick(.25);assert.equal(r.learning.status,'consumed');assert.equal(s.brain.recall('xue',{uid:r.commitment,type:'commitment'}).memory.status,'fulfilled');assert.equal(s.brain.training.xue.at(-1).effect['request-satisfied'],1);assert.equal(s.brain.training.xue.at(-1).effect['kept-activity'],1);}finally{s.brain.destroy();}
});

test('full portable save restores SQLite memories, chunks, learned values, goals and active execution',async()=>{
 const s=make();let restored;try{s.advance(8);s.brain.observe('xing',event('remember-me','distraction','xing'));await s.brain.install('xing',learned);const d=response(s.brain,'xing');s.brain.feedback('xing',d,{'outcome-id':'saved-outcome','kept-activity':0,'request-satisfied':0,'social-cost':1});s.brain.observe('xing',event('saved-promise','commitment','xing',{target:'me',action:'tidy',deadline:1500}));const saved=decodeSave(encodeSave(s.save()));s.brain.observe('xing',event('future','daily','xing'));restored=make(123,saved);const b=restored.brain;assert.equal(b.recall('xing',{uid:'remember-me'}).memory.uid,'remember-me');assert.equal(b.recall('xing',{uid:'future'}).kind,'not-found');assert.equal(b.recall('xing',{uid:'saved-promise',type:'commitment'}).memory.status,'pending');assert.equal(response(b,'xing').recollection.uid,'remember-me');assert.equal(qvalue(b,'xing','mutual-space','accommodate'),qvalue(s.brain,'xing','mutual-space','accommodate'));assert.ok(b.cli('xing','print --chunks --full').includes('sp {chunk'));assert.ok(b.outcomes.xing.has('saved-outcome'));for(const p of restored.people){assert.equal(p.goals[0].progress,s.person(p.id).goals[0].progress);assert.deepEqual(p.task,JSON.parse(JSON.stringify(s.person(p.id).task)));}const before=restored.person('xue').goals[0].progress;restored.advance(2);s.advance(2);assert.ok(restored.person('xue').goals[0].progress>=before);for(const p of restored.people){assert.equal(p.goals[0].progress,s.person(p.id).goals[0].progress);assert.equal(p.task?.earned,s.person(p.id).task?.earned);}evidence.push({name:'full-save',bytes:encodeSave(saved).length,memories:Object.fromEntries(Object.entries(saved.cognition.people).map(([id,p])=>[id,{smem:p.native.smem.length,epmem:p.native.epmem.length}]))});}finally{restored?.brain.destroy();s.brain.destroy();}
});

test('rule installation rejects invalid productions transactionally and withdrawal reverses interpretation',async()=>{
 const b=fresh();init(b,'xing');try{b.observe('xing',event('own','distraction','xing'));response(b,'xing');await b.install('xing',learned);assert.equal(response(b,'xing').kind,'accept');const rev=b.rev.xing;await assert.rejects(()=>b.install('xing','sp {learned*bad (state <s> ^superstate nil) --> (<s> ^operator )}'));assert.equal(b.rev.xing,rev);assert.equal(response(b,'xing').kind,'accept');await assert.rejects(()=>b.install('xing','sp {learned*bad (state <s>) --> (halt)}'));assert.throws(()=>splitProductions('source arbitrary.soar'));b.remove('xing');assert.equal(response(b,'xing').kind,'decline');}finally{b.destroy();}
});

test('shared tuning can add an executable activity without a new host decision branch',async()=>{
 const s=make();try{assert.throws(()=>registerAction(s.domain,'bad',{label:'bad',duration:1,resource:['sofa'],finish:{'self.unknown':5}}));registerAction(s.domain,'stretch',{label:'伸展一下',duration:2,resource:['sofa'],finish:{'self.energy':12},satisfies:'rest'});const x=s.person('xing');x.energy=55;x.fun=80;x.hunger=90;await s.brain.install('xing',`sp {learned*stretch (state <s> ^context <c>) (<c> ^frame <f> ^memory-ready yes) (<f> ^mode act ^busy no ^available <a>) (<a> ^kind stretch) --> (<s> ^operator <o> +) (<o> ^name choose ^choice <a> ^priority 120 ^rule learned*stretch ^reason |伸展一下|)}`);s.decide(x);assert.equal(x.action,'stretch');x.x=SPOTS.sofa.x;x.z=SPOTS.sofa.z;s.beginDoing(x);const before=x.energy;s.tickTask(x,2);assert.equal(x.energy,before+12);assert.ok(s.events.some(e=>e.text.includes('完成了伸展一下')));}finally{s.brain.destroy();}
});

test('exclusive resources, changed conditions and physical perception constrain autonomous choices',()=>{
 const s=make();try{assert.ok(s.command('xue','study').ok);assert.equal(s.command('dad','work').ok,true);assert.notEqual(s.person('dad').task.resource,s.person('xue').task.resource);s.environment('desk');assert.equal(s.person('xue').task,null);assert.equal(s.command('dad','work').ok,false);const a=s.person('xing'),b=s.person('xue');a.x=6;a.z=4;b.x=-6;b.z=-4;const e=s.emit('result',a,'拿起一本书。');assert.equal(s.brain.recall('xue',{uid:'event-'+e.id}).kind,'not-found');for(const point of Object.values(SPOTS))assert.ok(route({x:0,z:2},point));}finally{s.brain.destroy();}
});

test.after(()=>{fs.writeFileSync(new URL('../research/core-verification.json',import.meta.url),JSON.stringify({kernel:'Soar 9.6.5 / C++ WebAssembly',ruleAuthor:'ChatGPT',externalApiCalls:0,results:evidence},null,2));root.destroy();});
