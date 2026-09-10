// Add the opportunity pack to old saves without resetting people or situations.
export function upgradeClassroomSave(saved,content){
 if(!saved||(saved.content.classroomRevision||0)>=(content.classroomRevision||0))return false;
 const c=saved.content;
 for(const id of content.classroomActions)c.actions[id]=structuredClone(content.actions[id]);
 c.projects??={};c.projects['classroom-followup']=structuredClone(content.projects['classroom-followup']);
 c.situations=c.situations.filter(s=>s.id!=='classroom-discussion').concat(structuredClone(content.situations.filter(s=>s.id==='classroom-discussion')));
 c.appraisals=(c.appraisals||[]).filter(a=>!a.id.startsWith('classroom-')).concat(structuredClone(content.appraisals.filter(a=>a.id.startsWith('classroom-'))));
 c.classroomRevision=content.classroomRevision;c.classroomActions=structuredClone(content.classroomActions);
 saved.contentRevision++;return true;
}
