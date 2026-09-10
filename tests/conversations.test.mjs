import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Household,SPOTS} from '../dist/simulation.js';
import {SoarController,loadSources} from '../dist/soar/controller.js';
import {encodeSave,decodeSave} from '../dist/storage.js';
import {buildDayReport,reportForModel} from '../dist/reflection.js';
const sources=await loadSources(p=>fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8'));
const root=await SoarController.create(sources,{wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url))});
const evidence=[];
function make(saved){const s=new Household(441,saved, {calendar:false,director:false}).attachBrain(new SoarController(root.native,sources));if(!saved)for(const p of s.people){s.release(p);p.nextDecision=1e9;p.hunger=p.energy=p.fun=90;p.social=65;p.x=-2+p.index*.7;p.z=3.8;}return s;}
function run(s,n,check=()=>{}){for(let t=0;t<n;t+=.25){s.tick(.25);check();}}
function invariant(s){
 const occupied=new Set();for(const c of s.conversations.filter(c=>c.status!=='closed')){
  const speaking=s.people.filter(p=>p.speech?.conversation===c.id&&p.speech.until>s.time);assert.ok(speaking.length<=1,'overlapping floor');
  for(const m of Object.values(c.members).filter(m=>['joining','active'].includes(m.status))){assert.ok(!occupied.has(m.id),'double booking');occupied.add(m.id);assert.equal(s.person(m.id).conversationId,c.id);}
 }
 for(const p of s.people)if(p.task?.resource)assert.equal(s.leases[p.task.resource],p.id);
}
test('1v1 requires native consent, replies to a real question and releases both participants',()=>{const s=make();try{
 s.perceive(s.person('xing'),'notebook','location','desk');const c=s.openConversation('dad',['xing'],{topic:'notebook',access:'private'}).conversation;
 assert.equal(s.person('xing').conversationId,null);run(s,18,()=>invariant(s));
 assert.equal(c.members.xing.decision.kind,'join');assert.ok(c.members.xing.decision.fired.includes('conversation*accept-compatible'));
 assert.deepEqual(c.turns.slice(0,3).map(t=>t.kind),['ask-location','answer','ack']);assert.equal(c.turns[1].replyTo,c.turns[0].id);
 assert.equal(c.status,'closed');assert.equal(s.person('dad').conversationId,null);assert.equal(s.person('xing').conversationId,null);
 assert.equal(s.brain.recall('xing',{type:'event',kind:'conversation-turn',turn:c.turns[0].id}).kind,'recalled');
 evidence.push({case:'1v1',turns:c.turns.map(t=>({speaker:t.from,act:t.kind,replyTo:t.replyTo})),consentRule:c.members.xing.decision.rule});
}finally{s.brain.destroy();}});
test('pausing releases the desk and resumes the exact remaining work without repeating start effects',()=>{const s=make();try{
 const p=s.person('dad'),a=s.person('me');Object.assign(p,SPOTS.desk);a.x=p.x+.7;a.z=p.z;
 s.start(p,{kind:'work'});s.beginDoing(p);s.tickTask(p,4);const left=p.task.remaining,started=p.task.started;const c=s.openConversation(a.id,[p.id],{topic:'day'}).conversation;
 run(s,.25);const pausedLeft=p.suspendedTask.task.remaining;run(s,.75);assert.equal(p.suspendedTask.task.remaining,pausedLeft);assert.ok(pausedLeft<=left);assert.equal(s.leases.desk,undefined);assert.equal(c.members.dad.decision.rule,'dad*conversation-interruption');
 const response=s.brain.decide(p.id,s.facts(p,'response',{kind:'help',from:a.id}),s.affordances(p,'response',{kind:'help',from:a.id}));assert.equal(response['goal-threat'],'yes');
 s.ask(a,p,'help');const request=s.requests.at(-1);s.resolveRequest(request);assert.equal(request.learning.finishedOriginal,false);assert.equal(request.learning.taskStarted,started);
 s.closeConversation(c);assert.equal(p.suspendedTask,null);assert.ok(p.task.remaining<=left);assert.equal(p.task.started,started);const progress=p.goals[0].progress;run(s,2);assert.ok(p.goals[0].progress>=progress);invariant(s);
 evidence.push({case:'pause-resume',remaining:p.task.remaining,originalStarted:p.task.started});
}finally{s.brain.destroy();}});
test('eating and conversation coexist, body effects finish once',()=>{const s=make();try{
 const p=s.person('xing');s.start(p,{kind:'eat'});p.x=SPOTS[p.task.resource].x;p.z=SPOTS[p.task.resource].z;s.beginDoing(p);const left=p.task.remaining;s.person('dad').x=p.x-.7;s.person('dad').z=p.z;
 const c=s.openConversation('dad',[p.id],{topic:'day'}).conversation;run(s,3);assert.equal(p.conversationId,c.id);assert.ok(p.task.remaining<left);assert.equal(p.suspendedTask,null);invariant(s);
}finally{s.brain.destroy();}});
test('a focused child and a cook finish their step before joining without losing progress',()=>{const s=make();try{
 const x=s.person('xue'),me=s.person('me');s.start(x,{kind:'studyTable'});Object.assign(x,SPOTS[x.task.resource]);s.beginDoing(x);x.task.remaining=5;me.x=x.x-.8;me.z=x.z;
 const c=s.openConversation(me.id,[x.id],{topic:'day'}).conversation;run(s,1);assert.equal(c.members.xue.status,'deferred');assert.equal(x.suspendedTask,null);run(s,7);assert.ok(['active','left'].includes(c.members.xue.status));assert.ok(c.members.xue.joinedAt>=c.created+5);
 const dad=s.person('dad');s.closeConversation(c);s.start(me,{kind:'cook'});Object.assign(me,SPOTS.stove);s.beginDoing(me);me.task.remaining=4;dad.x=me.x+1;dad.z=me.z;
 const d=s.openConversation(dad.id,[me.id],{topic:'day'}).conversation;run(s,1);assert.equal(d.members.me.status,'deferred');assert.equal(me.action,'cook');run(s,6);assert.ok(d.members.me.joinedAt>=d.created+4);invariant(s);
}finally{s.brain.destroy();}});
test('an urgent recipient refuses; a participant can leave for needs without trapping a partner',()=>{const s=make();try{
 s.person('xing').hunger=5;const c=s.openConversation('dad',['xing'],{topic:'day'}).conversation;run(s,4);assert.equal(c.members.xing.status,'declined');assert.equal(s.person('xing').conversationId,null);
 const d=s.openConversation('me',['xue','xiaoyu'],{topic:'day'}).conversation;run(s,2);s.person('xue').energy=1;run(s,3);assert.equal(d.members.xue.status,'left');assert.ok(d.members.xue.reason.includes('身体'));invariant(s);
}finally{s.brain.destroy();}});
test('five people share one floor, with addressed responses and opportunities for every member',()=>{const s=make();try{
 const c=s.inviteGroup('dad','family','day').conversation;run(s,26,()=>invariant(s));
 const speakers=new Set(c.turns.map(t=>t.from));assert.equal(speakers.size,5);assert.ok(c.turns.length>=8);for(const t of c.turns.filter(t=>t.replyTo))assert.ok(c.turns.some(q=>q.id===t.replyTo));
 evidence.push({case:'five-person',speakers:[...speakers],turnCount:c.turns.length,turns:c.turns.map(t=>({from:t.from,to:t.to,kind:t.kind}))});
}finally{s.brain.destroy();}});
test('late join sees no earlier transcript or unspoken beliefs; private sessions reject newcomers',()=>{const s=make();try{
 const c=s.openConversation('dad',['xing'],{topic:'day'}).conversation;run(s,3);const before=c.turns.map(t=>t.id);assert.ok(before.length);
 const newcomer=s.person('xue');assert.ok(s.addConversationInvite(c,s.person('dad'),newcomer.id));run(s,2);const m=c.members.xue;assert.ok(m.joinedAt>c.created);assert.ok(!m.heard.some(t=>before.includes(t.id)));
 for(const t of m.heard){assert.ok(!t.claim||!('judgment'in t.claim));assert.ok(!t.response||!('interpretation'in t.response));}
 s.closeConversation(c);const privateC=s.openConversation('dad',['xing'],{topic:'day',access:'private'}).conversation;run(s,1);const attempt=s.openConversation('xue',['dad']);assert.equal(attempt.ok,false);assert.ok(!privateC.members.xue);
 evidence.push({case:'late-join',priorTurnCount:before.length,retroactiveLeak:false,privateJoinBlocked:true});
}finally{s.brain.destroy();}});
test('acoustic loss blocks actual turns and eventually releases participants',()=>{const s=make();try{
 const c=s.openConversation('dad',['xing'],{topic:'day'}).conversation;run(s,1);const x=s.person('xing');x.x=-6;x.z=-4;s.space.screenClosed=true;const before=c.members.xing.heard.length;run(s,12);assert.equal(c.members.xing.heard.length,before);assert.equal(c.status,'closed');assert.equal(x.conversationId,null);
 const q=s.person('xue');q.action='sleep';const d=s.openConversation('me',[q.id],{topic:'day'}).conversation;run(s,1);assert.equal(d.members.xue.status,'missed');
}finally{s.brain.destroy();}});
test('competing invitations never overwrite the target or cancel another session',()=>{const s=make();try{
 const a=s.openConversation('dad',['xing'],{topic:'day',access:'private'}).conversation,b=s.openConversation('me',['xing'],{topic:'day',access:'private'}).conversation;run(s,2,()=>invariant(s));const winner=s.person('xing').conversationId;run(s,3,()=>invariant(s));assert.equal(s.person('xing').conversationId,winner);const lost=[a,b].find(c=>c.id!==winner);assert.equal(lost.members.xing.status,'declined');assert.equal(lost.members.xing.decision.rule,'conversation*do-not-double-book');assert.equal(s.conversation(winner).status,'active');
}finally{s.brain.destroy();}});
test('persistent custom group admits consenting members, invites by hearing, and permits exit',()=>{const s=make();try{
 const x=s.person('xiaoyu');x.hunger=4;const group=s.makeGroup('dad','饭后聊天',['me','xiaoyu']).group;const c=s.inviteGroup('dad',group.id,'day').conversation;run(s,2);
 assert.ok(group.members.includes('me'));assert.ok(!group.members.includes('xiaoyu'));assert.equal(c.members.xiaoyu.status,'declined');s.leaveGroup('me',group.id);assert.ok(!group.members.includes('me'));assert.equal(s.person('me').conversationId,null);
 const restored=make(decodeSave(encodeSave(s.save())));try{assert.deepEqual(restored.groups,s.groups);}finally{restored.brain.destroy();}
}finally{s.brain.destroy();}});
test('in-flight save resumes the floor and pending question without duplicate semantic effects',()=>{const s=make();let r;try{
 const c=s.openConversation('dad',['xing'],{topic:'notebook'}).conversation;for(let n=0;n<48&&!c.floor;n++)run(s,.25);assert.ok(c.floor);r=make(decodeSave(encodeSave(s.save())));
 run(s,14);run(r,14);const shape=c=>c.turns.map(t=>({id:t.id,kind:t.kind,from:t.from,to:t.to,replyTo:t.replyTo,text:t.text}));assert.deepEqual(shape(r.conversation(c.id)),shape(c));assert.equal(new Set(r.conversation(c.id).turns.map(t=>t.id)).size,c.turns.length);
 evidence.push({case:'save-during-question',sameContinuation:true,uniqueTurns:c.turns.length});
}finally{s.brain.destroy();r?.brain.destroy();}});
test('requests become individual native responses; refusal is followed by a grounded explanation',()=>{const s=make();try{
 const x=s.person('xing');s.start(x,{kind:'watch'});Object.assign(x,SPOTS.tv);s.beginDoing(x);s.person('dad').x=x.x+.9;s.person('dad').z=x.z;
 const c=s.openConversation('dad',[x.id],{topic:'help'}).conversation;run(s,18,()=>invariant(s));
 assert.ok(c.turns.some(t=>t.kind==='request'));assert.ok(c.turns.some(t=>t.kind==='respond'&&t.result==='declined'));assert.ok(c.turns.some(t=>t.kind==='ask-reason'));assert.ok(c.turns.some(t=>t.kind==='explain'));assert.ok(x.responseHistory[0].id);assert.equal(s.person('dad').mental['xing:reliability:help'].emotion,'relieved');
 evidence.push({case:'negotiation',acts:c.turns.map(t=>t.kind),response:x.responseHistory[0].kind});
}finally{s.brain.destroy();}});
test('a group request is answered separately and pending requests cancel when the session ends',()=>{const s=make();try{
 const c=s.openConversation('me',['dad','xing','xiaoyu'],{topic:'help'}).conversation;run(s,12,()=>invariant(s));const request=c.turns.find(t=>t.kind==='request');assert.equal(Object.keys(request.requestIds).length,3);assert.ok(c.turns.filter(t=>t.kind==='respond').length>=2);s.closeConversation(c);assert.ok(!s.requests.some(r=>r.conversation===c.id&&r.status==='pending'));
}finally{s.brain.destroy();}});
test('topic changes take a real turn and propagate only after delivery',()=>{const s=make();try{
 const c=s.openConversation('dad',['xing'],{topic:'day'}).conversation;run(s,1);s.queueConversationTopic('dad','notebook');assert.equal(c.topic.kind,'day');run(s,16);assert.ok(c.turns.some(t=>t.kind==='propose-topic'));assert.ok(c.turns.some(t=>['ask-location','contribute','answer'].includes(t.kind)&&t.topic.subject==='notebook'));
}finally{s.brain.destroy();}});
test('a generated native production changes participation for one person with the same initial world',async()=>{const s=make();try{
 await s.brain.install('xing',`sp {learned*xing*private-time (state <s> ^io.input-link.frame <f>) (<f> ^mode conversation ^phase invitation ^available <a>) (<a> ^kind decline) --> (<s> ^operator <o> +) (<o> ^name choose ^choice <a> ^priority 200 ^rule learned*xing*private-time ^reason |这阵子我想一个人待会儿。|)}`);
 const c=s.openConversation('dad',['xing','xiaoyu'],{topic:'day'}).conversation;run(s,2);assert.equal(c.members.xing.status,'declined');assert.equal(c.members.xing.decision.rule,'learned*xing*private-time');assert.ok(['active','joining'].includes(c.members.xiaoyu.status));
 evidence.push({case:'native-rule-extension',changedPerson:'xing',otherPersonStillJoined:true});
}finally{s.brain.destroy();}});
test('an occupied resume location waits without stealing, then restores the saved task',()=>{const s=make();try{
 const dad=s.person('dad'),me=s.person('me');Object.assign(dad,SPOTS.dining1);me.x=dad.x+.7;me.z=dad.z;s.start(dad,{kind:'workTable'});s.beginDoing(dad);
 const c=s.openConversation('me',['dad'],{topic:'day'}).conversation;run(s,1);const remaining=dad.suspendedTask.task.remaining;s.command('xue','studyTable');assert.equal(s.leases.dining1,'xue');s.closeConversation(c);run(s,1);assert.ok(dad.suspendedTask);assert.equal(s.leases.dining1,'xue');
 s.release(s.person('xue'));run(s,.25);assert.equal(dad.task.remaining,remaining);assert.equal(s.leases.dining1,'dad');invariant(s);
}finally{s.brain.destroy();}});
test('player commands cancel only the selected participation; invalid commands preserve it',()=>{const s=make();try{
 const c=s.openConversation('dad',['me','xing'],{topic:'day'}).conversation;run(s,3);s.home.food=0;assert.equal(s.command('dad','eat').ok,false);assert.equal(s.person('dad').conversationId,c.id);
 assert.equal(s.command('dad','rest').ok,true);assert.equal(s.person('dad').conversationId,null);assert.equal(c.members.me.status,'active');assert.equal(c.members.xing.status,'active');run(s,2,()=>invariant(s));
}finally{s.brain.destroy();}});
test('daily reflection includes only that participant\'s delivered conversation turns',()=>{const s=make();try{
 const c=s.openConversation('dad',['xing'],{topic:'notebook',access:'private'}).conversation;run(s,8);const report=buildDayReport(s),xing=reportForModel(report,'xing'),xue=reportForModel(report,'xue');
 assert.ok(xing.events.some(e=>e.type==='conversation-turn'&&e.actor==='dad'));assert.ok(!xue.events.some(e=>e.type==='conversation-turn'&&e.conversation===c.id));assert.ok(xing.people.xing.conversations[0].heard.length>0);assert.equal(xue.people.xue.conversations.length,0);
}finally{s.brain.destroy();}});
test('a rule that breaks a live conversation is rejected before replacing the working program',async()=>{const s=make();try{
 const c=s.openConversation('dad',['xing'],{topic:'day'}).conversation;run(s,5);const version=s.brain.rev.xing;
 await assert.rejects(()=>s.brain.install('xing',`sp {learned*bad-conversation (state <s> ^io.input-link.frame <f> ^io.output-link <out>) (<f> ^mode conversation ^seq <seq>) --> (<out> ^command <bad>) (<bad> ^seq <seq> ^kind impossible ^id never-offered)}`));
 assert.equal(s.brain.rev.xing,version);run(s,5,()=>invariant(s));assert.ok(c.turns.some(t=>t.from==='xing'));
}finally{s.brain.destroy();}});
test.after(()=>{root.destroy();fs.writeFileSync(new URL('../research/conversation-verification.json',import.meta.url),JSON.stringify({kernel:'Native Soar 9.6.5',externalApiCalls:0,evidence},null,2));});
