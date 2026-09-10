// Offline acceptance probe. Never calls an API. Model output stays outside dist/.
import fs from 'node:fs';
import {SoarController, loadSources, splitProductions} from '../dist/soar/controller.js';

const dir=new URL('../research/deepseek-campus/',import.meta.url);
const read=p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8');
const sources=await loadSources(read);
const fixture=`
sp {campus*default-consider
 (state <s> ^superstate nil ^io.input-link.frame <f>)
 (<f> ^mode campus-choice ^from <who> ^available <a>)
 (<a> ^kind ask-time ^target <who>)
 -->
 (<s> ^operator <o> +)
 (<o> ^name choose ^choice <a> ^priority 0 ^rule campus*default-consider ^reason |尚无适用策略，先请求考虑时间。|)
}
sp {campus*emit-selected-command
 :i-support
 (state <s> ^superstate nil ^operator <o> ^io.input-link.frame <f> ^io.output-link <out>)
 (<o> ^name choose ^choice <a> ^rule <rule> ^reason <reason>)
 (<f> ^mode campus-choice ^seq <seq> ^available <a>)
 (<a> ^id <id> ^kind <kind> ^target <target>)
 -->
 (<out> ^command <cmd>)
 (<cmd> ^seq <seq> ^id <id> ^kind <kind> ^target <target> ^rule <rule> ^reason <reason>)
}`;
sources.common+='\n'+fixture;
const root=await SoarController.create(sources,{wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url))});
const fresh=()=>new SoarController(root.native,sources);
const artifacts=[1,2,3].map(n=>JSON.parse(fs.readFileSync(new URL(`attempt-${n}.json`,dir),'utf8')));
const report={scope:'Isolated fictional M/T invitation fixture; not a playable campus, full conversation, automatic appraisal, or production model service.',nativeKernel:'Soar 9.6.5 WASM',model:artifacts[0].request.model,completionRequests:artifacts.length,usage:{prompt:0,completion:0,total:0},attempts:[],cases:[],checks:[],acceptedForGame:false};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,detail});

// A small reviewed-interface audit, not a general sandbox or complete Soar verifier.
function interfaceErrors(source){
 const errors=[];
 const allowed=new Set(['superstate','io','input-link','frame','io.input-link.frame','mode','self','from','audience','known','available','affection-target','affection','peer-pressure','id','kind','target','ordinal']);
 for(const p of splitProductions(source)){
  const [lhs,rhs]=p.split('-->');
  if(!/^sp\s*\{\s*learned\*m\*/.test(p))errors.push('wrong owner/name prefix');
  for(const [,field] of lhs.matchAll(/\^([\w.-]+)/g))if(!allowed.has(field))errors.push('unknown input field: '+field);
  if(!rhs||!/\(<s>\s+\^operator\s+<o>\s+\+\)/.test(rhs))errors.push('missing proposal');
  if(!/\^priority\s+(?:[1-9]\d?|100)(?=\s)/.test(rhs||''))errors.push('priority out of range');
 }
 return [...new Set(errors)];
}
for(const [i,a] of artifacts.entries()){
 const source=JSON.parse(a.response.content).source;
 const entry={attempt:i+1,latencySeconds:a.latencySeconds,usage:a.response.usage,interfaceErrors:interfaceErrors(source),nativeParse:false};
 const b=fresh();
 try{b.create('m');b.loadNative(b.ids.get('m'),source);entry.nativeParse=true;}
 catch(e){entry.nativeError=e.message;}
 finally{b.destroy();}
 report.attempts.push(entry);
 report.usage.prompt+=a.response.usage.prompt_tokens;
 report.usage.completion+=a.response.usage.completion_tokens;
 report.usage.total+=a.response.usage.total_tokens;
}

function remember(b,owner,predicate,value,uid,time){
 // These are authored fixture appraisals, explicitly not natural-language interpretation.
 b.observe(owner,{uid,type:'event',kind:'campus-fixture',actor:owner,source:'self',time,text:predicate+'='+value});
 return b.perceive(owner,{key:'campus:'+predicate,subject:'campus',predicate,domain:'situation',energy:90,'goal-relevant':true,evidence:{class:'belief',source:'self',value,root:uid,speaker:owner,time,explanation:'unknown'}}).record;
}
function known(b,owner,time=1300){
 const get=predicate=>{
  const r=b.recall(owner,{type:'mental-record',owner,key:'campus:'+predicate});
  return r.memory ? b.mindRead(owner,'campus:'+predicate,time).record : null;
 };
 const target=get('affection-target'),affection=get('affection'),pressure=get('peer-pressure');
 return {values:{'affection-target':target?.value||'unknown',affection:affection?.value||'unknown','peer-pressure':pressure?.value||'unknown'},evidence:{target:target?.provenance,affection:affection?.provenance,pressure:pressure?.provenance}};
}
function decide(b,name,{owner='m',from='t',audience='public',omit=[]}={}){
 const k=known(b,owner);
 const options=['accept-prom','decline-prom','ask-private','ask-time'].filter(kind=>!omit.includes(kind)).map((kind,ordinal)=>({id:name+'-'+ordinal,kind,target:from,ordinal}));
 const r=b.transact(owner,{mode:'campus-choice',from,audience,known:k.values},options);
 const row={name,owner,from,audience,known:k.values,evidence:k.evidence,choice:r.kind,target:r.target,rule:r.rule,reason:r.reason,fired:r.fired,cycles:r.cycles,validOption:options.some(a=>a.id===r.id&&a.kind===r.kind&&a.target===r.target)};
 report.cases.push(row);return row;
}

let b,restored;
try{
 const final=report.attempts.at(-1);
 if(final.nativeParse&&!final.interfaceErrors.length){
  b=fresh();b.create('m');b.create('f');
  remember(b,'m','affection-target','t','m-e1-target',1000);
  remember(b,'m','affection','yes','m-e1',1000);
  remember(b,'m','peer-pressure','high','m-e2',1100);
  b.observe('f',{uid:'f-own-event',kind:'campus-fixture',actor:'f',source:'self',time:1100});
  const baseline=decide(b,'before-install');
  await b.install('m',JSON.parse(artifacts.at(-1).response.content).source,{provider:report.model,fixtureOnly:true});
  const publicHigh=decide(b,'public-high');
  const privateHigh=decide(b,'private-high',{audience:'private'});
  const unavailable=decide(b,'private-high-no-redundant-private',{audience:'private',omit:['ask-private']});
  const other=decide(b,'other-inviter',{from:'a'});
  const isolated=decide(b,'other-agent',{owner:'f'});
  const saved=b.snapshot();
  restored=fresh();restored.restore(saved);
  const resumed=decide(restored,'restored-public-high');
  // A new directly experienced support event changes M's appraisal, not the policy source.
  remember(b,'m','peer-pressure','low','m-e3',1200);
  const publicLow=decide(b,'public-low');
  const privateLow=decide(b,'private-low',{audience:'private'});
  const repeat=decide(b,'private-low-repeat',{audience:'private'});
  const stillHigh=decide(restored,'old-save-still-high');
  check('model-productions-execute',privateLow.rule.startsWith('learned*m*')&&privateLow.fired.includes(privateLow.rule),privateLow.rule);
  check('policy-install-changes-behavior',baseline.choice!==privateLow.choice,{before:baseline.choice,after:privateLow.choice,note:'Compare below using same private-low frame without policy.'});
  check('every-output-is-an-available-action',report.cases.every(c=>c.validOption));
  check('affection-is-bound-to-the-inviter',other.choice==='ask-time'&&other.rule==='campus*default-consider');
  check('other-agent-does-not-share-M-memory',isolated.known.affection==='unknown'&&isolated.known['peer-pressure']==='unknown');
  check('native-memory-update-affects-private-choice',privateHigh.choice!==privateLow.choice&&privateLow.evidence.pressure==='m-e3');
  check('pressure-update-preserves-affection',privateLow.known.affection==='yes'&&privateLow.evidence.affection==='m-e1');
  check('unavailable-private-request-falls-back',unavailable.choice==='ask-time');
  check('native-save-restores-choice-and-memory',resumed.choice===publicHigh.choice&&resumed.rule===publicHigh.rule&&stillHigh.known['peer-pressure']==='high');
  check('same-policy-reuses-without-model-call',repeat.choice===privateLow.choice&&repeat.rule===privateLow.rule);
  // Requirements set before looking at the result. Syntax success is insufficient.
  check('public-pressure-changes-selected-action',publicHigh.choice!==publicLow.choice,{high:publicHigh.choice,low:publicLow.choice});
  check('private-context-does-not-request-private-again',privateHigh.choice!=='ask-private',{actual:privateHigh.choice});
  b.remove('m');
  const ablated=decide(b,'same-private-low-without-policy',{audience:'private'});
  const installCheck=report.checks.find(c=>c.name==='policy-install-changes-behavior');
  installCheck.pass=ablated.choice!==privateLow.choice;
  installCheck.detail={sameFrame:true,withoutPolicy:ablated.choice,withPolicy:privateLow.choice};
 }else check('final-output-compiles-and-matches-interface',false,final);
}catch(e){report.runtimeError=e.stack;check('fixture-runs-to-completion',false,e.message);}
finally{b?.destroy();restored?.destroy();root.destroy();}
report.acceptedForGame=report.checks.length>0&&report.checks.every(c=>c.pass);
fs.writeFileSync(new URL('verification.json',dir),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({completionRequests:report.completionRequests,usage:report.usage,attempts:report.attempts.map(a=>({attempt:a.attempt,nativeParse:a.nativeParse,interfaceErrors:a.interfaceErrors})),cases:report.cases.map(c=>({case:c.name,choice:c.choice,rule:c.rule})),checks:report.checks,acceptedForGame:report.acceptedForGame,runtimeError:report.runtimeError},null,2));
process.exitCode=report.acceptedForGame?0:1;
