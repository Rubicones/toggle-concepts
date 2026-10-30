import {test} from 'node:test';
import assert from 'node:assert/strict';
import recorded from '../fixtures/director/static/coder-recovery.json';
import {assemblerContext} from '../packages/director/transcript';
import {compactDraftRequest,DRAFT_INPUT_CAP} from '../packages/director/request-size';
import {staticCoderInstructions,staticToolsSchema} from '../packages/agents/prompts/static-coder';
import {staticRoleInstructions} from '../packages/director/roles';
import {providerJsonSchema} from '../packages/director/provider-schema';
import mandatory from '../fixtures/director/static/mandatory-reasoning.json';
import {staticCoderReasoning} from '../packages/director/coder-reasoning';
import {submitText} from '../packages/agents/text-provider';
import {assembleStatic} from '../apps/local-runner/director/static-assembler';
import {directorTextConfig} from '../apps/local-runner/director/ledger';
import type {Design} from '../packages/director/contract';
import type {CatalogEntry,DirectionInput} from '../packages/director/types';
import type {LoopState} from '../packages/director/state';
import type {SupabaseClient} from '@supabase/supabase-js';
const input=recorded.input as DirectionInput;
const pricing={inputPrice:2e-6,outputPrice:10e-6};
function coderConfig(){return {instructions:staticRoleInstructions.assembler,protocolInstructions:staticCoderInstructions+' Fallback: return JSON calls using write, read, typecheck, bundle, checks, renderStill(variantId,sceneId,moment), listResources, finish.',maxOutputTokens:8000,pricing,responseSchema:{...staticToolsSchema,schema:providerJsonSchema(staticToolsSchema.schema) as Record<string,unknown>},campaignContext:{checkpointId:'recorded-checkpoint',...assemblerContext(input,recorded.design as Design,[...input.assets,...recorded.catalog as CatalogEntry[]],[])}};}
test('recorded fallback fits the unchanged request cap with every design decision and approved fact intact',()=>{
 assert.ok(recorded.fallbackCompaction.after>recorded.fallbackCompaction.cap);
 const cfg=coderConfig(),result=compactDraftRequest(JSON.stringify({toolResults:recorded.transcript}),cfg,[]);
 assert.ok(result.compaction.after<=DRAFT_INPUT_CAP,JSON.stringify(result.compaction));
 const context=result.snapshot.campaignContext as typeof cfg.campaignContext;
 assert.equal(context.designDocument,recorded.design.designDocument);
 assert.deepEqual(context.keyFrames,recorded.design.keyFrames);
 assert.deepEqual(context.brand.tokens,input.brand.tokens);
 assert.deepEqual(context.brand.facts,input.brand.facts);
 assert.ok(!('motionNotes' in context.storyboard[0]));
 const repeated=[...recorded.transcript,...Array.from({length:20},()=>({from:'tool' as const,text:JSON.stringify({error:'OUTPUT_TOKEN_LIMIT',detail:'Write complete Frame.tsx first. '.repeat(80)})}))];
 const later=compactDraftRequest(JSON.stringify({toolResults:repeated}),cfg,[]);
 assert.ok(later.compaction.after<=DRAFT_INPUT_CAP);assert.match(later.prompt,/Write complete Frame/);
});
test('recorded reasoning-only length finish is a settled cutoff, not an empty-answer retry',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async(_,init)=>{calls++;const sent=JSON.parse(String(init?.body));assert.deepEqual(sent.reasoning,{effort:'low'});assert.equal(sent.max_tokens,8000);
  return new Response('data: '+JSON.stringify({id:'recorded-cutoff',choices:[{delta:{},finish_reason:'length'}],usage:recorded.receipts[0].usage})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});};
  const receipt=await submitText('anthropic/recorded-sonnet','Write Frame.tsx',{instructions:'Static source',maxOutputTokens:8000,pricing,stream:true,...staticCoderReasoning(mandatory.model)});
  assert.equal(receipt.failure,'OUTPUT_TOKEN_LIMIT');assert.equal(receipt.outcome,'failed');assert.equal(receipt.cost,recorded.receipts[0].costMicroUsd);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('draft-first cutoff preserves actionable feedback instead of reporting missing files',async()=>{
 const state:LoopState={turn:0,startedAt:0,complete:false,transcript:[]};let calls=0;
 await assembleStatic({state,maxTurns:9,timeMs:100,now:()=>1,call:async loop=>{if(calls++===0)throw new Error('OUTPUT_TOKEN_LIMIT');assert.match(loop.transcript[0].text,/OUTPUT_TOKEN_LIMIT/);assert.ok(!loop.transcript[0].text.includes('expected array'));return JSON.stringify({files:[{path:'Frame.tsx',source:'export default function Frame(){return null;}'}]});},tool:async a=>a.tool==='finish'?{complete:true}:{passed:true},save:async()=>{}});
 assert.equal(calls,2);assert.equal(state.complete,true);
});
test('recorded spent output allowance stops before another submission and is not reset by the fix',async()=>{
 const rows=recorded.receipts.map(r=>({status:'failed',cost_micro_usd:r.costMicroUsd,usage:r.usage,config_snapshot:{maxOutputTokens:8000}}));
 const admin={from(table:string){const query={select(){return query;},eq(){return query;},single(){return Promise.resolve({data:{estimates:{direction:{roles:{assembler:recorded.allowance}}}},error:null});},then(resolve:(value:unknown)=>unknown){return Promise.resolve({data:table==='studio_agent_steps'?rows:null,error:null}).then(resolve);}};return query;}} as unknown as SupabaseClient;
 await assert.rejects(()=>directorTextConfig(admin,{runId:'run',blockId:'block',directionId:'direction',role:'assembler',snapshot:coderConfig(),prompt:'Write Frame.tsx',visionCount:0}),error=>error instanceof Error&&error.message==='ROLE_ALLOWANCE_EXHAUSTED'&&String((error as Error&{detail?:string}).detail).includes('output 48,000 of 48,000'));
});
