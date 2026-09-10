"""Public circulation, individual cognition and week-long goal recipes; no engine IDs."""
import json,copy
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'dist/content'
p=json.loads((root/'school-tuning.json').read_text());s=json.loads((root/'school-scene.json').read_text());pol=json.loads((root/'school-policies.json').read_text())
E=lambda l,r,op='eq':{'op':op,'left':l,'right':r}
A=lambda *e:{'all':list(e)}
p['campusRevision']=2;p['spatialRevision']=3;p['planningRevision']=1
# One public spine and two public wings. Rooms are destinations, never transit shortcuts.
layout={'hall':(0,-18,54,8),'west-walk':(-45,-18,24,8),'east-walk':(45,-18,24,8),
'classroom':(0,-36,16,12),'library':(-23,-36,20,14),'science':(23,-36,20,14),
'office':(-45,-36,16,12),'infirmary':(-65,-18,14,12),'bathroom':(-47,0,16,12),
'music-room':(45,-36,16,12),'student-center':(70,-18,18,14),'club':(45,0,18,14),
'courtyard':(0,0,20,16),'bathroom-f':(-24,0,16,12),'bathroom-m':(24,0,16,12),
'playground':(0,26,24,18),'canteen':(-26,26,20,16),'gym':(28,26,20,16),'garden':(-49,27,20,18)}
links=[('hall',n) for n in ['classroom','library','science','west-walk','east-walk','courtyard']]+[('west-walk',n) for n in ['office','infirmary','bathroom']]+[('east-walk',n) for n in ['music-room','student-center','club']]+[('courtyard',n) for n in ['bathroom-f','bathroom-m','playground']]+[('playground',n) for n in ['canteen','gym','garden']]
# Garden access uses an outdoor footpath along the south boundary instead of passing through the canteen.
for id,name in [('west-walk','西侧公共走廊'),('east-walk','东侧公共走廊')]:
 s['rooms'][id]={'name':name,'subtitle':'独立入口 · 双向通行','color':'#c5d5db','surface':'tile','icon':'↔','zone':'公共通道'}
for id,r in s['rooms'].items():
 x,z,w,d=layout[id];r.update(map={'x':x,'z':z,'width':w,'depth':d},bounds={'minX':-w/2,'maxX':w/2,'minZ':-d/2,'maxZ':d/2},links=[],portals={},transit=id in ['hall','west-walk','east-walk','courtyard','playground'])
 if id.endswith('-walk'):r.update(obstacles=[],decorations=[],zones=[],entry={'x':0,'z':1})
for a,b in links:
 for u,v in [(a,b),(b,a)]:
  r=s['rooms'][u];r['links'].append(v);dx=layout[v][0]-layout[u][0];dz=layout[v][1]-layout[u][1];w,d=layout[u][2:];scale=min((w/2-.65)/abs(dx) if dx else 999,(d/2-.65)/abs(dz) if dz else 999);r['portals'][v]={'x':round(dx*scale,2),'z':round(dz*scale,2)}
# Explicit south-edge path avoids drawing the garden connection through dining room.
s['rooms']['playground']['portals']['garden']={'x':-9,'z':8};s['rooms']['garden']['portals']['playground']={'x':6,'z':8}
p['cognition']={k:{'label':label,'type':'number','min':0,'max':100} for k,label in [('sensitivity','情绪敏感'),('sociability','社交主动'),('persistence','目标坚持')]}
p['cognition']['coping']={'label':'面对失约','type':'string','values':['verify','discuss','withdraw','seek-company']}
# Activity windows yield to classes, lunch, needs and explicit player control.
window=A(E('$clock.period','after-school'),E('$clock.weekday',5,'lt'))
def step(label,action,resource,target,**kw):
 cond=E('$actor.resources.'+resource,target,'gte');return {'label':label,'action':action,'spacingMinutes':1440 if action in ['draw-poster','paint-study','practice-piano','play-guitar','shoot-hoops','run-lap'] else 0,'repeatUntil':cond,'skipWhen':cond,'progress':{'label':p['resources'][resource]['label'],'value':'$actor.resources.'+resource,'target':target},**kw}
def project(title,motive,steps):return {'title':title,'motive':motive,'relativeProgress':True,'priority':48,'activeWhen':window,'windowLabel':'周一至周五放学后推进；上课、用餐和紧急需求优先。','steps':steps}
p['projects']={
 'illustration':project('本周完成一张自己的校园画','想把自己的观察变成作品，慢慢积累后再拿给别人看。',[step('先研究校园创作素材','use-computer','research',6),step('积累画技，材料不够就先补充','draw-poster','arts',20,alternatives=[{'action':'buy-supplies','when':A(E('$actor.resources.supplies',1,'lt'),E('$objectsById.art-table.state.paper',1,'lt'))},{'action':'restock-art','when':E('$actor.resources.supplies',1,'gte')}],blockedReason='需要空闲美术桌和画纸；缺纸时先买文具、再补充画纸。'),{'label':'把作品摆到公共展区','action':'exhibit-work'}]),
 'exhibition':project('本周准备社团展示作品','希望把分工落成看得见的作品，不让答应的筹备停在嘴上。',[step('积累足够的美术练习','paint-study','arts',24),{'label':'展出自己的作品','action':'exhibit-work'}]),
 'piano-study':project('本周把开场旋律练熟','在公开展示前先准备充分，减少临场不安。',[step('先读谱理解旋律','read-score','music',8),step('反复练习，达到开场所需熟练度','practice-piano','music',32)]),
 'guitar-study':project('本周准备一段社团伴奏','喜欢和人一起玩音乐，也想拿出一段可靠的伴奏。',[step('先听懂和读懂乐谱','read-score','music',4),step('练好自己的吉他伴奏','play-guitar','music',24)]),
 'research-notes':project('本周整理一份学习资料','比起追逐热闹，更喜欢先弄清依据，再整理成可以分享的资料。',[step('搜集并核对学习资料','use-computer','research',18),step('打印成可以带走的笔记','print-notes','printouts',2)]),
 'basketball-practice':project('本周完成自己的篮球训练','愿意保留练球时间，想用持续训练看见进步。',[step('先热身和恢复身体','stretch','fitness',6),step('连续几次投篮练习','shoot-hoops','fitness',26)]),
 'track-practice':project('本周完成体能练习','把竞争心放到训练上，希望自己的表现更稳定。',[step('先准备肌肉和关节','stretch','fitness',8),step('把跑步训练积累起来','run-lap','fitness',28)]),
 'teaching-prep':project('本周备好一组课堂参考材料','先完成教学责任，再用空闲时间准备下一次课堂。',[step('查找适合课堂的资料','use-computer','research',12),step('打印课堂参考材料','print-notes','printouts',2)])}
people={
 't':(18,28,72,'verify','illustration','慢热、重视亲自核实；喜欢通过作品表达自己。'),
 'm':(10,78,82,'discuss','basketball-practice','主动、重视训练；遇到矛盾倾向当面说开。'),
 'f':(28,35,65,'withdraw','piano-study','敏感、准备充分才安心；失约后倾向先拉开距离。'),
 'a':(12,22,86,'verify','research-notes','谨慎、有条理；未知的信息先求证。'),
 'q':(20,65,88,'discuss','exhibition','愿意组织合作；看重承诺落成实际成果。'),
 'r':(16,48,92,'discuss','track-practice','竞争心强，习惯用重复练习解决问题。'),
 'l':(14,90,52,'seek-company','guitar-study','爱凑热闹，心情不好时更想找人聊聊。'),
 'teacher':(8,60,95,'verify','teaching-prep','先履行教学责任，对原因不明的问题先核实。')}
# Different strategies have real Soar conditions. Emotional appraisal already uses sensitivity/coping.
for a in s['actors']:
 sen,soc,per,cope,proj,bio=people[a['id']];a['profile'].update(sensitivity=sen,sociability=soc,persistence=per,coping=cope,projects=[proj],biography=bio)
 # Personality changes the commitment to a goal, but stays below lessons and essential commitments.
 template=copy.deepcopy(p['projects'][proj]);template['priority']=40+per//10;p['projects'][proj]=template
# When a private/busy interaction admits only refusal, there must still be a native proposal.
pol['common']=[r for r in pol['common'] if r['id']!='decline-unavailable-invite']
pol['common'].append({'id':'decline-unavailable-invite','select':{'action':'decline-conversation'},'priority':1,'reason':'现在不方便加入交谈，先回应邀请。'})
# Common response rules stay reusable; individual tendencies condition actual native operator proposals.
pol['common']=[r for r in pol['common'] if r['id']!='social-initiate' and not r['id'].startswith('sociability-')]
for bound,value,priority,reason in [('gte',60,24,'我习惯主动找身边的人说话；现在没有课程或既定活动。'),('lt',60,10,'我比较慢热，只有确实想交谈时才找身边的人。')]:
 pol['common'].append({'id':'sociability-'+bound,'select':{'action':'start-conversation'},'when':[{'scope':'self','field':'profile-sociability','op':bound,'value':value},{'scope':'self','field':'social','op':'lt','value':75 if bound=='gte' else 40},{'scope':'self','field':'period','op':'ne','value':'class'},{'scope':'self','field':'activity','op':'eq','value':'free'}],'priority':priority,'reason':reason})
for style,action,reason,match in [('discuss','start-conversation','对方确实失约，我想找当事人当面谈清楚。',True),('verify','start-conversation','这次经历让我在意，我想先向当事人核实。',True),('withdraw','sit-bench','这次失约让我不舒服，我想先找个地方缓一缓。',False),('seek-company','start-conversation','这件事让我难受，我想找身边的人聊一聊。',False)]:
 pol['common']=[r for r in pol['common'] if r['id']!='coping-'+style]
 pol['common'].append({'id':'coping-'+style,'select':{'action':action},'when':[{'scope':'memory','key':'*','field':'coping','op':'eq','value':style,'matchTarget':match,'minIntensity':30},{'scope':'self','field':'period','op':'ne','value':'class'},{'scope':'self','field':'social','op':'lt','value':80}], 'priority':54,'reason':reason})
for name,data in [('school-tuning.json',p),('school-scene.json',s),('school-policies.json',pol)]: (root/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Authored public circulation and personal weekly plans')
