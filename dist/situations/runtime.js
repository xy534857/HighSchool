import {SITUATIONS} from './catalog.js';
import {compileSituation,validateSituation,situationBinding,ACTORS} from './schema.js';
import {SPOTS} from '../layout.js';
import {senses} from '../perception.js';
const copy=x=>structuredClone(x),clamp=x=>Math.max(0,Math.min(100,x));
export const situationById=id=>SITUATIONS.find(p=>p.id===id);
export function situationPlan(house,previous){
 const requested=house.director.scenario,unfinished=previous?.caseId&&previous.status!=='completed',prior=house.incidents?.find(s=>s.id===previous?.caseId);
 const next=previous?SITUATIONS[(SITUATIONS.findIndex(s=>s.id===previous.template)+1)%SITUATIONS.length]:situationById(requested)||SITUATIONS[0];
 const pack=unfinished&&prior?prior.pack:next,weekend=house.calendarFor(house.people[0]).weekend;
 return {continuation:unfinished?previous.caseId:null,schemaVersion:1,id:`episode-${house.day}`,day:house.day,template:pack.id,situation:copy(pack),title:pack.title,premise:pack.premise,lead:pack.actions[0].actor,roles:copy(pack.roles),effort:8,meet:weekend?600:1160,finale:1230,deadline:1275,origin:'ChatGPT 编写情景与 Soar 规则 · 人物自主执行',basedOn:previous?.day||null,evidence:previous?.evidence||[]};
}
export function situationResult(house,episode=house.episode){
 const s=house.incidents?.find(c=>c.id===episode.caseId);if(!s)return null;
 const events=s.events,completed=s.pack.endState?s.pack.endState.every(g=>s.objects.find(o=>o.id===g.object)?.[g.property]===g.value):(s.pack.endAny||[s.pack.end]).some(group=>group.every(id=>events.some(e=>e.token===id)));
 const actors=[...new Set(events.map(e=>e.actor))],summary=events.length?events.slice(-3).map(e=>e.text).join(' '):'家人还没有开始处理这件事';
 return {day:episode.day,title:episode.title,template:episode.template,status:completed?'completed':events.length?'partial':'unresolved',summary,prepared:[],performed:actors,declined:[],positions:{},revised:events.some(e=>e.effects?.some(x=>x.op==='policy')),evidence:events.filter(e=>e.day===episode.day).map(e=>e.id),caseId:s.id,events:copy(events),openThreads:copy(s.debts.filter(d=>!d.paid)),followup:s.pack.followup};
}
export function installSituations(Household,route){Object.assign(Household.prototype,{
 initSituations(){
  this.incidents??=[];this.storyEconomy??={wallets:{dad:50,me:50,xue:12,xing:8,xiaoyu:2},policies:{'chore-quality':1,'pay-for-reports':true,'night-light':false},ledger:[]};
  this.domain.actions.incident??={label:'处理自己惦记的事',duration:1,resource:['own-desk'],conversation:'pause'};
 },
 beginSituation(episode){
  this.initSituations();if(episode.continuation){const previous=this.incidents.find(s=>s.id===episode.continuation);if(previous){episode.caseId=previous.id;episode.briefed=[];return;}}const pack=validateSituation(copy(episode.situation||situationById(episode.template)));
  const s={id:`case-${episode.day}-${pack.id}`,pack,day:episode.day,events:[],debts:[],objects:copy(pack.objects),briefed:[],work:{},done:{},attempts:{},started:this.time};
  episode.caseId=s.id;episode.situation=pack;this.incidents=this.incidents.filter(c=>c.day!==episode.day||c.briefed.length);this.incidents.push(s);
  // Completed cases no longer occupy active decision frames, but their native
  // memories, financial ledger and daily reports remain in the save.
  this.incidents=this.incidents.filter(x=>this.day-x.day<8||x.debts.some(d=>!d.paid));
  if(this.brain)this.loadSituationRules(s);
 },
 loadSituationRules(s){
  const source=compileSituation(s.pack);for(const p of this.people)this.brain.loadNative(this.brain.ids.get(p.id),source);
 },
 async installSituationPackage(pack){
  validateSituation(pack);if(this.episode.briefed.length)throw Error('已发生的情景不能被新包改写');
  for(const a of pack.actions){if(a.mode==='physical'&&!SPOTS[a.spot])throw Error('未知物品交互位置');for(const e of a.effects)if(e.op==='move'&&!SPOTS[e.to])throw Error('未知物品移动目的地');}for(const o of pack.objects)if(!SPOTS[o.location])throw Error('未知物品初始位置');
  const source=compileSituation(pack),v=this.brain.native.createAgent('situation-validation');
  try{this.brain.loadNative(v,this.brain.base);this.brain.loadNative(v,source);}finally{this.brain.native.destroyAgent(v);}
  this.episode.situation=copy(pack);this.episode.template=pack.id;this.episode.title=pack.title;this.episode.premise=pack.premise;this.episode.roles=copy(pack.roles);
  this.incidents=this.incidents.filter(s=>s.id!==this.episode.caseId);this.beginSituation(this.episode);
 },
 incidentRemember(s,p,key,value,source='self',root=null,speaker=p.id){
  if(s.pack.carry?.includes(key))this.perceive(p,'habit-'+s.pack.id,key,value,{source,root:root||`${s.id}-carry-${key}-${this.time}`,speaker,domain:'situation'});
  this.perceive(p,s.id,key,value,{source,root:root||`${s.id}-${p.id}-${key}-${this.time}`,speaker,domain:'situation'});
 },
 incidentBeliefs(s,p){
  const b={};for(const [key,value] of Object.entries(s.pack.facts)){const r=this.known(p,s.id,key)||(s.pack.carry?.includes(key)?this.known(p,'habit-'+s.pack.id,key):null);b[key]=r&&r.status!=='unknown'&&r.status!=='disputed'?(r.value==='yes'?true:r.value==='no'?false:r.value):value;}
  b.cash=this.storyEconomy.wallets[p.id];b.energy=p.energy;b['goal-left']=Math.max(0,(p.goals[0]?.target||0)-(p.goals[0]?.progress||0));
  if('fear' in b){const r=this.known(p,s.id,'fear');b.fear=Math.max(0,Number(r?.value||0)-(this.time-(r?.at||this.time))*.045);}

  return b;
 },
 incidentGuard(s,p,a){const b=this.incidentBeliefs(s,p);return (a.when||[]).every(([k,op,v])=>op==='eq'?b[k]===v:op==='ne'?b[k]!==v:op==='gt'?b[k]>v:b[k]<v);},
 incidentCandidates(p,conversation=null){
  const options=[];if(!this.director?.enabled||p.presence==='away'||this.routine(p).night)return options;
  if(!conversation&&(p.conversationId||p.task))return options;
  for(const s of this.incidents||[]){
   if(!s.briefed.includes(p.id)||conversation&&conversation.topic.caseId!==s.id)continue;
   for(const a of s.pack.actions.filter(a=>a.actor===p.id)){
    if(conversation&&a.mode!=='talk')continue;
    const target=a.target&&this.person(a.target);
    if(target&&(target.presence==='away'||target.action==='sleep'))continue;
    if(conversation&&(!conversation.members[a.target]||conversation.members[a.target].status!=='active'||!senses(this,p,target).understood))continue;
    if(!conversation&&target&&(!senses(this,p,target).visible&&!p.knownPeople[target.id]||target.conversationId))continue;
    if(!conversation&&(s.attempts[p.id+':'+a.id]||0)>this.time)continue;
    const stamp=a.repeatWork?Number(this.known(p,s.id,'submitted-'+a.repeatWork)?.value||0):1;
    const done=Number(this.known(p,s.id,'done-'+a.id)?.value||0)===stamp;
    if(done)continue;
    if(a.effects?.some(e=>e.op==='transfer'&&(e.from==='family'?this.home.money:this.storyEconomy.wallets[e.from])<e.amount))continue;
    if(a.effects?.some(e=>e.op==='inspect-work'&&!s.work[e.actor]))continue;
    if(a.mode==='physical'&&!SPOTS[a.spot])continue;
    options.push({kind:conversation?'incident-turn':'incident',pack:situationBinding(s.pack),caseId:s.id,token:a.id,target:a.target||'none',done,belief:this.incidentBeliefs(s,p),label:a.label,minutes:a.minutes,available:true,goal:'none',satisfies:'none',stamp});
   }
  }return options;
 },
 startIncident(p,c){
  const s=this.incidents.find(s=>s.id===c.caseId),a=s?.pack.actions.find(a=>a.id===c.token);if(!a||!this.incidentGuard(s,p,a))return false;
  const carried=a.effects.find(e=>e.op==='move'&&s.objects.find(o=>o.id===e.object)?.carrier===p.id),source=carried?carried.to:a.spot;
  const dest=a.target?(senses(this,p,this.person(a.target)).visible?this.person(a.target):p.knownPeople[a.target]):SPOTS[source];
  const path=dest&&route(p,dest);if(!path)return false;
  if(a.mode==='physical'&&!this.free(a.spot,p)){s.attempts[p.id+':'+a.id]=this.time+5;return false;}
  this.release(p);if(a.mode==='physical')this.leases[a.spot]=p.id;
  p.action='incident';p.thought=a.reason;p.explanation={...p.explanation,reason:a.reason,basis:'situation'};
  p.task={kind:'incident',caseId:s.id,token:a.id,target:a.target||null,location:a.spot||null,resource:a.mode==='physical'?a.spot:null,path,transport:carried?{object:carried.object,to:carried.to,from:a.spot}:null,phase:'walking',remaining:carried?1:a.minutes,started:this.time,device:a.device||null,rule:p.decision?.rule,stamp:c.stamp};p.moving=true;
  s.attempts[p.id+':'+a.id]=this.time+15;
  this.emit('incident-intent',p,`${p.name}准备${a.label}：${a.reason}`,[],null,false,{episode:this.episode.id,caseId:s.id,token:a.id,rule:p.decision?.rule});return true;
 },
 finishIncident(p){
  const t=p.task,s=this.incidents.find(s=>s.id===t.caseId),a=s?.pack.actions.find(a=>a.id===t.token);if(!a){this.release(p);return;}
  const move=a.effects.find(e=>e.op==='move');if(move&&!t.transport){const obj=s.objects.find(o=>o.id===move.object),path=route(p,SPOTS[move.to]);if(obj&&obj.location===a.spot&&path){if(t.resource&&this.leases[t.resource]===p.id)delete this.leases[t.resource];t.resource=null;t.transport={object:move.object,from:a.spot,to:move.to};obj.carrier=p.id;t.path=path;t.phase='walking';t.remaining=1;t.location=move.to;p.moving=true;return;}}
  if(a.mode==='talk'){
   this.release(p);if(this.incidentGuard(s,p,a)&&senses(this,p,this.person(a.target)).understood)this.openConversation(p.id,[a.target,...(a.invite||[]).filter(id=>senses(this,p,this.person(id)).understood)],{topic:{kind:'incident',caseId:s.id,label:s.pack.title},access:'private'});
  }else {this.applyIncident(s,p,a,[],null,t.stamp);this.release(p);}
  p.nextDecision=this.time+1;
 },
 incidentActs(c,p){return [{kind:'pass'},...this.incidentCandidates(p,c).map(a=>({...a,topic:copy(c.topic),replyTo:c.members[p.id].heard.findLast(t=>t.from===a.target)?.id}))];},
 incidentSpeech(p,t){return this.incidents.find(s=>s.id===t.caseId)?.pack.actions.find(a=>a.id===t.token)?.text||'情况已经变了，我们再看看。';},
 recordIncidentTurn(c,p,t){const s=this.incidents.find(s=>s.id===t.caseId),a=s?.pack.actions.find(a=>a.id===t.token);if(s&&a&&t.deliveredTo.includes(a.target))this.applyIncident(s,p,a,t.deliveredTo,t,t.stamp);},
 applyIncident(s,p,a,listeners=[],turn=null,stamp=1){
  if(s.done[p.id+':'+a.id]===stamp||!this.incidentGuard(s,p,a))return false;
  if(a.mode==='physical'&&(!p.task||p.task.caseId!==s.id||p.task.token!==a.id||p.task.phase!=='doing'||p.task.remaining>0||Math.hypot(p.x-SPOTS[p.task.transport?.to||a.spot].x,p.z-SPOTS[p.task.transport?.to||a.spot].z)>1.5))return false;
  const effects=a.effects.map(e=>e.valueFrom==='work-version'?{...e,value:s.work[p.id]?.version||0}:e);
  // Validate every irreversible gameplay effect before applying any of them.
  const spending={};for(const e of effects){
   if(e.op==='transfer'){spending[e.from]=(spending[e.from]||0)+e.amount;if(spending[e.from]>(e.from==='family'?this.home.money:this.storyEconomy.wallets[e.from]))return false;}
   if(e.op==='transfer'){const cash=e.from==='family'?this.home.money:this.storyEconomy.wallets[e.from];if(cash<e.amount)return false;}
   if(['repair','move'].includes(e.op)){const o=s.objects.find(o=>o.id===e.object);if(!o||o.location!==a.spot)return false;if(e.op==='repair'&&o.condition!=='broken')return false;}
   if(e.op==='inspect-work'&&!s.work[e.actor])return false;
   if(e.op==='transfer'&&e.repayment&&!s.debts.some(d=>!d.paid&&d.debtor===e.from&&d.creditor===e.to&&d.amount===e.amount))return false;
  }
  const event=this.emit('incident-event',p,turn?`${p.name}：${turn.text}`:a.text,listeners,turn?.replyTo||null,false,{episode:this.episode.id,caseId:s.id,token:a.id,position:{x:p.x,z:p.z},location:p.task?.transport?.to||p.task?.location||null,effects:copy(effects),rule:turn?.rule||p.task?.rule||p.decision?.rule,reason:a.reason});
  event.observedBy=[p.id,...listeners];s.events.push(copy(event));const root='event-'+event.id;
  for(const id of event.observedBy){this.brain.observe(id,{uid:root,type:'event',kind:'incident-event',actor:p.id,target:a.target||p.id,source:id===p.id?'self':'heard',time:this.time,text:event.text,caseId:s.id,token:a.id});this.syncMind(this.person(id));}
  s.done[p.id+':'+a.id]=stamp;this.incidentRemember(s,p,'done-'+a.id,stamp,'self',root);
  for(const e of effects){
   if(e.op==='remember')this.incidentRemember(s,p,e.key,e.value,'self',root+'-'+e.key);
   if(e.op==='tell')for(const id of listeners)this.incidentRemember(s,this.person(id),e.key,e.value,e.valueFrom==='work-version'?'self':'heard',root+'-'+e.key,p.id);
   if(e.op==='repair')s.objects.find(o=>o.id===e.object).condition='repaired';
   if(e.op==='move'){const o=s.objects.find(o=>o.id===e.object);o.location=e.to;delete o.carrier;}
   if(e.op==='transfer'){
    if(e.from==='family')this.home.money-=e.amount;else this.storyEconomy.wallets[e.from]-=e.amount;
    this.storyEconomy.wallets[e.to]+=e.amount;this.storyEconomy.ledger.push({caseId:s.id,event:event.id,from:e.from,to:e.to,amount:e.amount,at:this.time});
    if(e.debt){s.debts.push({debtor:e.to,creditor:e.from,amount:e.amount,paid:false,event:event.id});this.incidentRemember(s,this.person(e.to),'debt',e.amount,'self',root+'-debt');if(Object.hasOwn(s.pack.facts,'needs-money'))this.incidentRemember(s,this.person(e.to),'needs-money',false,'self',root+'-funded');}
    if(e.repayment){for(const d of s.debts.filter(d=>d.debtor===e.from&&d.creditor===e.to&&!d.paid)){d.paid=true;d.repaidAt=this.time;}this.incidentRemember(s,p,'debt',0,'self',root+'-debt');}
   }
   if(e.op==='clean'){this.home.clean=clamp(this.home.clean+e.amount);s.work[p.id]={quality:e.quality,version:(s.work[p.id]?.version||0)+1,at:this.time,event:event.id};}
   if(e.op==='inspect-work'){
    const w=s.work[e.actor],quality=Math.max(2,this.storyEconomy.policies['chore-quality']);
    this.incidentRemember(s,p,'approved-'+e.actor,w.quality>=quality,'seen',root+'-approval');this.incidentRemember(s,p,'rework-'+e.actor,w.quality<quality,'seen',root+'-rework');
   }
   if(e.op==='policy')this.storyEconomy.policies[e.key]=e.value;
   if(e.op==='fear')this.incidentRemember(s,p,'fear',clamp(this.incidentBeliefs(s,p).fear+e.amount),'self',root+'-fear');
   if(e.op==='comfort'&&listeners.includes(a.target)){const q=this.person(a.target);this.incidentRemember(s,q,'fear',clamp(this.incidentBeliefs(s,q).fear-e.amount),'self',root+'-fear');}
   if(e.op==='social'&&listeners.includes(a.target))this.perceive(this.person(a.target),p.id,'reliability',e.value,{domain:s.pack.id,kind:'social',source:'heard',speaker:p.id,root,goalRelevant:true});
  }

  if(!turn)this.say(p,a.text);
  return true;
 },
 tickSituations(){
  this.initSituations();const sensing=new Set(this.people.filter(p=>this.time-(p.lastIncidentSense||0)>=4).map(p=>p.id));for(const s of this.incidents){
   for(const p of this.people){
    if(p.presence==='away'||p.action==='sleep'||this.minute<390)continue;
    if(this.episode.caseId===s.id&&!this.episode.briefed.includes(p.id))this.episode.briefed.push(p.id);
    if(!s.briefed.includes(p.id)){
     s.briefed.push(p.id);
     for(const [k,v] of Object.entries(s.pack.seeds[p.id]||{}))this.incidentRemember(s,p,k,v,'self',s.id+'-seed-'+p.id+'-'+k);
     const e=this.emit('scene-brief',p,s.pack.roles[p.id].memory,[],null,false,{episode:this.episode.id,private:true,caseId:s.id});e.observedBy=[p.id];this.brain.observe(p.id,{...e,uid:'event-'+e.id,type:'event',kind:'scene-brief',target:p.id,source:'self'});this.syncMind(p);
    }
    if(!sensing.has(p.id))continue;
    for(const obs of s.pack.observations){const o=s.objects.find(o=>o.id===obs.object),spot=SPOTS[obs.at||o.location];if(!spot||o.private&&o.owner!==p.id&&this.incidentBeliefs(s,p).broken!==true)continue;
     if(!senses(this,p,spot).visible||Math.hypot(p.x-spot.x,p.z-spot.z)>3)continue;
     const observedValue=obs.property==='location'&&o.carrier?'carried':o[obs.property];if((obs.op==='ne'?observedValue!==obs.value:observedValue===obs.value)&&this.known(p,s.id,obs.key)?.value!==obs.result)this.incidentRemember(s,p,obs.key,obs.result,'seen',`${s.id}-${o.id}-${o[obs.property]}`);
    }
   }
  }
  for(const p of this.people)if(sensing.has(p.id)&&p.presence!=='away')p.lastIncidentSense=this.time;
 },
 situationPersonalText(p){
  return (this.incidents||[]).filter(s=>s.briefed.includes(p.id)).slice(-3).map(s=>({title:s.pack.title,want:s.pack.roles[p.id].want,facts:Object.fromEntries(Object.entries(this.incidentBeliefs(s,p)).filter(([k,v])=>v!==false&&v!=='unknown'&&!['energy','cash','goal-left'].includes(k))),last:s.events.findLast(e=>e.actor===p.id)?.text,debts:s.debts.filter(d=>d.debtor===p.id&&!d.paid)}));
 }
});}
