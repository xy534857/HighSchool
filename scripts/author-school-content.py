"""Rebuild authored school tuning and scene. No simulation code is generated."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'dist'
p=json.loads((root/'content/campus-tuning.json').read_text())
ext=json.loads((root/'content/club-extension.json').read_text())
for key in ['types','actions','proposals','predicates']: p[key].update(ext.get(key,{}))
p['id']='school-playable-v1'
p['needs']['initial'].update(thirst=78,hygiene=82,fun=72)
p['needs']['decay'].update(thirst=.14,hygiene=.055,fun=.05)
p['senses'].update(sight=25,hearing=7)
p['clock']['walkSpeed']=4
p['limits'].update(turnMinutes=1.5,inviteMinutes=12,sessionMinutes=25)
p['clock']['periods']=[{'id':i,'start':a,'end':b} for i,a,b in [('morning',0,510),('class',510,600),('break',600,625),('class',625,720),('lunch',720,790),('class',790,900),('after-school',900,1110),('night',1110,1440)]]
eq=lambda l,r:{'op':'eq','left':l,'right':r}
tag=lambda t:{'from':'objects','where':{'op':'includes','left':'$bound.tags','right':t}}
idle=eq('$actor.session',None)
def obj(id,label,model,tags,state=None,slot=None,pose='standing',offset=.8,size=None):
 p['types'][id]={'label':label,'model':model,'tags':tags,'state':state or {},'visible':list((state or {}).keys()),'inspect':list((state or {}).keys()),'slots':[{'id':'use','tags':[slot],'pose':pose,'x':0,'z':offset}] if slot else []}
 if size:p['types'][id]['footprint']={'w':size[0],'d':size[1]}
def action(id,label,tagname,duration,effects,slot=None,pose='standing',need=None,cooldown=10):
 p['actions'][id]={'label':label,'executor':'physical','roles':{'item':tag(tagname)},'anchor':'$item','duration':duration,'cooldown':cooldown,'attention':'pause','when':idle,'effects':effects,'pose':pose}
 if slot:p['actions'][id]['slot']=slot
 if need:p['actions'][id].update(need=need,needThreshold=40)
def change(need,amount):return {'type':'need.change','need':need,'amount':amount}
def event(kind,text):return {'type':'event.emit','kind':kind,'text':text}
models={'bed':('医务床','bed'),'book':('笔记本','book'),'desk':('课桌','desk'),'fountain':('饮水机','water'),'meal-table':('餐桌','table'),'toilet':('独立厕位','toilet'),'drawing-kit':('海报工作台','art')}
for id,(label,model) in models.items():p['types'][id].update(label=label,model=model)
for id in ['desk','meal-table','drawing-kit']:
 p['types'][id]['footprint']={'w':1.45 if id=='desk' else 1.8,'d':.75}
 for s in p['types'][id]['slots']:s['z']=.9 if s['z']>=0 else -.9
p['types']['fountain']['slots'][0]['z']=.8
p['types']['drawing-kit']['state']['paper']=12
p['actions']['draw-poster']['duration']=4
p['actions']['draw-poster']['cooldown']=20
p['actions']['drink'].update(need='thirst',effects=[change('thirst',38)])
p['actions']['study']['label']='温习功课'
p['actions']['rest']['label']='躺下休息'
p['actions']['toilet']['label']='使用独立厕位'
p['actions']['inspect']['label']='仔细查看'
p['actions']['say']['parameters']['text']['default']='今天过得怎么样？'
p['actions']['ask-question']['parameters']['key']['default']='school-day:topic'
p['actions']['ask-question']['parameters']['text']['default']='你知道今天的社团活动吗？'
p['actions']['start-conversation']['when']={'all':[idle,eq('$target.session',None)]}
obj('waypoint','通行位置','marker',['waypoint'])
obj('sink','洗手池','sink',['wash'],slot='wash',size=(1.2,.7))
obj('noticeboard','校园公告栏','board',['notice'],{'topic':'周三社团开放日，放学后在社团室准备海报。'},'read',size=(2,.5))
obj('bookshelf','书架','shelf',['read'],{'books':28},'read',size=(2,.65))
obj('computer','电脑工作桌','computer',['computer'],slot='work',pose='sitting',offset=1,size=(1.8,.8))
obj('teacher-desk','教师办公桌','office',['office'],slot='work',pose='sitting',offset=1,size=(2,.8))
obj('whiteboard','教学黑板','blackboard',['teach'],slot='teach',size=(3,.35))
obj('bench','长椅','bench',['sit'],slot='sit',pose='sitting',offset=.2)
obj('basketball-hoop','篮球架','hoop',['basketball'],slot='sport',offset=1.25,size=(.45,.45))
obj('running-start','跑道起点','track',['run'],slot='sport',offset=0)
obj('guitar','音乐练习区','guitar',['music'],slot='music',pose='sitting',offset=.9)
obj('planter','花坛','planter',['garden'],{'water':40},'garden',offset=1.2,size=(2,1.1))
obj('locker','个人储物柜','locker',['locker'],{'open':False},'open',size=(1,.65))
obj('cafe-counter','食堂餐台','counter',['serve'],{'servings':32},'serve',size=(3,1))
obj('ball','篮球','ball',['portable'],{'condition':'完好'})
action('wash-hands','洗手', 'wash',1.5,[change('hygiene',30)],'wash',need='hygiene')
action('read-board','阅读校园公告','notice',1,[{'type':'object.inspect','object':'$item.id'},event('read-notice','记下了校园公告。')],'read')
action('read-book','阅读一本书','read',6,[change('fun',18),event('reading','读完了一个章节。')],'read')
action('use-computer','查资料','computer',5,[event('research','整理了一份学习资料。')],'work','sitting')
action('office-work','整理教案','office',10,[event('teaching-prepared','整理好了下一节课的教案。')],'work','sitting')
action('teach','准备板书','teach',5,[event('lesson','在黑板上整理本节课的重点。')],'teach')
action('sit-bench','坐一会儿','sit',4,[change('energy',12)],'sit','sitting')
action('shoot-hoops','练习投篮','basketball',4,[change('fun',26),change('energy',-4),change('thirst',-5),event('sport','完成了一组投篮练习。')],'sport',need='fun')
action('run-lap','慢跑一圈','run',5,[change('fun',20),change('energy',-5),change('thirst',-6)],'sport',pose='running')
action('play-guitar','练习吉他','music',5,[change('fun',24),event('music','练完了一小段旋律。')],'music','sitting',need='fun')
action('water-plants','给花坛浇水','garden',2,[{'type':'object.add','object':'$item.id','field':'water','amount':15,'max':100},change('fun',8)],'garden')
p['actions']['water-plants']['when']={'all':[idle,{'op':'lte','left':'$item.state.water','right':85}]}
action('open-locker','打开储物柜','locker',.5,[{'type':'object.set','object':'$item.id','field':'open','value':True}],'open')
p['actions']['open-locker']['when']={'all':[idle,eq('$item.state.open',False)]}
action('close-locker','关好储物柜','locker',.5,[{'type':'object.set','object':'$item.id','field':'open','value':False}],'open')
p['actions']['close-locker']['when']={'all':[idle,eq('$item.state.open',True)]}
action('get-lunch','领取并吃一份午餐','serve',6,[{'type':'object.add','object':'$item.id','field':'servings','amount':-1,'min':0},change('hunger',45)],'serve')
p['actions']['get-lunch']['requires']={'op':'gt','left':'$item.state.servings','right':0}
p['actions']['walk-to']={'label':'走到这里','executor':'physical','roles':{},'parameters':{'room':{'type':'string'},'x':{'type':'number','min':-30,'max':30},'z':{'type':'number','min':-30,'max':30}},'anchor':'$args','duration':0,'cooldown':0,'attention':'pause','when':idle,'effects':[]}
for id,label,text in [('greet','聊聊今天','早上好，今天的课你准备得怎么样了？'),('chat-club','聊聊社团','放学后我想去社团室看看，你有什么打算？'),('encourage','给对方打气','刚才没做好也没关系，下次再试试。')]:
 p['actions'][id]={'label':label,'executor':'speech','roles':{'target':{'from':'actors'}},'when':{'all':[eq('$actor.hasFloor',True),eq('$target.session','$actor.session')]},'duration':0,'cooldown':8,'attention':'none','effects':[{'type':'speech.emit','to':'$target.id','text':text},change('social',8)]}
p['actions']['reply-greeting']={'label':'回应同学','executor':'speech','roles':{'message':{'from':'messages','where':{'all':[eq('$bound.answered',False),{'any':[eq('$bound.key','school-day:greeting'),eq('$bound.key','school-day:club')]}]}}},'when':eq('$actor.hasFloor',True),'duration':0,'cooldown':0,'attention':'none','effects':[{'type':'speech.emit','to':'$message.actor','replyTo':'$message.uid','text':'我还在准备呢。放学后要不要去社团室看看？'},change('social',6)]}
# Speech acts can request a reply without pretending to understand arbitrary prose.
p['actions']['greet']['effects'][0].update(kind='question',data={'key':'school-day:greeting'})
p['actions']['chat-club']['effects'][0].update(kind='question',data={'key':'school-day:club'})
p['routines']=[{'id':'class-'+str(n),'action':'study','priority':100,'when':{'all':[eq('$actor.role','student'),{'op':'gte','left':'$clock.minute','right':start},{'op':'lt','left':'$clock.minute','right':end}]}} for n,(start,end) in enumerate([(510,590),(625,710),(790,845),(850,900)])]
p['routines'] += [{'id':'lunch','action':'eat','priority':110,'when':eq('$clock.period','lunch')},{'id':'staff-work','action':'office-work','priority':90,'when':{'all':[eq('$actor.role','teacher'),eq('$clock.period','class')]}},{'id':'morning-notice','action':'read-board','priority':8,'when':{'all':[eq('$clock.period','morning'),eq('$actor.profile.interest','reading')]}},{'id':'after-sport','action':'shoot-hoops','priority':35,'when':{'all':[eq('$clock.period','after-school'),eq('$actor.profile.interest','sport')]}},{'id':'after-art','action':'draw-poster','priority':35,'when':{'all':[eq('$clock.period','after-school'),eq('$actor.profile.interest','art')]}},{'id':'after-music','action':'play-guitar','priority':35,'when':{'all':[eq('$clock.period','after-school'),eq('$actor.profile.interest','music')]}}]
p['actions']['start-group-conversation']={'label':'邀请小组一起聊','executor':'physical','roles':{'group':{'from':'groups'},'target':{'from':'actors','where':{'op':'includes','left':'$group.invited','right':'$bound.id'}}},'anchor':'$target','duration':.1,'cooldown':5,'attention':'none','when':idle,'effects':[{'type':'session.open','group':'$group.id','topic':'学习小组'}]}
for id,s in p['actions'].items():
 s['ui']={'category':'交谈' if s['executor']=='speech' or s.get('category')=='invitation' else '日常','visible':id not in ['wait','walk-to','reply-greeting','answer-known','answer-unknown']}
# Named regions remain content, the renderer reads their geometry and furnishing model keys.
rooms={}
for id,name,subtitle,tone,outdoor in [('classroom','高一（2）班','第一节课 · 08:30','#d5e5e2',False),('office','教师办公室','课业咨询与备课','#e3dbcd',False),('bathroom','卫生间','独立厕位与洗手区','#d5e9ee',False),('club','社团活动室','美术 · 音乐 · 合作','#f0dfbc',False),('playground','操场','篮球与田径','#c1dca4',True),('courtyard','中庭','课间集合与休息','#d4ddc2',True),('library','图书馆','阅读与自习','#dfd2bc',False),('canteen','食堂','午餐 · 12:00','#f0d7c1',False),('infirmary','医务室','休息与恢复','#d5e5e4',False)]:
 rooms[id]={'name':name,'subtitle':subtitle,'color':tone,'outdoor':outdoor,'surface':'court' if id=='playground' else 'garden' if outdoor else 'tiles','bounds':{'minX':-8,'maxX':8,'minZ':-6,'maxZ':6},'links':[],'portals':{}}
links=[('classroom','courtyard'),('office','courtyard'),('bathroom','courtyard'),('club','courtyard'),('playground','courtyard'),('library','courtyard'),('canteen','courtyard'),('infirmary','office')]
for i,(a,b) in enumerate(links):
 rooms[a]['links'].append(b);rooms[b]['links'].append(a)
 rooms[a]['portals'][b]={'x':6.7,'z':4.8}
 rooms[b]['portals'][a]={'x':-6.5+(i%4)*4.3,'z':5 if i<4 else -5}
# Player and the classmates have independent native agents; one controllable student.
actors=[]
for id,name,role,room,x,z,color,hair,interest in [('t','林知夏','student','classroom',0,3,'#548ee0','long','art'),('m','周明远','student','classroom',2.8,3,'#edb34c','short','sport'),('f','沈乔','student','classroom',-2,3,'#cb7797','long','music'),('a','许安','student','library',0,2,'#73b6ac','glasses','reading'),('teacher','陈老师','teacher','office',0,2,'#75829b','glasses','reading'),('r','陆川','student','playground',0,1,'#dc806b','short','sport'),('q','苏禾','student','club',0,2,'#9788c8','long','art'),('l','何乐','student','canteen',0,2,'#5ea2b8','short','music')]:
 actors.append({'id':id,'name':name,'controlled':id=='t','role':role,'room':room,'x':x,'z':z,'color':color,'hair':hair,'profile':{'sensitivity':12 if id=='f' else 8,'coping':'verify','interest':interest}})
objects=[]
def put(id,type,room,x,z,name=None,**kw):objects.append({'id':id,'type':type,'room':room,'x':x,'z':z,'name':name or p['types'][type]['label'],'mapKnown':True,**kw})
for row in range(2):
 for col in range(4):put('desk-'+str(row*4+col+1),'desk','classroom',-4.5+col*3,row*3-1,'课桌 '+str(row*4+col+1))
put('blackboard','whiteboard','classroom',0,-4.9)
put('class-locker','locker','classroom',-6.8,-3)
put('notes','book','classroom',2,2,'明远的课堂笔记',holder='m',mapKnown=False)
put('my-notebook','book','classroom',0,3,'我的笔记本',holder='t',mapKnown=False)
for i,x in enumerate([-3,1]):put('office-desk-'+str(i),'teacher-desk','office',x,-1)
put('staff-computer','computer','office',4,-3)
put('office-shelf','bookshelf','office',-5,-4.6)
for i,x in enumerate([-4,0,4]):put('toilet-'+str(i+1),'toilet','bathroom',x,-3)
for i,x in enumerate([-3,0,3]):put('sink-'+str(i),'sink','bathroom',x,2)
put('art-table','drawing-kit','club',-3,-1)
put('guitar-chair','guitar','club',3,-1)
put('club-computer','computer','club',-4,-4)
put('club-board','noticeboard','club',2,-4.8)
put('basketball-hoop','basketball-hoop','playground',-3,-3)
put('running-start','running-start','playground',4,0)
put('court-bench','bench','playground',-5,3)
put('basketball','ball','playground',-2,1,mapKnown=False)
put('court-water','fountain','playground',6,-4)
put('notice','noticeboard','courtyard',0,-3)
for i,x in enumerate([-4,4]):put('garden-'+str(i),'planter','courtyard',x,0)
for i,x in enumerate([-3,3]):put('yard-bench-'+str(i),'bench','courtyard',x,2.5)
put('yard-water','fountain','courtyard',-6,-3)
for i,x in enumerate([-5,0,5]):put('shelf-'+str(i),'bookshelf','library',x,-4.5)
for i,x in enumerate([-3,1]):put('reading-desk-'+str(i),'desk','library',x,0)
put('library-book','book','library',5,0,'校园小说选',mapKnown=False)
put('food-counter','cafe-counter','canteen',0,-4)
for i,(x,z) in enumerate([(-4,0),(0,0),(4,0),(-4,3),(0,3)]):put('lunch-table-'+str(i),'meal-table','canteen',x,z)
put('canteen-water','fountain','canteen',6,-3)
for i,x in enumerate([-3,2]):put('rest-bed-'+str(i),'bed','infirmary',x,-2)
put('medical-desk','teacher-desk','infirmary',-4,2)
put('medical-sink','sink','infirmary',4,1)
scene={'id':'school-playable-v1','seed':17,'time':480,'rooms':rooms,'actors':actors,'objects':objects}
for name,data in [('school-tuning.json',p),('school-scene.json',scene)]: (root/'content'/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(f"Authored {len(rooms)} regions, {len(actors)} people, {len(objects)} objects, {len(p['actions'])} interactions")

# Apply the separate behavior/situation pack after rebuilding base furnishings.
import runpy
runpy.run_path(str(Path(__file__).with_name("refine-school-behavior.py")))
runpy.run_path(str(Path(__file__).with_name('refine-campus-planning.py')))

runpy.run_path(str(Path(__file__).with_name('author-social-content.py')))
runpy.run_path(str(Path(__file__).with_name('author-classroom-content.py')))
