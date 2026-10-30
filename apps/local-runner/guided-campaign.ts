// Durable local coordinator. Provider work stays in the existing fenced queue.
import {adminClient,checked,sharedTenant} from '../../packages/data/shared-runtime';
import type {GuidedRunControl} from '../../packages/contracts/guided-run';
import type {BrandWorkspaceRecord} from '../../packages/contracts/brand-kit';
import {canonicalJson} from '../../packages/contracts/common';
import {publishStudioChange} from '../../packages/data/studio-changes';
import {manualAttempt} from '../../packages/data/manual-attempt';
import {recoverPlanningFailure} from './planning-recovery';
class RunFailure extends Error{constructor(code:string,public detail?:string){super(code);}}
async function local<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const base=new URL(process.env.NEXT_PUBLIC_APP_URL??'http://127.0.0.1:3100');
 if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new RunFailure('LOCAL_DEVICE_REQUIRED');
 let response:Response;try{response=await fetch(new URL(path,base),{method,headers:{Origin:base.origin,...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});}catch{throw new RunFailure('LOCAL_API_UNAVAILABLE');}
 let value;try{value=await response.json();}catch{throw new RunFailure('LOCAL_API_UNAVAILABLE');}
 if(!response.ok)throw new RunFailure(typeof value.code==='string'?value.code:'LOCAL_API_UNAVAILABLE',typeof value.message==='string'?value.message.slice(0,500):undefined);
 return value;
}
const planningKeys=['research','strategy','variants','script','localization','asset-plan'];
export async function processGuidedCampaign():Promise<boolean>{
 const admin=adminClient(),ready=await admin.from('studio_campaign_run_controls').select('run_id').limit(0);if(ready.error)return false;
 const control=checked(await admin.rpc('studio_claim_guided_run',{target_tenant:sharedTenant})) as GuidedRunControl|null;if(!control?.run_id)return false;
 const cursor=structuredClone(control.cursor),base=`/api/studio/campaigns/${control.campaign_id}`;
 const finish=async(stage:GuidedRunControl['stage']=control.stage,status:GuidedRunControl['status']='running',failure:string|null=null)=>{
  const changed=stage!==control.stage||status!==control.status||failure!==control.blocker||canonicalJson(cursor)!==canonicalJson(control.cursor);
  // Use the fenced RPC even for scheduling-only ticks: service_role has no
  // direct UPDATE grant on this table. Quiet ticks must not publish UI events.
  const result=checked(await admin.rpc('studio_finish_guided_tick',{target_run:control.run_id,token:control.lease_token,next_stage:stage,next_status:status,next_cursor:cursor,failure}));
  if(result&&changed)await publishStudioChange().catch(()=>{});
  return result;
 };
 const step=async(id:unknown)=>typeof id==='string'?checked(await admin.from('studio_agent_steps').select('id,status,output,error_code').eq('id',id).eq('run_id',control.run_id).eq('tenant_id',sharedTenant).maybeSingle()):null;
 try{
  const run=checked(await admin.from('studio_runs').select('status,closure_reason').eq('id',control.run_id).eq('tenant_id',sharedTenant).single());
  if(run?.status!=='active'){await finish(control.stage,'paused',run?.closure_reason??'RUN_NOT_ACTIVE');return true;}
  if(cursor.changeRequestId){
   const change=checked(await admin.from('studio_run_change_requests').select('*').eq('id',cursor.changeRequestId).eq('run_id',control.run_id).single());
   if(change.role==='brand-kit'){
    const current=await step(cursor.brandStepId);if(current&&['reserved','running'].includes(current.status)){await finish();return true;}
    if(cursor.brandRequestId!==change.id){cursor.brandRequestId=change.id;cursor.brandStepId=null;cursor.brandPreparedVersion=null;cursor.brandCorrection=change.note;}
    checked(await admin.rpc('studio_mark_run_change',{target_change:change.id,next_state:'applied'}));delete cursor.changeRequestId;await finish('brand');return true;
   }
   const applied=checked(await admin.rpc('studio_apply_run_change',{target_change:change.id}));
   if(applied||change.state==='applied'){delete cursor.changeRequestId;cursor.assemblyStepId=null;cursor.assemblyPreparedVersion=null;cursor.assemblyImportedVersion=null;cursor.awaitingCompile=false;cursor.assemblyRequestId=change.id;await finish('planning');}else await finish();return true;
  }
  if(control.stage==='brand'){
   // A pending provider call cannot change the kit. Read only its small status
   // until it finishes instead of downloading the entire kit on every tick.
   if(cursor.brandStepId){const pending=await step(cursor.brandStepId);if(!pending||['reserved','running'].includes(pending.status)){await finish();return true;}}
   const kit=await local<BrandWorkspaceRecord>(base+'/brand-kit');
   if(kit.reviews.some(r=>r.decision==='accepted'&&r.round_no===(kit.draft?.round_no??1))){await local('/api/studio/workflow','POST',{action:'start',runId:control.run_id});await finish('planning');return true;}
   if(!cursor.brandPreparedVersion){
    const imported=await local<{version:number}>(base+'/brand-kit','POST',{action:'importBrandbook',expectedVersion:kit.draft?.version??0,submissionId:control.brandbook_id});
    cursor.brandPreparedVersion=imported.version;
    cursor.brandPrompt='Prepare the complete campaign Brand Kit using the imported findings and fixed C1. Keep the source citations. Resolve unambiguous palette/font candidates into the required campaign rules. Propose missing creative rules within the supplied boundaries; leave missing factual permissions explicit. Rules already filled from the brandbook are kept automatically: do not repeat them. Return exactly the required brandKitProposal envelope with only the required keys that are missing or empty, plus essential additions (at most 12 rules). Keep each value under 200 characters. Never claim AD acceptance or font-license verification.'+(cursor.brandCorrection?` AD change request: ${cursor.brandCorrection}`:'');
    await finish();return true;
   }
   if(!cursor.brandStepId){const result=await local<{id:string}>(`/api/studio/runs/${control.run_id}/steps`,'POST',{role:'brand-kit',prompt:cursor.brandPrompt,requestId:cursor.brandRequestId,brandDraftVersion:cursor.brandPreparedVersion});cursor.brandStepId=result.id;await finish();return true;}
   const result=await step(cursor.brandStepId);if(!result||['reserved','running'].includes(result.status)){await finish();return true;}
   if(result.status!=='succeeded')throw new RunFailure(result.error_code??'INVALID_BRAND_PROPOSAL');
   if(kit.draft?.payload.proposalStepId!==result.id)await local(base+'/brand-kit','POST',{action:'import',expectedVersion:cursor.brandPreparedVersion,stepId:result.id});
   await finish('brand','review');return true;
  }
  if(control.stage==='planning'){
   const round=checked(await admin.from('studio_workflow_rounds').select('id,blocker,status').eq('run_id',control.run_id).eq('kind','draft').order('round_no',{ascending:false}).limit(1).maybeSingle());
   if(!round){await local('/api/studio/workflow','POST',{action:'start',runId:control.run_id});await finish();return true;}
   const jobs=checked(await admin.from('studio_workflow_jobs').select('id,role,job_key,state,blocker,input_hash,config_hash,active_attempt').eq('round_id',round.id))??[];
   if(planningKeys.every(key=>jobs.some(j=>j.job_key===key&&j.state==='succeeded'))){await finish('assembly');return true;}
   const failed=jobs.find(j=>planningKeys.includes(j.job_key)&&['failed','blocked'].includes(j.state));
   if(failed){if(await recoverPlanningFailure(admin,control,failed)){
    // Config recovery deliberately releases the old lease; output recovery retains it.
    // Either way the next coordinator tick advances the existing queue, never a new paid retry.
    if(failed.blocker!=='CHECKPOINT_CONFIG_MISMATCH')await finish();return true;
   }throw new RunFailure(failed.blocker??round.blocker??'AGENT_INPUT_BLOCKED');}
   await finish();return true;
  }
  if(control.stage==='assembly'){
   // Settle any admitted historical request before switching the run to M07b.
   if(cursor.assemblyStepId){const prior=await manualAttempt(admin,sharedTenant,control.run_id,String(cursor.assemblyStepId));if(prior.pending){await finish();return true;}if(prior.job?.blocker==='provider_status_unknown'){await finish('assembly','blocked','UNRESOLVED_PROVIDER_RECEIPT');return true;}}
   const result=await local<{state?:string;batchId?:string;code?:string;needsPrice?:boolean;questions?:unknown[]}>(base+'/creative','POST',{action:'tick'});
   if(result.state==='complete'){cursor.batchId=result.batchId;await finish('draft_review','review');}
   else if(result.state==='review'){cursor.creativeQuestions=result.questions;await finish('assembly','review',result.needsPrice?null:'CREATIVE_REVIEW_REQUIRED');}
   else if(result.state==='blocked')await finish('assembly','blocked',result.code??'CREATIVE_BLOCKED');
   else await finish();return true;
  }
  if(control.stage==='draft_review'||control.stage==='client_review'){
   const round=checked(await admin.from('studio_workflow_rounds').select('id,phase,status,blocker').eq('run_id',control.run_id).eq('kind','draft').order('round_no',{ascending:false}).limit(1).single());
   if(round?.phase==='final_in_progress'){await finish('finals','blocked','FINAL_PRODUCTION_UNAVAILABLE');return true;}
   if(round?.phase==='awaiting_client_drafts'){await finish('client_review','review');return true;}
   if(control.stage==='draft_review'&&round?.phase==='ready_for_draft_assembly'){
    const result=await local<{state?:string;batchId?:string;needsPrice?:boolean;questions?:unknown[]}>(base+'/creative','POST',{action:'tick'});
    if(result.state==='review'){delete cursor.batchId;cursor.creativeQuestions=result.questions;await finish('assembly','review',result.needsPrice?null:'CREATIVE_REVIEW_REQUIRED');return true;}
    if(result.state==='running'){delete cursor.batchId;await finish('assembly');return true;}
   }
   await finish(control.stage,'review');return true;
  }
  if(control.stage==='finals'){await finish('finals','blocked','FINAL_PRODUCTION_UNAVAILABLE');return true;}
  await finish(control.stage,'review');return true;
 }catch(error){
  let code=error instanceof RunFailure?error.message:'RUN_COORDINATOR_FAILED';
  // Missing product images use the existing upload-and-continue path.
  if(code==='PRODUCT_MEDIA_REQUIRED')code='ASSETS_REQUIRED';
  // Keep the exact reason so the run page can show it instead of a generic notice.
  cursor.lastError={code,message:error instanceof RunFailure?error.detail??null:error instanceof Error?error.message.slice(0,500):null,stage:control.stage,at:new Date().toISOString()};
  await finish(control.stage,'blocked',code);return true;}
}
