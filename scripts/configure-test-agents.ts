import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync,readFileSync,writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { agentRoles } from "../packages/contracts/workflow";
import { AGENT_INSTRUCTION_VERSION,defaultAgentSettings,FLASH_MODEL,IMAGE_MODEL,sharedAgentInstructions } from "../packages/agents/defaults";
import { instructionUpdateRows,type StoredAgent } from "../packages/agents/agent-settings";

async function main(){
 const env={...process.env,...parseEnv(readFileSync(".env.local","utf8"))};
 const tenant=env.STUDIO_SHARED_TENANT_ID??"10000000-0000-4000-8000-000000000001";
 assert.equal(defaultAgentSettings.length,14);assert.equal(new Set(defaultAgentSettings.map(a=>a.role)).size,agentRoles.length);
 for(const agent of defaultAgentSettings){assert.ok(agent.instructions.length>3000&&agent.instructions.length<=12000);assert.ok(agent.max_output_tokens<=32768);}
 const response=await fetch("https://openrouter.ai/api/v1/models",{signal:AbortSignal.timeout(15000)});assert.ok(response.ok);const catalog=await response.json();
 const text=catalog.data.find((m:{id:string})=>m.id===FLASH_MODEL),image=catalog.data.find((m:{id:string})=>m.id===IMAGE_MODEL);
 assert.ok(text?.architecture.output_modalities.length===1&&text.architecture.output_modalities[0]==="text");assert.ok(text.supported_parameters.includes("max_tokens")&&text.supported_parameters.includes("response_format"));assert.ok(image?.architecture.output_modalities.includes("image"));
 for(const model of [text,image])assert.ok(Number.isFinite(Number(model.pricing.prompt))&&Number.isFinite(Number(model.pricing.completion)));
 const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}});
 const before=await admin.from("studio_agents").select("*").eq("tenant_id",tenant);if(before.error)throw new Error("Supabase agent settings are not available.");
 const stamp=new Date().toISOString();mkdirSync("artifacts/model-setup",{recursive:true});
 writeFileSync(`artifacts/model-setup/agents-before-${Date.now()}.json`,JSON.stringify(before.data,null,2),{mode:0o600});
  await admin.from("tenants").upsert({id:tenant,name:"Toggle Studio"});
 // Models, output limits and step caps belong to Models & agents: only instructions are refreshed for existing roles.
 const saved=await admin.from("studio_agents").upsert(instructionUpdateRows((before.data??[]) as StoredAgent[],tenant,stamp));if(saved.error)throw new Error(`Could not save agent defaults: ${saved.error.message}`);
 const after=await admin.from("studio_agents").select("role,model_id,instructions,max_output_tokens,step_cap_micro_usd").eq("tenant_id",tenant);if(after.error)throw new Error("Could not verify saved settings.");
 for(const expected of defaultAgentSettings){const actual:{role:string;model_id:string|null;instructions:string;max_output_tokens:number;step_cap_micro_usd:number}|undefined=after.data.find(a=>a.role===expected.role);assert.ok(actual);assert.equal(actual.instructions,expected.instructions);const prior:StoredAgent|undefined=((before.data??[]) as StoredAgent[]).find(a=>a.role===expected.role);if(prior){assert.equal(actual.model_id,prior.model_id);assert.equal(actual.max_output_tokens,prior.max_output_tokens);assert.equal(actual.step_cap_micro_usd,prior.step_cap_micro_usd);}}
 const report={savedAt:stamp,instructionVersion:AGENT_INSTRUCTION_VERSION,project:new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname,roles:after.data.map(a=>({role:a.role,model:a.model_id,instructionCharacters:a.instructions.length,instructionSha256:createHash('sha256').update(a.instructions).digest('hex'),maxOutputTokens:a.max_output_tokens,stepCapMicroUsd:a.step_cap_micro_usd})),textPricing:text.pricing,imagePricing:image.pricing,paidRequests:0,interfaceTests:0};
 writeFileSync("artifacts/model-setup/applied.json",JSON.stringify(report,null,2),{mode:0o600});
 const header=`# Agent instructions\n\nVersion ${AGENT_INSTRUCTION_VERSION}. These instructions are saved in Supabase and editable in Models & agents. Models, output limits and step caps are chosen in Models & agents (new roles start with ${FLASH_MODEL} for text and ${IMAGE_MODEL} for images). Video/3D have no assigned generation provider. Image generation is assigned but its execution adapter remains unavailable.\n\nThe common policy below is prepended verbatim to every role-specific section.\n\n## Common policy\n\n${sharedAgentInstructions}\n`;
 writeFileSync("docs/agent-instructions.md",header+defaultAgentSettings.map(a=>`\n## ${a.role}\n\nDefault for a new role: ${a.model_id??"unassigned; capability unavailable"}, ${a.max_output_tokens} output tokens, step cap $${(a.step_cap_micro_usd/1000000).toFixed(2)}. The live values are in Models & agents.\n\n${a.instructions.slice(sharedAgentInstructions.length).trim()}\n`).join(""));
 console.log(`Saved and verified all 14 agent instructions in hosted Supabase. Existing models, output limits and step caps were kept. No paid requests or interface tests.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Agent configuration failed");process.exitCode=1;});
