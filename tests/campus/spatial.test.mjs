import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {SchoolService} from '../../dist/campus/service.js';
import {route,pointFree,distance} from '../../dist/foundation/space.js';
import {samplePose,CLIPS} from '../../dist/campus/animation.js';
const options={read:p=>readFile(new URL(p,new URL('../../dist/foundation/',import.meta.url)),'utf8'),wasmBinary:await readFile(new URL('../../dist/soar/soar.wasm',import.meta.url))};
const content=JSON.parse(await readFile(new URL('../../dist/content/school-tuning.json',import.meta.url),'utf8'));
const evidence=[];
function tick(w,pred,max=30,check=()=>{}){for(let n=0;n<max*10&&!pred();n++){w.advance(.1,{autonomy:false});check();}assert.ok(pred(),'timed out: '+JSON.stringify(Object.values(w.state.tasks).map(t=>({actor:t.actor,action:t.candidate.action,phase:t.phase,blocked:t.blockedBy,point:t.points[t.point]}))));}
function clear(w){for(const id of Object.keys(w.state.actors))w.cancel(id);for(const a of Object.values(w.state.actors))a.presence='away';tick(w,()=>!Object.keys(w.state.tasks).length,5);}
test('all tuned clips resolve and embodied activities have distinct joints and props',()=>{
 for(const a of Object.values(content.actions))assert.ok(CLIPS.includes(a.animation.clip),a.label);
 const clips=['write','type','eat','drink','wash','sleep','guitar','basketball','water','teach','read-standing','run'];
 const poses=clips.map(c=>JSON.stringify(samplePose(c,.9)));assert.equal(new Set(poses).size,clips.length);
 assert.equal(samplePose('sleep').bodyX,-Math.PI/2);assert.ok(samplePose('sit').knees.every(n=>n>1));
 for(const c of ['eat','wash','guitar','basketball','run','write'])assert.notDeepEqual(samplePose(c,.3),samplePose(c,.8),c+' animates');
 evidence.push({check:'animation-vocabulary',clips:CLIPS.length,allActionsMapped:true});
});
test('exclusive facilities retain occupancy through exit, protect privacy, and use furniture anchors',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 clear(w);let p=w.state.actors.t;Object.assign(p,{presence:'here',room:'bathroom',x:-4,z:1});Object.assign(w.state.actors.m,{presence:'here',room:'bathroom',x:0,z:1});
 const first=w.perform('t','toilet',{roles:{item:'toilet-1'}});assert.ok(first.ok);assert.equal(w.perform('m','toilet',{roles:{item:'toilet-1'}}).ok,false);
 tick(w,()=>w.state.tasks.t?.phase==='perform');assert.equal(w.state.actors.t.private,true);assert.equal(w.state.leases['toilet-1:seat'].actor,'t');
 const anchor=w.state.tasks.t.anchor;assert.equal(distance(w.state.actors.t,anchor),0);
 w.cancel('t');assert.equal(w.state.tasks.t.phase,'exit');assert.ok(w.state.leases['toilet-1:seat']);assert.equal(w.perform('m','toilet',{roles:{item:'toilet-1'}}).ok,false);
 tick(w,()=>!w.state.tasks.t);assert.equal(w.state.leases['toilet-1:seat'],undefined);assert.equal(w.state.actors.t.private,false);assert.ok(pointFree(w.state,w.state.actors.t));
 const next=w.perform('m','toilet',{roles:{item:'toilet-1'}});assert.ok(next.ok);tick(w,()=>!w.state.tasks.m,30,()=>assert.ok(distance(w.state.actors.t,w.state.actors.m)>=.949));assert.equal(w.state.receipts[next.commandId].status,'completed');
 clear(w);Object.assign(w.state.actors.t,{presence:'here',room:'infirmary',x:0,z:3});const sleep=w.perform('t','rest',{roles:{item:'rest-bed-0'}});assert.ok(sleep.ok);tick(w,()=>w.state.tasks.t?.phase==='perform');assert.equal(w.state.actors.t.pose,'sleeping');assert.equal(distance(w.state.actors.t,w.state.objects['rest-bed-0']),0);assert.equal(w.state.tasks.t.anchor.render.y,.78);
 evidence.push({check:'facility-lifecycle',exclusive:true,private:true,cancelRetainsLease:true,reusableAfterExit:true,sleepOnBed:true});
 }finally{g.destroy();}
});
test('crossing traffic detours without body overlap; running follows an actual obstacle-free circuit',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 clear(w);Object.assign(w.state.actors.t,{presence:'here',room:'bathroom',x:-5,z:4.5});Object.assign(w.state.actors.m,{presence:'here',room:'bathroom',x:5,z:4.5});
 const a=w.perform('t','walk-to',{args:{room:'bathroom',x:5,z:4.5}}),b=w.perform('m','walk-to',{args:{room:'bathroom',x:-5,z:4.5}});assert.ok(a.ok&&b.ok);
 let minGap=99;tick(w,()=>!w.state.tasks.t&&!w.state.tasks.m,30,()=>{minGap=Math.min(minGap,distance(w.state.actors.t,w.state.actors.m));assert.ok(minGap>=.949);for(const id of ['t','m'])assert.ok(pointFree(w.state,w.state.actors[id]));});
 clear(w);Object.assign(w.state.actors.t,{presence:'here',room:'playground',x:4,z:2});const run=w.perform('t','run-lap',{roles:{item:'running-start'}});assert.ok(run.ok);let travelled=0,last={...w.state.actors.t},positions=new Set();tick(w,()=>!w.state.tasks.t,30,()=>{const p=w.state.actors.t;if(w.state.tasks.t?.phase==='perform'){travelled+=distance(last,p);positions.add(p.x.toFixed(1)+':'+p.z.toFixed(1));assert.ok(pointFree(w.state,p));assert.equal(p.pose,'running');}last={...p};});assert.equal(w.state.receipts[run.commandId].status,'completed');assert.ok(travelled>8);assert.ok(positions.size>12);
 evidence.push({check:'traffic-and-motion',minimumSeparation:minGap,runDistance:travelled,runPositions:positions.size});
 }finally{g.destroy();}
});
test('eight autonomous actors share three toilets without co-occupancy or deadlock',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 clear(w);w.state.time=420;
 // Isolate the original three-stall congestion fixture from the additional wings.
 for(const o of Object.values(w.state.objects))if(o.type==='toilet'&&o.room!=='bathroom')delete w.state.objects[o.id];const starts=[[-5.5,4.5],[-1.5,4.5],[1.5,4.5],[5.5,4.5],[-5.5,.5],[-1.5,.5],[1.5,.5],[5.5,.5]];
 Object.values(w.state.actors).forEach((a,i)=>{Object.assign(a,{presence:'here',room:'bathroom',x:starts[i][0],z:starts[i][1]});a.needs.bladder=4;});
 let minGap=99,maxUsers=0;const done=()=>new Set(w.state.events.filter(e=>e.action==='toilet'&&e.kind==='action-completed').map(e=>e.actor));
 for(let n=0;n<200&&done().size<8;n++){
  w.advance(.25);const actors=Object.values(w.state.actors);for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){minGap=Math.min(minGap,distance(actors[i],actors[j]));assert.ok(minGap>=.949,'bodies overlap');}
  const leases=Object.entries(w.state.leases).filter(([key])=>key.startsWith('toilet-'));maxUsers=Math.max(maxUsers,leases.length);assert.ok(leases.length<=3);assert.equal(new Set(leases.map(([,l])=>l.actor)).size,leases.length);
 }
 assert.equal(done().size,8,JSON.stringify({done:[...done()],tasks:Object.fromEntries(Object.entries(w.state.tasks).map(([id,t])=>[id,{action:t.candidate.action,phase:t.phase,blocked:t.blockedBy}]))}));
 evidence.push({check:'autonomous-toilet-queue',actors:8,facilities:3,completed:done().size,maximumReserved:maxUsers,minimumSeparation:minGap,elapsedMinutes:w.state.time-420});
 }finally{g.destroy();}
});
test('old save receives geometry and valid resumed approach while keeping memory and extensions',async()=>{
 const g=await SchoolService.create(options);let restored;try{
 clear(g.world);Object.assign(g.world.state.actors.t,{presence:'here',room:'classroom',x:0,z:3});g.world.perform('t','study',{roles:{item:'desk-1'}});tick(g.world,()=>g.world.state.tasks.t?.phase==='perform');
 g.world.mind.write('t',{subject:'spatial-fixture',predicate:'status',value:'remembered',root:'test'});
 const old=JSON.parse(g.save());delete old.content.spatialRevision;delete old.state.navigation;for(const t of Object.values(old.content.types)){delete t.colliders;for(const slot of t.slots||[])delete slot.approach;}for(const t of Object.values(old.state.tasks)){delete t.approach;delete t.resource;}
 restored=await SchoolService.create({...options,saved:JSON.stringify(old)});const w=restored.world;assert.equal(w.mind.get('t','spatial-fixture:status').value,'remembered');assert.ok(w.state.tasks.t.approach);assert.ok(w.state.navigation);w.cancel('t');tick(w,()=>!w.state.tasks.t);assert.ok(pointFree(w.state,w.state.actors.t));
 evidence.push({check:'spatial-save-upgrade',memoryPreserved:true,activeSlotRestored:true,exitReachable:true});
 }finally{g.destroy();restored?.destroy();}
});
test.after(()=>writeFile(new URL('../../research/campus/spatial.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n'));
