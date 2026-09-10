export class GameBridge {
 constructor(){this.worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});this.serial=0;this.pending=new Map();this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);data.ok?p.resolve(data.result):p.reject(Error(data.error));};this.worker.onerror=e=>{for(const p of this.pending.values())p.reject(Error(e.message||'模拟线程遇到问题'));this.pending.clear();};}
 request(type,params={}){return new Promise((resolve,reject)=>{const id=++this.serial;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,type,...params});});}
 destroy(){this.worker.terminate();for(const p of this.pending.values())p.reject(Error('模拟已关闭'));this.pending.clear();}
}
