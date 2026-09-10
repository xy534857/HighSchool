from pathlib import Path
import json,re,sys
root=Path(__file__).resolve().parents[1]
log=Path(sys.argv[1]).read_text()
results={name:status=='ok' for status,name in re.findall(r'^(ok|not ok) \d+ - (.+)$',log,re.M)}
for filename in sys.argv[2:]:
    rerun=Path(filename).read_text()
    assert re.search(r'^# fail 0$',rerun,re.M), 'focused rerun must pass'
    for status,name in re.findall(r'^(ok|not ok) \d+ - (.+)$',rerun,re.M):
        assert name in results, 'rerun must correspond to the full gate'
        results[name]=status=='ok'
assert results and all(results.values()), 'acceptance must pass before writing a success report'
count=len(results)
data=json.loads((root/'research/situation-verification.json').read_text())
life=json.loads((root/'research/life-verification.json').read_text())
run=next(r for r in life['results'] if r['name']=='seven-days')
labels={'detective':'小雨急着筹钱','reports':'小雨的消息有了价钱','chores':'家务卡到底怎么算','fear':'刘星说自己一点也不怕','assistant-rule-variant':'同一开局，要求得到许可后才挪用物品','resume':'读档后继续生活','actual-day-to-new-package':'实际日结 → 新情景包 → 原生 Soar 执行'}
names={'dad':'夏东海','me':'刘梅','xue':'夏雪','xing':'刘星','xiaoyu':'夏雨'}
lines=['# 自主生活观察记录','',f'最终回归：{count} 项通过。使用与网页相同的 Household 与 Soar 9.6.5 WASM；五个人自主运行，没有逐句推进剧情。另有连续七个游戏日的生活检查。','',f'七日最低身体需求：{run["minimumNeed"]:.1f}/100；正常饭点用餐率：{run["mealAttendance"]:.1%}。','', '本轮由 ChatGPT 编写情景和人物规则，并根据真实行为记录修订。日终生成验证使用实际事件作为输入、ChatGPT 编写的结构化响应与异步 provider；未连接运行时模型 API，也未进行浏览器画面验收。','', '观察后修复了：修好后又拒修、返工未重新申请就验收、已完成家务重复劳动、更新的申请编号被当成矛盾传闻，以及会话候选携带私人认知。画册搬运包含拿起、行走、放下；途中存档后可继续。','']
for result in data['results']:
    label=result['label']
    lines += ['## '+labels.get(label,label),'','| 游戏时间 | 人物 | 实际行为／台词 | 决策依据 |','| --- | --- | --- | --- |']
    for e in result.get('events',[]):
        t=e['time'];day=int(t//1440)+1;minute=t%1440
        clock=f'第 {day} 天 {int(minute//60):02d}:{int(minute%60):02d}'
        clean=lambda x:str(x).replace('|','／').replace('\n',' ')
        lines.append(f'| {clock} | {names[e["actor"]]} | {clean(e["text"])} | {clean(e.get("reason",e.get("rule","")))} |')
    if result.get('debts'):
        lines += ['', '借款记录：'+'；'.join(f'{names[d["debtor"]]}向{names[d["creditor"]]}借 {d["amount"]} 元，'+('已归还' if d['paid'] else '仍待归还') for d in result['debts'])+'。']
    lines += ['']
lines += ['## 解释范围','', '这些结果说明规则、信息送达、个人记忆、身体作息和实际行动能共同产生不同场面。它们不证明无限新情景的模型质量，也不等于完整人类认知。台词仍来自可修改的情景规则包；新增物理或社会概念必须有对应的可执行能力。','']
(root/'research/situation-observation.md').write_text('\n'.join(lines))
(root/'research/acceptance.json').write_text(json.dumps({'kernel':'Soar 9.6.5 native WASM','tests':{'passed':count,'failed':0},'simulationMinutes':run['simulationMinutes'],'autonomousDays':7,'mealAttendance':run['mealAttendance'],'minimumNeed':run['minimumNeed'],'decisionMs':run['decisionMs'],'scenarios':[{k:r[k] for k in ['label','events'] if k in r} for r in data['results']],'externalAPICalls':0,'browserVisualQA':False,'scope':'Functional autonomous runs, causal rule comparison, physical/financial effects, isolated cognition, durable state and asynchronous daily situation installation.'},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':count,'days':7,'mealAttendance':run['mealAttendance'],'minimumNeed':run['minimumNeed'],'cases':len(data['results'])}))
