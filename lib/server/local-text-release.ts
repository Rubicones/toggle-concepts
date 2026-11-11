import type {SupabaseClient} from '@supabase/supabase-js';
/** Roles whose requests go to OpenRouter even in Local mode: their receipts are genuine and still need reconciliation. */
export const MEDIA_ROLES=['image','video','model3d'];
type StepLike={run_id:string;role:string;provider_id:string|null};
/** Runs (of the given ids) whose text requests run through Local Claude. Before the Local schema: none. */
export async function localTextRuns(admin:SupabaseClient,runIds:string[]):Promise<Set<string>>{
 const ids=[...new Set(runIds)];if(!ids.length)return new Set();
 const rows=await admin.from('studio_text_executions').select('scope_id').eq('scope_kind','run').eq('mode','local_claude').in('scope_id',ids);
 return new Set(rows.error?[]:(rows.data??[]).map(r=>r.scope_id as string));
}
/** A Local Claude text step: no OpenRouter receipt can exist for it (migration 20261111000100, app_private.local_text_step). */
export const isLocalTextStep=(step:StepLike,localRuns:Set<string>)=>localRuns.has(step.run_id)&&!MEDIA_ROLES.includes(step.role)&&!step.provider_id;
/**
 * Before the AD continues a stopped direction: close the run's Local text steps that an earlier runner session left
 * open or that a sweep marked unknown. They cost no money; each stays counted as a request. A step still held by a live
 * lease, an OpenRouter step or a database without the migration is left as it is (the normal receipt rules apply).
 */
export async function releaseLocalTextSteps(admin:SupabaseClient,runId:string):Promise<number>{
 if(!(await localTextRuns(admin,[runId])).has(runId))return 0;
 const rows=await admin.from('studio_agent_steps').select('id,run_id,role,provider_id').eq('run_id',runId).in('status',['reserved','running','unknown']).is('cost_micro_usd',null);
 if(rows.error)throw new Error(rows.error.message);
 let released=0;
 for(const step of rows.data??[]){
  if(!isLocalTextStep(step,new Set([runId])))continue;
  const result=await admin.rpc('studio_release_local_text_step',{target_step:step.id});
  if(result.error){if(['PGRST202','42883'].includes(result.error.code??'')||/LOCAL_REQUEST_LIVE|NOT_LOCAL_TEXT_STEP/.test(result.error.message))continue;throw new Error(result.error.message);}
  if(result.data===true)released++;
 }
 return released;
}
