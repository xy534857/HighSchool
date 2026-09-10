import {validateSituation} from './schema.js';
const c=(key,value,op='eq')=>[key,op,value];
const own=(key,value=true)=>({op:'remember',key,value});
const say=(key,value=true)=>({op:'tell',key,value});
const talk=(id,actor,target,label,when,effects,text,reason,priority=190)=>({id,actor,target,label,when,effects,text,reason,priority,mode:'talk',minutes:1});
const work=(id,actor,spot,label,when,effects,text,reason,minutes=8,priority=200)=>({id,actor,spot,label,when,effects,text,reason,priority,mode:'physical',minutes});
const roles=(wants)=>Object.fromEntries(Object.entries(wants).map(([id,want])=>[id,{want,memory:want,job:'按自己的判断处理',line:want}]));
export const SITUATIONS=[
 {version:1,id:'detective',title:'小雨急着筹钱',premise:'小雨借来的玩具坏了，明天要还。他的钱不够，家人还不知道这件事。',source:{title:'第一部第8集《家有神探》',url:'https://tv.cctv.com/2010/06/11/VIDE1354275039784131.shtml'},
 roles:roles({xiaoyu:'把借来的玩具好好还回去，最好别先挨一顿批评。',xing:'想让家人承认自己也能解决问题，被冤枉时尤其想查个明白。',xue:'愿意帮弟弟，但要弄清责任，也要留下复习时间。',me:'找回家里的东西，问清楚是谁拿走的。',dad:'先听各人的说法，再把赔偿和误会分别处理。'}),
 facts:{broken:'unknown',culprit:'unknown','needs-money':'unknown','album-missing':'unknown',accused:false,'made-accusation':false,'asked-help':false,'repair-offer':false,repaired:'unknown',confessed:false,cleared:false,returned:false,debt:0,cash:0,'goal-left':0,energy:0},
 seeds:{xiaoyu:{broken:true,culprit:'xiaoyu','needs-money':true}},
 objects:[{id:'toy',name:'借来的小汽车',location:'deskYu',condition:'broken',owner:'xiaoyu',private:true},{id:'album',name:'家里的旧画册',location:'book',condition:'intact',owner:'family'}],
 observations:[{object:'toy',property:'condition',value:'broken',key:'broken',result:true},{object:'toy',property:'condition',value:'repaired',key:'repaired',result:true},{object:'album',at:'book',property:'location',value:'book',op:'ne',key:'album-missing',result:true}],
 actions:[
 work('put-album-aside','xiaoyu','book','把旧画册拿到自己桌边', [c('needs-money',true),c('repaired','unknown')],[{op:'move',object:'album',to:'deskYu'}],'小雨把旧画册搬到自己桌边，想看看它能不能换到赔玩具的钱。','手头的钱不够，我想先找件旧东西；还没有得到出售许可。',3,225),
 talk('ask-brother','xiaoyu','xing','悄悄向哥哥求助',[c('broken',true),c('repaired','unknown')],[own('asked-help'),say('broken'),say('culprit','xiaoyu'),say('needs-money')],'哥，借来的小汽车让我弄坏了。你能先帮我想个办法吗？别一上来就喊妈。','哥哥比较好说话，我先告诉他真实原因，看看能否修好。',215),
 talk('ask-sister','xing','xue','请姐姐看看能不能修',[c('broken',true),c('culprit','xiaoyu'),c('repaired','unknown')],[say('broken'),say('culprit','xiaoyu'),own('asked-help')],'小雨那车轮掉了。你手巧，能不能看看？我负责把事情问明白。','修理比直接凑钱更可行，我向姐姐求助。'),
 talk('offer-repair','xue','xiaoyu','提出有限的修理帮助',[c('broken',true),c('repaired','unknown'),c('goal-left',70,'lt')],[own('repair-offer'),say('repair-offer')],'我可以花十分钟试着修。你得在旁边帮忙，修不好就一起跟爸妈说。','我还有复习，但能拿出十分钟；帮助不等于替弟弟隐瞒所有后果。',210),
 talk('decline-repair','xue','xiaoyu','说明自己暂时腾不开',[c('broken',true),c('repaired','unknown'),c('repair-offer',false),c('goal-left',69,'gt')],[say('asked-help'),say('repair-offer',false)],'我这一段复习还没做完，现在接不了。你先找爸爸，别把事情拖到明天。','当前目标时间紧，明确拒绝而不是先答应。',220),
 work('repair-toy','xue','deskYu','在弟弟桌边修小汽车',[c('repair-offer',true),c('repaired','unknown')],[{op:'repair',object:'toy'},own('repaired')],'夏雪检查车轴，把松掉的车轮装回去了。','我已经答应帮忙，现在实际修理，完成后才算兑现。',10,240),
 talk('report-repair','xue','xiaoyu','把修理结果告诉弟弟',[c('repaired',true)],[say('repaired'),{op:'social',value:'cooperate'}],'轮子装好了。明天还给同学时，把摔过这件事也说明白。','修理结束了，要把结果交代给借东西的人。',220),
 talk('suspect-xing','me','xing','询问画册是不是刘星拿了',[c('album-missing',true),c('culprit','unknown')],[say('accused'),own('made-accusation')],'画册怎么不在了？刘星，是不是你又拿去玩了？','我发现画册不在原处，先想到平时爱动东西的刘星；这只是怀疑。',185),
 talk('defend-self','xing','me','解释自己知道的线索',[c('accused',true),c('culprit','xiaoyu')],[say('culprit','xiaoyu'),say('broken'),own('cleared')],'怎么一少东西就找我？小雨是急着赔坏掉的玩具，我正帮他找办法呢。','我被直接怀疑，愿意说出已知的真实原因来澄清。',270),
 talk('confess','xiaoyu','dad','向爸爸坦白并求助',[c('broken',true),c('repaired','unknown')],[own('confessed'),say('culprit','xiaoyu'),say('broken'),say('needs-money')],'爸，我把同学的小汽车弄坏了，钱也不够。我怕挨说，刚才还想动家里的画册。','单靠自己处理不了，可以把原因讲给爸爸；坦白也是可选办法。',175),
 talk('advance-money','dad','xiaoyu','借出赔偿的钱并约定归还',[c('needs-money',true),c('repaired','unknown')],[{op:'transfer',from:'dad',to:'xiaoyu',amount:20,debt:true},say('needs-money',false)],'我先借你二十，修不好再用来赔。钱和画册都是有主人的，用之前得商量。','孩子明确求助，我能先垫钱，但保留借款责任。',205),
 work('return-album','xiaoyu','deskYu','把画册放回书架',[c('repaired',true),c('album-missing',true)],[{op:'move',object:'album',to:'book'},own('returned')],'小雨把画册放回书架，没有把它卖掉。','玩具修好了，不需要动用别人的东西，把画册归还。',4,225),
 talk('apologize-for-suspicion','me','xing','为没查清就怀疑而道歉',[c('culprit','xiaoyu'),c('album-missing',true),c('made-accusation',true)],[say('cleared'),{op:'social',value:'apology'}],'这回是我没问清就想到你了。帮弟弟是好事，刚才那句我收回。','新消息推翻了最初的怀疑，我需要向被怀疑的人承认这一点。',220),
 talk('thank-sister','xiaoyu','xue','感谢姐姐帮忙',[c('repaired',true)],[{op:'social',value:'cooperate'}],'谢谢姐。明天我自己跟同学说，你不用替我去。','得到实际帮助后，我愿意自己承担归还和说明的责任。',180)
 ,talk('repay-dad','xiaoyu','dad','把没用上的赔偿钱还给爸爸',[c('repaired',true),c('debt',0,'gt'),c('cash',19,'gt')],[{op:'transfer',from:'xiaoyu',to:'dad',amount:20,repayment:true}], '车修好了，这二十块没用上，还给你。这回没有把钱花掉。','借款用途已经消失，归還钱才能结束债务。',230)
 ],end:['return-album'],endState:[{object:'toy',property:'condition',value:'repaired'},{object:'album',property:'location',value:'book'}],followup:'玩具是否修好、借款是否归还和被误会的人是否得到道歉，分别继续记录。'},
 {version:1,id:'reports',title:'小雨的消息有了价钱',premise:'刘星惦记着先看比赛再做作业。小雨恰好知道这个打算，妈妈却还不知道。',source:{title:'第一部第25集《小汇报》',url:'https://tv.cctv.com/2010/06/11/VIDE1354275230016541.shtml'},
 roles:roles({xiaoyu:'想得到妈妈的肯定，也想让哥哥继续陪自己玩。',xing:'想保住自己的娱乐时间，不喜欢弟弟把每件事都报告出去。',xue:'不喜欢未经允许就转述自己的事，要求把隐私说清楚。',me:'想知道孩子有没有按安排做事，也要弄清消息是否可靠。',dad:'希望孩子愿意交流，留意奖励是否把交流变成了交易。'}),
 facts:{'tv-plan':'unknown',reported:false,rewarded:false,'keep-secret':false,'report-offer':false,'privacy-concern':false,verified:false,'reward-stopped':false,cash:0,energy:0,'goal-left':0},seeds:{xiaoyu:{'tv-plan':true},xing:{'tv-plan':true}},objects:[],observations:[],
 actions:[
 talk('report-plan','xiaoyu','me','告诉妈妈哥哥的看球打算',[c('tv-plan',true),c('keep-secret',false)],[say('tv-plan'),own('reported')],'妈，哥哥说他想先看比赛，作业晚点再做。','我确实听过这个打算，告诉妈妈也许能得到表扬。',200),
 talk('praise-report','me','xiaoyu','奖励主动汇报',[c('tv-plan',true),c('reward-stopped',false)],[{op:'transfer',from:'me',to:'xiaoyu',amount:2},say('rewarded')],'你肯告诉妈妈，我给你两块零用钱。不过他到底做没做作业，我还得问他。','我想鼓励孩子交流，先给了奖励；这并没有证实哥哥违规。',200),
 talk('advertise-reward','xiaoyu','xing','向哥哥炫耀奖励',[c('rewarded',true)],[say('rewarded'),say('reported')],'妈说我消息灵通，还给我两块钱呢。你还有别的消息吗？','奖励让我觉得汇报有好处，想向哥哥炫耀。',220),
 talk('buy-silence','xing','xiaoyu','提出用零用钱换保密',[c('rewarded',true),c('cash',2,'gt')],[say('report-offer')],'我也出三块。以后我自己的安排，先问我能不能往外说，成不成？','我觉得自己的安排被拿去领奖，想用更高的条件换回控制。',230),
 talk('accept-secret-deal','xiaoyu','xing','答应先征求同意',[c('report-offer',true)],[say('keep-secret'),own('keep-secret')],'三块啊？那我以后先问你。不过要是闯了祸，我可不替你瞒。','我想要零用钱，也想留住哥哥；只接受有限的保密约定。',230),
 talk('pay-for-promise','xing','xiaoyu','兑现答应的三块钱',[c('keep-secret',true)],[{op:'transfer',from:'xing',to:'xiaoyu',amount:3}], '说好的三块给你。可别转头又把这三块的事当新闻卖了。','弟弟已经亲口接受条件，我履行自己的付款承诺。',245),
 talk('privacy-question','xue','xiaoyu','问清消息能不能随便转述',[c('rewarded',true)],[say('privacy-concern'),own('privacy-concern')],'那我的事情你也准备拿去领奖？涉及别人，至少先问一声吧。','听到消息被奖励，我担心同样的事情发生在自己身上。',220),
 talk('tell-sister','xiaoyu','xue','向姐姐谈起这笔交易',[c('keep-secret',true)],[say('rewarded'),say('report-offer')],'姐，哥哥说消息得先问过他，还答应给我三块。这算不算工作？','我接受了新约定，却不懂这个交换是否妥当，找姐姐问问。',185),
 talk('tell-dad','xue','dad','向爸爸反映隐私问题',[c('privacy-concern',true)],[say('privacy-concern'),say('rewarded')],'小雨现在把消息和零用钱算在一起了。咱们到底是在鼓励交流，还是鼓励打听别人？','担忧来自弟弟实际告诉我的交易，我要请家长讨论制度。',215),
 talk('verify-with-xing','me','xing','直接向刘星核实安排',[c('tv-plan',true)],[say('verified'),own('verified')],'小雨说你想先看比赛。你自己说说，作业准备什么时候做？','听来的计划不等于已发生的违规，要听当事人的说明。',195),
 talk('explain-plan','xing','me','说明自己的打算',[c('verified',true)],[say('privacy-concern')],'我说的是自己的打算。你可以问我先做哪件事，别只听转述就给我定罪啊。','妈妈确实来核实了，我说明计划与行动的区别。',230),
 talk('discuss-incentive','dad','me','提出停止按消息发钱',[c('privacy-concern',true)],[say('reward-stopped'),own('reward-stopped'),{op:'policy',key:'pay-for-reports',value:false}],'孩子开始谈消息的价钱了。以后听他们说，但别按条发钱；涉及谁，就找谁核实。','实际交易暴露了奖励的问题，我提出修改以后的做法。',240),
 talk('explain-new-rule','me','xiaoyu','向小雨解释新的约定',[c('reward-stopped',true)],[say('reward-stopped'),{op:'social',value:'correction'}],'以后愿意聊天，妈妈照样听。零用钱不再按消息算，也不能把猜测当事实。','家庭做法改变后，需要让之前得到奖励的孩子实际听到。',220)
 ],carry:['reward-stopped','keep-secret'],end:['explain-new-rule'],followup:'保密承诺、真实付款与信息信任留下来；不会在第二天自动复原。'},
 {version:1,id:'chores',title:'家务卡到底怎么算',premise:'爸爸想试行家务卡：先做事，再验收，合格后换零用钱。孩子们对怎样算一份工作各有主意。',source:{title:'第一部第48集《给家里打工》',url:'https://tv.cctv.com/2010/06/11/VIDE1354275395402484.shtml'},
 roles:roles({dad:'试行一个孩子愿意参与、家长也能兑现的家务制度。',me:'家里真正变干净，不能只是卡片数字好看。',xing:'想用比较省力的办法挣零用钱，觉得规则应该讲清楚。',xue:'愿意劳动，但希望质量和工作量得到公平对待。',xiaoyu:'想和哥哥一起干，也想得到自己那份。'}),
 facts:{announced:false,worked:false,submitted:false,inspected:false,approved:false,rework:false,paid:false,'quality-rule':false,'split-proposal':false,'shared-job':false,cash:0,energy:0,'goal-left':0},seeds:{dad:{announced:true}},objects:[],observations:[],
 actions:[
 ...['xing','xue','xiaoyu','me'].map(target=>talk('announce-'+target,'dad',target,'商量家务卡',[c('announced',true)],[say('announced')],'今天试试家务卡：一份活两块钱，做完找妈妈验收。我负责把承诺的钱付出来。','只有实际听到规则的人，才知道怎样参与。',190)),
 work('quick-job','xing','clean','快速擦桌边',[c('announced',true),c('quality-rule',false),c('worked',false)],[{op:'clean',quality:1,amount:5},own('worked')],'刘星很快擦了一圈桌边，角落还留着污渍。','规则只说一份活，我想先试试最省时间的做法。',3,210),
 work('proper-job','xing','clean','按上次说清的标准做家务',[c('announced',true),c('quality-rule',true),c('worked',false)],[{op:'clean',quality:3,amount:12},own('worked')],'刘星这次先把边角擦干净，再准备申请家务卡。','记得以前返工和争论过，先达到已经讲清楚的标准。',8,220),
 work('careful-job','xue','clean','认真收拾桌面',[c('announced',true)],[{op:'clean',quality:3,amount:14},own('worked')],'夏雪把桌面和边角都擦过，再把东西摆齐。','我希望做出的活能经得起验收。',9,205),
 talk('join-brother','xiaoyu','xing','请求一起做家务',[c('announced',true),c('worked',false)],[say('shared-job'),own('shared-job')],'哥，我也想挣两块。我帮你拿抹布，咱们能一起干吗？','我想参与，又希望哥哥带着我。',210),
 work('small-job','xiaoyu','clean','整理自己的玩具',[c('announced',true)],[{op:'clean',quality:2,amount:8},own('worked')],'小雨把自己散着的玩具收进盒里。','先完成自己做得到的一份活，才有理由申请家务卡。',6,200),
 ...['xing','xue','xiaoyu'].map(actor=>talk('submit-'+actor,actor,'me','请妈妈验收',[c('worked',true)],[own('submitted'),{op:'tell',key:'submitted-'+actor,value:0,valueFrom:'work-version'}],'我的那份干完了，你来看看，能不能算一张卡？','把实际完成的劳动交给验收者，不能自己给自己发钱。',220)),
 ...['xing','xue','xiaoyu'].map(target=>work('inspect-'+target,'me','clean','检查'+({xing:'刘星',xue:'夏雪',xiaoyu:'小雨'})[target]+'的劳动',[c('submitted-'+target,0,'gt')],[{op:'inspect-work',actor:target}], '刘梅走到桌边，检查这份劳动留下的实际效果。','收到验收请求后，亲自检查劳动记录和质量。',3,230)),
 ...['xing','xue','xiaoyu'].map(target=>talk('pay-'+target,'me',target,'发放验收合格的家务报酬',[c('approved-'+target,true)],[{op:'transfer',from:'family',to:target,amount:2},say('paid')],'这份验收合格，两块钱给你。只算这次实际做过的活。','这份劳动已经合格且未付款，兑现报酬。',240)),
 talk('reject-quick-job','me','xing','指出需要返工的地方',[c('rework-xing',true)],[say('rework')],'桌沿是擦了，角落还脏着。现在这份不能算合格，你回来补一下。','检查到实际质量不足，解释拒付原因，而不是只扣一个分数。',250),
 talk('argue-count','xing','dad','向爸爸争论怎样计数',[c('rework',true)],[say('split-proposal'),say('quality-rule')],'你说做一份算一张，可没说边角另算不算。我补擦一遍，能不能算两份？','我不想白做，尝试利用计数规则讨价还价。',245),
 talk('revise-quality','dad','xing','明确质量与重复计分',[c('quality-rule',true)],[{op:'policy',key:'chore-quality',value:2},say('quality-rule')],'补完还是原来那份。以后说清楚：达到约定质量才算，返工不能再领一张。','这次争议说明计分条件不清楚，修改未来的验收规则。',260),
 work('redo-job','xing','clean','把没擦好的角落补完',[c('quality-rule',true),c('rework',true)],[{op:'clean',quality:3,amount:10},own('rework',false)],'刘星把漏掉的角落补擦干净。','规则和拒付原因已经明确；补好以后仍能拿到原先的报酬。',7,240),
 talk('resubmit','xing','me','请妈妈重新验收',[c('quality-rule',true),c('rework',false),c('paid',false)],[{op:'tell',key:'submitted-xing',value:0,valueFrom:'work-version'},own('submitted')],'这回边角也干净了。还是原来那张卡，你再看一眼。','我完成了返工，请同一个验收者重新检查。',245)
 ],carry:['quality-rule'],end:['pay-xing','pay-xue','pay-xiaoyu'],followup:'家务报酬保存在各人的钱包里，修订后的质量门槛以后继续生效。'},
 {version:1,id:'fear',title:'刘星说自己一点也不怕',premise:'刘星想看一段有点吓人的影片。是否观看、看后找谁陪伴，都由他自己决定。',source:{title:'第一部第59集《别出声》',url:'https://tv.cctv.com/2010/06/11/VIDE1354275379483211.shtml'},
 roles:roles({xing:'想证明自己胆大；真害怕时又希望有人陪，最好别被弟弟笑。',xiaoyu:'想跟哥哥一起玩，但不愿被当成壮胆工具。',xue:'想安静做完自己的事，也能看出哥哥的借口。',dad:'弄清孩子为什么总待在身边，给他实际的帮助。',me:'希望大家按时睡，必要时愿意安慰孩子。'}),
 facts:{watched:false,fear:0,'company-request':false,'fear-known':false,'light-on':false,comforted:false,'avoid-scary':false,cash:0,energy:0,'goal-left':0},seeds:{xing:{}},objects:[],observations:[],
 actions:[
 work('watch-scary','xing','tv','看一小段惊险影片',[c('avoid-scary',false)],[{op:'fear',amount:65},own('watched')],'刘星看完一段惊险影片，离开沙发时还回头看了看电视。','我想看看自己能不能扛住这种片子；看完的身体反应再影响接下来的选择。',10,205),
 talk('ask-brother-company','xing','xiaoyu','找借口请弟弟陪着',[c('fear',25,'gt')],[say('company-request')],'要不要一起去那边拿本书？我主要是怕你一个人无聊。','我有点怕，又想保住面子，先找弟弟作伴。',225),
 talk('question-bravery','xiaoyu','xing','问哥哥是不是害怕',[c('company-request',true)],[say('fear-known'),own('fear-known')],'你不是说一点都不怕吗？怎么拿本书也要两个人？','哥哥突然要人陪，我想问明白，而不是自动照办。',230),
 talk('admit-to-dad','xing','dad','向爸爸承认有点害怕',[c('fear',25,'gt')],[say('fear-known')],'爸，你还写稿吗？我在旁边坐一会儿。刚才那片子……确实有点吓人。','找家长求助比继续逞强更能缓解害怕。',215),
 talk('comfort-child','dad','xing','陪刘星说清影片和现实',[c('fear-known',true)],[{op:'comfort',amount:42},say('comforted'),{op:'social',value:'cooperate'}],'害怕就说害怕，这又不扣分。我陪你待一会儿，等缓过来再去睡。','孩子明确求助，我在身边回应并安慰，而不是远程消除情绪。',235),
 talk('ask-mom-light','xing','me','请求睡前留一盏灯',[c('fear',10,'gt')],[say('company-request'),say('fear-known')],'妈，今晚那盏小灯能晚点关吗？不是浪费电，我还没完全缓过来。','仍有一点害怕，提出一个具体且能执行的睡前请求。',200),
 work('leave-light','me','bed4','替刘星打开床边灯',[c('fear-known',true)],[{op:'policy',key:'night-light',value:true},own('light-on')],'刘梅走到刘星床边，打开小夜灯。','听到孩子的实际请求，去床边提供帮助。',3,230),
 talk('tell-light','me','xing','告诉刘星小灯已经开了',[c('light-on',true)],[say('light-on'),{op:'comfort',amount:22}],'灯开好了。今晚先安心睡，明天再挑适合看的片子。','灯已实际打开，再告诉孩子，不用一句话代替物品操作。',235),
 talk('choose-next-film','xing','xue','商量下次换个影片',[c('watched',true),c('fear',25,'lt')],[own('avoid-scary'),say('avoid-scary')],'下回你挑片子吧。倒不是不敢看，我觉得喜剧比较有营养。','记得这次害怕和得到帮助的经历，下次改选更轻松的内容。',195)
 ,work('pick-comedy','xing','tv','挑一段轻松的喜剧',[c('avoid-scary',true),c('watched',false)],[own('comforted')],'刘星挑了喜剧，靠在沙发上笑出了声。','我记得以前看惊险片会害怕，这次换一个轻松的选择。',8,205)
 ],carry:['avoid-scary'],end:['choose-next-film'],endAny:[['choose-next-film'],['pick-comedy']],followup:'残余害怕逐渐消退；下次避开同类影片的选择和得到照顾的记忆继续保留。'}
];
// Per-person inspection results are distinct facts, not a shared omniscient flag.
const chores=SITUATIONS.find(p=>p.id==='chores');for(const id of ['xing','xue','xiaoyu']){chores.facts['submitted-'+id]=0;chores.facts['approved-'+id]=false;chores.facts['rework-'+id]=false;}
for(const a of chores.actions)if(a.id.startsWith('inspect-'))a.repeatWork=a.id.slice(8);
SITUATIONS.find(p=>p.id==='reports').actions.find(a=>a.id==='discuss-incentive').invite=['xue','xiaoyu'];
SITUATIONS.find(p=>p.id==='fear').actions.find(a=>a.id==='watch-scary').device='tv';
for(const p of SITUATIONS)validateSituation(p);
