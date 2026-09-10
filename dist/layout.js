// A furniture instance owns its footprint, approach and use pose. Rendering,
// navigation, perception and interaction selection all use this definition.
export const LAYOUT_VERSION=2;
export const ROOMS=[
 {id:'parents',name:'爸妈的房间',bounds:[-10.8,-3.5,-7.8,-2.1],color:'#e5cfb1'},
 {id:'xue',name:'夏雪的房间',bounds:[-3.5,2.7,-7.8,-2.1],color:'#ddd4e8'},
 {id:'boys',name:'兄弟俩的房间',bounds:[2.7,10.8,-7.8,-2.1],color:'#c8ded8'},
 {id:'living',name:'客厅',bounds:[-10.8,-2,-2.1,7.8],color:'#ead5b5'},
 {id:'dining',name:'餐厅',bounds:[-2,5.5,-2.1,7.8],color:'#ead5b5'},
 {id:'kitchen',name:'厨房',bounds:[5.5,10.8,-2.1,7.8],color:'#e1e5cc'}
];
// Full walls have real door openings. Front walls are shown low in the cutaway.
export const WALLS=[[-10.9,10.9,-7.9,-7.65],[-10.9,-10.65,-7.9,7.8],[10.65,10.9,-7.9,7.8],
 [-3.62,-3.38,-7.65,-2.1],[2.58,2.82,-7.65,-2.1],
 [-10.65,-6,-2.22,-1.98],[-4.35,-.85,-2.22,-1.98],[.85,6.2,-2.22,-1.98],[7.9,10.65,-2.22,-1.98]];
export const DOORS=[[-6,-2.1,-4.35,-2.1],[-.85,-2.1,.85,-2.1],[6.2,-2.1,7.9,-2.1]];
export const FURNITURE={};
export const SPOTS={};
function item(id,type,name,x,z,w,d,approach,pose,owner=null){
 const f={id,type,name,x,z,w,d,owner,approach,pose};FURNITURE[id]=f;
 SPOTS[id]={name,x:approach.x,z:approach.z,owner,pose,furniture:id};return f;
}
for(const [i,owner,x,color] of [[1,'dad',-9.2,'#98b7b0'],[2,'me',-7.6,'#98b7b0'],[3,'xue',-2.1,'#baabce'],[4,'xing',4.2,'#8db7c0'],[5,'xiaoyu',6.2,'#e7bd6d']]){
 const f=item('bed'+i,'bed',({dad:'夏东海',me:'刘梅',xue:'夏雪',xing:'刘星',xiaoyu:'夏雨'})[owner]+'的床',x,-5.6,1.55,2.25,{x,z:-3.85},{kind:'bed',x,y:.78,z:-4.85,facing:0},owner);f.color=color;
}
for(const [id,owner,name,x,z] of [['deskDad','dad','夏东海的写字台',-4.7,-6.5],['deskMe','me','刘梅的小桌',-4.7,-3.7],['deskXue','xue','夏雪的书桌',.9,-6.5],['desk','xing','刘星的书桌',9,-6.5],['deskYu','xiaoyu','夏雨的画画桌',9,-3.7]]){
 item(id,'desk',name,x,z,1.25,.75,{x:x-.95,z:z+.95},{kind:'seat',x,y:.16,z:z+.82,facing:Math.PI},owner);
}
export const OWN_DESK={dad:'deskDad',me:'deskMe',xue:'deskXue',xing:'desk',xiaoyu:'deskYu'};
item('stove','stove','灶台',7,-.7,2.1,.85,{x:7,z:.3},{kind:'stand',x:7,y:.1,z:.3,facing:Math.PI});
item('fridge','fridge','冰箱',9.7,-.65,1.05,1.1,{x:9.7,z:.65},{kind:'stand',x:9.7,y:.1,z:.65,facing:Math.PI});
item('sofa','sofa','沙发',-8,1,3.3,1.35,{x:-6,z:1.3},{kind:'seat',x:-7,y:.28,z:1.1,facing:0});
item('tv','tv','电视',-8.5,6.15,1.7,.65,{x:-8.7,z:2.25},{kind:'seat',x:-8.7,y:.28,z:1.1,facing:0});
item('book','book','阅读角',-3.4,.1,1.8,.7,{x:-3.4,z:1.2},{kind:'stand',x:-3.4,y:.1,z:1.2,facing:Math.PI});
item('table','table','餐桌',2.1,3.8,2.15,2.15,{x:2.1,z:1.4},null);
for(let i=0;i<5;i++){
 const a=i*Math.PI*2/5+.15,x=2.1+Math.sin(a)*1.65,z=3.8+Math.cos(a)*1.65;
 SPOTS['dining'+(i+1)]={name:'餐桌座位 '+(i+1),x:2.1+Math.sin(a)*2.3,z:3.8+Math.cos(a)*2.3,pose:{kind:'seat',x,y:.12,z,facing:a+Math.PI},furniture:'table'};
}
SPOTS.clean={name:'餐桌旁',x:4.65,z:3.8};SPOTS.delivery={name:'玄关',x:.1,z:7};SPOTS.play={name:'客厅地毯',x:-4.4,z:4.7};
for(let i=0;i<5;i++){const a=i*Math.PI*2/5;SPOTS['gather'+i]={name:'客厅碰头处',x:-4.8+Math.sin(a)*1.25,z:4.2+Math.cos(a)*1.25};}
export const OBSTACLES=[...WALLS,[-10.9,10.9,7.65,7.9],...Object.values(FURNITURE).map(f=>[f.x-f.w/2,f.x+f.w/2,f.z-f.d/2,f.z+f.d/2])];
export function roomAt(p){return ROOMS.find(r=>p.x>=r.bounds[0]&&p.x<=r.bounds[1]&&p.z>=r.bounds[2]&&p.z<=r.bounds[3])?.id||'hall';}
export function interactionPose(p){
 const spot=SPOTS[p.task?.location],using=p.task?.phase==='doing'&&!p.moving;
 const pose=using&&spot?.pose;
 if(pose?.kind==='bed')return p.action==='sleep'?{...pose,kind:'sleep',pitch:-Math.PI/2}:{...pose,kind:'seat',y:.28,pitch:0,z:pose.z-.5};
 if(pose&&p.action!=='inspect')return {...pose,pitch:0};
 return {kind:'stand',x:p.x,y:.1,z:p.z,facing:p.facing||0,pitch:0};
}
