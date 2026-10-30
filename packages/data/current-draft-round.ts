import type {SupabaseClient} from '@supabase/supabase-js';

/** C1 owns the run; manual rounds and another run's larger round number cannot select its drafts. */
export async function currentDraftRound(admin:SupabaseClient,tenant:string,campaignId:string){
 const cp=await admin.from('studio_c1_checkpoints').select('run_id').eq('tenant_id',tenant).eq('campaign_id',campaignId).maybeSingle();
 if(cp.error||!cp.data)return {data:null,error:cp.error};
 return admin.from('studio_workflow_rounds').select('*').eq('tenant_id',tenant).eq('campaign_id',campaignId).eq('run_id',cp.data.run_id).eq('kind','draft').order('round_no',{ascending:false}).limit(1).maybeSingle();
}
