import {THREE,box,ball,cyl,ring,group,plant} from './geometry.js';
import {makeProp,makeStudent} from './models.js';
import {animateCharacter} from './animation.js';
import {pointFree} from '../foundation/space.js';
import {createRenderer} from './software-renderer.js';

export class CampusScene {
 constructor(container,overlay,onSelect,onFloor){
  this.container=container;this.overlay=overlay;this.onSelect=onSelect;this.onFloor=onFloor;this.rooms=new Map();this.props=new Map();this.people=new Map();this.labels=new Map();this.room='classroom';this.selected=null;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#dfe9e3');
  this.camera=new THREE.OrthographicCamera(-12,12,9,-9,.1,100);this.angle=.58;this.targetAngle=.58;this.zoom=1;this.targetZoom=1;
  this.renderer=createRenderer();this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));this.renderer.shadowMap.enabled=false;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;container.appendChild(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','可旋转缩放的校园场景');
  this.scene.add(new THREE.HemisphereLight('#fff8e9','#90a6a0',2.8));const sun=new THREE.DirectionalLight('#fff4da',3.2);sun.position.set(-8,16,10);sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);Object.assign(sun.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:.5,far:55});sun.shadow.normalBias=.05;this.scene.add(sun);
  this.selectionRing=ring(.53,.026,'#e5ac4a',0,.045,0,this.scene);this.selectionRing.rotation.x=-Math.PI/2;this.selectionRing.visible=false;this.selectionRing.userData.dynamic=true;
  this.playerMarker=new THREE.Mesh(new THREE.OctahedronGeometry(.16),new THREE.MeshStandardMaterial({color:'#eeb647',emissive:'#8d5e10',emissiveIntensity:.2}));this.playerMarker.userData.dynamic=true;this.scene.add(this.playerMarker);
  this.pointer=new THREE.Vector2();this.ray=new THREE.Raycaster();this.bind();new ResizeObserver(()=>this.resize()).observe(container);this.resize();
 }
 build(snapshot){
  this.data=snapshot;
  for(const [id,room] of Object.entries(snapshot.rooms)){
   const g=group(this.scene);g.visible=id===this.room;this.rooms.set(id,g);
   const b=room.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ;
   box(w+.4,.4,d+.4,'#718e89',0,-.3,0,g,.12);box(w,.1,d,room.color,0,-.06,0,g,.02);
   const floor=box(w,.015,d,room.color,0,0,0,g,.005);floor.userData.floor=true;floor.userData.room=id;
   for(const a of room.zones||[])box(a.w,.012,a.d,a.color,a.x,.012,a.z,g,.01);
   if(!room.outdoor){
    for(let x=b.minX;x<=b.maxX;x+=2)box(.012,.012,d,room.surface==='wood'?'#b6a78f':'#c0cfc6',x,.023,0,g,.004);for(let z=b.minZ;z<=b.maxZ;z+=2)box(w,.012,.012,'#c0cfc6',0,.023,z,g,.004);
    const wall=(axis,min,max,fixed,color)=>{const cuts=Object.values(room.portals).filter(p=>axis==='x'?p.z<b.minZ+1:p.x<b.minX+1).map(p=>p[axis]).sort((a,b)=>a-b);let start=min;for(const cut of [...cuts,max+1]){const end=Math.min(max,cut-.9);if(end>start){if(axis==='x')box(end-start,2.8,.18,color,(start+end)/2,1.4,fixed,g);else box(.18,2.8,end-start,color,fixed,1.4,(start+end)/2,g);}start=cut+.9;}};
    wall('x',b.minX,b.maxX,b.minZ,'#e8eddf');wall('z',b.minZ,b.maxZ,b.minX,'#e1e8dc');
    for(const z of [b.minZ+2.4,0,b.maxZ-2.4].filter(z=>!Object.values(room.portals).some(p=>p.x<b.minX+1&&Math.abs(p.z-z)<1.8))){box(.05,1.35,2.1,'#8faeb0',b.minX+.12,1.85,z,g);box(.035,1.2,1.95,'#d0e4e1',b.minX+.16,1.85,z,g);box(.045,1.22,.04,'#eff3e8',b.minX+.2,1.85,z,g);box(.055,.045,2,'#eff3e8',b.minX+.2,1.85,z,g);}
    for(const d of room.decorations||[])plant(g,d.x,d.z,d.size);
   }else{
    for(const d of room.decorations||[]){const {x,z}=d;cyl(.13,.18,1.5,'#987853',x,.75,z,g);ball(.8,'#86ab73',x,2,z,g,1,1.25,1);ball(.64,'#a5bd80',x+.35,2.45,z-.1,g);}
    if(room.surface==='court'){
     box(8,.02,9,'#bf9878',-2,.018,0,g);for(const x of [-6,2])box(.045,.012,9,'#f3e8c9',x,.033,0,g);for(const z of [-4.5,0,4.5])box(8,.012,.045,'#f3e8c9',-2,.033,z,g);
     const circle=ring(1.1,.025,'#efe7cd',-2,.042,0,g);circle.rotation.x=-Math.PI/2;
     for(let i=0;i<3;i++)box(.025,.022,10,'#ecdfc2',3+i*.8,.025,0,g);
    }else{box(3,.018,d,'#d6d3bd',0,.022,0,g);box(w,.018,2,'#d6d3bd',0,.023,4,g);}
   }
   g.traverse(m=>{if(m.isMesh&&m.position.y<=.06)m.userData.layer=-100+Math.round((m.position.y+.4)*100);});
   for(const [to,p] of Object.entries(room.portals)){
    const pad=box(1.25,.026,.7,'#96b9aa',p.x,.025,p.z,g,.1);pad.userData.selection={kind:'portal',id:to};pad.userData.layer=-55;
   }
  }
  for(const o of snapshot.objects){const prop=makeProp(snapshot.types[o.type]);prop.position.set(o.x,0,o.z);prop.traverse(m=>{if(m.isMesh){m.userData.selection={kind:'object',id:o.id};m.castShadow=true;m.receiveShadow=true;}});this.rooms.get(o.room).add(prop);this.props.set(o.id,prop);prop.userData.door=prop.getObjectByName('door');prop.userData.instrument=prop.getObjectByName('instrument');prop.userData.growth=prop.getObjectByName('growth');}
  for(const p of snapshot.actors){const char=makeStudent(p);char.root.userData.dynamic=true;this.scene.add(char.root);char.root.position.set(p.x,0,p.z);this.people.set(p.id,char);}
  this.buildLabels(snapshot);
  for(const [rid,r] of Object.entries(snapshot.rooms))for(const [to,p] of Object.entries(r.portals)){const el=document.createElement('button');el.className='world-label doorway';el.textContent='→ '+snapshot.rooms[to].name;el.setAttribute('aria-label','查看通往'+snapshot.rooms[to].name+'的出口');el.onclick=()=>this.onSelect({kind:'portal',id:to});this.overlay.appendChild(el);this.labels.set('portal:'+rid+':'+to,el);}
 }
 buildLabels(snapshot){
  for(const [kind,items] of [['actor',snapshot.actors],['object',snapshot.objects]])for(const item of items){
   const el=document.createElement('button');el.type='button';el.className='world-label '+kind;el.setAttribute('aria-label',(kind==='actor'?'选择人物：':'选择物品：')+item.name);el.dataset.id=item.id;el.dataset.kind=kind;el.innerHTML=kind==='actor'?'<i></i><span></span>':'<i>＋</i><span></span>';el.querySelector('span').textContent=item.name;el.onclick=e=>{e.stopPropagation();this.onSelect({kind,id:item.id});};this.overlay.appendChild(el);this.labels.set(kind+':'+item.id,el);
  }
 }
 setRoom(id){this.room=id;for(const [key,g] of this.rooms)g.visible=key===id;this.targetAngle=.58;this.targetZoom=1;this.resize();this.scene.background.set(this.data.rooms[id]?.outdoor?'#dce8dc':'#dfe9e3');this.renderedAt=0;this.update(this.data,1/30,performance.now()/1000);}
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);const aspect=w/h,b=this.data?.rooms[this.room]?.bounds,extent=b?Math.max(21,(b.maxX-b.minX)*.86+(b.maxZ-b.minZ)*.58):21,view=Math.max(15.8,extent/aspect,extent*.62);this.camera.left=-view*aspect/2;this.camera.right=view*aspect/2;this.camera.top=view/2;this.camera.bottom=-view/2;this.camera.updateProjectionMatrix();}
 bind(){let start=null,moved=false;const canvas=this.renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY,a:this.targetAngle};moved=false;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>5){moved=true;this.targetAngle=start.a-(e.clientX-start.x)*.006;}});
  canvas.addEventListener('pointerup',e=>{if(start&&!moved){const b=canvas.getBoundingClientRect();this.pointer.set((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2);this.ray.setFromCamera(this.pointer,this.camera);const targets=[...this.props.values()].filter(p=>p.parent?.visible&&p.visible).concat([...this.people.values()].filter(c=>c.root.visible).map(c=>c.root));const hits=this.ray.intersectObjects(targets,true);if(hits.length)this.onSelect(hits[0].object.userData.selection);else{const floors=this.ray.intersectObject(this.rooms.get(this.room),true).filter(h=>h.object.userData.floor);if(floors.length)this.onFloor(this.room,floors[0].point.x,floors[0].point.z);}}start=null;});
  canvas.addEventListener('pointercancel',()=>start=null);canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoomBy(-e.deltaY*.001);},{passive:false});
 }
 zoomBy(n){this.targetZoom=Math.max(.7,Math.min(1.75,this.targetZoom+n));}
 update(snapshot,dt,time){
  const now=performance.now();if(this.renderer.domElement.dataset.backend==='canvas'&&now-(this.renderedAt||0)<32)return;dt=this.renderedAt?Math.min(.2,(now-this.renderedAt)/1000):dt;this.renderedAt=now;
  this.data=snapshot;this.angle+=(this.targetAngle-this.angle)*Math.min(1,dt*8);this.zoom+=(this.targetZoom-this.zoom)*Math.min(1,dt*8);this.camera.position.set(Math.sin(this.angle)*24,20,Math.cos(this.angle)*24);this.camera.lookAt(0,.2,0);this.camera.zoom=this.zoom;this.camera.updateProjectionMatrix();
  for(const o of snapshot.objects){const prop=this.props.get(o.id);if(!prop)continue;if(prop.parent!==this.rooms.get(o.room))this.rooms.get(o.room).add(prop);prop.position.set(o.x,o.holder?.length?1.1:0,o.z);prop.visible=!o.holder;if(o.room!==this.room)continue;const growth=prop.userData.growth;if(growth)growth.scale.y=.35+(o.state.growth||0)/100;const instrument=prop.userData.instrument;if(instrument)instrument.visible=!Object.entries(snapshot.leases).some(([key,l])=>key.startsWith(o.id+':')&&snapshot.actors.find(a=>a.id===l.actor)?.task?.phase==='perform');if(snapshot.types[o.type].model==='locker')prop.rotation.y=o.state.open?-.13:0;const door=prop.userData.door;if(door){door.userData.dynamic=true;const lease=Object.entries(snapshot.leases).find(([key])=>key.startsWith(o.id+':'))?.[1],actor=lease&&snapshot.actors.find(a=>a.id===lease.actor);const closed=actor?.task?.phase==='perform';const indicator=prop.getObjectByName('occupancy');if(indicator){if(!indicator.userData.ownMaterial){indicator.material=indicator.material.clone();indicator.userData.ownMaterial=true;}indicator.material.color.set(lease?'#c67c63':'#88ad7c');}door.rotation.y+=( (closed?0:-1.3)-door.rotation.y)*Math.min(1,dt*10);}}
  for(const p of snapshot.actors){const c=this.people.get(p.id);if(!c)continue;c.root.visible=p.room===this.room;const smooth=c.last?.room===p.room?Math.min(1,dt*8):1;const prev=c.root.position.clone();const next={room:p.room,x:c.root.position.x+(p.x-c.root.position.x)*smooth,z:c.root.position.z+(p.z-c.root.position.z)*smooth};
   if(p.task?.phase==='travel'&&!pointFree(snapshot,next,{owner:p.id})){next.x=p.x;next.z=p.z;}
   if(p.task?.phase==='perform'&&p.pose!=='running'){next.x=p.x;next.z=p.z;}c.root.position.x=next.x;c.root.position.z=next.z;
   const moving=['travel','enter','exit','return'].includes(p.task?.phase)&&!p.task.blockedBy||p.pose==='running';
   let angle=p.facing??c.angle;if(p.task?.phase==='perform'&&p.task.anchor.facing!==undefined)angle=p.task.anchor.facing;
   if(moving&&prev.distanceTo(c.root.position)>.004)angle=Math.atan2(c.root.position.x-prev.x,c.root.position.z-prev.z);
   c.angle+=Math.atan2(Math.sin(angle-c.angle),Math.cos(angle-c.angle))*Math.min(1,dt*10);c.root.rotation.y=c.angle;
   let clip=moving?(p.pose==='running'?'run':'walk'):p.task?.phase==='perform'?(p.task.animation?.clip||'idle'):p.session?'talk':'idle';
   if(p.task?.blockedBy)clip='idle';if(p.task?.phase==='enter'||p.task?.phase==='exit')clip='walk';
   let blend=1,from='idle';
   if(['enter','exit'].includes(p.task?.phase)&&p.task.approach){const a=p.task.anchor,e=p.task.approach,total=Math.hypot(a.x-e.x,a.z-e.z)||1;blend=Math.max(0,Math.min(1,1-Math.hypot(p.x-a.x,p.z-a.z)/total));from='idle';clip=p.task.animation?.clip||'idle';}
   const gesture=!moving&&snapshot.ambient?.findLast(e=>e.actor===p.id&&e.delivery==='room'&&e.time>=snapshot.time-1.5)?.animation;
   animateCharacter(c,clip,(time+(p.id.charCodeAt(0)%7)*.2)*(p.task?.animation?.speed||1),dt,{blend,from,gesture,render:p.task?.phase==='perform'?p.task.anchor.render:undefined});
   const tray=c.handProps.tray,carrying=!!(p.resources?.meal||p.resources?.tray);tray.visible=carrying&&!['eat','sleep','toilet'].includes(clip);if(tray.visible){c.arms[0].rotation.x=-.8;c.arms[1].rotation.x=-.8;c.elbows[0].rotation.x=-.8;c.elbows[1].rotation.x=-.8;tray.getObjectByName('meal').visible=!!p.resources.meal;}
   c.root.visible=p.room===this.room&&!p.private;c.last=p;
   if(p.id===snapshot.player){this.playerMarker.visible=p.room===this.room;this.playerMarker.position.set(c.root.position.x,2.3+(this.renderer.domElement.dataset.backend==='canvas'?0:Math.sin(time*2)*.06),c.root.position.z);this.playerMarker.rotation.y=this.renderer.domElement.dataset.backend==='canvas'?0:time;}
  }
  this.selectionRing.visible=false;
  const selected=this.selected?(this.selected.kind==='object'?snapshot.objects:snapshot.actors).find(o=>o.id===this.selected.id):null;
  if(selected&&selected.room===this.room){this.selectionRing.visible=true;this.selectionRing.position.set(selected.x,.045,selected.z);}
  for(const [key,el] of this.labels){const [kind,id,to]=key.split(':');if(kind==='portal'){el.hidden=id!==this.room;if(!el.hidden){const p=snapshot.rooms[id].portals[to],pt=new THREE.Vector3(p.x,.35,p.z).project(this.camera);el.style.transform=`translate(${(pt.x*.5+.5)*this.container.clientWidth}px,${(-pt.y*.5+.5)*this.container.clientHeight}px) translate(-50%,-50%)`;}continue;}const entity=(kind==='actor'?snapshot.actors:snapshot.objects).find(o=>o.id===id);if(!entity)continue;const show=entity.room===this.room&&!entity.private&&(kind!=='object'||!entity.holder);el.hidden=!show;if(!show)continue;
   if(kind==='actor')el.dataset.animation=this.people.get(id).clip;const c=kind==='actor'?this.people.get(id).root.position:entity;const pt=new THREE.Vector3(c.x,kind==='actor'?2:1.1,c.z).project(this.camera);el.style.left='0';el.style.top='0';el.style.transform=`translate(${(pt.x*.5+.5)*this.container.clientWidth}px,${(-pt.y*.5+.5)*this.container.clientHeight}px) translate(-50%,-50%)`;el.classList.toggle('selected',selected?.id===id);el.classList.toggle('player',id===snapshot.player);if(kind==='actor')el.querySelector('i').style.background=entity.color;
  }
  const beforeDraw=this.renderer.draws;this.renderer.render(this.scene,this.camera);
  const didDraw=beforeDraw===undefined||this.renderer.draws!==beforeDraw;
  this.stats??={since:now,frames:0,fps:0,ms:0};this.stats.ms=performance.now()-now;if(didDraw)this.stats.frames++;if(now-this.stats.since>=1000){this.stats.fps=Math.round(this.stats.frames*1000/(now-this.stats.since));this.stats.frames=0;this.stats.since=now;}
 }
}
