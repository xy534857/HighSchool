import {periodInfo} from '../foundation/timing.js';
import {route} from '../foundation/space.js';

// Preserve elapsed history and player intent when adopting a new timetable.
export function upgradeTimetableSave(saved,content,scenario){
 if(!saved||(saved.content.timetableRevision||0)>=(content.timetableRevision||0))return false;
 const c=saved.content,s=saved.state,priorClock=periodInfo(saved.content.clock,saved.state.time);
 c.clock=structuredClone(content.clock);
 for(const id of ['prepare-class','prepare-teach'])c.actions[id]=structuredClone(content.actions[id]);
 const ids=['prepare-class','prepare-teach','class-leave-chat'];
 c.routines=c.routines.filter(r=>!ids.includes(r.id)).concat(structuredClone(content.routines.filter(r=>ids.includes(r.id))));
 for(const id of ['club-preparation','classroom-discussion']){
  const next=content.situations.find(r=>r.id===id),at=c.situations.findIndex(r=>r.id===id);
  if(at>=0)c.situations[at]=structuredClone(next);
 }
 const oldTopic=c.types.noticeboard.state.topic,newTopic=content.types.noticeboard.state.topic;
 c.types.noticeboard.state.topic=newTopic;
 for(const o of Object.values(s.objects))if(o.type==='noticeboard'&&o.state.topic===oldTopic)o.state.topic=newTopic;
 for(const run of Object.values(s.situations||{}))if(run.spec==='classroom-discussion'&&run.status==='active')run.ends=run.started+c.situations.find(r=>r.id===run.spec).duration;
 for(const id of ['canteen'])for(const key of ['subtitle','description'])s.rooms[id][key]=scenario.rooms[id][key];
 const clock=periodInfo(c.clock,s.time);
 // Keep previous attendance as history. Do not manufacture absence by applying
 // a newly introduced lesson to time that elapsed under the old schedule.
 for(const r of Object.values(s.obligations||{}))if(!r.closed){
  if(clock.period==='class'&&r.start===clock.periodStart)r.end=clock.periodEnd;
  else {r.closed=true;r.scheduleChangedAt=s.time;}
 }
 for(const c of Object.values(s.controls||{}))if(c.deferred?.class===priorClock.periodEnd)c.deferred.class=clock.period==='class'?clock.periodEnd:s.time;
 s.obligationGraceUntil=s.time+15;
 for(const [owner,t] of [...Object.entries(s.tasks),...Object.entries(s.suspended||{})]){
  const spec=c.actions[t.candidate.action];
  if(spec.stopAtPeriodEnd)t.periodEnd=spec.autonomyGroup==='class'&&!spec.transition&&clock.period!=='class'?s.time:clock.periodEnd;
  if(t.phase==='travel'){
   const points=route(s,s.actors[owner],t.approach||t.anchor,c.clock.walkSpeed);
   if(points)Object.assign(t,{points,point:0,pointRemaining:points[0]?.duration||.01,blockedBy:null,blockedMinutes:0});
  }
 }
 c.timetableRevision=content.timetableRevision;saved.contentRevision++;return true;
}
