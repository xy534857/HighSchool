import {THREE,box,ball,cyl,ring,group,plant,book,chair,bed} from './geometry.js';
const wood='#c6a272',edge='#536d70',paper='#fff7df';
function table(g,w=1.6,d=.8){box(w,.12,d,wood,0,.85,0,g);for(const x of [-w/2+.12,w/2-.12])for(const z of [-d/2+.1,d/2-.1])box(.07,.79,.07,edge,x,.41,z,g,.015);}
function desk(g){table(g,1.45,.75);chair(g,0,.9,Math.PI,'#b2cad0');book(g,-.4,.92,0,'#568ead',.4,.045,.3);box(.35,.012,.3,paper,.25,.928,0,g,.004);}
function bench(g){box(2,.16,.6,wood,0,.58,0,g);box(2,.48,.1,wood,0,.97,-.25,g);for(const x of [-.7,.7])box(.12,.5,.48,edge,x,.28,0,g);}
function shelf(g){box(2,2.25,.65,wood,0,1.13,0,g);for(let row=0;row<3;row++){box(1.82,.56,.12,'#725e4d',0,.49+row*.67,.29,g,.01);for(let i=0;i<8;i++)book(g,-.8+i*.22,.25+row*.67,.38,['#5e91a6','#d68c6a','#93a578','#e7ba67'][i%4],.14,.31+(i%3)*.07,.22);}}
function board(g,black=false){for(const x of [-.9,.9])box(.08,1.3,.08,edge,x,.65,0,g);box(black?3:2.5,1.4,.12,wood,0,1.8,0,g);box(black?2.85:2.35,1.26,.035,black?'#315c59':'#b7a280',0,1.8,.09,g,.01);if(black){for(let i=0;i<3;i++)box(1.4-i*.22,.025,.015,'#e5eee0',-.35,2.12-i*.24,.12,g,.01);}else for(let i=0;i<4;i++){const p=box(.44,.55,.018,['#fff0c9','#cfdddd','#edd6bb','#d8d9bb'][i],-.84+i*.55,1.8+(i%2)*.12,.12,g,.01);p.rotation.z=(i-1)*.04;}}
export const modelFactories={
 desk,
 table:g=>{table(g,1.8,.8);chair(g,0,.9,Math.PI,'#c89d74');chair(g,0,-.9,0,'#c89d74');for(const x of [-.4,.4]){cyl(.2,.2,.025,paper,x,.93,0,g);ball(.12,'#90a96b',x,.985,0,g,1,.3,1);}},
 office:g=>{table(g,2,.8);chair(g,0,1,Math.PI,'#758a90');for(let i=0;i<3;i++)book(g,-.65,.92+i*.05,0,['#b8c7ab','#dca775','#849aaa'][i],.42,.05,.3);box(.5,.015,.34,paper,.3,.925,0,g);},
 computer:g=>{table(g,1.8,.8);chair(g,0,1,Math.PI,'#758a90');box(.12,.35,.12,edge,0,1,0,g);box(.9,.62,.08,edge,0,1.35,0,g);box(.8,.52,.015,'#a8d2d3',0,1.35,.05,g);box(.6,.04,.2,'#e6e3da',0,.96,.22,g);},
 art:g=>{table(g,1.8,.8);chair(g,0,.9,Math.PI,'#dfb578');box(.8,.015,.56,paper,0,.932,0,g);for(let i=0;i<3;i++)ball(.08,['#e29971','#78aebe','#9ba76a'][i],-.25+i*.25,.946,0,g,1,.05,1);cyl(.1,.08,.2,'#76a5af',.65,1.04,0,g);},
 bed:g=>bed(g,0,0,'#9cc6be'),
 bench,
 shelf,
 board:g=>board(g),blackboard:g=>board(g,true),
 water:g=>{box(.65,1.2,.55,'#dce5df',0,.6,0,g);box(.48,.37,.05,'#8db6b9',0,.78,.30,g);cyl(.22,.22,.5,'#aed6e1',0,1.45,0,g);for(const x of [-.1,.1])ball(.035,x<0?'#719cc9':'#c67e70',x,.89,.35,g);},
 toilet:g=>{box(1.9,2,.09,'#c0d2d0',0,1,-.65,g);for(const x of [-.95,.95])box(.09,1.6,1.8,'#c0d2d0',x,.8,.2,g);box(.7,.7,.28,'#f5f7ed',0,.6,-.35,g);ball(.42,'#f4f5eb',0,.38,0,g,1,.65,1.1);const seat=ring(.25,.065,'#dbe5df',0,.62,.07,g);seat.rotation.x=Math.PI/2;const door=group(g,-.88,0,1.08);door.name='door';box(1.75,1.35,.07,'#d4e1d6',.875,.9,0,door);ball(.045,'#667d74',1.53,.95,.08,door);const light=box(.12,.16,.03,'#88ad7c',1.48,1.18,.07,door);light.name='occupancy';},
 sink:g=>{box(1.2,.85,.65,'#c3d8d7',0,.45,0,g);box(1.3,.08,.75,'#f5f6e9',0,.91,0,g);ball(.3,'#accbc9',0,.94,0,g,1,.1,.72);cyl(.035,.035,.28,edge,0,1.09,-.21,g);box(.2,.05,.04,edge,.08,1.23,-.21,g);box(.7,.8,.025,'#bbd5db',0,1.6,-.38,g);},
 locker:g=>{box(1,2,.65,'#9bbfbd',0,1,0,g);for(const x of [-.25,.25]){box(.45,1.85,.025,'#b7ceca',x,1,.34,g);box(.04,.18,.04,edge,x+.11,1,.38,g);for(let i=0;i<3;i++)box(.25,.025,.01,'#739491',x,1.7-i*.09,.36,g);}},
 counter:g=>{box(3,.95,1,'#b2c7b7',0,.48,0,g);box(3.15,.12,1.1,'#e8dfcd',0,1.01,0,g);for(const x of [-.9,0,.9]){box(.65,.07,.6,'#9aa9a1',x,1.11,0,g);ball(.23,x===0?'#d89562':'#a3b379',x,1.22,0,g,1,.3,1);}},
 hoop:g=>{cyl(.085,.085,3.3,edge,0,1.65,0,g);box(1.7,1,.09,'#e6eee8',0,3.1,.1,g);box(.68,.45,.015,'#cc8b63',0,2.99,.16,g);box(.61,.39,.017,'#e6eee8',0,2.99,.18,g);const r=ring(.35,.03,'#d98851',0,2.72,.5,g);r.rotation.x=Math.PI/2;for(let i=0;i<8;i++){const a=i/8*Math.PI*2;box(.015,.36,.015,'#e0ded1',Math.cos(a)*.28,2.53,.5+Math.sin(a)*.28,g);}},
 track:g=>{box(1.3,.03,.28,'#eee8d2',0,.02,0,g);},
 guitar:g=>{chair(g,0,.9,Math.PI,'#cda876');const a=group(g,0,.35,0,.18);a.name='instrument';ball(.28,'#c79051',0,.22,0,a,1,1.3,.28);ball(.23,'#c79051',0,.6,0,a,1,1,.3);box(.11,.9,.08,'#8c6143',0,1.02,0,a);ball(.1,'#5c5345',0,.5,.075,a,1,1,.1);},
 planter:g=>{box(2,.45,1.1,'#cda984',0,.23,0,g);box(1.85,.04,.97,'#786b51',0,.46,0,g);for(const x of [-.65,0,.65])plant(g,x,0,.65,.2);},
 ball:g=>{ball(.26,'#d58b48',0,.28,0,g);const a=ring(.258,.012,'#77543d',0,.28,0,g);a.rotation.y=Math.PI/2;ring(.258,.012,'#77543d',0,.28,0,g);},
 book:g=>{box(.5,.07,.38,'#75a9b7',0,.16,0,g);box(.44,.045,.35,paper,0,.16,.015,g);},
 marker:g=>{},
};
// Each reusable furnishing has a visible purpose; collision and interaction slots live in tuning.
Object.assign(modelFactories,{
 'printer':g=>{box(1.2,.8,.7,'#91a4a7',0,.4,0,g);box(1.16,.28,.64,'#e1e5dd',0,.95,0,g);box(.7,.08,.1,'#445e61',0,.82,.38,g);box(.55,.018,.35,paper,0,.8,.51,g);box(.24,.1,.08,'#83bdb0',.3,1.1,.34,g);},
 'tray-cart':g=>{box(1.2,.85,.7,'#89a698',0,.43,0,g);for(let i=0;i<4;i++)box(.8,.035,.45,'#d5ded4',0,.91+i*.045,0,g);},
 'homework-box':g=>{box(1.2,.9,.7,'#e0b579',0,.45,0,g);box(.8,.09,.03,'#766951',0,.73,.37,g);box(.45,.23,.02,paper,0,.43,.37,g);},
 'microscope':g=>{table(g,1.8,.85);box(.4,.05,.3,'#5e7f80',0,.96,0,g);box(.08,.44,.08,'#809995',.12,1.2,-.1,g);const tube=box(.16,.44,.16,'#d8ddd4',0,1.42,0,g);tube.rotation.x=.35;box(.4,.045,.24,'#668283',0,1.1,.1,g);box(.12,.015,.08,'#a8dbd9',0,1.135,.1,g);},
 'experiment':g=>{table(g,2,1);for(let i=0;i<3;i++){cyl(.12,.09,.27,['#9fc2b6','#e5c470','#b59abf'][i],-.6+i*.6,1.08,0,g,12);cyl(.07,.07,.2,'#d1e5df',-.6+i*.6,1.3,0,g,12);}box(.4,.015,.25,paper,.5,.92,.3,g);},
 'shop':g=>{box(2,1.5,.8,'#cbb48a',0,.75,0,g);for(let j=0;j<2;j++)for(let i=0;i<5;i++)book(g,-.8+i*.38,.32+j*.62,.44,['#7599b8','#c68b83','#c8bc79'][i%3],.23,.32,.17);},
 'easel':g=>{for(const x of [-.4,.4])box(.06,1.8,.08,wood,x,.9,0,g);box(.9,1,.1,wood,0,1.2,0,g);box(.78,.86,.025,paper,0,1.2,.075,g);ball(.16,'#d8b465',.2,1.43,.095,g,1,1,.05);box(.76,.2,.02,'#91ad8a',0,.95,.095,g);box(1,.065,.24,wood,0,.7,.08,g);},
 'piano':g=>{box(2,1.35,.65,'#755e52',0,.68,0,g);box(1.85,.11,.32,paper,0,.93,.42,g);for(let i=0;i<19;i++){box(.012,.018,.29,'#aea79a',-.88+i*.095,.997,.42,g,.002);if(i%7!==2&&i%7!==6)box(.04,.035,.17,'#42565a',-.84+i*.095,1.01,.36,g,.005);}box(.8,.12,.6,wood,0,.56,1,g);for(const x of [-.3,.3])box(.08,.5,.45,edge,x,.25,1,g);},
 'music-stand':g=>{cyl(.04,.04,1.1,edge,0,.55,0,g,10);box(.7,.06,.5,edge,0,1.14,0,g);box(.57,.018,.4,paper,0,1.185,0,g);box(.6,.05,.42,edge,0,.06,0,g);},
 'pingpong':g=>{box(2,.12,3,'#6b9f9c',0,.8,0,g);for(const x of [-.75,.75])for(const z of [-1.2,1.2])box(.07,.75,.07,edge,x,.38,z,g);for(const x of [-.96,.96])box(.025,.018,2.9,paper,x,.87,0,g);box(1.94,.018,.025,paper,0,.87,0,g);box(1.95,.34,.035,'#c7d3c5',0,1.05,0,g);box(1.95,.9,.075,'#5f8c8a',0,1.3,-1.4,g);},
 'mat':g=>{box(1,.04,1.8,'#bf99a7',0,.028,0,g,.02);for(const z of [-.6,.6])box(.8,.006,.025,'#e4cfce',0,.053,z,g);},
 'vending':g=>{box(1.25,2,.8,'#759aaa',0,1,0,g);box(.88,1.32,.025,'#c4d9d4',-.1,1.2,.42,g);for(let j=0;j<3;j++)for(let i=0;i<3;i++)box(.2,.22,.03,['#dab36e','#b6c68e','#d09985'][i],-.4+i*.28,.77+j*.37,.45,g);box(.25,.14,.02,'#456963',.42,1.5,.44,g);box(.7,.18,.025,'#3f6264',0,.24,.42,g);},
 'bin':g=>{box(1.2,.8,.7,'#89a996',0,.4,0,g);box(1.24,.09,.74,'#668b7c',0,.85,0,g);for(const x of [-.3,.3])box(.3,.025,.28,'#385e59',x,.907,0,g);},
 'cleaning-cart':g=>{table(g,1.2,.7);box(.7,.32,.48,'#99b9b5',0,1.07,0,g);cyl(.055,.055,1.5,wood,.4,.9,0,g,8);box(.35,.14,.14,'#e0d3b0',.4,.12,0,g);},
 'garden-bed':g=>{box(2,.45,1.1,'#b49f79',0,.23,0,g);box(1.85,.04,.97,'#786b51',0,.46,0,g);const plants=group(g,0,.48,0);plants.name='growth';for(const x of [-.6,0,.6]){cyl(.035,.035,.55,'#70945d',x,.27,0,plants,8);ball(.22,'#9db970',x,.55,0,plants,1,.7,.8);}},
 'display':g=>{board(g);},
 'chess':g=>{table(g,1.2,.8);for(let i=0;i<6;i++)for(let j=0;j<6;j++)box(.1,.012,.1,(i+j)%2?'#8c7f6b':'#f0e4cb',-.25+i*.1,.922,-.25+j*.1,g,.002);for(const x of [-.22,.08,.22])cyl(.035,.05,.13,edge,x,1,0,g,8);},
 'first-aid':g=>{box(1.2,1.65,.7,'#dce5db',0,.83,0,g);box(.16,.65,.03,'#d38a7a',0,1,.37,g);box(.6,.16,.03,'#d38a7a',0,1,.39,g);},
});
export function makeProp(type){const g=new THREE.Group();(modelFactories[type.model]||modelFactories.book)(g);return g;}
export function makeStudent(person){
 const root=new THREE.Group(),body=group(root),skin='#f3c9a5',hair=person.hair==='long'?'#62493c':'#3e433f',shirt=person.color;
 box(.48,.55,.32,shirt,0,.83,0,body,.12);box(.27,.08,.03,'#f1efdb',0,1.06,.18,body,.02);box(.07,.2,.03,'#eac676',0,.97,.2,body,.015);
 const legs=[],arms=[],knees=[],elbows=[],hands=[];
 for(const x of [-.14,.14]){const leg=group(body,x,.56,0);box(.17,.25,.2,'#4a646a',0,-.125,0,leg,.055);const knee=group(leg,0,-.25,0);box(.15,.22,.18,'#4a646a',0,-.11,0,knee,.05);box(.21,.1,.31,'#f4f3e5',0,-.235,.06,knee,.04);legs.push(leg);knees.push(knee);}
 for(const x of [-.3,.3]){const arm=group(body,x,1.03,0);box(.15,.22,.18,shirt,0,-.1,0,arm,.06);const elbow=group(arm,0,-.21,0);box(.12,.18,.14,skin,0,-.085,0,elbow,.05);const hand=group(elbow,0,-.18,.02);ball(.075,skin,0,0,0,hand);arms.push(arm);elbows.push(elbow);hands.push(hand);}
 const handProps={};
 function prop(id,parent=hands[1]){const g=group(parent);g.visible=false;handProps[id]=g;return g;}
 let tool=prop('tray',body);tool.position.set(0,.87,.48);box(.65,.04,.42,'#b9cbb4',0,0,0,tool);cyl(.17,.17,.035,paper,0,.03,0,tool,12);const food=ball(.12,'#b0b477',0,.09,0,tool,1,.4,1);food.name='meal';
 tool=prop('paddle');ball(.12,'#ba7567',0,.12,0,tool,1,1,.15);box(.045,.16,.035,wood,0,-.015,0,tool);
 tool=prop('cloth');box(.25,.03,.2,'#e9cf8d',0,0,0,tool);
 tool=prop('vial');cyl(.04,.04,.17,'#a8cfc2',0,.07,0,tool,10);
 tool=prop('pencil');cyl(.015,.015,.3,'#e5b353',0,0,.04,tool,8);tool.rotation.x=-.65;
 tool=prop('chalk');cyl(.018,.018,.12,'#f7f5de',0,0,.04,tool,8);
 tool=prop('cup');cyl(.1,.085,.18,'#e5b965',0,.07,.04,tool,12);
 tool=prop('spoon');box(.025,.18,.025,'#b8babc',0,.02,.02,tool);ball(.045,'#d8dad7',0,.13,.02,tool,1,.5,1.4);
 tool=prop('book',body);tool.position.set(0,1.05,.43);box(.55,.06,.36,'#72aab3',0,0,0,tool);box(.5,.025,.31,'#fff4d9',0,.04,0,tool);
 tool=prop('guitar',body);tool.position.set(0,.87,.35);ball(.24,'#c89450',.08,-.08,0,tool,1,1.2,.25);box(.095,.6,.07,'#6c513c',-.13,.25,0,tool);tool.rotation.z=-.65;
 tool=prop('ball',body);ball(.2,'#d58b48',0,0,0,tool);ring(.2,.009,'#704a35',0,0,0,tool);
 tool=prop('watering-can');box(.24,.22,.18,'#75a6b3',0,.02,.07,tool);const spout=cyl(.026,.026,.3,'#75a6b3',.16,.03,.07,tool,8);spout.rotation.z=-1;
 tool=prop('water-stream',body);for(let i=0;i<4;i++)ball(.025,'#9ddbdc',-.1+i*.07,.8-i*.055,.45,tool,.6,1.6,.6);
 const head=group(body,0,1.47,0);ball(.4,skin,0,0,0,head,1.05,.98,.95);
 const cap=new THREE.Mesh(new THREE.SphereGeometry(.418,20,12,0,Math.PI*2,0,1.42),new THREE.MeshStandardMaterial({color:hair,roughness:.9}));cap.position.y=.025;head.add(cap);
 for(const x of [-.41,.41])ball(.065,skin,x,-.01,0,head,.8,1,.7);
 for(let i=0;i<4;i++)ball(.12,hair,-.24+i*.16,.22,.25,head,1,.65,.7);
 if(person.hair==='long'){ball(.18,hair,0,.02,-.37,head,1,2,1);ball(.16,hair,-.31,-.07,-.05,head,.6,1.8,1);}
 for(const x of [-.14,.14]){ball(.041,'#35423d',x,0,.366,head,.8,1.2,.4);ball(.012,'#fff9eb',x-.008,.015,.386,head);ball(.065,'#deaa96',x*1.65,-.09,.31,head,1,.4,.12);if(person.hair==='glasses'){const r=ring(.091,.012,'#4c6268',x,.01,.4,head);r.scale.y=.9;}}
 const smile=ring(.055,.009,'#a57359',0,-.1,.37,head,Math.PI);smile.rotation.z=Math.PI;smile.scale.y=.5;
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(.3,24),new THREE.MeshBasicMaterial({color:'#375850',transparent:true,opacity:.13,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;root.add(shadow);
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.userData.selection={kind:'actor',id:person.id};}});
 return {root,body,head,legs,arms,knees,elbows,handProps,angle:0,last:null};
}
