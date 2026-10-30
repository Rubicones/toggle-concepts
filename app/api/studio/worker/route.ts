import { api,sameOrigin,json } from "@/lib/server/api";
import { studioContext,checked } from "@/lib/server/studio";
import { startLocalValidation,startLocalImage,startLocalWorkflow } from "@/lib/server/local-compute";
export async function POST(request:Request){return api(async()=>{sameOrigin(request);const {admin,tenant}=await studioContext();await startLocalValidation();await startLocalWorkflow();
 const pending=checked(await admin.from("studio_agent_steps").select("id").eq("tenant_id",tenant).eq("role","image").eq("status","reserved").order("created_at").limit(10));
 for(const step of pending??[])await startLocalImage(step.id);
 return json({message:"Local processing started. Durable text jobs, pending validation and unsubmitted image jobs will resume; uncertain submissions are never repeated."},202);});}
