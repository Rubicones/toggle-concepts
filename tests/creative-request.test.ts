import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creativeExecutionSnapshot} from '../packages/creative/request-snapshot';
import {creativePrompt} from '../packages/agents/prompts/creative-v1';
import {creativeRepairProtocol} from '../packages/agents/prompts/creative-repair-v1';
import {textRequestQuote} from '../packages/agents/text-quote';
import {continuationCaps} from '../packages/contracts/preview-continuation';
import {submitText,type TextSnapshot} from '../packages/agents/text-provider';

test('full-script continuation quotes the same 24k allowance the worker will execute',()=>{
 const saved:TextSnapshot={instructions:'Frozen instructions',maxOutputTokens:8000,pricing:{inputPrice:.0000003,outputPrice:.0000025},responseSchema:creativePrompt('script').responseSchema,upstream:[{output:'x'.repeat(200000)}]};
 const quoted=creativeExecutionSnapshot(saved,'script',32768,65536),executed=creativeExecutionSnapshot(quoted,'script',32768,65536);
 assert.equal(quoted.maxOutputTokens,24000);
 assert.deepEqual(executed,quoted);
 const before=textRequestQuote('Restore storyboard bindings',saved).reservationMicroUsd,after=textRequestQuote('Restore storyboard bindings',executed).reservationMicroUsd,spent=386300,cap=500000;
 assert.ok(before<=cap-spent,'The former 8k quote fits the remaining script allowance.');
 assert.ok(after>cap-spent,'The real 24k request would have hit the cap again.');
 const limits=continuationCaps({cap_micro_usd:5000000,charged_micro_usd:785363,reserved_micro_usd:0},cap,spent,after);
 assert.equal(limits.agentCapMicroUsd,spent+after);
 assert.equal(textRequestQuote('Restore storyboard bindings',quoted).reservationMicroUsd,after);
});

test('targeted patch repairs retain their 8k ceiling and respect configured limits',()=>{
 const saved:TextSnapshot={instructions:'Frozen instructions',...creativeRepairProtocol,pricing:{inputPrice:.0000003,outputPrice:.0000025}};
 assert.equal(creativeExecutionSnapshot(saved,'script',32768,65536).maxOutputTokens,8000);
 assert.equal(creativeExecutionSnapshot(saved,'script',6000,65536).maxOutputTokens,6000);
 assert.equal(creativeExecutionSnapshot(saved,'script',32768,4000).maxOutputTokens,4000);
});

test('visual media and critic requests receive their upstream specs alongside image evidence',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async(_url,init)=>{
   calls++;const request=JSON.parse(String(init?.body)),message=request.messages.find((m:{role:string})=>m.role==='user');
   assert.ok(Array.isArray(message.content));
   const text=message.content.filter((b:{type:string})=>b.type==='text').map((b:{text:string})=>b.text).join('\n');
   assert.match(text,/UPSTREAM PROPOSALS/);
   assert.match(text,/approved-musician-montage/);
   assert.match(text,/waveform-comment-zoom/);
   assert.ok(message.content.some((b:{type:string})=>b.type==='image_url'));
   return Response.json({id:'offline-only',choices:[{finish_reason:'stop',message:{content:'{}'}}],usage:{cost:0}});
  };
  for(const stage of ['media','critic']){
   const result=await submitText('fixture-model',`Review ${stage}`,{instructions:'Frozen instructions',maxOutputTokens:1000,pricing:{inputPrice:0,outputPrice:0},upstream:[{output:JSON.stringify({scene:'approved-musician-montage',action:'waveform-comment-zoom'})}]},[{url:'data:image/png;base64,fixture',label:'Frozen campaign evidence'}]);
   assert.equal(result.outcome,'succeeded');
  }
  assert.equal(calls,2);
 }finally{globalThis.fetch=original;}
});
