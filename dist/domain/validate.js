const paths=new Set(['self.hunger','self.energy','self.fun','self.social','home.food','home.ingredients','home.snacks','home.clean','home.money']);
export function validateAction(name,spec){
 if(!/^[A-Za-z][A-Za-z0-9-]*$/.test(name)||!spec.label||!Number.isFinite(spec.duration)||spec.duration<=0||spec.duration>180)throw Error('非法行动定义');
 if(!spec.social&&(!Array.isArray(spec.resource)||!spec.resource.length))throw Error('行动必须声明资源');
 for(const key of ['rate','progress'])if(spec[key]!==undefined&&(!Number.isFinite(spec[key])||spec[key]<=0))throw Error('行动进度必须为正数');
 if(spec.conversation!==undefined&&!['parallel','pause','finish','unavailable'].includes(spec.conversation))throw Error('未知的交谈兼容方式');
 for(const phase of ['requires','start','finish'])for(const [key,value] of Object.entries(spec[phase]||{}))if(!paths.has(key)||!Number.isFinite(value))throw Error('未知或无效的效果：'+key);
 return spec;
}
export function validateDomain(domain){if(domain.version!==2)throw Error('语义版本不匹配');for(const [name,spec] of Object.entries(domain.actions))validateAction(name,spec);const c=domain.conversation;if(c){for(const [key,min,max] of [['inviteMinutes',1,90],['joinMinutes',1,60],['turnMinutes',.25,5],['responseMinutes',1,60],['maxMinutes',2,90],['maxTurns',3,60],['maxParticipants',2,12],['range',1,6],['cooldownMinutes',1,120]])if(!Number.isFinite(c[key])||c[key]<min||c[key]>max)throw Error('对话参数超出可执行范围：'+key);}return domain;}
export function registerAction(domain,name,spec){if(domain.actions[name])throw Error('行动已存在');domain.actions[name]=validateAction(name,structuredClone(spec));}
export function validateObservation(event){for(const key of ['uid','kind','actor','source'])if(typeof event[key]!=='string'||!event[key])throw Error('观察缺少字段：'+key);if(!Number.isFinite(event.time)||!['self','seen','heard'].includes(event.source))throw Error('观察的时间或来源无效');return event;}
