import {WALLS,DOORS,roomAt} from './layout.js';
// World geometry and sensory transport only. Belief revision and appraisal live in mind.soar.
export const spatialDefaults={vision:8.5,speech:5.5,sound:11,closedDoorSpeech:.18,closedDoorSound:.55};
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function room(p){return roomAt(p);}
function crosses(a,b,segment){const [x1,z1,x2,z2]=segment;const cross=(x,y,z)=>(y.x-x.x)*(z.z-x.z)-(y.z-x.z)*(z.x-x.x);const c={x:x1,z:z1},d={x:x2,z:z2};return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;}
export function senses(house,observer,target){
 if(!observer||!target||observer.presence==='away'||target.presence==='away')return {visible:false,audible:false,understood:false,distance:Infinity,room:'outside'};
 const cfg=house.domain.perception||spatialDefaults,d=dist(observer,target),asleep=observer.action==='sleep';
 const wall=WALLS.some(([x1,x2,z1,z2])=>crosses(observer,target,x2-x1>z2-z1?[x1,(z1+z2)/2,x2,(z1+z2)/2]:[(x1+x2)/2,z1,(x1+x2)/2,z2]));
 const curtain=house.space?.screenClosed&&DOORS.some(door=>crosses(observer,target,door));
 const barrier=wall||curtain;const attenuation=barrier?cfg.closedDoorSpeech:1;
 return {visible:!asleep&&!barrier&&d<=cfg.vision,audible:!asleep&&d<cfg.sound*(barrier?cfg.closedDoorSound:1),understood:!asleep&&d<=cfg.speech*attenuation,distance:d,room:room(target)};
}
export function initialObjects(){return {
 pot:{id:'pot',name:'饭锅',location:'stove',container:true,open:true,stock:'food',owner:'family'},
 pantry:{id:'pantry',name:'冰箱储物格',location:'fridge',container:true,open:false,stock:'ingredients',owner:'family'},
 snacks:{id:'snacks',name:'零食盒',location:'book',container:true,open:false,stock:'snacks',owner:'family'},
 notebook:{id:'notebook',name:'刘星的练习本',location:'desk',container:false,owner:'xing',hidden:false}
};}
export function beliefKey(subject,predicate){return subject+':'+predicate;}
export function asArray(value){return value===undefined?[]:Array.isArray(value)?value:[value];}
export function installPerception(Household,SPOTS){Object.assign(Household.prototype,{
 initPerception(){this.space??={screenClosed:false};this.objects??=initialObjects();this.messages??=[];this.perceptSerial??=0;for(const p of this.people){p.sensed??={};p.inspected??={};p.affect??=[];p.mental??={};p.knownPeople??={};p.lastSense??=-1;p.receipts??=[];}},
 perceive(p,subject,predicate,value,{source='seen',root=null,speaker=p.id,domain='object',kind='belief',explanation='unknown',goalRelevant=false}={}){
  const key=beliefKey(subject,predicate)+(kind==='social'?':'+domain:''),evidence={class:kind,source,value,root:root||`percept-${p.id}-${++this.perceptSerial}`,speaker,time:this.time,explanation};
  const r=this.brain.perceive(p.id,{key,subject,predicate,domain,energy:p.energy,'goal-relevant':goalRelevant,evidence});
  p.mental[key]=r.record;if(kind==='social')p.affectAt=-Infinity;
  if(kind==='social'&&r.kind!=='duplicate')this.emit('appraisal',p,`${p.name}对${this.person(subject)?.name||subject}的判断：${r.record.reason}。`,[],null,false,{subject,domain,record:r.record,evidence:evidence.root});
  return r;
 },
 known(p,subject,predicate){return p.mental[beliefKey(subject,predicate)];},
 sense(p,force=false){
  if(p.presence==='away'||p.action==='sleep'||!force&&this.time-p.lastSense<4)return;p.lastSense=this.time;
  for(const q of this.people)if(q!==p&&senses(this,p,q).visible)p.knownPeople[q.id]={x:q.x,z:q.z,action:q.action,at:this.time};
  for(const o of Object.values(this.objects)){
   const spot=SPOTS[o.location];if(!spot||!senses(this,p,spot).visible||o.hidden)continue;
   if(!o.container)this.senseValue(p,o.id,'location',o.location);
   if(o.container&&(o.open||p.action==='inspect'&&p.task?.location===o.location)&&dist(p,spot)<2.5)this.senseValue(p,o.id,'stock',this.home[o.stock]);
  }
 },
 senseValue(p,subject,predicate,value){const key=beliefKey(subject,predicate);if(p.sensed[key]===value&&this.known(p,subject,predicate)?.status==='known'&&this.known(p,subject,predicate)?.value===value)return;p.sensed[key]=value;this.perceive(p,subject,predicate,value);},
 inspectLocation(p,location){
  p.inspected[location]=this.time;
  for(const o of Object.values(this.objects))if(o.location===location){if(o.container)this.senseValue(p,o.id,'stock',this.home[o.stock]);else if(!o.hidden)this.senseValue(p,o.id,'location',location);}
  const wanted=p.seeking;if(wanted&&this.objects[wanted]?.location!==location){const old=this.known(p,wanted,'location');if(old?.value===location)this.perceive(p,wanted,'location','unknown',{root:`search-${p.id}-${++this.perceptSerial}`});}
  if(wanted&&this.objects[wanted]?.location===location&&!this.objects[wanted].hidden){this.perceive(p,wanted,'location',location);p.seeking=null;}
  this.emit('inspection',p,`${p.name}查看了${SPOTS[location].name}。`,[],null,false,{location});
 },
 moveObject(id,location,hidden=false){const o=this.objects[id];if(!o||!SPOTS[location])throw Error('未知物品或位置');o.location=location;o.hidden=hidden;this.emit('objectMoved',null,`你把${o.name}放到了${SPOTS[location].name}${hidden?'里面':''}。`,[],null,false,{object:id,location});for(const p of this.people)this.sense(p,true);},
 seekObject(id,object){const p=this.person(id);if(!p||!this.objects[object])throw Error('未知人物或物品');p.seeking=object;p.inspected={};p.nextDecision=this.time;},
 refreshAffect(p,force=false){if(!force&&this.time-(p.affectAt||0)<10)return;p.affectAt=this.time;p.affect=[];
  // Reliability records are directed social appraisals. Adding a new belief
  // domain (such as story goals) must not create emotion clocks for every fact.
  for(const [key,record] of Object.entries(p.mental))if(record.predicate==='reliability'){
   const r=this.brain.mindRead(p.id,key,this.time,this.domain.affect);p.mental[key]=r.record;p.affect.push({...r.record,active:r.active,mood:r.mood});
  }
  for(const other of this.people.filter(q=>q!==p)){const records=p.affect.filter(r=>r.subject===other.id);if(records.length)p.relations[other.id]=Math.max(0,Math.min(100,records.reduce((a,r)=>a+r.judgment,0)/records.length));}
 },
 tell(fromId,toId,claim){
  const from=this.person(fromId),to=this.person(toId);if(!from||!to)throw Error('未知谈话对象');
  const id=`message-${++this.perceptSerial}`,channel=senses(this,to,from),root=claim.root||id;
  const msg={id,root,from:fromId,to:toId,at:this.time,claim:structuredClone(claim),audible:channel.audible,delivered:channel.understood,understood:false,believed:false};
  this.messages.push(msg);if(this.messages.length>400)this.messages.shift();
  this.brain.observe(fromId,{type:'event',uid:'sent-'+id,kind:'testimony-sent',actor:fromId,target:toId,source:'self',time:this.time,provenance:root,subject:claim.subject,predicate:claim.predicate,value:claim.value,delivered:channel.understood,text:`我向${to.name}说起了${claim.subject}；${channel.understood?'对方听到了':'没有确认对方听清'}。`});this.syncMind(from);
  if(!channel.understood){to.receipts.push({id,audible:channel.audible,understood:false});to.receipts=to.receipts.slice(-30);return msg;}
  const record=this.perceive(to,claim.subject,claim.predicate,claim.value,{source:'heard',root,speaker:fromId,domain:claim.domain||'object',kind:claim.kind||'belief',explanation:claim.explanation||'unknown',goalRelevant:claim.goalRelevant||false}).record;
  msg.understood=true;msg.believed=record.status==='known'||record.status==='tentative';msg.assessment=record.status;
  const e=this.emit('communication',from,`${from.name}向${to.name}转述了关于${this.objects[claim.subject]?.name||this.person(claim.subject)?.name||claim.subject}的消息。`,[],null,false,{root});
  e.observedBy=[fromId,toId];this.brain.observe(toId,{uid:id,type:'event',kind:'testimony',actor:fromId,source:'heard',time:this.time,provenance:root,subject:claim.subject,predicate:claim.predicate,value:claim.value,text:`${from.name}说：${claim.subject} / ${claim.predicate} = ${claim.value}（${record.status}）`});this.syncMind(to);
  to.receipts.push({id,root,from:fromId,understood:true,status:record.status});to.receipts=to.receipts.slice(-30);return msg;
 },
 shareClaim(from,to){
  const intent=from.task?.speechAct||'share',topic=from.task?.topic||'none';
  const result=this.brain.transact(from.id,{mode:'compose',intent,topic,claim:Object.values(from.mental),to:to.id});
  if(result.kind==='question'){
   this.say(from,'刚才那件事，你为什么没答应？我想听你说说。');
   const channel=senses(this,to,from),id=`question-${++this.perceptSerial}`;this.messages.push({id,root:id,from:from.id,to:to.id,at:this.time,kind:'question',topic,audible:channel.audible,delivered:channel.understood,understood:channel.understood});
   if(!channel.understood)return;
   this.brain.observe(to.id,{type:'event',uid:id,kind:'question',actor:from.id,target:to.id,source:'heard',time:this.time,topic,text:from.name+'问起刚才没有答应的原因。'});this.syncMind(to);
   const response=to.lastResponse?.from===from.id&&to.lastResponse.request===topic?to.lastResponse:{};
   const answer=this.brain.transact(to.id,{mode:'explain',response});
   if(answer.value==='constrained'){this.say(to,'刚才我手头的安排会被打断，所以想先做完。');return this.tell(to.id,from.id,{subject:to.id,predicate:'reliability',domain:topic,kind:'social',value:'correction',explanation:'constrained',root:`explanation-${to.id}-${response.at}`});}
   this.say(to,'我还没想好怎么说这件事。');return;
  }
  const c=result.claim;if(c){this.say(from,`${this.objects[c.subject]?.name||c.subject}，我${c.source==='heard'?'听人说':'上次看见'}${c.predicate==='location'?'在'+(SPOTS[c.value]?.name||'不确定的位置'):'还有 '+c.value+' 份'}。`);return this.tell(from.id,to.id,{subject:c.subject,predicate:c.predicate,value:c.value,root:c.provenance});}
 },
 appraiseSocial(p,e){
  const subject=e.actor===p.id?e.participants.find(id=>id!==p.id):e.actor;if(!subject||!e.participants.includes(p.id)&&e.actor!==p.id)return;
  // Only the receiving person evaluates cooperation; acting never manufactures reciprocal gratitude.
  if(e.actor===p.id)return;
  this.perceive(p,subject,'reliability',e.type,{source:'heard',root:'event-'+e.id,speaker:e.actor,domain:e.domain||'cooperation',kind:'social',explanation:e.explanation||'unknown',goalRelevant:e.target===p.id||e.participants.includes(p.id)});
  this.refreshAffect(p,true);
 }
});}
