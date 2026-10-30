import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compactDraftRequest,DRAFT_INPUT_CAP} from '../packages/director/request-size';
import {textRequestQuote} from '../packages/agents/text-quote';
import {textMessages,type TextSnapshot} from '../packages/agents/text-provider';
import {accountedTokens,estimateStaticDirection,paidText,type TextLedger} from '../packages/director/money';
const pricing={inputPrice:3e-6,outputPrice:15e-6,cacheReadPrice:.3e-6,cacheWritePrice:3.75e-6};
const snapshot:TextSnapshot={instructions:'Write static source.',protocolInstructions:'Frame.tsx first.',campaignContext:{brandGuide:'Stable generated module API.'},maxOutputTokens:8000,pricing,cachePrompt:true};
test('static Sonnet-class fixture quote is within the target, with bounded attempts and coder requests',()=>{
 const quote=estimateStaticDirection({director:pricing,assembler:pricing,critic:pricing},100000,4,'fixture');assert.ok(quote.maxCostMicroUsd>=1500000&&quote.maxCostMicroUsd<=2500000);assert.equal(quote.roles.director.requests,2);assert.equal(quote.roles.assembler.requests,9);assert.equal(quote.roles.critic.requests,2);assert.equal(quote.roles.assembler.inputTokens,180000);
});
test('cache breakpoints include stable context but exclude changing tool results',()=>{
 const one=textMessages('anthropic/fixture-sonnet','turn one',snapshot),two=textMessages('anthropic/fixture-sonnet','turn two',snapshot);assert.deepEqual(one.slice(0,-1),two.slice(0,-1));assert.notDeepEqual(one.at(-1),two.at(-1));assert.match(JSON.stringify(one),/cache_control/);assert.ok(!JSON.stringify(textMessages('other/model','one',snapshot)).includes('cache_control'));
});
test('settled cache hits and writes count billed equivalents; open requests keep conservative reservations',()=>{
 const row={status:'succeeded',cost_micro_usd:100,usage:{prompt_tokens:10000,completion_tokens:200,prompt_tokens_details:{cached_tokens:8000,cache_write_tokens:0}},config_snapshot:{directorInputTokens:40960,maxOutputTokens:8000,cachePrompt:true,pricing}};
 assert.deepEqual(accountedTokens(row),{input:2800,output:200});assert.equal(accountedTokens({...row,usage:{...row.usage,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:8000}}}).input,12000);assert.equal(accountedTokens({...row,status:'unknown'}).input,40960);assert.equal(accountedTokens({...row,status:'failed',cost_micro_usd:0}).input,0);
});
test('a 207 KB generated-file read and nine source replies compact deterministically under the hard request cap',()=>{
 const transcript=Array.from({length:9},()=>[{from:'agent',text:JSON.stringify({files:[{path:'Frame.tsx',source:'x'.repeat(60000)}]})},{from:'tool',text:'generated brand data '.repeat(11000)}]).flat(),prompt=JSON.stringify({toolResults:transcript});const first=compactDraftRequest(prompt,snapshot,[]),second=compactDraftRequest(prompt,snapshot,[]);assert.deepEqual(first,second);assert.ok(first.compaction.before>1000000);assert.ok(first.compaction.after<=DRAFT_INPUT_CAP);assert.ok(first.compaction.actions.length);assert.ok(first.prompt.length<16000);
});
test('required material over the cap fails before any reservation or provider submission',async()=>{
 let calls=0;const ledger:TextLedger={find:async()=>null,reserve:async()=>{calls++;throw new Error('must not reserve');},claim:async()=>false,anchor:async()=>{},settle:async()=>{}};
 const big={...snapshot,campaignContext:{approvedCopy:'x'.repeat(100000)},requestInputCap:DRAFT_INPUT_CAP};assert.throws(()=>compactDraftRequest('Write',big,[]),/SIZE_CAP/);await assert.rejects(()=>paidText({identity:'fixture',role:'assembler',model:'fixture',prompt:'Write',snapshot:big,allowanceMicroUsd:1e6,ledger}),/SIZE_CAP/);assert.equal(calls,0);
 assert.ok(textRequestQuote('Write',snapshot).reservationMicroUsd>textRequestQuote('Write',{...snapshot,cachePrompt:false,pricing:{inputPrice:pricing.inputPrice,outputPrice:pricing.outputPrice}}).reservationMicroUsd);
});
test('M08 motion tooling remains, and new draft approval is explicitly static',async()=>{
 const motion=await readFile('remotion/director/useGsapTimeline.ts','utf8'),start=await readFile('lib/server/director-start.ts','utf8'),worker=await readFile('apps/local-runner/director/worker.ts','utf8');assert.match(motion,/useGsapTimeline/);assert.match(start,/stage:'draft'/);assert.match(worker,/LEGACY_DRAFT_READ_ONLY/);assert.match(worker,/staticTools/);
});
