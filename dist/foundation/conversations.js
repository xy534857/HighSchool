import {stageExit} from './execution.js';
import {clone,fail,list} from './tuning.js';
import {canHear} from './space.js';

export function activeMembers(state,session){return Object.keys(session.members).filter(id=>session.members[id].status==='active'&&state.actors[id].session===session.id);}
export function listeners(state,session,speaker,to='all',whisper=false){
 return activeMembers(state,session).filter(id=>id===speaker||(!whisper||id===to)&&canHear(state,state.actors[id],state.actors[speaker]));
}
export function openSession(tx,c,e){
 const s=tx.state,p=s.actors[c.actor.id];fail(!p.session,'Already in a conversation');
 const id=tx.id('session'),session={id,status:'open',host:p.id,access:e.access||'public',group:e.group||null,topic:e.topic||'',created:s.time,members:{[p.id]:{status:'active',joined:s.time,lastSpoke:-1}},turns:[],floor:null};
 s.sessions[id]=session;p.session=id;
 invite(tx,{...c,session},e);
 tx.emit('session-opened',p.id,[p.id],{session:id,topic:session.topic});return id;
}
export function invite(tx,c,e){
 const s=tx.state,session=s.sessions[e.session||c.actor.session||c.session?.id];fail(session?.status==='open','Conversation closed');
 fail(session.members[c.actor.id]?.status==='active','Inviter is not a participant');
 const targets=e.group?list(s.groups[e.group]?.members).concat(list(s.groups[e.group]?.invited)):list(e.targets||e.target);
 if(e.group){fail(s.groups[e.group]?.members.includes(c.actor.id),'Not a group member');session.group=e.group;}
 for(const id of new Set(targets)){
  const p=s.actors[id];if(!p||id===c.actor.id||session.members[id]?.status==='active')continue;
  fail(Object.values(session.members).filter(m=>['invited','active'].includes(m.status)).length<s.limits.maxParticipants,'Conversation full');
  if(!canHear(s,p,s.actors[c.actor.id])){tx.emit('invitation-undelivered',c.actor.id,[c.actor.id],{target:id,session:session.id});continue;}
  session.members[id]={status:'invited',from:c.actor.id,expires:s.time+s.limits.inviteMinutes,lastSpoke:-1};
  tx.emit('session-invitation',c.actor.id,[c.actor.id,id],{target:id,session:session.id,topic:session.topic});
 }
}
function suspend(tx,actor){
 const s=tx.state,task=s.tasks[actor];if(!task)return;
 fail(task.attention!=='block','Current action cannot be interrupted');
 if(task.attention==='pause'){
  s.suspended[actor]=clone(task);
  if(task.approach&&['perform','enter'].includes(task.phase)){task.suspending=true;stageExit(s,actor,tx.world.tuning.pack.clock.walkSpeed);return;}
  delete s.tasks[actor];
  for(const [slot,lease] of Object.entries(s.leases))if(lease.actor===actor)delete s.leases[slot];
 }
}
export function join(tx,c,e){
 const s=tx.state,p=s.actors[c.actor.id],session=s.sessions[e.session||c.invitation?.session];
 fail(session?.status==='open'&&session.members[p.id]?.status==='invited','No live invitation');
 fail(session.members[p.id].expires>=s.time&&!p.session,'Invitation expired or attention occupied');
 fail(canHear(s,p,s.actors[session.host]),'Cannot hear the group');suspend(tx,p.id);
 session.members[p.id]={...session.members[p.id],status:'active',joined:s.time};p.session=session.id;
 if(session.group){const g=s.groups[session.group];if(g&&!g.members.includes(p.id)){g.members.push(p.id);g.invited=g.invited.filter(id=>id!==p.id);}}
 tx.emit('session-joined',p.id,activeMembers(s,session),{session:session.id});
}
export function leave(tx,c,e){
 const s=tx.state,p=s.actors[c.actor.id],session=s.sessions[e.session||p.session];fail(session,'No conversation');
 const recipients=activeMembers(s,session);session.members[p.id].status=e.decline?'declined':'left';
 if(p.session===session.id)p.session=null;if(session.floor?.speaker===p.id)session.floor=null;
 tx.emit(e.decline?'session-declined':'session-left',p.id,[...new Set([...recipients,p.id])],{session:session.id});
 if(activeMembers(s,session).length<2&&!Object.values(session.members).some(m=>m.status==='invited'))close(tx,session,'no-partners');
}
export function close(tx,session,reason){
 const s=tx.state;if(session.status==='closed')return;
 const recipients=activeMembers(s,session);for(const [id,m] of Object.entries(session.members)){
  if(['active','invited'].includes(m.status))m.status='left';if(s.actors[id].session===session.id)s.actors[id].session=null;
 }
 session.status='closed';session.floor=null;
 for(const offer of Object.values(s.offers))if(offer.session===session.id&&offer.status==='pending'){
  offer.status='cancelled';tx.emit('proposal-cancelled',offer.from,[offer.from,offer.to],{offer:offer.id,claim:{subject:offer.id,predicate:'status',value:'cancelled'}});
 }
 tx.emit('session-closed',session.host,recipients,{session:session.id,reason});
}
export function speak(tx,c,e){
 const s=tx.state,session=s.sessions[c.actor.session];
 fail(session?.status==='open'&&session.members[c.actor.id]?.status==='active'&&session.floor?.speaker===c.actor.id,'No speaking floor');
 fail(!session.floor.used,'Already spoke this turn');
 const recipients=listeners(s,session,c.actor.id,e.to||'all',e.whisper||false);
 fail(recipients.length>1,'Nobody can hear');
 if(e.to&&e.to!=='all')fail(recipients.includes(e.to),'Addressee cannot hear');
 if(e.replyTo)fail(session.turns.some(t=>t.uid===e.replyTo&&t.recipients.includes(c.actor.id)),'Cannot reply to an unheard turn');
 const uid=tx.emit(e.kind||'speech',c.actor.id,recipients,{session:session.id,to:e.to||'all',text:e.text||c.label,replyTo:e.replyTo||null,claim:e.claim||null,...(e.data||{})});
 if(e.replyTo)tx.state.answers[c.actor.id+':'+e.replyTo]=uid;
 session.turns.push({uid,actor:c.actor.id,recipients,kind:e.kind||'speech',time:s.time});session.floor.used=true;return {uid,recipients};
}
export function tickSessions(world,dt){
 if(!Object.values(world.state.sessions).some(s=>s.status==='open')&&!Object.values(world.state.offers).some(o=>o.status==='pending'))return;
 world.transaction(tx=>{
  const s=tx.state;
  for(const session of Object.values(s.sessions)){
   if(session.status!=='open')continue;
   for(const [id,m] of Object.entries(session.members)){
    if(m.status==='invited'&&m.expires<s.time){m.status='expired';tx.emit('invitation-expired',id,[id,session.host],{session:session.id});}
    if(m.status==='active'&&(s.actors[id].presence!=='here'||!canHear(s,s.actors[id],s.actors[session.host]))){m.status='left';s.actors[id].session=null;if(session.floor?.speaker===id)session.floor=null;}
   }
   const members=activeMembers(s,session);
   if(s.time-session.created>s.limits.sessionMinutes||session.turns.length>=s.limits.maxTurns||members.length<2&&!Object.values(session.members).some(m=>m.status==='invited')){close(tx,session,'finished');continue;}
   if(session.floor&&session.floor.until<=s.time){session.members[session.floor.speaker].lastSpoke=s.time;session.floor=null;}
   if(!session.floor&&members.length>=2){
    // Fair floor allocation; the holder's Soar still decides what to say or pass.
    members.sort((a,b)=>session.members[a].lastSpoke-session.members[b].lastSpoke||a.localeCompare(b));
    session.floor={speaker:members[0],until:s.time+s.limits.turnMinutes,used:false};
   }
  }
  for(const offer of Object.values(s.offers))if(offer.status==='pending'&&offer.expires<s.time){offer.status='expired';tx.emit('proposal-expired',offer.from,[offer.from,offer.to],{offer:offer.id,claim:{subject:offer.id,predicate:'status',value:'expired'}});}
 });
}
