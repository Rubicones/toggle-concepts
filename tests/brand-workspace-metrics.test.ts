import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brandWorkspaceMetrics,brandAnalysisCanContinue,brandAnalysisNotice} from '../packages/brand/workspace-metrics';
test('budget segments and actual token usage remain separate from estimated purchasing power',()=>{
 const value=brandWorkspaceMetrics({cap_micro_usd:300000,charged_micro_usd:112800,reserved_micro_usd:30000},[
  {role:'brand-kit',status:'running',cost_micro_usd:null,reserve_micro_usd:30000,usage:null,maxOutputTokens:8192,pricing:{outputPrice:.0000025}},
  {role:'brand-kit',status:'succeeded',cost_micro_usd:112800,reserve_micro_usd:120000,usage:{prompt_tokens:12000,completion_tokens:4000,total_tokens:16000}},
 ]);
 assert.equal(value.availableMicroUsd,157200);assert.equal(value.usedTokens,16000);assert.equal(value.inputTokens,12000);assert.equal(value.outputTokens,4000);assert.equal(value.reservedOutputTokens,8192);assert.equal(value.availableOutputTokens,62880);assert.equal(value.unreportedSteps,0);
 assert.equal(value.spentMicroUsd+value.reservedMicroUsd+value.availableMicroUsd,300000);
});
test('missing token usage is disclosed and a missing price never invents free tokens',()=>{
 const value=brandWorkspaceMetrics({cap_micro_usd:100,charged_micro_usd:100,reserved_micro_usd:0},[{status:'unknown',cost_micro_usd:null,reserve_micro_usd:100,usage:null}]);assert.equal(value.unreportedSteps,1);assert.equal(value.availableMicroUsd,0);assert.equal(value.availableOutputTokens,null);assert.equal(value.usedTokens,0);
 const freeError=brandWorkspaceMetrics({cap_micro_usd:100,charged_micro_usd:0,reserved_micro_usd:0},[{status:'failed',cost_micro_usd:0,reserve_micro_usd:50,usage:null}]);assert.equal(freeError.unreportedSteps,0);
});
test('alternative token receipt fields and malformed values are handled honestly',()=>{
 const value=brandWorkspaceMetrics({cap_micro_usd:1000,charged_micro_usd:10,reserved_micro_usd:20},[{role:'brand-kit',status:'succeeded',cost_micro_usd:10,reserve_micro_usd:20,usage:{input_tokens:20,output_tokens:8,total_tokens:-1},pricing:{outputPrice:0}}]);assert.equal(value.usedTokens,28);assert.equal(value.availableOutputTokens,null);
});
test('Continue work includes stopped sessions but never replays uncertain or invalid submissions',()=>{
 for(const status of ['active','paused','cancelled','budget_blocked'])assert.equal(brandAnalysisCanContinue({status,blocker:null}),true);
 assert.equal(brandAnalysisCanContinue({status:'blocked',blocker:'NO_NEW_FINDINGS'}),true);assert.equal(brandAnalysisCanContinue({status:'blocked',blocker:'INVALID_FIELD_RESPONSE'}),false);assert.equal(brandAnalysisCanContinue({status:'unknown',blocker:'SUBMISSION_OUTCOME_UNKNOWN'}),false);assert.equal(brandAnalysisCanContinue({status:'completed',blocker:null}),false);
});
test('response output exhaustion does not spend the remaining run budget',()=>{
 const usage=brandWorkspaceMetrics({cap_micro_usd:300000,charged_micro_usd:115816,reserved_micro_usd:0},[
  {role:'brand-kit',status:'failed',cost_micro_usd:10585,reserve_micro_usd:20000,usage:{prompt_tokens:5000,completion_tokens:3575},maxOutputTokens:3600},
 ]);
 assert.equal(usage.spentMicroUsd,115816);assert.equal(usage.availableMicroUsd,184184);assert.equal(usage.lastRequestOutputLimit,3600);
 const notice=brandAnalysisNotice({status:'blocked',blocker:'OUTPUT_TOKEN_LIMIT'},usage.lastRequestOutputLimit);
 assert.equal(notice?.title,'Response length limit reached');assert.match(notice!.detail,/3,600-token/);assert.match(notice!.detail,/separate from the money budget/);
 assert.equal(brandAnalysisCanContinue({status:'blocked',blocker:'OUTPUT_TOKEN_LIMIT'}),false);
});
test('request, cumulative agent and run limits have distinct explanations',()=>{
 for(const [blocker,title] of [['REQUEST_PRICE_CAP','Request price allowance is too small'],['STEP_CAP_REACHED','Agent allowance reached'],['RUN_CAP_REACHED','Remaining budget cannot cover the next request']])assert.equal(brandAnalysisNotice({status:'budget_blocked',blocker})?.title,title);
 assert.equal(brandAnalysisNotice({status:'active',blocker:null}),null);
 assert.doesNotMatch(brandAnalysisNotice({status:'blocked',blocker:'OUTPUT_TOKEN_LIMIT'})!.detail,/undefined|null/);
});
