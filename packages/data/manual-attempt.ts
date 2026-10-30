import type {SupabaseClient} from '@supabase/supabase-js';
import {checked} from './shared-runtime';
/** A manual request keeps its original step ID; explicit queue retries have new attempt IDs. */
export async function manualAttempt(admin:SupabaseClient,tenant:string,runId:string,initialStep:string){
 const job=checked(await admin.from('studio_workflow_jobs').select('id,round_id,state,blocker,attempt_count').eq('tenant_id',tenant).eq('run_id',runId).eq('initial_step_id',initialStep).maybeSingle());
 if(!job)return {job:null,stepId:initialStep,pending:false,errorCode:null};
 const attempt=checked(await admin.from('studio_workflow_attempts').select('step_id,error_code').eq('job_id',job.id).order('attempt_no',{ascending:false}).limit(1).maybeSingle());
 return {job,stepId:attempt?.step_id??initialStep,pending:['queued','leased'].includes(job.state),errorCode:attempt?.error_code??job.blocker};
}
