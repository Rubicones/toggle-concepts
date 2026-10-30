import {creativePromptV2} from '../agents/prompts/creative-v2';
import {CREATIVE_PROTOCOL_VERSION,LEGACY_CREATIVE_PROTOCOL_VERSION} from './version';
import type {AgentSetting,ModelOption} from '../contracts/shared';
import type {CreativeInputs} from './protocol';
import {creativePrompt,creativeRoles,type CreativeStage} from '../agents/prompts/creative-v1';

/** Preserve frozen role configuration; creative protocol text has its own system message. */
export function creativeTask(stage:Exclude<CreativeStage,'compile'>,input:CreativeInputs,runId:string,roundId:string,agent:AgentSetting,model:ModelOption){
 if(agent.role!==creativeRoles[stage]||model.id!==agent.model_id)throw new Error('CHECKPOINT_CONFIG_MISMATCH');
 if(!model.supportedParameters.some(p=>['structured_outputs','response_format'].includes(p)))throw new Error('STRUCTURED_OUTPUT_UNAVAILABLE');
 const protocol=input.protocol==='creative@2'?creativePromptV2(stage,input):creativePrompt(stage);
 return {prompt:protocol.prompt,snapshot:{instructions:agent.instructions,protocolInstructions:protocol.instructions,creativeProtocol:input.protocol==='creative@2'?CREATIVE_PROTOCOL_VERSION:LEGACY_CREATIVE_PROTOCOL_VERSION,creativeRoundId:roundId,creativeStage:stage,maxOutputTokens:Math.min(protocol.maxOutputTokens,agent.max_output_tokens,model.maxOutput),stepCapMicroUsd:agent.step_cap_micro_usd,pricing:model,campaignContext:input,budgetScopeId:`budget-step-${runId}-${agent.role}`,outputFormat:'json_schema',responseSchema:protocol.responseSchema,stream:true,disableReasoning:model.id==='google/gemini-2.5-flash'}};
}
