import {previewContinuationCommand,type PreviewContinuationQuote} from './preview-continuation';
import {runLimitChangeSchema,type RunLimits} from './run-limits';
import {z} from 'zod';
import type {SharedRun} from './shared';
import type {WorkflowJob} from './orchestration';
export const guidedRunCommand=z.discriminatedUnion('action',[
 previewContinuationCommand,
 z.strictObject({action:z.literal('retryAssembly'),stepId:z.uuid(),requestId:z.uuid(),confirmPaidRetry:z.literal(true)}),
 z.strictObject({action:z.literal('start')}),
 z.strictObject({action:z.literal('wake')}),
 z.strictObject({action:z.literal('stop')}),
 z.strictObject({action:z.literal('restart'),confirm:z.literal(true)}),
 z.strictObject({action:z.literal('recoverWorkflowResult'),jobId:z.uuid(),stepId:z.uuid()}),
 z.strictObject({action:z.literal('recoverPlanningConfig'),jobId:z.uuid(),requestId:z.uuid()}),
 runLimitChangeSchema.extend({action:z.literal('limits')}),
 z.strictObject({action:z.literal('recoverBrandResult'),stepId:z.uuid(),expectedVersion:z.number().int().positive()}),
 z.strictObject({action:z.enum(['pause','resume']),expectedVersion:z.number().int().positive()}),
 z.strictObject({action:z.literal('change'),expectedVersion:z.number().int().positive(),requestId:z.uuid(),role:z.enum(['brand-kit','research','strategy','variants','script','localization','visual-direction']),note:z.string().trim().min(1).max(4000)}),
 z.strictObject({action:z.literal('approveBrand'),reviewerName:z.string().trim().min(1).max(160),notes:z.string().max(2000),confirm:z.literal(true),allowDraftFontFallback:z.boolean(),fontRights:z.string().trim().max(2000).optional()}),
 z.strictObject({action:z.literal('confirmDraftInputs'),expectedPlanVersion:z.number().int().positive(),confirm:z.literal(true)}),
]);
export type GuidedRunControl={run_id:string;campaign_id:string;tenant_id:string;c1_id:string;brandbook_id:string;stage:'brand'|'planning'|'assembly'|'draft_review'|'client_review'|'finals';status:'running'|'review'|'blocked'|'paused'|'complete';cursor:Record<string,unknown>;blocker:string|null;version:number;lease_token:number;created_by:string;created_at:string;updated_at:string};
export type GuidedRunView={planningConfigRecovery?:{jobId:string;role:string;ready:boolean}|null;directorActive?:boolean;directorReady?:boolean;creativeWaits?:Record<string,string>;creative?:import('./creative-drafts').CreativeProgressData|null;creativeReadiness?:import('../brand/resolve-system').BrandResolution|null;budget?:import('./run-budget').RunBudget|null;assemblyContinuation?:PreviewContinuationQuote|null;continuationError?:string|null;limits?:RunLimits;assemblyRetry?:{stepId:string;attempts:number;ready:boolean;kind?:'retry'|'correct'}|null;uncertainMicroUsd?:number;failureStep?:{variantIdentityRecovery?:boolean;recoveryReady:boolean;canRecover:boolean;diagnostics:string[];jobId:string;id:string;role:string;model:string;status:string;code:string|null;output:string|null;cost:number|null;maxOutputTokens:number;message:string}|null;brandResult?:import('../brand/proposal-diagnostic').BrandResult|null;schemaReady:boolean;workerOnline:boolean;brief:{id:string;orderedVariants:number;locales:string[];reviewerName:string}|null;book:{id:string;version_no:number;findings:number}|null;run:SharedRun|null;control:GuidedRunControl|null;round:{id:string;phase:string;blocker:string|null;status:string}|null;jobs:WorkflowJob[];changes:{id:string;role:string;note:string;state:string;created_at:string}[];steps:{id:string;role:string;status:string;error_code:string|null;cost_micro_usd:number|null;output:string|null}[]};
export const runMilestones=[
 {id:'brand',label:'Brand alignment',description:'Turn your submitted material into campaign rules.'},
 {id:'strategy',label:'Strategy',description:'Find the creative direction and supported message.'},
 {id:'script',label:'Scenarios',description:'Develop the ordered stories, hooks and scene beats.'},
 {id:'visuals',label:'Visual direction',description:'Develop copy, imagery and source requirements.'},
 {id:'assembly',label:'Build previews',description:'Build one adaptive creative per direction for your review.'},
 {id:'review',label:'Review drafts',description:'Review the actual creatives and choose directions.'},
 {id:'finals',label:'Final production',description:'Prepare ordered outputs after draft acceptance.'},
] as const;
/** Build/review is one draft workspace. Earlier planning remains inspectable without exposing a premature start. */
export function draftWorkspaceAccess(view:GuidedRunView){
 const stage=view.control?.stage,planningReady=['research','strategy','variants','script','localization','asset-plan'].every(key=>view.jobs.some(j=>j.job_key===key&&j.state==='succeeded'));
 const draftStage=['assembly','draft_review','client_review','finals'].includes(stage??'');
 return {show:!!view.directorReady&&(!!view.directorActive||draftStage),canStart:!!view.directorReady&&planningReady&&view.run?.status==='active'&&['assembly','draft_review'].includes(stage??''),legacy:!view.directorReady};
}
export function guidedMilestoneStates(view:GuidedRunView){
 const jobs=view.jobs.filter(j=>!j.job_key.includes('.history.')),done=(key:string)=>jobs.some(j=>j.job_key===key&&j.state==='succeeded');
 const stage=view.control?.stage,states:Record<string,'waiting'|'active'|'review'|'done'|'blocked'>={};
 states.brand=!view.control?'waiting':stage==='brand'?(view.control.status==='review'||view.brandResult?.imported)?'review':view.control.status==='blocked'?'blocked':'active':'done';
 states.strategy=done('research')&&done('strategy')&&done('variants')?'done':stage==='planning'?'active':'waiting';
 states.script=done('script')?'done':done('variants')?'active':'waiting';
 states.visuals=done('localization')&&done('asset-plan')?'done':done('script')?'active':'waiting';
 states.assembly=['draft_review','client_review','finals'].includes(stage??'')?'done':stage==='assembly'?'active':'waiting';
 states.review=stage==='finals'?'done':stage==='draft_review'||stage==='client_review'?'review':'waiting';
 states.finals=stage==='finals'?'active':'waiting';
 if(view.control?.status==='blocked'&&stage!=='brand'){const current=Object.keys(states).find(k=>states[k]==='active');if(current)states[current]='blocked';}
 return states;
}
export function runAttention(code:string|null|undefined){
 if(!code)return null;
 if(code==='CHECKPOINT_CONFIG_MISMATCH')return {title:'Planning and draft settings are out of sync',detail:'The saved planning request needs its original configuration. Completed work is retained; use the planning recovery action below.'};
 if(/RUN_CAP|STEP_CAP|budget/.test(code))return {title:'The next step needs more budget',detail:'Saved work is safe. The next request must fit the remaining run and agent allowances.'};
 if(/UNKNOWN|unknown|UNRESOLVED/.test(code))return {title:'A provider receipt needs checking',detail:'Work is paused to avoid charging for the same request twice. Check the receipt before continuing.'};
 if(code==='OUTPUT_TOKEN_LIMIT')return {title:'The response reached its output limit',detail:'The agent ran out of space before it finished. Review the saved response below, raise the output allowance, then Continue anyway to authorize a new paid attempt. Incomplete output is not accepted.'};
 if(/TOKEN|OUTPUT|SCHEMA|INVALID.*PROPOSAL|INVALID.*RESPONSE/.test(code))return {title:'The saved response could not be applied',detail:'Review the result and the exact checks below. Saved responses can be recovered without another AI charge; nothing is retried automatically.'};
 if(code==='ASSETS_REQUIRED')return {title:'Add the product and logo images',detail:'Upload the actual product screenshot or photo and approved logo below. The run will continue once they are ready.'};
 if(code==='FINAL_PRODUCTION_UNAVAILABLE')return {title:'Final production is not connected yet',detail:'Your reviewed drafts and scope are saved. This build cannot automate final delivery yet.'};
 if(code==='LOCAL_COMPILE_REVIEW')return {title:'A preview needs adjustment',detail:'The local checks found an issue. Review the preview details or ask the agent to revise the layout.'};
 return {title:'This step needs your attention',detail:'Your inputs and completed work are saved. Use the change box to tell the agent what to adjust, or inspect technical details.'};
}
