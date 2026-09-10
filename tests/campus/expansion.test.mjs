import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {SchoolService} from '../../dist/campus/service.js';
import {route,nearestFree,pointFree} from '../../dist/foundation/space.js';
import {accessReason} from '../../dist/foundation/environment.js';
const options={read:p=>readFile(new URL(p,new URL('../../dist/foundation/',import.meta.url)),'utf8'),wasmBinary:await readFile(new URL('../../dist/soar/soar.wasm',import.meta.url))};
const evidence=[];
const until=(w,pred,max=30)=>{for(let n=0;n<max*10&&!pred();n++)w.advance(.1,{autonomy:false});assert.ok(pred(),JSON.stringify(w.state.tasks));};
function alone(w){for(const id of Object.keys(w.state.actors))w.cancel(id);for(const a of Object.values(w.state.actors))a.presence='away';until(w,()=>!Object.keys(w.state.tasks).length);w.state.actors.t.presence='here';}
function place(w,item){const o=w.state.objects[item],slot=w.tuning.pack.types[o.type].slots[0];Object.assign(w.state.actors.t,nearestFree(w.state,{room:o.room,x:o.x+slot.approach.x+1.5,z:o.z+slot.approach.z+1},{owner:'t'},5));}
function use(w,action,item){place(w,item);const r=w.perform('t',action,{roles:{item}});assert.ok(r.ok,action+': '+JSON.stringify(r));until(w,()=>!w.state.tasks.t);assert.equal(w.state.receipts[r.commandId].status,'completed',action+': '+JSON.stringify(w.state.receipts[r.commandId]));return r;}
test('access and owned lockers constrain both manual routes and autonomous candidates',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 assert.ok(Object.keys(w.state.rooms).length>=17);assert.ok(Object.keys(w.state.objects).length>=140);
 for(const a of Object.values(w.state.actors)){
  const denied=a.profile.gender==='female'?'bathroom-m':'bathroom-f',allowed=a.profile.gender==='female'?'bathroom-f':'bathroom-m';
  assert.equal(route(w.state,a,{room:denied,x:0,z:4.5}),null);assert.ok(route(w.state,a,{room:allowed,x:0,z:4.5}));
  const candidates=w.candidates(a.id,{action:'toilet'});assert.ok(candidates.length);assert.ok(candidates.every(c=>!accessReason(w.state,a,w.state.objects[c.item].room)));
 }
 assert.equal(g.enqueue('walk-to',{}, {room:'bathroom-m',x:0,z:4.5}).ok,false);
 assert.ok(g.menu({kind:'object',id:'boys-toilet-1'}).find(r=>r.action==='toilet').disabled.includes('男生'));
 alone(w);place(w,'locker-m');assert.ok(g.menu({kind:'object',id:'locker-m'}).find(r=>r.action==='open-locker').disabled.includes('私人'));
 alone(w);use(w,'open-locker','locker-t');assert.equal(w.state.objects['locker-t'].state.open,true);
 const request=w.inbox.request('t','new-campus-skill');assert.ok(request.context.contract.selfFields.includes('resource-music'));
 const reply={requestId:request.id,epoch:request.epoch,baseRevision:request.baseRevision,contentRevision:request.contentRevision,evidence:[],rules:[{id:'learn-piano-until-ready',select:{action:'practice-piano'},when:[{scope:'self',field:'resource-music',op:'lt',value:10}],priority:80,reason:'想先练熟这段旋律，熟练后再做别的事。'}]};
 const installed=await w.inbox.apply(reply);assert.ok(installed.source.includes('^resource-music < 10'));assert.equal(w.choose('t').candidate.action,'practice-piano');w.state.actors.t.resources.music=12;assert.notEqual(w.choose('t').decision.rule,'learned*t*learn-piano-until-ready');
 evidence.push({check:'access',actors:8,genderEnforced:true,privateLockers:true,runtimeGeneratedSoarUsesResources:true,rooms:Object.keys(w.state.rooms).length,objects:Object.keys(w.state.objects).length});
 }finally{g.destroy();}
});
test('new interactions form real resource chains, with depletion, cleanup and scheduled replenishment',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 alone(w);w.state.actors.t.needs.hunger=25;
 assert.ok(g.menu({kind:'object',id:'lunch-table-0'}).find(r=>r.action==='eat').disabled.includes('领'));
 use(w,'get-lunch','food-counter');assert.equal(w.state.actors.t.resources.credits,24);assert.equal(w.state.actors.t.resources.meal,1);assert.equal(w.state.objects['food-counter'].state.servings,31);
 use(w,'eat','lunch-table-0');assert.equal(w.state.actors.t.resources.meal,0);assert.equal(w.state.actors.t.resources.tray,1);
 use(w,'return-tray','tray-return');assert.equal(w.state.actors.t.resources.tray,0);assert.equal(w.state.objects['tray-return'].state.trays,1);
 use(w,'observe-sample','microscope-1');assert.equal(w.state.objects['microscope-1'].state.clean,false);assert.equal(w.state.actors.t.resources.research,5);
 use(w,'clean-microscope','microscope-1');assert.equal(w.state.objects['microscope-1'].state.clean,true);
 use(w,'do-experiment','experiment-1');use(w,'clean-experiment','experiment-1');
 use(w,'print-notes','library-printer');assert.equal(w.state.actors.t.resources.printouts,1);assert.equal(w.state.objects['library-printer'].state.paper,19);
 use(w,'buy-supplies','stationery');const art=w.state.objects['art-table'].state.paper;use(w,'restock-art','art-table');assert.equal(w.state.objects['art-table'].state.paper,art+6);assert.equal(w.state.actors.t.resources.supplies,0);
 use(w,'paint-study','art-easel-1');use(w,'exhibit-work','art-display');assert.equal(w.state.objects['art-display'].state.works,1);
 use(w,'practice-piano','piano-1');use(w,'read-score','score-1');use(w,'practice-pingpong','gym-table-1');use(w,'stretch','gym-mat');use(w,'solve-chess','student-chess');use(w,'use-care-pack','care-cabinet');
 const bed=w.state.objects['grow-bed-1'];bed.state.growth=70;use(w,'tend-garden','grow-bed-1');use(w,'harvest-garden','grow-bed-1');assert.equal(w.state.actors.t.resources.seedlings,1);assert.equal(w.state.objects['grow-bed-1'].state.growth,10);
 use(w,'toilet','girls-toilet-1');assert.equal(w.state.objects['girls-toilet-1'].state.paper,11);use(w,'clean-stall','girls-toilet-1');assert.equal(w.state.objects['girls-toilet-1'].state.cleanliness,100);
 w.state.objects['library-printer'].state.paper=0;place(w,'library-printer');assert.ok(g.menu({kind:'object',id:'library-printer'}).find(r=>r.action==='print-notes').disabled);
 const credits=w.state.actors.t.resources.credits;w.state.time=1440+389.9;w.advance(.2,{autonomy:false});assert.equal(w.state.objects['library-printer'].state.paper,20);
 w.state.time=1440+419.9;w.advance(.2,{autonomy:false});assert.equal(w.state.actors.t.resources.credits,credits+20);
 const events=w.state.events.filter(e=>e.kind==='action-completed'&&e.actor==='t');assert.ok(!w.state.events.some(e=>e.kind==='action-failed'));
 evidence.push({check:'resource-chains',completed:events.map(e=>e.action),finiteStock:true,restoredNextDay:true,scheduledAllowance:true});
 }finally{g.destroy();}
});
test('expanded school autonomously handles the lunch sequence without player scripting',async()=>{
 const g=await SchoolService.create(options),w=g.world;try{
 alone(w);Object.assign(w.state.actors.t,{room:'canteen',x:0,z:5});w.state.actors.t.needs.hunger=22;w.state.time=721;
 for(let i=0;i<100&&!w.state.events.some(e=>e.actor==='t'&&e.kind==='action-completed'&&e.action==='return-tray');i++)w.advance(.5);
 const acts=w.state.events.filter(e=>e.actor==='t'&&e.kind==='action-completed').map(e=>e.action);assert.ok(acts.includes('get-lunch'));assert.ok(acts.includes('eat'));assert.ok(acts.includes('return-tray'));assert.equal(w.state.actors.t.resources.tray,0);
 evidence.push({check:'autonomous-lunch',sequence:acts,soarCycles:w.metrics.decisions});
 }finally{g.destroy();}
});
test('prior campus save gains expanded geography without losing native memories or custom rules',async()=>{
 const g=await SchoolService.create(options);let restored;try{
 g.world.mind.write('t',{subject:'campus-upgrade-fixture',predicate:'status',value:'remembered',root:'fixture'});
 g.world.extendContent({id:'custom-fixture',actions:{'custom-fixture-action':{...structuredClone(g.world.tuning.pack.actions.drink),label:'自定义喝水'}}});
 alone(g.world);place(g.world,'food-counter');g.world.state.actors.t.needs.hunger=25;g.world.perform('t','get-lunch',{roles:{item:'food-counter'}});until(g.world,()=>g.world.state.tasks.t?.phase==='perform');
 const saved=JSON.parse(g.save());const active=saved.state.tasks.t;delete saved.state.leases[active.slot];active.slot='food-counter:legacy';saved.state.leases[active.slot]={actor:'t',task:active.id};delete saved.content.campusRevision;delete saved.state.rooms.science;for(const o of Object.values(saved.state.objects))if(o.room==='science')delete saved.state.objects[o.id];saved.state.actors.t.resources.credits=7;
 restored=await SchoolService.create({...options,saved:JSON.stringify(saved)});const w=restored.world;
 assert.ok(w.state.rooms.science);assert.ok(w.state.objects['microscope-1']);assert.equal(w.state.actors.t.resources.credits,7);assert.equal(w.mind.get('t','campus-upgrade-fixture:status').value,'remembered');assert.ok(w.tuning.pack.actions['custom-fixture-action']);assert.ok(w.state.leases[w.state.tasks.t.slot]);assert.notEqual(w.state.tasks.t.slot,'food-counter:legacy');w.cancel('t');until(w,()=>!w.state.tasks.t);assert.ok(pointFree(w.state,w.state.actors.t));
 evidence.push({check:'expanded-save',nativeMemoryKept:true,customContentKept:true,newRegions:true,balanceKept:true,activeServiceSlotMigrated:true});
 }finally{g.destroy();restored?.destroy();}
});
test.after(()=>writeFile(new URL('../../research/campus/expansion.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n'));
