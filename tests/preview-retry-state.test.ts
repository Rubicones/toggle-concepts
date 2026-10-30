import {test} from 'node:test';
import assert from 'node:assert/strict';
import {settlePreviewRetryState,type PreviewRetryControl} from '../packages/data/preview-retry-state';
const control=(status='running'):PreviewRetryControl=>({stage:'assembly',status,blocker:null,cursor:{assemblyStepId:'initial',assemblyImportedVersion:null}});
test('Retry wakes the coordinator once and waits for its terminal failure before replacement admission',async()=>{
 let reads=0,wakes=0,clock=0;const states=[control(),control(),{...control('blocked'),blocker:'OUTPUT_TOKEN_LIMIT'}];
 await settlePreviewRetryState({initialStep:'initial',read:async()=>states[Math.min(reads++,states.length-1)],wake:async()=>{wakes++;},now:()=>clock,wait:async ms=>{clock+=ms;}});
 assert.equal(wakes,1);assert.equal(reads,3);assert.equal(clock,500);
});
test('already settled, reviewed, paused, imported or replaced steps never wake processing',async()=>{
 for(const state of [control('blocked'),control('review'),control('paused'),{...control(),stage:'draft_review'},{...control(),cursor:{assemblyStepId:'replacement'}},{...control(),cursor:{assemblyStepId:'initial',assemblyImportedVersion:2}}]){
  await settlePreviewRetryState({initialStep:'initial',read:async()=>state,wake:async()=>{assert.fail('must not wake');}});
 }
});
test('lease/coordinator stalls stop with an actionable state error and cannot admit an AI request',async()=>{
 let clock=0,wakes=0;
 await assert.rejects(()=>settlePreviewRetryState({initialStep:'initial',read:async()=>control(),wake:async()=>{wakes++;},now:()=>clock,wait:async ms=>{clock+=ms;},timeoutMs:500}),/PREVIEW_RETRY_SETTLING/);
 assert.equal(wakes,1);assert.equal(clock,500);
});
test('a concurrent replacement ends waiting; SQL still owns deduplication and source/version checks',async()=>{
 let read=0;await settlePreviewRetryState({initialStep:'initial',read:async()=>read++?{...control(),cursor:{assemblyStepId:'replacement'}}:control(),wake:async()=>{},wait:async()=>{}});assert.equal(read,2);
});
