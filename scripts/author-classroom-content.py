"""Classroom opportunities; the situation has no role plans or scripted speakers."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1] / 'dist/content'
p = json.loads((root/'school-tuning.json').read_text())
pol = json.loads((root/'school-policies.json').read_text())
eq = lambda a,b: {'op':'eq','left':a,'right':b}
ne = lambda a,b: {'op':'ne','left':a,'right':b}
ge = lambda a,b: {'op':'gte','left':a,'right':b}
allof = lambda *xs: {'all':list(xs)}
anyof = lambda *xs: {'any':list(xs)}
state = lambda k: '$situation.state.'+k
prepared = anyof(ge('$actor.resources.homework',2),ge('$actor.resources.research',2))
actions = {}
rules = []
def rule(action, priority, reason, *conditions):
    rules.append(dict(id=action,select={'action':action},priority=priority,reason=reason,when=list(conditions)))
def trait(field, op, value):
    return {'scope':'self','field':'profile-'+field,'op':op,'value':value}
def action(name,label,phase,role,text,set_values,when=None,target=None,intent=None,effects=None):
    aid='classroom-'+name
    roles={'situation':{'from':'situations','where':allof(eq('$bound.spec','classroom-discussion'),eq('$bound.phase',phase),eq('$bound.status','present'))}}
    if target: roles['target']={'from':'actors','where':eq('$bound.id',state(target))}
    conditions=[eq('$actor.room','$situation.room'),eq('$situation.ready',True),eq('$actor.session',None),eq('$actor.role',role)]
    if target: conditions.append(ne('$actor.id',state(target)))
    if when: conditions.append(when)
    contribution={'type':'situation.contribute','text':text,'set':set_values}
    if target: contribution['to']='$target.id'
    if intent: contribution['intent']=intent
    actions[aid]={'label':label,'executor':'instant','duration':0,'cooldown':0,'during':['attend-class','teach-class'],
        'roles':roles,'when':allof(*conditions),'effects':[contribution]+(effects or []),
        'ui':{'visible':False,'situation':True},'reason':text,'animation':{'clip':'argue' if name=='deflect' else 'talk'}}
    return aid

rule(action('open','请同学讲解思路','opening','teacher','这道练习谁愿意说说自己的思路？不确定的地方也可以直接说。',{'opened':True}),145,'留一点课堂时间，让同学把自己的思路说出来。')
rule(action('share-prepared','用做过的练习讲解','volunteer','student','这类题我做过练习。我想讲一下自己的做法，大家帮我看看有没有漏掉的条件。',{'presenter':'$actor.id','evidence':True},prepared),142,'我有实际练习或研究积累，愿意拿出来讨论。',trait('assertiveness','gte',35))
rule(action('try','先说说自己的猜想','volunteer','student','我还没完整做过，不过我觉得可以这样试。先说出来，大家一起看看。',{'presenter':'$actor.id','evidence':False},{'not':prepared}),138,'我愿意先尝试表达，即使目前准备还不充分。',trait('sociability','gte',65))
rule(action('question','追问依据','discussion','student','这一步为什么成立？你有做过的例子，还是现在猜的？',{'challenger':'$actor.id'},target='presenter',intent='classroom-question'),144,'我想知道这一步的依据，直接向发言的人提出疑问。',trait('assertiveness','gte',60))
rule(action('encourage','让同学慢慢说','discussion','student','先别急，让你把思路说完。不确定的地方我们可以一起查。',{'helper':'$actor.id'},eq(state('helper'),'none'),target='presenter',intent='support'),145,'我愿意给正在发言的同学一点支持。',trait('empathy','gte',70))
rule(action('offer-evidence','拿自己的练习一起核对','response','student','我这里做过类似的练习。我们把两种做法放一起核对，看看差在哪一步。',{'response':'supported','evidence':True},allof(prepared,ne('$actor.id',state('challenger'))),target='presenter',intent='support'),146,'我有可以核对的准备，也愿意帮助对方把问题讲清楚。',trait('empathy','gte',60))
rule(action('explain','说明练习中的依据','response','student','我按做过的练习重新核对了一遍，这一步需要前面的条件，刚才我没交代清楚。',{'response':'explained'},allof(eq('$actor.id',state('presenter')),eq(state('evidence'),True)),target='challenger',intent='classroom-explanation'),148,'有实际准备，就把被追问的依据补充清楚。')
p['projects']['classroom-followup']={'title':'把课堂上没弄明白的练习补一遍','motive':'我在讨论里承认了准备不足，答应课后亲自核对。','priority':58,'activeWhen':ne('$clock.period','class'),'windowLabel':'下课后找自己的课桌补做，身体需要仍可优先。','steps':[{'action':'study','roles':{'item':'$actor.profile.desk'},'label':'课后实际完成一次练习'}]}
commit={'type':'goal.commit','withinMinutes':1440,'project':'classroom-followup'}
rule(action('admit','承认没准备好，约定补做','response','student','你问得对，这一步我还没验证。我下课补做一遍，再把弄明白的地方说清楚。',{'response':'admitted'},eq('$actor.id',state('presenter')),target='challenger',intent='classroom-admission',effects=[commit]),140,'我愿意承认暂时不知道，并把补做变成自己的安排。')
rule(action('deflect','坚持猜想，暂不补充依据','response','student','我说的是一种思路，又没说已经证明了。为什么非得现在追着我问？',{'response':'disputed'},eq('$actor.id',state('presenter')),target='challenger',intent='classroom-deflection'),147,'我很在意当众被追问，先维护自己的立场。',trait('status-concern','gte',65))
rule(action('close-clear','确认依据并继续讲课','review','teacher','现在有可以核对的练习依据了。我们把用到的条件写清楚，再往下讲。',{'outcome':'clarified'},anyof(eq(state('response'),'explained'),eq(state('response'),'supported'))),145,'根据同学实际拿出的依据收束讨论。')
rule(action('close-open','保留疑问，继续课程','review','teacher','这个疑问先留着，还没有说清楚的部分别当成定论。课后可以接着核对，我们先继续。',{'outcome':'unresolved'},{'not':anyof(eq(state('response'),'explained'),eq(state('response'),'supported'))}),145,'没有核对清楚，就保留问题，不替同学认定答案或和解。')
def transition(when, **kw): return {'when':when,**kw}
elapsed=lambda n:ge('$metrics.phaseMinutes',n)
phases={
 'opening':{'label':'老师可以邀请同学讲解；也可能没有人开启讨论。','transitions':[transition(eq(state('opened'),True),next='volunteer'),transition(elapsed(15),result='expired',text='没有开启课堂讨论，课程照常进行。')]},
 'volunteer':{'label':'谁愿意说说自己的思路？也可以继续听课。','transitions':[transition(ne(state('presenter'),'none'),next='discussion'),transition(elapsed(12),result='completed',text='没有同学主动讲解，这次留白后继续课程。')]},
 'discussion':{'label':'同学正在讲解，旁人可以支持，也可以追问依据。','transitions':[transition(ne(state('challenger'),'none'),next='response'),transition(elapsed(12),next='review')]},
 'response':{'label':'有人提出了疑问：发言者可以解释、承认没准备好，或坚持原来的说法。','transitions':[transition(ne(state('response'),'none'),next='review'),transition(elapsed(12),next='review')]},
 'review':{'label':'老师根据已经发生的讨论收束，未解决的问题仍会保留。','transitions':[transition(eq(state('outcome'),'clarified'),result='completed',text='同学拿出了练习依据，课堂疑问得到澄清；各自的感受仍保留。'),transition(eq(state('outcome'),'unresolved'),result='completed',text='课程继续，疑问尚未解决；说过的话和个人承诺已经留下记录。')]},
}
situation={'id':'classroom-discussion','label':'课堂讨论 · 这一步凭什么成立','at':524,'repeat':1440,'weekdays':[0,1,2,3,4],'duration':68,'room':'classroom','initial':'opening',
 'members':anyof(eq('$actor.role','student'),eq('$actor.role','teacher')),'during':['attend-class','teach-class'],'turnMinutes':3,
 'state':{'opened':False,'presenter':'none','challenger':'none','helper':'none','evidence':False,'response':'none','outcome':'none'},'phases':phases,
 'notice':'课堂留出一段讨论时间，发言和回应都由在场的人自己决定。','expiredText':'讨论时间结束，未说清楚的部分没有自动解决。'}
p['actions'].update(actions)
p['situations']=[s for s in p['situations'] if s['id']!=situation['id']]+[situation]
p['appraisals']=[a for a in p['appraisals'] if not a['id'].startswith('classroom-')]
for intent,changes,reason in [('classroom-explanation',{'respect':4,'trust':2},'对方拿出了可以核对的依据。'),('classroom-admission',{'respect':3},'对方坦率承认了暂时不知道。'),('classroom-deflection',{'affinity':-3,'grievance':4},'我的疑问被当作针对个人，讨论没有得到回应。')]:
 p['appraisals'].append({'id':intent,'when':allof(eq('$event.kind','social-act'),eq('$event.intent',intent),eq('$event.to','$observer')),'changes':changes,'reason':reason})
p['appraisals'].append({'id':'classroom-sensitive-question','when':allof(eq('$event.intent','classroom-question'),eq('$event.to','$observer'),ge('$actor.profile.status-concern',65)),'changes':{'grievance':3},'reason':'当众被追问使我感到难堪；这不代表对方真的有恶意。'})
p['classroomRevision']=1
p['classroomActions']=list(actions)
pol['common']=[r for r in pol['common'] if not r['id'].startswith('classroom-')]+rules
for name,data in [('school-tuning.json',p),('school-policies.json',pol)]:
 (root/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
