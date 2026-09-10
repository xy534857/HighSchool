// Scheduled obligations, observation and remediation. IDs, roles, places,
// thresholds, valid work and consequences are supplied by tuning.
import {test,clone} from './tuning.js';
export function personalObligations(world,owner){return Object.values(world.state.obligations||{}).filter(r=>r.owner===owner).map(clone);}
export function complete(tx,c,e){
 const r=tx.state.obligations?.[e.obligation];
 if(!r||r.owner!==c.actor.id||r.remedy!=='pending'||tx.state.time<r.end)throw Error('No outstanding obligation');
 const spec=tx.world.tuning.pack.obligations.find(o=>o.id===r.spec);
 if(c.action!==spec.remedyAction)throw Error('Wrong remediation action');
 r.remedy='completed';r.remediedAt=tx.state.time;
 tx.emit('obligation-remedied',r.owner,[r.owner,r.supervisor],{obligation:r.id,text:spec.text.remedied,claim:{subject:r.id,predicate:'remedy',value:'completed'}});
}
export function tickObligations(world,dt){
 const config=world.tuning.pack.obligations||[];if(!config.length)return;
 const s=world.state;s.obligations??={};const now=s.time,day=Math.floor(now/1440),minute=now%1440;
 for(const spec of config){
  if(spec.weekdays&&!spec.weekdays.includes(day%7))continue;
  const period=world.tuning.pack.clock.periods.find(p=>p.id===spec.period&&minute>=p.start&&minute<p.end);
  if(!period)continue;
  const start=day*1440+period.start,end=day*1440+period.end;
  for(const actor of Object.values(s.actors))if(test(spec.members,{actor})){
   const id=spec.id+':'+day+':'+period.start+':'+actor.id;
   s.obligations[id]??={id,spec:spec.id,label:spec.label,owner:actor.id,room:spec.room,start,end,trackingFrom:Math.max(start,s.obligationGraceUntil||start),attended:0,missed:0,firstArrival:null,lastPresent:false,status:'expected',remedy:'none',supervisor:null,notices:[],closed:false};
  }
 }
 const notices=[];
 for(const r of Object.values(s.obligations)){
  if(r.closed)continue;const spec=config.find(c=>c.id===r.spec);if(!spec)continue;
  const actor=s.actors[r.owner],task=s.tasks[r.owner],span=Math.max(0,Math.min(now,r.end)-Math.max(now-dt,r.start,r.trackingFrom||r.start));
  const present=actor.presence==='here'&&actor.room===r.room&&task?.phase==='perform'&&spec.actions.includes(task.candidate.action);
  if(span){
   if(present){r.attended+=span;if(r.firstArrival===null)r.firstArrival=now;}
   else r.missed+=span;
  }
  const supervisor=Object.values(s.actors).find(a=>a.presence==='here'&&a.room===r.room&&test(spec.supervisor,{actor:a})&&s.tasks[a.id]?.phase==='perform'&&spec.supervisorActions.includes(s.tasks[a.id].candidate.action));
  // A register is updated only while its supervisor is actually there, teaching.
  // It does not expose the missing person's location or private activity.
  if(supervisor&&span){
   r.supervisor=supervisor.id;
   const mark=(kind,text)=>{if(r.notices.includes(kind))return;r.notices.push(kind);notices.push({id:r.id,kind,text,actor:supervisor.id,to:[supervisor.id,r.owner],status:r.status});};
   if(!present&&r.missed>=spec.grace&&!r.notices.includes('reminder')){r.status=r.firstArrival===null?'late':'interrupted';mark('reminder',spec.text.reminder);}
   if(r.missed>=spec.absentAfter&&r.remedy==='none'){
    r.status='absent';r.remedy='pending';mark('absence',spec.text.absence);
   }
   if(present&&!r.lastPresent&&(r.notices.includes('reminder')||r.remedy==='pending')&&!r.notices.includes('returned')){
    mark('returned',spec.text.returned);
   }
   if(present&&r.status==='expected')r.status=r.firstArrival-(r.trackingFrom||r.start)>spec.grace?'late':'present';
  }
  r.lastPresent=present;
  if(now>=r.end){r.closed=true;if(r.status==='expected')r.status='unverified';}
 }
 if(notices.length)world.transaction(tx=>{for(const n of notices){
  const r=tx.state.obligations[n.id],spec=config.find(c=>c.id===r.spec),owner=tx.state.actors[r.owner];
  tx.emit('attendance-'+n.kind,n.actor,n.to,{obligation:r.id,delivery:n.kind==='returned'?'in-person':'notification',channel:n.kind==='returned'?spec.returnChannel:spec.noticeChannel,text:owner.name+'，'+n.text,claim:{subject:r.id,predicate:'attendance',value:n.status}});
  if(n.kind==='absence')tx.emit('obligation-assigned',n.actor,n.to,{obligation:r.id,delivery:'notification',channel:spec.noticeChannel,text:owner.name+'，'+spec.text.assigned,claim:{subject:r.id,predicate:'remedy',value:'pending'}});
 }});
}
