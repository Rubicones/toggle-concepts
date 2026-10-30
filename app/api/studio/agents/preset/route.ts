import {api,sameOrigin,json,ApiError} from "@/lib/server/api";
import {studioContext,checked} from "@/lib/server/studio";
import {modelCatalog} from "@/lib/server/providers";
import {defaultAgentSettings,FLASH_MODEL,IMAGE_MODEL,AGENT_INSTRUCTION_VERSION} from "@/packages/agents/defaults";
export async function POST(request:Request){return api(async()=>{
 sameOrigin(request);const catalog=await modelCatalog();
 for(const id of [FLASH_MODEL,IMAGE_MODEL])if(!catalog.some(m=>m.id===id))throw new Error("MODEL_UNAVAILABLE");
 const {admin,tenant}=await studioContext();const schema=await admin.from("studio_intake_output_revisions").select("id").limit(0);if(schema.error)throw new ApiError(503,"OUTPUT_ALLOWANCE_SCHEMA_REQUIRED","Apply the Brand output allowance migration in Settings before applying the updated test defaults.");checked(await admin.from("studio_agents").upsert(defaultAgentSettings.map(agent=>({...agent,tenant_id:tenant,updated_at:new Date().toISOString()}))));
 return json({message:"Gemini test settings and complete instructions saved for all 14 roles. Create a new run to use them.",instructionVersion:AGENT_INSTRUCTION_VERSION});
});}
