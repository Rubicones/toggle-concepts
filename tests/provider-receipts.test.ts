import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readGenerationReceipt,bindGenerationReceipt} from '../packages/agents/receipts';
import {receiptCommandSchema} from '../packages/contracts/provider-receipt';
const generation='gen-local-receipt-fixture',model='google/gemini-2.5-flash',stepId=randomUUID();
const metadata=()=>({data:{id:generation,model,created_at:new Date().toISOString(),total_cost:.0000312,finish_reason:'stop',external_user:stepId,is_byok:false}});
test('receipt lookups use bounded authenticated GET only and round actual cost up to micro-USD',async()=>{
 const previous=globalThis.fetch,key=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='local-test-key';let calls=0;
 try{globalThis.fetch=async(input,init)=>{calls++;const url=new URL(String(input));assert.equal(url.origin,'https://openrouter.ai');assert.equal(url.pathname,'/api/v1/generation');assert.equal(url.searchParams.get('id'),generation);assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.equal(init?.body,undefined);return Response.json(metadata());};
 const receipt=await readGenerationReceipt(generation);assert.equal(receipt.costMicroUsd,32);assert.equal(calls,1);assert.equal(receipt.source,'openrouter-generation');assert.equal('secret' in receipt,false);
 const bound={id:stepId,model_id:model,created_at:new Date(Date.now()-1000).toISOString(),provider_id:generation};assert.equal(bindGenerationReceipt(receipt,bound),receipt);assert.equal(bindGenerationReceipt(receipt,{...bound,provider_id:null}),receipt);assert.deepEqual(bindGenerationReceipt({...receipt,externalUser:null},bound),{...receipt,externalUser:null});
 assert.throws(()=>bindGenerationReceipt({...receipt,model:'different'},bound),/MISMATCH/);assert.throws(()=>bindGenerationReceipt({...receipt,generationId:'gen-unrelated'},bound),/MISMATCH/);assert.throws(()=>bindGenerationReceipt({...receipt,externalUser:null},{...bound,provider_id:null}),/LINK_UNPROVEN/);assert.throws(()=>bindGenerationReceipt({...receipt,createdAt:new Date(Date.now()-600000).toISOString()},bound),/TIME_MISMATCH/);
 }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=key;}
});
test('missing, unfinished, BYOK, nonfinite, mismatched or oversized provider metadata never proves a refund',async()=>{
 const previous=globalThis.fetch,key=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='local-test-key';
 try{for(const [response,pattern] of [[()=>Response.json({}, {status:404}),/NOT_FOUND/],[()=>Response.json({}, {status:429}),/RATE_LIMITED/],[()=>Response.json({data:{...metadata().data,finish_reason:null}}),/NOT_FINAL/],[()=>Response.json({data:{...metadata().data,is_byok:true}}),/BYOK/],[()=>Response.json({data:{...metadata().data,total_cost:-1}}),/INVALID/],[()=>Response.json({data:{...metadata().data,id:'gen-other'}}),/MISMATCH/],[()=>new Response('x'.repeat(65537)),/INVALID/]] as const){globalThis.fetch=async()=>response();await assert.rejects(()=>readGenerationReceipt(generation),pattern);}
 assert.equal(receiptCommandSchema.safeParse({action:'reconcile',stepId,requestId:randomUUID(),actualCost:0}).success,false);assert.equal(receiptCommandSchema.safeParse({action:'reopen',runId:randomUUID(),requestId:randomUUID(),confirm:false}).success,false);
 }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=key;}
});
