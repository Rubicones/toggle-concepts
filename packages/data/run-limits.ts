import type {SupabaseClient} from '@supabase/supabase-js';
import type {AgentSetting} from '../contracts/shared';
import {applyRunLimits} from '../contracts/run-limits';
const missing=(code?:string)=>['42P01','PGRST205','PGRST204'].includes(code??'');
/** C1 agents plus audited limits. Planning excludes later director overrides; the default mirrors effective_run_agent. */
export async function effectiveRunAgents(admin:SupabaseClient,run:{id:string;config_snapshot:AgentSetting[]},options:{directorOverrides?:boolean}={}){
 const result=await admin.from('studio_run_agent_limits').select('role,max_output_tokens,cap_micro_usd').eq('run_id',run.id);
 if(result.error&&!missing(result.error.code))throw new Error(result.error.message);
 if(options.directorOverrides===false)return result.error?run.config_snapshot:applyRunLimits(run.config_snapshot,result.data??[]);
 const overrides=await admin.from('studio_run_agent_overrides').select('role,model_id,instructions').eq('run_id',run.id);
 if(overrides.error&&!missing(overrides.error.code))throw new Error(overrides.error.message);
 const rows=(overrides.error?[]:overrides.data??[]) as {role:string;model_id:string;instructions:string}[];
 const base:AgentSetting[]=[...run.config_snapshot,...rows.filter(o=>!run.config_snapshot.some(a=>a.role===o.role)).map(o=>({role:o.role,model_id:null,instructions:'',max_output_tokens:4000,step_cap_micro_usd:1}))];
 const limited=result.error?base:applyRunLimits(base,result.data??[]);
 return limited.map(a=>{const o=rows.find(r=>r.role===a.role);return o?{...a,model_id:o.model_id,instructions:o.instructions}:a;});
}
