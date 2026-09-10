import {InferenceBroker,httpProvider} from '../llm/broker.js';
import {accessReason} from '../foundation/environment.js';
import {GameBridge} from './bridge.js';
import {CampusScene} from './scene.js';
import {CampusMap} from './map.js';
import {saveGame,loadGame} from './storage.js';
let inference=null,inferenceStatus={pending:[],history:[]},inferenceMode='manual-import';
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={hunger:'饱食',energy:'精力',bladder:'如厕',social:'社交',thirst:'水分',hygiene:'清洁',fun:'乐趣'};
const roomIcons={classroom:'▤',office:'▱',bathroom:'◧',club:'♫',playground:'◉',courtyard:'❋',library:'▥',canteen:'♨',infirmary:'✚'};
const fields={paper:'画纸',servings:'剩余餐份',pages:'页数',title:'标题',working:'运转正常',open:'柜门打开',books:'藏书',water:'浇水进度',topic:'公告',condition:'状态'};
const periods={morning:'早间自由活动',class:'课堂时间',break:'大课间',lunch:'午餐时间','after-school':'放学后',night:'晚间自习'};
let bridge,scene,snapshot,campusMap,visualTime=0,room='classroom',selection=null,speed=1,paused=false,ticking=false,elapsed=0,lastFrame=0,menuVersion=0,lastMenu='',chatLast='',toastTimer,follow=true,ready=false,saveBusy=false,currentRows=[],lastPositionAt=0,positionInterval=0;
const time=t=>`${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const setHTML=(id,value)=>{if($(id).innerHTML!==value)$(id).innerHTML=value;};
const person=id=>snapshot?.actors.find(a=>a.id===id),player=()=>person(snapshot?.player);
function toast(text,error=false){$('toast').textContent=text;$('toast').style.background=error?'#875d48':'#284f43';$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function currentPeriod(t){const m=t%1440;return m<510?'morning':m<600?'class':m<625?'break':m<720?'class':m<790?'lunch':m<900?'class':m<1110?'after-school':'night';}
async function refresh(){snapshot=await bridge.request('snapshot');render();}
async function start(saved=null){
 ready=false;$('loading').hidden=false;$('retry').hidden=true;$('loading-text').textContent='正在准备校园与同学们的记忆…';
 try{
  inference?.close();inference=null;bridge?.destroy();bridge=new GameBridge();snapshot=await bridge.request('init',{saved});
  if(!scene){scene=new CampusScene($('canvas-wrap'),$('world-labels'),select,(r,x,z)=>command('walk-to',{}, {room:r,x:Math.max(snapshot.rooms[r].bounds.minX+.5,Math.min(snapshot.rooms[r].bounds.maxX-.5,x)),z:Math.max(snapshot.rooms[r].bounds.minZ+.5,Math.min(snapshot.rooms[r].bounds.maxZ-.5,z))}));scene.build(snapshot);}
  else scene.data=snapshot;
  if(!campusMap)campusMap=new CampusMap($('campus-map'),{view:id=>{follow=false;setRoom(id);},go:id=>{follow=true;command('walk-to',{}, {room:id,...snapshot.rooms[id].entry});}});else campusMap.hide();
  ready=true;selection=null;follow=true;setRoom(player().room);renderNav();render();$('loading').hidden=true;$('game').hidden=false;scene.resize();elapsed=0;lastFrame=performance.now();
  $('policy-owner').innerHTML=snapshot.actors.map(a=>`<option value="${a.id}">${escape(a.name)}</option>`).join('');
  void connectInference(bridge);
 }catch(e){$('loading-text').textContent='校园启动遇到问题：'+e.message;$('retry').hidden=false;console.error(e);}
}
function renderNav(){
 $('region-count').textContent=Object.keys(snapshot.rooms).length+' 个区域';
 $('room-list').innerHTML=Object.entries(snapshot.rooms).map(([id,r])=>`<button class="room-button ${id===room?'active':''}" data-room="${id}" aria-label="查看${escape(r.name)}" aria-pressed="${id===room}"><span class="room-icon">${r.icon||roomIcons[id]||'□'}</span><span>${escape(r.name)}</span><small>${snapshot.actors.filter(p=>p.room===id).length||'—'}</small></button>`).join('');
 $('room-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{follow=false;setRoom(b.dataset.room);});
}
function setRoom(id){if(!snapshot.rooms[id])return;$('facility-search').value='';room=id;campusMap?.hide();scene.setRoom(id);selection=null;scene.selected=null;lastMenu='';$('room-title').textContent=snapshot.rooms[id].name;$('go-room').textContent=player().room===id?'走到空地':'前往'+snapshot.rooms[id].name;$('room-subtitle').textContent=snapshot.rooms[id].subtitle;$('go-room').disabled=!!accessReason(snapshot,player(),id);$('go-room').title=accessReason(snapshot,player(),id);$('room-category').textContent=snapshot.rooms[id].zone||'校园生活';renderFacilities();renderNav();renderSelection();}
async function select(value){if(value?.kind==='portal'){follow=false;setRoom(value.id);return;}if(!value)return;selection=value;document.querySelector('.interaction-panel').scrollTop=0;scene.selected=value;lastMenu='';$('tab-interact').click();await renderSelection();}
async function command(action,roles={},args={}){
 if(!ready)return;try{const result=await bridge.request('command',{action,roles,args});if(!result.ok)toast(result.reason,true);else{toast('已安排：'+(snapshot.actions[action]?.label||action));if(paused)toast('已安排，点击继续后开始执行。');}await refresh();lastMenu='';await renderSelection();}catch(e){toast(e.message,true);}
}
function objectDetails(o){
 const type=snapshot.types[o.type],state=Object.entries(o.state||{}).filter(([k])=>type.visible?.includes(k));
 const occupied=Object.entries(snapshot.leases).filter(([key])=>key.startsWith(o.id+':')).map(([,l])=>person(l.actor));
 const occupancy=type.slots?.length?`<div class="object-info"><span>可用位置</span><strong>${type.slots.length-occupied.length} / ${type.slots.length}</strong></div>`+(occupied.length?`<div class="object-info"><span>设施状态</span><strong>${occupied.some(a=>a.task?.phase==='perform')?'使用中':occupied.some(a=>a.task?.phase==='exit')?'正在离开':'已有人前往'}</strong></div>`:''):'';
 return `<p class="facility-description">${escape(type.description||'')}</p>`+(o.owner&&o.owner!=='none'?`<div class="object-info"><span>所属</span><strong>${escape(person(o.owner)?.name||o.owner)}</strong></div>`:'')+occupancy+`<div class="object-info"><span>位置</span><strong>${escape(snapshot.rooms[o.room].name)}</strong></div>`+(o.holder?`<div class="object-info"><span>持有者</span><strong>${escape(person(o.holder)?.name)}</strong></div>`:'')+state.map(([k,v])=>`<div class="object-info"><span>${escape(type.fields?.[k]||fields[k]||k)}</span><strong>${escape(typeof v==='boolean'?(v?'是':'否'):typeof v==='number'?Number(v.toFixed(1)):v)}</strong></div>`).join('')+(type.service?.length?`<p class="facility-service">后勤服务：${type.service.map(c=>time(c.at)).join(' / ')} 补给或整理</p>`:'');
}
async function renderSelection(){
 if(!snapshot)return;const token=++menuVersion;const entity=selection?(selection.kind==='actor'?person(selection.id):snapshot.objects.find(o=>o.id===selection.id)):null;
 if(!entity){$('selection-head').innerHTML='<div class="selection-kicker">校园生活</div><h2 class="selection-title">今天，想做点什么？</h2><p class="selection-description">点选同学，发起一段交谈；<br>点选物品，安排自己的行动。</p>';$('object-state').innerHTML='';$('interaction-actions').innerHTML='';renderNearby();return;}
 const isActor=selection.kind==='actor',isSelf=entity.id===snapshot.player;
 $('selection-head').innerHTML=(isActor?`<div class="selection-avatar" style="background:${entity.color}">${escape(entity.name.slice(-1))}</div>`:'<div class="selection-kicker">物品交互</div>')+`<h2 class="selection-title">${escape(entity.name)}</h2><p class="selection-description">${isActor?(isSelf?'你的角色 · 高一（2）班':entity.role==='teacher'?'教师 · 青禾高中':'同学 · 青禾高中'):escape(snapshot.types[entity.type].label||'校园设施')}</p>`;
 $('object-state').innerHTML=isActor?`<div class="object-info"><span>正在</span><strong>${escape(entity.task?.label|| (entity.session?'交谈':'自由活动'))}</strong></div><div class="object-info"><span>位置</span><strong>${escape(snapshot.rooms[entity.room].name)}</strong></div><p class="decision-reason">${escape(entity.reason||'等待自己的下一项安排。')}</p>${(entity.plans||[]).map(g=>`<p class="plan-reason">${escape(g.title)} · ${Math.min(g.stage,g.total)}/${g.total} 完成<br>${escape(g.reason)}</p>`).join('')}`:objectDetails(entity);
 if(isSelf){$('interaction-actions').innerHTML='<button class="action-button primary" id="view-bag"><span>查看随身物品</span></button><button class="action-button" id="view-seen"><span>查看我的见闻</span></button>';$('view-bag').onclick=openInventory;$('view-seen').onclick=()=>$('tab-journal').click();renderNearby();return;}
 try{const rows=(await bridge.request('menu',{selection})).sort((a,b)=>a.category.localeCompare(b.category));if(token!==menuVersion)return;currentRows=rows;
  const actionsHTML=rows.length?rows.map((r,i)=>`${i===0||r.category!==rows[i-1].category?`<div class="interaction-category">${escape(r.category)}</div>`:''}<button class="action-button ${i===0?'primary':''}" data-action="${r.action}" data-row="${i}" ${r.disabled?'disabled':''}><span>${escape(r.label)}</span><small>${escape(r.disabled||r.detail)}</small></button>`).join(''):'<p class="empty-message">暂时没有可用交互。走近人物，或先结束当前交谈。</p>';
  if($('interaction-actions').innerHTML!==actionsHTML)$('interaction-actions').innerHTML=actionsHTML;
  $('interaction-actions').querySelectorAll('button').forEach(b=>b.onclick=()=>{const r=currentRows[Number(b.dataset.row)];command(r.action,r.roles,r.args);});renderNearby();
 }catch(e){toast(e.message,true);}
}
function renderFacilities(){
 const items=snapshot.objects.filter(o=>o.room===room&&!o.holder),filter=$('facility-search').value.trim();$('facilities-summary').textContent='本区设施 · '+items.length;
 $('facility-list').innerHTML=items.filter(o=>[o.name,snapshot.types[o.type].label,snapshot.types[o.type].category].join(' ').includes(filter)).map(o=>`<button data-facility="${o.id}" class="facility-item"><span>${escape(o.name)}</span><small>${escape(snapshot.types[o.type].category||'校园设施')}</small></button>`).join('')||'<p class="empty-message">没有匹配的设施。</p>';
 $('facility-list').querySelectorAll('button').forEach(b=>b.onclick=()=>select({kind:'object',id:b.dataset.facility}));
}
$('facility-search').oninput=renderFacilities;
function renderNearby(){const peers=snapshot.actors.filter(a=>a.room===room&&a.id!==snapshot.player&&a.id!==selection?.id);const nearbyHTML='<div class="section-caption">这里的同学与老师</div>'+peers.map(p=>`<button class="nearby-person" data-person="${p.id}" aria-label="与${escape(p.name)}互动"><span class="person-dot" style="background:${p.color}">${escape(p.name.slice(-1))}</span>${escape(p.name)}<small>${escape(p.task?.label||(p.session?'正在交谈':'自由活动'))}</small></button>`).join('');setHTML('nearby',nearbyHTML);$('nearby').querySelectorAll('button').forEach(b=>b.onclick=()=>select({kind:'actor',id:b.dataset.person}));
 if(snapshot.groups.length){const section=document.createElement('div');section.innerHTML='<div class="section-caption">我的小组</div>'+snapshot.groups.map(g=>`<button class="action-button" data-group="${g.id}"><span>${escape(g.name)}</span><small>邀请交谈</small></button>`).join('');$('nearby').appendChild(section);section.querySelectorAll('button').forEach(b=>b.onclick=()=>{const g=snapshot.groups.find(g=>g.id===b.dataset.group),target=(g.invited||[]).find(id=>person(id)?.room===player().room);if(player().session)command('invite-group',{group:g.id});else if(target)command('start-group-conversation',{group:g.id,target});else toast('先与小组同学走到同一区域。');});}}
function eventText(e){
 if(e.text)return e.text;if(e.kind==='action-completed')return '完成了'+(snapshot.actions[e.action]?.label||e.action)+'。';if(e.kind==='object-transferred')return '把'+(snapshot.objects.find(o=>o.id===e.object)?.name||'物品')+'交给了'+(person(e.target)?.name||'对方')+'。';if(e.kind==='commitment')return '记下一个 '+time(e.due)+' 的约定。';if(e.kind==='commitment-fulfilled')return '完成了约定。';if(e.kind==='inspection')return (fields[e.claim?.predicate]||e.claim?.predicate)+'：'+e.claim?.value;if(e.kind==='session-joined')return '加入了交谈。';if(e.kind==='session-invitation')return '发出交谈邀请。';if(e.kind==='action-failed')return '行动未完成：'+e.reason;return '';
}
const phaseLabel=t=>t.blockedBy?'等待通道空出':({travel:'正在前往',enter:'正在就位',exit:'正在离开',return:'回到出发处',perform:'进行中'}[t.phase]||'准备中');
function render(){
 if(!snapshot)return;const p=player(),day=Math.floor(snapshot.time/1440);$('day-label').textContent='周'+['一','二','三','四','五','六','日'][day%7]+' · 第 '+(day+1)+' 天';$('clock').textContent=time(snapshot.time);$('period-label').textContent=periods[currentPeriod(snapshot.time)];$('player-place').textContent=snapshot.rooms[p.room].name;$('player-action').textContent=p.task?phaseLabel(p.task)+' · '+p.task.label:p.session?'正在交谈':p.waiting||'自由活动';
 if(follow&&room!==p.room&&!campusMap?.open)setRoom(p.room);$('go-room').textContent=p.room===room?'走到空地':'前往'+snapshot.rooms[room].name;$('go-room').disabled=!!accessReason(snapshot,p,room);$('go-room').title=accessReason(snapshot,p,room);$('card-balance').textContent='校园卡 ¥'+p.resources.credits+' · '+(p.resources.meal?'已领餐':p.resources.tray?'待还餐盘':'轻装');
 for(const b of $('room-list').querySelectorAll('button'))b.querySelector('small').textContent=snapshot.actors.filter(a=>a.room===b.dataset.room).length||'—';
 const needsHTML=Object.entries(names).filter(([id])=>p.needs[id]!==undefined).map(([id,label])=>`<div class="need" data-need="${id}" aria-label="${label} ${Math.round(p.needs[id])}"><div class="need-label">${label}<b>${Math.round(p.needs[id])}</b></div><div class="need-track"><div class="need-fill" style="width:${Math.round(p.needs[id])}%;background:${p.needs[id]<25?'#ce8d66':p.needs[id]<50?'#c9b078':'#9db481'}"></div></div></div>`).join('');
 setHTML('needs',needsHTML);
 const q=[...(p.task?[{label:p.task.label,small:(p.task.source==='autonomy'?'自主 · ':'手动 · ')+(phaseLabel(p.task)+(p.task.phase==='perform'?' · '+Math.max(0,Math.ceil(p.task.remaining))+' 分钟':'')),progress:p.task.phase==='perform'?Math.max(0,1-p.task.remaining/(p.task.duration||1)):0}]:[]),...snapshot.queue.map(c=>({label:c.label,small:'等待中',id:c.id}))];
 $('queue').innerHTML=q.length?q.map(c=>`<div class="queue-item">${escape(c.label)}<small>${escape(c.small)}</small>${c.progress!==undefined?`<div class="queue-progress" style="width:${c.progress*100}%"></div>`:''}</div>`).join(''):'<span class="queue-empty">暂时没有安排</span>';$('cancel-all').disabled=!q.length&&!p.suspended;
 $('bag-count').textContent=snapshot.objects.filter(o=>o.holder===p.id).length;
 const meaningful=snapshot.events.filter(e=>eventText(e));const journalHTML=meaningful.slice(-25).reverse().map(e=>`<div class="journal-entry" data-event="${e.uid}"><time>${time(e.time)}</time><strong>${escape(person(e.actor)?.name||'校园')}</strong> ${escape(eventText(e))}</div>`).join('')||'<p class="empty-message">新的一天刚刚开始。</p>';setHTML('journal',journalHTML);$('unread').textContent=meaningful.length;
 const runtime={time:time(snapshot.time),actors:snapshot.actors.length,objects:snapshot.objects.length,interactions:Object.keys(snapshot.actions).length,player:p.name,room:snapshot.rooms[p.room].name};$('runtime-info').textContent=`${scene?.renderer.domElement.dataset.backend==='canvas'?'Canvas 兼容渲染':'WebGL 渲染'} · 原生 Soar · ${runtime.actors} 个角色 · ${runtime.objects} 件物品 · ${runtime.interactions} 种交互\n游戏时间 ${runtime.time}\n玩家位置 ${runtime.room}\n`+snapshot.actors.map(a=>`${a.name}：${a.nativeDecisions} 次认知周期；${a.reason||'等待开始'}`).join('\n');
 for(const n of snapshot.notices||[])toast(n.text,n.error);
 const spoken=snapshot.ambient?.findLast(e=>e.room===room);$('speech-bubble').hidden=!spoken||!!snapshot.session;if(spoken)$('speech-bubble').textContent=(person(spoken.actor)?.name||'同学')+'：'+spoken.text;
 campusMap?.update(snapshot);if($('plans-dialog').open)renderPlans();renderSchoolStatus();renderSituations();renderConversation();const key=JSON.stringify([selection,Math.floor(snapshot.time*2),p.session,Object.keys(snapshot.leases)]);if(key!==lastMenu&&selection){lastMenu=key;renderSelection();}
 if(!selection)renderNearby();
}
function renderSchoolStatus(){
 const p=player(),c=snapshot.control,ui=snapshot.schoolUI,records=snapshot.attendance||[];
 $('autonomy-toggle').textContent=c.enabled?'自主：开':'自主：关';$('autonomy-toggle').setAttribute('aria-pressed',String(c.enabled));
 const current=records.findLast(r=>snapshot.time>=r.start&&snapshot.time<r.end),last=current||records.at(-1),debt=records.filter(r=>r.remedy==='pending');
 const deferred=(c.deferred[ui.group]||0)>snapshot.time,labels={expected:'等待就座',present:'正常出勤',late:'迟到记录',interrupted:'中途离课',absent:'缺课记录',unverified:'未完成点名'};
 $('attendance-title').textContent=current?'这节课 · '+labels[current.status]:'课程与考勤';
 $('attendance-text').textContent=current?(deferred?'这节课由你自行安排，考勤仍会记录。':p.task?.action===ui.attendAction?'正在按课表上课。':c.enabled?'空闲后会返回课堂；你安排的行动优先。':'自主已关闭，需要自己安排返课。')+` 已听课 ${Math.floor(current.attended)} 分钟，未听课 ${Math.floor(current.missed)} 分钟。`:last?`上一节：${labels[last.status]}。`:'08:30 开始上课，空闲时会自己回到座位。';
 $('attendance-debt').textContent=debt.length?`待补 ${debt.length} 节课 · 每节练习 15 分钟，放学后完成。`:'没有待补的课堂练习。';
 $('return-class').hidden=!current;$('return-class').disabled=p.task?.action===ui.attendAction;
 $('defer-class').hidden=!current;$('defer-class').disabled=deferred;
 $('make-up').hidden=!debt.length;$('make-up').disabled=snapshot.clock.period!=='after-school';
 $('return-class').onclick=()=>command(ui.attendAction,{item:p.profile.desk});
 $('defer-class').onclick=()=>command(ui.deferAction);
 $('make-up').onclick=()=>command(ui.remedyAction,{item:p.profile.desk,obligation:debt[0].id});
}
function renderSituations(){
 const runs=snapshot.situations||[],run=runs.find(r=>r.status==='active')||runs.at(-1),panel=$('situation-panel');panel.hidden=!run;if(!run)return;
 $('situation-title').textContent=run.label;$('situation-text').textContent=run.result||run.phaseLabel;
 $('situation-people').textContent=Object.entries(run.participants).map(([id,p])=>(person(id)?.name||id)+' · '+({accepted:'愿意参与',declined:'决定不参加',invited:'考虑中'}[p.status]||p.status)).join('，');
 $('situation-visit').onclick=()=>{follow=false;setRoom(run.room);};
}
function renderConversation(){const s=snapshot.session;$('conversation').hidden=!s;if(!s){chatLast='';return;}
 const members=Object.entries(s.members).filter(([,m])=>m.status==='active').map(([id])=>id);$('conversation-topic').textContent=s.topic||'课间聊聊';$('conversation-members').textContent=members.map(id=>person(id)?.name).join(' · ');
 const lines=snapshot.events.filter(e=>e.session===s.id&&e.text&&['speech','question','information','cooperate','refuse','proposal','social-act'].includes(e.kind));const html=lines.map(e=>`<p><strong>${escape(person(e.actor)?.name)}</strong>${escape(e.text)}</p>`).join('');if(html!==chatLast){$('conversation-turns').innerHTML=html||'<p>等同学加入交谈…</p>';$('conversation-turns').scrollTop=$('conversation-turns').scrollHeight;chatLast=html;}
 const own=s.floor?.speaker===snapshot.player&&!s.floor?.used;$('floor-label').textContent=members.length<2?'等待对方回应邀请':own?'轮到你说话':'正在听'+(person(s.floor?.speaker)?.name||'同学')+'说话 · 选项可排入下一轮';
 for(const id of ['chat-greet','chat-club','chat-loan','chat-question'])$(id).disabled=members.length<2;
 const note=snapshot.objects.find(o=>o.id==='notes'),loan=snapshot.offers.find(o=>o.kind==='loan'&&o.from===snapshot.player);$('chat-loan').hidden=!members.includes(note?.holder);$('chat-question').hidden=!loan;
}
function chatTarget(){const s=snapshot.session;if(!s)return null;return Object.keys(s.members).find(id=>id!==snapshot.player&&s.members[id].status==='active');}
async function persist(){if(saveBusy)return;saveBusy=true;try{await saveGame(await bridge.request('save'));toast('进度已保存，包括个人记忆与未完成行动。');}catch(e){toast('保存失败：'+e.message,true);}finally{saveBusy=false;}}
function openInventory(){$('personal-resources').innerHTML=Object.entries(snapshot.resourceTypes).map(([id,r])=>`<div class="object-info"><span>${escape(r.label)}</span><strong>${player().resources[id]}${id==='credits'?' 元':''}</strong></div>`).join('');$('inventory-list').innerHTML=snapshot.objects.filter(o=>o.holder===snapshot.player).map(o=>`<div class="inventory-item"><span>▣</span>${escape(o.name)}<button data-item="${o.id}">查看</button></div>`).join('')||'<p>暂时没有随身物品。</p>';$('inventory-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('inventory-dialog').close();select({kind:'object',id:b.dataset.item});});$('inventory-dialog').showModal();}
function setPaused(value){paused=value;$('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'继续游戏':'暂停游戏');$('pause').classList.toggle('active',paused);elapsed=0;}
$('pause').onclick=()=>setPaused(!paused);document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);document.querySelectorAll('[data-speed]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});});
$('retry').onclick=()=>start();$('select-player').onclick=()=>{follow=true;setRoom(player().room);select({kind:'actor',id:snapshot.player});};$('follow').onclick=()=>{follow=true;setRoom(player().room);};
$('open-map').onclick=()=>campusMap.show(snapshot,room);
$('go-room').onclick=()=>{follow=true;command('walk-to',{}, {room,...snapshot.rooms[room].entry});};$('autonomy-toggle').onclick=async()=>{snapshot=await bridge.request('autonomy',{enabled:!snapshot.control.enabled});render();toast(snapshot.control.enabled?'空闲时会自主安排生活。':'自主已关闭，学校仍会记录考勤。');};$('cancel-all').onclick=async()=>{snapshot=await bridge.request('cancel');render();toast('行动已取消。');};
$('rotate-left').onclick=()=>scene.targetAngle+=Math.PI/6;$('rotate-right').onclick=()=>scene.targetAngle-=Math.PI/6;$('zoom-in').onclick=()=>scene.zoomBy(.15);$('zoom-out').onclick=()=>scene.zoomBy(-.15);
$('tab-interact').onclick=()=>{$('tab-interact').setAttribute('aria-selected','true');$('tab-journal').setAttribute('aria-selected','false');$('interact-content').hidden=false;$('journal-content').hidden=true;};$('tab-journal').onclick=()=>{$('tab-interact').setAttribute('aria-selected','false');$('tab-journal').setAttribute('aria-selected','true');$('interact-content').hidden=true;$('journal-content').hidden=false;};
$('open-plans').onclick=()=>{$('plans-person').innerHTML=snapshot.actors.map(a=>`<option value="${a.id}">${escape(a.name)}</option>`).join('');$('plans-person').value=selection?.kind==='actor'?selection.id:snapshot.player;renderPlans();$('plans-dialog').showModal();};$('plans-person').onchange=renderPlans;
$('settings').onclick=()=>{$('settings-dialog').showModal();};$('save').onclick=persist;$('save-dialog').onclick=persist;$('load-save').onclick=async()=>{try{const saved=await loadGame();if(!saved)return toast('还没有保存的进度。');$('settings-dialog').close();await start(saved);toast('已恢复保存的进度。');}catch(e){toast('读档失败：'+e.message,true);}};
$('new-game').onclick=()=>{$('confirm-dialog').showModal();};$('confirm-no').onclick=()=>$('confirm-dialog').close();$('confirm-new').onclick=async()=>{$('confirm-dialog').close();$('settings-dialog').close();await start();toast('新的一天开始了。');};
$('inventory-button').onclick=openInventory;$('leave-chat').onclick=()=>command('leave-conversation');$('chat-greet').onclick=()=>command('greet',{target:chatTarget()});$('chat-club').onclick=()=>command('chat-club',{target:chatTarget()});$('chat-loan').onclick=()=>command('ask-loan',{target:snapshot.objects.find(o=>o.id==='notes').holder,item:'notes'},{due:snapshot.time+90});$('chat-question').onclick=()=>{const o=snapshot.offers.find(o=>o.kind==='loan'&&o.from===snapshot.player);if(o)command('ask-question',{target:o.to},{key:o.id+':status',text:'我们刚才说好的借阅，还作数吗？'});};
$('export-context').onclick=async()=>{try{const result=await bridge.request('context',{owner:$('policy-owner').value});download('school-rule-request.json',JSON.stringify(result,null,2));}catch(e){toast(e.message,true);}};$('policy-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const reply=JSON.parse(await file.text());await bridge.request('apply-policy',{reply});toast('新规则已装入角色。');await refresh();}catch(e){toast('规则未安装：'+e.message,true);}e.target.value='';};
function download(name,value){const url=URL.createObjectURL(new Blob([value],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
window.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();setPaused(!paused);}});
let lastSimulation=performance.now();
setInterval(()=>{
 const now=performance.now(),dt=Math.min(2,(now-lastSimulation)/1000);lastSimulation=now;
 if(!ready||paused||document.hidden){elapsed=0;return;}
 elapsed=Math.min(8,elapsed+dt*speed*.25);
 if(elapsed<.05||ticking)return;
 const minutes=Math.min(.5,Math.floor(elapsed*20)/20);elapsed-=minutes;ticking=true;
 bridge.request('tick',{minutes}).then(s=>{const now=performance.now();if(lastPositionAt)positionInterval=now-lastPositionAt;lastPositionAt=now;snapshot={...snapshot,...s};render();}).catch(e=>{setPaused(true);toast('模拟暂停：'+e.message,true);console.error(e);}).finally(()=>{ticking=false;});
},180);
let lastRAF=performance.now();
function displayFrame(now){const dt=Math.min(.2,(now-lastFrame)/1000||.016);lastFrame=now;if(!ready)return;if(!paused)visualTime+=dt;scene.update(snapshot,dt,visualTime);if($('performance-info'))$('performance-info').textContent=`绘制 ${scene.stats?.fps||0} fps · 最近一帧 ${Math.round(scene.stats?.ms||0)} ms · 位置更新间隔 ${Math.round(positionInterval||0)} ms`;}
function frame(now){requestAnimationFrame(frame);lastRAF=performance.now();displayFrame(now);}
// Some visible embedded browsers throttle animation callbacks independently of timers.
setInterval(()=>{if(ready&&!document.hidden&&performance.now()-lastRAF>150)displayFrame(performance.now());},34);
requestAnimationFrame(frame);start();

function renderPlans(){
 const a=person($('plans-person').value)||player(),labels={scheduled:'等待时间',running:'正在推进',paused:'暂时中断',blocked:'遇到阻碍',ready:'可以推进',completed:'已经完成',expired:'已到期限',superseded:'已调整计划',abandoned:'已决定放弃'},coping={verify:'先核实',discuss:'当面讨论',withdraw:'暂时退开','seek-company':'找人倾诉'};
 const traits=Object.entries(snapshot.cognitionTypes).map(([k,c])=>`<span><b>${escape(c.label)}</b> ${escape(coping[a.profile[k]]||a.profile[k])}</span>`).join('');
 const plans=a.plans.map(g=>`<article class="long-plan"><div class="plan-heading"><h3>${escape(g.title)}</h3><span>${labels[g.status]||g.status}</span></div><p>${escape(g.motive||'来自当前约定或活动分工。')}</p><p class="plan-now">${escape(g.reason)} 截止第 ${Math.floor(g.deadline/1440)+1} 天 ${time(g.deadline)}</p><ol>${g.steps.map(s=>`<li class="step-${s.status}"><strong>${escape(s.label)}</strong>${s.progress?`<small>${escape(s.progress.label)} ${s.progress.value??'—'} / ${s.progress.target}</small>`:''}${s.methods.length>1?`<small>可用方法：${s.methods.map(escape).join('、')}</small>`:''}</li>`).join('')}</ol></article>`).join('');
 const mood={angry:'生气',grateful:'感激',disappointed:'失望',uncertain:'不确定',frustrated:'受挫',relieved:'释然',neutral:'平静'};
 setHTML('plans-content',`<h3>${escape(a.name)}</h3><p>${escape(a.profile.biography||'')}</p><div class="cognition-values">${traits}</div><p class="plan-now">当前选择：${escape(a.reason||'等待自己的安排')}</p>${plans||'<p>当前没有持续计划。</p>'}${socialPanel(a)}<h3>最近的社交感受</h3>${a.emotions.length?a.emotions.map(e=>`<p>${escape(person(e.subject)?.name||e.subject)}：${escape(mood[e.emotion]||e.emotion)}（${e.intensity}），${escape(coping[e.coping]||e.coping)} · ${e.status==='tentative'?'原因尚未确认':'已有经历依据'}</p>`).join(''):'<p>还没有形成新的社交评价。</p>'}`);
}

async function connectInference(current){
 try{
  const r=await fetch('/api/llm/config',{signal:AbortSignal.timeout(1800)});if(!r.ok)return;const config=await r.json();if(!config.enabled||bridge!==current)return;
  inferenceMode=config.mode;
  inference=new InferenceBroker({source:{claim:()=>current.request('inference-claim'),apply:reply=>current.request('apply-policy',{reply}),fail:(requestId,error)=>current.request('inference-failed',{requestId,error})},provider:httpProvider(),timeoutMs:config.timeoutMs,concurrency:config.concurrency,startsPerMinute:config.startsPerMinute,onChange:value=>{inferenceStatus=value;renderInference();}});renderInference();
 }catch{inferenceMode='manual-import';renderInference();}
}
function renderInference(){
 const jobs=snapshot?.reflection?.jobs||[],latest=inferenceStatus.history.at(-1);
 const status=inferenceMode==='manual-import'?'手动导入模式':inferenceMode==='manual'?'已连接运行时调试服务':'已连接模型服务';
 $('inference-status').textContent=status+' · '+jobs.filter(j=>j.status==='queued').length+' 个待反思 · '+inferenceStatus.pending.length+' 个正在推理'+(latest?` · 最近推理 ${(latest.inferenceMs/1000).toFixed(1)} 秒，安装 ${Math.round(latest.applyMs)} ms · ${latest.status}`:'');
}
function socialPanel(a){
 const relations=(a.relationships||[]).filter(r=>Object.entries(r).some(([k,v])=>k!=='id'&&v!==0));
 const history=(snapshot.reflection?.history||[]).filter(r=>r.owner===a.id&&r.summary).slice(-2);
 const changes=(snapshot.evolution||[]).filter(e=>e.owner===a.id).slice(-5);
 return '<h3>我与其他人的关系</h3>'+relations.map(r=>`<p><b>${escape(person(r.id)?.name||r.id)}</b> · ${Object.entries(snapshot.relationshipTypes||{}).map(([k,c])=>escape(c.label)+' '+r[k]).join(' · ')}</p>`).join('')+'<h3>最近的反思</h3>'+(history.map(h=>`<p>第 ${Math.floor(h.at/1440)+1} 天：${escape(h.summary)}</p>`).join('')||'<p>日终会整理当天的经历；推理等待期间继续原有生活。</p>')+changes.map(c=>`<p class="trait-change">${escape(snapshot.cognitionTypes[c.field]?.label||c.field)} ${c.from} → ${c.to}：${escape(c.reason)}</p>`).join('');
}
setInterval(()=>{if(ready){void inference?.pump();renderInference();}},1000);
$('export-reflections').onclick=async()=>{
 try{const requests=await bridge.request('inference-export');download('reflection-requests.json',JSON.stringify(requests,null,2));toast('已导出 '+requests.length+' 个实际运行请求。');}catch(e){toast(e.message,true);}
};
