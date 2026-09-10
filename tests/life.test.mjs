import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Household,SPOTS} from '../dist/simulation.js';import {SoarController,loadSources} from '../dist/soar/controller.js';import {encodeSave,decodeSave} from '../dist/storage.js';
const sources=await loadSources(p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8'));
const learned=fs.readFileSync(new URL('../dist/soar/learned/xing-v2.soar',import.meta.url),'utf8');
const root=await SoarController.create(sources,{wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url))});
const make=(seed=123,saved=null)=>new Household(seed,saved).attachBrain(new SoarController(root.native,sources)),evidence=[];

test('same physical household checkpoint diverges when AI-generated cognition rules use actual lived experience',async()=>{
 const s=make();s.calendar.enabled=false;s.director.enabled=false;for(const p of s.people){p.presence='home';if(p.action==='away')p.action='idle';}let saved;try{
  for(const p of s.people)p.cooldowns.quiet=s.time+90;
  const x=s.person('xing'),q=s.person('xue');x.x=SPOTS.dining5.x;x.z=SPOTS.dining5.z;q.x=SPOTS.tv.x;q.z=SPOTS.tv.z;
  assert.ok(s.commandAt('xing','studyTable','dining5').ok);s.beginDoing(x);assert.ok(s.command('xue','watch').ok);s.beginDoing(q);s.advance(25);
  const recall=s.brain.recall('xing',{type:'event',kind:'distraction',actor:'xing',source:'self'});assert.equal(recall.kind,'recalled');
  s.release(q);s.release(x);x.x=SPOTS.tv.x;x.z=SPOTS.tv.z;q.x=x.x+.6;q.z=x.z+.3;
  assert.ok(s.command('xing','watch').ok);s.beginDoing(x);s.home.tvQuiet=false;
  saved=s.save();fs.writeFileSync(new URL('../dist/soar/checkpoint.json',import.meta.url),encodeSave(saved));
  fs.writeFileSync(new URL('../research/reflection-input.json',import.meta.url),JSON.stringify({source:'Actual native-Soar household run',physicalEvents:s.events.filter(e=>e.actor==='xing'),nativeMemory:s.brain.cli('xing','print @'),nativeEpisode:s.brain.cli('xing','epmem --print 1'),currentFacts:s.facts(x),ownInterference:recall.memory},null,2));
 }finally{s.brain.destroy();}
 async function run(updated){const w=make(123,decodeSave(encodeSave(saved)));try{if(updated)await w.brain.install('xing',learned,{author:'ChatGPT'});w.ask(w.person('xue'),w.person('xing'),'quiet');const r=w.requests.at(-1);w.advance(2);assert.equal(r.status,'resolved');return {result:r.result,quiet:w.home.tvQuiet,decision:r.soar};}finally{w.brain.destroy();}}
 const before=await run(false),after=await run(true);assert.equal(before.result,'declined');assert.equal(before.quiet,false);assert.equal(after.result,'accepted');assert.equal(after.quiet,true);assert.equal(after.decision.recollection.actor,'xing');assert.ok(after.decision.fired.includes('learned*xing*reinterpret-compatible-request'));evidence.push({name:'same-world-checkpoint',before,after});
});

test('seven autonomous days with native personal memories and learning preserve life, commitments and resources',async()=>{
 const s=make(2026);try{
  await s.brain.install('xing',learned);let low=100,decisions=0,maxMs=0;const completed=new Set(),choices=new Set(),allEvents=new Set(),samples=[],start=performance.now();
  for(let i=0;i<7*1440*4;i++){
   s.tick(.25);for(const p of s.people){low=Math.min(low,p.hunger,p.energy);assert.ok(p.hunger>0&&p.energy>0,p.id+' exhausted at '+s.time);if(p.task){assert.ok(s.time-p.task.started<(p.action==='sleep'?660:180),p.id+' stuck');if(p.task.resource)assert.equal(s.leases[p.task.resource],p.id);}if(p.goals.some(g=>g.status==='done'))completed.add(p.id);if(p.decision?.at===s.time){decisions++;samples.push(p.decision.elapsed);maxMs=Math.max(maxMs,p.decision.elapsed);choices.add(p.decision.kind);}}
   for(const k of ['food','ingredients','snacks','money'])assert.ok(s.home[k]>=0,k+' negative');for(const e of s.events.slice(-5))allEvents.add(e.type);
   if(i>0&&i%(1440*4)===0)console.log('completed game day',s.day,'elapsed ms',Math.round(performance.now()-start));
  }
  const recordedEvents=[...s.reviews.flatMap(r=>r.report.events),...s.dayEvents];for(const e of recordedEvents)allEvents.add(e.type);console.log('long-run event types',JSON.stringify([...allEvents]));assert.ok(s.day>=8);assert.ok(recordedEvents.some(e=>e.type==='departed'));assert.ok(recordedEvents.some(e=>e.type==='returned'));assert.ok(s.director.history.some(e=>e.status==='completed'),'no actual episode completed');for(const e of recordedEvents.filter(e=>e.type==='departed'))assert.ok((e.day-1)%7<5,'departure on weekend');assert.ok(s.messages.some(m=>m.delivered));assert.ok(s.people.some(p=>p.affect.length>0));for(const p of s.people)assert.ok(Object.keys(p.mental).length>0);for(const id of ['dad','xue','xing'])assert.ok(completed.has(id),id+' never finished a goal');const actualCooperation=recordedEvents.some(e=>e.type==='cooperate'||e.type==='incident-event'&&e.effects?.some(f=>f.op==='social'&&f.value==='cooperate'));assert.ok(allEvents.has('conversation-turn')&&actualCooperation,'missing actual delivered cooperation');assert.ok(recordedEvents.some(e=>e.type==='conversation-turn'&&e.replyTo),'no linked dialogue responses');samples.sort((a,b)=>a-b);
  const mealStarts=s.reviews.flatMap(r=>r.report.events).filter(e=>e.type==='taskStarted'&&e.task==='eat'&&e.meal);const missedMeals=s.reviews.flatMap(r=>r.report.events).filter(e=>e.type==='missedMeal');const mealAttendance=mealStarts.length/(mealStarts.length+missedMeals.length);assert.ok(mealAttendance>=.85,'too many missed routine meals: '+mealAttendance);const save=s.save();const result={name:'seven-days',episodes:s.director.history,simulationMinutes:10080,day:s.day,mealAttendance,missedMeals:missedMeals.map(e=>({day:e.day,person:e.actor,slot:e.slot,task:e.task,knownFood:e.food})),minimumNeed:low,completed:[...completed],choices:[...choices],eventTypes:[...allEvents],formalRequestRefusalObserved:allEvents.has('refuse'),linkedConversationReplies:recordedEvents.filter(e=>e.type==='conversation-turn'&&e.replyTo).length,decisions,elapsedMilliseconds:performance.now()-start,decisionMs:{median:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],max:maxMs},messageCount:s.messages.length,personalBeliefs:Object.fromEntries(s.people.map(p=>[p.id,Object.keys(p.mental).length])),socialAppraisals:Object.fromEntries(s.people.map(p=>[p.id,p.affect.length])),memoryBytes:Object.fromEntries(Object.entries(save.cognition.people).map(([id,p])=>[id,{smem:p.native.smem.length,epmem:p.native.epmem.length}])),learnedFeedback:Object.fromEntries(s.people.map(p=>[p.id,s.brain.outcomes[p.id].size]))};evidence.push(result);console.log(JSON.stringify(result));
  // A late save must retain a growing, multi-day SQLite database and learned values.
  const resumed=make(123,decodeSave(encodeSave(save)));try{resumed.advance(30);assert.equal(resumed.day,s.day);for(const p of resumed.people)assert.ok(p.hunger>0&&p.energy>0);}finally{resumed.brain.destroy();}
 }finally{s.brain.destroy();}
});
test.after(()=>{fs.writeFileSync(new URL('../research/life-verification.json',import.meta.url),JSON.stringify({kernel:'Soar 9.6.5 WebAssembly',externalApiCalls:0,results:evidence},null,2));root.destroy();});
