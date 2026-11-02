import { z } from "zod";
import { api,body,json,ApiError } from "@/lib/server/api";
import { studioContext,checked } from "@/lib/server/studio";
import { agentRoles } from "@/packages/contracts/workflow";
import { modelCatalog } from "@/lib/server/providers";
import { agentModelProblem,roleRequirement } from "@/packages/agents/role-requirements";
import { outdatedInstructionRoles,AGENT_INSTRUCTION_VERSION,type StoredAgent } from "@/packages/agents/agent-settings";
export async function GET(){return api(async()=>{
 const {admin,tenant}=await studioContext();
 const [agents,models,inFlight,version]=await Promise.all([
  admin.from("studio_agents").select("*").eq("tenant_id",tenant).then(r=>checked(r)??[]),
  modelCatalog(),
  // Requests already priced or running keep the model on their step; everything not started uses the tab model.
  admin.from("studio_agent_steps").select("role,model_id").eq("tenant_id",tenant).in("status",["reserved","running"]).then(r=>checked(r)??[]),
  admin.rpc("studio_agent_models_version"),
 ]);
 const live=!version.error&&version.data==="agents-tab@1",outdated=new Set(outdatedInstructionRoles(agents as StoredAgent[]));
 const usage=Object.fromEntries(agentRoles.map(role=>{const agent=(agents as StoredAgent[]).find(a=>a.role===role),model=models.find(m=>m.id===agent?.model_id);
  const older=(inFlight as {role:string;model_id:string}[]).filter(r=>r.role===role&&r.model_id!==agent?.model_id);
  return [role,{requirement:roleRequirement(role),problem:agent?agentModelProblem(role,model,agent.model_id):"Not configured.",instructionsOutdated:outdated.has(role),
   draftBriefFromCode:["visual-direction","creative-code","critic"].includes(role),inFlightOnOtherModels:[...new Set(older.map(r=>r.model_id))].map(id=>({model:id,requests:older.filter(r=>r.model_id===id).length}))}];}));
 return json({agents,roles:agentRoles,models,usage,instructionVersion:AGENT_INSTRUCTION_VERSION,modelsFollowTab:live,providerConfigured:Boolean(process.env.OPENROUTER_API_KEY)});
});}
export async function POST(request:Request){return api(async()=>{
 const input=await body(request,z.strictObject({role:z.enum(agentRoles),modelId:z.string().min(1).max(160).nullable(),instructions:z.string().max(12000),maxOutputTokens:z.number().int().min(64).max(32768),stepCapMicroUsd:z.number().int().min(1).max(10000000)}));
 // The tab is the source of truth: a model that cannot work in this role is refused here, never swapped later.
 const problem=agentModelProblem(input.role,(await modelCatalog()).find(m=>m.id===input.modelId),input.modelId);if(problem)throw new ApiError(409,"MODEL_NOT_SUITABLE",problem);
 const {admin,tenant}=await studioContext();if(input.maxOutputTokens>4000){const schema=await admin.from("studio_intake_output_revisions").select("id").limit(0);if(schema.error)throw new ApiError(503,"OUTPUT_ALLOWANCE_SCHEMA_REQUIRED","Apply the Brand output allowance migration in Settings before saving output limits above 4,000 tokens.");}checked(await admin.from("studio_agents").upsert({tenant_id:tenant,role:input.role,model_id:input.modelId,instructions:input.instructions,max_output_tokens:input.maxOutputTokens,step_cap_micro_usd:input.stepCapMicroUsd,updated_at:new Date().toISOString()}));return json({message:"Saved. Steps that have not started use this model now; instructions and limits apply to new runs."});
});}
