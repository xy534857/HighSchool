import {FURNITURE,OWN_DESK} from './layout.js';
import {WEEKDAYS} from './calendar.js';
import {episodeResult} from './director.js';
import {SITUATIONS} from './situations/catalog.js';
import {Apartment} from './scene.js';
import {Household,CAST,SPOTS} from './simulation.js';
import {SoarController,loadSources} from './soar/controller.js';
import {encodeSave,decodeSave,loadSave,storeSave,validateSave} from './storage.js';
import {ReflectionService,applyReflection,rollbackReflection,reportForModel,httpReflectionProvider} from './reflection.js';
const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=t=>`${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
// At 1x, four real seconds advance one game minute; conversation turns stay readable.
const GAME_MINUTES_PER_SECOND=.25;
const SIMULATION_STEP=.025;
let sim,apartment,brain,sources,baseRules='',generatedRules='',selected=null,object=null,speed=1,paused=false,follow=false,accumulator=0,last=0,uiTime=0,saveTime=0,speechNodes={},labelNodes={},feedSeq=-1,panelStamp='',toastTimer;
let initialLoad=null,returnSnapshot=null,savePending=false;
const reflection=new ReflectionService();let reflectionPump=false;
sim=new Household(123);
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3300);}
async function save(notice=false){
 if(!brain||savePending)return;savePending=true;
 try{await storeSave(sim.save());if(notice)toast('生活进度、个人记忆和学习结果已保存。');}
 catch(e){toast('保存失败：'+e.message+'。可在 Soar 面板下载完整存档。');}finally{savePending=false;}
}
function portrait(p){return `<div class="portrait" style="background-position-x:${p.index*25}%" aria-hidden="true"></div>`;}
function select(id){
 if(id.startsWith('object:')){object=id.slice(7);renderObject();return;}
 selected=selected===id?null:id;object=null;$('objectPanel').classList.add('hidden');panelStamp='';renderPanel();renderCast();
}
function status(p){if(p.presence==='away')return `${p.awayPlace} · ${time(sim.calendarFor(p).return)} 回家`;if(p.action==='incident'){const a=sim.incidents.find(c=>c.id===p.task?.caseId)?.pack.actions.find(a=>a.id===p.task?.token);return (p.moving?'去':'正在')+(a?.label||'处理惦记的事');}if(p.action==='prepareScene')return (p.moving?'去':'正在')+(sim.episode?.roles[p.id]?.job||'准备');const c=sim.activeConversation(p);if(c){const role={joining:'走过去加入谈话',speaking:'正在说话',listening:'正在听家人说话'}[p.conversationRole]||'参与谈话';return p.task&&p.conversationRole!=='joining'?`${sim.actions[p.action]?.label||'忙自己的事'} · ${role}`:role;}return p.suspendedTask?'等位置空出来，继续刚才的事':p.task?`${p.moving?'去':'正在'}${sim.actions[p.action]?.label||'忙自己的事'}`:'想想接下来做什么';}
const conversationSelection={};
function conversationCard(p){
 const c=sim.activeConversation(p)||sim.conversations.findLast(c=>c.members[p.id]),member=c?.members[p.id];
 const state={invited:'等待邀请送达',deferred:'稍后加入',declined:'这次不参加',missed:'没有接上话',joining:'正在走过来',active:'正在交谈',left:'已离开',cancelled:'邀请已结束'};
 const chosen=conversationSelection[p.id]||{};
 return `<details class="conversation-details" open><summary>一起说会儿话</summary>${c?`<div class="conversation-current"><b>${safe(c.topic.label||'家里的事')}</b> · ${c.status==='closed'?'已结束':'进行中'}<p>${Object.values(c.members).map(m=>`<span class="conversation-member ${c.floor?.speaker===m.id?'has-floor':''}">${safe(sim.person(m.id)?.name)} · ${safe(state[m.status])}</span>`).join('')}</p>${p.socialDecision?`<p class="small-note">我的判断：${safe(p.socialDecision.reason)}</p>`:''}${p.suspendedTask?`<p class="small-note">暂时放下${safe(sim.actions[p.suspendedTask.action]?.label)}，还剩 ${Math.ceil(p.suspendedTask.task.remaining)} 分钟。</p>`:''}<ol class="conversation-transcript">${(member?.heard||[]).slice(-8).map(t=>`<li><b>${safe(sim.person(t.from)?.name)}</b><span>${safe(t.text)}</span></li>`).join('')||'<li>等大家就位，再开始说话。</li>'}</ol>${sim.activeConversation(p)?'<button data-leave-conversation>先去忙自己的事</button>':''}</div>`:''}
 <label class="conversation-label" for="conversationTopic">聊什么</label><select id="conversationTopic">${Object.entries(sim.domain.conversation.topics).map(([key,t])=>`<option value="${safe(key)}" ${chosen.topic===key?'selected':''}>${safe(t.label)}</option>`).join('')}</select>
 <fieldset class="conversation-people"><legend>邀请谁一起聊</legend>${sim.people.filter(q=>q.id!==p.id).map(q=>`<label><input type="checkbox" data-conversation-person="${q.id}" ${(chosen.people||[]).includes(q.id)?'checked':''}>${q.name}</label>`).join('')}</fieldset>
 <div class="actions-grid"><button data-start-conversation>发起／邀请加入</button><button data-next-topic ${sim.activeConversation(p)?'':'disabled'}>接着聊这个话题</button></div>
 <label class="conversation-label" for="conversationAccess">加入方式</label><select id="conversationAccess"><option value="open" ${chosen.access!=='private'?'selected':''}>附近家人可以加入</option><option value="private" ${chosen.access==='private'?'selected':''}>只限这次邀请的人</option></select>
 <div class="conversation-groups">${sim.groups.filter(g=>g.members.includes(p.id)).map(g=>`<div><button data-invite-group="${safe(g.id)}">叫${safe(g.name)}聊聊（${g.members.length} 人）</button><button data-leave-group="${safe(g.id)}" aria-label="退出${safe(g.name)}">退出</button></div>`).join('')}</div>
 <label class="conversation-label" for="conversationGroupName">把所选家人邀请进新小组</label><input id="conversationGroupName" maxlength="24" placeholder="例如：晚饭后的小聚"><button data-make-group>建立小组并邀请</button><p class="small-note">每个人会自己决定。没听见、正忙着或想离开时，都可以不参加。</p></details>`;
}
const affectNames={neutral:'平静',uncertain:'不确定',angry:'生气',frustrated:'受挫',disappointed:'失望',grateful:'感激',relieved:'释然'};
const copingNames={verify:'询问核实',withdraw:'先缓一缓',discuss:'当面说开','seek-company':'找人陪伴',reciprocate:'回报帮助',defer:'稍后再说',repair:'修复误会',continue:'继续安排'};
const reasons={'no-evidence':'尚无经历','direct-observation':'亲眼查看','single-source':'单一转述','same-claim-no-proof':'重复说法没有新增证据','conflicting-evidence':'听到的说法与记忆不一致','observed-cooperation':'对方实际配合或兑现约定','explicit-commitment-broken':'明确约定没有兑现','known-conflicting-duty':'知道对方有冲突的安排','cause-not-known':'还不知道原因','own-goal-obstructed-cause-uncertain':'自己的安排受阻，但原因未确定','new-explanation-reappraised':'得到解释后重新判断','acknowledged-specific-harm':'对方承认了这件事的影响'};
function mood(p){if(sim.situationPersonalText(p).some(s=>Number(s.facts.fear)>15))return '有点害怕';const a=[...(p.affect||[])].sort((a,b)=>b.active-a.active)[0];return a?.active>10?affectNames[a.emotion]||a.emotion:p.affect?.some(a=>a.mood>12)?'还有些紧绷':'平静';}
function mindCard(p){const beliefs=Object.values(p.mental||{}).filter(b=>b.domain==='object');return `<details class="mind-details" open><summary>他眼中的家</summary>${beliefs.map(b=>`<p class="memory-line"><b>${safe(sim.objects[b.subject]?.name||b.subject)}</b>：${b.predicate==='location'?safe(SPOTS[b.value]?.name||'位置不明'):safe(String(b.value))+' 份'} · ${{known:'亲眼确认',tentative:'听说',disputed:'有冲突',unknown:'不知道'}[b.status]}<br><small>${safe(reasons[b.reason]||b.reason)} · ${time(b.at)}${b.source==='heard'?' · '+safe(sim.person(b.informant)?.name||b.informant)+'转述':''}</small></p>`).join('')||'<p>尚未查看物品。</p>'}<button data-seek="notebook">找练习本</button></details><details class="affect-details" open><summary>感受、原因与关系</summary>${(p.affect||[]).map(a=>`<p class="memory-line">对${safe(sim.person(a.subject)?.name||a.subject)} · ${safe(({help:'家务分担',quiet:'共同安静',cooperation:'合作',care:'关心',meal:'一起吃饭'})[a.domain]||a.domain)}<br><b>${safe(affectNames[a.emotion]||a.emotion)}</b> ${Math.round(a.active)} / 100 · 余留紧张 ${Math.round(a.mood)}<br>${safe(reasons[a.reason]||a.reason)}<br><small>准备${safe(copingNames[a.coping]||a.coping)} · 这方面的信任 ${Math.round(a.judgment)} · 依据 ${safe(a.provenance)}</small></p>`).join('')||'<p>当前没有明显的社交情绪。</p>'}</details>`;}

function renderCast(){
 $('cast').innerHTML=sim.people.map(p=>`<button class="cast-btn ${selected===p.id?'selected':''}" data-person="${p.id}" aria-label="查看${p.name}" aria-pressed="${selected===p.id}">${portrait(p)}<div><strong>${p.name}</strong><small>${status(p)}</small></div><span class="mood-dot" style="background:${p.hunger<25||p.energy<25?'#d38b61':'#8caf7a'}"></span></button>`).join('');
}
function need(label,value){return `<div class="need-row"><label>${label}</label><div class="track" role="meter" aria-label="${label}" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${value}%;background:${value<25?'#da946c':'#8baa75'}"></i></div><span>${Math.round(value)}</span></div>`;}
function renderPanel(){
 const el=$('personPanel'),p=sim.person(selected);el.classList.toggle('hidden',!p);if(!p)return;
 const stamp=[p.id,Math.floor(sim.time/2),p.action,p.task?.phase,p.goals.map(g=>g.progress).join(),p.memories.at(-1)?.id].join('-');if(stamp===panelStamp)return;panelStamp=stamp;
 const oldTarget=el.querySelector('#socialTarget')?.value||sim.people.find(x=>x.id!==p.id)?.id;
 const direct=[['eat','吃饭'],['cook','做饭'],['study','学习'],['work','写稿'],['watch','电视'],['play','玩耍'],['tidy','收拾'],['rest','休息'],['sleep','睡觉']].filter(([k])=>k!=='work'||p.id==='dad').filter(([k])=>k!=='cook'||p.id!=='xiaoyu');
 el.innerHTML=`<button class="panel-close" id="closePanel" aria-label="关闭人物详情">×</button><div class="person-head">${portrait(p)}<div><h2>${p.name}</h2><span>${mood(p)} · ${p.role.split(' · ')[0]}</span></div></div><div class="trait-tags">${p.traits.map(t=>`<span>${t}</span>`).join('')}</div>
 <div class="current-action"><b>${status(p)}</b>${p.task?`<span>${p.moving?'在路上':`还需约 ${Math.ceil(p.task.remaining)} 分钟`}</span>`:''}</div><div class="thought">${safe(p.thought)}</div><button class="rule-origin" data-open-rules="${p.id}">规则：${safe(p.task?.rule||p.decision?.rule||'初始化')} ↗</button>
 <div class="needs">${need('饱腹',p.hunger)}${need('精力',p.energy)}${need('乐趣',p.fun)}${need('社交',p.social)}</div>
 <div class="goals">${projectCard(p)}<div class="panel-kicker">今天这一段</div>${p.goals.map(g=>`<div class="goal-row"><span>${g.status==='done'?'✓ ':''}${safe(g.title)}${g.carried?'（接着昨天）':''}</span><small>${Math.round(Math.min(g.progress,g.target))}/${g.target}</small><div class="goal-track"><i style="width:${Math.min(100,g.progress/g.target*100)}%"></i></div></div>`).join('')}${p.promises.filter(pr=>!pr.done).map(pr=>`<p class="promise-note">答应${sim.person(pr.from).name}：${sim.actions[pr.kind].label}</p>`).join('')}</div>
 ${storyPerson(p)}${conversationCard(p)}${mindCard(p)}
 <details class="command-details"><summary>安排一个行动 <span>做完后继续自主生活</span></summary><div class="actions-grid">${direct.map(([k,l])=>`<button class="action-btn" data-action="${k}">${l}</button>`).join('')}</div></details>
 <details class="social-details"><summary>和家人互动</summary><select id="socialTarget" aria-label="选择交谈的家人">${sim.people.filter(x=>x.id!==p.id).map(x=>`<option value="${x.id}" ${oldTarget===x.id?'selected':''}>${x.name} · 亲近 ${Math.round(p.relations[x.id])}</option>`).join('')}</select><div class="actions-grid">${[['chat','聊聊天'],['askQuiet','请小声些'],['askHelp','请他帮忙'],['invite','叫来吃饭'],['apologize','主动和好'],['praise','夸一句']].map(([k,l])=>`<button class="action-btn" data-social="${k}">${l}</button>`).join('')}</div><p class="small-note">这是请求，对方会自己决定。</p></details>
 <details class="memory-details"><summary>最近记得的事</summary>${p.memories.slice(-4).reverse().map(m=>`<p class="memory-line"><time>${time(m.time)}</time> ${safe(m.text)}</p>`).join('')||'<p class="memory-line">还没有特别的事。</p>'}</details>`;
 // Preserve expanded controls and keyboard focus during live updates.
 for(const cls of openDetails)el.querySelector('.'+cls)?.setAttribute('open','');
}
let openDetails=new Set();
$('personPanel').addEventListener('change',e=>{if(!selected)return;const el=$('personPanel');conversationSelection[selected]={topic:el.querySelector('#conversationTopic')?.value,access:el.querySelector('#conversationAccess')?.value,people:[...el.querySelectorAll('[data-conversation-person]:checked')].map(n=>n.dataset.conversationPerson)};});
$('personPanel').addEventListener('click',e=>{
 const b=e.target.closest('[data-start-conversation],[data-invite-group],[data-leave-conversation],[data-make-group],[data-leave-group],[data-next-topic]');if(!b||!selected)return;
 const p=sim.person(selected),el=$('personPanel'),topic=el.querySelector('#conversationTopic').value,ids=[...el.querySelectorAll('[data-conversation-person]:checked')].map(n=>n.dataset.conversationPerson);let result;
 if(b.hasAttribute('data-leave-conversation')){sim.leaveConversation(p.id,'我先去忙自己的事');result={text:'结束参与，继续自己的安排。'};}
 else if(b.dataset.leaveGroup){sim.leaveGroup(p.id,b.dataset.leaveGroup);result={text:'已退出小组。'};}
 else if(b.dataset.inviteGroup)result=sim.inviteGroup(p.id,b.dataset.inviteGroup,topic);
 else if(b.hasAttribute('data-make-group')){result=sim.makeGroup(p.id,el.querySelector('#conversationGroupName').value,ids);if(result.ok)result=sim.inviteGroup(p.id,result.group.id,topic);}
 else if(b.hasAttribute('data-next-topic'))result=sim.queueConversationTopic(p.id,topic);
 else result=sim.openConversation(p.id,ids,{topic,access:el.querySelector('#conversationAccess').value});
 toast(result.text);panelStamp='';renderPanel();renderCast();
});
$('personPanel').addEventListener('toggle',e=>{if(e.target.tagName==='DETAILS'&&document.contains(e.target)){const cls=e.target.className;e.target.open?openDetails.add(cls):openDetails.delete(cls);}},true);
$('personPanel').addEventListener('click',e=>{if(e.target.closest('#closePanel')){selected=null;renderPanel();return;}const ruleButton=e.target.closest('[data-open-rules]');if(ruleButton){openRules(ruleButton.dataset.openRules);return;}const seek=e.target.closest('[data-seek]');if(seek&&selected){sim.seekObject(selected,seek.dataset.seek);toast('先按他记得的位置找，再由他决定继续查看哪里。');return;}const btn=e.target.closest('[data-action],[data-social]');if(!btn||!selected)return;const k=btn.dataset.action||btn.dataset.social;const t=btn.dataset.social?$('socialTarget').value:null;toast(sim.command(selected,k,t).text);panelStamp='';renderPanel();});
$('personPanel').addEventListener('focusin',()=>panelFocused=true);$('personPanel').addEventListener('focusout',()=>panelFocused=false);let panelFocused=false;
function renderObject(){
 const el=$('objectPanel');el.classList.remove('hidden');const all=object==='all',f=FURNITURE[object],p=sim.person(selected);
 const furniture=all?Object.values(FURNITURE).filter(f=>['bed','desk'].includes(f.type)):f?[f]:[];
 el.innerHTML=`<button class="panel-close" id="closeObject" aria-label="关闭物品详情">×</button><div class="dialog-kicker">${p?`当前选择：${p.name}`:'先选一位家人，再安排使用家具'}</div><h2>${safe(f?.name||'家中物品')}</h2>
 ${furniture.map(f=>`<div class="object-row"><b>${safe(f.name)}</b><span>${f.owner?sim.person(f.owner).name+'专用 · ':''}${sim.leases[f.id]?sim.person(sim.leases[f.id]).name+'正在用':'空闲'}</span>${p&&f.type==='bed'?`<button data-use="sleep" data-at="${f.id}" ${f.owner!==p.id?'disabled':''}>走过去睡觉</button>`:''}${p&&f.type==='desk'&&['dad','xue','xing'].includes(p.id)?`<button data-use="${p.id==='dad'?'work':'study'}" data-at="${f.id}" ${f.owner!==p.id?'disabled':''}>坐下${p.id==='dad'?'写稿':'学习'}</button>`:''}</div>`).join('')}
 ${all||object==='tv'?`<div class="object-row"><b>电视与沙发</b><span>${sim.home.tvOn?'有人在看':'未打开'} · ${sim.home.tvQuiet?'静音':'有声音'}</span><button data-world="quiet">${sim.home.tvQuiet?'恢复声音':'静音'}</button>${p?'<button data-use="watch">坐在沙发看电视</button>':''}</div>`:''}
 ${object==='sofa'&&p?'<button data-use="rest" data-at="sofa">坐下来休息</button>':''}
 ${object==='book'&&p?'<button data-use="read" data-at="book">到阅读角看书</button>':''}
 ${all||['stove','fridge','table'].includes(object)?`<div class="object-row"><b>饭与食材</b><span>${sim.home.food} 份饭 · ${sim.home.ingredients} 份食材</span><button data-world="food">添五份饭 · ¥30</button>${p&&['stove','all'].includes(object)?'<button data-use="cook">到灶台做饭</button>':''}${p&&['table','all'].includes(object)?'<button data-use="eat">到餐桌吃饭</button>':''}${p&&['fridge','all'].includes(object)?'<button data-use="snack">从冰箱拿零食</button>':''}</div>`:''}
 ${all?`<div class="object-row"><b>卧室门帘</b><span>${sim.space.screenClosed?'已拉上':'已拉开'}</span><button data-world="screen">${sim.space.screenClosed?'拉开':'拉上'}</button></div><div class="object-row"><b>刘星的练习本</b><span>实际在${safe(SPOTS[sim.objects.notebook.location]?.name)}</span><button data-move="desk">放回刘星书桌</button><button data-move="clean">放餐桌旁</button><button data-move="book">放书架</button></div>`:''}
 <p class="small-note">床和书桌各有主人。人物先走到使用位置，再坐下或上床。</p>`;
}
$('objectPanel').addEventListener('click',e=>{if(e.target.closest('#closeObject')){object=null;$('objectPanel').classList.add('hidden');return;}const move=e.target.closest('[data-move]');if(move){sim.moveObject('notebook',move.dataset.move);renderObject();return;}const w=e.target.closest('[data-world]'),u=e.target.closest('[data-use]');if(w){if(w.dataset.world==='food'&&sim.home.money<30)toast('家里的钱不够了。');else{sim.environment(w.dataset.world);toast('家里的条件变了，看看他们接下来怎么做。');}renderObject();}if(u){toast((u.dataset.at?sim.commandAt(selected,u.dataset.use,u.dataset.at):sim.command(selected,u.dataset.use)).text);renderObject();}});
function renderFeed(){
 renderStory();
 if(sim.seq===feedSeq)return;feedSeq=sim.seq;
 $('homeStats').innerHTML=`<span>热饭 <b>${sim.home.food}</b></span><span>整洁 <b>${Math.round(sim.home.clean)}</b></span><span>家用 <b>¥${sim.home.money}</b></span>`;
 const significant=['refuse','cooperate','resolution','promise','brokenPromise','distracted','distraction','rules','cooled','request','player','achievement','environment','result','conversation','conversation-turn','scene-turn','scene-prepared','scene-outcome','incident-event','returned','departed'];
 const events=sim.events.filter(e=>significant.includes(e.type)).slice(-4).reverse();
 $('activityFeed').innerHTML=events.length?events.map(e=>`<button class="activity-item ${['refuse','brokenPromise','distracted'].includes(e.type)?'tense':''}" data-event="${e.id}"><time>${time(e.time)}</time><span>${safe(e.text)}</span></button>`).join(''):'<p class="quiet-house">有人惦记着稿子，有人想玩，还有人开始饿了。先看一会儿，事情会自己发生。</p>';
 const n=sim.issues.filter(x=>x.status==='open').length;$('familyMood').textContent=n?`${n} 件事还没说开`:'各自忙着，也互相惦记';
}
$('activityFeed').addEventListener('click',e=>{const btn=e.target.closest('[data-event]');if(!btn)return;const ev=sim.events.find(x=>x.id===Number(btn.dataset.event));if(ev?.actor){selected=ev.actor;panelStamp='';renderPanel();renderCast();}});
function journal(){
 const today=sim.dayEvents.filter(e=>['achievement','refuse','cooperate','resolution','promise','brokenPromise','player','environment','cooled','conversation-turn','scene-turn','incident-event','returned','departed'].includes(e.type));
 const days=[...sim.diary,{day:sim.day,events:today}].reverse();
 $('journalEntries').innerHTML=storyHistory()+days.map(d=>`<article class="journal-entry"><div class="date">第 ${d.day} 天${d.day===sim.day?' · 还在继续':''}</div>${d.events.length?d.events.map(e=>`<p><time>${time(e.time)}</time> ${safe(e.text)}${e.cause?` <small>接着之前那件事</small>`:''}</p>`).join(''):'<p>今天还没有特别的事。</p>'}</article>`).join('');$('journalDialog').showModal();
}
async function restart(same,scenario=null){if(sim.reviewApplying){toast('正在应用日终规则，稍后再开始新生活。');return;}reflection.cancel();const seed=same?sim.seed:Date.now()%2147483647;brain.destroy();brain=new SoarController(brain.native,sources);sim=new Household(seed,null,{scenario}).attachBrain(brain);await brain.install('xing',generatedRules,{author:'ChatGPT 本轮生成',at:sim.time});selected=null;object=null;feedSeq=-1;panelStamp='';$('objectPanel').classList.add('hidden');for(const d of document.querySelectorAll('dialog[open]'))d.close();save();paused=false;renderPanel();renderCast();renderFeed();updatePause();toast(same?'回到了相同的初始状态。这次试试另一种介入。':'新的一段日子开始了。');}
function updatePause(){const b=$('pauseBtn');b.textContent=paused?'▶':'Ⅱ';b.setAttribute('aria-label',paused?'继续':'暂停');b.title=paused?'继续':'暂停';}
$('cast').addEventListener('click',e=>{const b=e.target.closest('[data-person]');if(b)select(b.dataset.person);});
$('pauseBtn').onclick=()=>{paused=!paused;updatePause();};
for(const b of document.querySelectorAll('[data-speed]'))b.onclick=()=>{speed=Number(b.dataset.speed);accumulator=0;for(const c of document.querySelectorAll('[data-speed]')){c.classList.toggle('active',c===b);c.setAttribute('aria-pressed',String(c===b));}};
$('rotateLeft').onclick=()=>apartment.rotate(-1);$('rotateRight').onclick=()=>apartment.rotate(1);$('zoomIn').onclick=()=>apartment.changeZoom(1);$('zoomOut').onclick=()=>apartment.changeZoom(-1);$('resetView').onclick=()=>apartment.reset();
$('helpBtn').onclick=()=>$('helpDialog').showModal();$('journalBtn').onclick=journal;$('saveBtn').onclick=()=>save(true);
$('homeBtn').onclick=()=>{object='all';renderObject();};
$('activityToggle').onclick=()=>{const hidden=$('activityBody').classList.toggle('hidden');$('activityToggle').textContent=hidden?'+':'−';};
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
$('restartBtn').onclick=()=>$('restartDialog').showModal();$('sameStart').onclick=()=>restart(true);$('newStart').onclick=()=>restart(false);
window.addEventListener('keydown',e=>{if(e.code==='Space'&&!['BUTTON','SELECT','INPUT','TEXTAREA','SUMMARY'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();paused=!paused;updatePause();}if(e.code==='Escape'){selected=null;object=null;$('objectPanel').classList.add('hidden');renderPanel();}});
window.addEventListener('pagehide',()=>save());
function updateLabels(){
 const spoken=[];
 const visibleSpeakers=new Set(sim.people.filter(p=>p.speech&&p.presence!=='away').sort((a,b)=>b.speech.until-a.speech.until).slice(0,2).map(p=>p.id));
 for(const p of sim.people){let node=labelNodes[p.id];if(!node){node=document.createElement('div');node.className='name-tag';labelNodes[p.id]=node;$('labels').appendChild(node);}const pos=apartment.project(p);if(!pos){node.classList.add('hidden');speechNodes[p.id]?.classList.add('hidden');continue;}node.style.left=pos.x+'px';node.style.top=pos.y+'px';node.className='name-tag'+(p.id===selected?' selected':'');node.innerHTML=`${p.name}<small>${status(p)}</small>`;
  let bubble=speechNodes[p.id];if(!bubble){bubble=document.createElement('div');bubble.className='speech hidden';speechNodes[p.id]=bubble;$('labels').appendChild(bubble);}
  if(visibleSpeakers.has(p.id)){const bpos=apartment.project(p,.65);if(spoken.some(q=>Math.abs(q.x-bpos.x)<220&&Math.abs(q.y-bpos.y)<100))bpos.y-=110;spoken.push(bpos);bubble.classList.remove('hidden');bubble.style.left=Math.max(120,Math.min(innerWidth-120,bpos.x))+'px';bubble.style.top=Math.max(140,bpos.y)+'px';bubble.innerHTML=`<strong>${p.name}</strong>${safe(p.speech.text)}`;}else bubble.classList.add('hidden');
 }
}
function frame(ms){
 const dt=Math.min(.1,(ms-last)/1000||.016);last=ms;
 if(!paused&&!sim.reviewApplying&&!document.querySelector('dialog[open]')){accumulator+=dt*GAME_MINUTES_PER_SECOND*speed;let n=0;while(accumulator>=SIMULATION_STEP&&n++<16){try{sim.tick(SIMULATION_STEP);}catch(e){paused=true;updatePause();toast('Soar 决策停止：'+e.message);break;}accumulator-=SIMULATION_STEP;}}
 apartment.update(sim.people,dt,ms/1000,selected,sim.minute,sim);if(apartment.props.get('cake'))apartment.props.get('cake').visible=sim.home.snacks>0;
 updateLabels();uiTime+=dt;saveTime+=dt;
 if(uiTime>.55){uiTime=0;$('clock').textContent=time(sim.time);$('dayLabel').textContent=`第 ${sim.day} 天 · ${WEEKDAYS[sim.calendarFor(sim.people[0]).weekday]} · ${sim.minute<400?'夜深了':sim.minute<660?'上午':sim.minute<840?'午后':sim.minute<1080?'下午':sim.minute<1260?'傍晚':'夜晚'}`;$('weather').textContent=sim.minute<400||sim.minute>1200?'☾':'☀';renderCast();if(!panelFocused)renderPanel();renderFeed();renderRoutineBrief();pumpReflection();}
 if(saveTime>30){saveTime=0;save();}requestAnimationFrame(frame);
}
async function boot(){
 try{
  apartment=new Apartment($('scene'),select);$('loadingText').textContent='正在加载 Soar 9.6.5 原生内核…';
  [sources,generatedRules]=await Promise.all([loadSources(),fetch('./soar/learned/xing-v2.soar').then(r=>{if(!r.ok)throw Error('规则文件加载失败');return r.text();})]);baseRules=sources.common;
  try{initialLoad=await loadSave();}catch(e){toast('无法读取上次进度：'+e.message);}
  sim=new Household(123,initialLoad);brain=await SoarController.create(sources);sim.attachBrain(brain);
  if(!initialLoad)await brain.install('xing',generatedRules,{author:'ChatGPT 本轮生成',input:'真实学习受干扰事件',at:sim.time});
  $('engineStatus').textContent='5 人 · 每日家庭剧';renderCast();renderFeed();$('loading').classList.add('hidden');requestAnimationFrame(frame);
 }catch(err){console.error(err);$('loading').innerHTML='<div class="error-message"><h2>小屋启动遇到了问题</h2><p>'+safe(err.message)+'</p><button onclick="location.reload()">重新打开</button></div>';}
}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function openRules(id=selected||'xing'){
 $('rulePerson').value=id;renderRules();$('rulesDialog').showModal();
}
function renderRules(){
 const id=$('rulePerson').value,p=sim.person(id),inspection=brain.inspect(id),d=brain.traces[id]||p.decision||{};
 $('ruleSource').value=brain.rules[id]?.at(-1)?.source||(id==='xing'?generatedRules:'');
 const method={accommodate:'接受请求','protect-plan':'保留自己的安排','offer-later':'商量稍后兑现'}[d.method];
 $('ruleRuntime').innerHTML=`<b>${p.name} · 规则版本 ${brain.rev[id]||0}</b><p>当前行动：${safe(p.task?.rule||d.rule||'等待')}<br>最近思考：${d.cycles||0} 个决策周期 · ${(d.elapsed||0).toFixed(2)} ms</p>${method?`<p>选择：${method}<br>考虑：${safe(d.concern)}<br>回忆来源：${safe(d['memory-source']||'本次没有召回')}</p>`:''}`;
 $('ruleFacts').textContent=JSON.stringify(brain.inputs[id]?.facts||sim.facts(p),null,2);
 $('ruleTrace').textContent=[...(d.fired||[]),'',...(p.socialDecision?.fired||[])].join('\n');
 $('rulePlan').textContent=JSON.stringify({intention:p.plan,routine:p.routine,decision:p.explanation,planningTrace:p.planning?.fired},null,2);
 $('ruleCognition').textContent=JSON.stringify({goal:d.goal||p.goals[0],commitment:d.commitment,recollection:d.recollection,interpretation:d.interpretation,method:d.method,concern:d.concern,conversation:p.socialDecision},null,2);
 $('ruleMemory').textContent=inspection.memory;
 $('ruleEpisodes').textContent=inspection.episodes;
 $('ruleLearning').textContent=inspection.rl;
 $('ruleChunks').textContent=inspection.chunks||'尚未遇到需要编译的子问题。';
 $('ruleRewards').textContent=JSON.stringify(inspection.training.slice(-8),null,2);
 $('rulePersonal').textContent=sources.people[id];
 $('ruleNotice').textContent=id==='xing'?'这组规则使用 Soar 召回的亲身经历改变判断。没有相应经历时不会触发。':'共享规则之上，每个人使用自己的检索线索、判断规则和结果评价。可加载新的 learned* productions。';
 $('rulePerson').dataset.current=id;
}
$('rulesBtn').onclick=()=>openRules();$('rulePerson').onchange=renderRules;
$('loadCoping').onclick=async()=>{try{const r=await fetch('./soar/learned/xing-clarify.soar');if(!r.ok)throw Error('规则未能加载');$('rulePerson').value='xing';renderRules();$('ruleSource').value=await r.text();$('ruleNotice').textContent='ChatGPT 根据实际受挫记录生成：只有精力充足、原因未明时，才先问本人。点击应用规则后生效。';}catch(e){toast(e.message);}};
$('loadGenerated').onclick=()=>{$('rulePerson').value='xing';renderRules();$('ruleSource').value=generatedRules;};
$('applyRules').onclick=async()=>{
 const id=$('rulePerson').value,source=$('ruleSource').value,btn=$('applyRules');btn.disabled=true;$('ruleNotice').textContent='原生 Soar 正在解析并校验…';
 try{const result=await brain.install(id,source,{author:source===generatedRules?'ChatGPT 本轮生成':'用户粘贴的规则',at:sim.time});
  sim.rulesVersion++;sim.person(id).nextDecision=sim.time;sim.emit('rules',sim.person(id),`${sim.person(id).name}加载了 ${result.names.length} 条新规则。`);save();renderRules();$('ruleNotice').textContent=`已通过 Soar 原生校验并加载：版本 ${result.revision}。关闭窗口后继续执行。`;
 }catch(e){$('ruleNotice').textContent='未加载，原规则继续有效：'+e.message;}finally{btn.disabled=false;}
};
$('removeRules').onclick=()=>{const id=$('rulePerson').value;brain.remove(id);sim.rulesVersion++;sim.person(id).nextDecision=sim.time;save();renderRules();$('ruleNotice').textContent='新增规则已撤回，基础 Soar 规则继续运行。';};
$('exportState').onclick=()=>{
 const id=$('rulePerson').value,p=sim.person(id);const context={instruction:'基于这个人的 Soar 记忆和现有语义，生成 learned* 命名的原生 productions。给出适用条件、证据和可能失效条件。不得规定后续剧情或直接修改世界。',kernel:'Soar 9.6.5',person:{id:p.id,name:p.name},domain:{...sim.domain,goals:{[id]:sim.domain.goals[id]},projects:{[id]:sim.domain.projects[id]}},currentFacts:sim.facts(p),available:sim.affordances(p),commonRules:baseRules,personalRules:sources.people[id],installedRules:brain.rules[id],cognition:brain.inspect(id),time:sim.time};
 download(id+'-soar-context.json',JSON.stringify(context,null,2));
};
$('exportRules').onclick=()=>download($('rulePerson').value+'-policy.soar',$('ruleSource').value,'text/plain');
$('showBase').onclick=()=>download('family-base.soar',baseRules,'text/plain');
$('refreshRules').onclick=renderRules;
async function restoreHouse(snapshot){
 if(sim.reviewApplying)throw Error('正在应用日终规则，请稍后读档');
 validateSave(snapshot);const candidate=new SoarController(brain.native,sources);let restored;
 try{restored=new Household(123,snapshot).attachBrain(candidate);}catch(e){candidate.destroy();throw e;}
 reflection.cancel();brain.destroy();brain=candidate;sim=restored;accumulator=0;
 feedSeq=-1;panelStamp='';selected='xing';object=null;$('objectPanel').classList.add('hidden');await save();renderCast();renderFeed();renderPanel();
}
$('downloadSave').onclick=()=>download('summer-family-full-save.json',encodeSave(sim.save()));
$('importSave').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{await restoreHouse(decodeSave(await file.text()));paused=true;updatePause();renderRules();toast('完整存档已恢复，关闭面板后点击继续。');}catch(err){toast('未读入：'+err.message);}e.target.value='';};
$('loadCheckpoint').onclick=async()=>{
 try{save();if(!returnSnapshot)returnSnapshot=sim.save();const response=await fetch('./soar/checkpoint.json');if(!response.ok)throw Error('存档读取失败');await restoreHouse(decodeSave(await response.text()));$('rulesDialog').close();paused=true;updatePause();$('returnHouse').disabled=false;toast('已暂停在真实测试存档。刘星已有亲身被打扰的记忆。加载或撤回规则，再请他把电视调小。');}catch(e){toast(e.message);}
};
$('returnHouse').onclick=async()=>{if(returnSnapshot){await restoreHouse(returnSnapshot);returnSnapshot=null;$('returnHouse').disabled=true;renderRules();toast('已回到你刚才的家。');}};
function projectCard(p){
 if(!p.plan)return '';
 const plan=p.plan,steps=p.explanation?.alternatives||[];
 return `<div class="project-card"><div class="panel-kicker">这几天的打算 · ${plan.milestones}/${plan.target}</div><b>${safe(plan.title)}</b><p>${safe(plan.motive)}</p><small>第 ${plan['started-day']} 天开始 · ${plan.status==='done'?'已完成':'持续推进中'}</small></div><details class="plan-details"><summary>接下来为什么这样安排</summary><p>${safe(p.explanation?.reason||'还在形成计划')}</p>${steps.length?`<ul>${steps.map(a=>`<li>${safe(a.label)}：约 ${a.minutes} 分钟有效工作${a.wait?'（含等待 '+a.wait+' 分钟）':''}${a.selected?' · 当前较快':''}</li>`).join('')}</ul>`:''}<p>${p.goals[0]?.status==='done'?'今天的阶段目标已完成，饭点和睡觉仍按家庭作息。':'完成当前行动后，重新检查身体、承诺和资源；在工作学习时段继续推进，未完成目标跨日保留。'}</p><small>计划 ID：${safe(plan.uid)}</small></details>`;
}
function storyPerson(p){
 const e=sim.episode;if(!e?.briefed.includes(p.id))return '';
 if(e.caseId)return `<div class="project-card"><div class="panel-kicker">自己的零用钱 · ¥${sim.storyEconomy.wallets[p.id]}</div>${sim.situationPersonalText(p).map(s=>`<b>${safe(s.title)}</b><p>${safe(s.want)}</p><small>${safe(s.last||'还在按自己的处境考虑怎么做')}</small>${s.facts.fear>0?`<p>害怕 ${Math.round(s.facts.fear)} / 100</p>`:''}${s.debts.map(d=>`<p>还欠${sim.person(d.creditor).name} ${d.amount} 元</p>`).join('')}`).join('<hr>')}</div>`;
 return `<div class="project-card"><div class="panel-kicker">今天惦记着 · ${safe(e.title)}</div><p>${safe(e.roles[p.id].want)}</p><small>${e.performed[p.id]?'已带着准备参加':e.prepared[p.id]?'已完成：'+safe(e.roles[p.id].job):e.positions[p.id]==='accept'?'答应准备：'+safe(e.roles[p.id].job):e.positions[p.id]==='counter'?'提出了自己的条件':e.positions[p.id]==='decline'?'这次决定不参加':'还没有答应，碰头时说说自己的想法'}</small></div>`;
}
function renderStory(){
 const e=sim.episode;if(!e)return;const storyOpen=[...$('storyBrief').querySelectorAll('details')].map(d=>d.open);
 const result=episodeResult(sim),home=sim.people.filter(p=>p.presence!=='away').length;
 if(e.caseId){const cs=sim.incidents.find(s=>s.id===e.caseId);$('storyBrief').innerHTML=`<h2>${safe(e.title)}</h2><p class="story-premise">${safe(e.premise)}</p><p class="story-time">${result.performed.length} 人已介入 · ${cs.events.length} 件事实际发生</p><details><summary>刚才发生了什么</summary>${cs.events.slice(-6).map(v=>`<p><b>${time(v.time)} ${safe(sim.person(v.actor).name)}</b><br>${safe(v.text)}<br><small>因为：${safe(v.reason)}</small></p>`).join('')||'<p>先看看家人各自怎么过，知道这件事的人会寻找机会。</p>'}<p>${safe(cs.pack.followup)}</p><a href="${safe(cs.pack.source?.url||'#')}" target="_blank" rel="noopener">灵感：${safe(cs.pack.source?.title||'新情景')}</a></details><details><summary>从另一种情景开始新生活</summary>${SITUATIONS.map(p=>`<button data-situation="${p.id}">${safe(p.title)}</button>`).join('')}<p>会开始一份新的生活进度。</p></details>${home===0?'<p>大家都出门了，放学下班后继续。</p>':''}`;[...$('storyBrief').querySelectorAll('details')].forEach((d,i)=>d.open=!!storyOpen[i]);return;}
 $('storyBrief').innerHTML=`<h2>${safe(e.title)}</h2><p class="story-premise">${safe(e.premise)}</p><p class="story-time">${time(e.meet)} 商量 · ${time(e.finale)} 再碰头</p><details><summary>${result.prepared.length} 人准备好 · ${result.performed.length} 人实际参加</summary><p>${safe(result.summary)}</p><small>${safe(e.origin)}</small></details>${home===0?'<p>大家都出门了，放学下班后回来。</p>':''}`;
}
$('storyBrief').addEventListener('click',e=>{const b=e.target.closest('[data-situation]');if(b)restart(true,b.dataset.situation);});
function storyHistory(){return `<div class="story-history">${[...sim.director.history].reverse().map(e=>`<article class="journal-entry"><b>第 ${e.day} 天 · ${safe(e.title)}</b><p>${safe(e.summary)}。</p><small>${e.revised?'大家提出条件后，修改过方案。':'保留每个人实际做出的选择。'}</small></article>`).join('')}</div>`;}
function renderRoutineBrief(){const p=sim.person('dad'),r=sim.routine(p),pending=sim.reviews.filter(r=>r.status==='pending').length;$('routineBtn').textContent=`${r['meal-window']?'正在'+r['meal-title']:r.night?'夜间休息':`距${r['meal-title']}约 ${Math.ceil(r['minutes-to-meal'])} 分钟`} · ${pending?pending+' 份日结':'作息与日结'} ↗`;}
function currentReview(){return sim.reviews.find(r=>r.report.requestId===$('reviewDay').value)||sim.reviews.at(-1);}
function renderRoutine(){
 const r=sim.domain.routine;
 $('routineSchedule').innerHTML=`<p>周一到周五出门，周末在家。工作日午饭在学校／单位吃。</p><div class="schedule-grid">${sim.people.map(p=>{const c=sim.calendarFor(p);return `<article><small>${p.name} · ${c.label}</small><b>${time(c.leave)}—${time(c.return)}</b><span>${c.place}</span></article>`;}).join('')}</div><div class="schedule-grid">${Object.values(r.meals).map(m=>`<article><small>${safe(m.title)}</small><b>${time(m.start)}—${time(m.end)}</b><span>${sim.person(m.cook).name}准备 · 提前 ${r.preparationMinutes} 分钟</span></article>`).join('')}</div><p class="fine">工作学习：${r.work.map(([a,b])=>time(a)+'—'+time(b)).join('、')}。每个人按自己的计划使用这些时段。</p><div class="sleep-row">${sim.people.map(p=>`<span>${p.name} ${time(r.sleep[p.id].bed)} 睡 / ${time(r.sleep[p.id].wake)} 起</span>`).join('')}</div>`;
 const old=$('reviewDay').value;$('reviewDay').innerHTML=sim.reviews.map(v=>`<option value="${safe(v.report.requestId)}">第 ${v.report.day} 天 · ${{pending:'待反思',thinking:'正在反思',applied:'已处理',stale:'旧版本'}[v.status]||v.status}</option>`).join('');if(sim.reviews.some(r=>r.report.requestId===old))$('reviewDay').value=old;else if(sim.reviews.length)$('reviewDay').value=sim.reviews.at(-1).report.requestId;
 renderReview();
}
function renderReview(){
 const review=currentReview();$('reflectionStatus').textContent=`规则版本 ${sim.rulesVersion} · ${reflection.provider?'已连接自动日结服务':'未连接自动模型；可导出日结由 ChatGPT 反思'}`;
 $('exportDirector').disabled=!review;
 $('exportReview').textContent=selected?'导出'+sim.person(selected).name+'的个人日结':'导出家庭作息日结';$('exportReview').disabled=!review;$('undoReview').disabled=!sim.ruleHistory?.length;
 $('reviewSummary').innerHTML=!review?'<p>过完第一天，这里会出现真实的日结。</p>':`<article class="day-review"><b>第 ${review.report.day} 天 · ${review.report.events.length} 条实际记录</b>${review.patch?`<p>${safe(review.patch.summary)}</p>${review.patch.changes.map(c=>`<p>${c.kind==='world'?'家庭规则 '+safe(c.path):sim.person(c.person).name+'的规则'}：${safe(c.reason)}<small>依据：事件 ${c.evidence.join('、')}</small></p>`).join('')}`:Object.values(review.report.people).map(p=>`<p>${p.name}：${p.meals.length} 次用餐 · ${p.disruptions.length} 次阻碍 · ${safe(p.goal?.title)} ${Math.round(p.goal?.progress||0)}/${p.goal?.target}</p>`).join('')}${review.error?`<p class="review-error">${safe(review.error)}</p>`:''}</article>`;
}
async function pumpReflection(){
 if(reflectionPump||!reflection.provider||sim.reviewApplying)return;
 const review=sim.reviews.find(r=>r.status==='pending'&&!r.error&&r.report.baseRuleVersion===sim.rulesVersion&&r.report.epoch===sim.reviewEpoch);if(!review)return;
 reflectionPump=true;const household=sim;
 try{await reflection.submit(household,review);if(household===sim){brain=sim.brain;await save();if($('routineDialog').open)renderRoutine();}}finally{reflectionPump=false;}
}
$('routineBtn').onclick=()=>{renderRoutine();$('routineDialog').showModal();};$('reviewDay').onchange=renderReview;
$('exportDirector').onclick=()=>{const r=currentReview();if(r)download(`director-day-${r.report.day}.json`,JSON.stringify(reportForModel(r.report,'director'),null,2));};
$('exportReview').onclick=()=>{const r=currentReview();if(r)download(`family-day-${r.report.day}-reflection.json`,JSON.stringify(reportForModel(r.report,selected),null,2));};
$('importReview').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{await applyReflection(sim,JSON.parse(await file.text()));brain=sim.brain;await save();renderRoutine();toast('日终修改已生效，之后的生活将使用新规则。');}catch(err){brain=sim.brain;toast('补丁未应用：'+err.message);}e.target.value='';};
$('undoReview').onclick=async()=>{reflection.cancel();try{await rollbackReflection(sim);brain=sim.brain;await save();renderRoutine();toast('已撤回规则修改，人物经历仍然保留。');}catch(e){brain=sim.brain;toast(e.message);}};
$('connectReflection').onclick=()=>{try{reflection.setProvider(httpReflectionProvider($('reflectionEndpoint').value));renderReview();pumpReflection();}catch(e){toast(e.message);}};
$('disconnectReflection').onclick=()=>{reflection.setProvider(null);renderRoutine();};
$('retryReflection').onclick=()=>{const r=currentReview();if(r){r.error=null;if(r.status==='pending')pumpReflection();}renderReview();};
$('loadReviewExample').onclick=async()=>{try{if(!returnSnapshot)returnSnapshot=sim.save();const r=await fetch('./soar/reflection/checkpoint.json');if(!r.ok)throw Error('验证存档读取失败');await restoreHouse(decodeSave(await r.text()));renderRoutine();toast('已打开真实运行两天后的家庭。查看第二天日结，再应用这份反思。');}catch(e){toast(e.message);}};
$('applyReviewExample').onclick=async()=>{try{const r=await fetch('./soar/reflection/day-2-patch.json');if(!r.ok)throw Error('反思补丁读取失败');await applyReflection(sim,await r.json());brain=sim.brain;await save();renderRoutine();toast('刘梅会在饭前留出时间，之后的采购按新规则判断。');}catch(e){brain=sim.brain;toast('未应用：'+e.message+'。请先打开两天后的验证存档。');}};
$('returnFromReview').onclick=async()=>{if(!returnSnapshot){toast('当前就在自己的家里。');return;}try{await restoreHouse(returnSnapshot);returnSnapshot=null;renderRoutine();toast('已回到刚才的家庭，生活与记忆一起恢复。');}catch(e){toast(e.message);}};
window.familySetReflectionProvider=provider=>{reflection.setProvider(provider);pumpReflection();};
window.familySnapshot=()=>sim.save();
boot();
