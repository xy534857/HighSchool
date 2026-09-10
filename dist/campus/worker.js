import {SchoolService} from './service.js';
let game=null;
let chain=Promise.resolve();
self.onmessage=({data})=>{chain=chain.then(async()=>{
 try{
  let result;
  switch(data.type){
   case 'init':game?.destroy();game=await SchoolService.create({saved:data.saved});result=game.snapshot();break;
   case 'tick':result=game.advance(Math.min(8,Math.max(0,data.minutes)));break;
   case 'command':result=game.enqueue(data.action,data.roles,data.args);break;
   case 'menu':result=game.menu(data.selection);break;
   case 'autonomy':result=game.setAutonomy(data.enabled);break;
   case 'cancel':result=game.cancel(data.commandId);break;
   case 'snapshot':result=game.snapshot();break;
   case 'save':result=game.save();break;
   case 'inference-export':{result=[];let r;while(result.length<8&&(r=game.claimInference()))result.push(r);break;}
   case 'inference-claim':result=game.claimInference();break;
   case 'inference-failed':game.world.inbox.failRequest(data.requestId,data.error);result={ok:true};break;
   case 'context':result=game.world.inbox.request(data.owner,'developer-inspection');break;
   case 'apply-policy':result=await game.world.inbox.apply(data.reply);game.planCache?.clear();break;
   default:throw Error('Unknown game request');
  }
  self.postMessage({id:data.id,type:data.type,ok:true,result});
 }catch(error){self.postMessage({id:data.id,type:data.type,ok:false,error:error.message});}
});};
