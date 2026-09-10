// Generic native bridge contract; independent of a particular game's tuning.
export function validateObservation(event){
 for(const key of ['uid','kind','actor','source'])if(typeof event[key]!=='string'||!event[key])throw Error('观察缺少字段：'+key);
 if(!Number.isFinite(event.time)||!['self','seen','heard'].includes(event.source))throw Error('观察的时间或来源无效');
 return event;
}
