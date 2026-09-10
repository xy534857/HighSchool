import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {SchoolService} from '../dist/campus/service.js';
const root=new URL('../',import.meta.url);
export const schoolOptions={read:p=>readFileSync(new URL('dist/foundation/'+p,root),'utf8'),wasmBinary:readFileSync(new URL('dist/soar/soar.wasm',root))};
export async function observeSchoolTiming(){
 const game=await SchoolService.create(schoolOptions),w=game.world,times=[],returnTrace=[];
 const tick=()=>{const t=performance.now();game.advance(.5);times.push(performance.now()-t);
  if(w.state.time>=580){const p=w.state.actors.t,task=w.state.tasks.t;returnTrace.push({time:w.state.time,room:p.room,x:p.x,z:p.z,action:task?.candidate.action,phase:task?.phase,blockedBy:task?.blockedBy,remainingRoute:task?.points.slice(task.point+1).reduce((n,p)=>n+p.duration,task.pointRemaining),returnTravel:w.view('t').clock.returnTravel});}
  if(process.env.TIMING_PROGRESS&&w.state.time%15===0)console.log('observed minute',w.state.time);
 };
 try{
  while(w.state.time<555.5)tick();
  const departed=w.state.time;
  const command=game.enqueue('solve-chess',{item:'student-chess'});if(!command.ok)throw Error(command.reason);
  let arrived=null,completed=null;
  while(w.state.time<605){
   tick();const t=w.state.tasks.t;
   if(t?.id===command.id&&t.phase==='perform')arrived??=w.state.time;
   const receipt=w.state.receipts[command.id];if(receipt?.status==='completed')completed??=w.state.events.find(e=>e.commandId===command.id&&e.kind==='action-completed')?.time;
  }
  times.sort((a,b)=>a-b);
  const second=Object.values(w.state.obligations).find(r=>r.owner==='t'&&r.start===600);
  return {method:'Unmodified default start at 08:00; ordinary SchoolService ticks with decisionBudget=2; one player command after the first lesson: solve chess at the student center; then autonomous return. No actor relocation, scripted NPC decisions or time jumps.',
   firstLessonEnd:555,nextLessonStart:600,departed,arrived,completed,
   outboundMinutes:arrived===null?null:arrived-departed,freeMinutesAfterActivity:completed===null?null:600-completed,
   seatedAt:returnTrace.find(t=>t.action==='prepare-class'&&t.phase==='perform')?.time??returnTrace.find(t=>t.action==='attend-class'&&t.phase==='perform')?.time,
   returnedAt:second?.firstArrival,attendance:second?.status,remedy:second?.remedy,
   playerAtEnd:{room:w.state.actors.t.room,action:w.state.tasks.t?.candidate.action,phase:w.state.tasks.t?.phase},
   playerActions:w.state.events.filter(e=>e.actor==='t'&&e.time>=555&&['action-completed','action-cancelled','action-failed'].includes(e.kind)).map(({time,kind,action,reason})=>({time,kind,action,reason})),returnTrace,
   timingMs:{scope:'SchoolService.advance(.5), including snapshot, local process',p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},decisions:w.metrics.decisions};
 }finally{game.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await observeSchoolTiming();mkdirSync(new URL('research/timing/',root),{recursive:true});
 writeFileSync(new URL('research/timing/observation.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 if(report.arrived===null||report.completed===null||!Number.isFinite(report.seatedAt)||report.seatedAt>600||report.attendance!=='present')process.exitCode=1;
}
