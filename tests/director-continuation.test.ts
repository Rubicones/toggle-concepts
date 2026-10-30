import {test} from 'node:test';
import assert from 'node:assert/strict';
import recorded from '../fixtures/director/static/continuation-cutoffs.json';
import inputJson from '../fixtures/director/static/input.json';
import complete from '../fixtures/director/static/director-response.json';
import {designDirection} from '../apps/local-runner/director/design';
import {directorAttemptAvailable,directorRequestOutputLimit,directorTask,DIRECTOR_OUTPUT_FEEDBACK} from '../packages/director/design-attempts';
import {textMessages} from '../packages/agents/text-provider';
import {estimateStaticDirection} from '../packages/director/money';
import type {WorkState} from '../packages/director/state';
import type {DirectionInput} from '../packages/director/types';
const input=inputJson as DirectionInput;
test('recorded continuation resumes at attempt three under the already-approved six attempts',async()=>{
 const state:WorkState={directorFeedback:[...recorded.feedback]},attempts:number[]=[];
 await designDirection({input,state,approvedRequests:recorded.allowance.requests,perStillMicroUsd:0,call:async attempt=>{attempts.push(attempt);return {text:JSON.stringify(complete)};},ready:async()=>{},save:async()=>{}});
 assert.deepEqual(attempts,[2]);assert.ok(state.design);assert.equal(state.directorFeedback?.length,2);
});
test('exhausted default attempts buy nothing, and approved continuation unlocks attempts without resetting identities',async()=>{
 const state:WorkState={directorFeedback:[...recorded.feedback]};let calls=0;
 await assert.rejects(()=>designDirection({input,state,approvedRequests:2,perStillMicroUsd:0,call:async()=>{calls++;return {text:JSON.stringify(complete)};},ready:async()=>{},save:async()=>{}}),/ALLOWANCE_EXHAUSTED/);assert.equal(calls,0);
 const attempts:number[]=[];await assert.rejects(()=>designDirection({input,state,approvedRequests:4,perStillMicroUsd:0,call:async attempt=>{attempts.push(attempt);throw new Error('OUTPUT_TOKEN_LIMIT');},ready:async()=>{},save:async()=>{}}),/ALLOWANCE_EXHAUSTED/);assert.deepEqual(attempts,[2,3]);assert.equal(state.directorFeedback?.length,4);assert.equal(directorAttemptAvailable(4,4),false);assert.equal(directorAttemptAvailable(4,6),true);
});
test('cut-off continuation may use a larger answer within model and agent limits; an initial run keeps its approved cap',()=>{
 const args={configured:6000,modelMaximum:32768,agentMaximum:16384,approvedRequests:6,feedback:recorded.feedback};assert.equal(directorRequestOutputLimit(args),12000);assert.equal(directorRequestOutputLimit({...args,approvedRequests:2}),6000);assert.equal(directorRequestOutputLimit({...args,feedback:[]}),6000);assert.equal(directorRequestOutputLimit({...args,modelMaximum:7000}),7000);assert.equal(directorRequestOutputLimit({...args,agentMaximum:9000}),9000);
});
test('repair feedback stays after the cached prefix, replaces the old essay advice, and never repeats partial source',()=>{
 const cfg={instructions:'Director',protocolInstructions:'Static design',cachePrompt:true,maxOutputTokens:6000,pricing:{inputPrice:2e-6,outputPrice:10e-6},campaignContext:{input:{approvedCopy:'Exact'}}};
 const first=textMessages('anthropic/fixture',directorTask('Design',[]),cfg),retry=textMessages('anthropic/fixture',directorTask('Design',recorded.feedback),cfg);assert.deepEqual(first.slice(0,-1),retry.slice(0,-1));assert.notDeepEqual(first.at(-1),retry.at(-1));assert.match(JSON.stringify(retry.at(-1)),/4,000–6,000/);assert.ok(!JSON.stringify(retry.at(-1)).includes('2,500 words'));
 const task=directorTask('Design',[JSON.stringify({error:'Invalid contract',savedOutput:'SOURCE'.repeat(10000)})]);assert.ok(!task.includes('SOURCESOURCE'));assert.ok(task.length<2000);assert.match(DIRECTOR_OUTPUT_FEEDBACK,/COMPLETE/);
});
test('new default output allowance can fund two full answers without shrinking the second one',()=>{
 const pricing={inputPrice:3e-6,outputPrice:15e-6},quote=estimateStaticDirection({director:pricing,assembler:pricing,critic:pricing},100000,4,'fixture');assert.equal(quote.roles.director.requests,2);assert.equal(quote.roles.director.outputTokens,24000);assert.ok(quote.maxCostMicroUsd<=2500000);
});
test('larger continuation answers remain inside the saved token pool and unspent monetary allowance',async()=>{
 const {directorTextConfig}=await import('../apps/local-runner/director/ledger');
 const pricing={inputPrice:2e-6,outputPrice:10e-6,cacheReadPrice:.2e-6,cacheWritePrice:2.5e-6};
 const rows=recorded.receipts.map(r=>({status:r.status,cost_micro_usd:r.costMicroUsd,reserve_micro_usd:200000,usage:r.usage,config_snapshot:{cachePrompt:true,pricing,maxOutputTokens:r.maxOutputTokens,directorInputTokens:40000}}));
 const client=(outputTokens:number)=>({from:(table:string)=>{const result={data:table==='studio_agent_steps'?rows:{estimates:{direction:{roles:{director:{...recorded.allowance,outputTokens}}}}},error:null};const query={select:()=>query,eq:()=>query,single:async()=>result,then:(done:(value:unknown)=>unknown)=>Promise.resolve(result).then(done)};return query;}}) as unknown as import('@supabase/supabase-js').SupabaseClient;
 const args={runId:'r',blockId:'b',directionId:'direction',role:'director' as const,snapshot:{instructions:'Complete static JSON',maxOutputTokens:12000,pricing,cachePrompt:true,campaignContext:{approved:'x'.repeat(26000)}},prompt:'Resume attempt three',visionCount:0};
 const granted=await directorTextConfig(client(30000),args);assert.equal(granted.snapshot.maxOutputTokens,12000);assert.equal(granted.remainingMicroUsd,598445);
 await assert.rejects(()=>directorTextConfig(client(16000),args),error=>error instanceof Error&&error.message==='ROLE_ALLOWANCE_EXHAUSTED'&&String((error as Error&{detail?:string}).detail).includes('No shortened request was sent'));
});
