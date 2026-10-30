import { api, authenticated, body, json, dbError } from "@/lib/server/api";
import { uuid, shareRequestSchema } from "@/packages/contracts/data";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) { return api(async () => {
  const id=uuid.parse((await context.params).id); const input=await body(request,shareRequestSchema); const {supabase}=await authenticated();
  const result=await supabase.rpc("share_reference",{target_asset:id,confirm_rights:input.confirmRights}); dbError(result.error);
  return json({message:"Reference shared with this campaign’s clients. This is not a production approval."});
}); }
