import { api, authenticated, body, json, dbError } from "@/lib/server/api";
import { campaignRequestSchema } from "@/packages/contracts/data";
export async function POST(request: Request) { return api(async () => {
  const input=await body(request,campaignRequestSchema); const {supabase}=await authenticated();
  const result=await supabase.rpc("create_campaign",{target_tenant:input.tenantId,campaign_name:input.name,brand_name:input.brand}); dbError(result.error);
  return json({id:result.data},201);
}); }
