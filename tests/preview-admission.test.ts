import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {visibleRunControl} from '../packages/contracts/run-availability';
import {guidedMilestoneStates,guidedRunCommand,type GuidedRunControl,type GuidedRunView} from '../packages/contracts/guided-run';
import {manualAttempt} from '../packages/data/manual-attempt';
import {submitText,type TextSnapshot} from '../packages/agents/text-provider';
const cfg:TextSnapshot={instructions:'Frozen direction',maxOutputTokens:32768,pricing:{inputPrice:.0000003,outputPrice:.0000025},stream:true};
test('a closed run or unknown manual request outranks stale running progress without changing stored data',()=>{
 const control={stage:'assembly',status:'running',cursor:{assemblyStepId:'old'},version:45,blocker:null,run_id:'run',campaign_id:'campaign',tenant_id:'tenant',c1_id:'c1',brandbook_id:'book',lease_token:0,created_by:'AD',created_at:'2026-10-26T00:00:00Z',updated_at:'2026-10-26T00:00:00Z'} satisfies GuidedRunControl,before=structuredClone(control);
 const shown=visibleRunControl(control,{status:'closed',closure_reason:'provider_status_unknown'},[]);
 assert.equal(shown?.status,'blocked');assert.equal(shown?.blocker,'UNRESOLVED_PROVIDER_RECEIPT');assert.deepEqual(control,before);
 const view={control:shown,jobs:[...['research','strategy','variants','script','asset-plan','localization'].map(job_key=>({job_key,state:'succeeded'}))]} as GuidedRunView;
 assert.equal(guidedMilestoneStates(view).assembly,'blocked');assert.equal(guidedMilestoneStates(view).visuals,'done');
 assert.equal(visibleRunControl(control,{status:'active'},[{status:'unknown'}])?.status,'blocked');assert.equal(visibleRunControl(control,{status:'active'},[{status:'running'}]),control);
 assert.equal(visibleRunControl(control,{status:'closed',closure_reason:'other'},[])?.blocker,'other');assert.equal(visibleRunControl(null,{status:'active'},[]),null);
 assert.equal(guidedRunCommand.safeParse({action:'retryAssembly',stepId:'b07af237-0b34-4561-81e3-a63a836f73ae',confirmPaidRetry:false}).success,false);
 const retry={action:'retryAssembly',stepId:'b07af237-0b34-4561-81e3-a63a836f73ae',requestId:'b07af237-0b34-4561-81e3-a63a836f73af',confirmPaidRetry:true};assert.equal(guidedRunCommand.safeParse(retry).success,true);assert.equal(guidedRunCommand.safeParse({...retry,requestId:undefined}).success,false);
});
test('manual retry follows its new attempt instead of repeatedly reading the failed original step',async()=>{
 let state='queued',stepId:string|null='original';const calls:string[]=[];
 const admin=createClient('http://127.0.0.1:9999','fixture',{global:{fetch:async input=>{const url=new URL(String(input));calls.push(url.pathname);return Response.json(url.pathname.endsWith('studio_workflow_jobs')?{id:'job',round_id:'manual',state,blocker:null,attempt_count:2}:{step_id:stepId});}}});
 assert.equal((await manualAttempt(admin,'tenant','run','original')).pending,true);
 state='leased';stepId=null;assert.equal((await manualAttempt(admin,'tenant','run','original')).pending,true);
 state='succeeded';stepId='new-success';const result=await manualAttempt(admin,'tenant','run','original');assert.equal(result.stepId,'new-success');assert.equal(result.pending,false);assert.equal(calls.length,6);
});
const event=(value:unknown)=>`data: ${JSON.stringify(value)}\r\n\r\n`;
function streamed(text:string,header=true){const bytes=new TextEncoder().encode(text);let position=0;return new Response(new ReadableStream({pull(controller){if(position>=bytes.length){controller.close();return;}controller.enqueue(bytes.slice(position,position+7));position+=7;}}),{headers:{'content-type':'text/event-stream',...(header?{'x-generation-id':'gen-saved-stream'}:{})}});}
test('fragmented SSE handles comments, unicode, repeated finish reasons and final accounting without resubmission',async()=>{
 const old=globalThis.fetch;let calls=0;const anchors:string[]=[];
 try{globalThis.fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.equal(body.stream,true);assert.equal(body.user,'request-tag');assert.equal(body.max_tokens,32768);return streamed(': OPENROUTER PROCESSING\r\n\r\n'+event({id:'gen-saved-stream',choices:[{delta:{content:'Привет '}}]})+event({choices:[{delta:{content:'world'},finish_reason:'stop'}]})+event({choices:[{delta:{},finish_reason:'stop'}],usage:{cost:.0123451,prompt_tokens:100,completion_tokens:10}})+'data: [DONE]\r\n\r\n');};
  const r=await submitText('google/gemini-2.5-flash','Assemble',cfg,[],'request-tag',async id=>{anchors.push(id);});assert.equal(calls,1);assert.deepEqual(anchors,['gen-saved-stream']);assert.equal(r.outcome,'succeeded');assert.equal(r.text,'Привет world');assert.equal(r.cost,12346);assert.equal(r.generation,'gen-saved-stream');
 }finally{globalThis.fetch=old;}
});
test('broken or unaccounted streams retain provider identity and partial output but cannot activate or prove zero cost',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{for(const ending of ['',event({error:{message:'Provider failed'}}),'data: {bad}\n\n']){globalThis.fetch=async()=>{calls++;return streamed(event({id:'gen-saved-stream',choices:[{delta:{content:'partial'}}]})+ending,false);};const r=await submitText('model','task',cfg);assert.equal(r.outcome,'unknown');assert.equal(r.cost,null);assert.equal(r.generation,'gen-saved-stream');assert.equal(r.text,'partial');}
 globalThis.fetch=async()=>{calls++;return streamed(event({choices:[{delta:{content:'complete'},finish_reason:'stop'}]})+'data: [DONE]\n\n');};const noCost=await submitText('model','task',cfg);assert.equal(noCost.outcome,'unknown');assert.equal(noCost.failure,'USAGE_UNRESOLVED');assert.equal(calls,4);
 }finally{globalThis.fetch=old;}
});
test('stream length stops, HTTP rejections and timeouts have distinct outcomes and never auto-retry',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return streamed(event({choices:[{delta:{content:'incomplete'},finish_reason:'length'}],usage:{cost:.01}})+'data: [DONE]\n\n');};const length=await submitText('model','task',cfg);assert.equal(length.outcome,'failed');assert.equal(length.failure,'OUTPUT_TOKEN_LIMIT');assert.equal(length.cost,10000);
 globalThis.fetch=async()=>{calls++;return Response.json({error:{message:'Invalid input'}},{status:400,headers:{'x-generation-id':'gen-rejected'}});};const rejected=await submitText('model','task',cfg);assert.equal(rejected.outcome,'failed');assert.equal(rejected.cost,0);assert.equal(rejected.generation,'gen-rejected');
 globalThis.fetch=async()=>{calls++;throw new DOMException('Deadline exceeded','TimeoutError');};const timeout=await submitText('model','task',cfg);assert.equal(timeout.outcome,'unknown');assert.equal(timeout.failure,'PROVIDER_TIMEOUT');assert.equal(calls,3);
 }finally{globalThis.fetch=old;}
});
