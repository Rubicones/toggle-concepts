import {api,json} from '@/lib/server/api';
import {studioContext,checked} from '@/lib/server/studio';
import {schemaMissing} from '@/lib/server/brief';
import {dashboardItems} from '@/packages/contracts/dashboard';
export async function GET(){return api(async()=>{
 const {admin,tenant}=await studioContext(),campaigns=checked(await admin.from('campaigns').select('id').eq('tenant_id',tenant).is('document->>__studioRemovedAt',null).order('created_at',{ascending:false}).limit(200))??[],ids=campaigns.map(c=>c.id);
 if(!ids.length)return json({items:[]});
 const [controls,runs]=await Promise.all([
  admin.from('studio_campaign_run_controls').select('campaign_id,run_id,stage,status,blocker,updated_at').eq('tenant_id',tenant).in('campaign_id',ids).order('created_at',{ascending:false}).limit(400),
  admin.from('studio_runs').select('id,campaign_id,status,cap_micro_usd,charged_micro_usd,reserved_micro_usd').eq('tenant_id',tenant).in('campaign_id',ids).order('created_at',{ascending:false}).limit(400),
 ]);
 if(controls.error&&!schemaMissing(controls.error))checked(controls);
 return json({items:dashboardItems(ids,controls.error?[]:controls.data??[],checked(runs)??[])});
});}
