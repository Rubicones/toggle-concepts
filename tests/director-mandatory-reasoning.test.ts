import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import recorded from '../fixtures/director/static/mandatory-reasoning.json';
import {modelCatalog} from '../packages/agents/catalog';
import {staticCoderReasoning} from '../packages/director/coder-reasoning';
import type {TextSnapshot} from '../packages/agents/text-provider';
import {accountedTokens,paidText,retryableProviderFailure,type TextLedger,type SavedRequest} from '../packages/director/money';
test('recorded catalog retains mandatory reasoning and explicit effort capabilities',async()=>{
 const original=globalThis.fetch;try{
  globalThis.fetch=async()=>Response.json({data:[recorded.model]});
  const [model]=await modelCatalog();assert.deepEqual(model.reasoning,recorded.model.reasoning);
  assert.deepEqual(staticCoderReasoning(model),{reasoningEffort:'low'});
 }finally{globalThis.fetch=original;}
});
test('coder chooses advertised effort only, without inferring disable support from a generic parameter',()=>{
 assert.deepEqual(staticCoderReasoning(undefined),{});
 assert.deepEqual(staticCoderReasoning({}),{});
 assert.deepEqual(staticCoderReasoning({reasoning:{mandatory:true}}),{});
 assert.deepEqual(staticCoderReasoning({reasoning:{mandatory:true,supported_efforts:['high','medium']}}),{reasoningEffort:'medium'});
 assert.deepEqual(staticCoderReasoning({reasoning:{supported_efforts:null}}),{reasoningEffort:'low'});
 assert.deepEqual(staticCoderReasoning({reasoning:{supported_efforts:['none']}}),{});
});
test('saved mandatory-reasoning rejection is uncharged, skipped once and replaced by an idempotent supported request',async()=>{
 const original=globalThis.fetch,source=await readFile('fixtures/director/static/Frame.tsx','utf8'),rows=new Map<string,SavedRequest>();let submissions=0;
 const base:TextSnapshot={instructions:'Write Frame.tsx first.',maxOutputTokens:8000,pricing:{inputPrice:2e-6,outputPrice:10e-6}};
 const ledger:TextLedger={find:async id=>rows.get(id)??null,reserve:async id=>{const row={id,status:'reserved',cost:null,output:null};rows.set(id,row);return row;},claim:async()=>true,anchor:async()=>{},settle:async(id,r)=>{rows.set(id,{id,status:r.outcome,cost:r.cost,output:r.text,error:r.failure});}};
 try{globalThis.fetch=async(_,init)=>{submissions++;const sent=JSON.parse(String(init?.body));
  if(sent.reasoning?.enabled===false)return Response.json(recorded.rejection,{status:400});
  assert.deepEqual(sent.reasoning,{effort:'low'});assert.equal(sent.max_tokens,8000);assert.equal(sent.provider.allow_fallbacks,false);
  return Response.json({id:'recorded-file-replay',choices:[{finish_reason:'stop',message:{content:JSON.stringify({files:[{path:'Frame.tsx',source}]})}}],usage:{cost:0}});
 };
 const args={identity:{turn:3},role:'assembler' as const,model:recorded.model.id,prompt:'Write the static source.',snapshot:{...base,disableReasoning:true},allowanceMicroUsd:200000,ledger};
 await assert.rejects(()=>paidText(args),/PROVIDER_400/);assert.equal(submissions,1);
 const rejected=[...rows.values()][0];assert.equal(rejected.cost,recorded.costMicroUsd);
 assert.deepEqual(accountedTokens({status:rejected.status,cost_micro_usd:rejected.cost,config_snapshot:{maxOutputTokens:8000,directorInputTokens:32768}}),{input:0,output:0});
 await assert.rejects(()=>paidText(args),error=>error instanceof Error&&error.message==='SAVED_REQUEST_FAILED'&&retryableProviderFailure(error));assert.equal(submissions,1);
 const fresh={...args,identity:{turn:3,retry:1},snapshot:{...base,...staticCoderReasoning(recorded.model)}};
 const answer=await paidText(fresh);assert.equal(JSON.parse(answer.text).files[0].path,'Frame.tsx');assert.equal(submissions,2);
 assert.equal((await paidText(fresh)).reused,true);assert.equal(submissions,2);assert.equal([...rows.values()].reduce((sum,row)=>sum+(row.cost??0),0),0);
 }finally{globalThis.fetch=original;}
});
