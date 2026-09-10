import {situationById,situationPlan,situationResult} from './situations/runtime.js';
import {validateSituation} from './situations/schema.js';
import {SPOTS} from './layout.js';
const IDS=['dad','me','xue','xing','xiaoyu'];
const clone=x=>structuredClone(x);
// Situation methods authored by ChatGPT. The offline director combines these
// with observed outcomes. It is not an API call and never supplies an ending.
export const SCENARIOS=[
 {id:'show',title:'牛已经吹出去了',lead:'xing',premise:'刘星在班里报了一个「全家都有绝活」的小节目，明天要带排练记录。他还没问过任何人。',
  roles:{
   xing:{memory:'今天我在班里主动报了全家小节目的名，明天要交排练记录。这件事还没和家人商量。',want:'把吹出去的牛圆回来，又不想承认自己没先商量。',job:'做一件小道具',line:'我这叫先替咱家争取机会！就是……还缺大家点头。'},
   dad:{memory:'今天手头的稿子还有收尾，晚上也想留一点时间陪孩子。',want:'帮孩子收场，但希望他学会先征求意见。',job:'写一段开场白',line:'主持人我可以当，替全家报名这项业务，下回先开个家庭会议。'},
   me:{memory:'今天上班有点累，回家仍要准备晚饭，希望有人分担。',want:'别让一家人的活动最后都变成自己的家务。',job:'列一张道具清单',line:'全家都有绝活？我的绝活是做饭。洗碗这项绝活谁来认领？'},
   xue:{memory:'我今晚还有一段复习没完成，不想临时安排把整晚占满。',want:'保住复习时间，也愿意参加短一点的家庭活动。',job:'写一张节目单',line:'先说清楚用多久。我的复习计划，可不是节目里的可移动道具。'},
   xiaoyu:{memory:'今天在学校特别想当一次主角，回家想找哥哥陪自己玩。',want:'有自己的出场机会，不只是在旁边鼓掌。',job:'画一张小海报',line:'我可以表演吃饼干！要是不行，我也能负责画海报。'}
  }},
 {id:'restaurant',title:'今天谁当店长',lead:'xiaoyu',premise:'夏雨想把家里办成半小时的小餐馆，拍张家庭实践作业的记录。刘星一听就想当只发号施令的店长。',
  roles:{
   xiaoyu:{memory:'老师让我们做一次家庭合作记录，我想办半小时的小餐馆。',want:'一家人都能出现在自己的作业里。',job:'画一张菜单',line:'顾客也是自己人，所以不好吃也不能给差评吧？'},
   xing:{memory:'最近总被叫去做事，我想试一次自己安排事情。',want:'当店长有面子，最好别被分配最多的活。',job:'做一块店招',line:'我申请当店长。店长是不是主要负责……说「干得不错」？'},
   xue:{memory:'我打算把今天的任务做完再休息，希望活动有清楚的分工。',want:'大家各做一份，别只让某个人忙。',job:'写一张分工表',line:'店长也得有工作量。这个分工表，我可要写名字的。'},
   dad:{memory:'家用还要留着买日常食材，活动可以用家里已有的东西。',want:'陪孩子玩，同时不要为了小活动乱花钱。',job:'写一张价目表',line:'本店第一条规定：爸爸的钱包，不提供无限续杯。'},
   me:{memory:'上顿饭的收拾还记在心里，这次不想包办所有人的准备工作。',want:'每人负责自己的部分，结束后一起收拾。',job:'写一张备餐单',line:'要开店可以，我可不当包做饭、包上菜、包收拾的万能员工。'}
  }},
 {id:'outing',title:'全家的愿望装进一天',lead:'dad',premise:'爸爸提议下一次休息日全家一起过，孩子们各有想法。今晚先试做一份人人都有份的小计划。',
  roles:{
   dad:{memory:'想在下一次休息日多陪家人，准备今晚先听听各人的想法。',want:'做出一个能兑现的家庭约定。',job:'写一张路线卡',line:'今天不比谁声音大，比谁的主意能装进同一天。'},
   me:{memory:'想到一家人出门要带的东西，希望这次准备工作别全落在自己身上。',want:'大家一起准备，自己也能歇一歇。',job:'列一张用品单',line:'我也想出去玩。注意，是我出去玩，不是我带着家务出去玩。'},
   xue:{memory:'近期有复习安排，愿意参加家庭活动但要预留个人时间。',want:'家庭时间和个人安排都得到尊重。',job:'写一张时间表',line:'我把时间先列出来，这次总不能又说「马上就好」吧。'},
   xing:{memory:'想找个机会和大家一起玩，希望自己的主意也能被采纳。',want:'有一段可以自己安排的娱乐时间。',job:'画一张游戏卡',line:'我提议把「听刘星的」也列成一个景点。'},
   xiaoyu:{memory:'想和家人一起玩，也想把自己想到的东西画给大家看。',want:'带着自己的画和大家一起参与。',job:'画一张愿望卡',line:'只要大家都来，我就画五个人。少一个都不好看。'}
  }}
];
export function planEpisode(house,previous=null){
 if(!house.director.scenario||situationById(house.director.scenario))return situationPlan(house,previous);
 const unfinished=previous&&previous.status!=='completed';
 const index=unfinished?SCENARIOS.findIndex(s=>s.id===previous.template):(house.day-1)%SCENARIOS.length;
 const source=SCENARIOS[Math.max(0,index)],weekend=house.calendarFor(house.people[0]).weekend;
 const roles=clone(source.roles);for(const [id,r] of Object.entries(roles)){if(unfinished)r.memory=`昨天我${previous.prepared.includes(id)?'完成了自己的准备':previous.positions[id]==='accept'?'答应了，但没做完准备':previous.positions[id]==='counter'?'提出了自己的条件':'没能定下自己的安排'}。今天还惦记着：${r.want}`;else if(weekend)r.memory=r.memory.replace('今天我在班里','放假前我在班里').replace('今天在学校','上学时').replace('今天上班','这周上班').replace('今天手头','手头');}
 return {schemaVersion:1,id:`episode-${house.day}`,day:house.day,template:source.id,title:unfinished?'昨天的事，换个办法':source.title,
  premise:unfinished?`昨天「${previous.title}」${previous.summary}。今天大家有机会把没做完的部分重新商量，用更小的办法接着做。`:source.premise,
  lead:source.lead,roles,effort:unfinished?8:18,meet:weekend?600:1160,finale:weekend?1020:1230,deadline:weekend?1160:1275,
  origin:'ChatGPT 编写的情景规则 · 本地按结果续接',basedOn:previous?.day||null,evidence:previous?.evidence||[],previous:previous?clone(previous):null};
}
export function validateEpisode(plan,day){
 if(!plan||plan.schemaVersion!==1||plan.day!==day||plan.id!==`episode-${day}`||!IDS.includes(plan.lead)||!SCENARIOS.some(s=>s.id===plan.template)&&!situationById(plan.template)&&!plan.situation)throw Error('次日情景的日期、主角或能力类型无效');
 for(const k of ['title','premise'])if(typeof plan[k]!=='string'||!plan[k].trim()||plan[k].length>1000)throw Error('情景缺少标题或前提');
 if(!Number.isFinite(plan.effort)||plan.effort<5||plan.effort>30)throw Error('情景准备时间必须在 5—30 分钟内');
 if(plan.situation){validateSituation(plan.situation);if(plan.template!==plan.situation.id)throw Error('情景类型与规则包 ID 不一致');}
 if(!Number.isFinite(plan.meet)||!Number.isFinite(plan.finale)||!Number.isFinite(plan.deadline)||plan.meet<570||plan.finale<plan.meet+60||plan.deadline<plan.finale+20||plan.deadline>1275)throw Error('情景时段与生活作息不兼容');
 for(const id of IDS)for(const k of ['memory','want','job','line'])if(typeof plan.roles?.[id]?.[k]!=='string'||!plan.roles[id][k].trim()||plan.roles[id][k].length>500)throw Error('每个人需要自己的经历、诉求和可执行准备任务');
 return plan;
}
export function episodeResult(house){
 const s=house.episode;if(!s)return null;if(s.caseId)return situationResult(house);
 const prepared=IDS.filter(id=>s.prepared[id]),performed=IDS.filter(id=>s.performed[id]),declined=IDS.filter(id=>s.positions[id]==='decline');
 const evidence=house.dayEvents.filter(e=>e.episode===s.id).map(e=>e.id);
 const status=performed.length>=3?'completed':prepared.length||Object.keys(s.positions).length?'partial':'unresolved';
 const summary=performed.length>=3?`${performed.map(id=>house.person(id).name).join('、')}实际参加了活动${declined.length?'，有人保留了自己的安排':''}`:prepared.length?`只有${prepared.map(id=>house.person(id).name).join('、')}完成准备，活动还没有凑齐`:Object.keys(s.positions).length?'大家提出了条件，还没有把活动做成':'还没能聚到一起把事情说开';
 return {day:s.day,title:s.title,template:s.template,status,summary,prepared,performed,declined,positions:clone(s.positions),revised:s.revision>0,evidence};
}
export function installDirector(Household){Object.assign(Household.prototype,{
 initDirector(){this.director??={enabled:true,history:[]};if(!this.director.enabled)return;if(!this.episode)this.beginEpisode();},
 beginEpisode(plan=null){
  const previous=this.director.history.at(-1);plan??=planEpisode(this,previous);validateEpisode(plan,this.day);
  this.episode={...clone(plan),status:'planned',briefed:[],arrived:{},arrivalTimes:{},positions:{},positionRevision:{},prepared:{},performed:{},revision:0,small:plan.effort<=10,conversation:null,finalConversation:null,announced:false};
  if(plan.situation||situationById(plan.template)){this.beginSituation(this.episode);return;}
  this.domain.conversation.topics.episode={kind:'scene',episode:this.episode.id,label:plan.title,premise:plan.premise,stage:'negotiate'};
 },
 finishEpisodeDay(){
  if(!this.director?.enabled)return;const result=episodeResult(this);if(result){this.director.history.push(result);this.director.history=this.director.history.slice(-30);}
 },
 deliverStoryBrief(p){
  const s=this.episode;if(s?.caseId)return;if(!this.director?.enabled||!s||s.briefed.includes(p.id)||p.presence==='away'||p.action==='sleep'||this.minute<390)return;
  s.briefed.push(p.id);const role=s.roles[p.id];
  // Authored setup events happen now at homecoming / reading the family note.
  // They are private observations, not recollections of a forced future ending.
  this.perceive(p,s.id,'want',role.want,{source:'self',domain:'story',root:`${s.id}-want-${p.id}`});
  this.perceive(p,s.id,'pledge','none',{source:'self',domain:'story',root:`${s.id}-initial-${p.id}`});
  const e=this.emit('scene-brief',p,role.memory,[],null,false,{episode:s.id,private:true});e.observedBy=[p.id];
  this.brain.observe(p.id,{...e,uid:'event-'+e.id,type:'event',kind:'scene-brief',source:'self',target:p.id});this.syncMind(p);
  // A family notice is an explicit shared communication channel, recorded for
  // each reader. It includes when/where to meet, never another actor's secrets.
  this.perceive(p,s.id,'meeting',s.meet,{source:'seen',domain:'story',root:`${s.id}-notice`});
  if(p.id===s.lead)this.perceive(p,s.id,'premise',s.premise,{source:'self',domain:'story',root:`${s.id}-premise`});
 },
 storyFacts(p){
  const s=this.episode;if(s?.caseId)return {enabled:false,ready:false,prepare:false};if(!s||!this.director?.enabled)return {enabled:false,ready:false,prepare:false};
  const can=this.calendarFor(p).storyWindow&&p.presence!=='away'&&s.briefed.includes(p.id),now=this.minute;
  const stage=now>=s.finale?'finale':'negotiate';
  const arrived=s.arrived[p.id]===stage,finished=stage==='finale'?!!s.performed[p.id]:s.positionRevision[p.id]===s.revision;
  return {enabled:true,id:s.id,lead:s.lead,stage,small:p.sceneOffer?.episode===s.id?p.sceneOffer.small:s.effort<=10,revision:p.sceneOffer?.episode===s.id?p.sceneOffer.revision:0,'goal-left':Math.max(0,(p.goals[0]?.target||0)-(p.goals[0]?.progress||0)),clean:this.home.clean,
   ready:can&&now>=s.meet&&now<s.deadline&&!p.conversationId&&(!p.task||p.action==='gatherScene'||p.task.phase==='doing'&&['pause','parallel'].includes(this.actions[p.action]?.conversation))&&!finished&&!arrived&&(stage!=='finale'||!!s.prepared[p.id]),
   waiting:can&&arrived&&!finished&&!p.conversationId&&now<s.deadline&&this.time-(s.arrivalTimes?.[p.id]??this.time)<20&&this.conversation(s[stage==='finale'?'finalConversation':'conversation'])?.status!=='closed',
   prepare:can&&s.positions[p.id]==='accept'&&!s.prepared[p.id]&&now<s.finale&&!p.conversationId&&(!p.task||p.action==='prepareScene'),
   pledged:this.known(p,s.id,'pledge')?.value==='accepted',job:s.roles[p.id].job};
 },
 sceneGathered(p){
  const s=this.episode;if(!s)return;s.arrived[p.id]=this.minute>=s.finale?'finale':'negotiate';s.arrivalTimes??={};s.arrivalTimes[p.id]=this.time;p.nextDecision=this.time;
 },
 scenePrepared(p){
  const s=this.episode;if(!s||p.task.episode!==s.id||s.positions[p.id]!=='accept')return;
  s.prepared[p.id]={at:this.time,job:s.roles[p.id].job,location:p.task.location};
  const e=this.emit('scene-prepared',p,`${p.name}实际完成了：${s.roles[p.id].job}。`,[],null,true,{episode:s.id,job:s.roles[p.id].job});
  this.perceive(p,s.id,'prepared','yes',{source:'self',domain:'story',root:'event-'+e.id});
 },
 sceneActs(c,p){
  const s=this.episode,m=c.members[p.id];if(!s||c.topic.episode!==s.id)return [{kind:'pass'}];
  const opts=[{kind:'pass'}],base={target:'all',topic:clone(c.topic)};
  if(c.topic.stage==='finale'){
   if(s.prepared[p.id]&&!s.performed[p.id])opts.push({...base,kind:'scene-perform'});
   return opts;
  }
  const heard=m.heard.filter(t=>t.topic?.episode===s.id);
  const offer=heard.findLast(t=>['scene-pitch','scene-revise','scene-recap'].includes(t.kind));
  const question=heard.findLast(t=>t.kind==='scene-ask'&&t.from!==p.id&&!m.handled.includes(t.id));
  if(p.id===s.lead&&question)opts.push({...base,kind:'scene-recap',replyTo:question.id});
  if(p.id!==s.lead&&!offer&&c.turns.length>0&&!heard.some(t=>t.from===p.id&&t.kind==='scene-ask'))opts.push({...base,kind:'scene-ask'});
  if(p.id===s.lead&&!heard.some(t=>t.kind==='scene-pitch'))opts.push({...base,kind:'scene-pitch'});
  if(offer&&s.positionRevision[p.id]!==offer.offer.revision){
   const prior=offer;
   for(const kind of ['scene-accept','scene-counter','scene-decline'])opts.push({...base,kind,replyTo:prior.id,revision:prior.offer.revision});
  }
  if(p.id===s.lead&&!s.small&&heard.some(t=>t.kind==='scene-counter'))opts.push({...base,kind:'scene-revise'});
  if(p.id===s.lead&&heard.some(t=>t.kind==='scene-revise')&&s.positionRevision[p.id]===s.revision&&!heard.some(t=>t.kind==='scene-wrap'))opts.push({...base,kind:'scene-wrap'});
  return opts;
 },
 sceneSpeech(p,t){
  const s=this.episode,role=s.roles[p.id],minutes=s.small?8:s.effort;
  if(t.kind==='scene-pitch')return `${p.id==='xing'?'我今天在班里报了个「全家都有绝活」的小节目，明天就要交排练记录。':s.premise} 我想请大家各准备一份，${s.effort}分钟左右。${role.line}`;
  if(t.kind==='scene-ask')return '我刚到，刚才具体怎么安排的？先跟我说说。';
  if(t.kind==='scene-recap')return `${s.premise} 刚才商量的是每人自己准备一份，用${minutes}分钟。你愿意吗？`;
  if(t.kind==='scene-counter')return role.line+' '+({dad:'先把准备缩短些，我还要收尾。',me:'每人自己的那份自己准备，不能又让我包办。',xue:'我还有复习，缩到十分钟以内我才能参加。',xing:'要我帮忙也行，我可不能光干活不出场。',xiaoyu:'先给我一个自己的任务，我也要上场。'})[p.id];
  if(t.kind==='scene-decline')return `这次我先不参加。${role.want}，今天实在腾不开。`;
  if(t.kind==='scene-revise')return p.id==='xing'?'行行行，豪华版改成家庭精简版！每人八分钟，各做自己的，晚上碰头。我负责道具，绝不让妈全包。':'那就缩小一点：每人八分钟，各做自己的一份。晚一点再聚，谁没空也可以说。';
  if(t.kind==='scene-accept')return `${s.small?'这样我可以。':'我愿意试试。'}我来${role.job}，大概用${minutes}分钟。${p.id==='xing'?'这回可记得把我的名字写大一点。':p.id==='xiaoyu'?'这下我也有自己的任务啦！':''}`;
  if(t.kind==='scene-wrap')return '就按刚才各自答应的来。先吃饭、忙完自己的事，晚点带着准备的东西再碰头。';
  if(t.kind==='scene-perform')return `${role.job}，我真的做完了，给大家看看。${role.line}`;
  return role.line;
 },
 recordSceneTurn(c,p,t){
  const s=this.episode;if(!s||t.topic?.episode!==s.id)return;
  if(t.kind==='scene-revise'){s.small=true;s.revision++;}
  if(['scene-pitch','scene-revise','scene-recap'].includes(t.kind)){
   t.offer={small:s.small,revision:s.revision};
   for(const id of [p.id,...t.deliveredTo]){const q=this.person(id);q.sceneOffer={episode:s.id,...t.offer};if(id!==p.id)this.perceive(q,s.id,'premise',s.premise,{source:'heard',speaker:p.id,domain:'story',root:t.id});}
  }
  if(['scene-accept','scene-counter','scene-decline'].includes(t.kind)){
   s.positions[p.id]=t.kind.slice(6);s.positionRevision[p.id]=t.revision;
   this.perceive(p,s.id,'pledge',t.kind==='scene-accept'?'accepted':s.positions[p.id],{source:'self',domain:'story',root:t.id});
   for(const id of t.deliveredTo)this.perceive(this.person(id),s.id,'pledge-'+p.id,s.positions[p.id],{source:'heard',speaker:p.id,domain:'story',root:t.id});
  }
  if(t.kind==='scene-perform'){s.performed[p.id]={at:this.time,heardBy:[...t.deliveredTo]};for(const id of t.deliveredTo)this.person(id).relations[p.id]=Math.min(100,this.person(id).relations[p.id]+2);}
  this.emit('scene-turn',p,`${p.name}：${t.text}`,t.deliveredTo,t.replyTo||null,false,{episode:s.id,act:t.kind});
 },
 tickDirector(){
  if(!this.director?.enabled||!this.brain)return;
  if(this.episode.caseId){this.tickSituations();return;}
  const s=this.episode;for(const p of this.people)this.deliverStoryBrief(p);
  if(this.minute>=s.deadline){
   if(s.status!=='ended'){for(const c of this.conversations.filter(c=>c.topic.episode===s.id&&c.status!=='closed'))this.closeConversation(c,'今天的活动先到这里，已经发生的事留到日结。');s.status='ended';s.result=episodeResult(this);this.emit('scene-outcome',null,`「${s.title}」：${s.result.summary}。`,[],null,false,{episode:s.id,result:clone(s.result)});
    for(const p of this.people)if(s.positions[p.id]==='accept'&&!s.prepared[p.id]){const e=this.emit('scene-unfinished',p,`${p.name}今天没能完成自己答应的准备。`,[],null,true,{episode:s.id});this.perceive(p,s.id,'pledge','unfinished',{source:'self',domain:'story',root:'event-'+e.id});}
   }return;
  }
  if(this.minute<s.meet)return;
  const stage=this.minute>=s.finale?'finale':'negotiate',field=stage==='finale'?'finalConversation':'conversation';
  const arrived=this.people.filter(p=>p.presence!=='away'&&s.arrived[p.id]===stage&&!p.task&&!p.conversationId);
  let c=this.conversation(s[field]);
  if(c?.status==='closed')return;
  if(!c&&arrived.length>=2&&(stage==='finale'||arrived.some(p=>p.id===s.lead))&&(arrived.length===5||this.minute>=(stage==='finale'?s.finale:s.meet)+14)){
   const leader=arrived.find(p=>p.id===s.lead)||arrived[0];
   const opened=this.openConversation(leader.id,arrived.filter(p=>p!==leader).map(p=>p.id),{topic:{kind:'scene',episode:s.id,label:s.title,premise:s.premise,stage},access:'open'});
   if(opened.ok){s[field]=opened.conversation.id;c=opened.conversation;s.status='active';}
  }
  if(c&&c.status!=='closed')for(const p of arrived){
   if(!c.members[p.id])this.addConversationInvite(c,this.person(c.host),p.id);
   else if(['missed','declined'].includes(c.members[p.id].status)&&!p.sceneRetry){p.sceneRetry=s.id;c.members[p.id]=this.newConversationMember(p.id,c.host);}
  }
 }
});}
