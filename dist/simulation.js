import {SPOTS,OBSTACLES,FURNITURE,OWN_DESK,LAYOUT_VERSION} from './layout.js';
import {installCalendar} from './calendar.js';
import {installDirector} from './director.js';
import {installSituations} from './situations/runtime.js';
import {installPerception,senses} from './perception.js';
import {installConversations,socialActions} from './conversations.js';
import {DOMAIN, ACTIONS} from './domain.js';
export {ACTIONS};
import {buildDayReport} from './reflection.js';
import {routineAt,explainPlan} from './routine.js';
import {validateDomain} from './domain/validate.js';
validateDomain(DOMAIN);
// Situation setup is authored; every participation and action choice remains in native Soar.
// JavaScript owns world mechanics. All autonomous action and response selection is delegated to native Soar.
export const CAST = [
 {id:'dad',name:'夏东海',color:'#e7bd63',role:'爸爸 · 写作者',traits:['讲道理','有幽默感','护着孩子'],x:-2.5,z:1.1},
 {id:'me',name:'刘梅',color:'#88b6a0',role:'妈妈 · 操心一家人',traits:['心直口快','重规矩','嘴硬心软'],x:4.7,z:-2.2},
 {id:'xue',name:'夏雪',color:'#bba3cf',role:'姐姐 · 想安静学习',traits:['自律','好强','讲公平'],x:-1.5,z:-2.7},
 {id:'xing',name:'刘星',color:'#75a9ae',role:'哥哥 · 玩心和小聪明',traits:['爱玩','好面子','也会照顾弟弟'],x:-3.1,z:3.6},
 {id:'xiaoyu',name:'夏雨',color:'#edbb64',role:'弟弟 · 好奇又贪吃',traits:['直来直去','黏人','容易被吸引'],x:1.1,z:2.4}
];
export {SPOTS,OBSTACLES};
const clamp=(v,lo=0,hi=100)=>Math.min(hi,Math.max(lo,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const NAV=.35, NX=61,NZ=43;
function cell(x,z){return [clamp(Math.round((x+10.5)/NAV),0,NX-1),clamp(Math.round((z+7.35)/NAV),0,NZ-1)];}
function point(ix,iz){return {x:ix*NAV-10.5,z:iz*NAV-7.35};}
const blocked=(p)=>OBSTACLES.some(([a,b,c,d])=>p.x>a-.12&&p.x<b+.12&&p.z>c-.12&&p.z<d+.12);
const openCells=Array.from({length:NX*NZ},(_,i)=>!blocked(point(i%NX,Math.floor(i/NX))));
export function route(a,b) {
 const nearest=p=>{let [x,z]=cell(p.x,p.z),i=z*NX+x;if(openCells[i])return i;let best=-1,ds=Infinity;openCells.forEach((ok,j)=>{if(ok){const d=distance(point(j%NX,Math.floor(j/NX)),p);if(d<ds){ds=d;best=j;}}});return best;};
 const start=nearest(a),end=nearest(b);if(start===end)return [{...point(end%NX,Math.floor(end/NX))}];
 const parent=new Int32Array(NX*NZ).fill(-1),q=[start];parent[start]=start;
 for(let n=0;n<q.length;n++){const i=q[n];if(i===end)break;const x=i%NX,z=Math.floor(i/NX);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,zz=z+dz,j=zz*NX+xx;if(xx<0||xx>=NX||zz<0||zz>=NZ||!openCells[j]||parent[j]>=0)continue;parent[j]=i;q.push(j);}}
 if(parent[end]<0)return null;const path=[];for(let i=end;i!==start;i=parent[i])path.push(point(i%NX,Math.floor(i/NX)));path.reverse();if(!blocked(b)&&distance(path.at(-1)||a,b)<.5)path.push({x:b.x,z:b.z});return path;
}
export class Household {
 constructor(seed=Date.now()%2147483647,saved=null,options={}){
  if(saved&&saved.version===4){Object.assign(this,structuredClone(saved));this.domain??=structuredClone(DOMAIN);this.rulesVersion??=1;this.reviews??=[];this.dayEvents??=[];this.reviewEpoch??=0;this.reviewApplying=false;for(const r of this.reviews)if(r.status==='thinking')r.status='pending';for(const p of this.people)p.meals??={};this.domain.perception??=structuredClone(DOMAIN.perception);this.domain.affect??=structuredClone(DOMAIN.affect);this.domain.actions.inspect??=structuredClone(DOMAIN.actions.inspect);this.initPerception();this.initConversations();this.upgradeLayout();if(options.calendar===false){this.calendar={enabled:false,startWeekday:0};for(const p of this.people){p.presence='home';if(p.action==='away')p.action='idle';}}if(options.director===false)this.director={enabled:false,history:[]};this.initCalendar();this.initSituations();this.initDirector();return;}
  this.calendar={enabled:options.calendar!==false,startWeekday:options.startWeekday||0};this.director={enabled:options.director!==false,history:[],scenario:options.scenario||null};this.version=4;this.domain=structuredClone(DOMAIN);this.rulesVersion=1;this.reviews=[];this.dayEvents=[];this.reviewEpoch=0;this.seed=seed>>>0;this.rng=this.seed;this.time=options.time??(16*60+30);this.day=1;this.seq=0;this.events=[];this.diary=[];this.requests=[];this.issues=[];
  this.home={food:2,ingredients:3,snacks:3,clean:57,money:240,tvOn:false,tvQuiet:false,deskClosed:false};this.leases={};
  this.people=CAST.map((c,index)=>({...c,index,hunger:45+this.random()*16,energy:65+this.random()*20,fun:35+this.random()*30,social:50+this.random()*30,
   meals:{},progress:0,action:'idle',task:null,goals:[],memories:[],relations:Object.fromEntries(CAST.filter(x=>x.id!==c.id).map(x=>[x.id,65])),cooldowns:{},grievances:{},promises:[],command:null,nextDecision:this.time+index*.7,moving:false,facing:0,thought:'先看看自己有什么打算。',alternatives:[],speech:null}));
  this.layoutVersion=LAYOUT_VERSION;this.initPerception();this.initConversations();this.initCalendar();this.initSituations();this.initDirector();for(const p of this.people)if(this.brain)this.dailyGoal(p);
  this.emit('start',null,`孩子们陆续放学，爸妈还在下班路上。今天有一件需要全家商量的事。`,[],null,false);
 }
 get actions(){return this.domain.actions;}
 routine(p){return routineAt(this.domain,this.time,p,this.calendarFor(p));}
 upgradeLayout(){
  for(const [id,a] of Object.entries(DOMAIN.actions))if(!this.domain.actions[id])this.domain.actions[id]=structuredClone(a);
  if(this.layoutVersion===LAYOUT_VERSION)return;
  for(const k of ['study','work'])this.domain.actions[k].resource=['own-desk'];
  this.domain.routine.attendance??=structuredClone(DOMAIN.routine.attendance);this.leases={};
  for(const p of this.people){p.x=SPOTS.delivery.x+(p.index-2)*.8;p.z=5.9;p.task=null;p.action='idle';p.suspendedTask=null;p.conversationId=null;p.moving=false;p.nextDecision=this.time;}
  for(const c of this.conversations)c.status='closed';this.layoutVersion=LAYOUT_VERSION;
 }
 random(){this.rng=(Math.imul(this.rng,1664525)+1013904223)>>>0;return this.rng/4294967296;}
 get minute(){return this.time%1440;}
 person(id){return this.people.find(p=>p.id===id);}
 save(){const state=structuredClone(Object.fromEntries(Object.entries(this).filter(([k])=>k!=='cognition')));if(this.brain)state.cognition=this.brain.snapshot();return state;}
 cool(p,k,delay){p.cooldowns[k]=this.time+delay;}
 ready(p,k){return (p.cooldowns[k]||0)<=this.time;}
 nearby(a,b,range=5){return distance(a,b)<=range;}
 // Acoustic visibility: bedroom wall dampens the TV, but an open door carries a loud set to the desk.
 hearsTV(p){return this.home.tvOn&&!this.home.tvQuiet&&senses(this,p,FURNITURE.tv).audible;}
 witness(p,actor,kind){if(p.id===actor.id)return true;if(['distraction','missedMeal','unavailable'].includes(kind))return false;const channel=senses(this,p,actor);return kind==='noise'?this.hearsTV(p):['request','refuse','cooperate','commitment','promise','brokenPromise','apology','correction','praise','resolution'].includes(kind)?channel.understood:channel.visible;}
 emit(type,actor,text,participants=[],cause=null,notice=true,extra={}){
  const e={id:++this.seq,time:this.time,day:this.day,type,actor:actor?.id||null,text,participants:[...new Set([actor?.id,...participants].filter(Boolean))],cause,action:actor?.action||'none',...extra};
  this.events.push(e);this.dayEvents.push(e);if(this.events.length>650)this.events.shift();
  e.observedBy=[];if(actor&&notice&&this.brain)for(const p of this.people)if((!extra.audience||extra.audience.includes(p.id))&&this.witness(p,actor,type)){
   e.observedBy.push(p.id);this.brain.observe(p.id,{...e,actor:type==='noise'&&p.id!==actor.id&&!senses(this,p,actor).visible?'television':e.actor,uid:'event-'+e.id,type:'event',kind:type,target:participants.find(x=>x!==actor.id)||'none',source:p.id===actor.id?'self':senses(this,p,actor).visible?'seen':'heard',...extra});this.syncMind(p);if(['refuse','cooperate','promise','brokenPromise','praise','apology','correction'].includes(type))this.appraiseSocial(p,e);
  }
  return e;
 }
 say(p,text){p.speech={text,until:this.time+10};}
 dailyGoal(p){const g=this.brain.initGoal(p.id,this.day,this.domain.goals[p.id]);p.goals=[{...g,carried:g.day<this.day}];p.progress=g.progress;}
 goal(p,kind){return p.goals.find(g=>g.kind===kind&&g.status==='active');}
 progressGoal(p,kind,amount){
  if(!amount)return;const previous=p.goals[0];const g=this.brain.progress(p.id,kind,amount);p.goals=[{...g,carried:g.day<this.day}];p.progress=g.progress;
  if(g.status==='done'&&previous?.status!=='done'){this.emit('achievement',p,`${p.name}完成了：${g.title}。`);if(kind==='work')this.home.money+=65;if(p.plan)this.preparePlan(p);}
 }
 flushProgress(p){if(p.task?.earned){const amount=p.task.earned;p.task.earned=0;this.progressGoal(p,this.actions[p.task.kind].goal||p.task.kind,amount);}}
 syncMind(p){p.memories=(this.brain.views[p.id]?.recent||[]).map(e=>({...e,id:e.uid}));}
 free(key,p){return !this.leases[key]||this.leases[key]===p.id;}
 destination(p,kind,target,perceived=false){
  const spec=this.actions[kind];if(!spec)return null;
  if(p.presence==='away')return null;
  if(spec.social){const t=this.person(target);return t?{...t,key:null,name:t.name}:null;}
  const keys=(spec.resource||[]).map(k=>k==='own-bed'?'bed'+(p.index+1):k==='own-desk'?OWN_DESK[p.id]:k==='own-gather'?'gather'+p.index:k);
  if(this.home.deskClosed&&keys.some(k=>k.startsWith('desk'))&&(!perceived||keys.some(key=>senses(this,p,SPOTS[key]).visible)))return null;
  const k=keys.find(x=>this.free(x,p)||perceived&&!senses(this,p,SPOTS[x]).visible);return k?{...SPOTS[k],key:k}:null;
 }
 can(p,kind){
  const spec=this.actions[kind];if(!spec)return false;
  if(spec.only&&!spec.only.includes(p.id)||spec.exclude?.includes(p.id))return false;
  for(const [path,amount] of Object.entries(spec.requires||{})){const [root,key]=path.split('.');if((root==='home'?this.home:p)[key]<amount)return false;}
  if(kind==='tidy'&&this.home.clean>=96)return false;return true;
 }
 stockEstimate(p,stock){const object=Object.values(this.objects).find(o=>o.stock===stock);const b=object&&this.known(p,object.id,'stock');return b&&typeof b.value==='number'?b.value:1;}
 believedCan(p,kind){const a=this.actions[kind];if(!a||a.only&&!a.only.includes(p.id)||a.exclude?.includes(p.id))return false;for(const [path,amount] of Object.entries(a.requires||{})){const [root,key]=path.split('.');const value=root==='home'&&['food','ingredients','snacks'].includes(key)?this.stockEstimate(p,key):(root==='home'?this.home:p)[key];if(value<amount)return false;}return !(kind==='tidy'&&this.home.clean>=96);}
 observeResources(p){for(const [path] of Object.entries({...this.actions[p.action]?.start,...this.actions[p.action]?.finish})){const [root,stock]=path.split('.');const o=Object.values(this.objects).find(o=>o.stock===stock);if(root==='home'&&o)this.senseValue(p,o.id,'stock',this.home[stock]);}for(const q of this.people)this.sense(q,true);}
 applyEffects(p,phase){for(const [path,amount] of Object.entries(this.actions[p.action]?.[phase]||{})){const [root,key]=path.split('.'),target=root==='home'?this.home:p;target[key]+=amount;if(root==='self'||key==='clean')target[key]=clamp(target[key]);}}
 attachBrain(brain){Object.defineProperty(this,'brain',{value:brain,writable:true,enumerable:false,configurable:true});
  if(this.cognition){brain.restore(this.cognition);delete this.cognition;}
  for(const p of this.people){if(!brain.ids.has(p.id))brain.create(p.id);this.dailyGoal(p);p.mental=structuredClone(brain.views[p.id].mind||p.mental||{});this.sense(p,true);this.syncMind(p);if(!Number.isFinite(p.nextDecision))p.nextDecision=this.time;}
  for(const s of this.incidents||[])this.loadSituationRules(s);
  return this;
 }
 facts(p,mode='act',request=null){
  const ongoing=mode==='response'&&!p.task&&p.suspendedTask?p.suspendedTask:{task:p.task,action:p.action};
  return {self:p.id,mode,scene:this.storyFacts(p),...this.calendarFor(p),busy:!!ongoing.task,manual:!!ongoing.task?.manual,'active-task':ongoing.action,'activity-purpose':this.actions[ongoing.action]?.satisfies||'none',
   hunger:p.hunger,energy:p.energy,fun:p.fun,social:p.social,food:this.stockEstimate(p,'food'),ingredients:this.stockEstimate(p,'ingredients'),clean:Math.round(this.home.clean/10)*10,
   affect:p.affect,seeking:p.seeking||'none','stock-unknown':!this.known(p,'pot','stock'),'ingredients-known':!!this.known(p,'pantry','stock'),
   'hunger-decay':this.domain.needs.hunger.decay,'energy-decay':this.domain.needs.energy.decay,'hunger-urgent':this.domain.needs.hunger.urgentBelow,'energy-urgent':this.domain.needs.energy.urgentBelow,
   time:this.time,minute:this.minute,day:this.day,project:this.domain.projects[p.id],'project-uid':`project-${p.id}-${this.day}`,
   ...this.routine(p),'departure-due':this.calendarFor(p)['departure-due']&&(!p.task||!['eat','cook'].includes(p.action)||this.minute>this.calendarFor(p).leave+5),'conversation-holding':this.conversationHolding(p),
   'hear-tv':this.hearsTV(p),'noise-minutes':p.task?.noise||0,'food-task':['eat','snack','cook','groceries'].includes(p.action),'rest-task':['sleep','rest'].includes(p.action),
   request:request?.kind||'none',from:request?.from||'none',contract:request?this.domain.contracts[request.kind]:{},
   observed:this.people.filter(q=>q.id!==p.id&&senses(this,p,q).visible).map(q=>({id:q.id,action:q.action,location:{x:q.x,z:q.z}}))
  };
 }
 affordances(p,mode='act',request=null){
  if(mode==='response')return (request.kind==='help'?['accept','decline','defer']:['accept','decline']).map((kind,i)=>({id:'a'+i,kind,target:request.from,ordinal:i}));
  const options=[];const add=(kind,target='none',extra={})=>{if(!this.believedCan(p,kind))return;const d=this.destination(p,kind,target==='none'?null:target,true);if(!d)return;options.push({kind,target,...extra});};
  for(const kind of Object.keys(this.actions).filter(k=>!this.actions[k].social)){
   if(kind==='inspect'||kind==='incident')continue;if(kind==='depart'&&!this.calendarFor(p)['departure-due'])continue;if(kind==='gatherScene'&&!this.storyFacts(p).ready)continue;if(kind==='prepareScene'&&!this.storyFacts(p).prepare)continue;if(this.actions[kind].goal==='work'&&p.id!=='dad')continue;if(kind==='study'&&p.id==='xiaoyu')continue;add(kind);
  }
  for(const q of this.people.filter(q=>q.id!==p.id&&q.action!=='sleep'&&senses(this,p,q).visible)){
   if(!p.conversationId&&this.ready(p,'chat'))add('chat',q.id);
   if(q.action==='watch'&&this.hearsTV(p)&&this.ready(p,'quiet'))add('askQuiet',q.id);
   if(this.home.clean<80&&!this.leases.clean&&this.ready(p,'help'))add('askHelp',q.id);
   if(this.stockEstimate(p,'food')>0&&this.routine(p)['meal-window']&&this.routine(q)['meal-due'])add('invite',q.id);
   if(p.affect.some(m=>m.subject===q.id&&m.coping==='repair'&&m.active>5)&&this.ready(p,'apologize'))add('apologize',q.id);
   add('praise',q.id);
  }
  for(const issue of this.issues.filter(i=>i.status==='open'&&!i.people.includes(p.id)&&i.people.some(id=>senses(this,p,this.person(id)).understood)&&p.memories.some(m=>m.uid==='event-'+i.event)))if(this.ready(p,'mediate'))add('mediate',issue.people[0],{issueId:issue.id,cause:'event-'+issue.event});
  if(!p.task||this.routine(p)['meal-due']&&!['inspect','eat'].includes(p.action)){
   const wanted=p.seeking,known=wanted?this.known(p,wanted,'location'):null;
   if(wanted){for(const spot of ['desk','clean','book','fridge'])if(!p.inspected[spot]||this.time-p.inspected[spot]>60)options.push({kind:'inspect',target:'none',spot,'last-known':known?.value===spot,'search-item':wanted,'inspection-reason':'search'});}
   if(!wanted&&((this.routine(p)['prep-window']||this.routine(p)['meal-window']||p.hunger<35)))for(const o of Object.values(this.objects).filter(o=>o.container&&(o.stock==='food'||o.stock==='ingredients'&&this.routine(p)['cook-duty']||o.stock==='snacks'&&p.hunger<35)))if((!this.known(p,o.id,'stock')||this.known(p,o.id,'stock').status==='disputed'||this.known(p,o.id,'stock').value===0)&&this.time-(p.inspected[o.location]||0)>20)options.push({kind:'inspect',target:'none',spot:o.location,'last-known':false,'search-item':'none','inspection-reason':this.known(p,o.id,'stock')?.value===0?'stale-empty':'missing-knowledge','known-age':this.time-(this.known(p,o.id,'stock')?.at||0)});
  }
  options.push(...this.incidentCandidates(p));
  if(p.task)options.push({kind:'continue',target:'none'});options.push({kind:'wait',target:'none'});
  return options.map((o,i)=>({...o,...this.describeCapability(p,o.kind,o.target),id:'a'+i,ordinal:i}));
 }
 describeCapability(p,kind,target='none'){
  const a=this.actions[kind];if(!a)return {minutes:0,'nutrition-gain':0,satisfies:'none',goal:'none','goal-rate':0,'fun-gain':0,'food-yield':0,'ingredient-yield':0,travel:0,wait:0,available:true};
  const dest=this.destination(p,kind,target==='none'?null:target,true),travel=dest?(route(p,dest)?.length||0)*.35/1.4:0;
  return {minutes:a.duration+travel,travel,wait:0,available:!!dest&&this.believedCan(p,kind),satisfies:a.satisfies||'none',goal:a.goal||'none','goal-rate':(a.rate||((a.progress||0)/a.duration))*(a.interference==='noise'&&dest&&this.hearsTV(dest)?13/28:1),'nutrition-gain':a.finish?.['self.hunger']||0,'fun-gain':a.finish?.['self.fun']||0,'food-yield':a.finish?.['home.food']||0,'ingredient-yield':a.finish?.['home.ingredients']||0};
 }
 capabilities(p,options){
  const all=options.filter(a=>this.actions[a.kind]).map(a=>({...a,consider:true}));
  for(const [kind,spec] of Object.entries(this.actions)){
   if(!spec.goal||options.some(a=>a.kind===kind)||!this.believedCan(p,kind))continue;
   const keys=(spec.resource||[]).map(k=>k==='own-bed'?'bed'+(p.index+1):k==='own-desk'?OWN_DESK[p.id]:k==='own-gather'?'gather'+p.index:k);if(this.home.deskClosed&&keys.some(k=>k.startsWith('desk')))continue;
   const occupied=keys.map(k=>({key:k,owner:this.people.find(q=>q.id===this.leases[k]&&senses(this,p,q).visible)})).filter(x=>x.owner?.task);
   if(occupied.length){occupied.sort((a,b)=>a.owner.task.remaining-b.owner.task.remaining);const o=occupied[0],dest=SPOTS[o.key];all.push({kind,...this.describeCapability(p,kind),travel:(route(p,dest)?.length||0)*.35/1.4,wait:this.actions[o.owner.action].duration/2+3,available:false,consider:this.actions[o.owner.action].duration/2+3<=this.domain.routine.maxResourceWait,ordinal:all.length});}
  }
  return all;
 }
 preparePlan(p,options=this.affordances(p)){
  const facts={...this.facts(p),capability:this.capabilities(p,options)};
  const planning=this.brain.plan(p.id,facts,options);p.plan=planning.plan;p.routine=this.routine(p);p.planning=planning;
  return {facts:{...facts,guidance:planning.guidance},planning,options};
 }
 decide(p){
  if(p.presence==='away')return;
  if(!this.brain)throw Error('Soar 内核未连接，模拟不能开始');
  this.sense(p);this.refreshAffect(p);this.flushProgress(p);
  const {options,facts,planning}=this.preparePlan(p),result=this.brain.decide(p.id,facts,options);
  if(!result.ok)throw Error(p.name+' 的 Soar 没有返回有效操作');
  const chosen=options.find(o=>o.id===result.id);if(!chosen)throw Error('Soar 选择了无效的行动');
  if(result.goal)p.goals=[{...result.goal,carried:result.goal.day<this.day}];
  p.promises=result.commitment?[{...result.commitment,id:result.commitment.uid,from:result.commitment.creditor,kind:result.commitment.action,done:false}]:[];
  if(result.breach){const pr=result.breach;this.brain.updateCommitment(p.id,pr.uid,'broken');this.brain.updateCommitment(pr.creditor,pr.uid,'broken');this.emit('brokenPromise',p,`${p.name}答应的事拖过了约定时间。`,[pr.creditor],pr.uid);this.rewardRequest(this.requests.find(r=>r.commitment===pr.uid),false,1);}
  p.decision={...result,facts,at:this.time};p.explanation=explainPlan(p,planning,result,this.domain);p.thought=p.explanation.reason;p.alternatives=p.explanation.alternatives;
  if(chosen.kind==='continue'&&p.task?.kind==='incident'){const a=this.incidents.find(c=>c.id===p.task.caseId)?.pack.actions.find(a=>a.id===p.task.token);if(a){p.thought=a.reason;p.explanation.reason=a.reason;}}
  const cause=[p.plan.uid,result.kind,p.explanation.basis].join(':');if(cause!==p.lastPlanCause){p.lastPlanCause=cause;this.emit('planStep',p,p.explanation.reason,[],null,false,{project:p.plan.uid,basis:p.explanation.basis,kind:result.kind,goal:planning.goal?.kind});}
  if(result.rule!==p.ruleHistory?.at(-1)?.rule){p.ruleHistory=[...(p.ruleHistory||[]),{rule:result.rule,at:this.time,kind:result.kind,revision:result.revision}].slice(-16);}
  if(chosen.kind!=='continue'&&chosen.kind!=='wait'&&!(p.task?.kind===chosen.kind&&p.task?.target===(chosen.target==='none'?null:chosen.target))){
   const promise=p.promises.find(pr=>!pr.done&&pr.kind===chosen.kind);
   this.start(p,{...chosen,target:chosen.target==='none'?null:chosen.target,why:p.explanation.reason,promiseId:promise?.id});
  }else if(!p.task)p.thought=p.explanation.reason;
  p.nextDecision=this.time+2;
 }

 release(p){this.flushProgress(p);if(p.task?.resource&&this.leases[p.task.resource]===p.id)delete this.leases[p.task.resource];if(p.action==='watch'||p.task?.device==='tv'){this.home.tvOn=false;}p.task=null;p.moving=false;p.action='idle';}
 start(p,c,manual=false){
  if(c.kind==='incident')return this.startIncident(p,c);
  if(c.kind==='chat'||socialActions[c.kind]){
   const topic=socialActions[c.kind]?{kind:'request',domain:socialActions[c.kind],label:this.actions[c.kind].label}:undefined;
   return this.openConversation(p.id,[c.target],{topic}).ok;
  }
  if(p.presence==='away')return false;
  if(!this.believedCan(p,c.kind)&&!manual)return false;const d=c.spot?{...SPOTS[c.spot],key:c.spot}:this.destination(p,c.kind,c.target,true);if(!d)return false;const path=route(p,d);if(!path)return false;
  if(p.conversationId&&(manual||this.actions[c.kind]?.conversation!=='parallel'))this.leaveConversation(p.id,'有另一件事需要先做',{resume:manual});
  if(manual)p.suspendedTask=null;
  this.release(p);const reserved=d.key&&c.kind!=='inspect'&&this.free(d.key,p)&&!(d.key?.startsWith('desk')&&this.home.deskClosed);if(reserved)this.leases[d.key]=p.id;
  p.action=c.kind;p.thought=c.why;p.task={kind:c.kind,target:c.target||null,resource:reserved?d.key:null,location:d.key,unreserved:!!d.key&&c.kind!=='inspect'&&!reserved,phase:'walking',path,remaining:this.actions[c.kind].duration,started:this.time,episode:['gatherScene','prepareScene'].includes(c.kind)?this.episode?.id:null,project:p.plan?.uid,planBasis:p.explanation?.basis,startedBecause:p.explanation?.reason,speechAct:p.decision?.['speech-act'],topic:p.decision?.topic,manual,issueId:c.issueId,promiseId:c.promiseId,noise:0};p.moving=true;p.task.rule=manual?'player-command':p.decision?.rule;
  this.emit('action',p,`${p.name}打算${this.actions[c.kind].label}${c.target?'：找'+this.person(c.target).name:''}。`,[],null,false);
  return true;
 }

 command(id,kind,target=null){const p=this.person(id);if(!p||p.presence==='away'||!this.actions[kind])return {ok:false,text:'这件事现在做不了。'};
  if(kind==='chat'||socialActions[kind]){const topic=socialActions[kind]?{kind:'request',domain:socialActions[kind],label:this.actions[kind].label}:undefined;return this.openConversation(id,[target],{topic});}
  if((kind==='study'||kind==='work')&&this.home.deskClosed)return {ok:false,text:'书桌暂时不能用，先把桌面腾出来。'};
  if(!this.can(p,kind))return {ok:false,text:kind==='cook'?'食材不够了。':kind==='eat'?'没有现成饭，得先做饭。':kind==='snack'?'零食已经吃完了。':'现在还不能这样做。'};
  const ok=this.start(p,{kind,target,why:'你安排了这件事。做完后，我会继续自己的打算。'},true);
  if(ok)this.emit('player',p,`你让${p.name}${this.actions[kind].label}${target?'，对象是'+this.person(target).name:''}。`);
  return {ok,text:ok?`${p.name}会去${this.actions[kind].label}。`:'那里正有人用，稍后再试。'};
 }
 commandAt(id,kind,location){
  const p=this.person(id),spot=SPOTS[location],a=this.actions[kind];if(!p||p.presence==='away'||!spot||!a)return {ok:false,text:'现在无法使用这里。'};
  if(spot.owner&&spot.owner!==id)return {ok:false,text:`这是${this.person(spot.owner).name}的家具，请使用自己的床或书桌。`};
  const keys=a.resource?.map(k=>k==='own-bed'?'bed'+(p.index+1):k==='own-desk'?OWN_DESK[id]:k)||[];
  if(location.startsWith('desk')&&this.home.deskClosed)return {ok:false,text:'桌面暂时不能用。'};
  if(!keys.includes(location)||!this.can(p,kind)||!this.free(location,p))return {ok:false,text:'这个位置现在不能完成这项行动。'};
  const ok=this.start(p,{kind,spot:location,why:`你安排我使用${spot.name}。`},true);return {ok,text:ok?`${p.name}会走到${spot.name}再开始。`:'走不到这个位置。'};
 }
 ask(from,to,kind,cause=null,conversation=null){
  if(this.requests.some(r=>r.from===from.id&&r.to===to.id&&r.kind===kind&&r.status==='pending'))return;
  const audience=conversation?Object.values(this.conversation(conversation).members).filter(m=>m.status==='active').map(m=>m.id):undefined;
  const e=this.emit('request',from,`${from.name}向${to.name}${kind==='quiet'?'提出：电视能不能小声一点':kind==='help'?'提出：帮忙收拾一下':kind==='meal'?'招呼：来吃饭吧':kind==='apology'?'表达：刚才话说急了，想和好':'提议：先别争了，互相让一点'}。`,[to.id],cause,true,{audience});
  this.requests.push({id:e.id,from:from.id,to:to.id,kind,status:'pending',at:this.time,due:conversation?null:this.time+1.2,cause,conversation});
  this.say(from,kind==='quiet'?(from.id==='xue'?'这边还在复习，声音能小一点吗？':'电视能调小一点吗？脑子都跟着跑了。'):kind==='help'?(from.id==='me'?'谁搭把手？这家又不是我一个人的。':'手头不忙的话，帮着收拾一下吧。'):kind==='meal'?'饭好了，饿了就过来吃。':kind==='apology'?'刚才我也不是非要顶着来，话说急了。':'都是一家人，先听听对方想做什么。');
 }
 resolveRequest(r){
  const from=this.person(r.from),p=this.person(r.to);r.status='resolved';
  if(!from||!p)return;
  if(p.action==='sleep'||!senses(this,p,from).understood){r.result='missed';this.emit('missed',from,`${p.name}${p.action==='sleep'?'已经睡了':'走远了'}，这次没接上话。`,[],r.id);return;}
  if(r.kind==='quiet'&&(p.action!=='watch'||this.home.tvQuiet)){r.result='obsolete';this.say(p,'我已经没看了。');return;}
  if(r.kind==='help'&&this.home.clean>=80){r.result='obsolete';this.say(p,'已经收拾好了呀。');return;}
  const relation=p.relations[from.id]??65;
  const decision=this.brain.decide(p.id,this.facts(p,'response',r),this.affordances(p,'response',r));
  if(!decision.ok||!['accept','decline','defer'].includes(decision.kind))throw Error('Soar 没有返回有效的社交回应');
  r.soar=decision;p.lastResponse={...decision,id:r.id,from:from.id,request:r.kind,at:this.time};p.responseHistory=[...(p.responseHistory||[]),p.lastResponse].slice(-40);p.decision={...decision,facts:this.facts(p,'response',r),at:this.time};
  const accept=decision.kind==='accept',deferred=decision.kind==='defer',kept=deferred||!accept||!['help','meal'].includes(r.kind);
  const ongoingTask=p.task||p.suspendedTask?.task,ongoingAction=p.task?p.action:p.suspendedTask?.action||p.action;
  r.learning={decision,taskStarted:ongoingTask?.started,taskKind:ongoingAction,keptInitially:kept,finishedOriginal:!ongoingTask,status:'waiting'};
  if(deferred){r.result='deferred';this.say(p,'先让我做完手里的事，等会儿一定来。');const deadline=this.time+80;const e=this.emit('commitment',p,`${p.name}答应稍后帮${from.name}收拾。`,[from.id],r.id,true,{action:'tidy',deadline});r.commitment='event-'+e.id;return;}

  r.result=accept?'accepted':'declined';
  const activeLabel=this.actions[ongoingAction]?.label||'自己的安排';
  const text=accept?(r.kind==='quiet'?'好，我把声音调小。':r.kind==='help'?'好，我来帮忙收拾。':r.kind==='meal'?'好，我去吃饭。':'愿意，我们把这件事说开。'):`我想先${activeLabel}。${decision['goal-threat']==='yes'?'现在答应会打断这件事。':'这次先不答应。'}`;
  this.say(p,text);const e=this.emit(accept?'cooperate':'refuse',p,`${p.name}${accept?'接受':'拒绝了'}${from.name}的${r.kind==='quiet'?'小声一点':r.kind==='help'?'帮忙':r.kind==='meal'?'吃饭邀请':r.kind==='apology'?'和好':'劝和'}请求。`,[from.id],r.id,true,{domain:r.kind,explanation:decision['goal-threat']===true||decision['goal-threat']==='yes'?'constrained':'unknown'});
  if(accept){
   if(r.kind==='quiet'){this.home.tvQuiet=true;this.settleIssues(from.id,p.id,'电视已经调小，学习与休息都能继续。');}
   if(r.kind==='help'){this.emit('commitment',p,`${p.name}答应帮${from.name}收拾。`,[from.id],e.id,true,{action:'tidy',deadline:this.time+this.domain.contracts.help.deadlineMinutes});r.commitment='event-'+this.seq;p.nextDecision=this.time;}
   if(r.kind==='meal'&&this.home.food>0)this.start(p,{kind:'eat',why:`${from.name}叫我吃饭，正好也饿了。`});
   if(r.kind==='apology'){p.grievances[from.id]=0;this.settleIssues(from.id,p.id,`${from.name}主动和好，${p.name}愿意把话说开。`);}
   if(r.kind==='mediate'){p.grievances[from.id]=0;const issue=this.issues.find(i=>i.id===r.cause);if(issue){issue.concessions=[...new Set([...(issue.concessions||[]),p.id])];if(p.action==='watch')this.home.tvQuiet=true;if(issue.concessions.length>=2){issue.status='resolved';this.emit('resolution',p,'双方愿意缓和一下，各自继续手头的事。',issue.people,issue.event);}}}
  }else if(r.kind!=='meal'){
   from.grievances[p.id]=(from.grievances[p.id]||0)+1;
   let issue=this.issues.find(i=>i.status==='open'&&i.kind===r.kind&&i.people.includes(from.id)&&i.people.includes(p.id));
   if(!issue){issue={id:e.id,event:e.id,people:[from.id,p.id],kind:r.kind,status:'open',at:this.time,concessions:[]};this.issues.push(issue);}
   this.cool(from,r.kind==='quiet'?'quiet':'help',70);this.cool(p,'apologize',45);
  }
  if(r.kind!=='help'||!accept)this.rewardRequest(r,accept,!accept&&r.kind!=='meal'?1:0);
 }
 rewardRequest(r,satisfied,cost){
  if(!r?.learning||r.learning.status!=='waiting')return;const l=r.learning;
  const kept=l.keptInitially&&(r.commitment?l.finishedOriginal:true);
  this.brain.feedback(r.to,l.decision,{'outcome-id':'request-'+r.id,'kept-activity':kept?1:0,'request-satisfied':satisfied?1:0,'social-cost':cost});l.status='consumed';
 }
 settleIssues(a,b,text){for(const i of this.issues.filter(i=>i.status==='open'&&i.people.includes(a)&&i.people.includes(b))){i.status='resolved';this.emit('resolution',this.person(a),text,[b],i.event);for(const id of i.people){const p=this.person(id);p.grievances[id===a?b:a]=0;}}}
 beginDoing(p){
  if(p.task?.resuming){const t=p.task;t.phase=t.resumePhase||'doing';delete t.resuming;delete t.resumePhase;p.moving=false;return;}
  const t=p.task;if(t.unreserved){if(!this.free(t.location,p)||t.location?.startsWith('desk')&&this.home.deskClosed){this.emit('unavailable',p,`${p.name}到了才看见这里暂时不能用。`);this.release(p);return;}t.resource=t.location;this.leases[t.resource]=p.id;t.unreserved=false;}if(!this.can(p,t.kind)){for(const o of Object.values(this.objects).filter(o=>o.container))if(Object.keys(this.actions[t.kind].requires||{}).includes('home.'+o.stock))this.senseValue(p,o.id,'stock',this.home[o.stock]);this.emit('unavailable',p,`${p.name}到地方才发现，${t.kind==='eat'?'饭被吃完了':t.kind==='snack'?'零食没了':'条件已经变了'}，得换个办法。`);this.release(p);return;}
  t.phase='doing';p.moving=false;if(t.device==='tv'){this.home.tvOn=true;this.emit('noise',p,p.name+'打开了电视。');}
  const rhythm=this.routine(p);if(t.kind==='eat'&&rhythm['meal-window']){p.meals[rhythm['meal-id']]=this.day;t.mealId=rhythm['meal-id'];}
  if(t.kind==='prepareScene')t.remaining=this.episode.small?8:this.episode.effort;
  if(t.kind==='sleep'&&rhythm.night)t.remaining=Math.max(1,rhythm['wake-at']-this.time);
  this.emit('taskStarted',p,`${p.name}开始${this.actions[t.kind].label}。`,[],null,false,{task:t.kind,meal:t.mealId||null,project:p.plan?.uid,why:t.manual?'player-command':t.planBasis,rule:t.rule});
  if(SPOTS[t.location]?.pose)p.facing=SPOTS[t.location].pose.facing;
  if(t.resource?.startsWith('dining'))p.facing=Math.atan2(3.42-p.x,1.87-p.z);
  if(t.resource==='tv')p.facing=Math.atan2(-6.37-p.x,4.12-p.z);
  if(t.target){const q=this.person(t.target);if(q)p.facing=Math.atan2(q.x-p.x,q.z-p.z);}
  this.applyEffects(p,'start');this.observeResources(p);
  if(t.kind==='watch'){this.home.tvOn=true;this.emit('noise',p,`${p.name}打开了电视，声音传到附近。`);}

 }
 finish(p){
  if(p.task.kind==='incident'){this.finishIncident(p);return;}
  const t=p.task,k=t.kind;if(k==='depart'){this.leaveForDay(p);return;}if(k==='gatherScene')this.sceneGathered(p);if(k==='prepareScene')this.scenePrepared(p);for(const r of this.requests)if(r.to===p.id&&r.learning?.taskStarted===t.started&&r.learning.taskKind===k)r.learning.finishedOriginal=true;this.flushProgress(p);this.applyEffects(p,'finish');this.observeResources(p);const target=this.person(t.target);let text='';if(this.actions[k].progress)this.progressGoal(p,this.actions[k].goal||k,this.actions[k].progress);
  if(k==='inspect'){this.inspectLocation(p,t.location);text=`${p.name}查看了物品和储备。`;}
  if(k==='eat'){text=`${p.name}吃完饭，把餐具留在桌边。`;}
  if(k==='snack'){text=`${p.name}吃了一份零食，还剩 ${this.home.snacks} 份。`;}
  if(k==='cook'){text=`${p.name}做好了一锅饭，家里有 ${this.home.food} 份热饭了。`;this.say(p,p.id==='me'?'饭好了，别等凉了才想起来吃。':'今天这锅，闻着还不错。');
   for(const q of this.people.filter(q=>q!==p&&senses(this,q,p).understood))this.tell(p.id,q.id,{subject:'pot',predicate:'stock',value:this.home.food,root:`cooked-${p.id}-${t.started}`});
   if(this.routine(p)['meal-window'])for(const q of this.people.filter(q=>q.id!==p.id&&this.routine(q)['meal-due']&&this.nearby(q,p,6)))this.ask(p,q,'meal');
  }
  if(this.actions[k].goal==='study'||this.actions[k].goal==='work'){
   if(t.noise>6)this.emit('distraction',p,`${p.name}亲身体会到电视声会拖慢进度。`);text=`${p.name}${this.actions[k].goal==='work'?'写了一段稿子':'做完一段学习'}${t.noise>6?'，被电视声分了心，进度慢了一些':''}。`;
  }
  if(k==='tidy'){text=`${p.name}把桌边和地面收拾干净了一些。`;}
  if(k==='watch'){text=`${p.name}看了一会儿电视，放松下来。`;}
  if(k==='read'){text=`${p.name}翻了会儿书。`;}
  if(k==='play'){text=`${p.name}玩了一阵，玩具散在脚边。`;}
  if(k==='rest'){text=`${p.name}歇过来了，继续自己的事。`;}
  if(k==='sleep'){text=`${p.name}醒来了。`;}
  if(k==='groceries'){text=`${p.name}收到了食材和零食，花了 30 元。`;}
  if(k==='chat'&&target){
   // Migrate a legacy saved single-person chat task into the shared protocol.
   const topic=t.speechAct==='ask-reason'?{kind:'reason',domain:t.topic,label:'把刚才的事问清楚'}:this.topicSpec(null,p);
   this.release(p);this.openConversation(p.id,[target.id],{topic});text=`${p.name}想和${target.name}接着说说话。`;
  }
  if(k==='askQuiet'&&target){this.ask(p,target,'quiet');this.cool(p,'quiet',60);}
  if(k==='askHelp'&&target){this.ask(p,target,'help');this.cool(p,'help',90);}
  if(k==='invite'&&target)this.ask(p,target,'meal');
  if(k==='mediate'){const issue=this.issues.find(i=>i.id===t.issueId)||this.issues.find(i=>i.status==='open'&&i.people.includes(t.target));if(issue){for(const id of issue.people){const q=this.person(id);if(this.nearby(p,q,6))this.ask(p,q,'mediate',issue.id);}this.cool(p,'mediate',90);}}
  if(k==='apologize'&&target&&this.nearby(p,target,3)){this.ask(p,target,'apology');this.cool(p,'apologize',100);}
  if(k==='praise'&&target&&this.nearby(p,target,3)){this.emit('praise',p,`${p.name}表达了欣赏。`,[target.id],null,true,{domain:'care'});target.social=clamp(target.social+10);this.say(p,'这件事做得不错，我看见了。');text=`${p.name}夸了${target.name}一句。`;}
  if(!text&&!this.actions[k].social)text=`${p.name}完成了${this.actions[k].label}。`;
  if(text)this.emit(['eat','snack','read','rest','sleep','watch','play'].includes(k)?'daily':'result',p,text,target?[target.id]:[]);
  for(let n=0;n<12;n++){const settled=this.brain.completeAction(p.id,k);if(!settled.commitment)break;const pr=settled.commitment;this.brain.updateCommitment(pr.creditor,pr.uid,'fulfilled');this.rewardRequest(this.requests.find(r=>r.commitment===pr.uid),true,0);const owner=this.person(pr.creditor);this.emit('promise',p,`${p.name}做完了答应${owner.name}的事。`,[owner.id],pr.uid);}
  this.emit('taskCompleted',p,`${p.name}完成${this.actions[k].label}。`,[],null,false,{task:k,meal:t.mealId||null,project:p.plan?.uid});
  this.release(p);p.nextDecision=this.time+1;
 }
 tickTask(p,dt){
  const t=p.task;if(!t)return;
  if(t.phase==='walking'){
   if(t.target){const actual=this.person(t.target);const visible=actual&&senses(this,p,actual).visible;const q=visible?actual:p.knownPeople[t.target];if(!q||visible&&q.action==='sleep'){this.release(p);this.cool(p,'chat',15);return;}if(distance(p,q)<1.2){if(!visible){this.emit('missed',p,`${p.name}到了上次看见对方的地方，却没找到人。`);this.release(p);return;}t.path=[];}else if(!t.path.length||this.time-(t.reroute||0)>4){t.path=route(p,q)||[];t.reroute=this.time;}if(this.time-t.started>30){this.emit('missed',p,`${p.name}没等到说话的机会，先回去忙自己的事。`);this.release(p);return;}}
   let travel=dt*1.4;
   while(t.path.length&&travel>0){const q=t.path[0],d=distance(p,q);p.facing=Math.atan2(q.x-p.x,q.z-p.z);if(d<=travel){p.x=q.x;p.z=q.z;t.path.shift();travel-=d;}else{p.x+=(q.x-p.x)*travel/d;p.z+=(q.z-p.z)*travel/d;travel=0;}}
   p.moving=t.path.length>0;if(!p.moving)this.beginDoing(p);
  }else{
   t.remaining-=dt;if(this.actions[t.kind].rate)t.earned=(t.earned||0)+dt*this.actions[t.kind].rate*(this.actions[t.kind].interference==='noise'&&this.hearsTV(p)?13/28:1);if(this.actions[t.kind].interference==='noise'&&this.hearsTV(p)){t.noise+=dt;}
   if(t.remaining<=0)this.finish(p);
  }
 }
 tick(dt=.25){
  if(this.reviewApplying)return;
  const previousMinute=this.minute;this.time+=dt;const d=Math.floor(this.time/1440)+1;
  if(d>this.day){if(this.brain){this.reviews.push({report:buildDayReport(this),status:'pending'});if(this.reviews.length>14)this.reviews.shift();}this.finishEpisodeDay();this.dayEvents=[];const rows=this.events.filter(e=>e.day===this.day&&['achievement','refuse','cooperate','resolution','promise','player'].includes(e.type));this.diary.push({day:this.day,events:rows.slice(-14)});if(this.diary.length>30)this.diary.shift();this.day=d;if(this.director?.enabled)this.beginEpisode();for(const p of this.people)if(this.brain)this.dailyGoal(p);this.emit('newDay',null,`第 ${this.day} 天开始了，关系、记忆和没做完的约定都还在。`,[],null,false);}
  for(const [slot,meal] of Object.entries(this.domain.routine.meals))if(previousMinute<meal.end&&this.minute>=meal.end)for(const p of this.people)if(p.presence!=='away'&&p.meals[slot]!==this.day)this.emit('missedMeal',p,`${p.name}错过了${meal.title}时段，当时在${this.actions[p.action]?.label||'等待'}。`,[],null,true,{slot,task:p.action,food:this.stockEstimate(p,'food'),project:p.plan?.uid});
  for(const r of this.requests.filter(r=>r.status==='pending'&&!r.conversation&&r.due<=this.time))this.resolveRequest(r);
  this.requests=this.requests.filter(r=>r.status==='pending'||r.learning?.status==='waiting'||r.at>this.time-120);
  for(const p of this.people){
   if(p.presence==='away'){this.tickAway(p,dt);continue;}
   const sleeping=p.action==='sleep';for(const [need,spec] of Object.entries(this.domain.needs))p[need]=clamp(p[need]-dt*(sleeping?spec.sleepDecay:spec.decay));
   if(p.speech&&p.speech.until<this.time)p.speech=null;
   if(p.task){
    // An intention is interruptible for an emergency, not discarded every scoring cycle.
    this.tickTask(p,dt);
   }
   if(!p.task&&!p.conversationId)for(const c of this.conversations.filter(c=>c.status!=='closed'&&c.members[p.id]?.status==='deferred'))this.resolveConversationInvite(c,p);
   const rhythm=this.routine(p),needsBreak=p.hunger<this.domain.needs.hunger.urgentBelow||p.energy<this.domain.needs.energy.urgentBelow||rhythm.night||rhythm['meal-window']&&rhythm['meal-due'];
   if(this.time>=p.nextDecision&&(!p.suspendedTask||!p.conversationId&&needsBreak))this.decide(p);
  }
  this.tickDirector();
  this.tickConversations(dt);
  this.home.clean=clamp(this.home.clean-dt*.012);

  this.issues=this.issues.filter(i=>i.status==='open'||i.at>this.time-2880);
  // The practical problem can end without an apology. Relationships retain the history.
  for(const i of this.issues.filter(i=>i.status==='open'))if((i.kind==='quiet'&&(!this.home.tvOn||this.home.tvQuiet))||(i.kind==='help'&&this.home.clean>80)){i.status='cooled';this.emit('cooled',null,i.kind==='quiet'?'电视声停下来了，刚才的不快还留在各自心里。':'家务已经有人做完，刚才的拒绝没有被抹掉。',i.people,i.event,false);}
 }
 advance(minutes){for(let t=0;t<minutes;t+=.25)this.tick(Math.min(.25,minutes-t));}
 environment(kind){
  if(kind==='screen'){this.space.screenClosed=!this.space.screenClosed;this.emit('environment',null,`你${this.space.screenClosed?'拉上':'拉开'}了卧室隔音帘。`,[],null,false);return;}
  if(kind==='quiet'){this.home.tvQuiet=!this.home.tvQuiet;this.emit('environment',null,`你把电视调成了${this.home.tvQuiet?'静音':'有声音'}。`,[],null,false);return;}
  if(kind==='desk'){this.home.deskClosed=!this.home.deskClosed;if(this.home.deskClosed){for(const p of this.people.filter(p=>p.task?.resource?.startsWith('desk')))this.release(p);}this.emit('environment',null,`你${this.home.deskClosed?'占用了':'腾出了'}书桌。`,[],null,false);return;}
  if(kind==='food'&&this.home.money>=30){this.home.money-=30;this.home.food+=5;this.emit('environment',null,'你花 30 元添了五份现成饭。',[],null,false);}
 }
}

installSituations(Household,route);
installCalendar(Household);
installDirector(Household);
installPerception(Household,SPOTS);
installConversations(Household,route,SPOTS);
