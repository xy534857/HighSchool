import {DOMAIN} from './domain.js';
import {senses} from './perception.js';

const copy=x=>structuredClone(x);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const live=m=>m&&['joining','active'].includes(m.status);
const questionKinds=new Set(['ask-location','ask-source','ask-reason','challenge','request','ask-day','scene-ask']);
const responseKinds=new Set(['answer','unknown','explain','respond']);
const socialActions={askQuiet:'quiet',askHelp:'help',invite:'meal',apologize:'apology'};

// Shared objects coordinate participation, routing and the speaking floor. Each
// agent receives its own inbox, observations and available acts, never the other
// agents' private minds. All willingness/content selections go through Soar.
export function installConversations(Household,route,SPOTS){Object.assign(Household.prototype,{
 initConversations(){
  this.domain.conversation??=copy(DOMAIN.conversation);
  for(const [k,a] of Object.entries(this.domain.actions))a.conversation??=DOMAIN.actions[k]?.conversation||'finish';
  this.conversationSerial??=0;this.conversations??=[];
  this.groups??=copy(this.domain.conversation.groups);
  for(const p of this.people){p.conversationId??=null;p.conversationRole??=null;p.suspendedTask??=null;p.socialDecisions??=[];}
 },
 conversation(id){return this.conversations.find(c=>c.id===id);},
 activeConversation(p){const c=this.conversation(p.conversationId);return c&&c.status!=='closed'?c:null;},
 conversationCompatibility(p){return !p.task?'parallel':p.task.phase==='walking'?'finish':this.actions[p.action]?.conversation||'finish';},
 conversationHolding(p){return !!this.activeConversation(p)&&(!p.task||this.activeConversation(p).members[p.id]?.status==='joining');},
 socialChoice(p,c,phase,options,extra={}){
  const m=c.members[p.id],routine=this.routine(p);
  const facts={mode:'conversation',phase,time:this.time,conversation:c.id,
   topic:m?.topic||c.topic,compatibility:this.conversationCompatibility(p),engaged:!!p.conversationId&&p.conversationId!==c.id,
   hunger:p.hunger,energy:p.energy,social:p.social,urgent:p.hunger<this.domain.needs.hunger.urgentBelow||p.energy<this.domain.needs.energy.urgentBelow,
   'routine-due':!!routine.night||(!!routine['meal-window']&&!!routine['meal-due']&&p.action!=='eat'),
   elapsed:this.time-(m?.joinedAt||this.time),'active-task':p.action,
   scene:this.storyFacts(p),heard:(m?.heard||[]).slice(-16),affect:p.affect||[],...extra};
  const available=options.map((o,i)=>({...o,id:'a'+i,target:o.target||'none',ordinal:i}));
  const d=this.brain.transact(p.id,facts,available),chosen=available.find(a=>a.id===d.id);
  if(!chosen)throw Error('对话选择没有对应的可执行行为');
  p.socialDecision={...d,phase,conversation:c.id,at:this.time};
  p.socialDecisions.push(p.socialDecision);p.socialDecisions=p.socialDecisions.slice(-24);
  return {...chosen,decision:d};
 },
 makeGroup(ownerId,name,ids){
  const owner=this.person(ownerId);if(!owner||typeof name!=='string'||!name.trim())return {ok:false,text:'请给小组起个名字。'};
  const members=[...new Set([ownerId,...ids])].filter(id=>this.person(id));
  if(members.length<2)return {ok:false,text:'至少选两位家人。'};
  const group={id:'group-'+(++this.conversationSerial),name:name.trim().slice(0,24),members:[ownerId],invited:members.filter(id=>id!==ownerId),owner:ownerId};
  this.groups.push(group);return {ok:true,group,text:'小组已建立，收到邀请并接受后会加入。'};
 },
 leaveGroup(id,groupId){
  const g=this.groups.find(g=>g.id===groupId);if(!g)return false;
  g.members=g.members.filter(x=>x!==id);g.invited=(g.invited||[]).filter(x=>x!==id);
  const p=this.person(id),c=this.activeConversation(p);if(c?.groupId===groupId)this.leaveConversation(id,'离开小组');return true;
 },
 inviteGroup(fromId,groupId,topic='day'){
  const g=this.groups.find(g=>g.id===groupId);if(!g?.members.includes(fromId))return {ok:false,text:'先加入这个小组。'};
  return this.openConversation(fromId,[...g.members,...(g.invited||[])].filter(id=>id!==fromId),{topic,groupId,access:'group'});
 },
 queueConversationTopic(id,topic){
  const p=this.person(id),c=p&&this.activeConversation(p);if(!c)return {ok:false,text:'先加入一场谈话。'};
  c.members[id].proposedTopic=this.topicSpec(topic,p);return {ok:true,text:'等这一轮说完，再提出这个话题。'};
 },
 topicSpec(topic,p){
  if(typeof topic==='object'&&topic)return copy(topic);
  if(this.domain.conversation.topics[topic])return copy(this.domain.conversation.topics[topic]);
  if(p.task?.speechAct==='ask-reason'||p.decision?.['speech-act']==='ask-reason')return {kind:'reason',domain:p.task?.topic||p.decision.topic,label:'把刚才的事问清楚'};
  const beliefs=Object.values(p.mental||{}).filter(b=>b.domain==='object'&&b.predicate==='location'&&b.status!=='unknown').sort((a,b)=>b.at-a.at);
  return beliefs.length?{kind:'object',subject:beliefs[0].subject,predicate:beliefs[0].predicate,label:'说说'+(this.objects[beliefs[0].subject]?.name||'家里的东西')}:{kind:'day',label:'聊聊各自的安排'};
 },
 openConversation(fromId,ids,options={}){
  const p=this.person(fromId);if(!p||p.presence==='away'||p.action==='sleep')return {ok:false,text:'现在没法发起谈话。'};
  ids=[...new Set(ids)].filter(id=>id!==fromId&&this.person(id)?.presence!=='away'&&this.person(id));if(!ids.length)return {ok:false,text:'请选择交谈对象。'};
  const own=this.activeConversation(p);if(own){let added=0;for(const id of ids)added+=this.addConversationInvite(own,p,id)?1:0;return {ok:added>0,conversation:own,text:added?'已向家人发出加入邀请。':'当前谈话无法添加这些人。'};}
  const existing=ids.length===1&&this.activeConversation(this.person(ids[0]));
  if(existing){
   if(existing.access==='private'||existing.access==='group'&&!this.groups.find(g=>g.id===existing.groupId)?.members.includes(fromId))return {ok:false,text:'对方正在参加另一场谈话。'};
   const inviter=this.person(ids[0]);if(!senses(this,p,inviter).understood)return {ok:false,text:'离得太远，暂时接不上话。'};
   if(!existing.members[fromId])existing.members[fromId]=this.newConversationMember(p.id,inviter.id);
   this.resolveConversationInvite(existing,p);return {ok:live(existing.members[fromId]),conversation:existing,text:'由他决定是否加入这次谈话。'};
  }
  if(p.task&&['finish','unavailable'].includes(this.conversationCompatibility(p)))return {ok:false,text:'先做完当前不能中断的步骤。'};
  const id='conversation-'+(++this.conversationSerial),c={id,status:'gathering',created:this.time,topic:this.topicSpec(options.topic,p),groupId:options.groupId||null,access:options.access||'open',host:fromId,
   anchor:(ids.length===1&&senses(this,p,this.person(ids[0])).visible&&distance(p,this.person(ids[0]))>2?{x:this.person(ids[0]).x,z:this.person(ids[0]).z}:{x:p.x,z:p.z}),members:{},turns:[],floor:null,nextTurn:this.time+.5,emptySince:null};
   this.conversations.push(c);c.members[fromId]=this.newConversationMember(fromId,fromId);if(!this.joinConversation(c,p,true)){c.status='closed';c.closedAt=this.time;return {ok:false,text:'这里找不到合适的交谈位置。'};}
  for(const id of ids)this.addConversationInvite(c,p,id,true);
  this.emit('conversation',p,`${p.name}想聊聊：${c.topic.label||'家里的事'}。`,[],null,false,{conversation:c.id});
  return {ok:true,conversation:c,text:'已发起谈话，家人会各自决定是否加入。'};
 },
 newConversationMember(id,from){return {id,from,status:'invited',invitedAt:this.time,retryAt:this.time,heard:[],handled:[],lastSpoke:-1,nextCheck:this.time,opened:false};},
 addConversationInvite(c,from,id,initial=false){
  if(c.status==='closed'||c.members[id]||Object.values(c.members).filter(m=>!['left','declined','missed'].includes(m.status)).length>=this.domain.conversation.maxParticipants)return false;
  if(c.access==='private'&&!initial||c.access==='group'&&!this.groups.find(g=>g.id===c.groupId)?.members.concat(this.groups.find(g=>g.id===c.groupId)?.invited||[]).includes(id))return false;
  c.members[id]=this.newConversationMember(id,from.id);return true;
 },
 observeConversation(p,c,kind,text,from=p.id,extra={}){
  this.brain.observe(p.id,{uid:`${c.id}-${kind}-${p.id}-${++this.perceptSerial}`,type:'event',kind,actor:from,target:p.id,source:from===p.id?'self':'heard',time:this.time,conversation:c.id,text,...extra});this.syncMind(p);
 },
 resolveConversationInvite(c,p){
  const m=c.members[p.id],from=this.person(m.from);if(!['invited','deferred'].includes(m.status))return;
  if(this.time>(m.expiresAt||m.invitedAt+this.domain.conversation.inviteMinutes)){m.status='missed';return;}
  if(this.time<m.retryAt||!from||c.members[m.from]?.status==='joining')return;
  const channel=senses(this,p,from);
  if(!m.received){
   // Invitations are spoken locally. Group membership is no radio channel.
   if(!channel.understood){m.status='missed';m.reason='没有听到邀请';return;}
   m.received=true;this.observeConversation(p,c,'conversation-invitation',from.name+'邀请我一起聊'+c.topic.label,from.id);
  }
  const compat=this.conversationCompatibility(p),near=distance(p,c.anchor)<=this.domain.conversation.range;
  const options=[{kind:'decline'},{kind:'defer'}];if(compat!=='unavailable'&&compat!=='finish'&&(compat!=='parallel'||!p.task||near))options.push({kind:'join'});
  const choice=this.socialChoice(p,c,'invitation',options,{compatibility:compat==='parallel'&&p.task&&!near?'finish':compat});m.decision=choice.decision;
  if(choice.kind==='join'){this.joinConversation(c,p);return;}
  m.status=choice.kind==='defer'?'deferred':'declined';m.reason=choice.decision.reason;m.retryAt=this.time+Math.max(1,Math.min(4,p.task?.remaining||2));
  if(m.status==='deferred'&&!m.expiresAt)m.expiresAt=Math.min(c.created+this.domain.conversation.maxMinutes,this.time+(p.task?.remaining||0)+this.domain.conversation.joinMinutes);
  if(!m.responded){m.responded=true;this.say(p,choice.decision.reason);this.observeConversation(p,c,'conversation-invitation-response',choice.decision.reason);}
 },
 conversationSlot(c,p){
  if(distance(p,c.anchor)<=2&&!Object.values(c.members).some(m=>m.id!==p.id&&live(m)&&m.slot&&distance(p,m.slot)<.5))return {x:p.x,z:p.z};
  for(const r of [1.1,1.8,2.4])for(let n=0;n<10;n++){
   const angle=(n+p.index*.7)*Math.PI/5,q={x:c.anchor.x+Math.cos(angle)*r,z:c.anchor.z+Math.sin(angle)*r},path=route(p,q),slot=path?.at(-1);
   if(slot&&distance(slot,q)<.55&&distance(slot,c.anchor)<3&& !Object.values(c.members).some(m=>m.id!==p.id&&live(m)&&distance(slot,m.slot||this.person(m.id))<.65))return slot;
  }return null;
 },
 joinConversation(c,p,initiator=false){
  if(p.conversationId&&p.conversationId!==c.id)return false;
  const m=c.members[p.id],compat=this.conversationCompatibility(p);
  if(p.task&&compat==='pause'){
   this.flushProgress(p);p.suspendedTask={task:copy(p.task),action:p.action,x:p.x,z:p.z,facing:p.facing};this.release(p);
  }
  m.joinedAt=this.time;m.topic=copy(c.topic);m.slot=p.task&&compat==='parallel'?{x:p.x,z:p.z}:this.conversationSlot(c,p);
  if(!m.slot){m.status='missed';this.resumeConversationTask(p);return false;}
  m.path=route(p,m.slot)||[];m.status=distance(p,m.slot)<.3?'active':'joining';m.nextCheck=this.time+2;
  if(initiator)m.opened=false;
  p.conversationId=c.id;p.conversationRole=m.status==='joining'?'joining':'listening';
  if(c.groupId){const g=this.groups.find(g=>g.id===c.groupId);if(g&&!g.members.includes(p.id)){g.members.push(p.id);g.invited=(g.invited||[]).filter(id=>id!==p.id);}}
  this.observeConversation(p,c,'conversation-joined','我加入了这次谈话。');return true;
 },
 resumeConversationTask(p){
  const saved=p.suspendedTask;if(!saved||p.conversationId||p.task)return false;
  const t=copy(saved.task),resource=t.resource;
  if(resource&&(!this.free(resource,p)||resource?.startsWith('desk')&&this.home.deskClosed)){p.thought='聊完了，等刚才的位置空出来再继续。';return false;}
  if(resource)this.leases[resource]=p.id;
  t.resumePhase=t.phase;t.phase='walking';t.path=route(p,{x:saved.x,z:saved.z})||[];t.resuming=true;
  p.task=t;p.action=saved.action;p.moving=t.path.length>0;p.suspendedTask=null;p.nextDecision=this.time+2;
  p.thought='接着刚才没做完的事。';return true;
 },
 leaveConversation(id,reason='先忙自己的事',{resume=true}={}){
  const p=this.person(id),c=p&&this.activeConversation(p);if(!c)return false;
  const m=c.members[id];m.status='left';m.leftAt=this.time;m.reason=reason;p.conversationId=null;p.conversationRole=null;p.moving=!!p.task?.path?.length;
  if(p.speech?.conversation===c.id)p.speech=null;
  if(c.floor?.speaker===id)c.floor=null;
  this.observeConversation(p,c,'conversation-left',reason);this.cool(p,'chat',this.domain.conversation.cooldownMinutes);p.nextDecision=this.time;
  if(resume)this.resumeConversationTask(p);return true;
 },
 closeConversation(c,reason='这次先聊到这里'){
  if(c.status==='closed')return;
  for(const m of Object.values(c.members))if(live(m))this.leaveConversation(m.id,reason);else if(['invited','deferred'].includes(m.status)){m.status='cancelled';m.reason=reason;}
  c.status='closed';c.closedAt=this.time;c.reason=reason;c.floor=null;
  for(const r of this.requests)if(r.conversation===c.id&&r.status==='pending'){r.status='cancelled';r.result='unanswered';}
  this.emit('conversation-ended',null,reason,[],null,false,{conversation:c.id});
 },
 localPending(c,p){
  const m=c.members[p.id];return m.heard.find(t=>t.from!==p.id&&questionKinds.has(t.kind)&&(t.to===p.id||t.to==='all')&&!m.handled.includes(t.id)&&!m.heard.some(a=>a.replyTo===t.id&&a.from===p.id&&responseKinds.has(a.kind))&&this.time-t.at<=this.domain.conversation.responseMinutes);
 },
 conversationActs(c,p){
  const m=c.members[p.id],topic=m.topic||c.topic,others=Object.values(c.members).filter(n=>n.id!==p.id&&n.status==='active'&&senses(this,this.person(n.id),p).understood),opts=[{kind:'pass'}];
  if(!others.length)return opts;
  if(topic.kind==='incident')return this.incidentActs(c,p);
  if(topic.kind==='scene')return this.sceneActs(c,p);
  const pending=this.localPending(c,p);
  if(pending){
   const base={replyTo:pending.id,target:pending.from,topic:pending.topic};
   if(pending.kind==='request')opts.push({...base,kind:'respond',requestId:pending.requestIds?.[p.id]||pending.requestId});
   else if(pending.kind==='ask-reason'){
    const response=p.responseHistory?.findLast(r=>r.from===pending.from&&r.request===pending.topic.domain&&(!pending.responseId||r.id===pending.responseId))||p.lastResponse;
    opts.push({...base,kind:response?.from===pending.from&&response?.request===pending.topic.domain?'explain':'unknown',response:response?.from===pending.from?copy(response):null});
   }else if(pending.kind==='ask-day')opts.push({...base,kind:'answer',plan:{title:p.goals.find(g=>g.status==='active')?.title||''},activity:p.action});
   else {
    const belief=this.known(p,pending.topic.subject,pending.topic.predicate||'location');
    opts.push({...base,kind:belief&&belief.value!=='unknown'?'answer':'unknown',claim:belief?copy(belief):null,evidenceQuestion:pending.kind==='ask-source'||pending.kind==='challenge'});
   }return opts;
  }
  // React only to delivered turns. A newcomer cannot see the shared transcript.
  for(const t of m.heard.slice().reverse()){
   if(t.from===p.id||m.handled.includes(t.id)||!others.some(n=>n.id===t.from))continue;
   if(t.kind==='respond'&&t.result==='declined'&&t.to===p.id)opts.push({kind:'ask-reason',target:t.from,topic:t.topic,replyTo:t.id,responseId:t.requestId});
   else if(t.claim&&!t.evidenceQuestion&&!(m.heard.some(h=>h.from===p.id&&h.replyTo===t.id))){
    const b=this.known(p,t.topic.subject,t.topic.predicate||'location');
    opts.push({kind:b?.status==='disputed'?'challenge':t.claim.source==='heard'?'ask-source':'ack',target:t.from,topic:t.topic,replyTo:t.id});
   }else if(['answer','unknown','explain','respond'].includes(t.kind)&&t.to===p.id)opts.push({kind:'ack',target:t.from,topic:t.topic,replyTo:t.id});
   if(opts.length>1)return opts;
  }
  if(m.proposedTopic)opts.push({kind:'propose-topic',target:'all',topic:copy(m.proposedTopic)});
  if(!m.opened){
   const target=others.sort((a,b)=>a.lastSpoke-b.lastSpoke||a.id.localeCompare(b.id))[0].id;
   if(topic.kind==='object'){
    const b=this.known(p,topic.subject,topic.predicate||'location');
    // A later participant can add their own evidence, not repeat a global script.
    if(c.turns.length&&b?.source==='seen'&&!m.heard.some(t=>t.from===p.id&&t.claim?.provenance===b.provenance))opts.push({kind:'contribute',target:'all',topic,claim:copy(b)});
    else opts.push({kind:'ask-location',target,topic});
   }else if(topic.kind==='request'&&p.id===(c.topicOwner||c.host))opts.push({kind:'request',target:others.length>1?'all':target,topic});
   else if(topic.kind==='reason'&&p.id===(c.topicOwner||c.host))opts.push({kind:'ask-reason',target,topic});
   else opts.push({kind:'ask-day',target,topic:{kind:'day',label:'各自的安排'}});
  }
  return opts;
 },
 renderConversationTurn(p,t){
  const name=this.objects[t.topic?.subject]?.name||'那件东西',other=this.person(t.to)?.name||'大家';
  if(t.kind==='incident-turn')return this.incidentSpeech(p,t);
  if(t.kind.startsWith('scene-'))return this.sceneSpeech(p,t);
  if(t.kind==='propose-topic')return `接着聊聊${t.topic.label||'另一件事'}，好吗？`;
  if(t.kind==='ask-location')return `${other}，你知道${name}在哪里吗？`;
  if(t.kind==='ask-source')return '这个消息你是听谁说的？';
  if(t.kind==='challenge')return '我记得的位置不一样，你是亲眼看见的吗？';
  if(t.kind==='ask-reason')return '刚才为什么没答应？我想听听你的原因。';
  if(t.kind==='ask-day')return `${other}，你接下来准备做什么？`;
  if(t.kind==='unknown')return '这件事我还不知道，得再问问或去看看。';
  if(t.kind==='ack')return '好，我听到了，先记着这个说法。';
  if(t.kind==='explain')return t.response?.['goal-threat']==='yes'?'刚才手头的安排会被打断，我想先把那件事做完。':'我当时想先按自己的安排来。';
  if(t.claim){const b=t.claim,where=SPOTS[b.value]?.name||'记得的地方',source=b.source==='heard'?`听${this.person(b.informant)?.name||'别人'}说`:'上次亲眼看见';return `${name}，我${source}${b.predicate==='location'?'在'+where:'还有 '+b.value+' 份'}${b.status==='disputed'?'，不过现在有不同的说法':'，还得留意有没有变化'}。`;}
  if(t.plan)return t.plan.title?`我想接着${t.plan.title}。`:`我准备${this.actions[t.activity]?.label||'看看接下来有什么要做的'}。`;
  return '我们慢慢说。';
 },
 speakConversation(c,p,act){
  const m=c.members[p.id],t={...copy(act),id:c.id+'-turn-'+(c.turns.length+1),from:p.id,to:act.target,at:this.time,deliveredTo:[]};t.rule=act.decision?.rule;delete t.decision;delete t.belief;delete t.done;
  if(t.replyTo)m.handled.push(t.replyTo);m.opened=true;m.lastSpoke=this.time;
  // These are public assertions. Do not copy private appraisal or search traces
  // into a listener's Soar frame merely because they were used to compose speech.
  if(t.claim)t.claim=Object.fromEntries(['subject','predicate','value','source','informant','provenance','status','at'].map(k=>[k,t.claim[k]]));
  if(t.response)t.response=Object.fromEntries(['id','from','request','at','goal-threat'].filter(k=>t.response[k]!==undefined).map(k=>[k,t.response[k]]));
  if(t.kind==='request'){
   t.requestIds={};const receivers=Object.values(c.members).filter(n=>n.status==='active'&&n.id!==p.id&&(t.to==='all'||t.to===n.id)&&senses(this,this.person(n.id),p).understood);
   for(const n of receivers){this.ask(p,this.person(n.id),t.topic.domain,null,c.id);const r=this.requests.findLast(r=>r.from===p.id&&r.to===n.id&&r.kind===t.topic.domain&&r.status==='pending');if(r)t.requestIds[n.id]=r.id;}
   if(!receivers.length)return false;t.text=p.speech.text;
  }else if(t.kind==='respond'){
   const r=this.requests.find(r=>r.id===t.requestId);if(!r||r.status!=='pending')return false;
   this.resolveRequest(r);t.result=r.result;t.text=p.speech?.text||'刚才的情况已经变了。';
  }else t.text=this.renderConversationTurn(p,t);
  if(c.floor){const last=this.person(c.floor.speaker);if(last?.speech?.conversation===c.id)last.speech=null;}
  c.floor={speaker:p.id,turn:t.id,until:this.time+this.domain.conversation.turnMinutes};c.nextTurn=c.floor.until;
  this.say(p,t.text);p.speech.until=c.floor.until;p.speech.conversation=c.id;p.conversationRole='speaking';
  const listeners=Object.values(c.members).filter(n=>n.status==='active'&&n.id!==p.id);
  for(const n of listeners){const q=this.person(n.id);if(!senses(this,q,p).understood)continue;
   t.deliveredTo.push(q.id);q.conversationRole='listening';q.social=Math.min(100,q.social+2);
   if(t.claim)this.tell(p.id,q.id,{subject:t.claim.subject,predicate:t.claim.predicate,value:t.claim.value,root:t.claim.provenance});
   if(t.kind==='explain'&&t.to===q.id&&t.response?.['goal-threat']==='yes')this.tell(p.id,q.id,{subject:p.id,predicate:'reliability',domain:t.topic.domain,kind:'social',value:'correction',explanation:'constrained',root:`explanation-${p.id}-${t.response.id??t.response.at}-${t.topic.domain}`});
   this.observeConversation(q,c,'conversation-turn',t.text,p.id,{turn:t.id,'speech-act':t.kind,replyTo:t.replyTo||'none'});
  }
  p.social=Math.min(100,p.social+(t.deliveredTo.length?2:0));
  if(t.kind==='incident-turn')this.recordIncidentTurn(c,p,t);
  if(t.kind.startsWith('scene-'))this.recordSceneTurn(c,p,t);
  c.turns.push(t);m.heard.push(copy(t));for(const id of t.deliveredTo){const publicTurn=copy(t);delete publicTurn.rule;c.members[id].heard.push(publicTurn);}
  if(t.kind==='propose-topic'){c.topic=copy(t.topic);c.topicOwner=p.id;m.proposedTopic=null;for(const id of [p.id,...t.deliveredTo]){c.members[id].topic=copy(t.topic);c.members[id].opened=false;}}
  this.observeConversation(p,c,'conversation-turn',t.text,p.id,{turn:t.id,'speech-act':t.kind});
  const event=this.emit('conversation-turn',p,`${p.name}：${t.text}`,[],null,false,{conversation:c.id,turn:t.id,'speech-act':t.kind,replyTo:t.replyTo||null});event.observedBy=[p.id,...t.deliveredTo];return true;
 },
 tickConversations(dt){
  const spec=this.domain.conversation;
  for(const p of this.people)if(!p.conversationId&&p.suspendedTask)this.resumeConversationTask(p);
  for(const c of this.conversations.filter(c=>c.status!=='closed')){
   for(const m of Object.values(c.members)){
    const p=this.person(m.id);if(!p)continue;
    if(['invited','deferred'].includes(m.status))this.resolveConversationInvite(c,p);
    if(!live(m))continue;
    if(p.presence==='away'||p.action==='sleep'){this.leaveConversation(p.id,'睡着了，谈话中断');continue;}
    if(this.time>=m.nextCheck){m.nextCheck=this.time+2;const a=this.socialChoice(p,c,'participation',[{kind:'stay'},{kind:'leave'}]);if(a.kind==='leave'){this.leaveConversation(p.id,a.decision.reason);continue;}}
    if(m.status==='joining'){
     if(this.time-m.joinedAt>spec.joinMinutes){this.leaveConversation(p.id,'没能找到合适的说话位置');continue;}
     let remaining=dt*1.4;while(m.path.length&&remaining>0){const q=m.path[0],d=distance(p,q);p.facing=Math.atan2(q.x-p.x,q.z-p.z);if(d<=remaining){p.x=q.x;p.z=q.z;remaining-=d;m.path.shift();}else{p.x+=(q.x-p.x)*remaining/d;p.z+=(q.z-p.z)*remaining/d;remaining=0;}}
     p.moving=m.path.length>0;if(!p.moving){m.status='active';p.conversationRole='listening';}
    }
    if(m.status==='active'){
     const other=this.person(c.floor?.speaker)||this.person(Object.values(c.members).find(n=>n.id!==p.id&&n.status==='active')?.id);
     if(other&&other.id!==p.id)p.facing=Math.atan2(other.x-p.x,other.z-p.z);
     const partners=Object.values(c.members).filter(n=>n.id!==p.id&&n.status==='active');
     if(partners.length&&!partners.some(n=>distance(p,this.person(n.id))<=spec.range&&senses(this,p,this.person(n.id)).understood)){
      m.disconnectedAt??=this.time;if(this.time-m.disconnectedAt>spec.responseMinutes)this.leaveConversation(p.id,'离开或听不清，结束这次交谈');
     }else m.disconnectedAt=null;
    }
   }
   const active=Object.values(c.members).filter(m=>m.status==='active'),pending=Object.values(c.members).some(m=>['invited','deferred','joining'].includes(m.status));
   if(this.time-c.created>(c.topic.kind==='scene'?45:spec.maxMinutes)||c.turns.length>=spec.maxTurns){this.closeConversation(c,'先把各自的事接着做，之后再聊');continue;}
   if(active.length<2){if(!pending)this.closeConversation(c,'这次谈话结束了，各自继续生活');continue;}
   if(c.status==='gathering'&&Object.values(c.members).some(m=>m.status==='joining'||m.status==='invited'))continue;
   c.status='active';if(this.time<c.nextTurn)continue;
   if(c.floor){const old=this.person(c.floor.speaker);if(old?.speech?.conversation===c.id)old.speech=null;if(old?.conversationId===c.id)old.conversationRole='listening';c.floor=null;}
   // The protocol gives addressed questions priority, then longest waiting. It
   // never chooses what a person says; each bid was selected by that agent.
   const bids=[];for(const m of active){const p=this.person(m.id),options=this.conversationActs(c,p),a=this.socialChoice(p,c,'turn',options);if(a.kind!=='pass')bids.push({p,m,a,reply:!!this.localPending(c,p)});}
   bids.sort((a,b)=>Number(b.reply)-Number(a.reply)||a.m.lastSpoke-b.m.lastSpoke||a.m.joinedAt-b.m.joinedAt||a.p.id.localeCompare(b.p.id));
   if(bids.length){c.emptySince=null;this.speakConversation(c,bids[0].p,bids[0].a);}
   else {c.emptySince??=this.time;c.nextTurn=this.time+1;if(!pending&&this.time-c.emptySince>2)this.closeConversation(c,'想问的事暂时说完了，下次接着聊');}
  }
  this.conversations=this.conversations.filter(c=>c.status!=='closed'||this.time-c.closedAt<1440).slice(-60);
 },
});}
export {socialActions};
