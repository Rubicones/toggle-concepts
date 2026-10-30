// Node-only runtime, shared by thin API handlers and the independent local worker.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { dataConfig } from "./config.server";
import { studioFetch } from './studio-changes';
export const sharedTenant = process.env.STUDIO_SHARED_TENANT_ID ?? "10000000-0000-4000-8000-000000000001";
export const sharedMode = () => process.env.STUDIO_SHARED_MODE === "true";
export function adminClient() {
 const cfg=dataConfig(); if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("DATA_NOT_CONFIGURED");
 // Creative RPCs move large frozen payloads and wait on the run lock while the worker settles a step; 20 s aborted
 // requests the database still completed. The database's own statement timeout stays the real bound.
 return createClient(cfg.url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>studioFetch(input,{...init,cache:"no-store",signal:AbortSignal.timeout(60000)})}});
}
let actors:Promise<{producer:SupabaseClient;worker:SupabaseClient;producerId:string}>|undefined;let expires=0;
async function initialize() {
 const admin=adminClient(),cfg=dataConfig();
 const schema=await admin.from("studio_settings").select("tenant_id").limit(1);if(schema.error)throw new Error("STUDIO_SCHEMA_REQUIRED");
 async function actor(role:string) {
  const email=`shared-${role}@toggle.local`;
  await admin.auth.admin.createUser({email,password:randomUUID()+randomUUID(),email_confirm:true});
  // Admin-generated links are exchanged server-side and are never emailed/exposed.
  const link=await admin.auth.admin.generateLink({type:"magiclink",email});
  if(link.error || !link.data.properties?.hashed_token)throw new Error("SHARED_IDENTITY_UNAVAILABLE");
  const client=createClient(cfg.url,cfg.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:studioFetch}});
  const login=await client.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:"email"});
  if(login.error || !login.data.user)throw new Error("SHARED_IDENTITY_UNAVAILABLE");
  return {client,id:login.data.user.id};
 }
 const producer=await actor("producer"),worker=await actor("worker");
 const configured=await admin.rpc("studio_bootstrap",{producer_id:producer.id,worker_id:worker.id,target_tenant:sharedTenant});
 if(configured.error)throw new Error("STUDIO_SCHEMA_REQUIRED");
 const bucket=await admin.storage.getBucket("studio-media");
 if(bucket.error){const created=await admin.storage.createBucket("studio-media",{public:false,fileSizeLimit:52428800});if(created.error && !created.error.message.includes("already exists"))throw new Error("STORAGE_NOT_CONFIGURED");}
 expires=Date.now()+45*60*1000;return {producer:producer.client,worker:worker.client,producerId:producer.id};
}
export async function sharedActors() {
 if(!actors || Date.now()>expires){actors=initialize().catch(error=>{actors=undefined;throw error;});expires=Date.now()+45*60*1000;}
 return actors;
}
export function checked<T>(result:{data:T;error:{message:string;code?:string}|null}):T {if(result.error)throw new Error(result.error.message);return result.data;}
