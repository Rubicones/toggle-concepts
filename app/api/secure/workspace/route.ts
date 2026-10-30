import { api, authenticated, json, dbError, ApiError } from "@/lib/server/api";
import { workspaceResponseSchema } from "@/packages/contracts/data";
export async function GET(request: Request) { return api(async () => {
  const {supabase,user}=await authenticated();
  const memberships=await supabase.rpc("my_memberships"); dbError(memberships.error);
  if (!memberships.data?.some((m:{role:string})=>["owner","producer","art_director"].includes(m.role))) throw new ApiError(403,"CLIENT_PORTAL","Use your client portal to see shared references.");
  const campaignId=new URL(request.url).searchParams.get("campaign");
  const campaigns=await supabase.from("campaigns").select("id,tenant_id,name,brand,version,created_at").order("created_at"); dbError(campaigns.error);
  const selected=campaigns.data?.find((c)=>c.id===campaignId) ?? campaigns.data?.[0];
  if (campaignId && selected?.id !== campaignId) throw new ApiError(404,"NOT_FOUND","This campaign is not available to your account.");
  const assets=selected ? await supabase.from("asset_revisions").select("id,campaign_id,filename,mime,bytes,sha256,created_at").eq("campaign_id",selected.id).order("created_at",{ascending:false}) : {data:[],error:null}; dbError(assets.error);
  const uploads=selected ? await supabase.from("upload_sessions").select("id,campaign_id,filename,state,error_code,created_at").eq("campaign_id",selected.id).order("created_at",{ascending:false}) : {data:[],error:null}; dbError(uploads.error);
  const publications=selected ? await supabase.from("asset_publications").select("asset_revision_id").eq("campaign_id",selected.id) : {data:[],error:null}; dbError(publications.error);
  const notes=selected ? await supabase.from("artifact_revisions").select("id,payload,created_at").eq("campaign_id",selected.id).eq("kind","internal_note").order("created_at",{ascending:false}) : {data:[],error:null}; dbError(notes.error);
  return json(workspaceResponseSchema.parse({email:user.email ?? "",memberships:memberships.data,campaigns:campaigns.data,assets:assets.data,uploads:uploads.data,publications:publications.data,notes:notes.data}));
}); }
