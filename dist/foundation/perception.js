import {relationship,contacts} from './social.js';
import {personalObligations} from './obligations.js';
import {personalSituations} from './situations.js';
import {clone,fail} from './tuning.js';
import {canSee} from './space.js';
import {activeMembers} from './conversations.js';

export function clockInfo(world){
 const time=world.state.time,minute=((time%1440)+1440)%1440,day=Math.floor(time/1440),periods=world.tuning.pack.clock.periods;
 const period=periods.find(p=>minute>=p.start&&minute<p.end),next=periods.find(p=>p.start>minute);
 return {time,minute,day,weekday:day%7,period:period?.id||'free',periodStart:day*1440+(period?.start||0),nextPeriod:next?.id||'free',minutesToNext:next?next.start-minute:1440-minute};
}

export function view(world,owner){
  const s=world.state,p=s.actors[owner];fail(p,'Unknown actor');
  const actor={...clone(p),participating:personalSituations(world,owner).some(s=>s.status==='accepted'),busy:!!s.tasks[owner],interruptible:!s.tasks[owner]||s.tasks[owner].attention!=='block',hasFloor:!!p.session&&s.sessions[p.session]?.floor?.speaker===owner&&!s.sessions[p.session]?.floor?.used};
  const actors=Object.values(s.actors).filter(a=>a.id!==owner&&canSee(s,p,a)).map(({id,role,name,room,x,z,pose,session,presence})=>({id,role,name,room,x,z,pose,session,presence}));
  const objects=Object.values(s.objects).filter(o=>o.holder===owner||canSee(s,p,o)||world.mind.get(owner,o.id+':room')).map(o=>{
   const seen=o.holder===owner||canSee(s,p,o),type=world.tuning.pack.types[o.type],v={id:o.id,type:o.type,tags:clone(o.tags),room:seen?o.room:world.mind.get(owner,o.id+':room').value,x:seen?o.x:world.mind.get(owner,o.id+':x')?.value,z:seen?o.z:world.mind.get(owner,o.id+':z')?.value,holder:seen?o.holder:'unknown',state:{}};
   v.owner=o.owner||'none';if(seen)for(const k of type.visible||[])v.state[k]=o.state[k];return v;
  });
  const session=p.session?s.sessions[p.session]:null;
  const invitations=Object.values(s.sessions).filter(c=>c.status==='open'&&c.members[owner]?.status==='invited').map(c=>({id:c.id,session:c.id,from:c.members[owner].from,expires:c.members[owner].expires,group:c.group}));
  const offers=Object.values(s.offers).filter(o=>o.heardBy.includes(owner)).map(o=>{
   const own=world.mind.get(owner,o.id+':status');return {...clone(o),status:own?.value||'pending',heardBy:undefined};
  });
  const groups=Object.values(s.groups).filter(g=>g.members.includes(owner)||invitations.some(i=>i.group===g.id)).map(g=>({id:g.id,name:g.name,members:clone(g.members),invited:g.owner===owner?clone(g.invited):[]}));
  const minute=((s.time%1440)+1440)%1440,day=Math.floor(s.time/1440),period=world.tuning.pack.clock.periods.find(p=>minute>=p.start&&minute<p.end)?.id||'free';
  const messages=s.events.filter(e=>e.kind==='question'&&e.recipients.includes(owner)&&e.actor!==owner&&(!e.to||e.to==='all'||e.to===owner)&&e.session===p.session).slice(-24).map(e=>({...clone(e),id:e.uid,answered:!!s.answers[owner+':'+e.uid],known:world.mind.get(owner,e.key)?.value!==undefined&&world.mind.get(owner,e.key)?.value!=='unknown'}));
  const known=world.mind.all(owner);const knownByKey=Object.fromEntries(known.map(m=>[m.key,m.value]));
  return {actor,actors,contacts:contacts(world,owner,actors),relationships:Object.fromEntries(Object.keys(s.actors).filter(id=>id!==owner).map(id=>[id,relationship(world,owner,id)])),knownByKey,objects,objectsById:Object.fromEntries(objects.map(o=>[o.id,o])),offers,invitations,groups,messages,situations:personalSituations(world,owner),obligations:personalObligations(world,owner),session:session?{id:session.id,host:session.host,topic:session.topic,created:session.created,access:session.access,active:activeMembers(s,session),floor:clone(session.floor)}:null,clock:clockInfo(world),known};
 }

export function facts(world,owner){const v=world.view(owner),affect=new Map(world.mind.affects(owner).map(m=>[m.key,m]));return {mode:'foundation',activity:personalSituations(world,owner).some(s=>s.status==='accepted')?'participating':'free',room:v.actor.room,period:v.clock.period,session:v.actor.session||'none',phase:v.actor.hasFloor?'speaking':v.actor.session?'listening':'free',...v.actor.needs,...Object.fromEntries(Object.entries(v.actor.resources||{}).map(([k,n])=>['resource-'+k,n])),known:v.known.filter(k=>!['x','z','room','last-seen'].includes(k.predicate)).map(k=>({key:k.key,subject:k.subject,predicate:k.predicate,age:Math.max(0,world.state.time-k.at),value:k.value,status:k.status,provenance:k.provenance,emotion:k.emotion,intensity:affect.get(k.key)?.intensity??0,coping:k.coping})),...Object.fromEntries(Object.keys(world.tuning.pack.cognition||{}).map(k=>['profile-'+k,v.actor.profile[k]])),sensitivity:v.actor.profile.sensitivity,coping:v.actor.profile.coping};}
