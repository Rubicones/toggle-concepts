import { api, authenticated, body, json, dbError, ApiError } from "@/lib/server/api";
import { uploadRequestSchema, uploadAccessSchema } from "@/packages/contracts/data";
import { objectStore } from "@/packages/media/s3.server";
export async function POST(request: Request) { return api(async () => {
  const input=await body(request,uploadRequestSchema); const {supabase}=await authenticated(); const store=objectStore();
  const result=await supabase.rpc("start_upload",{target_campaign:input.campaignId,request_id:input.requestId,file_name:input.filename,file_mime:input.mime,file_bytes:input.bytes}); dbError(result.error);
  const upload=result.data; const expiresIn=Math.min(120,Math.floor((Date.parse(upload.expires_at)-Date.now())/1000));
  if (expiresIn<=0) throw new ApiError(409,"UPLOAD_EXPIRED","Start a new upload session.");
  const url=await store.signPut(upload.staging_key,input.mime,expiresIn);
  return json(uploadAccessSchema.parse({id:upload.id,url,headers:{"Content-Type":input.mime},expiresAt:new Date(Date.now()+expiresIn*1000).toISOString()}),201);
}); }
