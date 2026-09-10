import {fail} from './tuning.js';
import {accessReason} from './environment.js';
export const distance=(a,b)=>a.room===b.room?Math.hypot(a.x-b.x,a.z-b.z):Infinity;
export function roomPath(rooms,from,to,allowed=()=>true){
 if(from===to)return [from];const q=[[from]],seen=new Set([from]);
 while(q.length){const p=q.shift();if(p.length>1&&rooms[p.at(-1)]?.transit===false)continue;for(const n of rooms[p.at(-1)]?.links||[]){if(seen.has(n)||!allowed(n))continue;const next=[...p,n];if(n===to)return next;seen.add(n);q.push(next);}}
 return null;
}
// Bounds/colliders are shared by navigation and the interaction authoring layer.
export function obstacles(state,room,ignoreObject){
 const out=[...(state.rooms[room]?.obstacles||[])];
 for(const o of Object.values(state.objects))if(o.room===room&&!o.holder&&o.id!==ignoreObject){
  const parts=o.colliders||(o.footprint?[{x:0,z:0,...o.footprint}]:[]);
  for(const c of parts)out.push({x:o.x+(c.x||0),z:o.z+(c.z||0),w:c.w,d:c.d});
 }return out;
}
export function pointFree(state,p,{ignoreObject,owner,dynamic=false,radius=state.navigation?.radius??.22}={}){
 const b=state.rooms[p.room]?.bounds;
 if(b&&(p.x<b.minX+radius||p.x>b.maxX-radius||p.z<b.minZ+radius||p.z>b.maxZ-radius))return false;
 if(obstacles(state,p.room,ignoreObject).some(o=>Math.abs(p.x-o.x)<o.w/2+radius&&Math.abs(p.z-o.z)<o.d/2+radius))return false;
 return !dynamic||!Object.values(state.actors).some(a=>a.id!==owner&&a.presence==='here'&&distance(a,p)<(state.navigation?.separation||.64));
}
export function nearestFree(state,p,options={},limit=1.6){
 if(pointFree(state,p,options))return {...p};
 for(let r=.4;r<=limit;r+=.3)for(let i=0;i<16;i++){const a=i*Math.PI/8,q={...p,x:p.x+Math.sin(a)*r,z:p.z+Math.cos(a)*r};if(pointFree(state,q,options))return q;}
 return null;
}
export function localPath(state,from,to,options={}){
 const bounds=state.rooms[from.room]?.bounds;if(!bounds)return [{x:to.x,z:to.z}];
 const opts={...options,owner:options.owner||from.id},parts=obstacles(state,from.room,opts.ignoreObject),radius=state.navigation?.radius??.22;
 const bodies=opts.dynamic?Object.values(state.actors).filter(a=>a.room===from.room&&a.id!==opts.owner&&a.presence==='here'):[];
 const blocked=(x,z)=>x<bounds.minX+radius||x>bounds.maxX-radius||z<bounds.minZ+radius||z>bounds.maxZ-radius||parts.some(o=>Math.abs(x-o.x)<o.w/2+radius&&Math.abs(z-o.z)<o.d/2+radius)||bodies.some(a=>Math.hypot(x-a.x,z-a.z)<(state.navigation?.separation||.64));
 const clear=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.12));for(let i=1;i<=n;i++)if(blocked(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n))return false;return true;};
 if(blocked(to.x,to.z))return null;
 if(clear(from,to))return [{x:to.x,z:to.z}];
 const step=.5,nx=Math.round((bounds.maxX-bounds.minX)/step)+1,nz=Math.round((bounds.maxZ-bounds.minZ)/step)+1;
 const cell=p=>[Math.max(0,Math.min(nx-1,Math.round((p.x-bounds.minX)/step))),Math.max(0,Math.min(nz-1,Math.round((p.z-bounds.minZ)/step)))];
 const pos=([x,z])=>({x:bounds.minX+x*step,z:bounds.minZ+z*step}),key=([x,z])=>x+z*nx;
 const start=cell(from),queue=[start],prev=new Map([[key(start),null]]);let end=null;
 for(let n=0;n<queue.length;n++){
  const c=queue[n],here=n===0?from:pos(c);
  if(Math.hypot(here.x-to.x,here.z-to.z)<.9&&clear(here,to)){end=c;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
   const next=[c[0]+dx,c[1]+dz],p=pos(next),k=key(next);
   if(next[0]<0||next[0]>=nx||next[1]<0||next[1]>=nz||prev.has(k)||blocked(p.x,p.z)||!clear(here,p))continue;
   prev.set(k,c);queue.push(next);
  }
 }
 if(!end)return null;
 const points=[];let at=end;while(prev.get(key(at))){points.push(pos(at));at=prev.get(key(at));}points.reverse();points.push({x:to.x,z:to.z});return points;
}
export function route(state,actor,anchor,speed=2,options={}){
 const identity=state.actors[actor.id]||actor;
 if(accessReason(state,identity,anchor.room))return null;
 const rooms=roomPath(state.rooms,actor.room,anchor.room,id=>!accessReason(state,identity,id));if(!rooms)return null;
 const points=[];let current={room:actor.room,x:actor.x,z:actor.z};
 const segment=target=>{const local=localPath(state,current,target,{...options,owner:actor.id});if(!local)return false;for(const p of local){const next={...p,room:current.room};points.push({...next,duration:Math.max(.01,distance(current,next)/speed)});current=next;}return true;};
 for(const next of rooms.slice(1)){
  let exit=state.rooms[current.room].portals?.[next]||{x:0,z:0};
  if(options.dynamic)exit=nearestFree(state,{...exit,room:current.room},{...options,owner:actor.id},1)||exit;if(!segment(exit))return null;
  let entry=state.rooms[next].portals?.[current.room]||{x:0,z:0};
  if(options.dynamic)entry=nearestFree(state,{...entry,room:next},{...options,owner:actor.id},1)||entry;
  points.push({...entry,room:next,duration:exit.minutes||1});current={...entry,room:next};
 }
 if(!segment(anchor))return null;if(!points.length)points.push({...anchor,duration:.01});return points;
}
export function bodyBlocker(state,owner,from,to){
 if(!state.navigation)return null;
 const gap=state.navigation.separation||.64;
 for(const a of Object.values(state.actors)){
  if(a.id===owner||a.presence!=='here'||a.room!==to.room)continue;
  const before=distance(a,from),after=distance(a,to);if(before<gap&&after>before+.0001)continue;
  const dx=to.x-from.x,dz=to.z-from.z,l=dx*dx+dz*dz,t=from.room===to.room&&l?Math.max(0,Math.min(1,((a.x-from.x)*dx+(a.z-from.z)*dz)/l)):1;
  if(Math.hypot(from.x+dx*t-a.x,from.z+dz*t-a.z)<gap-.001)return a.id;
 }return null;
}
export function validateMap(state){
 for(const [id,r] of Object.entries(state.rooms))for(const n of r.links||[])fail(state.rooms[n]?.links.includes(id),'Room links must be bidirectional');
 for(const e of [...Object.values(state.actors),...Object.values(state.objects)])fail(state.rooms[e.room]&&Number.isFinite(e.x)&&Number.isFinite(e.z),'Invalid entity placement '+e.id);
}
export function canSee(state,observer,entity){return observer.presence==='here'&&entity.presence!=='away'&&observer.pose!=='sleeping'&&!entity.private&&distance(observer,entity)<=state.senses.sight;}
export function canHear(state,listener,speaker){return listener.presence==='here'&&speaker.presence==='here'&&listener.pose!=='sleeping'&&!listener.private&&!speaker.private&&distance(listener,speaker)<=state.senses.hearing;}
function segmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l)):0;return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
export function clearsEgress(state,target,p){
 const t=state.tasks[target.id];if(!t?.approach||t.approach.room!==p.room)return true;
 const points=[t.anchor,t.approach,t.exitPoint||t.approach];return points.slice(1).every((b,i)=>segmentDistance(p,points[i],b)>=(state.navigation?.separation||.6)+.1);
}
export function socialSpot(state,owner,target){
 const a=state.actors[owner],candidates=[],angle=Math.atan2(a.x-target.x,a.z-target.z);
 for(const r of [(state.navigation?.separation||.6)+.1,((state.navigation?.separation||.6)+state.senses.reach)/2,state.senses.reach-.05])for(let i=0;i<16;i++){
  const theta=angle+i*Math.PI/8,p={room:target.room,x:target.x+Math.sin(theta)*r,z:target.z+Math.cos(theta)*r};
  if(pointFree(state,p,{owner,dynamic:true})&&clearsEgress(state,target,p))candidates.push(p);
 }
 return candidates.sort((p,q)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(q.x-a.x,q.z-a.z))[0]||null;
}
