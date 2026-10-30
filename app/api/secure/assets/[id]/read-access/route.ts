import { api, authenticated, sameOrigin, json, dbError, ApiError } from "@/lib/server/api";
import { uuid, readAccessSchema } from "@/packages/contracts/data";
import { objectStore } from "@/packages/media/s3.server";
export async function POST(request: Request,context:{params:Promise<{id:string}>}) { return api(async () => {
  sameOrigin(request); const id=uuid.parse((await context.params).id); const {supabase}=await authenticated();
  const result=await supabase.rpc("asset_read_record",{target_asset:id}); dbError(result.error); const asset=result.data?.[0];
  if (!asset) throw new ApiError(404,"NOT_FOUND","This file is not available to your account.");
  return json(readAccessSchema.parse({url:await objectStore().signGet(asset.object_key,asset.filename),sha256:asset.sha256,bytes:asset.bytes,mime:asset.mime,filename:asset.filename,expiresAt:new Date(Date.now()+60000).toISOString()}));
}); }
