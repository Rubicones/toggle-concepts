import {directionQuestionSummary} from '../packages/director/ad-flow';
import type {ADQuestion} from '../packages/director/state';
import {z} from 'zod';
import {structuralJSONSchema} from '../packages/contracts/schema-export';
import {draftBatchV2Schema} from '../packages/contracts/frame-program';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scenarioPresentation} from '../packages/contracts/run-presentation';
import {prepareAgentOutput,planningRecovery} from '../packages/contracts/agent-output';
import {propagateExecutionFailure} from '../packages/director/execution-failures';
import {assembleStatic} from '../apps/local-runner/director/static-assembler';
import {readLiveOptions} from '../packages/director/live-options.local';
import type {LoopState} from '../packages/director/state';
import type {DirectionInput} from '../packages/director/types';
import recorded from '../fixtures/director/static/input.json';
import {dashboardItems} from '../packages/contracts/dashboard';
import {eventPriceLabel,type DirectorEvent} from '../packages/director/events';
const envelope=(deliverable:unknown)=>JSON.stringify({schemaVersion:'1.0',role:'variants',status:'draft',summary:'Scope audit',deliverable,inputRefs:[],assumptions:[],blockingQuestions:[],warnings:[],handoff:{nextRole:'script',requiredInputs:[],checks:[]}});
const entries=Array.from({length:128},(_,i)=>({id:`issued-${i}`,conceptSlot:1,locale:i%2?'de-DE':'en-GB',hook:`hook-${Math.floor(i/2)}`,offer:'primary',beatSequence:'primary',durationSeconds:6,placementId:'square'}));

test('variant audit binds the original 128-row scope without asking the model to repeat identifiers',()=>{
 const raw=envelope({manifest:{useProvided:true},coverage:'All requested axes audited.'}),before=structuredClone(entries),result=prepareAgentOutput(raw,'variants',true,{entries}),saved=JSON.parse(result.text);
 assert.deepEqual(result.changes,['application-provided-manifest']);assert.deepEqual(saved.deliverable.manifest.entries,entries);assert.equal(saved.deliverable.orderedCount,128);assert.deepEqual(entries,before);assert.ok(raw.length<600);
 assert.equal(saved.deliverable.manifest.useProvided,undefined);const replay=prepareAgentOutput(result.text,'variants',true,{entries});assert.deepEqual(replay.changes,[]);assert.equal(replay.text,result.text);
 assert.throws(()=>prepareAgentOutput(envelope({manifest:{useProvided:true},orderedCount:129}),'variants',true,{entries}),/MANIFEST_BINDING/);
 assert.throws(()=>prepareAgentOutput(envelope({manifest:{useProvided:true,entries:[]}}),'variants',true,{entries}),/MANIFEST_BINDING/);
});
test('legacy UUID repair accepts exact axes only and never reassigns a conflicting issued ID',()=>{
 const rows=structuredClone(entries);rows[1].id='mistyped-id';const result=planningRecovery(envelope({manifest:{entries:rows},orderedCount:128}),'variants',{entries});assert.equal(JSON.parse(result.text).deliverable.manifest.entries[1].id,entries[1].id);
 rows[1].id=entries[0].id;assert.throws(()=>prepareAgentOutput(envelope({manifest:{entries:rows},orderedCount:128}),'variants',true,{entries}),/BINDING/);
 rows[1].id='mistyped-id';rows[1].locale='fr-FR';assert.throws(()=>prepareAgentOutput(envelope({manifest:{entries:rows},orderedCount:128}),'variants',true,{entries}),/BINDING/);
});
test('scenario presentation preserves exact creative text and zero start times without exposing IDs as content',()=>{
 const value={threeDirections:[{conceptId:'issued',premise:'A supported benefit.',hook:'Your exact hook.',timedStoryboard:[{sceneId:'scene-1',startTime:0,endTime:1.5,onScreenCopy:'Keep every take.',visuals:'The same song has three retained versions.',narration:'Exact voiceover.',audioIntent:'Quiet.'}]}]},before=structuredClone(value),result=scenarioPresentation(value)!;
 assert.deepEqual(value,before);assert.equal(result[0].scenes[0].start,'0');assert.equal(result[0].scenes[0].copy,'Keep every take.');assert.equal(result[0].scenes[0].visual,'The same song has three retained versions.');assert.equal(result[0].scenes[0].narration,'Exact voiceover.');assert.deepEqual(result[0].rest,{});
});
test('saved authored source can finish locally after a parser fix with zero new model requests even when turns are used',async()=>{
 const state:LoopState={turn:9,startedAt:0,complete:false,transcript:[{from:'tool',text:JSON.stringify({tool:'write',result:{written:'Frame.tsx',bytes:48}})}]};let requests=0;const tools:string[]=[];
 await assembleStatic({state,recoverExisting:true,maxTurns:9,timeMs:100,now:()=>1,filesContext:async()=>({files:[{path:'Frame.tsx',source:'export default function Frame(){return null;}'}],oversized:false}),call:async()=>{requests++;throw Error('No model request allowed');},tool:async action=>{tools.push(action.tool);return action.tool==='finish'?{complete:true}:{passed:true};},save:async()=>{}});
 assert.equal(requests,0);assert.equal(state.turn,9);assert.equal(state.complete,true);assert.deepEqual(tools,['typecheck','bundle','finish']);
});
test('a human stop or temporary worker fault is never converted into another model repair',async()=>{
 for(const code of ['RUN_STOPPED','STALE_DIRECTOR_LEASE','RESOURCE_PERMISSION_REQUIRED','PREVIEW_SOURCE_CHANGING','LOCAL_API_UNAVAILABLE']){
  const state:LoopState={turn:0,startedAt:0,complete:false,transcript:[]};let requests=0;
  await assert.rejects(()=>assembleStatic({state,maxTurns:9,timeMs:100,now:()=>1,call:async()=>{requests++;return JSON.stringify({files:[{path:'Frame.tsx',source:'export default function Frame(){return null;}'}]});},tool:async()=>{throw Error(code);},save:async()=>{}}),new RegExp(code));assert.equal(requests,1);
 }
 assert.equal(propagateExecutionFailure(Error('Frame.tsx: TS2322 incompatible props')),false);assert.equal(propagateExecutionFailure(Error("Frame.tsx: TS2339 Property 'network' does not exist")),false);
});
test('preview scalar constants are resolved statically without calls, mutable references or cycles',()=>{
 const input=recorded as DirectionInput,scene=input.storyboard[0].id,variant=input.variants[0],source=`const SCENE=${JSON.stringify(scene)}; export const previewOptions={hooks:[${JSON.stringify(variant.hook)}],ctas:[${JSON.stringify(variant.cta)}],locales:[${JSON.stringify(variant.locale)}],lengths:[${variant.length}],scenes:[SCENE],adaptive:true};`;
 assert.deepEqual(readLiveOptions(source,input).options.scenes,[scene]);
 assert.throws(()=>readLiveOptions(source.replace('const SCENE=','let SCENE='),input),/LITERAL/);
 assert.throws(()=>readLiveOptions(source.replace(`const SCENE=${JSON.stringify(scene)}`,"const SCENE=readFile('/private')"),input),/LITERAL/);
 assert.throws(()=>readLiveOptions(source.replace(`const SCENE=${JSON.stringify(scene)}`,'const SCENE=SCENE'),input),/LITERAL/);
});
test('campaign dashboard projects durable progress and counted costs without turning a closed run into active work',()=>{
 const controls=[{campaign_id:'one',run_id:'run',stage:'assembly',status:'running',blocker:null,updated_at:'2026-10-30T00:00:00Z'}],runs=[{id:'run',campaign_id:'one',status:'closed',cap_micro_usd:2000000,charged_micro_usd:500000,reserved_micro_usd:250000}],before=structuredClone({controls,runs});
 const items=dashboardItems(['one','new'],controls,runs);assert.equal(items[0].state,'paused');assert.equal(items[0].countedMicroUsd,500000);assert.equal(items[0].reservedMicroUsd,250000);assert.equal(items[1].state,'ready');assert.deepEqual({controls,runs},before);
 controls[0].status='review';runs[0].status='active';assert.equal(dashboardItems(['one'],controls,runs)[0].state,'review');
});

test('schema exports label known legacy opaque payloads but never erase an unrelated unsupported contract',()=>{
 const exported=structuralJSONSchema(draftBatchV2Schema);assert.match(JSON.stringify(exported),/Opaque legacy FrameModel/);assert.match(JSON.stringify(exported),/Compiler\/engine checks are required/);assert.throws(()=>structuralJSONSchema(z.strictObject({unexpected:z.custom()})),/Custom types/);
});
test('open request pricing uses the reservation rather than a synthetic zero and unknown receipts remain explicit',()=>{
 const event:DirectorEvent={id:'e',stepId:'s',kind:'request',status:'running',at:'2026-10-30T00:00:00Z',message:'Request sent',costMicroUsd:0,reservedMicroUsd:100000};
 assert.equal(eventPriceLabel(event),'Up to $0.1000');assert.equal(eventPriceLabel({...event,status:'done',costMicroUsd:25000}),'$0.0250');assert.match(eventPriceLabel({...event,status:'failed',costMicroUsd:null}),/Receipt pending/);assert.equal(eventPriceLabel({...event,status:'failed',costMicroUsd:0}),'$0.0000');
});

test('historical allowance questions keep their diagnostic without making the AD read raw token arithmetic or tool JSON',()=>{
 const question:ADQuestion={id:'q',directionId:'d',reason:'budget',question:'54,968 used. Last tool result: {"error":"OUTPUT_TOKEN_LIMIT"}',technical:'ROLE_ALLOWANCE_EXHAUSTED: assembler: output 24000 of 24000',options:[]},before=structuredClone(question);
 assert.match(directionQuestionSummary(question),/Saved source/);assert.doesNotMatch(directionQuestionSummary(question),/54,968|Last tool result|OUTPUT_TOKEN_LIMIT/);assert.deepEqual(question,before);
});
