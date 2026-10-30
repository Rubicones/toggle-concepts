import {createHash,randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {planningRecovery} from '../../packages/contracts/agent-output';
import {checked} from '../../packages/data/shared-runtime';
/** Only metadata and known pre-submission configuration faults; no paid retry or human resume. */
export async function recoverPlanningFailure(admin:SupabaseClient,control:{run_id:string;lease_token:number;created_by:string},job:{id:string;role:string;blocker:string|null;input_hash:string;config_hash:string;active_attempt:string|null}){
 if(!['INVALID_OUTPUT_SCHEMA','CHECKPOINT_CONFIG_MISMATCH'].includes(job.blocker??''))return false;
 const version=await admin.rpc('studio_technical_recovery_version');if(version.error||version.data!=='technical-recovery@1')return false;
 if(job.blocker==='CHECKPOINT_CONFIG_MISMATCH'){
  const result=await admin.rpc('studio_recover_running_planning_config',{target_job:job.id,control_token:control.lease_token,request_key:randomUUID()});checked(result);return true;
 }
 if(!job.active_attempt)return false;
 const attempt=checked(await admin.from('studio_workflow_attempts').select('step_id,state').eq('id',job.active_attempt).eq('job_id',job.id).maybeSingle());if(attempt?.state!=='failed'||!attempt.step_id)return false;
 const step=checked(await admin.from('studio_agent_steps').select('id,output,status,error_code,usage,cost_micro_usd,reserve_micro_usd,config_snapshot').eq('id',attempt.step_id).eq('run_id',control.run_id).maybeSingle());
 if(!step?.output||step.status!=='failed'||step.error_code!=='INVALID_OUTPUT_SCHEMA'||step.usage?._studio?.finishReason!=='stop'||step.cost_micro_usd===null||step.cost_micro_usd<0||step.cost_micro_usd>step.reserve_micro_usd)return false;
 const manifest=step.config_snapshot.campaignContext?.variantManifest;if(!manifest)return false;
 let prepared;try{prepared=planningRecovery(step.output,job.role,manifest);}catch{return false;}
 const result=await admin.rpc('studio_recover_running_workflow_output',{target_job:job.id,target_step:step.id,expected_input:job.input_hash,expected_config:job.config_hash,original_sha:createHash('sha256').update(step.output).digest('hex'),result_text:prepared.text,acting_user:control.created_by,control_token:control.lease_token});checked(result);return true;
}
