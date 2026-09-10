import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {SchoolService} from '../../dist/campus/service.js';
import {route,nearestFree} from '../../dist/foundation/space.js';
const options={read:p=>readFile(new URL(p,new URL('../../dist/foundation/',import.meta.url)),'utf8'),wasmBinary:await readFile(new URL('../../dist/soar/soar.wasm',import.meta.url))};
const evidence=[];
const until=(g,pred,n=100)=>{for(let t=0;t<n&&!pred();t+=.5)g.advance(.5);assert.ok(pred(),'condition not reached');};
test('every region can be reached, every usable furniture anchor has an obstacle-free route',async()=>{
 const g=await SchoolService.create(options),w=g.world,p=w.state.actors.t;
 try{
  for(const room of Object.keys(w.state.rooms))assert.ok(route(w.state,room==='bathroom-m'?w.state.actors.m:p,nearestFree(w.state,{room,...w.state.rooms[room].entry},{owner:p.id})),room);
  let anchors=0;for(const o of Object.values(w.state.objects))if(!o.holder){
   const type=w.tuning.pack.types[o.type];for(const slot of type.slots||[]){const entry=slot.approach||slot,dest={room:o.room,x:o.x+entry.x,z:o.z+entry.z};assert.ok(route(w.state,o.room==='bathroom-m'?w.state.actors.m:p,dest),o.id+':'+slot.id);anchors++;}
  }
  evidence.push({check:'navigation',regions:Object.keys(w.state.rooms).length,interactionAnchors:anchors});
 }finally{g.destroy();}
});
test('player menu drives cross-room washing, water, toilet, art, sport, reading and genuine bed sleep',async()=>{
 const g=await SchoolService.create(options),w=g.world;
 try{
  // Physical interfaces are exercised with other agents paused to isolate resource mechanics.
  for(const a of Object.values(w.state.actors))if(!a.controlled)a.presence='away';
  const cases=[['wash-hands','sink-0','bathroom','hygiene'],['drink','yard-water','courtyard','thirst'],['toilet','toilet-1','bathroom','bladder'],['draw-poster','art-table','club'],['shoot-hoops','basketball-hoop','playground','fun'],['read-book','shelf-0','library'],['use-computer','staff-computer','office'],['get-lunch','food-counter','canteen'],['eat','lunch-table-0','canteen','hunger'],['rest','rest-bed-0','infirmary','energy']];
  for(const [action,item,room,need] of cases){
   if(action==='get-lunch')w.state.actors.t.needs.hunger=25;
   if(need)w.state.actors.t.needs[need]=25;
   assert.ok(g.menu({kind:'object',id:item}).some(r=>r.action===action&&!r.disabled),action+' visible');
   const before=w.state.objects[item].state.paper??null;g.enqueue(action,{item});until(g,()=>!w.state.tasks.t&&!g.queue.length);
   const e=w.state.events.findLast(e=>e.actor==='t'&&e.action===action);assert.equal(e?.kind,'action-completed',action+': '+JSON.stringify(e));assert.equal(w.state.actors.t.room,room);
   if(need)assert.ok(w.state.actors.t.needs[need]>25,action+' need improvement');
   if(action==='draw-poster')assert.equal(w.state.objects[item].state.paper,before-1);
   evidence.push({check:'player-interaction',action,room,result:e.kind});
  }
 }finally{g.destroy();}
});
test('real agents answer multiple turns, consent to loan and physically transfer, then survive portable save',async()=>{
 const g=await SchoolService.create(options),w=g.world;
 try{
  // The shared class schedule holds partners at their own desks until invited.
  w.state.time=512;g.advance(.5);g.enqueue('start-conversation',{target:'m'});until(g,()=>w.state.actors.t.session&&w.state.actors.m.session===w.state.actors.t.session,40);
  g.enqueue('greet',{target:'m'});until(g,()=>w.state.events.some(e=>e.actor==='m'&&e.replyTo),30);
  g.enqueue('ask-loan',{target:'m',item:'notes'},{due:w.state.time+90});until(g,()=>w.state.objects.notes.holder==='t',40);
  const offer=Object.values(w.state.offers).find(o=>o.kind==='loan');assert.equal(offer.status,'accepted');
  g.enqueue('ask-question',{target:'m'},{key:offer.id+':status',text:'还作数吗？'});until(g,()=>w.state.events.some(e=>e.actor==='m'&&e.kind==='information'&&e.claim?.value==='accepted'),30);
  const saved=g.save(),restored=await SchoolService.create({...options,saved});
  try{assert.equal(restored.world.state.objects.notes.holder,'t');assert.equal(restored.world.mind.get('m',offer.id+':status').value,'accepted');assert.ok(restored.world.brain.rules.m[0].source.includes('learned*m*loan'));}finally{restored.destroy();}
  evidence.push({check:'native-conversation',accepted:true,handedOver:true,memoryReply:true,saved:true});
 }finally{g.destroy();}
});
test.after(async()=>writeFile(new URL('../../research/campus/integration.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n'));
