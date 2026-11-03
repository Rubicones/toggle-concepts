import 'server-only';
import {studioContext} from './studio';
/**
 * The campaign whose brandbook materials, findings and submissions this campaign uses: its brand source when one is
 * set, otherwise itself. Before the brand-source migration is applied every campaign is its own brand.
 */
export async function brandScope(campaignId:string):Promise<string>{
 const {admin}=await studioContext(),row=await admin.from('campaigns').select('brand_source_campaign_id').eq('id',campaignId).maybeSingle();
 if(row.error)return campaignId;
 return (row.data as {brand_source_campaign_id?:string|null}|null)?.brand_source_campaign_id??campaignId;
}
