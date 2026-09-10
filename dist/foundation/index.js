import {SoarController} from '../soar/controller.js';
import {World} from './world.js';
import {fail} from './tuning.js';
export {World} from './world.js';
export {Tuning} from './tuning.js';
export {compilePolicy,modelContract} from './policy.js';
export async function createFoundation({read,wasmBinary,content,scenario,saved,runtime}={}){
 const reader=read||(async p=>{const response=await fetch(new URL(p,import.meta.url));if(!response.ok)throw Error('Cannot load '+p);return response.text();});
 const common=(await Promise.all(['../soar/memory.soar','../soar/mind.soar','./kernel.soar'].map(reader))).join('\n');
 const sources={common,people:{}},brain=runtime?new SoarController(runtime,sources):await SoarController.create(sources,wasmBinary?{wasmBinary}:{});
 return new World({brain,content,scenario,saved});
}
export function encodeFoundationSave(world){return JSON.stringify(world.save(),(_k,v)=>v instanceof Uint8Array?{encoding:'u8',bytes:Array.from(v)}:v);}
export function decodeFoundationSave(text){
 const s=JSON.parse(text,(_k,v)=>v?.encoding==='u8'?Uint8Array.from(v.bytes):v);
 fail(s?.version===1&&s.state?.version===1&&s.cognition?.version===2,'Unsupported foundation save');
 for(const id of Object.keys(s.state.actors)){const n=s.cognition.people[id]?.native;fail(n?.smem instanceof Uint8Array&&n?.epmem instanceof Uint8Array,'Missing native memory');}return s;
}
