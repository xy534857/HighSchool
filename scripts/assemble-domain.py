from pathlib import Path
import json
p=Path(__file__).resolve().parents[1]
d=json.loads((p/"dist/domain/family.json").read_text())
assert d["version"]==2
for name,a in d["actions"].items():
 assert a["duration"]>0 and a["label"]
(p/"dist/domain.js").write_text("/* Generated from domain/family.json. */\nexport const DOMAIN = "+json.dumps(d,ensure_ascii=False,indent=2)+";\nexport const ACTIONS = DOMAIN.actions;\n")
