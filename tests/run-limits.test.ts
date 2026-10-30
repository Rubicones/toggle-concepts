import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {applyRunLimits,practicalLimits,canContinueFailure,runLimitChangeSchema} from '../packages/contracts/run-limits';
import {defaultAgentSettings} from '../packages/agents/defaults';
import {emptyBrief} from '../packages/contracts/brief';
import {guidedRunCommand,runAttention} from '../packages/contracts/guided-run';
test('practical testing defaults give text agents room and preserve larger explicit limits',()=>{
 assert.equal(emptyBrief().runCapMicroUsd,5000000);
 const proposed=practicalLimits(defaultAgentSettings);assert.equal(proposed.some(a=>a.role==='image'),false);assert.equal(proposed.find(a=>a.role==='research')?.maxOutputTokens,16384);assert.equal(proposed.find(a=>a.role==='localization')?.maxOutputTokens,32768);assert.equal(proposed.every(a=>a.capMicroUsd>=500000),true);
 const high=defaultAgentSettings.map(a=>({...a,max_output_tokens:32768,step_cap_micro_usd:2000000}));assert.equal(practicalLimits(high).every(a=>a.maxOutputTokens===32768&&a.capMicroUsd===2000000),true);
});
test('amendments change only effective limits and retain the frozen model and instructions',()=>{
 const frozen=structuredClone(defaultAgentSettings),before=structuredClone(frozen),result=applyRunLimits(frozen,[{role:'research',max_output_tokens:32768,cap_micro_usd:1000000}]);
 assert.deepEqual(frozen,before);assert.equal(result.find(a=>a.role==='research')?.max_output_tokens,32768);assert.equal(result.find(a=>a.role==='research')?.step_cap_micro_usd,1000000);
 result.forEach((a,i)=>{assert.equal(a.model_id,frozen[i].model_id);assert.equal(a.instructions,frozen[i].instructions);});assert.equal(result.find(a=>a.role==='image')?.step_cap_micro_usd,frozen.find(a=>a.role==='image')?.step_cap_micro_usd);
});
test('continuation is explicit, bounded and cannot treat unknown billing or human reviews as retryable',()=>{
 const input={requestId:randomUUID(),expectedVersion:0,runCapMicroUsd:5000000,agents:[{role:'research',maxOutputTokens:32768,capMicroUsd:500000}],continueRun:true,retryJobId:randomUUID()};
 assert.equal(runLimitChangeSchema.safeParse(input).success,true);assert.equal(guidedRunCommand.safeParse({...input,action:'limits'}).success,true);assert.equal(guidedRunCommand.safeParse({action:'stop'}).success,true);
 assert.equal(runLimitChangeSchema.safeParse({...input,runCapMicroUsd:101000000}).success,false);assert.equal(runLimitChangeSchema.safeParse({...input,agents:[{...input.agents[0],maxOutputTokens:1000000}]}).success,false);
 assert.equal(canContinueFailure('OUTPUT_TOKEN_LIMIT'),true);assert.equal(canContinueFailure('STEP_CAP_REACHED'),true);assert.equal(canContinueFailure('USAGE_UNRESOLVED'),false);assert.equal(canContinueFailure('A1_REQUIRED'),false);assert.equal(canContinueFailure('AGENT_INPUT_BLOCKED'),false);
 assert.match(runAttention('OUTPUT_TOKEN_LIMIT')!.detail,/new paid attempt/);assert.match(runAttention('OUTPUT_TOKEN_LIMIT')!.detail,/Incomplete output is not accepted/);
});
