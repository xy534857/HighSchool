import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {DOMAIN} from '../dist/domain.js';import {validateDomain} from '../dist/domain/validate.js';
const root=path.resolve(import.meta.dirname,'../dist'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('browser entrypoints parse, controls exist, and local code/assets resolve',()=>{
 const html=read('index.html'),app=read('app.js'),ids=new Set([...html.matchAll(/id="([^"]+)"/g),...app.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
 for(const m of app.matchAll(/\$\('([\w-]+)'\)/g))assert.ok(ids.has(m[1]),'missing control '+m[1]);
 for(const file of ['app.js','scene.js','simulation.js','domain.js','storage.js','domain/validate.js','soar/controller.js','routine.js','reflection.js','conversations.js','perception.js','layout.js','calendar.js','director.js','situations/catalog.js','situations/schema.js','situations/runtime.js']){
  execFileSync(process.execPath,['--check',path.join(root,file)]);
  for(const m of read(file).matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g))assert.ok(fs.existsSync(path.resolve(root,path.dirname(file),m[1])),'missing import '+m[1]);
 }
 for(const m of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,m[1])));
 assert.deepEqual(DOMAIN,JSON.parse(read('domain/family.json')));validateDomain(DOMAIN);
 for(const p of ['dad','me','xue','xing','xiaoyu'])assert.ok(read('soar/people/'+p+'.soar').includes('sp {'));
 assert.ok(fs.statSync(path.join(root,'soar/soar.wasm')).size>1000000);
});
