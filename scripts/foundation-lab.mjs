// Interactive developer harness: the author may act as the model while Soar stays alive.
// No API provider, credentials, or automatic completion calls.
import fs from 'node:fs';import readline from 'node:readline';
import {createFoundation} from '../dist/foundation/index.js';
const read=p=>fs.readFileSync(new URL('../dist/foundation/'+p,import.meta.url),'utf8');
const output=new URL('../research/foundation/',import.meta.url);
const w=await createFoundation({read,wasmBinary:fs.readFileSync(new URL('../dist/soar/soar.wasm',import.meta.url)),content:JSON.parse(fs.readFileSync(new URL('../dist/content/campus-tuning.json',import.meta.url))),scenario:JSON.parse(fs.readFileSync(new URL('../dist/content/campus-scene.json',import.meta.url)))});
const summary=()=>({time:w.state.time,holder:w.state.objects.notes.holder,sessions:Object.values(w.state.sessions).map(s=>({id:s.id,members:s.members,floor:s.floor,status:s.status})),pending:[...w.inbox.pending.values()].map(r=>({id:r.id,owner:r.owner,reason:r.reason})),appointments:w.state.appointments,lastEvents:w.state.events.slice(-8)});
function player(action,options){const r=w.control('t',action,options);if(!r.ok)throw Error(JSON.stringify(r));return r;}
function floorFor(id){for(let n=0;n<20;n++){if(w.view(id).actor.hasFloor)return;w.advance(.5);}throw Error('No speaking floor for '+id);}
player('start-conversation',{roles:{target:'m'}});w.advance(2);floorFor('t');
player('ask-loan',{roles:{target:'m',item:'notes'},args:{due:550}});w.advance(2);
fs.writeFileSync(new URL('runtime-request-1.json',output),JSON.stringify([...w.inbox.pending.values()][0],null,2)+'\n');
console.log(JSON.stringify({ready:true,...summary()}));
const rl=readline.createInterface({input:process.stdin,terminal:false});
for await(const line of rl){
 try{
  const command=JSON.parse(line);
  if(command.op==='reply'){
   if(!/^runtime-reply-[12]\.json$/.test(command.file))throw Error('Unknown reply filename');
   const reply=JSON.parse(fs.readFileSync(new URL(command.file,output)));await w.inbox.apply(reply);
   console.log(JSON.stringify({installed:true,owner:'m',revision:w.brain.rev.m}));
  }else if(command.op==='advance')w.advance(command.minutes);
  else if(command.op==='ask'){
   floorFor('t');const offer=Object.values(w.state.offers)[0];player('ask-question',{roles:{target:'m'},args:{key:offer.id+':status',text:'那我们刚才说好的借阅，还作数吗？'}});w.advance(2);
   fs.writeFileSync(new URL('runtime-request-2.json',output),JSON.stringify([...w.inbox.pending.values()][0],null,2)+'\n');
  }else if(command.op==='return'){
   const offer=Object.values(w.state.offers)[0];player('return-loan',{roles:{offer:offer.id,target:'m',item:'notes'}});w.advance(2);
  }else if(command.op==='finish'){
   fs.writeFileSync(new URL('runtime-trace.json',output),JSON.stringify({scope:'ChatGPT authored policy replies at two actual runtime pauses; all choices and effects subsequently executed by native Soar and the foundation.',externalAPICalls:0,state:summary(),events:w.state.events,policyHistory:w.policyHistory,goals:w.mind.goals('m'),personalKnowledge:Object.fromEntries(Object.keys(w.state.actors).map(id=>[id,w.mind.all(id)]))},null,2)+'\n');
   console.log(JSON.stringify({finished:true,...summary()}));break;
  }else if(command.op!=='status')throw Error('Unknown operation');
  console.log(JSON.stringify(summary()));
 }catch(e){console.log(JSON.stringify({error:e.message}));}
}
w.destroy();rl.close();
