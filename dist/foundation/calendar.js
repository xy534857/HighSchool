
export function tickAppointments(world){
  if(!Object.values(world.state.appointments).some(a=>a.status==='pending'&&a.due<world.state.time))return;
  world.transaction(tx=>{for(const a of Object.values(tx.state.appointments))if(a.status==='pending'&&a.due<tx.state.time){a.status='missed';tx.emit('brokenPromise',a.participants[0],a.participants,{appointment:a.id,claim:{subject:a.id,predicate:'status',value:'missed'}});}});
 }
