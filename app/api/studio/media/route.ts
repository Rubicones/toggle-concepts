import { api,sameOrigin,json,ApiError } from "@/lib/server/api";
import { studioContext,campaignRecord,checked } from "@/lib/server/studio";
import { objectStore } from "@/packages/media/s3.server";
import { startLocalValidation } from "@/lib/server/local-compute";
import { uploadRequestSchema } from "@/packages/contracts/data";
import { z } from "zod";
export async function GET(request:Request){return api(async()=>{
 const {admin,tenant}=await studioContext();const params=new URL(request.url).searchParams;const id=params.get("campaign"),asset=params.get("asset");if(id)await campaignRecord(id);if(asset)z.uuid().parse(asset);
 let query=admin.from("asset_revisions").select("id,campaign_id,filename,mime,bytes,sha256,inspection,created_at").eq("tenant_id",tenant).order("created_at",{ascending:false});if(id)query=query.eq("campaign_id",id);if(asset)query=query.eq("id",asset);
 let uploads=admin.from("upload_sessions").select("id,campaign_id,filename,state,error_code,created_at").eq("tenant_id",tenant).order("created_at",{ascending:false}).limit(100);if(id)uploads=uploads.eq("campaign_id",id);
 if(asset)uploads=uploads.eq("id",asset);
 return json({assets:checked(await query),uploads:checked(await uploads)});
});}
export async function POST(request:Request){return api(async()=>{
 sameOrigin(request);if(process.env.STUDIO_LOCAL_COMPUTE!=="true")throw new Error("LOCAL_DEVICE_REQUIRED");
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,"FILE_REQUIRED","Choose a file.");const chunks:Uint8Array[]=[];let size=0;
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>10485760+20000){await reader.cancel();throw new ApiError(413,"FILE_TOO_LARGE","Choose a file up to 10 MiB.");}chunks.push(part.value);}
 const form=await new Request(request.url,{method:"POST",headers:{"Content-Type":request.headers.get("content-type")??""},body:Buffer.concat(chunks)}).formData();
 const file=form.get("file");if(!(file instanceof File))throw new ApiError(400,"FILE_REQUIRED","Choose a file.");const mime=file.name.toLowerCase().endsWith(".wav")?"audio/wav":file.type;
 const input=uploadRequestSchema.parse({schemaVersion:"1.0",campaignId:form.get("campaignId"),requestId:crypto.randomUUID(),filename:file.name,mime,bytes:file.size});await campaignRecord(input.campaignId);
 const {client}=await studioContext();const upload=checked(await client.rpc("start_upload",{target_campaign:input.campaignId,request_id:input.requestId,file_name:input.filename,file_mime:input.mime,file_bytes:input.bytes}));
 await objectStore().putStaging(upload.staging_key,Buffer.from(await file.arrayBuffer()),input.mime);
 checked(await client.rpc("finish_upload",{target_upload:upload.id}));await startLocalValidation();return json({id:upload.id,message:"Uploaded. Validation has started automatically."},202);
});}
