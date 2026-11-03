import type {SupabaseClient} from '@supabase/supabase-js';
import type {AgentSetting} from '../contracts/shared';
import {applyRunLimits} from '../contracts/run-limits';
const missing=(code?:string)=>['42P01','PGRST205','PGRST204'].includes(code??'');
/**
 * The model of every role comes from Models & agents (studio_agents) at the moment a request is admitted, so steps
 * that have not started follow the tab. Instructions and limits stay as frozen for the run (C1 snapshot, audited run
 * limits and, for the draft director roles, their overrides). Requests already reserved or submitted keep the model
 * recorded on their step; callers that replay one must use that step's model, never this one.
 * Mirrors app_private.effective_run_agent / frozen_planning_agent (migration 20261101000200).
 */
export async function tabModels(admin:SupabaseClient,runId:string):Promise<Map<string,string>>{
 // Until the database admits by the same rule (migration 20261101000200), keep the frozen run models.
 const version=await admin.rpc('studio_agent_models_version');if(version.error||version.data!=='agents-tab@1')return new Map();
 const run=await admin.from('studio_runs').select('tenant_id').eq('id',runId).maybeSingle();
 if(run.error&&!missing(run.error.code))throw new Error(run.error.message);
 if(!run.data?.tenant_id)return new Map();
 const rows=await admin.from('studio_agents').select('role,model_id').eq('tenant_id',run.data.tenant_id);
 if(rows.error&&!missing(rows.error.code))throw new Error(rows.error.message);
 return new Map(((rows.data??[]) as {role:string;model_id:string|null}[]).filter(r=>r.model_id).map(r=>[r.role,r.model_id!]));
}
const withTabModels=(agents:AgentSetting[],models:Map<string,string>)=>agents.map(a=>models.has(a.role)?{...a,model_id:models.get(a.role)!}:a);
/** C1 agents plus audited limits (and director overrides unless excluded), with the current Models & agents model. */
export async function effectiveRunAgents(admin:SupabaseClient,run:{id:string;config_snapshot:AgentSetting[]},options:{directorOverrides?:boolean}={}){
 const models=await tabModels(admin,run.id);
 const result=await admin.from('studio_run_agent_limits').select('role,max_output_tokens,cap_micro_usd').eq('run_id',run.id);
 if(result.error&&!missing(result.error.code))throw new Error(result.error.message);
 if(options.directorOverrides===false)return withTabModels(result.error?run.config_snapshot:applyRunLimits(run.config_snapshot,result.data??[]),models);
 const overrides=await admin.from('studio_run_agent_overrides').select('role,model_id,instructions').eq('run_id',run.id);
 if(overrides.error&&!missing(overrides.error.code))throw new Error(overrides.error.message);
 const rows=(overrides.error?[]:overrides.data??[]) as {role:string;model_id:string;instructions:string}[];
 const base:AgentSetting[]=[...run.config_snapshot,...rows.filter(o=>!run.config_snapshot.some(a=>a.role===o.role)).map(o=>({role:o.role,model_id:null,instructions:'',max_output_tokens:4000,step_cap_micro_usd:1}))];
 const limited=result.error?base:applyRunLimits(base,result.data??[]);
 return withTabModels(limited.map(a=>{const o=rows.find(r=>r.role===a.role);return o?{...a,model_id:o.model_id,instructions:o.instructions}:a;}),models);
}
