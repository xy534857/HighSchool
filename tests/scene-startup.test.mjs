import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Apartment} from '../dist/scene.js';
import {Household} from '../dist/simulation.js';
import {SoarController,loadSources} from '../dist/soar/controller.js';
import {decodeSave} from '../dist/storage.js';

// Execute the real scene constructor, geometry and frame update. Only the GPU
// renderer and window event endpoint are replaced; this is not a visual test.
function scene(t){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,addEventListener(){}}});
 t.after(()=>{if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;});
 const container={clientWidth:1200,clientHeight:800,children:[],appendChild(node){this.children.push(node);}};
 const renderer={domElement:{addEventListener(){}},shadowMap:{},frames:0,setPixelRatio(){},setSize(){},render(scene,camera){assert.ok(scene.isScene&&camera.isOrthographicCamera);this.frames++;}};
 const apartment=new Apartment(container,()=>{},{renderer});
 return {apartment,renderer,container};
}

test('construct the apartment before a world exists, then execute its first frame',t=>{
 assert.equal('world' in globalThis,false);
 const {apartment,renderer,container}=scene(t);
 assert.equal(container.children.length,1);assert.ok(apartment.house.children.length>20);
 assert.equal(apartment.situationProps.size,0);assert.equal(apartment.nightLamp.visible,false);
 apartment.update([],1/60,0,null,990);
 assert.equal(renderer.frames,1);
});

test('new play and both bundled older saves initialize native Soar and render five characters',async t=>{
 const sources=await loadSources(p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8'));
 const root=await SoarController.create(sources,{wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url))});
 try{
  for(const path of [null,'soar/checkpoint.json','soar/reflection/checkpoint.json']){
   await t.test(path||'new game',async t=>{
    const {apartment,renderer}=scene(t);
    const saved=path?decodeSave(fs.readFileSync(new URL('../dist/'+path,import.meta.url),'utf8')):null;
    const brain=new SoarController(root.native,sources),world=new Household(123,saved).attachBrain(brain);
    try{
     if(!saved)await brain.install('xing',fs.readFileSync(new URL('../dist/soar/learned/xing-v2.soar',import.meta.url),'utf8'));
     for(let frame=0;frame<4;frame++){world.tick(.25);apartment.update(world.people,1/60,frame/60,null,world.minute,world);}
     assert.equal(renderer.frames,4);assert.equal(apartment.characters.size,5);
     for(const p of world.people){assert.equal(Number(brain.cli(p.id,'decide indifferent-selection --epsilon')),.1);assert.ok(apartment.project(p)||p.presence==='away');}
    }finally{brain.destroy();}
   });
  }
 }finally{root.destroy();}
});

test('situation objects and night light follow world changes after scene construction',t=>{
 const {apartment}=scene(t),world=new Household(123);
 const update=()=>apartment.update(world.people,1/60,0,null,world.minute,world);
 update();const incident=world.incidents[0],toy=incident.objects.find(o=>o.id==='toy');
 const item=apartment.situationProps.get(incident.id+'-'+toy.id),count=apartment.situationProps.size;
 assert.ok(item?.visible);assert.equal(item.rotation.z,.3);
 toy.condition='repaired';toy.carrier='xiaoyu';world.storyEconomy.policies['night-light']=true;update();
 assert.equal(item.rotation.z,0);assert.equal(item.position.x,world.person('xiaoyu').x+.25);assert.equal(apartment.nightLamp.visible,true);
 world.person('xiaoyu').x+=1;update();assert.equal(item.position.x,world.person('xiaoyu').x+.25);
 assert.equal(apartment.situationProps.size,count);
 world.incidents=[];world.storyEconomy.policies['night-light']=false;update();
 assert.equal(item.visible,false);assert.equal(apartment.nightLamp.visible,false);
});
