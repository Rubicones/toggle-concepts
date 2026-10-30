import type {TextSnapshot} from '../agents/text-provider';
import {creativeOutputLimits,creativePrompt,type CreativeStage} from '../agents/prompts/creative-v1';
import {creativeRepairProtocol} from '../agents/prompts/creative-repair-v1';

/** Admission quotes and execution must price exactly the same schema and output allowance. */
export function creativeExecutionSnapshot<T extends TextSnapshot>(saved:T,stage:Exclude<CreativeStage,'compile'>,agentLimit:number,modelLimit:number){
 const patch=saved.responseSchema?.name===creativeRepairProtocol.responseSchema.name;
 const responseSchema=saved.responseSchema?.name===`m07b_${stage}_v1`?creativePrompt(stage).responseSchema:saved.responseSchema;
 const maxOutputTokens=Math.min(patch?Math.min(saved.maxOutputTokens,creativeRepairProtocol.maxOutputTokens):Math.max(saved.maxOutputTokens,creativeOutputLimits[stage]),agentLimit,modelLimit);
 return {...saved,responseSchema,maxOutputTokens};
}
