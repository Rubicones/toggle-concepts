import { z } from "zod";
import { api, body, json, ApiError } from "@/lib/server/api";
import { studioContext, checked } from "@/lib/server/studio";
import { localModeState } from "@/lib/server/local-mode";

// The Local / OpenRouter switch for this computer. It changes new work only: runs and brand analyses keep the mode
// frozen when they were created.
export async function GET(){return api(async()=>{
 const {admin,tenant}=await studioContext(),state=await localModeState();
 const schema=await admin.rpc("studio_local_text_version"),schemaReady=!schema.error&&schema.data==="local-text@1";
 const saved=schemaReady&&state.device?checked(await admin.from("studio_text_modes").select("*").eq("tenant_id",tenant).eq("device_id",state.device.id).maybeSingle()) as {mode:string;updated_at:string;context_mode?:string}|null:null;
 const contextReady=!(await admin.rpc("studio_local_context_version")).error;
 return json({mode:saved?.mode??"openrouter",contextMode:saved?.context_mode??"fresh",contextReady,updatedAt:saved?.updated_at??null,schemaReady,device:state.device,profile:state.profile,blocked:schemaReady?state.blocked:"Apply the Local mode migration (20261106000100_local_text_execution.sql) in Supabase first."});
});}
const input=z.union([z.strictObject({mode:z.enum(["openrouter","local_claude"])}),z.strictObject({contextMode:z.enum(["fresh","shared"])})]);
export async function PUT(request:Request){return api(async()=>{
 const parsed=await body(request,input),{admin,tenant,actorId}=await studioContext(),state=await localModeState();
 // LC2: the context choice for this device (applies to new runs; frozen on each run).
 if("contextMode" in parsed){if(!state.device)throw new ApiError(409,"LOCAL_DEVICE_NOT_SET_UP",state.blocked??"This computer is not set up for Local mode.");
  const r=await admin.rpc("studio_set_context_mode",{target_tenant:tenant,acting_user:actorId,device:state.device.id,new_mode:parsed.contextMode});
  if(r.error)throw new ApiError(409,"LOCAL_CONTEXT_UNAVAILABLE",/LOCAL_MODE_REQUIRED/.test(r.error.message)?"Choose Local mode first.":"Apply the context migration (20261111000300_local_context_mode.sql) first.");
  return json({contextMode:parsed.contextMode,message:parsed.contextMode==="shared"?"New Local runs share one prepared context across all agents.":"New Local runs prepare each request on its own, as before."});}
 const {mode}=parsed;
 const schema=await admin.rpc("studio_local_text_version");if(schema.error||schema.data!=="local-text@1")throw new ApiError(503,"LOCAL_SCHEMA_REQUIRED","Apply the Local mode migration (20261106000100_local_text_execution.sql) in Supabase first.");
 if(!state.device)throw new ApiError(409,"LOCAL_DEVICE_NOT_SET_UP",state.blocked??"This computer is not set up for Local mode.");
 if(mode==="local_claude"&&state.blocked)throw new ApiError(409,"LOCAL_PROFILE_REQUIRED",state.blocked);
 checked(await admin.rpc("studio_set_text_mode",{target_tenant:tenant,acting_user:actorId,device:state.device.id,label:state.device.label,new_mode:mode,device_profile:mode==="local_claude"?state.summary:{}}));
 return json({mode,message:mode==="local_claude"?"Local mode is on for this computer. New runs use your Claude subscription for text; runs already started keep their mode.":"OpenRouter is on for this computer. New runs use OpenRouter for text; runs already started keep their mode."});
});}
