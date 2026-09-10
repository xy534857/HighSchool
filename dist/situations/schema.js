// Small, serializable vocabulary shared by authored packages and model replies.
// No JS execution, plot cursor, or forced responses in an imported package.
import {SPOTS} from '../layout.js';
export const ACTORS=['dad','me','xue','xing','xiaoyu'];
export const OPS=['remember','tell','repair','move','transfer','clean','inspect-work','policy','fear','comfort','social'];
const symbol=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(x);
const scalar=x=>typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x)||typeof x==='string'&&x.length<500&&!/[|{}\n]/.test(x);
export function validateSituation(p){
 if(!p||p.version!==1||!symbol(p.id)||!p.title||!p.premise||!Array.isArray(p.actions)||p.actions.length>80)throw Error('情景包格式无效');
 if(!p.roles||ACTORS.some(id=>!p.roles[id]?.want||!p.roles[id]?.memory))throw Error('缺少人物各自的处境');
 if(p.source&&(!/^https:\/\//.test(p.source.url)||typeof p.source.title!=='string'))throw Error('参考来源必须是网页地址');
 if(!Array.isArray(p.objects)||p.objects.length>12||!Array.isArray(p.observations)||p.observations.length>40)throw Error('物品或观察定义过多');
 const objects=new Set();for(const o of p.objects){if(!symbol(o.id)||objects.has(o.id)||!['family',...ACTORS].includes(o.owner)||typeof o.name!=='string'||!Object.hasOwn(SPOTS,o.location))throw Error('物品定义无效');objects.add(o.id);}
 const keys=Object.keys(p.facts||{});if(keys.length>100||keys.some(k=>!symbol(k)||!scalar(p.facts[k])))throw Error('事实词汇无效');
 for(const o of p.observations)if(!objects.has(o.object)||!['location','condition'].includes(o.property)||!keys.includes(o.key)||!scalar(o.result)||!scalar(o.value))throw Error('未知观察能力');
 if(p.carry&&(!Array.isArray(p.carry)||p.carry.some(k=>!keys.includes(k))))throw Error('跨日个人知识必须属于声明的词汇');
 for(const [id,facts] of Object.entries(p.seeds||{})){if(!ACTORS.includes(id))throw Error('未知记忆接收者');for(const [k,v] of Object.entries(facts))if(!keys.includes(k)||!scalar(v))throw Error('初始记忆不在词汇中');}
 const ids=new Set();for(const a of p.actions){
  if(!symbol(a.id)||ids.has(a.id)||!ACTORS.includes(a.actor)||!['talk','physical'].includes(a.mode)||!a.label||!a.reason||!a.text||/[|{}\n]/.test(a.reason))throw Error('行动定义无效');ids.add(a.id);
  if(!Number.isFinite(a.priority)||a.priority<1||a.priority>700||!Number.isFinite(a.minutes)||a.minutes<1||a.minutes>40)throw Error('行动预算无效');
  if(a.invite&&(!Array.isArray(a.invite)||a.invite.length>3||a.invite.some(id=>!ACTORS.includes(id)||id===a.actor)))throw Error('多人邀请无效');
  if(a.device&&!(a.device==='tv'&&a.mode==='physical'&&a.spot==='tv'))throw Error('设备使用无效');
  if(a.mode==='talk'&&(!ACTORS.includes(a.target)||a.target===a.actor))throw Error('谈话目标无效');
  if(a.mode==='physical'&&!Object.hasOwn(SPOTS,a.spot))throw Error('物品位置无效');
  for(const c of a.when||[])if(!keys.includes(c[0])||!['eq','ne','gt','lt'].includes(c[1])||!scalar(c[2]))throw Error('未知认知条件');
  if(!Array.isArray(a.effects)||a.effects.length>12)throw Error('效果定义无效');
  for(const e of a.effects){
   if(!OPS.includes(e.op))throw Error('未知效果能力');
   if(['remember','tell'].includes(e.op)&&(!keys.includes(e.key)||!scalar(e.value)))throw Error('未知记忆效果');
   if(e.valueFrom&&!(e.op==='tell'&&e.valueFrom==='work-version'))throw Error('未知的事实来源');
   if(e.op==='tell'&&a.mode!=='talk')throw Error('传话必须通过会话');
   if(['repair','move'].includes(e.op)&&(a.mode!=='physical'||!objects.has(e.object)))throw Error('物品效果必须实际执行');
   if(e.op==='move'&&!Object.hasOwn(SPOTS,e.to))throw Error('物品目的地无效');
   if(e.op==='transfer'&&(a.mode!=='talk'||!['family',a.actor].includes(e.from)||e.to!==a.target||!Number.isFinite(e.amount)||e.amount<=0||e.amount>50||e.from==='family'&&!['dad','me'].includes(a.actor)))throw Error('资金转移无效');
   if(e.op==='policy'&&(!['dad','me'].includes(a.actor)||!['chore-quality','pay-for-reports','night-light'].includes(e.key)||(e.key==='chore-quality'?![1,2,3].includes(e.value):typeof e.value!=='boolean')))throw Error('家庭制度定义无效');
   if(e.op==='clean'&&(a.mode!=='physical'||![1,2,3].includes(e.quality)||!Number.isFinite(e.amount)||e.amount<1||e.amount>20))throw Error('家务效果无效');
   if(e.op==='inspect-work'&&(a.mode!=='physical'||!ACTORS.includes(e.actor)))throw Error('验收对象无效');
   if(['fear','comfort'].includes(e.op)&&(!Number.isFinite(e.amount)||e.amount<0||e.amount>100||e.op==='comfort'&&a.mode!=='talk'))throw Error('情绪效果无效');
   if(e.op==='social'&&(a.mode!=='talk'||!['cooperate','apology','correction','refuse'].includes(e.value)))throw Error('社会反馈无效');
  }
 }
 for(const g of p.endState||[])if(!objects.has(g.object)||!['location','condition'].includes(g.property)||!scalar(g.value))throw Error('结束条件必须是可验证物品状态');
 for(const e of [...(p.end||[]),...(p.endAny||[]).flat()])if(!ids.has(e))throw Error('结束条件必须引用真实行动');
 return p;
}
const atom=x=>typeof x==='boolean'?(x?'yes':'no'):typeof x==='number'?x:/^[a-zA-Z0-9_-]+$/.test(x)?x:'|'+x+'|';
const bindings=new WeakMap();
export function situationBinding(pack){if(bindings.has(pack))return bindings.get(pack);let n=2166136261;for(const c of JSON.stringify(pack))n=Math.imul(n^c.charCodeAt(0),16777619);const key=pack.id+'-'+(n>>>0).toString(16);bindings.set(pack,key);return key;}
export function compileSituation(pack){
 validateSituation(pack);return pack.actions.flatMap(a=>['act','turn'].map(mode=>{
  const name=`situation*${situationBinding(pack)}*${a.id}*${mode}`;
  const guards=(a.when||[]).map(([k,op,v])=>`^belief.${k} ${op==='eq'?'':({ne:'<>',gt:'>',lt:'<'})[op]+' '}${atom(v)}`).join(' ');
  return `sp {${name}\n (state <s> ^io.input-link.frame <f>) (<f> ^self ${a.actor} ^mode ${mode==='act'?'act':'conversation ^phase turn'} ^available <a>)\n (<a> ^kind ${mode==='act'?'incident':'incident-turn'} ^pack ${situationBinding(pack)} ^token ${a.id} ^done no ${guards})\n --> (<s> ^operator <o> +) (<o> ^name choose ^choice <a> ^priority ${a.priority} ^rule ${name} ^reason |${a.reason}|)\n}`;
 })).join('\n');
}
