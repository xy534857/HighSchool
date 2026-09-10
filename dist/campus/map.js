import {accessReason} from '../foundation/environment.js';
import {roomPath,route,nearestFree} from '../foundation/space.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const xy=(rooms,p)=>[rooms[p.room].map.x+p.x,rooms[p.room].map.z+p.z];
export class CampusMap {
 constructor(element,{view,go}){this.element=element;this.selected=null;this.view=view;this.go=go;this.open=false;}
 show(snapshot,selected){this.open=true;this.selected=selected||snapshot.player.room;this.element.hidden=false;this.element.parentElement.classList.add('map-open');this.update(snapshot,true);}
 hide(){this.open=false;this.element.hidden=true;this.element.parentElement.classList.remove('map-open');}
 update(s,force=false){
  this.data=s;if(!this.open)return;
  const p=s.actors.find(a=>a.id===s.player),rooms=s.rooms;if(!rooms[this.selected])this.selected=p.room;
  if(force||!this.element.querySelector('svg')){
   const all=Object.values(rooms),minX=Math.min(...all.map(r=>r.map.x+r.bounds.minX))-3,minZ=Math.min(...all.map(r=>r.map.z+r.bounds.minZ))-3,maxX=Math.max(...all.map(r=>r.map.x+r.bounds.maxX))+3,maxZ=Math.max(...all.map(r=>r.map.z+r.bounds.maxZ))+3;
   const links=Object.entries(rooms).flatMap(([id,r])=>r.links.filter(to=>id<to).map(to=>{const a=xy(rooms,{room:id,...r.portals[to]}),b=xy(rooms,{room:to,...rooms[to].portals[id]});return `<path class="map-connection" d="M${a} L${b}"/>`;})).join('');
   const blocks=Object.entries(rooms).map(([id,r])=>{const m=r.map,b=r.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ;const furniture=s.objects.filter(o=>o.room===id&&!o.holder).flatMap(o=>(s.types[o.type].colliders||[]).map(c=>`<rect class="map-furniture" x="${m.x+o.x+(c.x||0)-c.w/2}" y="${m.z+o.z+(c.z||0)-c.d/2}" width="${c.w}" height="${c.d}" rx=".12"/>`)).join('');return `<g class="map-region" data-region="${id}" role="button" tabindex="0" aria-label="地图：${esc(r.name)}"><rect class="map-floor" x="${m.x+b.minX}" y="${m.z+b.minZ}" width="${w}" height="${d}" rx=".7" fill="${esc(r.color)}"/>${furniture}<rect class="map-title-bg" x="${m.x+b.minX+.4}" y="${m.z+b.minZ+.4}" width="${w-.8}" height="2.5" rx=".4"/><text class="map-room-name" x="${m.x}" y="${m.z+b.minZ+2.1}" text-anchor="middle">${esc(r.name)}</text>${Object.entries(r.portals).map(([to,d])=>`<circle class="map-door" cx="${m.x+d.x}" cy="${m.z+d.z}" r=".32"/>`).join('')}</g>`;}).join('');
   this.element.innerHTML=`<div class="map-heading"><div><span>CAMPUS GUIDE</span><h2>校园总览</h2><p>公共走廊连接各室独立入口 · 中庭连接生活区 · 南侧户外步道</p></div><button id="map-close" aria-label="关闭校园总览">返回场景 ×</button></div><svg viewBox="${minX} ${minZ} ${maxX-minX} ${maxZ-minZ}" aria-label="校园各区域的位置、出入口和人物实时位置"><g>${links}</g>${blocks}<path id="map-route"/><g id="map-people"></g><text x="${maxX-2}" y="${minZ+1}" text-anchor="end" class="map-north">↑ 北</text></svg><div class="map-bottom"><div><strong id="map-destination"></strong><p id="map-itinerary"></p><small><i class="map-player-key"></i> 你的位置　● 同学与老师　<span class="map-line-key">━</span> 连接通道</small></div><div class="map-buttons"><button id="map-view">查看区域</button><button id="map-go">前往这里</button></div></div>`;
   this.element.querySelector('#map-close').onclick=()=>this.hide();
   for(const el of this.element.querySelectorAll('[data-region]')){const choose=()=>{this.selected=el.dataset.region;this.update(this.data);};el.onclick=choose;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};}
   this.element.querySelector('#map-view').onclick=()=>{this.view(this.selected);this.hide();};
   this.element.querySelector('#map-go').onclick=()=>{this.go(this.selected);this.hide();};
  }
  const room=rooms[this.selected],sequence=roomPath(rooms,p.room,this.selected)||[],dest=nearestFree(s,{room:this.selected,...(room.entry||{x:0,z:4.5})},{owner:p.id},2),origin=p.task?.approach&&p.task.phase!=='travel'?{...p,...p.task.approach}:p,points=dest&&route(s,origin,dest,4);if(points&&origin!==p)points.unshift(p.task.approach);
  for(const el of this.element.querySelectorAll('[data-region]')){el.classList.toggle('chosen',el.dataset.region===this.selected);el.setAttribute('aria-pressed',String(el.dataset.region===this.selected));}
  this.element.querySelector('#map-people').innerHTML=s.actors.filter(a=>a.presence==='here'&&!a.private).map(a=>{const [x,z]=xy(rooms,a),own=a.id===s.player;return `<g class="map-person ${own?'map-player':''}" aria-label="${esc(a.name)}在${esc(rooms[a.room].name)}"><circle cx="${x}" cy="${z}" r="${own?.55:.38}" fill="${own?'#d48d29':esc(a.color)}"/><title>${esc(a.name)} · ${esc(a.task?.label||'自由活动')}</title>${own?`<text x="${x+.9}" y="${z+.3}">你</text>`:''}</g>`;}).join('');
  this.element.querySelector('#map-route').setAttribute('d',points?.length?`M${xy(rooms,p)} `+points.map(pt=>'L'+xy(rooms,pt)).join(' '):'');
  this.element.querySelector('#map-destination').textContent=room.name;
  this.element.querySelector('#map-itinerary').textContent=sequence.length===1?'你已经在这里。点选场景中的设施即可互动。':'路线：'+sequence.map(id=>rooms[id].name).join(' → ');
  const denied=accessReason(s,p,this.selected);this.element.querySelector('#map-go').disabled=!!denied||!points;if(denied)this.element.querySelector('#map-itinerary').textContent=denied;
 }
}
