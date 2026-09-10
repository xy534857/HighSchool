import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {SchoolService} from '../../dist/campus/service.js';
import {roomPath,route,nearestFree,localPath} from '../../dist/foundation/space.js';
import {describePlans} from '../../dist/foundation/projects.js';
const options={read:p=>readFile(new URL(p,new URL('../../dist/foundation/',import.meta.url)),'utf8'),wasmBinary:await readFile(new URL('../../dist/soar/soar.wasm',import.meta.url))};
const evidence=[];
function solo(w){for(const a of Object.values(w.state.actors)){a.presence=a.id==='t'?'here':'away';for(const k in a.needs)a.needs[k]=95;}w.state.situationKeys.push('club-preparation:0','club-preparation:1');}
const until=(w,pred,max=40)=>{for(let n=0;n<max*4&&!pred();n++)w.advance(.25);assert.ok(pred(),'did not progress: '+JSON.stringify({time:w.state.time,task:w.state.tasks.t,plans:describePlans(w,'t')}));};
const E=(left,right,op='eq')=>({left,right,op});
test('every campus route uses public circulation; room entry and approach paths remain usable',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 let count=0;for(const from of Object.keys(w.state.rooms))for(const to of Object.keys(w.state.rooms)){
  const p=roomPath(w.state.rooms,from,to);assert.ok(p,from+'->'+to);assert.ok(p.slice(1,-1).every(id=>w.state.rooms[id].transit),p.join('->'));count++;
 }
 for(const target of ['infirmary','bathroom','student-center']){const p=roomPath(w.state.rooms,'classroom',target);assert.ok(!p.includes('office'));assert.ok(!p.includes('club'));}
 for(const o of Object.values(w.state.objects)){
  const allowed=w.state.actors[o.room==='bathroom-m'?'m':'t'];
  for(const slot of w.tuning.pack.types[o.type].slots||[]){const p={room:o.room,x:o.x+slot.approach.x,z:o.z+slot.approach.z};assert.ok(route(w.state,allowed,p,4),o.id+':'+slot.id);}
 }
 evidence.push({check:'public-routes',pairs:count,rooms:Object.keys(w.state.rooms).length});
 }finally{g.destroy();}
});
test('runtime-authored native plan repeats to an outcome, yields to class, and resumes after next-day load',async()=>{
 const g=await SchoolService.create(options);let h;try{
 const w=g.world;solo(w);w.state.time=901;Object.assign(w.state.actors.t,nearestFree(w.state,{room:'library',x:0,z:3},{owner:'t'},4));
 const r=w.inbox.request('t','test-personal-project');const untilResearch=E('$actor.resources.research',6,'gte');
 await w.inbox.apply({requestId:r.id,epoch:r.epoch,baseRevision:r.baseRevision,contentRevision:r.contentRevision,evidence:[],rules:[],goals:[{id:'runtime-research',title:'分两天查证并打印自己的资料',motive:'先积累依据，再制作可分享的资料。',priority:80,deadline:6000,activeWhen:E('$clock.period','after-school'),windowLabel:'放学后继续',steps:[{label:'两次资料查证',action:'use-computer',repeatUntil:untilResearch,skipWhen:untilResearch,spacingMinutes:1440},{label:'打印成品',action:'print-notes'}]}]});
 until(w,()=>w.state.events.some(e=>e.actor==='t'&&e.action==='use-computer'&&e.kind==='action-completed'));
 const firstTime=w.state.time;assert.equal(w.state.actors.t.resources.research,3);assert.equal(w.mind.goal('t','runtime-research').stage,0);assert.equal(w.state.tasks.t.candidate.goal,'runtime-research');
 w.state.time=1440+510;w.advance(1);assert.equal(w.state.tasks.t.candidate.action,'attend-class');assert.equal(w.mind.goal('t','runtime-research').stage,0);
 const saved=g.save();h=await SchoolService.create({...options,saved});const v=h.world;assert.equal(v.state.actors.t.resources.research,3);assert.equal(v.mind.goal('t','runtime-research').stage,0);
 v.cancel('t');v.advance(4,{autonomy:false});v.state.time=firstTime+1441;for(const a of Object.values(v.state.actors))for(const k in a.needs)a.needs[k]=95;
 until(v,()=>v.mind.goal('t','runtime-research').status==='completed',70);
 assert.equal(v.state.actors.t.resources.research,6);assert.equal(v.state.actors.t.resources.printouts,1);
 const events=v.state.events.filter(e=>e.actor==='t'&&e.kind==='action-completed'&&['use-computer','print-notes'].includes(e.action));assert.ok(events.every(e=>e.rule!=='player'));
 evidence.push({check:'persistent-native-plan',steps:events.map(e=>({action:e.action,time:e.time,rule:e.rule})),stage:v.mind.goal('t','runtime-research').stage,loaded:true});
 }finally{g.destroy();h?.destroy();}
});
test('blocked plan supplies its own prerequisites instead of falsely advancing the goal',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 solo(w);w.state.time=905;Object.assign(w.state.actors.t,nearestFree(w.state,{room:'club',x:0,z:4},{owner:'t'},4));w.state.objects['art-table'].state.paper=0;
 // Remove the two alternate easels: the test checks the material chain at one authored drawing table.
 const r=w.inbox.request('t','test-material-gap'),condition=E('$actor.resources.arts',4,'gte');
 await w.inbox.apply({requestId:r.id,epoch:r.epoch,baseRevision:r.baseRevision,contentRevision:r.contentRevision,evidence:[],rules:[],goals:[{id:'material-project',title:'补齐材料再完成海报',priority:80,deadline:2000,steps:[{action:'draw-poster',roles:{item:'art-table'},repeatUntil:condition,alternatives:[{action:'buy-supplies',when:E('$actor.resources.supplies',1,'lt')},{action:'restock-art',roles:{item:'art-table'},when:E('$actor.resources.supplies',1,'gte')}]}]}]});
 until(w,()=>w.mind.goal('t','material-project').status==='completed',90);
 const actions=w.state.events.filter(e=>e.actor==='t'&&e.kind==='action-completed').map(e=>e.action);assert.ok(actions.indexOf('buy-supplies')<actions.indexOf('restock-art'));assert.ok(actions.indexOf('restock-art')<actions.indexOf('draw-poster'));assert.equal(w.state.actors.t.resources.arts,4);
 evidence.push({check:'material-repair',actions});
 }finally{g.destroy();}
});
test('same experienced broken promise produces distinct native appraisals and decisions',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 for(const a of Object.values(w.state.actors))a.presence='away';for(const [id,x] of [['t',0],['m',1],['f',-1]]){Object.assign(w.state.actors[id],{presence:'here',room:'courtyard',x,z:3});for(const k in w.state.actors[id].needs)w.state.actors[id].needs[k]=90;w.state.actors[id].needs.social=50;}
 w.transaction(tx=>tx.emit('brokenPromise','t',['m','f'],{appointment:'shared-test',text:'没有履行此前的约定。'}));
 const a=w.mind.get('m','t:shared-test'),b=w.mind.get('f','t:shared-test');assert.equal(a.coping,'discuss');assert.equal(b.coping,'withdraw');assert.ok(b.intensity>a.intensity);
 const d1=w.choose('m'),d2=w.choose('f');assert.equal(d1.candidate.action,'start-conversation');assert.equal(d1.candidate.target,'t');assert.equal(d2.candidate.action,'sit-bench');assert.match(d1.decision.rule,/coping-discuss/);assert.match(d2.decision.rule,/coping-withdraw/);
 assert.equal(w.mind.get('a','t:shared-test'),null);
 w.state.time+=500;assert.equal(w.mind.affects('f')[0].intensity,0);assert.equal(w.mind.get('f','t:shared-test').value,'brokenPromise');
 evidence.push({check:'individual-appraisal',sameEvent:true,privateKnowledge:true,people:[{id:'m',intensity:a.intensity,coping:a.coping,action:d1.candidate.action},{id:'f',intensity:b.intensity,coping:b.coping,action:d2.candidate.action}]});
 }finally{g.destroy();}
});
test.after(async()=>writeFile(new URL('../../research/campus/planning.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n'));
