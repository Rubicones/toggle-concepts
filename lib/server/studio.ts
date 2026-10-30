import "server-only";
import {isCampaignRemoved} from "@/packages/contracts/campaign-record";
import { adminClient, sharedActors, sharedTenant, checked } from "@/packages/data/shared-runtime";
export { adminClient, sharedActors, sharedTenant, checked };
export async function studioContext() {if(process.env.STUDIO_SHARED_MODE!=="true")throw new Error("SHARED_MODE_DISABLED");const actors=await sharedActors();return {admin:adminClient(),client:actors.producer,actorId:actors.producerId,tenant:sharedTenant};}
export async function campaignRecord(id:string,includeRemoved=false) {
 const {admin,tenant}=await studioContext();const row=checked(await admin.from("campaigns").select("*").eq("tenant_id",tenant).eq("id",id).maybeSingle());
 if(!row)throw new Error("CAMPAIGN_NOT_FOUND");if(!includeRemoved&&isCampaignRemoved(row))throw new Error("CAMPAIGN_REMOVED");return row;
}
