// No decisions or replies are injected. Run the ordinary two-agent tick budget.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {SchoolService} from '../dist/campus/service.js';
import {relationship} from '../dist/foundation/social.js';
const root=new URL('../',import.meta.url);
const game=await SchoolService.create({read:p=>readFileSync(new URL('dist/foundation/'+p,root),'utf8'),wasmBinary:readFileSync(new URL('dist/soar/soar.wasm',root))});
try{
 const w=game.world,times=[];w.state.time=500;w.state.situationKeys.push('club-preparation:0');
 const before=Object.fromEntries(Object.keys(w.state.actors).map(id=>[id,Object.keys(w.state.actors).filter(other=>other!==id).map(other=>relationship(w,id,other))]));
 while(w.state.time<610){const start=performance.now();game.advance(.5);times.push(performance.now()-start);}
 const run=Object.values(w.state.situations).find(s=>s.spec==='classroom-discussion');
 const turns=w.state.events.filter(e=>e.situation===run.id&&e.delivery==='room');times.sort((a,b)=>a-b);
 const report={method:'Original people and Soar policies; start at 08:20; skip the earlier club event; no actor/decision/result injection; regular decisionBudget=2.',run,
  timeline:turns.map(e=>({minute:e.time,actor:w.state.actors[e.actor].name,intent:e.intent,to:w.state.actors[e.to]?.name||e.to,text:e.text})),
  decisions:w.metrics.decisions,timingMs:{scope:'SchoolService.advance(.5), including observation snapshot; local process, not browser FPS or model latency',p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},
  relationships:Object.fromEntries(Object.keys(before).map(id=>[id,before[id].map(prior=>({before:prior,after:relationship(w,id,prior.id)})).filter(r=>JSON.stringify(r.before)!==JSON.stringify(r.after))])),
  commitments:Object.keys(w.state.actors).flatMap(id=>w.mind.goals(id).filter(g=>g.origin==='self-commitment').map(g=>({owner:id,title:g.title,stage:g.stage,status:g.status}))),
  attendance:Object.values(w.state.obligations||{}).map(({owner,attended,missed,status,remedy})=>({owner,attended,missed,status,remedy})),externalModelCalls:0};
 mkdirSync(new URL('research/classroom/',root),{recursive:true});writeFileSync(new URL('research/classroom/observation.json',root),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({timeline:report.timeline,timingMs:report.timingMs,decisions:report.decisions,outcome:run.state.outcome,commitments:report.commitments},null,2));
 if(turns.length<4||run.status!=='completed')process.exitCode=1;
}finally{game.destroy();}
