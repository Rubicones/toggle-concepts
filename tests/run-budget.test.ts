import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runBudget,agentLabel} from '../packages/contracts/run-budget';
import {continuationCaps,countedAgentSpend,typicalRequestCost,previewContinuationCommand} from '../packages/contracts/preview-continuation';
import {guidedRunCommand} from '../packages/contracts/guided-run';
import {defaultAgentSettings} from '../packages/agents/defaults';
const agents=defaultAgentSettings.map(a=>a.role==='creative-code'?{...a,model_id:a.model_id||'google/gemini-2.5-pro',step_cap_micro_usd:500000}:a);
// The live dead end: a 502 left its full allowance counted, then the next attempt was cap-rejected before submission.
const steps=[
 {role:'script',status:'succeeded',cost_micro_usd:120000,reserve_micro_usd:300000},
 {role:'creative-code',status:'failed',cost_micro_usd:null,reserve_micro_usd:400000},
 {role:'research',status:'running',cost_micro_usd:null,reserve_micro_usd:50000},
];
test('the budget separates confirmed spend, unconfirmed holds and in-flight reservations',()=>{
 const run={cap_micro_usd:5000000,charged_micro_usd:520000,reserved_micro_usd:50000};
 const b=runBudget(run,agents,steps,{code:'STEP_CAP_REACHED',role:'creative-code'});
 assert.equal(b.settledMicroUsd,120000);assert.equal(b.heldMicroUsd,400000);assert.equal(b.inFlightMicroUsd,50000);assert.equal(b.freeMicroUsd,4430000);
 assert.equal(b.blockedBy,'agent');assert.equal(b.blockedRole,'creative-code');
 const preview=b.agents.find(a=>a.role==='creative-code')!;assert.equal(preview.usedMicroUsd,400000);assert.equal(preview.heldMicroUsd,400000);assert.equal(preview.freeMicroUsd,100000);assert.equal(preview.blocked,true);
 assert.equal(b.agents.find(a=>a.role==='research')?.inFlightMicroUsd,50000);
 assert.equal(b.settledMicroUsd+b.heldMicroUsd+b.inFlightMicroUsd+b.freeMicroUsd,run.cap_micro_usd);
 assert.equal(agentLabel('creative-code'),'Preview assembly');
});
test('a run-cap stop is reported at run level and never as a negative remainder',()=>{
 const b=runBudget({cap_micro_usd:500000,charged_micro_usd:520000,reserved_micro_usd:0},agents,steps,{code:'RUN_CAP_REACHED',role:'creative-code'});
 assert.equal(b.blockedBy,'run');assert.equal(b.blockedRole,null);assert.equal(b.freeMicroUsd,0);assert.equal(b.agents.some(a=>a.blocked),false);
});
test('continue anyway raises each limit exactly enough for one quoted request and never lowers one',()=>{
 const spent=countedAgentSpend(steps.filter(s=>s.role==='creative-code'));assert.equal(spent,400000);
 const caps=continuationCaps({cap_micro_usd:5000000,charged_micro_usd:520000,reserved_micro_usd:50000},500000,spent,450000);
 assert.deepEqual(caps,{runCapMicroUsd:5000000,agentCapMicroUsd:850000});
 const tight=continuationCaps({cap_micro_usd:600000,charged_micro_usd:520000,reserved_micro_usd:50000},2000000,spent,450000);
 assert.deepEqual(tight,{runCapMicroUsd:1020000,agentCapMicroUsd:2000000});
 assert.throws(()=>continuationCaps({cap_micro_usd:1,charged_micro_usd:99900000,reserved_micro_usd:0},1,0,200000),/CONTINUATION_LIMIT_EXCEEDED/);
});
test('the approximate price prefers confirmed history and stays within the hold',()=>{
 assert.deepEqual(typicalRequestCost([90000,150000,120000],50000,300000,450000),{typicalMicroUsd:120000,typicalBasis:'history'});
 assert.deepEqual(typicalRequestCost([100000,200000],50000,300000,450000),{typicalMicroUsd:150000,typicalBasis:'history'});
 assert.deepEqual(typicalRequestCost([],50000,300000,450000),{typicalMicroUsd:170000,typicalBasis:'estimate'});
 assert.equal(typicalRequestCost([900000],50000,300000,450000).typicalMicroUsd,450000);
 assert.equal(typicalRequestCost([0,-5],0,0,450000).typicalMicroUsd,1);
});
test('the continue command is strict and part of the run command union',()=>{
 const command={action:'continueAssembly',requestId:crypto.randomUUID(),jobId:crypto.randomUUID(),attemptId:crypto.randomUUID(),quoteId:'a'.repeat(64),expectedVersion:2,maxCostMicroUsd:450000,runCapMicroUsd:5000000,agentCapMicroUsd:850000};
 assert.equal(guidedRunCommand.parse(command).action,'continueAssembly');
 assert.throws(()=>previewContinuationCommand.parse({...command,agentCapMicroUsd:100000001}));
 assert.throws(()=>previewContinuationCommand.parse({...command,extra:true}));
});
