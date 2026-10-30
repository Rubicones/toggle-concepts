import {createHash,randomUUID} from "node:crypto";
import {campaignCreateSchema,isCampaignRemoved} from "@/packages/contracts/campaign-record";
import { api,body,json,ApiError } from "@/lib/server/api";
import { studioContext,checked } from "@/lib/server/studio";
export async function GET(){return api(async()=>{const {admin,tenant}=await studioContext();const rows=checked(await admin.from('campaigns').select('id,name,brand,goal,document,version,created_at').eq('tenant_id',tenant).not('document->>__studioRemovedAt','is',null).order('created_at',{ascending:false}))??[];return json({removed:rows.filter(isCampaignRemoved)});});}
export async function POST(request:Request){return api(async()=>{
 const input=await body(request,campaignCreateSchema);const {admin,tenant,actorId}=await studioContext();
 if(input.legacyId){
  const inserted=checked(await admin.from("campaigns").upsert({tenant_id:tenant,name:input.name,brand:input.brand,goal:input.goal,legacy_id:input.legacyId,created_by:actorId},{onConflict:"tenant_id,legacy_id",ignoreDuplicates:true}).select("id").maybeSingle());
  const existing=inserted??checked(await admin.from("campaigns").select("id").eq("tenant_id",tenant).eq("legacy_id",input.legacyId).single());return json(existing);
 }
 const id=input.requestId??randomUUID(),signature=createHash('sha256').update(JSON.stringify({name:input.name,brand:input.brand,goal:input.goal})).digest('hex');
 // One database statement persists every creation field. Retry IDs are campaign IDs.
 const inserted=checked(await admin.from('campaigns').upsert({id,tenant_id:tenant,name:input.name,brand:input.brand,goal:input.goal,created_by:actorId,document:{__studioCreationHash:signature}},{onConflict:'id',ignoreDuplicates:true}).select('*').maybeSingle());
 const campaign=inserted??checked(await admin.from('campaigns').select('*').eq('tenant_id',tenant).eq('id',id).single());
 if(!campaign||campaign.document.__studioCreationHash!==signature)throw new ApiError(409,'REQUEST_CONFLICT','This creation request belongs to another campaign. Refresh the campaign list.');
 return json({id:campaign.id,campaign},inserted?201:200);
});}
