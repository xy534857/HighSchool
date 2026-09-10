// Interactive integration lab: no canned model replies. Another process supplies each reply.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {SchoolService} from '../dist/campus/service.js';
import {InferenceBroker} from '../dist/llm/broker.js';
import {nearestFree} from '../dist/foundation/space.js';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),dir=new URL('../.runtime-lab/',import.meta.url);
await mkdir(dir,{recursive:true});assert.ok(!(await readdir(dir)).some(f=>f.endsWith('.reply.json')),'Archive the previous .runtime-lab directory before starting a new live run');await mkdir(new URL('research/runtime/',root),{recursive:true});
const options={read:p=>readFileSync(new URL('dist/foundation/'+p,root),'utf8'),wasmBinary:readFileSync(new URL('dist/soar/soar.wasm',root))};
let game=await SchoolService.create(options),w=game.world;
const cast=['m','f','t'];for(const a of Object.values(w.state.actors)){a.presence=cast.includes(a.id)?'here':'away';for(const k in a.needs)a.needs[k]=95;}
for(const [id,x] of [['f',-2],['m',0],['t',2]])Object.assign(w.state.actors[id],nearestFree(w.state,{room:'courtyard',x,z:3},{owner:id},3));
w.state.time=1040;w.tuning.pack.reflection={enabled:true,at:1080,includePlayer:true,owners:cast};
const advanceUntil=(predicate,n=50)=>{for(let i=0;i<n&&!predicate();i++)w.advance(.5,{autonomy:false});assert.ok(predicate(),'Fixture interaction timed out');};
// Only the initiating conflict is a fixture, delivered through real conversation mechanics.
assert.ok(w.perform('f','start-conversation',{roles:{target:'m'}}).ok);advanceUntil(()=>w.state.actors.f.session);
assert.ok(w.perform('m','join-conversation',{roles:{invitation:w.view('m').invitations[0].id}}).ok);
assert.ok(w.perform('f','invite-into-conversation',{roles:{target:'t'}}).ok);
assert.ok(w.perform('t','join-conversation',{roles:{invitation:w.view('t').invitations[0].id}}).ok);
advanceUntil(()=>w.view('f').actor.hasFloor);
assert.ok(w.perform('f','exclude-peer',{roles:{target:'t'},args:{text:'明远，社团结束我们几个一起走吧。知夏，这次你先别跟来了。',about:'m'}}).ok);
const opening=w.state.events.findLast(e=>e.kind==='social-act');
assert.ok(opening.recipients.includes('m'));assert.equal(w.state.observed.a.includes(opening.uid),false);
for(const id of cast)if(w.state.actors[id].session)w.perform(id,'leave-conversation');
const logs=[],durations=[],snapshots=[],compressedNights=[];let applied=0,submitted=0,finished=false,lastDay=0,savedOnce=false;
const provider=async(request,{signal})=>{
 const key=String(++submitted).padStart(2,'0')+'-'+request.owner;
 await writeFile(new URL(key+'.request.json',dir),JSON.stringify(request,null,2));
 console.log(JSON.stringify({request:key,owner:request.owner,reason:request.reason,day:request.meta?.day,gameTime:w.state.time,bytes:JSON.stringify(request).length}));
 const began=performance.now();
 while(!signal.aborted){
  try{const reply=JSON.parse(await readFile(new URL(key+'.reply.json',dir),'utf8'));const log={key,request,reply,waitMs:performance.now()-began};logs.push(log);await writeFile(new URL('research/runtime/'+key+'.json',root),JSON.stringify(log,null,2));return reply;}catch(e){if(e.code!=='ENOENT')throw e;}
  await new Promise(r=>setTimeout(r,200));
 }throw Error('Operator response timeout');
};
const broker=new InferenceBroker({source:{claim:()=>game.claimInference(),apply:async reply=>{const r=await w.inbox.apply(reply);applied++;console.log(JSON.stringify({applied,owner:r.owner,time:w.state.time,revision:r.revision}));return r;},fail:async(id,error)=>{w.inbox.failRequest(id,error);console.log(JSON.stringify({rejected:id,error}));}},provider,concurrency:2,startsPerMinute:8,timeoutMs:180000});
console.log(JSON.stringify({ready:true,spool:dir.pathname,opening,relations:game.snapshot().actors.filter(a=>cast.includes(a.id)).map(a=>({id:a.id,relations:a.relationships}))}));
const start=performance.now();let ticks=0;
try{
 while(!finished&&performance.now()-start<900000){
  const before=performance.now();w.advance(.5,{decisionBudget:2});durations.push(performance.now()-before);ticks++;
  await broker.pump();
  const day=Math.floor(w.state.time/1440),minute=w.state.time%1440;
  if(ticks%30===0){
   const snapshot={time:w.state.time,applied,pending:broker.snapshot().pending,people:cast.map(id=>({id,task:w.state.tasks[id]?.candidate.action,goal:w.state.tasks[id]?.candidate.goal,session:w.state.actors[id].session,reason:w.brain.traces[id]?.reason,goals:w.mind.goals(id).filter(g=>g.origin!=='personal-project').map(g=>({id:g.uid,stage:g.stage,status:g.status}))})),events:w.state.events.filter(e=>['social-act','proposal','cooperate','refuse','action-failed'].includes(e.kind)).slice(-20)};
   snapshots.push(snapshot);await writeFile(new URL('state.json',dir),JSON.stringify(snapshot,null,2));
  }
  if(minute>=1110&&!broker.running.size&&!Object.values(w.state.social.reflections).some(j=>j.day===day&&j.status==='queued')){
   if(day>=1&&applied>=6){finished=true;break;}
   compressedNights.push({from:w.state.time,to:(day+1)*1440+480});w.state.time=(day+1)*1440+480;
   for(const a of Object.values(w.state.actors))for(const k in a.needs)a.needs[k]=95;
   if(!savedOnce){const save=game.save();game.destroy();game=await SchoolService.create({...options,saved:save});w=game.world;savedOnce=true;}
  }
  await new Promise(r=>setTimeout(r,40));
 }
 assert.ok(finished,'Live lab did not receive six valid runtime replies');
 const percent=p=>[...durations].sort((a,b)=>a-b)[Math.floor((durations.length-1)*p)];
 const report={kind:'assistant-in-the-loop; actual runtime requests and replies; compressed offscreen nights',externalAPICalls:0,openingFixture:opening,completed:finished,applied,ticks,elapsedMs:performance.now()-start,stepMs:{p50:percent(.5),p95:percent(.95),max:Math.max(...durations)},inference:broker.snapshot().history,compressedNights,saveRestored:savedOnce,events:w.state.events.filter(e=>['social-act','proposal','cooperate','refuse','action-failed'].includes(e.kind)),evolution:w.state.social.evolution,people:cast.map(id=>({id,profile:w.state.actors[id].profile,goals:w.mind.goals(id),relationships:game.snapshot().actors.find(a=>a.id===id).relationships})),snapshots};
 await writeFile(new URL('final.save.json',dir),game.save());
 await writeFile(new URL('research/runtime/live-social-report.json',root),JSON.stringify(report,null,2));
 for(const log of logs)await writeFile(new URL('research/runtime/'+log.key+'.json',root),JSON.stringify(log,null,2));
 console.log(JSON.stringify({complete:true,applied,stepMs:report.stepMs,inference:report.inference}));
}finally{broker.close();game.destroy();}
