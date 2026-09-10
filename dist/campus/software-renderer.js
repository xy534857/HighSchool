import {THREE} from './geometry.js';
// Canvas rasterizer for the same Three scene graph when a device lacks WebGL.
// No simulation or input behavior changes with the rendering backend.
export class SoftwareRenderer {
 constructor(){this.domElement=document.createElement('canvas');this.domElement.dataset.backend='canvas';this.ctx=this.domElement.getContext('2d',{alpha:false});this.shadowMap={};this.ratio=1;this.last=0;this.clearColor='#dfe9e3';this.staticKey='';this.staticFaces=[];this.geometries=new Map();}
 setPixelRatio(r){this.ratio=Math.min(r,1.2);}
 setSize(w,h){this.w=w;this.h=h;this.domElement.width=Math.round(w*this.ratio);this.domElement.height=Math.round(h*this.ratio);this.domElement.style.width=w+'px';this.domElement.style.height=h+'px';this.staticKey='';}
 render(scene,camera){
  const now=performance.now();this.last=now;if(!this.w||!this.h)return; // CampusScene owns the frame budget; avoid a second throttle.
  scene.updateMatrixWorld();camera.updateMatrixWorld();
  const active=[];scene.traverseVisible(o=>{if(o.isMesh&&o.geometry?.attributes.position)active.push(o);});
  const visible=active.filter(o=>{let at=o;while(at){if(!at.visible)return false;at=at.parent;}return true;});
  const dynamic=o=>{let at=o;while(at){if(at.userData.dynamic)return true;at=at.parent;}return false;};
  const transformKey=o=>{let h=2166136261;for(const n of o.matrixWorld.elements)h=Math.imul(h^Math.round(n*100),16777619);return o.id+':'+(h>>>0);};
  const key=[this.w,this.h,camera.position.x.toFixed(3),camera.position.z.toFixed(3),camera.zoom.toFixed(3),...visible.filter(o=>!dynamic(o)).map(transformKey)].join('|');
  const fullKey=key+'|'+visible.filter(dynamic).map(transformKey).join('|');if(fullKey===this.fullKey)return;this.fullKey=fullKey;
  const view=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),light=new THREE.Vector3(-.35,.8,.55).normalize();
  const makeFaces=meshes=>{const faces=[];for(const mesh of meshes){
   let geom=this.geometries.get(mesh.geometry.uuid);if(!geom){const p=mesh.geometry.parameters||{};geom=mesh.geometry.type==='BoxGeometry'?new THREE.BoxGeometry(p.width,p.height,p.depth):mesh.geometry.type==='SphereGeometry'?new THREE.SphereGeometry(p.radius,8,6,p.phiStart,p.phiLength,p.thetaStart,p.thetaLength):mesh.geometry.type==='CylinderGeometry'?new THREE.CylinderGeometry(p.radiusTop,p.radiusBottom,p.height,8):mesh.geometry.type==='TorusGeometry'?new THREE.TorusGeometry(p.radius,p.tube,4,12,p.arc):mesh.geometry;this.geometries.set(mesh.geometry.uuid,geom);}const p=geom.attributes.position,normals=geom.attributes.normal,idx=geom.index,count=idx?idx.count:p.count,mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;if(!mat||mat.opacity===0)continue;
   const matrix=new THREE.Matrix4().multiplyMatrices(view,mesh.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),positions=[];
   for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix);positions.push([(v.x*.5+.5)*this.w,(-v.y*.5+.5)*this.h,v.z]);}
   for(let i=0;i<count;i+=3){const ai=idx?idx.getX(i):i,bi=idx?idx.getX(i+1):i+1,ci=idx?idx.getX(i+2):i+2,a=positions[ai],b=positions[bi],c=positions[ci];
    const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(area>=0&&mat.side!==THREE.DoubleSide||Math.abs(area)<.008)continue;
    if(Math.max(a[0],b[0],c[0])<0||Math.min(a[0],b[0],c[0])>this.w||Math.max(a[1],b[1],c[1])<0||Math.min(a[1],b[1],c[1])>this.h)continue;
    const normal=normals?new THREE.Vector3().fromBufferAttribute(normals,ai).add(new THREE.Vector3().fromBufferAttribute(normals,bi)).add(new THREE.Vector3().fromBufferAttribute(normals,ci)).normalize().applyMatrix3(normalMatrix).normalize():light;
    const base=(mat.color||new THREE.Color('#bbb')).clone().convertLinearToSRGB(),shade=mat.isMeshBasicMaterial?1:.78+Math.max(0,normal.dot(light))*.23;
    const color=`rgba(${Math.min(255,Math.round(base.r*255*shade))},${Math.min(255,Math.round(base.g*255*shade))},${Math.min(255,Math.round(base.b*255*shade))},${mat.opacity??1})`;
    faces.push({a,b,c,layer:mesh.userData.layer||0,z:(a[2]+b[2]+c[2])/3,color});
   }
  }return faces;};
  if(key!==this.staticKey){this.staticFaces=makeFaces(visible.filter(o=>!dynamic(o)));this.staticKey=key;}
  const ctx=this.ctx,paint=(context,faces)=>{for(const f of faces){context.fillStyle=f.color;context.beginPath();context.moveTo(f.a[0],f.a[1]);context.lineTo(f.b[0],f.b[1]);context.lineTo(f.c[0],f.c[1]);context.closePath();context.fill();}};
  // Cache the room as cropped depth layers; animation redraws only characters.
  // Painter ordering remains an approximation, as in the original Canvas path.
  if(this.rasterKey!==key){
   const base=this.staticFaces.filter(f=>f.layer<0).sort((a,b)=>a.layer-b.layer||b.z-a.z),rest=this.staticFaces.filter(f=>f.layer>=0).sort((a,b)=>b.z-a.z);
   const groups=[{z:Infinity,faces:base}];const size=Math.max(1,Math.ceil(rest.length/48));
   for(let i=0;i<rest.length;i+=size){const faces=rest.slice(i,i+size);groups.push({z:(faces[0].z+faces.at(-1).z)/2,faces});}
   this.layers=groups.filter(g=>g.faces.length).map(g=>{
    let x=this.w,y=this.h,r=0,b=0;for(const f of g.faces)for(const p of [f.a,f.b,f.c]){x=Math.min(x,p[0]);y=Math.min(y,p[1]);r=Math.max(r,p[0]);b=Math.max(b,p[1]);}
    x=Math.max(0,Math.floor(x)-1);y=Math.max(0,Math.floor(y)-1);r=Math.min(this.w,Math.ceil(r)+1);b=Math.min(this.h,Math.ceil(b)+1);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil((r-x)*this.ratio));canvas.height=Math.max(1,Math.ceil((b-y)*this.ratio));const c=canvas.getContext('2d');c.setTransform(this.ratio,0,0,this.ratio,-x*this.ratio,-y*this.ratio);paint(c,g.faces);return {canvas,x,y,z:g.z};
   });this.rasterKey=key;
  }
  const moving=makeFaces(visible.filter(dynamic)).sort((a,b)=>a.layer-b.layer||b.z-a.z);
  ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.fillStyle='#'+(scene.background?.getHexString()||'dfe9e3');ctx.fillRect(0,0,this.w,this.h);
  let index=0;for(const layer of this.layers){const front=[];while(index<moving.length&&moving[index].z>layer.z)front.push(moving[index++]);paint(ctx,front);ctx.drawImage(layer.canvas,layer.x,layer.y,layer.canvas.width/this.ratio,layer.canvas.height/this.ratio);}paint(ctx,moving.slice(index));
  this.drawMs=performance.now()-now;this.draws=(this.draws||0)+1;

 }
}
export function createRenderer(){
 const canvas=document.createElement('canvas');let context=null;
 try{context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'});}catch{}
 if(!context)return new SoftwareRenderer();
 const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:false});renderer.domElement.dataset.backend='webgl';return renderer;
}
