"""School expansion pack: content only, reusable affordances and authored geography."""
import json, math, copy
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'dist/content'
p=json.loads((root/'school-tuning.json').read_text());s=json.loads((root/'school-scene.json').read_text())
p['campusRevision']=1
E=lambda l,r,op='eq':{'op':op,'left':l,'right':r}
A=lambda *e:{'all':list(e)}
N=lambda n,v:{'type':'need.change','need':n,'amount':v}
R=lambda k,v,clamp=False:{'type':'actor.add','resource':k,'amount':v,'clamp':clamp}
O=lambda k,v,**kw:{'type':'object.add','object':'$item.id','field':k,'amount':v,**kw}
V=lambda kind,text:{'type':'event.emit','kind':kind,'text':text}
idle=E('$actor.session',None)
free=E('$clock.period','class','ne')
def gate(a,expr,why):p['actions'][a].setdefault('requirements',[]).append({'when':expr,'reason':why})
def resource(id,label,initial,max=100,**kw):p.setdefault('resources',{})[id]={'label':label,'initial':initial,'min':0,'max':max,**kw}
for id,label,initial,max in [('credits','校园卡余额',30,100),('meal','已领取餐食',0,1),('tray','待归还餐盘',0,1),('supplies','文具套装',0,3),('research','研究积累',0,100),('arts','创作积累',0,100),('music','音乐熟练',0,100),('fitness','运动积累',0,100),('homework','已完成习题',0,100),('printouts','打印资料',0,10),('seedlings','采收成果',0,10)]:resource(id,label,initial,max)
p['resources']['credits']['daily']={'at':420,'amount':20}
def kind(id,label,model,tags,slot='use',w=1.2,d=.7,state=None,pose='standing',description='',category='校园设施'):
 z=d/2+.6
 p['types'][id]={'label':label,'model':model,'tags':tags,'state':state or {},'visible':list((state or {}).keys()),'inspect':list((state or {}).keys()),'description':description,'category':category,'footprint':{'w':w,'d':d},'colliders':[{'x':0,'z':0,'w':w,'d':d}],'slots':[{'id':'use','tags':[slot],'pose':pose,'x':0,'z':z,'facing':math.pi,'approach':{'x':0,'z':z}}]}
def action(id,label,tag,minutes,effects,slot='use',clip='inspect',category='日常',when=None,requires=None,cooldown=15):
 p['actions'][id]={'label':label,'executor':'physical','roles':{'item':{'from':'objects','where':E('$bound.tags',tag,'includes')}},'anchor':'$item','duration':minutes,'cooldown':cooldown,'attention':'pause','when':A(idle,when) if when else idle,'effects':effects,'slot':slot,'animation':{'clip':clip,'speed':1},'ui':{'visible':True,'category':category},'localPreference':6}
 if requires:p['actions'][id]['requires']=requires
 return p['actions'][id]
def cycle(id,values,at=390):p['types'][id].setdefault('service',[]).append({'at':at,'label':'后勤定时维护','set':values})
def put(id,type,room,x,z,name=None,**kw):
 s['objects'].append({'id':id,'type':type,'room':room,'x':x,'z':z,'name':name or p['types'][type]['label'],'mapKnown':True,**kw})
# Finite, persistent consumables. Lunch acquisition, eating and returning are separate acts.
p['actions']['get-lunch'].update(label='刷卡领取午餐',duration=1.5,animation={'clip':'pickup','speed':1},effects=[O('servings',-1,min=0),R('credits',-6),R('meal',1),V('meal-collected','刷校园卡领了一份午餐，准备找座位。')])
gate('get-lunch',E('$actor.resources.meal',0),'先吃完已领取的餐食。');gate('get-lunch',E('$actor.resources.tray',0),'请先归还上一份餐盘。');gate('get-lunch',E('$actor.resources.credits',6,'gte'),'校园卡余额不足 6 元。')
p['actions']['get-lunch']['need']='hunger'
p['actions']['eat']['effects'] += [R('meal',-1),R('tray',1)]
gate('eat',E('$actor.resources.meal',1),'先到餐台刷卡领取餐食。')
cycle('cafe-counter',{'servings':32},690)
base_slot=p['types']['cafe-counter']['slots'][0]
p['types']['cafe-counter']['slots']=[dict(copy.deepcopy(base_slot),id='serve-'+str(i),x=x,approach={'x':x,'z':base_slot['z']}) for i,x in enumerate([-1.1,0,1.1])]

p['types']['cafe-counter']['description']='11:30 后勤补餐；每份 6 元。领取后携餐到餐桌就坐。'
kind('tray-cart','餐盘回收台','tray-cart',['return-tray'],state={'trays':0},description='用餐后归还餐盘，腾出双手。')
a=action('return-tray','归还餐盘','return-tray',.7,[R('tray',-1),O('trays',1),N('hygiene',-1)],clip='give');gate('return-tray',E('$actor.resources.tray',1),'手中没有待归还餐盘。');a['defaultPriority']=65;cycle('tray-cart',{'trays':0})
# Sanitation has gender-specific entrances, private leased stalls and replenishable stock.
p['types']['toilet']['state'].update(cleanliness=100,paper=12);p['types']['toilet']['visible']+=['cleanliness','paper'];p['types']['toilet'].setdefault('inspect',[]).extend(['cleanliness','paper'])
p['actions']['toilet']['requires']=A(p['actions']['toilet'].get('requires',E(1,1)),E('$item.state.paper',0,'gt'),E('$item.state.cleanliness',12,'gte'))
p['actions']['toilet']['effects'] += [O('paper',-1,min=0),O('cleanliness',-12,min=0),N('hygiene',-8)]
cycle('toilet',{'cleanliness':100,'paper':12})
p['types']['sink']['state']['soap']=20;p['types']['sink']['visible'].append('soap');p['types']['sink']['inspect'].append('soap');cycle('sink',{'soap':20})
p['actions']['wash-hands']['requires']=E('$item.state.soap',0,'gt');p['actions']['wash-hands']['effects'].append(O('soap',-1,min=0))
# Explicit generic maintenance actions act on affected object, with exclusive use slot.
action('clean-stall','清洁厕位','toilet',3,[{'type':'object.set','object':'$item.id','field':'cleanliness','value':100},N('hygiene',-4)],slot='toilet',clip='clean',category='维护',requires=E('$item.state.cleanliness',88,'lte'))
# Actual toilet base tag/slot vocabulary can be reused without special engine paths.
p['actions']['clean-stall']['roles']=copy.deepcopy(p['actions']['toilet']['roles']);p['actions']['clean-stall']['slot']=p['actions']['toilet']['slot']
action('refill-tissue','补充厕纸','toilet',1,[{'type':'object.set','object':'$item.id','field':'paper','value':12}],clip='pickup',category='维护',requires=E('$item.state.paper',10,'lte'))
p['actions']['refill-tissue']['roles']=copy.deepcopy(p['actions']['toilet']['roles']);p['actions']['refill-tissue']['slot']=p['actions']['toilet']['slot']
action('refill-soap','补充洗手液','wash',1,[{'type':'object.set','object':'$item.id','field':'soap','value':20}],slot='wash',clip='pickup',category='维护',requires=E('$item.state.soap',15,'lte'))
# Learning/work resources and equipment.
kind('printer','自助打印机','printer',['print'],state={'paper':20,'ink':20},description='每份花费 1 元，消耗一张纸与一份墨；打印内容来自已经整理的研究资料。',category='学习')
action('print-notes','打印研究资料','print',1,[O('paper',-1,min=0),O('ink',-1,min=0),R('credits',-1),R('printouts',1)],clip='pickup',category='学习',requires=A(E('$item.state.paper',0,'gt'),E('$item.state.ink',0,'gt')))
for expr,why in [(E('$actor.resources.credits',1,'gte'),'校园卡余额不足 1 元。'),(E('$actor.resources.research',1,'gte'),'先在电脑或显微镜整理研究资料。'),(E('$actor.resources.printouts',10,'lt'),'打印资料已满。')]:gate('print-notes',expr,why)
action('refill-printer','补充纸张与墨水','print',2,[{'type':'object.set','object':'$item.id','field':'paper','value':20},{'type':'object.set','object':'$item.id','field':'ink','value':20}],clip='pickup',category='维护',requires={'any':[E('$item.state.paper',10,'lte'),E('$item.state.ink',10,'lte')]});cycle('printer',{'paper':20,'ink':20})
p['actions']['use-computer']['effects'].append(R('research',3,True));p['actions']['study']['effects'].append(R('homework',2,True))
kind('homework-box','作业收交箱','homework-box',['submit'],state={'submitted':0},description='先在课桌做习题，再将完成的作业投入收交箱。',category='学习')
action('submit-homework','提交一份作业','submit',.6,[R('homework',-1),O('submitted',1),V('homework-submitted','把做完的习题交进收交箱。')],clip='give',category='学习');gate('submit-homework',E('$actor.resources.homework',0,'gt'),'先在课桌温习并完成习题。');cycle('homework-box',{'submitted':0})
kind('microscope','显微观察台','microscope',['microscope'],w=1.8,d=.85,state={'slides':8,'clean':True},description='消耗一份样本并留下待清理的镜台。整理后才能继续观察。',category='科学')
action('observe-sample','观察植物切片','microscope',5,[O('slides',-1,min=0),{'type':'object.set','object':'$item.id','field':'clean','value':False},R('research',5,True),N('fun',10),V('discovery','记录下了植物切片的细胞结构。')],clip='microscope',category='科学',requires=A(E('$item.state.slides',0,'gt'),E('$item.state.clean',True)))
action('clean-microscope','整理观察台','microscope',1,[{'type':'object.set','object':'$item.id','field':'clean','value':True}],clip='clean',category='维护',requires=E('$item.state.clean',False));cycle('microscope',{'slides':8,'clean':True})
kind('experiment','实验操作台','experiment',['experiment'],w=2,d=1,state={'reagents':8,'clean':True},description='配戴护具的基础显色实验；每次消耗一份试剂，需清洁后重用。',category='科学')
action('do-experiment','完成显色实验','experiment',6,[O('reagents',-1,min=0),{'type':'object.set','object':'$item.id','field':'clean','value':False},R('research',7,True),N('fun',12),V('experiment-done','比较不同试液的颜色，把结果记进实验记录。')],clip='experiment',category='科学',requires=A(E('$item.state.reagents',0,'gt'),E('$item.state.clean',True)))
action('clean-experiment','清洗实验器材','experiment',2,[{'type':'object.set','object':'$item.id','field':'clean','value':True},N('hygiene',-2)],clip='clean',category='维护',requires=E('$item.state.clean',False));cycle('experiment',{'reagents':8,'clean':True})
kind('supply-shop','校园文具柜','shop',['supplies'],w=2,d=.8,state={'stock':12},description='4 元购买文具套装，可补充社团工作台画纸。',category='服务')
action('buy-supplies','购买文具套装 · 4元','supplies',1,[O('stock',-1,min=0),R('credits',-4),R('supplies',1)],clip='pickup',category='服务',requires=E('$item.state.stock',0,'gt'));gate('buy-supplies',E('$actor.resources.credits',4,'gte'),'校园卡余额不足 4 元。');gate('buy-supplies',E('$actor.resources.supplies',3,'lt'),'最多携带三套文具。');cycle('supply-shop',{'stock':12})
action('restock-art','用文具套装补充画纸','art',2,[R('supplies',-1),O('paper',6,max=30)],slot='draw',clip='pickup',category='维护',requires=E('$item.state.paper',24,'lte'))
p['actions']['restock-art']['roles']=copy.deepcopy(p['actions']['draw-poster']['roles']);p['actions']['restock-art']['slot']=p['actions']['draw-poster']['slot'];gate('restock-art',E('$actor.resources.supplies',0,'gt'),'先到校园文具柜购买文具套装。')
p['actions']['draw-poster']['effects'].append(R('arts',4,True));cycle('drawing-kit',{'paper':12})
kind('easel','写生画架','easel',['paint'],w=1,d=.8,state={'canvas':6},description='有限画布用于写生，积累个人创作经历。',category='美术')
action('paint-study','完成一幅写生','paint',8,[O('canvas',-1,min=0),R('arts',6,True),N('fun',25),V('painting','画下了校园里的一角。')],clip='paint',category='美术',requires=E('$item.state.canvas',0,'gt'));cycle('easel',{'canvas':6})
kind('piano','立式钢琴','piano',['piano'],w=2,d=.65,description='坐在琴凳上练习，音乐熟练度会累积。',category='音乐')
p['types']['piano']['colliders'].append({'x':0,'z':1,'w':.8,'d':.6});p['types']['piano']['slots'][0].update(z=1,pose='sitting',approach={'x':1.05,'z':1})
action('practice-piano','练习钢琴','piano',6,[R('music',5,True),N('fun',22),V('piano-practice','反复练习了几小节钢琴旋律。')],clip='piano',category='音乐');p['actions']['play-guitar']['effects'].append(R('music',4,True))
kind('music-stand','乐谱架','music-stand',['score'],w=.7,d=.5,description='识谱和练习相互补充。',category='音乐')
action('read-score','研读乐谱','score',3,[R('music',2,True),N('fun',8)],clip='read-standing',category='音乐')
kind('pingpong','乒乓球训练台','pingpong',['pingpong'],w=2,d=3,description='回弹板单人练球；保留双人对打所需的扩展空间。',category='运动')
action('practice-pingpong','练习乒乓球','pingpong',5,[R('fitness',4,True),N('fun',24),N('energy',-4),N('thirst',-5)],clip='pingpong',category='运动')
kind('exercise-mat','拉伸垫','mat',['stretch'],w=1,d=1.8,description='在垫子前放松，缓解疲劳。',category='运动')
action('stretch','做一组拉伸','stretch',3,[N('energy',12),N('fun',8),R('fitness',1,True)],clip='stretch',category='运动')
for a in ['shoot-hoops','run-lap']:p['actions'][a]['effects'].append(R('fitness',4,True))
kind('vending-machine','自动售货机','vending',['snack'],w=1.25,d=.8,state={'stock':12},description='3 元应急点心。库存有限，早晨补货。',category='饮食')
a=action('buy-snack','买一份点心 · 3元','snack',1.5,[R('credits',-3),O('stock',-1,min=0),N('hunger',24)],clip='eat-standing',category='饮食',requires=E('$item.state.stock',0,'gt'));a.update(need='hunger',needThreshold=60);gate('buy-snack',E('$actor.resources.credits',3,'gte'),'校园卡余额不足 3 元。');gate('buy-snack',E('$actor.resources.meal',0),'先吃已经领取的餐食。');cycle('vending-machine',{'stock':12})
kind('bin','分类垃圾桶','bin',['bin'],state={'waste':0},description='保持公共区域整洁；装满后需要清空。',category='维护')
action('empty-bin','清空垃圾桶','bin',2,[{'type':'object.set','object':'$item.id','field':'waste','value':0},N('hygiene',-5)],clip='pickup',category='维护',requires=E('$item.state.waste',0,'gt'));p['types']['bin']['decay']={'waste':{'rate':.012,'min':0,'max':20}};cycle('bin',{'waste':0})
kind('cleaning-cart','清洁工具车','cleaning-cart',['cleaning'],state={'cloths':8},description='取抹布整理个人仪容，清洁工具定时更换。',category='维护')
action('freshen-up','取湿巾整理仪容','cleaning',1,[O('cloths',-1,min=0),N('hygiene',15)],clip='wash',category='维护',requires=E('$item.state.cloths',0,'gt'));cycle('cleaning-cart',{'cloths':8})
kind('garden-bed','种植箱','garden-bed',['grow'],w=2,d=1.1,state={'water':45,'growth':30},description='水分随时间流失；浇水和种植照护增加生长值，成熟后才能采收。',category='园艺')
p['types']['garden-bed']['decay']={'water':{'rate':-.025,'min':0,'max':100}}
action('tend-garden','浇水并照护幼苗','grow',3,[O('water',25,max=100),O('growth',15,max=100),N('fun',12)],clip='water',category='园艺',requires=A(E('$item.state.water',75,'lte'),E('$item.state.growth',85,'lte')))
action('harvest-garden','采收成熟植物','grow',3,[{'type':'object.set','object':'$item.id','field':'growth','value':10},R('seedlings',1),V('harvest','收获了一份亲手照料的植物。')],clip='pickup',category='园艺',requires=E('$item.state.growth',85,'gte'));gate('harvest-garden',E('$actor.resources.seedlings',10,'lt'),'采收篮已满。')
p['types']['planter']['decay']={'water':{'rate':-.03,'min':0,'max':100}}
kind('display-board','学生作品展板','display',['exhibit'],w=2,d=.5,state={'works':0},description='有创作积累后可以布置个人作品，改变公共展板。',category='美术')
action('exhibit-work','布置一份作品','exhibit',2,[R('arts',-5),O('works',1),V('work-exhibited','把自己的作品布置到了展板上。')],clip='give',category='美术');gate('exhibit-work',E('$actor.resources.arts',5,'gte'),'先完成海报或写生，积累 5 点创作。')
kind('chess-table','棋艺桌','chess',['chess'],w=1.2,d=.8,description='独自研究棋谱残局。',category='休闲')
action('solve-chess','推演棋局','chess',5,[N('fun',16),R('research',2,True)],clip='inspect',category='休闲')
kind('first-aid','急救用品柜','first-aid',['first-aid'],state={'packs':10},description='领取清洁包整理状态；日常休息请使用医务床。',category='医务')
action('use-care-pack','使用清洁护理包','first-aid',2,[O('packs',-1,min=0),N('hygiene',20)],clip='wash',category='医务',requires=E('$item.state.packs',0,'gt'));cycle('first-aid',{'packs':10})
# Publicly readable ownership keeps strangers out of personal lockers.
for a in ['open-locker','close-locker']:gate(a,{'any':[E('$item.owner','none'),E('$item.owner','$actor.id')]},'这是其他同学的私人储物柜。')
# The recurring school rhythm wins over optional hobbies; local interests expand autonomy.
for a in p['actions'].values():
 if a.get('need'):a['localPreference']=6
p['routines'].append({'id':'collect-lunch','action':'get-lunch','priority':120,'when':A(E('$clock.period','lunch'),E('$actor.resources.meal',0),E('$actor.resources.tray',0)),'reason':'午餐时间，先领餐，再找座位。'})
# Avoid repeatedly buying food after the daily lunch routine has already been satisfied.
p['actions']['get-lunch']['when']=idle
for id,actionId,interest in [('hobby-piano','practice-piano','music'),('hobby-score','read-score','music'),('hobby-paint','paint-study','art'),('hobby-gym','practice-pingpong','sport'),('hobby-science','observe-sample','reading')]:
 p['routines'].append({'id':id,'action':actionId,'priority':36,'when':A(E('$clock.period','after-school'),E('$actor.profile.interest',interest)),'reason':'放学后，继续自己的兴趣练习。'})
for id,act,cond in [('return-used-tray','return-tray',E('$actor.resources.tray',1)),('hand-wash-after-use','wash-hands',E('$actor.needs.hygiene',72,'lt'))]:
 p['routines'].append({'id':id,'action':act,'priority':70,'repeat':True,'when':A(free,cond),'reason':'收拾用过的物品，保持日常整洁。'})
for id,act,cond in [('tidy-microscope','clean-microscope',E('$item.state.clean',False)),('tidy-experiment','clean-experiment',E('$item.state.clean',False)),('garden-care','tend-garden',E('$item.state.water',55,'lt')),('display-art','exhibit-work',E('$actor.resources.arts',10,'gte'))]:
 p['routines'].append({'id':id,'action':act,'priority':38,'when':A(E('$clock.period','after-school'),E('$item.room','$actor.room'),cond),'reason':'看见眼前的设施需要照料，顺手整理。'})
# Arriving early at an agreed meeting means waiting for partners, not abandoning it.
p['actions']['wait-for-activity']={'label':'等候已约好的同学','executor':'instant','roles':{'situation':{'from':'situations','where':A(E('$bound.status','accepted'),{'any':[E('$bound.phase','gather'),E('$bound.phase','discuss')]},E('$bound.room','$actor.room'))}},'when':idle,'duration':0,'cooldown':0,'attention':'none','effects':[],'fallback':True,'defaultPriority':58,'reason':'已经答应碰面，到了就等同伴，稍后再去做自己的事。','animation':{'clip':'idle','speed':1},'ui':{'visible':False,'category':'社团'}}
for situation in p['situations']:
 if situation.get('phases',{}).get('gather'):
  for transition in situation['phases']['gather']['transitions']:
   if transition['when'].get('left')=='$metrics.phaseMinutes':transition['when']['right']=22
# Vocabulary and state labels for UI come from the same pack.
labels={'title':'标题','pages':'页数','working':'运转正常','open':'柜门打开','topic':'公告','books':'藏书','condition':'状态','paper':'剩余纸张','cleanliness':'清洁度','soap':'洗手液','slides':'切片样本','clean':'已清理','reagents':'试剂份数','ink':'墨水份数','canvas':'画布','stock':'剩余库存','trays':'回收餐盘','submitted':'已收作业','works':'展出作品','packs':'护理包','cloths':'湿巾','growth':'生长进度','water':'水分','waste':'待清理垃圾','servings':'剩余餐份'}
for id,t in p['types'].items():
 t['fields']={k:labels.get(k,k) for k in t.get('visible',[])}
 t.setdefault('description','可在场景中走近使用；位置由占用规则管理。')
 t.setdefault('category','校园设施')
# Completion conditions carry player-facing explanations rather than a generic resource error.
for aid,why in {'observe-sample':'样本用尽或观察台尚未清理。','do-experiment':'试剂用尽或器材尚未清洗。','clean-microscope':'观察台目前已清理。','clean-experiment':'实验器材目前已清洗。','toilet':'厕纸不足或厕位需要清洁。','clean-stall':'厕位目前无需清洁。','refill-tissue':'厕纸目前还充足。','refill-soap':'洗手液目前还充足。','wash-hands':'洗手液已用尽，请先补充。','print-notes':'打印机的纸张或墨水不足。','refill-printer':'纸张与墨水目前还充足。','paint-study':'画布已经用尽。','buy-supplies':'文具柜库存已用尽。','buy-snack':'点心已经售罄。','get-lunch':'餐台暂时没有餐食。','harvest-garden':'植物尚未成熟。','tend-garden':'无需继续浇水，或植物已可采收。','restock-art':'工作台的画纸目前还充足。','empty-bin':'垃圾桶目前是空的。'}.items():p['actions'][aid]['ui']['unavailable']=why
# Distinct footprints and a real campus topology, preserving existing furniture IDs.
new=[('hall','教学楼走廊','换课 · 储物 · 公告','#d4e2d8',False),('bathroom-f','女生卫生间','女生入口 · 独立隔间','#eedddd',False),('bathroom-m','男生卫生间','男生入口 · 独立隔间','#d4e4ef',False),('science','科学实验室','显微观察 · 实验 · 清洁','#dae4dc',False),('music-room','音乐教室','钢琴 · 吉他 · 乐谱','#e9d9cb',False),('garden','校园种植园','照护 · 生长 · 采收','#cadcae',True),('gym','体育馆','乒乓练球 · 拉伸','#e7d6b4',False),('student-center','学生活动中心','文具 · 棋艺 · 展示','#eadcbd',False)]
for id,name,subtitle,color,outdoor in new:s['rooms'][id]={'name':name,'subtitle':subtitle,'color':color,'outdoor':outdoor,'surface':'garden' if outdoor else 'wood'}
s['rooms']['bathroom'].update(name='无障碍卫生间',subtitle='通用入口 · 独立隐私隔间')
s['rooms']['club'].update(name='美术社团工坊',subtitle='海报 · 写生 · 公共作品',surface='wood')
s['rooms']['infirmary']['subtitle']='休息 · 清洁护理 · 等候'
layout={'classroom':(0,-34,16,12),'library':(-24,-34,20,14),'science':(24,-34,20,14),'hall':(0,-18,54,8),'office':(-40,-18,16,12),'infirmary':(-60,-18,14,12),'music-room':(40,-18,16,12),'courtyard':(0,0,20,16),'bathroom-f':(-24,0,16,12),'bathroom-m':(-24,16,16,12),'bathroom':(-44,0,16,12),'club':(24,0,18,14),'student-center':(46,0,18,14),'canteen':(-24,36,20,16),'playground':(0,26,24,18),'gym':(30,23,20,16),'garden':(-49,30,20,18)}
links=[('hall','classroom'),('hall','library'),('hall','science'),('hall','office'),('hall','music-room'),('hall','courtyard'),('office','infirmary'),('courtyard','bathroom-f'),('courtyard','bathroom-m'),('office','bathroom'),('courtyard','club'),('club','student-center'),('courtyard','playground'),('playground','gym'),('playground','canteen'),('canteen','garden'),('club','music-room')]
for id,r in s['rooms'].items():
 x,z,w,d=layout[id];r.update(map={'x':x,'z':z,'width':w,'depth':d},bounds={'minX':-w/2,'maxX':w/2,'minZ':-d/2,'maxZ':d/2},links=[],portals={},obstacles=[],decorations=[],entry={'x':0,'z':min(4.5,d/2-1)})
 r['zone']='教学区' if id in ['classroom','hall','library','science','office','infirmary','music-room'] else '生活区' if id in ['bathroom-f','bathroom-m','bathroom','canteen'] else '社团与户外'
 r['icon']={'classroom':'▤','office':'▱','club':'✎','library':'▥','canteen':'♨','infirmary':'✚','playground':'◉','courtyard':'❋','bathroom-f':'♀','bathroom-m':'♂','bathroom':'♿','science':'⚗','music-room':'♫','garden':'❋','gym':'◉','hall':'↔','student-center':'◇'}.get(id,'▤')
for a,b in links:
 for u,v in [(a,b),(b,a)]:
  r=s['rooms'][u];r['links'].append(v);dx=layout[v][0]-layout[u][0];dz=layout[v][1]-layout[u][1];w,d=layout[u][2:]
  scale=min((w/2-.65)/abs(dx) if dx else 999,(d/2-.65)/abs(dz) if dz else 999)
  r['portals'][v]={'x':round(dx*scale,2),'z':round(dz*scale,2)}
for id,sex in [('bathroom-f','female'),('bathroom-m','male')]:s['rooms'][id]['access']={'when':E('$actor.profile.gender',sex),'reason':('女生' if sex=='female' else '男生')+'专用入口，请使用对应卫生间或无障碍卫生间。'}
for a in s['actors']:a['profile']['gender']='female' if a['id'] in ['t','f','q','teacher'] else 'male'
# Relocate a few legacy objects away from the newly placed doors.
for o in s['objects']:
 if o['id']=='food-counter':o['z']=-6
 if o['id']=='medical-desk':o.update(x=-3.5,z=2)
# Male/female independent rooms with three leased stalls, separate basins, supply and disposal.
for rid,prefix in [('bathroom-f','girls'),('bathroom-m','boys')]:
 for i,x in enumerate([-4,0,4]):put(prefix+'-toilet-'+str(i+1),'toilet',rid,x,-3,('女生' if prefix=='girls' else '男生')+'厕位 '+str(i+1))
 for i,x in enumerate([-3,0,3]):put(prefix+'-sink-'+str(i+1),'sink',rid,x,2,'洗手池 '+str(i+1))
 put(prefix+'-bin','bin',rid,6.5,2)
put('accessible-care','cleaning-cart','bathroom',6.5,2)
# A long circulation spine with individually owned lockers, fountains and pinboards.
for i,a in enumerate(s['actors']):put('locker-'+a['id'],'locker','hall',-20+i*3.4,-2.3,a['name']+'的储物柜',owner=a['id'])
put('hall-board','noticeboard','hall',19,-2.3,'课表与校务公告')
put('hall-water','fountain','hall',-22,1.2)
put('hall-bin','bin','hall',22,1.2)
put('homework-box','homework-box','classroom',6.2,-4.5)
put('class-books','bookshelf','classroom',-5.8,-4.8,'班级图书角')
put('class-display','display-board','classroom',4,-4.8,'班级作品墙')
put('class-bin','bin','classroom',-6.5,4.5)
put('office-printer','printer','office',4,2,'办公室打印机')
put('office-water','fountain','office',6.5,-3)
put('office-chair','bench','office',-3,4.3,'来访等候椅')
put('care-cabinet','first-aid','infirmary',4,-3)
put('medical-wait','bench','infirmary',1.5,3.5,'医务等候椅')
put('library-pc','computer','library',6,1)
put('library-printer','printer','library',-7,1)
put('library-chess','chess-table','library',-4,4)
put('library-water','fountain','library',7,-4.5)
put('library-board','noticeboard','library',0,4.5,'借阅与自习公告')
for i,(x,z) in enumerate([(-5,-3),(0,-3),(5,-3)]):put('microscope-'+str(i+1),'microscope','science',x,z)
for i,x in enumerate([-4,3]):put('experiment-'+str(i+1),'experiment','science',x,1.5)
put('lab-sink','sink','science',7,3.5)
put('lab-shelf','bookshelf','science',-7,3.8)
put('lab-board','noticeboard','science',0,-5.9,'实验室守则')
put('lab-bin','bin','science',8,-3)
put('piano-1','piano','music-room',-3,-3)
put('piano-2','piano','music-room',2,-3)
put('music-guitar','guitar','music-room',-4,1.5)
put('score-1','music-stand','music-room',2,1.5)
put('music-bench','bench','music-room',5,3.5)
put('music-board','noticeboard','music-room',4.5,-4.7,'排练公告')
put('art-easel-1','easel','club',-6,2.5)
put('art-easel-2','easel','club',0,3.5)
put('art-display','display-board','club',5,-4.8)
put('art-sink','sink','club',6,1.5)
put('art-bin','bin','club',-6,-4)
put('stationery','supply-shop','student-center',-4,-4)
put('student-vending','vending-machine','student-center',3,-4)
put('student-chess','chess-table','student-center',-4,1)
put('student-bench','bench','student-center',2,2)
put('student-exhibit','display-board','student-center',5,4)
put('student-notice','noticeboard','student-center',0,4,'学生会与社团招募')
put('tray-return','tray-cart','canteen',7,-.5)
put('canteen-sink','sink','canteen',-7,3)
put('canteen-bin','bin','canteen',7,4)
put('canteen-snack','vending-machine','canteen',-7,-4.5)
put('canteen-menu','noticeboard','canteen',-7,-.5,'本周食堂菜单')
put('second-counter','cafe-counter','canteen',5,-6,'食堂第二取餐台')
put('yard-display','display-board','courtyard',6,-5)
put('yard-bin','bin','courtyard',-7,4)
put('yard-chess','chess-table','courtyard',6,3)
put('gym-table-1','pingpong','gym',-4,-1)
put('gym-table-2','pingpong','gym',2,-1)
put('gym-mat','exercise-mat','gym',6,3)
put('gym-bench','bench','gym',-5,5)
put('gym-water','fountain','gym',7,-5)
put('gym-bin','bin','gym',-7,-5)
put('sports-locker','locker','playground',-9,-5)
put('sports-mat','exercise-mat','playground',8,3)
put('sports-bench','bench','playground',-7,6)
put('sports-bin','bin','playground',8,-5)
for i,(x,z) in enumerate([(-5,-4),(0,-4),(5,-4),(-5,1),(0,1),(5,1)]):put('grow-bed-'+str(i+1),'garden-bed','garden',x,z)
put('garden-bench','bench','garden',-4,6)
put('garden-water','fountain','garden',7,5)
put('garden-board','noticeboard','garden',0,6,'种植记录与养护指南')
# Unique room patches, floor strips and wall displays are geometry metadata.
for rid,r in s['rooms'].items():
 w,d=layout[rid][2:];r['zones']=[{'x':0,'z':-d/2+2,'w':w-2,'d':2.5,'color':'#c2d6cd'}] if rid in ['classroom','science','office'] else [{'x':0,'z':0,'w':w-3,'d':d-3,'color':'#cbb997'}] if rid in ['music-room','library','student-center','club'] else []
 candidates=[(-w/2+1,-d/2+1),(w/2-1,-d/2+1),(-w/2+1,d/2-1)]
 if rid not in ['hall','bathroom-f','bathroom-m','bathroom']:
  r['decorations']=[{'x':x,'z':z,'size':.85} for x,z in candidates if all(math.hypot(x-v['x'],z-v['z'])>2.1 for v in r['portals'].values()) and all(math.hypot(x-o['x'],z-o['z'])>1.8 for o in s['objects'] if o['room']==rid and not o.get('holder'))]
 r['obstacles']=[{'x':v['x'],'z':v['z'],'w':.65,'d':.65} for v in r['decorations']]
 r['description']=r['subtitle']+'。点选设施查看材料、空位和可执行交互。'
for name,data in [('school-tuning.json',p),('school-scene.json',s)]: (root/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(f"Expanded: {len(s['rooms'])} rooms, {len(s['objects'])} objects, {len(p['types'])} types, {len(p['actions'])} actions")
