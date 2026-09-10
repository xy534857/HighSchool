import * as THREE from './vendor/three.module.js';

// The apartment and articulated characters are original procedural 3D models.
const mats = new Map();
function material(color, roughness = .82) {
  const key = `${color}:${roughness}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({color, roughness}));
  return mats.get(key);
}
const roundGeometries = new Map();
function roundedGeometry(w,h,d,r) {
  const key = [w,h,d,r].join(',');
  if(roundGeometries.has(key)) return roundGeometries.get(key);
  const g = new THREE.BoxGeometry(w,h,d,4,4,4), p = g.attributes.position;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    v.fromBufferAttribute(p,i);
    c.set(Math.max(-w/2+r,Math.min(w/2-r,v.x)),Math.max(-h/2+r,Math.min(h/2-r,v.y)),Math.max(-d/2+r,Math.min(d/2-r,v.z)));
    v.sub(c).normalize().multiplyScalar(r).add(c);p.setXYZ(i,v.x,v.y,v.z);
  }
  g.computeVertexNormals();roundGeometries.set(key,g);return g;
}
function mesh(g,color,x,y,z,parent) {
  const m=new THREE.Mesh(g,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function box(w,h,d,color,x,y,z,parent,r=.055) {return mesh(roundedGeometry(w,h,d,Math.min(r,w/3,h/3,d/3)),color,x,y,z,parent);}
function ball(r,color,x,y,z,parent,sx=1,sy=1,sz=1) {
  const m=mesh(new THREE.SphereGeometry(r,16,12),color,x,y,z,parent);m.scale.set(sx,sy,sz);return m;
}
function cyl(r1,r2,h,color,x,y,z,parent,segments=24) {return mesh(new THREE.CylinderGeometry(r1,r2,h,segments),color,x,y,z,parent);}
function ring(r,t,color,x,y,z,parent,arc=Math.PI*2) {return mesh(new THREE.TorusGeometry(r,t,6,28,arc),color,x,y,z,parent);}
function group(parent,x=0,y=0,z=0,rotation=0) {const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rotation;parent.add(g);return g;}
function leaf(parent,x,y,z,rot=0,color='#759d56') {const l=ball(.22,color,x,y,z,parent,.5,1.7,.55);l.rotation.z=rot;return l;}
function plant(parent,x,z,size=1,y=0) {
  const g=group(parent,x,y,z);g.scale.setScalar(size);
  cyl(.24,.18,.38,'#d79c72',0,.19,0,g);cyl(.245,.245,.075,'#ebb891',0,.36,0,g);
  cyl(.20,.20,.012,'#695239',0,.40,0,g);cyl(.025,.032,.53,'#6a8454',0,.62,0,g);
  leaf(g,-.12,.7,0,.75);leaf(g,.14,.82,.03,-.7,'#88af67');leaf(g,.04,1.0,-.04,.12,'#acc789');leaf(g,-.16,.91,-.03,1.05,'#739a5b');
}
function book(parent,x,y,z,color,w=.14,h=.36,d=.25) {box(w,h,d,color,x,y+h/2,z,parent,.015);box(w*.8,.025,d*.94,'#eee7d5',x,y+h*.76,z+.014,parent,.006);}
function picture(parent,x,y,z,w,h,color,kind='flower') {
  const g=group(parent,x,y,z);box(w+.12,h+.12,.08,'#c89668',0,0,0,g,.025);box(w,h,.025,color,0,0,.05,g,.006);
  if(kind==='flower') {cyl(.018,.018,h*.4,'#8ca46e',0,-h*.08,.071,g);ball(h*.13,'#edac62',0,h*.1,.08,g,1,1,.15);ball(h*.08,'#eed276',0,h*.1,.10,g,1,1,.1);}
  else {box(w*.8,h*.2,.02,'#98b6a1',0,-h*.26,.07,g,.03);ball(h*.15,'#f0c564',w*.22,h*.22,.08,g,1,1,.1);}
  return g;
}
function cup(parent,x,y,z,color='#fdf3db') {cyl(.105,.082,.18,color,x,y+.09,z,parent);cyl(.083,.083,.008,'#9c714a',x,y+.184,z,parent);const r=ring(.06,.017,color,x+.11,y+.11,z,parent);r.rotation.y=Math.PI/2;}
function chair(parent,x,z,rot=0,color='#d9aa74') {
  const g=group(parent,x,0,z,rot);box(.72,.12,.72,color,0,.56,0,g);
  box(.73,.74,.12,color,0,.96,-.32,g,.07);box(.60,.48,.055,'#e6c090',0,1.01,-.245,g,.04);
  for(const a of [-1,1])for(const b of [-1,1])box(.07,.52,.07,'#ab8059',a*.27,.26,b*.27,g,.015);
  return g;
}
function bed(parent,x,z,color) {
  const g=group(parent,x,0,z);box(1.55,.28,2.25,'#d5a775',0,.28,0,g,.10);box(1.43,.24,2.10,'#fff8e9',0,.54,0,g,.12);
  box(1.60,.9,.16,'#bd956e',0,.56,-1.10,g,.09);box(1.45,.10,1.38,color,0,.69,.30,g,.08);
  box(1.1,.20,.43,'#fff6df',0,.76,-.68,g,.16);box(1.45,.025,.12,'#ffffff',0,.752,.75,g,.01);
  for(const a of [-1,1])for(const b of [-1,1])box(.13,.23,.13,'#9e7956',a*.59,.115,b*.90,g);
}

import {SPOTS,FURNITURE,ROOMS,WALLS,DOORS,interactionPose} from './layout.js';
export { OBSTACLES } from './layout.js';

export class Apartment {
  constructor(container, onSelect, {renderer=null}={}) {
    this.container=container;this.onSelect=onSelect;this.characters=new Map();this.props=new Map();
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#eadcbf');
    this.camera=new THREE.OrthographicCamera(-10,10,8,-8,.1,100);
    this.cameraAngle=.67;this.targetAngle=.67;this.zoom=1;this.targetZoom=1;this.target=new THREE.Vector3(0,.25,0);
    this.renderer=renderer??new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#fff5df','#b4c3a1',3));
    this.sun=new THREE.DirectionalLight('#fff4df',3.8);this.sun.position.set(-5,16,8);this.sun.castShadow=true;
    Object.assign(this.sun.shadow.camera,{left:-19,right:19,top:19,bottom:-19,near:.5,far:60});this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.bias=-.0006;this.sun.shadow.normalBias=.035;this.sun.shadow.radius=4;this.scene.add(this.sun);
    this.lampLight=new THREE.PointLight('#ffc57e',12,13,2);this.lampLight.position.set(0,3,1);this.scene.add(this.lampLight);
    this.house=group(this.scene);this.buildHouse();this.screen=group(this.house);for(const [x1,z1,x2] of DOORS)box(x2-x1,1.5,.05,'#a8b4a0',(x1+x2)/2,.75,z1,this.screen,.01);this.situationProps=new Map();this.nightLamp=box(.13,.21,.13,'#ffe29a',4.8,1,-5.5,this.house,.03);this.nightLamp.visible=false;this.notebook=box(.33,.07,.42,'#7ea8be',0,.8,0,this.house,.02);
    this.selection=ring(.48,.035,'#ffe897',0,.055,0,this.scene);this.selection.rotation.x=-Math.PI/2;this.selection.visible=false;
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.installControls();
    this.resize=()=>{const w=container.clientWidth,h=container.clientHeight;this.renderer.setSize(w,h);const aspect=w/h;let view=Math.max(23,30/aspect);this.viewHeight=view;this.camera.left=-view*aspect/2;this.camera.right=view*aspect/2;this.camera.top=view/2;this.camera.bottom=-view/2;this.camera.updateProjectionMatrix();};
    window.addEventListener('resize',this.resize);this.resize();
  }
  buildHouse() {
    const h=this.house;
    box(22,.6,16,'#c99d67',0,-.3,0,h,.22);
    for(const r of ROOMS){const [x1,x2,z1,z2]=r.bounds;box(x2-x1,.1,z2-z1,r.color,(x1+x2)/2,.02,(z1+z2)/2,h,.02);}
    for(const [x1,x2,z1,z2] of WALLS){const height=z1< -7.8?2.7:z1===-2.22?.65:1.35;box(x2-x1,height,z2-z1,'#f3e8d1',(x1+x2)/2,height/2,(z1+z2)/2,h,.025);}
    for(const f of Object.values(FURNITURE)){
      const g=group(h,f.x,0,f.z);g.userData.objectId=f.id;
      if(f.type==='bed')bed(g,0,0,f.color);
      if(f.type==='desk'){
        box(1.25,.12,.75,'#deba8b',0,.91,0,g);
        for(const x of [-.5,.5])box(.09,.84,.65,'#ba9065',x,.46,0,g);
        box(.43,.03,.3,'#fff6e6',-.12,1.0,.12,g,.01);book(g,.38,.99,-.18,'#95b5ba',.18,.25,.2);
        chair(g,0,.82,Math.PI,'#c8af9a');cyl(.13,.13,.04,'#e4b65c',-.43,1,-.18,g);cyl(.02,.02,.36,'#bf9a5b',-.43,1.2,-.18,g);cyl(.08,.19,.18,'#f0cb76',-.43,1.43,-.18,g);
      }
      if(f.type==='stove'){
        box(2.1,.85,.85,'#a7bdad',0,.5,0,g);box(2.18,.1,.92,'#f8eed7',0,.97,0,g);
        for(const x of [-.53,.53]){cyl(.24,.24,.035,'#6c756c',x,1.035,0,g);cyl(.2,.23,.25,'#cf986f',x,1.16,0,g);}
        box(.65,.45,.025,'#6f8076',0,.55,.44,g);cup(g,.88,1.03,.03);
      }
      if(f.type==='fridge'){box(1.05,2.1,1.1,'#ece6d1',0,1.12,0,g,.13);box(.93,.035,.02,'#c7c8b9',0,1.48,.565,g);box(.055,.37,.08,'#a8aaa0',-.32,1.15,.61,g);box(.28,.29,.02,'#eeb67d',.12,1.7,.565,g);}
      if(f.type==='sofa'){
        box(3.3,.43,1.35,'#d88c64',0,.42,0,g,.15);box(3.3,.86,.25,'#d88c64',0,.95,-.54,g,.13);
        for(const x of [-1,0,1])box(.94,.2,1,'#eeac80',x,.72,.08,g,.12);
        for(const x of [-1.55,1.55])box(.22,.66,1.32,'#dc976d',x,.82,0,g);
      }
      if(f.type==='tv'){
        box(1.7,.65,.65,'#c79f74',0,.41,0,g);box(1.55,.9,.15,'#515650',0,1.3,0,g,.08);
        for(const z of [-.085,.085]){box(1.35,.70,.015,'#9bc3b0',0,1.3,z,g,.025);ball(.18,'#f2d180',.31,1.42,z*1.05,g,1,1,.06);}
      }
      if(f.type==='book'){
        box(1.8,1.1,.65,'#cca878',0,.62,0,g);for(const y of [.25,.72,1.2])box(1.84,.07,.7,'#e2c095',0,y,0,g);
        for(let i=0;i<8;i++)book(g,-.68+i*.19,.76,.24,['#b7cbb4','#d6a48a','#b5a9c5'][i%3],.14,.28+(i%2)*.09);
      }
      if(f.type==='table'){
        cyl(1.07,1.09,.13,'#ebc796',0,.94,0,g,40);cyl(.14,.26,.84,'#b78d60',0,.48,0,g);
        for(const spot of Object.values(SPOTS).filter(s=>s.furniture==='table'&&s.pose)){
          const t=spot.pose;chair(g,t.x-f.x,t.z-f.z,t.facing);cyl(.18,.18,.02,'#fff7df',(t.x-f.x)*.46,1.015,(t.z-f.z)*.46,g);
        }cyl(.25,.20,.1,'#a9bf99',0,1.07,0,g);ball(.12,'#e8a260',0,1.2,0,g);
      }
      g.traverse(o=>{o.userData.objectId=f.id;});
    }
    box(4.7,.025,3.7,'#a4bdb1',-6.5,.10,3.5,h,.2);
    // The rug is below the existing seats; the open hall connects all bedrooms.
    for(const [x,z] of [[-10,6.8],[5.9,6.8],[-3,6.7]])plant(h,x,z,.85);
    for(const x of [-8.5,-1,5.5])picture(h,x,1.9,-7.6,1.0,.7,'#f1d5b5','landscape');
    for(let i=0;i<3;i++)box(.25,.16,.25,['#d6a570','#98b8b1','#c7accb'][i],-4.4+i*.32,.2,4.7,h,.03);
    box(1.6,.025,.75,'#acb79c',.1,.1,7,h,.06);
  }
  makeCharacter(person) {
    const root=group(this.scene,person.x,0,person.z);root.userData.personId=person.id;
    const body=group(root), skin=person.id==='xiaoyu'?'#f5c899':'#f5cbaa', hair=person.id==='me'?'#73483c':person.id==='dad'?'#4c3b31':'#39352f';
    const shirt=person.color;const scale=person.id==='xiaoyu'?.77:person.id==='xing'?.87:person.id==='xue'?.92:1.0;root.scale.setScalar(scale);
    // Toy-like silhouette: tiny body, broad face, soft rounded limbs.
    box(.49,.58,.34,shirt,0,.86,0,body,.15);box(.15,.07,.08,'#f4e7c6',0,1.13,.168,body,.02);
    if(person.id==='dad') {box(.18,.47,.035,'#e6b651',0,.90,.18,body,.04);for(let i=0;i<3;i++)ball(.018,'#a5875f',.11,1.02-i*.13,.20,body);}
    if(person.id==='me') {box(.17,.48,.035,'#fff0d6',0,.90,.18,body,.03);}
    if(person.id==='xiaoyu')for(let i=0;i<3;i++)box(.46,.045,.018,'#eaa352',0,.70+i*.13,.18,body,.012);
    if(person.id==='xue') {box(.38,.1,.035,'#f9f4e6',0,1.09,.17,body,.03);box(.10,.16,.026,'#f9f4e6',0,1.08,.19,body,.025);}
    const legs=[];for(const s of [-1,1]) {const leg=group(body,s*.145,.62,0);box(.19,.36,.23,person.id==='xue'?'#bda9c9':'#6c827d',0,-.17,0,leg,.07);box(.23,.13,.35,person.id==='me'?'#bd785c':'#fcf0da',0,-.40,.07,leg,.07);legs.push(leg);}
    const arms=[];for(const s of [-1,1]) {const arm=group(body,s*.31,1.03,0);box(.17,.29,.22,shirt,0,-.10,0,arm,.085);ball(.10,skin,0,-.29,.015,arm,.9,1.2,.9);arms.push(arm);}
    const head=group(body,0,1.53,.012);ball(.41,skin,0,0,0,head,1.03,.99,.94);ball(.075,skin,-.413,-.014,0,head,.7,1,.75);ball(.075,skin,.413,-.014,0,head,.7,1,.75);
    const cap=mesh(new THREE.SphereGeometry(.423,24,16,0,Math.PI*2,0,1.40),hair,0,.034,-.015,head);cap.scale.set(1.03,1,1);
    if(person.id==='me') {for(const s of [-1,1])ball(.13,hair,s*.335,-.01,-.11,head,1,1.75,1.5);for(let i=0;i<5;i++)ball(.115,hair,-.29+i*.145,.19,.25,head,1.1,.8,.75);}
    if(person.id==='xing') {for(let i=0;i<5;i++){const tuft=mesh(new THREE.ConeGeometry(.10,.29,5),hair,-.27+i*.13,.41+Math.sin(i)*.025,.01,head);tuft.rotation.z=-(i-2)*.19;}ball(.13,hair,-.22,.19,.30,head,1.5,.5,.55);}
    if(person.id==='xue') {ball(.16,hair,0,.27,-.37,head);ball(.18,hair,0,.05,-.52,head,.7,2.0,.85);ring(.115,.027,'#c798b8',0,.23,-.41,head);ball(.15,hair,-.25,.18,.24,head,1,.5,.75);ball(.15,hair,.2,.20,.24,head,1.2,.6,.75);}
    if(person.id==='xiaoyu')box(.72,.12,.18,hair,0,.17,.31,head,.06);
    if(person.id==='dad') {for(let i=0;i<4;i++)ball(.14,hair,-.23+i*.15,.25,.20,head,1.05,.8,1);}
    const eyes=[];for(const s of [-1,1]) {const eye=ball(.046,'#3e3931',s*.143,.015,.362,head,.78,1.2,.46);eyes.push(eye);ball(.013,'#fff6dd',s*.143-.006,.031,.382,head,1,1,.5);ball(.065,'#eaa38e',s*.246,-.10,.309,head,1,.52,.12);const brow=box(.098,.023,.018,hair,s*.145,.11,.353,head,.011);brow.rotation.z=s*(person.id==='xing'?-.20:.06);}
    ball(.045,'#e9b38e',0,-.052,.393,head,1,.7,.65);
    const smile=ring(.059,.011,'#a86852',0,-.115,.371,head,Math.PI);smile.rotation.z=Math.PI;smile.scale.y=.48;
    if(person.id==='dad') {for(const s of [-1,1]){const glass=ring(.099,.015,'#695c43',s*.148,.017,.397,head);glass.scale.set(1.12,.83,1);}box(.09,.015,.02,'#695c43',0,.04,.40,head,.006);}
    const shadow=mesh(new THREE.CircleGeometry(.31,24),'#af9a72',0,.022,0,root);shadow.rotation.x=-Math.PI/2;shadow.material=new THREE.MeshBasicMaterial({color:'#74613e',transparent:true,opacity:.10,depthWrite:false});shadow.castShadow=false;
    root.traverse(o=>{if(o.isMesh)o.userData.personId=person.id;});
    const prop=box(.66,.045,.44,'#fff0c4',0,.93,.41,body,.02);prop.visible=false;const char={root,body,head,arms,legs,eyes,scale,prop,angle:0};this.characters.set(person.id,char);return char;
  }
  installControls() {
    const canvas=this.renderer.domElement;let start=null,moved=false;
    canvas.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY,angle:this.targetAngle};moved=false;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x;if(Math.hypot(dx,e.clientY-start.y)>6)moved=true;if(moved)this.targetAngle=start.angle-dx*.006;});
    canvas.addEventListener('pointerup',e=>{if(start&&!moved){const r=canvas.getBoundingClientRect();this.pointer.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);const hits=this.raycaster.intersectObjects([...this.characters.values()].filter(c=>c.root.visible).map(c=>c.root),true);if(hits.length)this.onSelect(hits[0].object.userData.personId);else{const surfaces=this.raycaster.intersectObject(this.house,true);if(surfaces.length){const key=surfaces.find(hit=>hit.object.userData.objectId)?.object.userData.objectId;if(key)this.onSelect('object:'+key);}}}start=null;});
    canvas.addEventListener('pointercancel',()=>start=null);
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.targetZoom=THREE.MathUtils.clamp(this.targetZoom-e.deltaY*.001, .65,1.7);},{passive:false});
  }
  rotate(direction) {this.targetAngle+=direction*Math.PI/5;}
  changeZoom(direction) {this.targetZoom=THREE.MathUtils.clamp(this.targetZoom+direction*.13,.65,1.7);}
  reset() {this.targetAngle=.67;this.targetZoom=1;}
  updateSituationProps(world) {
    this.nightLamp.visible=!!world.storyEconomy?.policies['night-light'];
    const keys=new Set();
    for(const c of world.incidents||[])for(const o of c.objects){
      const key=c.id+'-'+o.id;keys.add(key);
      let item=this.situationProps.get(key);
      if(!item){item=box(o.id==='toy'?.36:.38,.1,o.id==='toy'?.18:.48,o.id==='toy'?'#ce7757':'#98ae82',0,0,0,this.house,.03);this.situationProps.set(key,item);}
      const furniture=FURNITURE[o.location],spot=SPOTS[o.location];
      item.visible=!!spot;item.position.set(furniture?.x??spot?.x??0,furniture?.type==='desk'?1.06:.24,furniture?.z??spot?.z??0);
      if(o.carrier){const owner=world.person(o.carrier);item.position.set(owner.x+.25,1.1,owner.z+.2);item.visible=owner.presence!=='away';}
      item.rotation.z=o.condition==='broken'?.3:0;
    }
    for(const [key,item] of this.situationProps)if(!keys.has(key))item.visible=false;
  }
  update(people,dt,time,selected,minute,world) {
    // World state is available here, after construction and save restoration.
    if(world)this.updateSituationProps(world);
    if(world){this.screen.visible=world.space.screenClosed;const item=world.objects.notebook,spot=SPOTS[item.location];const f=FURNITURE[item.location];const anchor=f?[f.x+.1,f.type==='desk'?1.02:1.28,f.z+.12]:[spot?.x||0,.18,spot?.z||0];this.notebook.position.set(...anchor);this.notebook.visible=!item.hidden;}
    this.cameraAngle=THREE.MathUtils.lerp(this.cameraAngle,this.targetAngle,Math.min(1,dt*8));this.zoom=THREE.MathUtils.lerp(this.zoom,this.targetZoom,Math.min(1,dt*8));
    this.camera.position.set(Math.sin(this.cameraAngle)*20,18.8,Math.cos(this.cameraAngle)*20);this.camera.lookAt(this.target);this.camera.zoom=this.zoom;this.camera.updateProjectionMatrix();
    const dusk=minute<400?1:minute<480?1-THREE.MathUtils.smoothstep(minute,400,480):THREE.MathUtils.smoothstep(minute,1030,1300);this.sun.intensity=3.8-dusk*2.6;this.lampLight.intensity=7+dusk*18;this.scene.background.set(dusk>.5?'#c7baa4':'#eadcbf');
    for(const p of people) {
      let c=this.characters.get(p.id);if(!c)c=this.makeCharacter(p);
      const pose=interactionPose(p);c.root.visible=p.presence!=='away';c.root.position.set(pose.x,pose.y,pose.z);c.prop.visible=!!world?.episode?.prepared[p.id]&&(p.action==='gatherScene'||world?.activeConversation(p)?.topic.stage==='finale');c.body.rotation.x=pose.pitch;c.body.rotation.z=0;
      const moving=p.moving;const desired=pose.kind==='stand'?(p.facing??0):pose.facing;let delta=((desired-c.angle+Math.PI*3)%(Math.PI*2))-Math.PI;c.angle+=delta*Math.min(1,dt*9);c.root.rotation.y=c.angle;
      const walk=moving?Math.sin(time*10+p.index):0;c.body.position.y=moving?Math.abs(walk)*.035:Math.sin(time*2+p.index)*.008;
      c.legs[0].rotation.x=walk*.43;c.legs[1].rotation.x=-walk*.43;
      const talking=!!p.speech;const active=!p.suspendedTask&&(p.action==='cook'||p.action==='tidy'||p.action==='study'||p.action==='work'||p.action==='prepareScene'||p.action==='repair'||p.action==='incident'&&p.task?.phase==='doing');
      c.arms[0].rotation.x=moving?-walk*.38:active?-.65+Math.sin(time*5)*.16:talking?-.35+Math.sin(time*6)*.18:0;
      c.arms[1].rotation.x=moving?walk*.38:active?-.65-Math.sin(time*5)*.16:talking?-.55+Math.cos(time*5)*.2:0;
      c.arms[0].rotation.z=talking?.18:0;c.arms[1].rotation.z=talking?-.24:0;
      c.head.rotation.z=talking?Math.sin(time*3)*.055:0;c.head.rotation.x=['rest','sleep'].includes(p.action)?.2:0;
      const sitting=pose.kind==='seat';
      if(sitting){c.body.position.y=0;c.legs[0].rotation.x=-1.25;c.legs[1].rotation.x=-1.25;}
      if(pose.kind==='sleep'){c.body.position.y=0;c.legs[0].rotation.x=c.legs[1].rotation.x=0;c.arms[0].rotation.x=c.arms[1].rotation.x=0;c.head.rotation.x=0;}
      const blink=pose.kind==='sleep'||(time+p.index*1.1)%4.2<.13;for(const eye of c.eyes)eye.scale.y=blink?.12:1.2;
      if(p.id===selected){this.selection.visible=p.presence!=='away';this.selection.position.set(pose.x,.16,pose.z);this.selection.scale.setScalar(1+Math.sin(time*3)*.03);}
    }
    if(!selected)this.selection.visible=false;this.renderer.render(this.scene,this.camera);
  }
  project(person,offset=0) {const c=this.characters.get(person.id);if(!c||person.presence==='away')return null;const pose=interactionPose(person);const pos=new THREE.Vector3(pose.x,pose.kind==='sleep'?1.4+offset:.1+2.0*c.scale+offset,pose.z);pos.project(this.camera);return {x:(pos.x*.5+.5)*this.container.clientWidth,y:(-.5*pos.y+.5)*this.container.clientHeight,visible:pos.z<1};}
}
