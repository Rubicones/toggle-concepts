import { api, authenticated, body, json, dbError } from "@/lib/server/api";
import { uuid, accessRequestSchema, accessResponseSchema } from "@/packages/contracts/data";
export async function GET(request:Request) {return api(async()=>{
  const campaignId=uuid.parse(new URL(request.url).searchParams.get("campaign")); const {supabase}=await authenticated();
  const result=await supabase.rpc("campaign_access",{target_campaign:campaignId});dbError(result.error);return json(accessResponseSchema.parse(result.data));
});}
export async function POST(request:Request) {return api(async()=>{
  const input=await body(request,accessRequestSchema); const {supabase}=await authenticated();
  const result=await supabase.rpc("set_campaign_access",{target_campaign:input.campaignId,target_user:input.userId,allow_access:input.allowAccess});dbError(result.error);return json({message:"Campaign access updated."});
});}
