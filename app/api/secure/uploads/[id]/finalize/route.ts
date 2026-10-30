import { api, authenticated, sameOrigin, json, dbError, ApiError } from "@/lib/server/api";
import { uuid } from "@/packages/contracts/data";
import { objectStore, isMissingObject } from "@/packages/media/s3.server";
export async function POST(request: Request, context: {params:Promise<{id:string}>}) { return api(async () => {
  sameOrigin(request); const id=uuid.parse((await context.params).id); const {supabase}=await authenticated();
  const upload=await supabase.from("upload_sessions").select("id,staging_key,claimed_bytes,state").eq("id",id).maybeSingle(); dbError(upload.error);
  if (!upload.data) throw new ApiError(404,"NOT_FOUND","This upload is not available to your account.");
  if (upload.data.state === "uploading") {
    let head; try { head=await objectStore().head(upload.data.staging_key); } catch(error) { if (isMissingObject(error)) throw new ApiError(409,"UPLOAD_MISSING","Upload the file before requesting validation."); throw error; }
    if (head.ContentLength!==upload.data.claimed_bytes) throw new ApiError(409,"UPLOAD_SIZE_MISMATCH","The uploaded size differs from the session. Start a new upload.");
  }
  const finished=await supabase.rpc("finish_upload",{target_upload:id}); dbError(finished.error);
  return json({id,message:"Queued for local validation. No media processing runs in this request."},202);
}); }
