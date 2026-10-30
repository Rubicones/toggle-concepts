import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitText} from '../packages/agents/text-provider';
import {intakeOutputRequest} from '../packages/brand/intake-output';
import {providerFailureSummary} from '../packages/contracts/provider-error';
test('provider rejection persists a bounded, redacted explanation with zero charge and no retry',async()=>{
 const previous=globalThis.fetch,key=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='sk-or-v1-local-secret-fixture';let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json({error:{code:400,message:'Provider returned error',metadata:{provider_name:'Google',raw:JSON.stringify({error:{message:'Schema too complex. Bearer sk-or-v1-local-secret-fixture'}})}}},{status:400,headers:{'x-request-id':'request-fixture'}});};const result=await submitText('google/gemini-2.5-flash','fixture',{instructions:'Frozen instructions',maxOutputTokens:3600,pricing:{inputPrice:.0000003,outputPrice:.0000025},outputFormat:'json_schema',responseSchema:intakeOutputRequest(9,3600).responseSchema});assert.equal(result.failure,'PROVIDER_400');assert.equal(result.cost,0);assert.equal(result.outcome,'failed');assert.equal(calls,1);assert.match(result.providerError!.message,/Schema too complex/);assert.ok(!JSON.stringify(result.providerError).includes('local-secret-fixture'));assert.equal(result.providerError!.provider,'Google');assert.equal(result.providerError!.requestId,'request-fixture');
 const shown=providerFailureSummary(result.failure!,null,{_studio:{providerError:result.providerError}});assert.match(shown.message,/Schema too complex/);assert.match(providerFailureSummary('PROVIDER_400',null).message,/not retained/);assert.match(providerFailureSummary('INVALID_OUTPUT_SCHEMA','{"rules":[').message,/incomplete/);
 }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=key;}
});
test('charged provider rejection retains actual billed cost and safe explanation',async()=>{
 const previous=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({usage:{cost:.0001},error:{code:400,message:'Unsupported schema'}},{status:400});const result=await submitText('fixture','fixture',{instructions:'Frozen',maxOutputTokens:3600,pricing:{inputPrice:.0000003,outputPrice:.0000025}});assert.equal(result.cost,100);assert.equal(result.failure,'PROVIDER_400_CHARGED');assert.match(result.providerError!.message,/Unsupported schema/);}finally{globalThis.fetch=previous;}
});
test('HTTP 502 explains the provider failure, retains uncertain billing and never resubmits',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json({error:{code:502,message:'Provider returned error',metadata:{provider_name:'Google AI Studio',raw:JSON.stringify({error:{message:'An internal error has occurred. Please retry.'}})}}},{status:502,headers:{'x-generation-id':'gen-502-fixture'}});};
 const result=await submitText('google/gemini-2.5-flash','select references',{instructions:'Frozen',maxOutputTokens:2824,pricing:{inputPrice:.0000003,outputPrice:.0000025},stream:true});
 assert.equal(result.outcome,'unknown');assert.equal(result.cost,null);assert.equal(result.text,null);assert.equal(result.generation,'gen-502-fixture');assert.equal(calls,1);
 const shown=providerFailureSummary(result.failure!,result.text,{_studio:{providerError:result.providerError}});assert.match(shown.message,/Google AI Studio.*server error.*502/);assert.match(shown.details[0],/internal error/);
 }finally{globalThis.fetch=old;}
});
test('non-JSON gateway errors preserve HTTP status without storing HTML or proving zero cost',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response('<html>private gateway body</html>',{status:502});const r=await submitText('fixture','fixture',{instructions:'Frozen',maxOutputTokens:2824,pricing:{inputPrice:0,outputPrice:0}});assert.equal(r.failure,'PROVIDER_502');assert.equal(r.cost,null);assert.equal(r.outcome,'unknown');assert.equal(r.providerError?.httpStatus,502);assert.ok(!JSON.stringify(r).includes('private gateway'));}finally{globalThis.fetch=old;}
});
test('streamed provider errors keep the upstream cause, saved generation and partial text without another call',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response('data: '+JSON.stringify({id:'gen-stream-error',choices:[{delta:{content:'partial'}}]})+'\n\ndata: '+JSON.stringify({error:{code:502,message:'Upstream unavailable',metadata:{provider_name:'Google AI Studio'}},usage:{cost:.001}})+'\n\n',{headers:{'content-type':'text/event-stream'}});};
 const r=await submitText('fixture','fixture',{instructions:'Frozen',maxOutputTokens:2824,pricing:{inputPrice:0,outputPrice:0},stream:true});assert.equal(calls,1);assert.equal(r.failure,'PROVIDER_502');assert.equal(r.outcome,'unknown');assert.equal(r.cost,null);assert.equal(r.generation,'gen-stream-error');assert.equal(r.text,'partial');assert.equal(r.providerError?.provider,'Google AI Studio');assert.match(r.providerError?.message??'',/Upstream unavailable/);
 }finally{globalThis.fetch=old;}
});
