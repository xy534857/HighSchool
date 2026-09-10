// Presentation changes no semantic effects. Content chooses words, not the renderer.
export function renderFact(tuning,fact){
 const p=tuning.pack.presentation||{},words=p.words||{};
 const values={subject:words[fact.subject]||fact.subject,predicate:words[fact.predicate]||fact.predicate,value:words[String(fact.value)]||String(fact.value)};
 return (p.factTemplate||'{subject}: {predicate} = {value}').replace(/\{(subject|predicate|value)\}/g,(_m,key)=>values[key]);
}
