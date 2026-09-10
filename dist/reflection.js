import {validateDomain} from './domain/validate.js';
import {SoarController,splitProductions} from './soar/controller.js';
import {episodeResult,validateEpisode} from './director.js';
const hash=value=>{let h=2166136261;for(const c of JSON.stringify(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
export function buildDayReport(house){
 const events=structuredClone(house.dayEvents),summary={};
 for(const p of house.people){
  const own=events.filter(e=>e.actor===p.id),starts=own.filter(e=>e.type==='taskStarted');
  summary[p.id]={name:p.name,goal:structuredClone(p.goals[0]),plan:structuredClone(p.plan),needs:{hunger:p.hunger,energy:p.energy,fun:p.fun,social:p.social},
   meals:starts.filter(e=>e.task==='eat').map(e=>({id:e.id,time:e.time,slot:e.meal,why:e.why})),sleep:starts.filter(e=>e.task==='sleep').map(e=>({id:e.id,time:e.time})),
   disruptions:own.filter(e=>['distraction','brokenPromise','missed','unavailable','missedMeal'].includes(e.type)),
   planChanges:own.filter(e=>e.type==='planStep'),recentPersonalMemory:structuredClone(house.brain.views[p.id].recent),
   mind:structuredClone(p.mental),affect:structuredClone(p.affect),receipts:structuredClone(p.receipts),commitments:structuredClone(p.promises),personalRules:house.brain.sources.people[p.id],installedRules:house.brain.rules[p.id],lastExplanation:p.explanation,
   conversations:house.conversations.filter(c=>c.members[p.id]?.joinedAt).map(c=>({id:c.id,status:c.status,heard:structuredClone(c.members[p.id].heard),myParticipation:structuredClone(c.members[p.id].decision),myExit:c.members[p.id].reason})),lastConversationDecision:structuredClone(p.socialDecision)};
 }
 const report={schemaVersion:1,day:house.day,baseRuleVersion:house.rulesVersion,epoch:house.reviewEpoch,seed:house.seed,events,people:summary,
  previousReflections:house.reviews.filter(r=>r.status==='applied').slice(-5).map(r=>({day:r.report.day,ruleVersion:r.appliedRuleVersion,patch:structuredClone(r.patch)})),commonRules:house.brain.sources.common,routine:structuredClone(house.domain.routine),domain:structuredClone(house.domain),goals:structuredClone(house.domain.goals),home:structuredClone(house.home),
  situationEconomy:structuredClone(house.storyEconomy||{}),activeSituations:(house.incidents||[]).map(s=>({id:s.id,day:s.day,objects:structuredClone(s.objects),events:structuredClone(s.events),debts:structuredClone(s.debts)})),
  episode:episodeResult(house),episodePlan:structuredClone(house.episode),
  instruction:'分析这一天实际发生的事。根据作用域提出面向未来的世界 tuning、个人 Soar 规则，或导演的次日情景安排。导演可以安排新情境、独立的个人经历和诉求，但不能指定谁一定答应、台词顺序或最终结局。人物规则只依据本人获知的信息。不能修改历史。规则修改和剧情续接都必须引用真实事件 ID。'};
 report.requestId=`reflection-${house.seed}-${house.day}-${hash({version:report.baseRuleVersion,events,summary})}`;return report;
}
function patchValue(root,path,value){
 if(typeof path!=='string'||path.includes('__proto__')||path.includes('constructor')||path.includes('prototype'))throw Error('非法规则路径');
 const keys=path.startsWith('/')?path.slice(1).split('/').map(k=>k.replace(/~1/g,'/').replace(/~0/g,'~')):path.split('.');if(keys[0]==='projects'&&!['foodReserve','energyReserve','breakTarget','deadlineMinute'].includes(keys[2]))throw Error('当前项目保留原有目标；这个字段需要新的意图规则');
 if(!['routine','needs','actions','projects','conversation'].includes(keys[0]))throw Error('这类世界定义不能由日终补丁修改');
 if(keys[0]==='conversation'&&!['inviteMinutes','joinMinutes','turnMinutes','responseMinutes','maxMinutes','maxTurns','maxParticipants','range','cooldownMinutes'].includes(keys[1]))throw Error('日结只能调整会话参数，不能改写小组成员或正在进行的谈话');
 let at=root;for(const k of keys.slice(0,-1)){if(!Object.hasOwn(at,k)||typeof at[k]!=='object')throw Error('未知规则路径：'+path);at=at[k];}
 const key=keys.at(-1);if(!Object.hasOwn(at,key)||typeof at[key]!==typeof value||typeof value==='object')throw Error('规则路径或类型不兼容');
 if(typeof value==='number'&&(!Number.isFinite(value)||(value<0&&!(keys[0]==='actions'&&['start','finish'].includes(keys[2])))))throw Error('数值必须有限，消耗效果之外不能为负');at[key]=value;
}
export function validateWorld(domain){
 validateDomain(domain);const r=domain.routine;
 if(r.preparationMinutes<15||r.preparationMinutes>180||r.maxResourceWait>60||r.servings<1||r.servings>10)throw Error('家庭作息参数不合理');
 const meals=Object.values(r.meals).sort((a,b)=>a.start-b.start);
 for(let i=0;i<meals.length;i++){const m=meals[i];if(m.start<0||m.end>1440||m.end-m.start<15||m.end-m.start>120||!['dad','me'].includes(m.cook)||i&&meals[i-1].end>m.start)throw Error('饭点时段重叠或不完整');}
 for(const [a,b] of r.work)if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b>1440||a>=b)throw Error('工作时段无效');
 for(const s of Object.values(r.sleep))if(s.bed<1200||s.bed>=1440||s.wake<300||s.wake>600)throw Error('睡眠时段不合理');
 for(const a of Object.values(r.attendance||{}))if(!Number.isFinite(a.leave)||!Number.isFinite(a.return)||a.leave<420||a.leave>540||a.return<900||a.return>1140||a.leave>=a.return)throw Error('上学上班的往返时段不合理');
 for(const spec of Object.values(domain.needs))if(spec.decay<.001||spec.decay>.3||spec.sleepDecay<0||spec.sleepDecay>.1)throw Error('需求变化率超出可执行范围');
 return domain;
}
export function validateReflection(house,patch){
 const review=house.reviews.find(r=>r.report.requestId===patch?.requestId);if(!review)throw Error('补丁不属于这个家庭的已记录日结');
 if(review.status==='applied')throw Error('该日结已处理');
 if(patch.schemaVersion!==1||patch.baseRuleVersion!==house.rulesVersion||patch.baseRuleVersion!==review.report.baseRuleVersion||review.report.epoch!==house.reviewEpoch)throw Error('规则版本或读档分支已变化，请重新反思');
 if(!Array.isArray(patch.changes)||patch.changes.length>12||typeof patch.summary!=='string')throw Error('日终补丁格式不完整');
 const ids=new Set(review.report.events.map(e=>e.id)),next=structuredClone(house.domain),people=new Map();
 if(patch.nextEpisode){
  validateEpisode(patch.nextEpisode,review.report.day+1);
  if(house.calendarFor(house.people[0]).workday&&patch.nextEpisode.meet<1060)throw Error('工作日的全家情景须安排在放学下班回家后');
  if(house.day!==patch.nextEpisode.day||house.episode?.briefed.length)throw Error('次日情景已经开始或日期已变化，不能改写已发生的开场');
  if(patch.nextEpisode.basedOn!==review.report.day||!Array.isArray(patch.nextEpisode.evidence)||!patch.nextEpisode.evidence.length||patch.nextEpisode.evidence.some(id=>!ids.has(id)))throw Error('次日情景需要引用本日实际结果');
 }
 for(const change of patch.changes){
  if(typeof change.reason!=='string'||!change.reason.trim()||!Array.isArray(change.evidence)||!change.evidence.length||change.evidence.some(id=>!ids.has(id)))throw Error('每项修改必须引用这一天真实的事件');
  if(change.kind==='world')patchValue(next,change.path,change.value);
  else if(change.kind==='person'){
   if(!house.person(change.person)||typeof change.source!=='string')throw Error('人物规则缺少对象或源码');
   // Personal learning may use only events delivered to this agent or its own objective actions.
   if(change.evidence.some(id=>{const e=review.report.events.find(e=>e.id===id);return e.actor!==change.person&&!e.observedBy?.includes(change.person);}))throw Error('不能把这个人不知道的事当作个人学习依据');
   const prior=people.get(change.person)||house.brain.rules[change.person].map(x=>x.source).join('\n');
   const byName=new Map((prior?splitProductions(prior):[]).map(src=>[src.match(/^sp\s*\{\s*(\S+)/)[1],src]));
   for(const src of splitProductions(change.source)){const name=src.match(/^sp\s*\{\s*(\S+)/)[1];if(!name.startsWith('learned*'))throw Error('新增个人规则名必须以 learned* 开头');byName.set(name,src);}people.set(change.person,[...byName.values()].join('\n'));
  }else throw Error('不支持的修改类型');
 }
 validateWorld(next);return {review,next,people};
}
export async function applyReflection(house,patch){
 if(house.reviewApplying)throw Error('已有规则更新正在校验');
 const validated=validateReflection(house,patch),sourceVersion=house.rulesVersion,epoch=house.reviewEpoch;
 if(!patch.changes.length){if(patch.nextEpisode)house.beginEpisode({...patch.nextEpisode,origin:patch.author||'模型日终生成'});validated.review.status='applied';validated.review.patch=structuredClone(patch);validated.review.appliedAt=house.time;validated.review.appliedRuleVersion=house.rulesVersion;house.emit('reflection',null,patch.summary,[],null,false,{requestId:patch.requestId,ruleVersion:house.rulesVersion});return {ruleVersion:house.rulesVersion,changes:0};}
 const before=house.save(),native=house.brain.native,sources=house.brain.sources;
 const candidateBrain=new SoarController(native,sources);house.reviewApplying=true;
 let commitStarted=false;
 try{
  const candidate=new house.constructor(house.seed,before).attachBrain(candidateBrain);candidate.domain=validated.next;
  for(const [person,source] of validated.people)await candidateBrain.install(person,source,{author:patch.author||'LLM',reflection:patch.requestId});
  for(const p of candidate.people){p.nextDecision=candidate.time;candidate.decide(p);}
  if(house.rulesVersion!==sourceVersion||house.reviewEpoch!==epoch)throw Error('校验期间世界规则或分支改变，未应用旧补丁');
  commitStarted=true;
  for(const [person,source] of validated.people)await house.brain.install(person,source,{author:patch.author||'LLM',reflection:patch.requestId});
  house.domain=validated.next;if(patch.nextEpisode)house.beginEpisode({...patch.nextEpisode,origin:patch.author||'模型日终生成'});house.rulesVersion++;validated.review.status='applied';validated.review.patch=structuredClone(patch);validated.review.appliedAt=house.time;validated.review.appliedRuleVersion=house.rulesVersion;
  house.ruleHistory??=[];house.ruleHistory.push({version:house.rulesVersion,previous:before.domain,previousRules:Object.fromEntries(Object.entries(before.cognition.people).map(([id,p])=>[id,p.rules])),requestId:patch.requestId,summary:patch.summary});if(house.ruleHistory.length>5)house.ruleHistory.shift();
  for(const r of house.reviews)if(r!==validated.review&&r.status!=='applied'&&r.report.baseRuleVersion!==house.rulesVersion)r.status='stale';
  for(const p of house.people)p.nextDecision=house.time;
  house.emit('reflection',null,patch.summary,[],null,false,{requestId:patch.requestId,ruleVersion:house.rulesVersion});
 }catch(error){
  if(commitStarted){const restored=new SoarController(native,sources);restored.restore(before.cognition);house.brain.destroy();house.brain=restored;house.domain=before.domain;house.rulesVersion=sourceVersion;}
  throw error;
 }finally{candidateBrain.destroy();house.reviewApplying=false;}
 return {ruleVersion:house.rulesVersion,changes:patch.changes.length};
}
export async function rollbackReflection(house){
 if(house.reviewApplying)throw Error('已有规则更新正在校验');
 const history=house.ruleHistory?.at(-1);if(!history)throw Error('没有可撤回的日终修改');
 const before=house.brain.snapshot(),native=house.brain.native,sources=house.brain.sources;house.reviewApplying=true;
 try{
  // Installing only earlier learned productions retains current SMem/EpMem and RL weights.
  for(const [id,rules] of Object.entries(history.previousRules)){
   const source=rules.map(x=>x.source).join('\n');if(source)await house.brain.install(id,source,{author:'rollback'});else house.brain.remove(id);
  }
  house.domain=structuredClone(history.previous);house.ruleHistory.pop();house.rulesVersion++;house.reviewEpoch++;
  for(const r of house.reviews)if(r.status!=='applied')r.status='stale';
  house.emit('reflection',null,'已撤回上一份日终规则修改，发生过的事情仍然保留。',[],null,false);for(const p of house.people)p.nextDecision=house.time;
 }catch(error){const restored=new SoarController(native,sources);restored.restore(before);house.brain.destroy();house.brain=restored;throw error;}
 finally{house.reviewApplying=false;}
}
// Providers are real asynchronous functions. The default is intentionally unconnected;
// no precomputed daily sequence is passed off as live model reflection.
export class ReflectionService{
 constructor(provider=null,{timeoutMs=60000}={}){this.provider=provider;this.timeoutMs=timeoutMs;this.pending=new Map();this.generation=0;}
 setProvider(provider){if(provider!==null&&typeof provider!=='function')throw Error('反思服务必须是异步函数');this.cancel();this.provider=provider;}
 cancel(){this.generation++;for(const item of this.pending.values()){item.abort.abort();if(item.review.status==='thinking')item.review.status='pending';}this.pending.clear();}
 submit(house,review){
  if(!this.provider||this.pending.has(review.report.requestId)||review.status!=='pending')return null;
  const provider=this.provider,generation=this.generation,abort=new AbortController();review.status='thinking';review.error=null;
  const task=(async()=>{let timer;try{
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('日终模型请求超时，继续沿用当前规则'));},this.timeoutMs);});
   const patch=await Promise.race([Promise.resolve().then(()=>provider(structuredClone(review.report),{signal:abort.signal})),timeout]);
   if(generation!==this.generation||abort.signal.aborted)return;
   await applyReflection(house,patch);
  }catch(e){if(generation===this.generation){review.status='pending';review.error=e.message;}}finally{clearTimeout(timer);if(this.pending.get(review.report.requestId)?.abort===abort)this.pending.delete(review.report.requestId);}})();
  this.pending.set(review.report.requestId,{abort,task,review});return task;
 }
}

export const patchSchema={schemaVersion:1,requestId:'copy report.requestId',baseRuleVersion:'copy report.baseRuleVersion',author:'provider model name',summary:'解释当天发现和适用范围；允许无需修改',changes:[{kind:'world',path:'routine.preparationMinutes',value:'number',reason:'根据真实事件说明原因和预期效果',evidence:['numeric event IDs']},{kind:'person',person:'xing',source:'sp {learned*... ...}',reason:'该人亲身经历或获知的事实，以及改规则的原因',evidence:['numeric event IDs']}]};
export function reportForModel(report,person=null){
 const base={schemaVersion:report.schemaVersion,requestId:report.requestId,baseRuleVersion:report.baseRuleVersion,day:report.day,epoch:report.epoch,scope:person||'world',outputSchema:patchSchema,commonRules:report.commonRules,domain:report.domain,instruction:report.instruction};
 if(person==='director')return {...base,scope:'director',episode:report.episode,economy:report.situationEconomy,activeSituations:report.activeSituations,events:report.events.filter(e=>e.episode||['returned','departed','player','brokenPromise'].includes(e.type)),people:Object.fromEntries(Object.entries(report.people).map(([id,p])=>[id,{goal:p.goal,needs:p.needs}])),outputSchema:{...patchSchema,changes:[],nextEpisode:{...report.episodePlan,id:`episode-${report.day+1}`,day:report.day+1,basedOn:report.day,evidence:report.episode?.evidence||[]}},instruction:report.instruction+' 输出 changes:[] 和 nextEpisode；可改 title/premise/roles 的具体内容，template 可用 detective/reports/chores/fear。nextEpisode.situation 是可编辑情景包：version/id/title/premise/roles/facts/seeds/objects/observations/actions/end/carry。actions 的 mode 是 talk 或 physical，actor/target 是五人 ID，when 是 [事实名,eq或ne或gt或lt,值]，priority 1—700，minutes 1—40，effects 仅允许已注册能力。可以重组条件、行为和台词，编译为每个人的原生 Soar productions。生成全新情景时设 continuation:null；继续旧事件时不得改写旧事件包，个人策略更新放在个人反思补丁里。角色只读取各自实际接收的 seeds 与对话；不要塞入预定结局或别人的秘密。还支持旧 show/restaurant/outing 桌面准备方法。roles 每人有 memory/want/job/line（候选表达，不是台词表）。工作日 meet 在 1160 左右，finale 1230，deadline 1275；周末可白天活动。effort 5—30。基于实际完成/失约延续情景，不把一个人的秘密当成另一个人的记忆。'};
 if(person){if(!report.people[person])throw Error('未知反思对象');base.domain={...report.domain,goals:{[person]:report.domain.goals[person]},projects:{[person]:report.domain.projects[person]}};return {...base,person,people:{[person]:report.people[person]},events:report.events.filter(e=>e.actor===person||e.observedBy?.includes(person)).map(e=>{if(e.actor===person||e.type!=='incident-event')return e;const {reason,rule,effects,...publicEvent}=e;return publicEvent;}),instruction:report.instruction+' 只生成该人的 learned* 规则；听说的内容保留不确定性，不可把他人的未透露经历补进认知。'};}
 return {...base,events:report.events.filter(e=>['taskStarted','taskCompleted','missedMeal','unavailable','environment'].includes(e.type)).map(({id,time,type,actor,task,meal,slot})=>({id,time,type,actor,task,meal,slot})),instruction:report.instruction+' 这是物理系统维护任务，只允许 world tuning；不生成个人信念或个人规则。'};
}
export function httpReflectionProvider(endpoint){
 const url=new URL(endpoint,globalThis.location?.href);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('模型服务需要 HTTPS 地址');
 return async(report,{signal})=>{
  // Independent, isolated prompts; one slow person does not serially delay all seven.
  const patches=await Promise.all([null,...Object.keys(report.people),...(report.episode?['director']:[])].map(async person=>{
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reportForModel(report,person)),signal});if(!response.ok)throw Error('模型服务返回 '+response.status);const patch=await response.json();
   if(patch.requestId!==report.requestId||patch.baseRuleVersion!==report.baseRuleVersion||!Array.isArray(patch.changes)||patch.changes.some(c=>person==='director'?true:person?c.kind!=='person'||c.person!==person:c.kind!=='world')||person!=='director'&&patch.nextEpisode)throw Error('模型返回了超出本次认知范围的补丁');return patch;
  }));
  return {...patches[0],summary:patches.map(p=>p.summary).join('；'),changes:patches.flatMap(p=>p.changes),nextEpisode:patches.find(p=>p.nextEpisode)?.nextEpisode};
 };
}
