import SoarModule from './soar.js';
import {validateObservation} from './observation.js';
let agentSerial=0;
// Accept productions only, not arbitrary CLI commands. The native parser is the authority on syntax.
export function splitProductions(source){
 if(typeof source!=='string'||source.length>1000000)throw Error('规则文件为空或过大');
 const list=[];let i=0;
 while(i<source.length){
  if(/\s/.test(source[i])){i++;continue;}
  if(source[i]==='#'){while(i<source.length&&source[i]!=='\n')i++;continue;}
  if(source.slice(i,i+2)!=='sp'||!/[\s{]/.test(source[i+2]||''))throw Error('只允许原生 sp { … } productions');
  const start=i;i+=2;while(/\s/.test(source[i]))i++;if(source[i]!=='{')throw Error('sp 后缺少 {');
  let depth=0,bar=false,escape=false;
  for(;i<source.length;i++){const ch=source[i];if(escape){escape=false;continue;}if(ch==='\\'){escape=true;continue;}if(ch==='|'){bar=!bar;continue;}if(bar)continue;if(ch==='#'){while(i<source.length&&source[i]!=='\n')i++;continue;}if(ch==='{')depth++;if(ch==='}'&&--depth===0){i++;break;}}
  if(depth||bar)throw Error('规则括号或引用不完整');list.push(source.slice(start,i));
 }
 if(!list.length)throw Error('没有找到 production');return list;
}
export class SoarController {
 static async create(sources,options={}){return new SoarController(await SoarModule(options),sources);}
 constructor(runtime,sources){this.native=runtime;this.sources=typeof sources==='string'?{common:sources,people:{}}:sources;this.base=this.sources.common;this.ids=new Map();this.frames=new Map();this.traces={};this.rules={};this.rev={};this.inputs={};this.socialInputs={};this.training={};this.views={};this.outcomes={};}
 cli(person,text){const r=this.native.command(this.ids.get(person),text);if(!r.ok)throw Error(r.message);return r.message;}
 loadNative(id,source){for(const p of splitProductions(source)){const r=this.native.command(id,p);if(!r.ok)throw Error(r.message);}}
 create(person,saved=null){
  const id=this.native.createAgent('family-'+person+'-'+(++agentSerial));
  try{if(saved&&saved.programVersion!==11){this.loadNative(id,this.base+'\n'+(this.sources.people[person]||''));for(const p of splitProductions(saved.native.productions))if(/^sp\s*\{\s*(rl\*|learned\*)/.test(p))this.loadNative(id,p);}else this.loadNative(id,saved?.native.productions||this.base+'\n'+(this.sources.people[person]||''));if(saved)this.native.restore(id,saved.native);}
  catch(e){this.native.destroyAgent(id);throw e;}
  this.ids.set(person,id);this.frames.set(person,saved?.sequence||0);this.rev[person]=saved?.revision||0;this.rules[person]=saved?.rules||[];this.training[person]=saved?.training||[];this.outcomes[person]=new Set(saved?.outcomes||[]);this.views[person]=saved?.view||{recent:[]};return id;
 }
 transact(person,facts,options=[]){
  if(!this.ids.has(person))this.create(person);
  const seq=(this.frames.get(person)||0)+1;this.frames.set(person,seq);
  const input={self:person,'ontology-version':2,'policy-version':this.rev[person],...facts};
  if(['act','response'].includes(facts.mode))this.inputs[person]={facts:input,options};
  if(facts.mode==='conversation'){this.socialInputs[person]??={};this.socialInputs[person][facts.phase]={facts:structuredClone(input),options:structuredClone(options)};}
  const t=performance.now(),r=this.native.step(this.ids.get(person),input,options,seq);r.elapsed=performance.now()-t;r.revision=this.rev[person];
  if(!r.ok)throw Error(person+' 的 '+facts.mode+' 未在认知预算内完成');
  if(['act','response'].includes(facts.mode))this.traces[person]=r;
  if(r.goal)this.views[person].goal=r.goal;if(r.plan)this.views[person].plan=r.plan;
  if(r.commitment)this.views[person].commitment=r.commitment;
  return r;
 }
 plan(person,facts,options){for(let n=0;n<6;n++){const r=this.transact(person,{...facts,mode:'plan'},options);if(r.kind==='planned')return r;}throw Error('计划更新未能收敛');}
 decide(person,facts,options){return this.transact(person,facts,options);}
 observe(person,event){validateObservation(event);const r=this.transact(person,{mode:'observe',event});this.views[person].recent=[...(this.views[person].recent||[]),event].slice(-22);return r;}
 perceive(person,input){input=structuredClone(input);input.evidence.provenance=input.evidence.root;delete input.evidence.root;const r=this.transact(person,{mode:'perceive',...input});this.views[person].mind??={};this.views[person].mind[input.key]=r.record;return r;}
 mindRead(person,key,time,decay={emotion:.18,mood:.025}){const r=this.transact(person,{mode:'mind-read',key,time,'emotion-decay':decay.emotion,'mood-decay':decay.mood});if(r.record){this.views[person].mind??={};this.views[person].mind[key]=r.record;}return r;}
 share(person){return this.transact(person,{mode:'share'});}
 recall(person,cue){return this.transact(person,{mode:'recall',cue});}
 initGoal(person,day,spec){return this.transact(person,{mode:'goal-init',day,spec}).goal;}
 progress(person,action,amount){return this.transact(person,{mode:'progress',action,amount}).goal;}
 completeAction(person,action){return this.transact(person,{mode:'complete-action',action});}
 updateCommitment(person,uid,status){return this.transact(person,{mode:'contract-update',uid,status,open:status==='pending'||status==='broken'});}
 feedback(person,decision,effect){
  if(!decision?.method)return null;const key=effect['outcome-id'];if(key&&this.outcomes[person]?.has(key))return {kind:'already-learned'};
  const r=this.transact(person,{mode:'feedback',method:decision.method,concern:decision.concern,...effect});
  if(key)this.outcomes[person].add(key);this.training[person]=[...this.training[person],{method:decision.method,concern:decision.concern,effect,reward:r.reward,fired:r.fired}].slice(-40);return r;
 }
 snapshotPerson(person){return {programVersion:11,native:this.native.snapshot(this.ids.get(person)),sequence:this.frames.get(person),revision:this.rev[person],rules:structuredClone(this.rules[person]),training:structuredClone(this.training[person]),view:structuredClone(this.views[person]),outcomes:[...this.outcomes[person]]};}
 snapshot(){return {version:2,people:Object.fromEntries([...this.ids.keys()].map(p=>[p,this.snapshotPerson(p)]))};}
 restore(saved){if(saved?.version!==2)throw Error('认知存档版本不兼容');for(const [p,s] of Object.entries(saved.people))this.create(p,s);}
 inspect(person){return {decision:this.traces[person],memory:this.cli(person,'print @'),episodes:this.cli(person,'epmem --stats'),chunks:this.cli(person,'print --chunks --full'),rl:this.cli(person,'print --rl --full'),training:this.training[person],rules:this.rules[person]};}
 async install(person,source,meta={}){
  if(!this.ids.has(person))this.create(person);
  if(source.length>60000)throw Error('新增规则文件过大');
  const productions=splitProductions(source),names=productions.map(s=>s.match(/^sp\s*\{\s*([^\s{}]+)/)?.[1]);
  if(names.some(n=>!n?.startsWith('learned*')||!/^[A-Za-z0-9_*.-]+$/.test(n)))throw Error('新增规则名必须以 learned* 开头');
  if(new Set(names).size!==names.length)throw Error('规则名重复');
  for(const src of productions){const rhs=src.split('-->')[1];if(!rhs||/\((?:halt|interrupt|exec|cmd|write|succeeded|failed|force-learn|dont-learn)\b/.test(rhs))throw Error('不支持的规则操作');}
  const before=this.snapshotPerson(person),validator=this.native.createAgent('validate-'+(++agentSerial));
  try{
   this.loadNative(validator,before.native.productions);this.native.restore(validator,before.native);
   for(const n of this.rules[person].flatMap(p=>p.names))this.native.command(validator,'excise '+n);
   this.native.command(validator,'excise --chunks');this.loadNative(validator,source);
   const samples=[this.inputs[person],...Object.values(this.socialInputs[person]||{})].filter(Boolean);let probe=0;for(const sample of samples){const r=this.native.step(validator,{...sample.facts,'policy-version':this.rev[person]+1},sample.options,++probe);if(!r.ok||!sample.options.some(x=>x.id===r.id))throw Error('新规则未能在当前行动或会话情境产生有效操作');}
  }finally{this.native.destroyAgent(validator);}
  const live=this.ids.get(person);
  try{for(const n of this.rules[person].flatMap(p=>p.names))this.cli(person,'excise '+n);this.cli(person,'excise --chunks');this.loadNative(live,source);}
  catch(e){this.native.destroyAgent(live);this.ids.delete(person);this.create(person,before);throw e;}
  this.rev[person]++;this.rules[person]=[{source,names,meta,revision:this.rev[person]}];return {names,revision:this.rev[person]};
 }
 remove(person){if(!this.ids.has(person))return;for(const pack of this.rules[person])for(const n of pack.names)this.cli(person,'excise '+n);this.cli(person,'excise --chunks');this.rules[person]=[];this.rev[person]++;}
 destroy(){for(const id of this.ids.values())this.native.destroyAgent(id);this.ids.clear();}
}
export async function loadSources(read=async path=>{const r=await fetch(path);if(!r.ok)throw Error('无法读取 '+path);return r.text();}){
 const common=await Promise.all(['memory','mind','communication','conversations','situations','episodes','contracts','cognition','planning','base'].map(n=>read('./soar/'+n+'.soar')));
 const names=['dad','me','xue','xing','xiaoyu'],files=await Promise.all(names.map(n=>read('./soar/people/'+n+'.soar')));
 return {common:common.join('\n'),people:Object.fromEntries(names.map((n,i)=>[n,files[i]]))};
}
