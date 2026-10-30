import { api, authenticated, body, json, dbError } from "@/lib/server/api";
import { noteRequestSchema } from "@/packages/contracts/data";
export async function POST(request: Request) { return api(async () => {
  const input=await body(request,noteRequestSchema); const {supabase}=await authenticated();
  const result=await supabase.rpc("append_artifact",{target_campaign:input.campaignId,expected_version:input.expectedVersion,artifact_payload:{schemaVersion:"1.0",note:input.note}}); dbError(result.error);
  return json({id:result.data},201);
}); }
