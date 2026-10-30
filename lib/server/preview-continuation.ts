import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {modelCatalog} from '@/packages/agents/catalog';
import {textRequestQuote,retryOutputLimit} from '@/packages/agents/text-quote';
import {countedAgentSpend,continuationCaps,typicalRequestCost,type PreviewContinuationQuote} from '@/packages/contracts/preview-continuation';
import {PREVIEW_PROTOCOL} from '@/packages/contracts/preview-proposal';
import type {AgentSetting} from '@/packages/contracts/shared';
import {checked} from './studio';
/** Database feature levels: 23 = priced continuation, 24 = protocol replacement. */
export const PREVIEW_CONTINUE_VERSION=24;
type QuoteRun={id:string;status:string;closure_reason?:string|null;cap_micro_usd:number;charged_micro_usd:number;reserved_micro_usd:number};
export type ReplacementRequest={model:string;prompt:string;snapshot:Record<string,unknown>&{stepCapMicroUsd:number};reservation:number};
export type PreviewContinuationPlan={quote:PreviewContinuationQuote;request:ReplacementRequest|null};
/**
 * The single priced next step for a stopped preview request: provider errors,
 * unconfirmed responses, budget stops and exhausted automatic attempts alike.
 * A request saved with an outdated wire protocol is never resent: the next step is a
 * new request built with the current protocol (`mode: 'replace'`).
 * Null when something else must happen first (a review, a pending request).
 */
export async function previewContinuationPlan(admin:SupabaseClient,tenant:string,run:QuoteRun,control:{stage:string;status:string;blocker?:string|null;cursor:Record<string,unknown>}|null,agents:AgentSetting[],version:number,buildRequest:()=>Promise<Omit<ReplacementRequest,'snapshot'>&{snapshot:Record<string,unknown>}>):Promise<PreviewContinuationPlan|null>{
 const reopenable=run.status==='closed'&&run.closure_reason==='provider_status_unknown';
 if(run.status!=='active'&&!reopenable)return null;
 if(control?.stage!=='assembly'||control.status==='review'||!control.cursor.assemblyStepId||control.cursor.assemblyImportedVersion)return null;
 if(control.status==='paused'&&(control.cursor.stoppedFrom as {status?:string}|undefined)?.status==='review')return null;
 const job=checked(await admin.from('studio_workflow_jobs').select('*').eq('run_id',run.id).eq('tenant_id',tenant).eq('initial_step_id',control.cursor.assemblyStepId).maybeSingle());
 if(!job||job.role!=='creative-code')return null;
 const fromProtocol:string|null=job.payload.snapshot.previewProtocol??null,mode=fromProtocol===PREVIEW_PROTOCOL?'retry' as const:'replace' as const;
 const stopped=job.state==='failed'||job.state==='blocked'&&job.blocker==='provider_status_unknown'||mode==='replace'&&job.state==='succeeded'&&control.blocker==='INVALID_PROPOSAL';
 if(!stopped||mode==='retry'&&job.attempt_count>=12)return null;
 const attempt=checked(await admin.from('studio_workflow_attempts').select('id,state,step_id,attempt_no').eq('job_id',job.id).order('attempt_no',{ascending:false}).limit(1).maybeSingle());
 if(!attempt||attempt.id!==job.active_attempt||!['failed','unknown',...(mode==='replace'?['succeeded']:[])].includes(attempt.state))return null;
 const steps=checked(await admin.from('studio_agent_steps').select('id,status,cost_micro_usd,reserve_micro_usd').eq('run_id',run.id).eq('tenant_id',tenant).eq('role','creative-code'))??[];
 const source=attempt.step_id?steps.find(s=>s.id===attempt.step_id):null;
 if(attempt.step_id&&(!source||!['failed','unknown',...(mode==='replace'?['succeeded']:[])].includes(source.status)))return null;
 if(source?.status==='unknown'?!reopenable:run.status!=='active')return null;
 const agent=agents.find(a=>a.role==='creative-code'),model=(await modelCatalog()).find(m=>m.id===agent?.model_id);if(!agent||!model)throw new Error('MODEL_UNAVAILABLE');
 let reservation:number,inputTokenBound:number,maxOutputTokens:number,request:ReplacementRequest|null=null;
 if(mode==='retry'){
  const snapshot={...job.payload.snapshot,upstream:[],pricing:model,stepCapMicroUsd:agent.step_cap_micro_usd,maxOutputTokens:retryOutputLimit(job.payload.snapshot.previewProtocol,job.payload.snapshot.maxOutputTokens,agent.max_output_tokens,model.maxOutput)};
  const quote=textRequestQuote(job.payload.prompt,snapshot);if(quote.inputTokenBound+snapshot.maxOutputTokens>model.contextLength)throw new Error('PROMPT_TOO_LONG');
  reservation=quote.reservationMicroUsd;inputTokenBound=quote.inputTokenBound;maxOutputTokens=snapshot.maxOutputTokens;
 }else{
  const built=await buildRequest();if(built.model!==model.id)throw new Error('MODEL_UNAVAILABLE');
  reservation=built.reservation;maxOutputTokens=Number(built.snapshot.maxOutputTokens);inputTokenBound=textRequestQuote(built.prompt,built.snapshot as never).inputTokenBound;
  request={...built,snapshot:{...built.snapshot,stepCapMicroUsd:0}};
 }
 const spent=countedAgentSpend(steps),caps=continuationCaps(run,agent.step_cap_micro_usd,spent,reservation);
 if(request)request.snapshot.stepCapMicroUsd=caps.agentCapMicroUsd;
 // Confirmed earlier charges for the same model and wire protocol approximate a typical request.
 // Without history: the admission bound counts one token per input byte; real prompts average ~3+ bytes per token.
 const history=checked(await admin.from('studio_agent_steps').select('cost_micro_usd,reserve_micro_usd').eq('tenant_id',tenant).eq('role','creative-code').eq('model_id',model.id).eq('config_snapshot->>previewProtocol',PREVIEW_PROTOCOL).gt('cost_micro_usd',0).order('created_at',{ascending:false}).limit(15))??[];
 const typical=typicalRequestCost(history.filter(h=>Number(h.cost_micro_usd)<=Number(h.reserve_micro_usd)).map(h=>Number(h.cost_micro_usd)),inputTokenBound/3*model.inputPrice*1000000,maxOutputTokens*model.outputPrice*1000000,reservation);
 const probe=await admin.rpc('studio_preview_continue_version'),level=probe.error?0:Number(probe.data);
 const quoteId=createHash('sha256').update(JSON.stringify([mode,job.id,attempt.id,job.input_hash,job.config_hash,version,model.id,model.inputPrice,model.outputPrice,maxOutputTokens,reservation,caps.runCapMicroUsd,caps.agentCapMicroUsd,request?.snapshot.draftInputHash??null])).digest('hex');
 return {request,quote:{mode,fromProtocol,jobId:job.id,attemptId:attempt.id,quoteId,expectedVersion:version,reservationMicroUsd:reservation,...typical,...caps,currentRunCapMicroUsd:Number(run.cap_micro_usd),currentAgentCapMicroUsd:Number(agent.step_cap_micro_usd),agentSpentMicroUsd:spent,needsLimitIncrease:caps.runCapMicroUsd>Number(run.cap_micro_usd)||caps.agentCapMicroUsd>Number(agent.step_cap_micro_usd),nextAttempt:mode==='retry'?Number(attempt.attempt_no)+1:1,maxOutputTokens,model:model.id,ready:level>=(mode==='retry'?23:PREVIEW_CONTINUE_VERSION)}};
}
