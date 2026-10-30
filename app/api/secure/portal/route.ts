import { api, authenticated, json, dbError, ApiError } from "@/lib/server/api";
import { clientResponseSchema } from "@/packages/contracts/data";
export async function GET(request: Request) { return api(async () => {
  const {supabase,user}=await authenticated(); const campaigns=await supabase.rpc("client_campaigns"); dbError(campaigns.error);
  const campaignId=new URL(request.url).searchParams.get("campaign"); const chosen=campaigns.data?.find((c:{id:string})=>c.id===campaignId) ?? campaigns.data?.[0];
  if (campaignId && chosen?.id!==campaignId) throw new ApiError(404,"NOT_FOUND","This campaign is not available to your account.");
  const assets=chosen ? await supabase.rpc("client_assets",{target_campaign:chosen.id}) : {data:[],error:null}; dbError(assets.error);
  return json(clientResponseSchema.parse({email:user.email ?? "",campaigns:campaigns.data,assets:assets.data}));
}); }
