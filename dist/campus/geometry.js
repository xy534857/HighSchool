import * as THREE from '../vendor/three.module.js';

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


export {THREE,material,mesh,box,ball,cyl,ring,group,plant,book,picture,cup,chair,bed};
