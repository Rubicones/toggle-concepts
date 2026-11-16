// Admission audit (docs/reviews/2026-11-14-admission-audit.md): what the runner sends for a director-block request, and
// the database's admission rules for it, mirrored in one place so that a mismatch stops before anything is sent, with
// a plain reason. The rules mirror (as applied by every migration up to 20261114000100):
//  - app_private.reserve_step_before_creative (via studio_reserve_director_step / studio_reserve_step): run cap, step
//    cap, the frozen agent's model and instructions, the budget scope and checkpoint, the role's cumulative cap;
//  - app_private.guard_director_allowance (trigger on studio_agent_steps): directorRole -> agent role, the request
//    size cap of draft blocks, the block's per-role allowance (cost, requests, input and output tokens);
//  - app_private.guard_heavy_c2: a model3d step needs an approved designer block (or C2).
// The database stays authoritative; this is the same rule read first. Pure.
import type {TextSnapshot} from '../agents/text-provider';
import {draftRequestCap,designerRequestCap} from './request-size';
import {providerJsonSchema} from './provider-schema';
import {accountedTokens,freeRejection,type RoleAllowance,type AllowanceRole} from './money';
import {textRequestQuote,retryOutputLimit} from '../agents/text-quote';
import {cacheWriteRate} from '../agents/cache-usage';

/** guard_director_allowance's directorRole -> agent role (with 20261114000100's 'model'). */
export const DIRECTOR_AGENT_ROLE:Record<string,string>={director:'visual-direction',designer:'visual-direction',assembler:'creative-code',critic:'critic',resources:'image',model:'model3d'};
/** The allowance key a directorRole is held to in the block's estimates. */
export const allowanceKey=(directorRole:string)=>directorRole==='model'?'model3d':directorRole;
/** Roles held to a count and price only (no request size or token rules). */
const COUNTED_ONLY=new Set(['resources','model']);

export type FrozenAgent={role:string;model_id:string|null;instructions:string;step_cap_micro_usd:number;max_output_tokens?:number};
export type AdmissionUse={spent:number;inputs:number;outputs:number;requests:number};
export type AdmissionProblem={code:string;detail:string};
export type AdmissionArgs={
 runId:string;agentRole:string;model:string;reservation:number;
 snapshot:{instructions?:unknown;stepCapMicroUsd?:unknown;budgetScopeId?:unknown;campaignContext?:unknown;directorRole?:unknown;directorBlockId?:unknown;requestInputCap?:unknown;directorRawInputBound?:unknown;directorInputTokens?:unknown;maxOutputTokens?:unknown};
 agent:FrozenAgent|undefined;
 /** The run's C1 checkpoint id (studio_c1_checkpoints), or null when the run has none. */
 checkpointId:string|null;
 /** Local text requests are not held to the step caps (20261112000700). */
 localText:boolean;
 /** The role's cumulative spending in this run (all its steps), for the cumulative step cap. */
 roleSpent?:number;
 /** The block: whether this direction is a draft, its quoted designer cap, the role's allowance and what is used. */
 block?:{draft:boolean;designerRequestInputCap?:number;allowance:RoleAllowance|undefined;used:AdmissionUse;approved:boolean};
};
const num=(v:unknown)=>typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;

/** The first rule the request breaks, in plain words, or null when the database would admit it. */
export function directorAdmissionProblem(a:AdmissionArgs):AdmissionProblem|null{
 const s=a.snapshot,stepCap=num(s.stepCapMicroUsd),fail=(code:string,detail:string)=>({code,detail});
 if(!a.localText&&a.reservation>stepCap)return fail('STEP_CAP_REACHED',`the request may cost $${(a.reservation/1e6).toFixed(2)}, above its step cap.`);
 if(!a.agent)return fail('CHECKPOINT_CONFIG_MISMATCH',`the run has no ${a.agentRole} agent.`);
 if(a.agent.model_id!==a.model)return fail('CHECKPOINT_CONFIG_MISMATCH',`the request's model ${a.model} is not the ${a.agentRole} agent's (${a.agent.model_id??'none'}).`);
 if(a.checkpointId){
  if(s.budgetScopeId!==`budget-step-${a.runId}-${a.agentRole}`)return fail('CHECKPOINT_CONFIG_MISMATCH',`the request's budget scope is not the ${a.agentRole} agent's.`);
  const cp=(s.campaignContext as {checkpointId?:unknown}|undefined)?.checkpointId;if(cp!==a.checkpointId)return fail('CHECKPOINT_CONFIG_MISMATCH','the request names another checkpoint than the run\'s.');
 }
 if(s.instructions!==a.agent.instructions)return fail('CHECKPOINT_CONFIG_MISMATCH',`the request's instructions differ from the frozen ${a.agentRole} agent's.`);
 if(!Number.isFinite(stepCap)||stepCap<1||stepCap>a.agent.step_cap_micro_usd)return fail('CHECKPOINT_CONFIG_MISMATCH',`the request's step cap is outside the frozen ${a.agentRole} agent's.`);
 if(!a.localText&&a.reservation>a.agent.step_cap_micro_usd-(a.roleSpent??0))return fail('STEP_CAP_REACHED',`the ${a.agentRole} agent's cap for this run is used up.`);
 if(typeof s.directorBlockId!=='string')return null;
 const b=a.block,role=String(s.directorRole??'');if(!b)return null;
 if(!b.approved)return fail('DIRECTOR_APPROVAL_REQUIRED','the block is not approved and running.');
 if(DIRECTOR_AGENT_ROLE[role]!==a.agentRole)return fail('DIRECTOR_ROLE_MISMATCH',`the request's role ${role||'(none)'} does not run on the ${a.agentRole} agent.`);
 if(!COUNTED_ONLY.has(role)&&b.draft){
  const cap=num(s.requestInputCap),raw=num(s.directorRawInputBound);
  const capOk=cap===32768||cap===65536||role==='designer'&&cap>=32768&&cap<=(b.designerRequestInputCap??65536);
  if(!capOk||!(raw>=1&&raw<=cap))return fail('DRAFT_REQUEST_SIZE_CAP',`the request's size (${Number.isFinite(raw)?raw:'unknown'} of a ${Number.isFinite(cap)?cap:'missing'} cap) is outside the admitted request sizes.`);
 }
 const al=b.allowance;if(!al)return fail('DIRECTOR_ALLOWANCE_REQUIRED',`the block has no ${allowanceKey(role)} allowance for this direction.`);
 const u=b.used,input=num(s.directorInputTokens),output=num(s.maxOutputTokens);
 if(u.spent+a.reservation>al.maxCostMicroUsd)return fail('ROLE_ALLOWANCE_EXHAUSTED',`${role}: $${((u.spent+a.reservation)/1e6).toFixed(2)} would pass its approved $${(al.maxCostMicroUsd/1e6).toFixed(2)}.`);
 if(u.requests+1>al.requests)return fail('ROLE_ALLOWANCE_EXHAUSTED',`${role}: requests ${u.requests} of ${al.requests} are used.`);
 if(!COUNTED_ONLY.has(role)&&(u.inputs+(Number.isFinite(input)?input:0)>al.inputTokens||u.outputs+output>al.outputTokens||!Number.isFinite(output)))return fail('ROLE_ALLOWANCE_EXHAUSTED',`${role}: input ${u.inputs.toLocaleString('en-US')} + ${Number.isFinite(input)?input.toLocaleString('en-US'):'?'} of ${al.inputTokens.toLocaleString('en-US')}; output ${u.outputs.toLocaleString('en-US')} + ${Number.isFinite(output)?output.toLocaleString('en-US'):'?'} of ${al.outputTokens.toLocaleString('en-US')}.`);
 return null;
}

/** The snapshot of one director-block text request, exactly as the worker builds it before the allowance fields. */
export type DirectorRequestArgs={draft:boolean;blockId:string;directionId:string;iterationId:string;runId:string;role:string;agentRole:string;
 designerRequestInputCap?:number;config:{instructions:string;modelId:string;pricing:TextSnapshot['pricing'];contextLength:number};outputLimit:number;remainingMs:number;
 roleLine?:string;protocolInstructions:string;context:unknown;checkpointId:string;stepCapMicroUsd:number;responseSchema:{name:string;schema:Record<string,unknown>}|null};
export function directorRequestSnapshot(a:DirectorRequestArgs):TextSnapshot&{directorIterationId:string;modelId:string;budgetScopeId:string;stepCapMicroUsd:number}{
 const context=a.context as {contextText?:unknown}|null|undefined;
 return {...(a.draft?{cachePrompt:true,cacheSessionId:`${a.blockId}:${a.directionId}:${a.role}`,requestInputCap:a.role==='designer'&&a.designerRequestInputCap?Math.min(a.designerRequestInputCap,designerRequestCap(a.config.contextLength,a.outputLimit)):draftRequestCap(a.config.contextLength,a.outputLimit)}:{}),
  directorIterationId:a.iterationId,timeoutMs:a.draft?1800000:Math.min(1800000,a.remainingMs),instructions:a.config.instructions,...(a.roleLine?{roleInstructions:a.roleLine}:{}),protocolInstructions:a.protocolInstructions,modelId:a.config.modelId,maxOutputTokens:a.outputLimit,pricing:a.config.pricing,
  ...(typeof context?.contextText==='string'?{campaignContext:{checkpointId:a.checkpointId},contextText:context.contextText}:{campaignContext:{checkpointId:a.checkpointId,...a.context as object}}),
  budgetScopeId:`budget-step-${a.runId}-${a.agentRole}`,stepCapMicroUsd:a.stepCapMicroUsd,...(a.responseSchema?{outputFormat:'json_schema' as const,responseSchema:{name:a.responseSchema.name,schema:providerJsonSchema(a.responseSchema.schema) as Record<string,unknown>}}:{}),stream:true};
}
/** A critic request that its allowance cannot hold is skipped, not a stop: the review is optional (the end review was
 * already skipped this way; the hero review and the selection of ideas now are too). */
export const criticAllowanceUsed=(error:unknown)=>error instanceof Error&&error.message==='ROLE_ALLOWANCE_EXHAUSTED'&&String((error as Error&{detail?:string}).detail??'').startsWith('critic:');

/** The allowance fields of a director-block text request and what its role has used (apps/local-runner/director/
 * ledger.ts reads the rows and the block): refuses, as the database would, past the role's requests, input or output
 * tokens; a complete-answer role is never sent with a shortened answer allowance. Pure. */
export function directorAllowanceFields(rows:Parameters<typeof accountedTokens>[0][],allowance:RoleAllowance,args:{role:AllowanceRole;snapshot:TextSnapshot;prompt:string;visionCount:number;blockId:string;directionId:string}){
 const inputUsed=rows.reduce((n,r)=>n+accountedTokens(r).input,0),outputUsed=rows.reduce((n,r)=>n+accountedTokens(r).output,0),spent=rows.reduce((n,r)=>n+(['reserved','running','unknown'].includes(r.status)||r.cost_micro_usd===null?(r as {reserve_micro_usd?:number}).reserve_micro_usd??0:r.cost_micro_usd),0);
 const remainingOutput=allowance.outputTokens-outputUsed;
 const fullAnswer=args.role==='director'||args.role==='designer'||args.role==='assembler'&&['static_files_v1','static_tools_v1'].includes(args.snapshot.responseSchema?.name??'');
 if(fullAnswer&&remainingOutput<args.snapshot.maxOutputTokens)throw Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{detail:`${args.role}: output ${outputUsed.toLocaleString('en-US')} of ${allowance.outputTokens.toLocaleString('en-US')}; ${remainingOutput} output tokens remain; a complete request needs its priced ${args.snapshot.maxOutputTokens}-token answer allowance. No shortened request was sent.`});
 const snapshot={...args.snapshot,maxOutputTokens:fullAnswer?args.snapshot.maxOutputTokens:Math.min(args.snapshot.maxOutputTokens,remainingOutput)};
 const quoted=textRequestQuote(args.prompt,snapshot,'',args.visionCount);
 const billedBound=Math.ceil(quoted.inputTokenBound*(snapshot.pricing.inputPrice>0?cacheWriteRate(snapshot.pricing,snapshot.cachePrompt)/snapshot.pricing.inputPrice:1));
 const requests=rows.filter(r=>!freeRejection(r)).length;
 if(snapshot.maxOutputTokens<128||inputUsed+billedBound>allowance.inputTokens||requests>=allowance.requests)throw Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{detail:`${args.role}: billed input equivalents ${inputUsed.toLocaleString('en-US')} used + ${billedBound.toLocaleString('en-US')} reserved (${quoted.inputTokenBound.toLocaleString('en-US')} raw input bound, including cache-write pricing) of ${allowance.inputTokens.toLocaleString('en-US')}; output ${outputUsed.toLocaleString('en-US')} of ${allowance.outputTokens.toLocaleString('en-US')}; requests ${requests} of ${allowance.requests}`});
 return {snapshot:{...snapshot,directorBlockId:args.blockId,directorDirectionId:args.directionId,directorRole:args.role,directorInputTokens:billedBound,directorRawInputBound:quoted.inputTokenBound,directorVisionCount:args.visionCount},remainingMicroUsd:allowance.maxCostMicroUsd-spent,
  // What the admission check mirrors: the role's allowance and what is used of it.
  allowance,used:{spent,inputs:inputUsed,outputs:outputUsed,requests}};
}

/** A planning request as the runner sends it to studio_begin_workflow (apps/local-runner/workflow.ts): the job's frozen
 * snapshot with its parents' outputs, the model's price, and the agent's step cap and output limit. Pure. */
export function planningRequestSnapshot<T extends {maxOutputTokens:number}>(payload:T,upstream:{jobId:string;sha256:string;output:string}[],model:TextSnapshot['pricing']&{maxOutput:number},agent:{step_cap_micro_usd:number;max_output_tokens:number}){
 return {...payload,upstream,pricing:model,stepCapMicroUsd:agent.step_cap_micro_usd,maxOutputTokens:retryOutputLimit((payload as unknown as {previewProtocol?:string}).previewProtocol,payload.maxOutputTokens,agent.max_output_tokens,model.maxOutput)};
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);
/** The rules of studio_begin_workflow and its admission (workflow_admission_agent, reserve_step_before_creative) for
 * a planning request, mirrored for tests: the frozen fields equal the job's payload, the parents' outputs are the
 * dependencies', the role is the job key's, and the caps are within the frozen agent's. JSON comparison stands in for
 * jsonb equality (same key order as built), so this is a test mirror, not a runtime gate. */
export const PLANNING_JOB_ROLE:Record<string,string>={research:'research',strategy:'strategy',variants:'variants',script:'script',localization:'localization','asset-plan':'visual-direction'};
export function planningAdmissionProblem(a:{runId:string;jobKey:string;role:string;payload:Record<string,unknown>;sent:Record<string,unknown>;refs:unknown[];agent:FrozenAgent&{max_output_tokens:number};checkpointId:string|null}):AdmissionProblem|null{
 const p=a.payload,s=a.sent,fail=(code:string,detail:string)=>({code,detail});
 if(!same(s.upstream,a.refs))return fail('STALE_WORKFLOW','the parents\' outputs are not the dependencies\'.');
 for(const key of ['campaignContext','instructions','budgetScopeId','brandSheetImages'])if(!same(s[key],p[key]))return fail('STALE_WORKFLOW',`${key} differs from the job's frozen snapshot.`);
 const expected=PLANNING_JOB_ROLE[a.jobKey];if(expected&&expected!==a.role)return fail('CHECKPOINT_CONFIG_MISMATCH',`job ${a.jobKey} runs on ${expected}, not ${a.role}.`);
 const cap=num(s.stepCapMicroUsd),out=num(s.maxOutputTokens);
 if(!(cap>=1&&cap<=a.agent.step_cap_micro_usd)||!(out>=64&&out<=a.agent.max_output_tokens))return fail('CHECKPOINT_CONFIG_MISMATCH','the step cap or output limit is outside the frozen agent\'s.');
 return directorAdmissionProblem({runId:a.runId,agentRole:a.role,model:a.agent.model_id??'',reservation:1,snapshot:s,agent:a.agent,checkpointId:a.checkpointId,localText:true});
}
