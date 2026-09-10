import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {complete} from '../../server/provider.mjs';
import {httpProvider} from '../../dist/llm/broker.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const request={id:'knowledge-test',owner:'m',epoch:1,baseRevision:1,contentRevision:1,context:{actor:'m',events:[],contract:{reply:{}}}};

test('compatible provider sends bounded structured context, handles JSON and propagates cancellation',async()=>{
 const controller=new AbortController();let call;
 const result=await complete(request,{signal:controller.signal,env:{LLM_BASE_URL:'https://example.invalid/v1/',LLM_MODEL:'test-model',LLM_API_KEY:'test-only',LLM_MAX_OUTPUT_TOKENS:'1000'},fetchImpl:async(url,options)=>{call={url,options};return {ok:true,json:async()=>({choices:[{message:{content:'```json\n{"summary":"保持目标","rules":[],"goals":[]}\n```'}}],usage:{total_tokens:42}})};}});
 assert.equal(call.url,'https://example.invalid/v1/chat/completions');assert.equal(call.options.signal,controller.signal);
 const body=JSON.parse(call.options.body);assert.equal(body.max_tokens,1000);assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(JSON.parse(body.messages[1].content).owner,'m');assert.equal(result.usage.total_tokens,42);
 await assert.rejects(complete(request,{env:{LLM_API_KEY:'x',LLM_MODEL:'m',LLM_BASE_URL:'https://example.invalid'},fetchImpl:async()=>({ok:false,status:429})}),/429/);
});

test('local runtime serves the game and completes manual asynchronous requests without exposing credentials',async()=>{
 const spool=await mkdtemp(join(tmpdir(),'school-operator-'));
 const proc=spawn(process.execPath,['server/runtime-server.mjs'],{cwd:new URL('../../',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:'0',LLM_PROVIDER:'manual',LLM_SPOOL_DIR:spool,LLM_TIMEOUT_MS:'1500',LLM_REQUESTS_PER_MINUTE:'8',LLM_API_KEY:'test-only-do-not-expose'},stdio:['ignore','pipe','pipe']});
 let url;try{
  url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server did not start')),5000);proc.once('error',reject);proc.stdout.on('data',b=>{try{const x=JSON.parse(String(b));if(x.url){clearTimeout(timer);resolve(x.url.replace('localhost','127.0.0.1'));}}catch{}});});
  assert.match(await (await fetch(url+'/')).text(),/校园|学校|校园生活/);
  const config=await (await fetch(url+'/api/llm/config')).json();assert.equal(config.mode,'manual');assert.ok(!JSON.stringify(config).includes('test-only'));
  assert.equal((await fetch(url+'/api/llm/config',{headers:{Origin:'https://unrelated.invalid'}})).status,403);
  assert.equal(await new Promise((resolve,reject)=>{http.get(url+'/api/llm/config',{headers:{Host:'unrelated.invalid'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);}),403);
  const submitted=await (await fetch(url+'/api/llm/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})).json();
  let envelope;for(let i=0;i<50;i++){try{envelope=JSON.parse(await readFile(join(spool,submitted.id+'.request.json'),'utf8'));break;}catch{}await pause(20);}
  assert.equal(envelope.id,request.id);
  const expected={requestId:request.id,epoch:1,baseRevision:1,contentRevision:1,evidence:[],summary:'没有新证据，继续既有计划。',rules:[],goals:[]};
  await writeFile(join(spool,submitted.id+'.reply.json'),JSON.stringify(expected));
  let result;for(let i=0;i<50;i++){result=await (await fetch(url+'/api/llm/requests/'+submitted.id)).json();if(result.reply)break;await pause(20);}
  assert.deepEqual(result.reply,expected);assert.equal(result.status,'completed');assert.ok(result.elapsedMs>=0);
  const ctrl=new AbortController();const pending=httpProvider({base:url+'/api/llm',pollMs:20})(request,{signal:ctrl.signal});
  setTimeout(()=>ctrl.abort(),250);await assert.rejects(pending);
 }finally{proc.kill('SIGTERM');await new Promise(r=>proc.once('exit',r));await rm(spool,{recursive:true,force:true});}
});
