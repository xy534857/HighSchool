// Capture actual day-end evidence; a model response must be supplied separately.
import fs from 'node:fs';import path from 'node:path';
import {Household} from '../dist/simulation.js';import {SoarController,loadSources} from '../dist/soar/controller.js';import {decodeSave,encodeSave} from '../dist/storage.js';import {applyReflection,reportForModel} from '../dist/reflection.js';
const args=process.argv.slice(2),option=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};
const output=option('--out');if(!output)throw Error('Usage: node scripts/run-day.mjs --out DIR [--save FILE] [--patch FILE] [--seed NUMBER]');
const saved=option('--save')?decodeSave(fs.readFileSync(option('--save'),'utf8')):null;
const sources=await loadSources(p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8'));
const brain=await SoarController.create(sources,{wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url))});
try{const house=new Household(Number(option('--seed')||2026),saved).attachBrain(brain);if(option('--patch'))await applyReflection(house,JSON.parse(fs.readFileSync(option('--patch'),'utf8')));const minutes=1440-house.minute;house.advance(minutes);const review=house.reviews.at(-1);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'save.json'),encodeSave(house.save()));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reportForModel(review.report),null,2));console.log(JSON.stringify({day:review.report.day,requestId:review.report.requestId,events:review.report.events.length,ruleVersion:house.rulesVersion}));}finally{brain.destroy();}
