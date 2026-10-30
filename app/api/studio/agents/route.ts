import { z } from "zod";
import { api,body,json,ApiError } from "@/lib/server/api";
import { studioContext,checked } from "@/lib/server/studio";
import { agentRoles } from "@/packages/contracts/workflow";
import { modelCatalog } from "@/lib/server/providers";
export async function GET(){return api(async()=>{const {admin,tenant}=await studioContext();return json({agents:checked(await admin.from("studio_agents").select("*").eq("tenant_id",tenant)),roles:agentRoles,models:await modelCatalog(),providerConfigured:Boolean(process.env.OPENROUTER_API_KEY)});});}
export async function POST(request:Request){return api(async()=>{
 const input=await body(request,z.strictObject({role:z.enum(agentRoles),modelId:z.string().min(1).max(160).nullable(),instructions:z.string().max(12000),maxOutputTokens:z.number().int().min(64).max(32768),stepCapMicroUsd:z.number().int().min(1).max(10000000)}));
 if(["video","model3d"].includes(input.role)){if(input.modelId!==null)throw new Error("MEDIA_AGENT_UNAVAILABLE");}
 else {const model=(await modelCatalog()).find(m=>m.id===input.modelId);if(!model||(input.role==="image"?!model.outputModalities.includes("image"):model.outputModalities.length!==1||model.outputModalities[0]!=="text"))throw new Error("MODEL_UNAVAILABLE");}
 const {admin,tenant}=await studioContext();if(input.maxOutputTokens>4000){const schema=await admin.from("studio_intake_output_revisions").select("id").limit(0);if(schema.error)throw new ApiError(503,"OUTPUT_ALLOWANCE_SCHEMA_REQUIRED","Apply the Brand output allowance migration in Settings before saving output limits above 4,000 tokens.");}checked(await admin.from("studio_agents").upsert({tenant_id:tenant,role:input.role,model_id:input.modelId,instructions:input.instructions,max_output_tokens:input.maxOutputTokens,step_cap_micro_usd:input.stepCapMicroUsd,updated_at:new Date().toISOString()}));return json({message:"Agent settings saved to Supabase."});
});}
