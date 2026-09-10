// Input arbitration is independent of the decision kernel and domain tuning.
export function controlState(world,owner){
 world.state.controls??={};
 return world.state.controls[owner]??={enabled:!world.state.actors[owner].controlled||!!world.tuning.pack.control?.playerAutonomy,queued:0,holdUntil:0,deferred:{},manualSession:null};
}
export function canDecide(world,owner){
 const c=controlState(world,owner),s=world.state;
 if(!c.enabled||c.queued||c.holdUntil>s.time)return false;
 if(c.manualSession&&s.actors[owner].session===c.manualSession)return false;
 return s.tasks[owner]?.decision?.rule!=='player';
}
export function allowsAutomatic(world,owner,spec){
 const c=controlState(world,owner);
 return !spec.autonomyGroup||(c.deferred[spec.autonomyGroup]||0)<=world.state.time;
}
export function defer(tx,c,e){
 const owner=c.actor.id,config=controlState(tx.world,owner);
 tx.state.controls??={};tx.state.controls[owner]??=structuredClone(config);
 const period=tx.world.tuning.pack.clock.periods.find(p=>tx.state.time%1440>=p.start&&tx.state.time%1440<p.end);
 if(!period||typeof e.group!=='string')throw Error('No current schedule to defer');
 tx.state.controls[owner].deferred[e.group]=tx.state.time+period.end-tx.state.time%1440;
 tx.emit('autonomy-deferred',owner,[owner],{text:e.text||'暂时自行安排，仍需要承担未履行安排的后果。'});
}
