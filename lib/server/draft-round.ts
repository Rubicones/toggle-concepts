import 'server-only';
import {studioContext,checked} from './studio';
import {schemaMissing} from './brief';
export async function draftRoundFeedback(campaignId:string){
 const {admin,tenant}=await studioContext();const result=await admin.from('studio_workflow_rounds').select('id,round_no,change_request_id').eq('tenant_id',tenant).eq('campaign_id',campaignId).eq('kind','draft').order('round_no',{ascending:false}).limit(1).maybeSingle();
 if(result.error&&(schemaMissing(result.error)||['42703','PGRST204'].includes(result.error.code)))return null;const round=checked(result);if(!round?.change_request_id)return null;
 const change=checked(await admin.from('studio_c2_decisions').select('id,comments').eq('tenant_id',tenant).eq('id',round.change_request_id).single());return {roundId:round.id,roundNo:round.round_no,feedback:change};
}
