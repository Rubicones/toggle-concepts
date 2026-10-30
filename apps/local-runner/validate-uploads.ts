import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv, requireLoopback } from "../../scripts/local-env";
import { dataConfig } from "../../packages/data/config.server";
import { cleanupUploads, validateNextUpload } from "../../packages/media/validate-upload.local";
async function main() {
loadLocalEnv();
// This runtime uses a scoped worker identity, never the seeder's admin connection.
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.LOCAL_DATABASE_URL;
const config=dataConfig();
if(process.env.MEDIA_WORKER_ALLOW_REMOTE!=="true") {requireLoopback(config.url);requireLoopback(process.env.S3_ENDPOINT ?? "");}
if (!process.env.MEDIA_WORKER_EMAIL || !process.env.MEDIA_WORKER_PASSWORD) throw new Error("MEDIA_WORKER_NOT_CONFIGURED: run the local setup and seed commands.");
const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
const signed=await client.auth.signInWithPassword({email:process.env.MEDIA_WORKER_EMAIL,password:process.env.MEDIA_WORKER_PASSWORD});
if (signed.error) throw new Error("MEDIA_WORKER_AUTH_FAILED");
let running=true; process.once("SIGINT",()=>{running=false;}); process.once("SIGTERM",()=>{running=false;});
let lastRefresh=Date.now();
console.log("Local media validator started. It inspects uploads only; no creative rendering or AI calls.");
do {
  try {
    if (Date.now()-lastRefresh>30*60*1000) {const refreshed=await client.auth.refreshSession(); if (refreshed.error) throw new Error("MEDIA_WORKER_AUTH_FAILED"); lastRefresh=Date.now();}
    const result=await validateNextUpload(client); if (result) console.log(JSON.stringify(result));
    const cleaned=await cleanupUploads(client); if (cleaned) console.log(`Cleaned ${cleaned} expired staging objects.`);
    if (process.argv.includes("--once")) break;
    if (!result) await new Promise((resolve)=>setTimeout(resolve,2000));
  } catch(error) {
    console.error(error instanceof Error && error.message==="MEDIA_TOOLS_UNAVAILABLE" ? "FFmpeg/ffprobe are unavailable. Install both on PATH; no new upload was claimed." : "Local media validation interrupted; the fenced session is retained for reconciliation. Check local service status and rerun.");
    if (process.argv.includes("--once")) {process.exitCode=1; break;}
    await new Promise((resolve)=>setTimeout(resolve,2000));
  }
} while (running);
await client.auth.signOut({scope:"local"});

}
main().catch((error:unknown)=>{
  const message=error instanceof Error ? error.message : "";
  console.error(message.startsWith("MEDIA_WORKER_NOT_CONFIGURED") ? "Worker identity is missing. Run npm run data:start and npm run seed:demo."
    : message==="MEDIA_WORKER_AUTH_FAILED" ? "Worker sign-in failed. Check the selected local environment and worker account."
    : message==="DATA_NOT_CONFIGURED" ? "Local data settings are missing. Run npm run data:start first."
    : "Local setup/validation failed. Check configuration and service status; credentials are never printed.");process.exitCode=1;
});
