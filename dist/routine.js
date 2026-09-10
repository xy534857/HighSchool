// Shared household conventions. They describe agreed time windows, not chosen actions.
export function routineAt(domain,time,person,calendar=null){
 const m=((time%1440)+1440)%1440,day=Math.floor(time/1440)+1,r=domain.routine;
 const meals=Object.entries(r.meals).filter(([id])=>!(calendar?.workday&&id==='lunch')).map(([id,v])=>({id,...v})).sort((a,b)=>a.start-b.start);
 const meal=meals.find(s=>m>=s.start&&m<s.end);
 const next=meals.find(s=>s.start>m)||{...meals[0],start:meals[0].start+1440};
 const prep=meals.find(s=>m>=s.start-r.preparationMinutes&&m<s.start);
 const sleep=r.sleep[person.id],night=m>=sleep.bed||m<sleep.wake;
 const wakeAt=(Math.floor(time/1440)+(m>=sleep.bed?1:0))*1440+sleep.wake;
 const work=r.work.some(([a,b])=>m>=a&&m<b);
 const deadline=domain.projects[person.id].deadlineMinute;
 const workBudget=r.work.reduce((sum,[a,b])=>sum+Math.max(0,Math.min(b,deadline)-Math.max(m,a)),0);
 return {'meal-window':!!meal,'meal-due':!!meal&&person.meals?.[meal.id]!==day,'meal-id':meal?.id||'none','meal-end':meal?.end||0,
 'minutes-to-meal':meal?0:next.start-m,'meal-title':meal?.title||next.title,'prep-window':!!prep,'cook-duty':!!prep&&prep.cook===person.id,
 'prep-meal':prep?.id||'none','food-needed':r.servings,'work-window':work,'work-budget':workBudget,night,'wake-at':wakeAt,
 'routine-period':night?'sleep':meal?'meal':prep?'preparation':work?'work':'free'};
}
export const clock=t=>`${String(Math.floor(t%1440/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
// Render evidence from actual planner output; it never chooses an action.
export function explainPlan(person,planning,decision,domain){
 const g=planning.goal,p=planning.plan,r=person.routine||{},f=planning.forecast||{},kind=decision?.kind||planning.guidance?.kind;
 const a=domain.actions[kind],basis=planning.guidance?.basis;
 let reason={
 'family-meal':`到了${r['meal-title']}时段，先一起吃饭，之后接着原来的安排。`,
 'prepare-family-meal':`轮到我准备${domain.routine.meals[r['prep-meal']]?.title||'下一顿饭'}，先把饭备好。`,
 'resume-tomorrow':`到约定的睡觉时间了，${g?.status==='done'?'今天的目标已经完成':'未完成的部分明天接着做'}。`,
 'outside-work-window':`现在留作休息和家人相处时间，${g?.status==='active'?'到下一个工作学习时段接着推进':'今天的目标已经完成'}。`,
 'nutrition':`离${r['meal-title']}还有约${Math.ceil(r['minutes-to-meal']||0)}分钟，先少量垫一口，保留后面的安排。`,
 'rest':`继续做下去预计精力会降到${Math.round(f['energy-after']||0)}，先短暂休息再继续。`,
 'produce-food':'手边没有能吃的，先做饭解决进食的前提。',
 'acquire-ingredients':'需要准备饭，但食材不足，先补食材。',
 'agreed-break':`这次计划先休息一轮，余下时间预计还够完成「${g?.title||'任务'}」；休息结束后就接着做。`,
 'seek-company':'先找家人一起待一会儿，再接着玩；想找人陪这件事还在计划里。',
 'advance-milestone':`这一步推进「${g?.title}」，还差${Math.ceil((g?.target||0)-(g?.progress||0))}。按当前效率还需约${Math.ceil(f['work-minutes']||0)}分钟有效工作，今天预留${Math.ceil(f['work-budget']||0)}分钟。`,
 'wait-for-resource':'等正在占用的家具腾出来，比现在换到较慢的位置更早完成；条件变化时重新比较。',
 'missing-provider':'当前缺少完成这一步的条件，先保留目标，等待条件变化。',
 'continue-step':`继续${domain.actions[person.action]?.label||'手里的事'}。${domain.actions[person.action]?.goal===g?.kind&&g?.status==='active'?`「${g.title}」还差${Math.ceil(g.target-g.progress)}，这一步完成后重新检查条件。`:person.task?.planBasis==='family-meal'?'这顿饭吃完再继续原来的安排。':'完成后接着原计划。'}`,
 'commitment':'先兑现已经答应的事，再回到自己的计划。'
 }[basis]|| (g?.status==='done'?'今天的目标已经完成，接下来可以自由安排。':decision?.reason||'');
 if(decision?.rule==='core*honor-player-action')reason='正在完成玩家安排的行动；自己的计划保留，结束后继续。';
 else if(decision?.rule?.startsWith('base*urgent'))reason='身体状态已经紧急，先处理，再恢复原计划。';
 else if(/^(episode|calendar|routine)\*/.test(decision?.rule||''))reason=decision.reason;
 else if(decision?.rule?.startsWith('mind*'))reason=decision.reason;
 else if(decision?.rule?.startsWith('learned*'))reason=decision.reason+' 原计划保留，处理完这件事后继续。';
 if(!decision?.rule?.startsWith('plan*')&&!person.task&&!r['work-window']&&!r.night&&!r['meal-window'])reason+=' 现在是自由活动时段，个人目标保留。';
 const constraints=Array.isArray(decision?.constraints)?decision.constraints:decision?.constraints?[decision.constraints]:[];if(constraints.length)reason+=' '+constraints.map(c=>c.reason).join(' ');
 const alternatives=(Array.isArray(planning.alternatives)?planning.alternatives:planning.alternatives?[planning.alternatives]:[]).map(v=>({action:v.kind,label:domain.actions[v.kind]?.label||v.kind,minutes:Math.ceil(v.minutes),available:v.available==='yes',selected:v.dominated!=='yes',wait:Math.ceil(v.capability?.wait||0)}));
 return {project:p?.uid,title:p?.title,motive:p?.motive,goal:g?.title,basis:decision?.rule?.startsWith('plan*')?basis:decision?.rule,action:kind,reason,constraints,alternatives,forecast:f,at:person.decision?.at,method:p?.method};
}
