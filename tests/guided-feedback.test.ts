import assert from 'node:assert/strict';
import {test} from 'node:test';
import {appendGuidedFeedback} from '../packages/data/guided-feedback';
import {savedStageOutputs,readableOutput} from '../packages/contracts/run-output';
import type {GuidedRunView} from '../packages/contracts/guided-run';
test('a progress-heartbeat version race can retry feedback persistence without duplicating work',async()=>{
 let version=7,calls=0;const seen:number[]=[];const result=await appendGuidedFeedback(async()=>version,async expected=>{seen.push(expected);calls++;if(calls===1){version++;return {data:null,error:{code:'40001',message:'STALE_GUIDED_RUN'}};}return {data:{id:'same-request-id'},error:null};});assert.deepEqual(seen,[7,8]);assert.equal(result.error,null);assert.deepEqual(result.data,{id:'same-request-id'});
});
test('checkpoint/permission failures are never retried and heartbeat contention is bounded',async()=>{
 let calls=0;const rejected=await appendGuidedFeedback(async()=>1,async()=>{calls++;return {data:null,error:{message:'CHECKPOINT_CHANGE_REQUIRED'}};});assert.equal(calls,1);assert.equal(rejected.error?.message,'CHECKPOINT_CHANGE_REQUIRED');calls=0;await appendGuidedFeedback(async()=>1,async()=>{calls++;return {data:null,error:{message:'STALE_GUIDED_RUN'}};});assert.equal(calls,3);
});
test('read-only step navigation exposes saved outputs in workflow order, including failed localized text',()=>{
 const view={steps:[],jobs:[{id:'v',job_key:'variants',state:'succeeded',output:'{"summary":"Order","deliverable":{"orderedCount":32}}'},{id:'r',job_key:'research',state:'succeeded',output:'{"summary":"Evidence","deliverable":{"evidenceLedger":[]}}'},{id:'l',job_key:'localization',state:'failed',output:null}],failureStep:{jobId:'l',output:'{"summary":"Saved failed copy","deliverable":{"localizedCopy":[]}}'}} as unknown as GuidedRunView;
 assert.deepEqual(savedStageOutputs(view,'strategy').map(o=>o.id),['r','v']);assert.equal(savedStageOutputs(view,'visuals')[0].state,'failed');assert.equal(readableOutput(savedStageOutputs(view,'strategy')[0].output).summary,'Evidence');assert.deepEqual(savedStageOutputs(view,'finals'),[]);
});
