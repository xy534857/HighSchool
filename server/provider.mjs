// An OpenAI-compatible JSON completion endpoint. Credentials never enter the browser or save.
export async function complete(request,{signal,env=process.env,fetchImpl=fetch}={}){
 if(!env.LLM_API_KEY||!env.LLM_MODEL||!env.LLM_BASE_URL)throw Error('Set LLM_API_KEY, LLM_MODEL and LLM_BASE_URL');
 const system=`You are one high-school character's reflective cognition, not a director and not a helpful assistant.
Use only the character's own observed evidence. Return one JSON object matching context.contract.reply.
Preserve ongoing goals, actual outcomes and the right of others to refuse. Do not dictate a scene or other people's thoughts.
Social plans may involve several people, private conversations, asking for support, boundaries, cooperation and changed priorities.
Use registered actions only. Selectors are exact candidate fields. Conditions use scope self/candidate/memory and eq/ne/lt/lte/gt/gte.
Expression references use $actor, $clock, $knownByKey or $relationships; expressions are declarative JSON, never JavaScript.
Goal steps have fixed roles and args; use alternatives to seek a contact, and skipWhen only for conditions already achieved.
Speech actions need a conversation and the speaking floor. start-conversation must precede speech and requires the target's consent to join.
Use successWhen or a wait step for the OTHER person's response; merely making an offer does not achieve consent.
Keep autonomy: compare your motives, commitments, relationships and recent outcomes. Do not make every character conciliatory.
Provide a short first-person summary. Personality changes are optional, incremental and supported by cited event IDs.
Never fabricate evidence. Empty rules/goals/cognition with an honest summary is valid. Priorities should usually be 50-100 so class, urgent needs and conversation responses remain possible.
Prefer replacing/retiring your old generated rules to accumulating rules. Return at most 6 new rules and 2 goals. Do not include a source field.`;
 const base=env.LLM_BASE_URL.replace(/\/$/,'');
 const response=await fetchImpl(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.LLM_API_KEY},signal,body:JSON.stringify({model:env.LLM_MODEL,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(request)}],max_tokens:Number(env.LLM_MAX_OUTPUT_TOKENS||2800),...(env.LLM_JSON_MODE==='false'?{}:{response_format:{type:'json_object'}})})});
 if(!response.ok)throw Error('LLM HTTP '+response.status);
 const data=await response.json(),text=data.choices?.[0]?.message?.content;
 if(typeof text!=='string'||text.length>60000)throw Error('Invalid LLM output');
 const clean=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
 return {reply:JSON.parse(clean),usage:data.usage||null};
}
