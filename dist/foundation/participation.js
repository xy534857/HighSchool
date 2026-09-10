// Short contributions can share an ongoing activity without releasing its seat,
// resetting its progress or pretending that a second physical task has started.
export function allowsDuringTask(spec,task){
 return !!task&&task.phase==='perform'&&task.attention!=='block'&&spec.executor==='instant'&&spec.during?.includes(task.candidate.action);
}
