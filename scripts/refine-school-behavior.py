"""Apply the authored school behavior pack after author-school-content.py."""
import json
from pathlib import Path
from copy import deepcopy
root=Path(__file__).resolve().parents[1]/'dist/content'
p=json.loads((root/'school-tuning.json').read_text());scene=json.loads((root/'school-scene.json').read_text());pol=json.loads((root/'school-policies.json').read_text())
eq=lambda l,r:{'op':'eq','left':l,'right':r}
ge=lambda l,r:{'op':'gte','left':l,'right':r}
allof=lambda *a:{'all':list(a)}
idle=eq('$actor.session',None)
# Class is a sustained obligation at an assigned place. It cannot select a library desk.
p['actions']['attend-class']=deepcopy(p['actions']['study'])
p['actions']['attend-class'].update(label='在自己的座位上课',duration=18,cooldown=0)
p['actions']['attend-class']['roles']['item']['where']=allof(eq('$bound.room','classroom'),eq('$bound.id','$actor.profile.desk'))
p['actions']['attend-class']['effects']=[{'type':'event.emit','kind':'lesson-progress','text':'跟上了这一段课堂内容。'}]
p['actions']['teach-class']=deepcopy(p['actions']['teach']);p['actions']['teach-class'].update(label='给同学们讲课',duration=18,cooldown=0)
p['actions']['teach-class']['effects']=[{'type':'event.emit','kind':'lesson-progress','text':'讲完一段课程，继续留意同学们的进度。'}]
for aid,role in [('attend-class','student'),('teach-class','teacher')]:
 p['actions'][aid]['interruptWhen']=allof(eq('$clock.period','class'),eq('$actor.role',role))
 p['actions'][aid]['stopAtPeriodEnd']=True
p['routines']=[r for r in p['routines'] if not r['id'].startswith('class-') and r['id'] not in ['staff-work','attend-class','teach-class']]
p['routines'] += [{'id':'attend-class','action':'attend-class','priority':100,'repeat':True,'reason':'现在是上课时间，回自己的教室和座位，持续听课到下课。','when':allof(eq('$actor.role','student'),eq('$clock.period','class'))},{'id':'teach-class','action':'teach-class','priority':100,'repeat':True,'reason':'我负责这节课，要在教室给学生讲课。','when':allof(eq('$actor.role','teacher'),eq('$clock.period','class'))}]
for i,a in enumerate(scene['actors']):
 if a['role']=='student':a['profile']['desk']='desk-'+str(i+1 if i<4 else i)
# Everyday social initiative has time/place/need conditions. No forced reply.
pol['common']=[r for r in pol['common'] if r['id'] not in ['social-initiate','social-greet','join-activity','help-project']]
pol['common'] += [
 {'id':'social-initiate','select':{'action':'start-conversation'},'when':[{'scope':'self','field':'social','op':'lt','value':65},{'scope':'self','field':'period','op':'ne','value':'class'},{'scope':'self','field':'activity','op':'eq','value':'free'}],'priority':18,'reason':'空闲时想找眼前的同学聊聊；对方是否回应由对方决定。'},
 {'id':'social-greet','select':{'action':'greet'},'when':[{'scope':'self','field':'activity','op':'eq','value':'free'}],'priority':20,'reason':'已经一起聊天，主动接起今天的话题。'},
 {'id':'join-activity','select':{'action':'join-activity'},'priority':55,'reason':'招新准备与自己的兴趣有关，愿意试着参与，仍要顾及课程与身体状态。'},
 {'id':'help-project','select':{'action':'accept-offer','offer-kind':'project'},'priority':125,'reason':'我愿意帮忙准备招新；接受后会按实际分工行动。'}]
for rules in pol['people'].values():
 for r in rules:
  if r['id']=='free-interest':
   r['when']=[c for c in r['when'] if c.get('field')!='activity']+[{'scope':'self','field':'activity','op':'eq','value':'free'}]
pol['people']['m']=[r for r in pol['people']['m'] if r['id']!='prefer-training']+[{'id':'prefer-training','select':{'action':'skip-activity','situation-role':'helper'},'priority':65,'reason':'这次社团筹备不是我的兴趣，我想保留时间练球。'}]
for id,status,label in [('join-activity','accepted','参加这次筹备'),('skip-activity','declined','这次先不参加')]:
 p['actions'][id]={'label':label,'executor':'instant','duration':0,'cooldown':0,'roles':{'situation':{'from':'situations','where':eq('$bound.status','invited')}},'effects':[{'type':'situation.respond','status':status}],'ui':{'visible':False}}
p['proposals']['project']={'rights':{},'accept':[],'decline':[]}
p['actions']['ask-project']={'label':'商量招新分工','executor':'speech','duration':0,'cooldown':20,'roles':{'target':{'from':'actors'}},'when':allof(eq('$actor.hasFloor',True),eq('$target.session','$actor.session')),'effects':[{'type':'offer.create','kind':'project','to':'$target.id','text':'我想画招新海报，你愿意准备一段音乐吗？你不方便的话，我先把海报做好。'}],'ui':{'visible':True,'category':'交谈'}}
p['actions']['accept-project']=deepcopy(p['actions']['accept-offer']);p['actions']['accept-project']['label']='答应准备音乐';p['actions']['accept-project']['roles']['offer']['where']=allof(p['actions']['accept-project']['roles']['offer'].get('where',{'all':[]}),eq('$bound.kind','project'))
p['actions']['accept-project']['effects'][0]['text']='可以，我来练一段开场音乐，你先画海报。'
# Use the same semantic offer resolution, not an invented success in the dialogue.
pol['common']=[r if r['id']!='help-project' else {**r,'select':{'action':'accept-project'}} for r in pol['common']]
leave={'action':'leave-conversation','skipWhen':idle}
def walk(x,z):return {'action':'walk-to','args':{'room':'courtyard','x':x,'z':z}}
def plan(title,*steps):return {'title':title,'priority':60,'steps':list(steps)}
signals={'accepted':allof(eq('$event.kind','cooperate'),eq('$offer.kind','project'),eq('$offer.from','q'),eq('$offer.to','f')),'declined':allof(eq('$event.kind','refuse'),eq('$offer.kind','project'),eq('$offer.from','q'),eq('$offer.to','f')),'poster':allof(eq('$event.kind','action-completed'),eq('$event.actor','q'),eq('$event.action','draw-poster')),'music':allof(eq('$event.kind','action-completed'),eq('$event.actor','f'),eq('$event.action','play-guitar'))}
phases={
 'gather':{'label':'愿意参加的同学正在前往中庭碰面。','plans':{'artist':plan('先到中庭碰面，再商量海报与音乐分工。',walk(-1,3.8)),'musician':plan('去中庭听听筹备想法，之后再决定是否帮忙。',walk(1,3.8)),'helper':plan('去中庭看看是否需要我帮忙。',walk(0,4.8))},'transitions':[{'when':ge('$metrics.gathered',2),'next':'discuss'},{'when':ge('$metrics.phaseMinutes',12),'next':'solo'}]},
 'discuss':{'label':'同学们在中庭商量分工，邀请还需要对方同意。','plans':{'artist':plan('问沈乔是否愿意准备音乐，不替她做决定。',{'action':'start-conversation','roles':{'target':'$cast.musician'},'args':{'topic':'社团招新怎么分工','access':'public'}},{'action':'ask-project','roles':{'target':'$cast.musician'}})},'transitions':[{'when':ge('$signals.accepted',1),'next':'together'},{'when':ge('$signals.declined',1),'next':'solo'},{'when':ge('$metrics.phaseMinutes',9),'next':'solo'}]},
 'together':{'room':'club','label':'分工已经得到同意：海报与音乐各自推进。','plans':{'artist':plan('沈乔同意准备音乐，我负责把海报画好。',leave,{'action':'draw-poster','roles':{'item':'art-table'}}),'musician':plan('既然答应准备音乐，就去把开场旋律练好。',leave,{'action':'play-guitar','roles':{'item':'guitar-chair'}})},'transitions':[{'when':allof(ge('$signals.poster',1),ge('$signals.music',1)),'result':'completed','text':'海报和开场音乐都实际完成了，这次筹备有了结果。'}]},
 'solo':{'room':'club','label':'这次没能达成共同分工，先处理自己能完成的部分。','plans':{'artist':plan('没有达成分工，先独立完成海报，不假设别人会帮忙。',leave,{'action':'draw-poster','roles':{'item':'art-table'}}),'musician':plan('没有接受分工，结束讨论，保留自己的安排。',leave)},'transitions':[{'when':ge('$signals.poster',1),'result':'completed','text':'苏禾独立完成海报；没有把未获同意的音乐任务算作完成。'}]}}
for key,condition in signals.items():condition['all'].append(eq('$offer.situation' if key in ['accepted','declined'] else '$event.situation','$situation.id'))
p['situations']=[]
for id,at,duration in [('club-preparation',480,30),('club-rehearsal',3*1440+910,80)]:
 p['situations'].append({'id':id,'label':'社团招新：海报与音乐','notice':'校园公告：社团招新需要海报与开场音乐，有兴趣的同学可以到中庭商量。','at':at,'repeat':7*1440,'duration':duration,'room':'courtyard','initial':'gather','cast':{'artist':{'actor':'q'},'musician':{'actor':'f'},'helper':{'actor':'m'}},'signals':signals,'phases':phases,'expiredText':'筹备时间结束，按实际完成情况保留进度；没有自动演出结局。'})
p['types']['noticeboard']['state']['topic']='周一早间与周四放学后，社团同学可在中庭商量招新。'
# Controllable does not mean inert. The same native rules serve every student.
p['control']={'playerAutonomy':True,'manualGrace':2,'cancelGrace':3}
p['schoolRevision']=2
weekday={'op':'lt','left':'$clock.weekday','right':5}
for aid in ['attend-class','teach-class']:
 p['actions'][aid]['when']=allof(idle,eq('$clock.period','class'),weekday)
 p['actions'][aid]['interruptWhen']['all'].append(weekday)
 p['actions'][aid]['autonomyGroup']='class'
for r in p['routines']:
 if r['id'] in ['attend-class','teach-class']:r['when']['all'].append(weekday)
p['routines']=[r for r in p['routines'] if r['id'] not in ['class-leave-chat','make-up-work','prepare-class','prepare-teach']]
p['routines'].append({'id':'class-leave-chat','action':'leave-conversation','priority':200,'repeat':True,'reason':'上课铃响了，先结束闲聊，回到课堂。','when':allof(eq('$clock.period','class'),weekday,{'not':idle},{'op':'lt','left':'$session.created','right':'$clock.periodStart'})})
# This rule is skipped by the input arbitrator while the player directs a conversation.
pol['people']['t']=[{'id':'free-interest','select':{'action':'draw-poster'},'when':[{'scope':'self','field':'period','op':'ne','value':'class'},{'scope':'self','field':'period','op':'ne','value':'lunch'},{'scope':'self','field':'activity','op':'eq','value':'free'}],'priority':12,'reason':'现在没有课，我喜欢画画，想去美术桌继续练习。'}]
p['actions']['skip-class']={'label':'这节课自行安排','executor':'instant','duration':0,'cooldown':0,'when':allof(eq('$actor.controlled',True),eq('$clock.period','class'),weekday),'effects':[{'type':'autonomy.defer','group':'class','text':'这节课由我自己安排；老师仍会点名，缺课会留下记录。'}],'ui':{'visible':False}}
p['actions']['make-up-work']=deepcopy(p['actions']['study'])
p['actions']['make-up-work'].update(label='补做缺课练习',duration=15,cooldown=0)
p['actions']['make-up-work']['roles']={'item':{'from':'objects','where':eq('$bound.id','$actor.profile.desk')},'obligation':{'from':'obligations','where':allof(eq('$bound.remedy','pending'),ge('$clock.time','$bound.end'))}}
p['actions']['make-up-work']['when']=allof(idle,eq('$clock.period','after-school'))
p['actions']['make-up-work']['effects']=[{'type':'obligation.complete','obligation':'$obligation.id'}]
p['routines'].append({'id':'make-up-work','action':'make-up-work','priority':115,'repeat':True,'reason':'老师记下了我的缺课，要先补完这一节的练习，再去参加放学后的活动。','when':eq('$clock.period','after-school')})
p['obligations']=[{'id':'lessons','label':'课堂考勤','noticeChannel':'school-notice','returnChannel':'classroom','period':'class','weekdays':[0,1,2,3,4],'room':'classroom','members':eq('$actor.role','student'),'actions':['attend-class'],'supervisor':eq('$actor.role','teacher'),'supervisorActions':['teach-class'],'grace':5,'absentAfter':15,'remedyAction':'make-up-work','text':{'reminder':'现在仍是上课时间，请尽快回到座位听课。','absence':'这节课累计已有 15 分钟没有听课，我已经登记缺课。','assigned':'放学后请在自己的座位补做 15 分钟练习，再去参加活动。','returned':'回来了就先坐好，跟上现在的内容。此前的迟到或缺课记录保留。','remedied':'补完了这节课的练习。补课任务已结清，原考勤记录保留。'}}]
prebell=allof(eq('$clock.nextPeriod','class'),{'op':'lte','left':'$clock.minutesToNext','right':10},weekday)
for aid,source,role,label in [('prepare-class','attend-class','student','去教室准备上课'),('prepare-teach','teach-class','teacher','到教室准备授课')]:
 p['actions'][aid]=deepcopy(p['actions'][source]);p['actions'][aid].update(label=label,duration=20,effects=[],autonomyGroup='class')
 p['actions'][aid]['when']=allof(idle,prebell,eq('$actor.role',role))
 p['actions'][aid]['interruptWhen']=allof(prebell,eq('$actor.role',role))
 p['routines'].append({'id':aid,'action':aid,'priority':90,'repeat':True,'reason':'距离上课不足十分钟，先去教室就位，避免铃响才开始赶路。','when':prebell})
p['schoolUI']={'attendAction':'attend-class','deferAction':'skip-class','remedyAction':'make-up-work','group':'class'}
p['schoolUpgradeActions']=['attend-class','teach-class','skip-class','make-up-work','prepare-class','prepare-teach']
for name,data in [('school-tuning.json',p),('school-scene.json',scene),('school-policies.json',pol)]: (root/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

# Keep spatial definitions after behavior updates.
import runpy
runpy.run_path(str(Path(__file__).with_name("refine-school-space.py")))
