"""A playable day: walking, activity and return time belong to the same clock."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'dist/content'
p=json.loads((root/'school-tuning.json').read_text())
s=json.loads((root/'school-scene.json').read_text())
E=lambda l,r,op='eq':{'op':op,'left':l,'right':r}
A=lambda *x:{'all':list(x)}
p['timetableRevision']=1
p['clock']['walkSpeed']=12
p['clock']['periods']=[{'id':id,'start':start,'end':end,'label':label} for id,start,end,label in [
 ('morning',0,510,'早间自由活动'),('class',510,555,'第一节课'),
 ('break',555,600,'课间自由活动'),('class',600,645,'第二节课'),
 ('break',645,690,'课间自由活动'),('class',690,735,'第三节课'),
 ('lunch',735,825,'午餐与午休'),('class',825,870,'第四节课'),
 ('after-school',870,1110,'放学后 · 社团与自由活动'),('night',1110,1440,'晚间自习')]]
teacher=next(o['id'] for o in s['objects'] if 'teach' in p['types'][o['type']]['tags'])
p['clock']['preparations']=[{'period':'class','group':'class','weekdays':[0,1,2,3,4],'when':E('$actor.role',role),'object':obj,'slot':slot,'bufferMinutes':8} for role,obj,slot in [('student','$actor.profile.desk','study'),('teacher',teacher,'teach')]]
for aid,role in [('prepare-class','student'),('prepare-teach','teacher')]:
 a=p['actions'][aid]
 a['when']=A(E('$actor.session',None),E('$clock.returnDue',True),E('$actor.role',role))
 a['interruptWhen']=A(E('$clock.returnDue',True),E('$actor.role',role))
 a['duration']=60
 r=next(r for r in p['routines'] if r['id']==aid)
 r['when']=E('$clock.returnDue',True)
 r['reason']='按当前位置到教室的路程，预留入座和让行时间后出发返课。'
r=next(r for r in p['routines'] if r['id']=='class-leave-chat')
r['when']=A({'any':[E('$clock.period','class'),E('$clock.returnDue',True)]},E('$clock.weekday',5,'lt'),{'not':E('$actor.session',None)},{'any':[E('$clock.returnDue',True),E('$session.created','$clock.periodStart','lt')]})
r['reason']='留出返回教室的路程，先结束这段闲聊。'
for run in p['situations']:
 if run['id']=='club-preparation':run.update(at=885,duration=120)
 if run['id']=='classroom-discussion':run['duration']=555-run['at']
p['types']['noticeboard']['state']['topic']='周一 14:45 与周四 15:10，放学后在中庭商量社团招新。'
s['rooms']['canteen'].update(subtitle='午餐与午休 · 12:15–13:45',description='午餐与午休 · 12:15–13:45。领餐、用餐后可自由活动。')
for name,data in [('school-tuning.json',p),('school-scene.json',s)]:
 (root/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
