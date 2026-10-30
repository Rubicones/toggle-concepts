// Separate local process; its scoped Auth token is supplied privately by the launcher.
import {createClient} from "@supabase/supabase-js";
import {dataConfig} from "../../packages/data/config.server";
import {validateNextUpload,cleanupUploads} from "../../packages/media/validate-upload.local";
async function main(){
 if(process.env.STUDIO_LOCAL_COMPUTE!=="true"||!process.env.STUDIO_WORKER_ACCESS_TOKEN)throw new Error("LOCAL_DEVICE_REQUIRED");
 const cfg=dataConfig();const worker=createClient(cfg.url,cfg.key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${process.env.STUDIO_WORKER_ACCESS_TOKEN}`},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}});
 for(let index=0;index<30;index++){const result=await validateNextUpload(worker);if(!result)break;}await cleanupUploads(worker);
}
main().catch(()=>{process.exitCode=1;});
