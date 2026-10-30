import { z } from "zod";
import {campaignEditSchema,campaignEditConflicts,campaignLifecycleSchema,campaignLifecycleDocument,isCampaignRemoved} from "@/packages/contracts/campaign-record";
import { api,body,json,ApiError } from "@/lib/server/api";
import { campaignRecord,studioContext,checked } from "@/lib/server/studio";
import {agentStepSummaryColumns} from '@/packages/data/studio-projections';
export async function GET(request:Request,ctx:RouteContext<"/api/studio/campaigns/[id]">){return api(async()=>{
 const {id}=await ctx.params;const campaign=await campaignRecord(z.uuid().parse(id));const {admin,tenant}=await studioContext();
 const offset=z.coerce.number().int().nonnegative().parse(new URL(request.url).searchParams.get('after')??0);
 const runs=checked(await admin.from("studio_runs").select("id,campaign_id,name,status,closure_reason,cap_micro_usd,charged_micro_usd,reserved_micro_usd,config_snapshot,created_at").eq("tenant_id",tenant).eq("campaign_id",id).order("created_at",{ascending:false}).order('id').limit(50));
 const rows=checked(await admin.from("studio_agent_steps").select(agentStepSummaryColumns).eq("tenant_id",tenant).eq("campaign_id",id).order("created_at",{ascending:false}).order('id').range(offset,offset+49))??[];
 const events=checked(await admin.from("audit_events").select("id,event_type,created_at").eq("tenant_id",tenant).eq("campaign_id",id).order("created_at",{ascending:false}).limit(100));
 return json({campaign,runs,steps:rows,events,next:rows.length===50?offset+50:null});
});}
export async function PATCH(request:Request,ctx:RouteContext<"/api/studio/campaigns/[id]">){return api(async()=>{
 const {id}=await ctx.params;z.uuid().parse(id);const requestInput=await body(request,campaignEditSchema,200000),{previousDocument,previousGoal,...input}=requestInput;void previousDocument;void previousGoal;const {admin,tenant}=await studioContext();
 // Compare the exact edited field, allowing unrelated campaign sections to save concurrently.
 for(let attempt=0;attempt<2;attempt++){
  const row=await campaignRecord(id);if(campaignEditConflicts(row,requestInput))throw new Error('STALE_CAMPAIGN');
  const change={...input,...(input.document?{document:{...row.document,...input.document}}:{}),version:row.version+1};
  if(input.document&&Buffer.byteLength(JSON.stringify(change.document),'utf8')>63000)throw new ApiError(409,'DOCUMENT_TOO_LARGE','Campaign notes exceed the stored text limit. Add long documents as brand files instead.');
  const saved=checked(await admin.from('campaigns').update(change).eq('tenant_id',tenant).eq('id',id).eq('version',row.version).select('id,version'));
  if(saved?.length)return json({version:saved[0].version,message:'Campaign saved to Supabase.'});
 }
 throw new Error('STALE_CAMPAIGN');
});}

async function lifecycle(request:Request,ctx:RouteContext<"/api/studio/campaigns/[id]">,remove:boolean){return api(async()=>{
 const {id}=await ctx.params,input=await body(request,campaignLifecycleSchema),row=await campaignRecord(z.uuid().parse(id),true),{admin,tenant,actorId}=await studioContext();
 if(isCampaignRemoved(row)===remove)return json({message:remove?'Campaign removed. Saved history is retained.':'Campaign restored.'});
 if(row.version!==input.expectedVersion)throw new ApiError(409,'STALE_CAMPAIGN','The campaign changed. Refresh before continuing.');
 const saved=checked(await admin.from('campaigns').update({document:campaignLifecycleDocument(row.document,actorId,remove,new Date().toISOString()),version:row.version+1}).eq('tenant_id',tenant).eq('id',id).eq('version',row.version).select('id'));
 if(!saved?.length)throw new Error('STALE_CAMPAIGN');return json({message:remove?'Campaign removed. All saved data is retained; queued work remains visible in Queue.':'Campaign restored.'});
});}
export async function DELETE(request:Request,ctx:RouteContext<"/api/studio/campaigns/[id]">){return lifecycle(request,ctx,true);}
export async function POST(request:Request,ctx:RouteContext<"/api/studio/campaigns/[id]">){return lifecycle(request,ctx,false);}
