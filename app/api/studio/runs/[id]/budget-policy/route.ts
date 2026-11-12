import { z } from "zod";
import { api, body, json, ApiError } from "@/lib/server/api";
import { studioContext, checked } from "@/lib/server/studio";
import { localModeState } from "@/lib/server/local-mode";
import { startLocalWorkflow } from "@/lib/server/local-compute";
import { continueWithoutReapproval } from "@/packages/director/auto-continue";

// Budget re-approval for one Local run's preview build. 'skip': a draft direction that uses a role's allowance
// continues through the same priced extension without asking; costs are still counted and the run can be stopped.
// Only for a Local Claude run, from the computer it runs on. Switching it on also continues directions already waiting.
type Params={params:Promise<{id:string}>};
const policyReady=async(admin:Awaited<ReturnType<typeof studioContext>>["admin"])=>!(await admin.rpc("studio_budget_policy_version")).error;

export async function GET(_request:Request,{params}:Params){return api(async()=>{
 const runId=z.uuid().parse((await params).id),{admin,tenant}=await studioContext(),state=await localModeState();
 if(!await policyReady(admin))return json({available:false,reason:"Apply migration 20261112000100_local_preview_budget_policy.sql in Supabase first."});
 const exec=checked(await admin.from("studio_text_executions").select("mode,device_id").eq("tenant_id",tenant).eq("scope_kind","run").eq("scope_id",runId).maybeSingle()) as {mode:string;device_id:string|null}|null;
 if(exec?.mode!=="local_claude")return json({available:false,reason:"This run uses OpenRouter; its continuation prices are approved as before."});
 const policy=checked(await admin.from("studio_run_budget_policy").select("policy,updated_at").eq("run_id",runId).maybeSingle()) as {policy:string;updated_at:string}|null;
 const here=!!state.device&&state.device.id===exec.device_id;
 return json({available:here,policy:policy?.policy??"ask",updatedAt:policy?.updated_at??null,...(here?{}:{reason:"This run belongs to another computer; change it there."})});
});}

const input=z.strictObject({policy:z.enum(["ask","skip"])});
export async function PUT(request:Request,{params}:Params){return api(async()=>{
 const runId=z.uuid().parse((await params).id),{policy}=await body(request,input),{admin,tenant,actorId}=await studioContext(),state=await localModeState();
 if(!state.device)throw new ApiError(409,"LOCAL_DEVICE_NOT_SET_UP",state.blocked??"This computer is not set up for Local mode.");
 if(!await policyReady(admin))throw new ApiError(503,"BUDGET_POLICY_SCHEMA_REQUIRED","Apply migration 20261112000100_local_preview_budget_policy.sql in Supabase first.");
 const r=await admin.rpc("studio_set_run_budget_policy",{target_run:runId,acting_user:actorId,device:state.device.id,new_policy:policy});
 if(r.error){const m=r.error.message;throw new ApiError(409,"BUDGET_POLICY_UNAVAILABLE",/LOCAL_RUN_REQUIRED/.test(m)?"Only Local runs can continue without re-approval.":/LOCAL_DEVICE_MISMATCH/.test(m)?"This run belongs to another computer; change it there.":/RUN_NOT_ACTIVE/.test(m)?"This run has ended; nothing to continue.":"The policy could not be saved.");}
 if(policy==="ask")return json({policy,continued:0,message:"Budget re-approval is on for this run: each continuation price waits for your approval."});
 // Directions of this run that already wait on a role's allowance continue now, once each.
 const blocks=checked(await admin.from("studio_director_blocks").select("id").eq("tenant_id",tenant).eq("run_id",runId))??[];
 const waiting=blocks.length?checked(await admin.from("studio_director_work").select("block_id,direction_id").in("block_id",blocks.map(b=>b.id)).eq("status","review"))??[]:[];
 let continued=0;for(const w of waiting){const out=await continueWithoutReapproval(admin,{blockId:w.block_id,directionId:w.direction_id,device:state.device.id});if(out.continued)continued++;}
 if(continued)await startLocalWorkflow();
 return json({policy,continued,message:`Budget re-approval is off for this local preview: it continues without asking for new prices. Costs are still counted and you can stop it at any time.${continued?` ${continued} waiting direction${continued===1?"":"s"} continued now.`:""}`});
});}
