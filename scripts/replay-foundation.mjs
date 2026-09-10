import fs from 'node:fs';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const input=[{op:'reply',file:'runtime-reply-1.json'},{op:'advance',minutes:4},{op:'ask'},{op:'reply',file:'runtime-reply-2.json'},{op:'advance',minutes:3},{op:'return'},{op:'finish'}].map(c=>JSON.stringify(c)).join('\n')+'\n';
// These are recorded ChatGPT replies, not new model generations.
const output=execFileSync(process.execPath,['scripts/foundation-lab.mjs'],{cwd:root,input,encoding:'utf8',maxBuffer:4*1024*1024});
assert.doesNotMatch(output,/SoarDB|Unexpected sqlite|"error":/);
const lines=output.trim().split('\n').map(s=>JSON.parse(s));assert.equal(lines.at(-1).finished,true);
const trace=JSON.parse(fs.readFileSync(new URL('research/foundation/runtime-trace.json',root)));
assert.equal(trace.policyHistory.length,2);assert.equal(trace.state.holder,'m');assert.equal(trace.goals[0].status,'completed');assert.equal(Object.values(trace.state.appointments)[0].status,'fulfilled');
const answer=trace.events.find(e=>e.kind==='information');assert.equal(answer.claim.value,'accepted');assert.ok(answer.replyTo);assert.match(answer.text,/已经答应/);
const result={passed:true,externalAPICalls:0,recordedAuthorInterventions:2,goal:trace.goals[0].status,commitment:'fulfilled',timeline:trace.events.filter(e=>['proposal','cooperate','object-transferred','question','information','commitment-fulfilled'].includes(e.kind)).map(({time,kind,actor,text,claim,replyTo})=>({time,kind,actor,text,claim,replyTo}))};
fs.writeFileSync(new URL('research/foundation/replay-verification.json',root),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
