import "server-only";
import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {sharedActors} from "@/packages/data/shared-runtime";
let running=false;
export function requireLocalDevice(){
 const host=new URL(process.env.NEXT_PUBLIC_APP_URL??"https://unconfigured.invalid").hostname;
 if(process.env.STUDIO_LOCAL_COMPUTE!=="true"||!["127.0.0.1","localhost","[::1]"].includes(host)||process.env.VERCEL||process.env.AWS_LAMBDA_FUNCTION_NAME)throw new Error("LOCAL_DEVICE_REQUIRED");
}
export async function startLocalValidation(){
 requireLocalDevice();
 if(running)return;
 const {worker}=await sharedActors();const {data}=await worker.auth.getSession();
 if(!data.session?.access_token)throw new Error("SHARED_IDENTITY_UNAVAILABLE");if(running)return;
 const env:NodeJS.ProcessEnv={...process.env,STUDIO_WORKER_ACCESS_TOKEN:data.session.access_token};delete env.OPENROUTER_API_KEY;delete env.R2_SECRET_ACCESS_KEY;delete env.SUPABASE_ACCESS_TOKEN;delete env.SUPABASE_DB_URL;delete env.LOCAL_DATABASE_URL;
 const child=spawn(process.execPath,["--import","tsx",resolve("apps/local-runner/managed-validation.ts")],{cwd:process.cwd(),env,stdio:"ignore"});running=true;
 child.once("error",()=>{running=false;});child.once("exit",()=>{running=false;});
}
export async function startLocalImage(stepId:string){
 requireLocalDevice();
 const env:NodeJS.ProcessEnv={...process.env};
 delete env.SUPABASE_ACCESS_TOKEN;delete env.SUPABASE_DB_URL;delete env.LOCAL_DATABASE_URL;delete env.R2_SECRET_ACCESS_KEY;delete env.R2_ACCESS_KEY_ID;
 await new Promise<void>((resolveStarted,reject)=>{
  const child=spawn(process.execPath,["--import","tsx",resolve("apps/local-runner/generate-image.ts"),stepId],{cwd:process.cwd(),env,stdio:"ignore"});
  child.once("spawn",resolveStarted);child.once("error",()=>reject(new Error("LOCAL_IMAGE_START_FAILED")));
 });
}

export async function startLocalWorkflow(){
 requireLocalDevice();
 const env:NodeJS.ProcessEnv={...process.env};
 for(const key of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_URL","LOCAL_DATABASE_URL","R2_SECRET_ACCESS_KEY","R2_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY","S3_ACCESS_KEY_ID"])delete env[key];
 await new Promise<void>((resolveStarted,reject)=>{
  const child=spawn(process.execPath,["--import","tsx",resolve("apps/local-runner/workflow.ts")],{cwd:process.cwd(),env,stdio:"ignore",detached:true});
  child.once("spawn",()=>{child.unref();resolveStarted();});child.once("error",()=>reject(new Error("LOCAL_WORKFLOW_START_FAILED")));
 });
}
