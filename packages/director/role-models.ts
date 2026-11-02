import type {CatalogModel} from '../agents/catalog';
import {staticOutputCaps} from './roles';

export type DirectorModelRole='director'|'assembler'|'critic';
export type DirectorModelConfig={modelId:string;instructions:string;maxOutputTokens:number;modelMaxOutputTokens:number;pricing:{inputPrice:number;outputPrice:number;cacheReadPrice?:number;cacheWritePrice?:number};contextLength:number;vision:boolean;liveReview?:boolean};
export type ModelProblem={code:'AGENT_NOT_CONFIGURED'|'MODEL_UNAVAILABLE'|'VISION_MODEL_REQUIRED'|'STRUCTURED_OUTPUT_MODEL_REQUIRED'|'DIRECTOR_CONTEXT_TOO_LARGE';message:string};

/** Plain names for the draft roles, as the AD sees them in Models & agents. */
export const draftRoleNames:Record<DirectorModelRole,string>={director:'Visual director',assembler:'Creative code',critic:'Creative review'};

/**
 * What a model must support to work in a live-draft role. The same rules decide the quote, a model switch between
 * requests and what Models & agents accepts, so a model that cannot work is never chosen silently.
 */
export function draftModelProblem(role:DirectorModelRole,model:CatalogModel|undefined,modelId:string|null|undefined):ModelProblem|undefined{
 const label=draftRoleNames[role];
 if(!modelId)return {code:'AGENT_NOT_CONFIGURED',message:`Choose a model for “${label}” in Models & agents.`};
 if(!model)return {code:'MODEL_UNAVAILABLE',message:`The model ${modelId} chosen for “${label}” is not available from the provider right now.`};
 if(model.outputModalities.length!==1||model.outputModalities[0]!=='text')return {code:'AGENT_NOT_CONFIGURED',message:`“${label}” needs a text model; ${model.name} returns ${model.outputModalities.join(', ')}.`};
 if(role!=='assembler'&&!model.inputModalities?.includes('image'))return {code:'VISION_MODEL_REQUIRED',message:`“${label}” must see pictures and rendered frames; ${model.name} cannot read images.`};
 if(!model.supportedParameters.includes('structured_outputs'))return {code:'STRUCTURED_OUTPUT_MODEL_REQUIRED',message:`“${label}” answers in a strict format; ${model.name} does not support structured outputs on the provider.`};
 const minContext=role==='critic'?32000:64000;
 if(model.contextLength<minContext)return {code:'DIRECTOR_CONTEXT_TOO_LARGE',message:`“${label}” needs a context of at least ${minContext/1000}k tokens; ${model.name} has ${model.contextLength}.`};
 return undefined;
}

/** The per-request configuration of a draft role for a model; instructions stay the role's frozen brief. */
export function draftModelConfig(role:DirectorModelRole,model:CatalogModel,instructions:string,extra:{liveReview?:boolean}={}):DirectorModelConfig{
 return {modelId:model.id,instructions,maxOutputTokens:Math.min(staticOutputCaps[role],model.maxOutput),modelMaxOutputTokens:model.maxOutput,pricing:{inputPrice:model.inputPrice,outputPrice:model.outputPrice,cacheReadPrice:model.cacheReadPrice,cacheWritePrice:model.cacheWritePrice},contextLength:model.contextLength,vision:model.inputModalities?.includes('image')??false,...(extra.liveReview?{liveReview:true}:{})};
}
