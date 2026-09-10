import {SPOTS} from './layout.js';
export const WEEKDAYS=['周一','周二','周三','周四','周五','周六','周日'];
export const ATTENDANCE={
 dad:{label:'上班',place:'单位',leave:480,return:1050},
 me:{label:'上班',place:'医院',leave:475,return:1025},
 xue:{label:'上学',place:'学校',leave:465,return:985},
 xing:{label:'上学',place:'学校',leave:465,return:975},
 xiaoyu:{label:'上学',place:'学校',leave:465,return:960}
};
export function calendarAt(house,p){
 const day=Math.floor(house.time/1440)+1,weekday=(day-1+(house.calendar?.startWeekday||0))%7,m=house.time%1440;
 const a=house.domain.routine.attendance?.[p.id]||ATTENDANCE[p.id];
 const workday=house.calendar?.enabled!==false&&weekday<5;
 return {...a,weekday,day,weekend:weekday>=5,workday,'departure-due':workday&&m>=a.leave-12&&m<a.return&&p.presence!=='away',away:p.presence==='away',
  storyWindow:weekday>=5?m>=570&&m<1260:(m>=420&&m<453)||(m>=1060&&m<1260)};
}
export function installCalendar(Household){Object.assign(Household.prototype,{
 initCalendar(){
  this.calendar??={enabled:true,startWeekday:0};
  for(const p of this.people){
   if(p.presence)continue;const c=calendarAt(this,p);
   p.presence=c.workday&&this.minute>=c.leave&&this.minute<c.return?'away':'home';
   if(p.presence==='away'){p.awaySince=Math.floor(this.time/1440)*1440+c.leave;p.awayPlace=c.place;p.action='away';p.task=null;p.speech=null;p.thought=`现在在${c.place}，放学或下班后回家，接着自己的安排。`;}
  }
 },
 calendarFor(p){return calendarAt(this,p);},
 leaveForDay(p){
  const c=this.calendarFor(p);if(!c.workday||this.minute>=c.return)return;
  if(p.conversationId)this.leaveConversation(p.id,'该出门了',{resume:false});p.suspendedTask=null;
  this.release(p);p.presence='away';p.action='away';p.awaySince=this.time;p.awayPlace=c.place;p.speech=null;
  p.thought=`去${c.place}，${String(Math.floor(c.return/60)).padStart(2,'0')}:${String(c.return%60).padStart(2,'0')}回家。`;
  const e=this.emit('departed',p,`${p.name}出门${c.label}了。`,[],null,false,{place:c.place,expectedReturn:c.return});
  this.brain.observe(p.id,{...e,uid:'event-'+e.id,kind:'departed',type:'event',source:'self'});this.syncMind(p);
 },
 tickAway(p,dt){
  const c=this.calendarFor(p);p.hunger=Math.max(0,p.hunger-dt*this.domain.needs.hunger.decay);p.energy=Math.max(0,p.energy-dt*.032);
  if(this.minute>=720&&p.meals.lunch!==this.day){p.meals.lunch=this.day;p.hunger=Math.min(100,p.hunger+67);p.energy=Math.min(100,p.energy+8);this.emit('outsideMeal',p,`${p.name}在${p.awayPlace}吃过午饭。`,[],null,false,{slot:'lunch'});}
  if(!c.workday||this.minute>=c.return){
   p.presence='home';p.action='idle';p.x=SPOTS.delivery.x+(p.index-2)*.4;p.z=SPOTS.delivery.z-.4;p.nextDecision=this.time;p.social=Math.max(50,p.social);p.fun=Math.max(45,p.fun);
   if(p.id==='dad'&&this.time-(p.awaySince||this.time)>240)this.progressGoal(p,'work',75);
   const e=this.emit('returned',p,`${p.name}${p.id==='dad'||p.id==='me'?'下班':'放学'}回家了。`,[],null,true,{place:p.awayPlace});
   this.say(p,p.id==='xing'?'我回来了！今天有个事，先说好，不许笑我。':p.id==='me'?'我回来了，谁先给我说说今天的新鲜事？':p.id==='dad'?'到家了，今天家里有什么新闻？':p.id==='xue'?'我回来了，先把书包放好。':'我回来啦！有人想我了吗？');
   this.sense(p,true);this.deliverStoryBrief?.(p);p.awayPlace=null;
  }
 }
});}
