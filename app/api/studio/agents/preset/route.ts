import {api,sameOrigin,json,ApiError} from "@/lib/server/api";
import {studioContext,checked} from "@/lib/server/studio";
import {instructionUpdateRows,AGENT_INSTRUCTION_VERSION,type StoredAgent} from "@/packages/agents/agent-settings";
/** Updates role instructions to the version shipped with the app. Models, output limits and step caps are never changed here. */
export async function POST(request:Request){return api(async()=>{
 sameOrigin(request);
 const {admin,tenant}=await studioContext();const schema=await admin.from("studio_intake_output_revisions").select("id").limit(0);if(schema.error)throw new ApiError(503,"OUTPUT_ALLOWANCE_SCHEMA_REQUIRED","Apply the Brand output allowance migration in Settings before updating instructions.");
 const existing=(checked(await admin.from("studio_agents").select("role,model_id,instructions,max_output_tokens,step_cap_micro_usd").eq("tenant_id",tenant))??[]) as StoredAgent[];
 checked(await admin.from("studio_agents").upsert(instructionUpdateRows(existing,tenant,new Date().toISOString())));
 return json({message:`Instructions updated to version ${AGENT_INSTRUCTION_VERSION}. Models, output limits and step caps were not changed. Steps that have not started yet use the current models; instructions apply to new runs.`,instructionVersion:AGENT_INSTRUCTION_VERSION});
});}
