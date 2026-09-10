"""Spatial and performance tuning; no school IDs belong in engine/renderer logic."""
import json, math
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'dist/content'
p=json.loads((root/'school-tuning.json').read_text());scene=json.loads((root/'school-scene.json').read_text())
p['spatialRevision']=1
p['navigation']={'radius':.42,'separation':.95,'replanAfter':.75}
# Colliders include the actual furnishing, including its chairs/partition. Entry
# into an occupied area is permitted only through its reserved interaction slot.
layouts={
 'desk':([{'x':0,'z':0,'w':1.5,'d':.8},{'x':0,'z':.9,'w':.76,'d':.78}],1.65),
 'meal-table':([{'x':0,'z':0,'w':1.85,'d':.85},{'x':0,'z':.9,'w':.76,'d':.78},{'x':0,'z':-.9,'w':.76,'d':.78}],1.65),
 'drawing-kit':([{'x':0,'z':0,'w':1.85,'d':.85},{'x':0,'z':.9,'w':.76,'d':.78}],1.65),
 'computer':([{'x':0,'z':0,'w':1.85,'d':.85},{'x':0,'z':1,'w':.76,'d':.78}],1.75),
 'teacher-desk':([{'x':0,'z':0,'w':2.05,'d':.85},{'x':0,'z':1,'w':.76,'d':.78}],1.75),
 'toilet':([{'x':0,'z':.2,'w':2,'d':1.85}],1.65),
 'bed':([{'x':0,'z':0,'w':1.65,'d':2.4}],None),
 'bench':([{'x':0,'z':0,'w':2.05,'d':.7}],1.0),
 'guitar':([{'x':0,'z':.9,'w':.76,'d':.78}],1.65),
 'fountain':([{'x':0,'z':0,'w':.7,'d':.6}],.95),
}
for tid,(parts,approach) in layouts.items():
 t=p['types'][tid];t['colliders']=parts
 for slot in t.get('slots',[]):
  sign=-1 if slot['z']<0 else 1
  slot['facing']=0 if tid in ['toilet','bench'] or sign<0 else math.pi
  slot['approach']={'x':slot['x'],'z':approach*sign} if approach else {'x':1.3,'z':0}
  if tid in ['desk','meal-table','drawing-kit','computer','teacher-desk','guitar']:slot['approach']={'x':slot['x']+1.05,'z':slot['z']}
  if tid=='bed':slot.update(facing=0,render={'y':.78,'z':.8})
  if tid=='toilet':slot.update(render={'y':.05},private=True)
 if tid=='toilet':t['private']=True
# Add collision to every solid object and explicit facing/approach to every slot.
for tid,t in p['types'].items():
 if t.get('footprint') and 'colliders' not in t:t['colliders']=[{'x':0,'z':0,**t['footprint']}]
 for slot in t.get('slots',[]):
  if tid not in layouts and slot['pose']=='standing' and t.get('footprint') and slot['z']>0:slot['z']=max(slot['z'],t['footprint']['d']/2+.5);slot.pop('approach',None)
  slot.setdefault('facing',math.pi);slot.setdefault('approach',{'x':slot['x'],'z':slot['z']})
p['actions']['toilet']['attention']='block'
for aid in ['attend-class','teach-class']:p['actions'][aid]['repeatUntilPeriodEnd']=True
for aid,successor in [('prepare-class','attend-class'),('prepare-teach','teach-class')]:
 p['actions'][aid]['transition']={'action':successor,'when':p['actions'][successor]['when']}
# Two table rows need a usable aisle between their chair backs.
for o in scene['objects']:
 if o['type']=='meal-table':o['z']=-1 if o['id'] in ['lunch-table-0','lunch-table-1','lunch-table-2'] else 3.3
 if o['type']=='cafe-counter':o['z']=-4.8
 if o['type']=='toilet':o['name']='独立厕位 '+o['id'].split('-')[-1]
for a in scene['actors']:
 if a['id']=='f':a.update(x=-3,z=4.5)
 if a['id']=='l':a.update(x=2,z=2)

clips={
 'drink':'drink','eat':'eat','rest':'sleep','toilet':'toilet','study':'write','draw-poster':'draw',
 'wash-hands':'wash','read-board':'read-standing','read-book':'read-standing','use-computer':'type',
 'office-work':'write','teach':'teach','sit-bench':'sit','shoot-hoops':'basketball','run-lap':'run',
 'play-guitar':'guitar','water-plants':'water','open-locker':'open','close-locker':'open','get-lunch':'eat-standing',
 'attend-class':'listen','teach-class':'teach','make-up-work':'write','prepare-class':'sit','prepare-teach':'read-standing',
 'hand-over':'give','return-loan':'give','pick-up':'pickup','inspect':'inspect','start-conversation':'greet','start-group-conversation':'greet',
}
for aid,a in p['actions'].items():
 a['animation']={'clip':clips.get(aid,'talk' if a['executor']=='speech' else 'idle'),'speed':1}
# A running interaction travels a declared loop, rather than running in place.
p['actions']['run-lap']['motion']={'loop':[{'x':0,'z':0},{'x':0,'z':-3.5},{'x':1,'z':-3.5},{'x':1,'z':3.5},{'x':0,'z':3.5},{'x':0,'z':0}],'speed':4}
# Semantic geography is shared by the overview and doorway placement.
layout={'courtyard':(0,0),'classroom':(0,-16),'office':(-20,-16),'infirmary':(-40,-16),'library':(20,-16),'bathroom':(-20,0),'club':(20,0),'canteen':(-20,16),'playground':(10,16)}
for rid,r in scene['rooms'].items():
 x,z=layout[rid];r['map']={'x':x,'z':z,'width':16,'depth':12};r['obstacles']=[]
 for target in r['links']:
  tx,tz=layout[target];dx,dz=tx-x,tz-z
  scale=min(7.35/abs(dx) if dx else 999,5.35/abs(dz) if dz else 999)
  r['portals'][target]={'x':round(dx*scale,2),'z':round(dz*scale,2)}
for rid,r in scene['rooms'].items():
 candidates=[(-7,-4.5),(7,-4.5),(-7,3.5),(7,3.5)] if r['outdoor'] else [(7,-4.7),(-6.8,4.7)]
 r['decorations']=[{'x':x,'z':z,'size':1} for x,z in candidates if all(math.hypot(x-v['x'],z-v['z'])>2 for v in r['portals'].values()) and all(math.hypot(x-o['x'],z-o['z'])>1.5 for o in scene['objects'] if o['room']==rid and not o.get('holder'))]
 r['obstacles']=[{'x':d['x'],'z':d['z'],'w':.65,'d':.65} for d in r['decorations']]
# Character/door and furnishing clearances are represented by the same data.
for name,data in [('school-tuning.json',p),('school-scene.json',scene)]:
 (root/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

# Compose the separately maintained expansion pack.
import runpy
runpy.run_path(str(Path(__file__).with_name("expand-school-campus.py")))
