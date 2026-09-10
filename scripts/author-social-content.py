"""Social vocabulary and character seeds; no engine source patching, no prescribed outcome."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def read(name):return json.loads((root/'dist/content'/name).read_text())
def write(name,data):(root/'dist/content'/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
p=read('school-tuning.json');scene=read('school-scene.json');policies=read('school-policies.json')
eq=lambda a,b:{'op':'eq','left':a,'right':b}
ne=lambda a,b:{'op':'ne','left':a,'right':b}
allof=lambda *a:{'all':list(a)}
p['socialRevision']=1
p['reflection']={'enabled':True,'at':1080,'includePlayer':False}
p['relationships']={k:{'label':label,'min':-100 if k!='grievance' else 0,'max':100,'initial':0} for k,label in [('trust','信任'),('affinity','亲近'),('grievance','积怨'),('respect','尊重')]}
for k,c in p['cognition'].items():c.update(mutable=True,**({'maxDailyChange':3,'maxDrift':24} if c['type']=='number' else {}))
for k,label in [('status-concern','在意群体评价'),('empathy','体谅他人'),('assertiveness','表达立场')]:p['cognition'][k]={'label':label,'type':'number','min':0,'max':100,'mutable':True,'maxDailyChange':3,'maxDrift':24}
traits={'t':(32,75,28),'m':(72,70,48),'f':(85,38,63),'a':(25,65,40),'q':(40,82,72),'r':(68,42,80),'l':(50,72,56),'teacher':(20,80,85)}
for a in scene['actors']:
 for k,v in zip(['status-concern','empathy','assertiveness'],traits[a['id']]):a['profile'][k]=v
scene['relationships']=[{'owner':a,'subject':b,'values':v} for a,b,v in [
 ('m','t',{'trust':34,'affinity':50}),('t','m',{'trust':28,'affinity':32}),
 ('f','m',{'trust':58,'affinity':65}),('m','f',{'trust':48,'affinity':55}),
 ('f','t',{'trust':-10,'affinity':-18}),('q','t',{'trust':35,'affinity':42}),
 ('q','f',{'trust':30,'affinity':20}),('a','t',{'trust':30,'affinity':35}),
 ('r','m',{'trust':40,'affinity':45}),('l','f',{'trust':25,'affinity':30})]]
p['appraisals']=[]
def appraisal(id,when,changes,reason,subject='speaker'):
 p['appraisals'].append(dict(id=id,when=when,changes=changes,reason=reason,subject=subject))
for intent,changes,reason in [
 ('support',{'trust':5,'affinity':6,'grievance':-2},'对方愿意支持我。'),
 ('apology',{'trust':2,'grievance':-3},'听到了道歉，还需要看后续行动。'),
 ('exclusion',{'affinity':-12,'trust':-8,'grievance':15},'对方明确把我排除在外。'),
 ('boundary',{'respect':5,'affinity':-2},'对方明确表达了界限。'),
 ('confide',{'affinity':4,'trust':3},'对方愿意向我说自己的顾虑。')]:
 appraisal('receive-'+intent,allof(eq('$event.kind','social-act'),eq('$event.intent',intent),eq('$event.to','$observer')),changes,reason)
appraisal('witness-exclusion',allof(eq('$event.kind','social-act'),eq('$event.intent','exclusion'),ne('$event.actor','$observer'),ne('$event.to','$observer'),{'op':'gte','left':'$actor.profile.empathy','right':60}),{'respect':-8,'trust':-4},'亲眼看到对方排斥同学，我不认同这种做法。')
for kind,changes,reason in [('brokenPromise',{'trust':-12,'grievance':12},'对方没有兑现约定。'),('commitment-fulfilled',{'trust':8,'grievance':-5},'对方用实际行动兑现了承诺。'),('cooperate',{'trust':3,'affinity':3},'对方愿意合作。'),('refuse',{'affinity':-2},'这次请求被拒绝，不等于对方永远拒绝我。')]:
 appraisal('experience-'+kind.lower(),allof(eq('$event.kind',kind),ne('$event.actor','$observer')),changes,reason)
base=p['actions']['say']
for id,label,intent,text,clip in [
 ('support-peer','表达支持','support','我愿意和你一起做。别人怎么说，我会自己判断。','talk'),
 ('apologize-peer','为自己的行为道歉','apology','之前那样处理让你难受了，对不起。我想听听你的想法。','talk'),
 ('exclude-peer','表达不想同行','exclusion','这次我们想自己一起，你先别跟过来了。','argue'),
 ('set-boundary','表明自己的界限','boundary','我在乎我们的关系，但我不想因为这个就排斥别人。','talk'),
 ('confide-concern','说出自己的顾虑','confide','我有点担心，夹在朋友之间不知道怎么处理。','talk')]:
 a=json.loads(json.dumps(base));a.update(label=label,cooldown=60,animation={'clip':clip,'speed':1});a['parameters']['text']['default']=text;a['parameters']['about']={'type':'string','default':'none'}
 a['effects']=[{'type':'speech.emit','kind':'social-act','to':'$target.id','text':'$args.text','data':{'intent':intent,'about':'$args.about'}}];p['actions'][id]=a
for kind,label,text in [('reconnect','提出重新来往','我们还可以慢慢重新来往吗？你也可以先想一想。'),('support','征求朋友的支持','我想按自己的想法处理这段关系，你愿意支持我吗？')]:
 p['proposals'][kind]={'accept':[],'decline':[]}
 a=json.loads(json.dumps(base));a.update(label=label,cooldown=1440);a['parameters']['text']['default']=text
 a['effects']=[{'type':'offer.create','kind':kind,'to':'$target.id','text':'$args.text'}];p['actions']['propose-'+kind]=a
seek=json.loads(json.dumps(p['actions']['start-conversation']));seek.update(label='去上次见到对方的地方找找',cooldown=30,parameters={},effects=[{'type':'event.emit','kind':'contact-searched','text':'到上次见到对方的地方找了找。'}]);seek['roles']['target']['from']='contacts';seek['when']=allof(eq('$actor.session',None),eq('$target.visible',False));p['actions']['seek-contact']=seek
socialrules=[
 {'id':'speak-up-against-exclusion','select':{'action':'set-boundary'},'when':[{'scope':'self','field':'profile-assertiveness','op':'gte','value':50},{'scope':'self','field':'profile-empathy','op':'gte','value':60},{'scope':'memory','key':'*','field':'predicate','value':'social-exclusion','matchTarget':True,'maxAgeMinutes':1440}],'priority':65,'reason':'我仍记得对方排斥同学的事，也愿意明确说出自己的界限。'},
 {'id':'consider-reconnect','select':{'action':'accept-offer','offer-kind':'reconnect'},'when':[{'scope':'candidate','field':'target-trust','op':'gte','value':10},{'scope':'candidate','field':'target-grievance','op':'lt','value':40}],'priority':132,'reason':'我还愿意信任这个人，接受慢慢重新来往。'},
 {'id':'decline-reconnect','select':{'action':'decline-offer','offer-kind':'reconnect'},'when':[{'scope':'candidate','field':'target-grievance','op':'gte','value':40}],'priority':134,'reason':'积累的伤害还没有消化，暂时不答应。'},
 {'id':'support-friend','select':{'action':'accept-offer','offer-kind':'support'},'when':[{'scope':'self','field':'profile-empathy','op':'gte','value':60},{'scope':'candidate','field':'target-trust','op':'gte','value':10}],'priority':132,'reason':'我愿意支持信任的朋友自行处理关系。'},
 {'id':'hesitate-support','select':{'action':'decline-offer','offer-kind':'support'},'when':[{'scope':'self','field':'profile-status-concern','op':'gte','value':75}],'priority':133,'reason':'这件事触及我在意的群体关系，现在不愿支持。'}]
ids={r['id'] for r in socialrules};policies['common']=[r for r in policies['common'] if r['id'] not in ids]+socialrules
# Open-ended social intentions. Only an opportunity and one actor's intent are seeded.
# The recipient retains independent invitation/consent decisions.
for owner,target,title,motive in [('m','t','找机会恢复自然来往','我喜欢和知夏相处，也不想总受朋友的眼光影响。'),('q','f','先听听朋友们的顾虑','我希望社团能合作下去，先听清楚朋友的想法。')]:
 key='social-'+owner+'-'+target;actor=next(a for a in scene['actors'] if a['id']==owner)
 actor['profile']['projects']=[x for x in actor['profile']['projects'] if not x.startswith('social-')]+[key]
 p['projects'][key]={'title':title,'motive':motive,'about':[target],'priority':64,'activeWhen':allof(eq('$clock.period','after-school'),eq('$actor.participating',False)),'windowLabel':'放学后寻找合适的私下交流机会','steps':[
 {'label':'找合适的机会单独聊聊','action':'start-conversation','roles':{'target':target},'args':{'access':'private','topic':'朋友之间的顾虑'},'skipWhen':allof({'op':'includes','left':'$session.active','right':target},eq('$session.access','private')),'alternatives':[{'action':'seek-contact','roles':{'target':target}}]},
 {'label':'先说出自己的顾虑','action':'confide-concern','roles':{'target':target},'alternatives':[{'action':'start-conversation','roles':{'target':target},'args':{'access':'private','topic':'朋友之间的顾虑'}},{'action':'seek-contact','roles':{'target':target}}]},
 {'label':'听过后继续自己的日常','action':'leave-conversation','skipWhen':eq('$actor.session',None)}]}
write('school-tuning.json',p);write('school-scene.json',scene);write('school-policies.json',policies)
