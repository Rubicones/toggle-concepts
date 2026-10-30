import {api,body,json,ApiError} from "@/lib/server/api";
import {studioContext,checked} from "@/lib/server/studio";
import {schemaMissing} from "@/lib/server/brief";
import {workflowCommandSchema} from "@/packages/contracts/orchestration";
import {requireLocalDevice,startLocalWorkflow} from "@/lib/server/local-compute";
import {z} from "zod";
function workflowError(error:{message:string;code?:string}|null){
 if(!error)return;
 if(schemaMissing(error))throw new ApiError(503,"WORKFLOW_SCHEMA_REQUIRED","Apply migration 006 in Settings first.");
 const messages:Record<string,string>={C1_REQUIRED:"Submit C1 first. Manual runs cannot start the production graph.",A1_REQUIRED:"Accept the Brand Kit through A1 before starting planning.",RETRY_BLOCKED:"Only a known failed job with fewer than three attempts can be retried. Unknown submissions require reconciliation.",WORKFLOW_CANCELLED:"This workflow was cancelled and cannot be resumed. Its history and cumulative charges are retained.",FORBIDDEN:"The studio actor cannot control this workflow."};
 const code=Object.keys(messages).find(k=>error.message.includes(k));if(code)throw new ApiError(409,code,messages[code]);throw new Error(error.message);
}
export async function GET(request:Request){return api(async()=>{
 const {admin,tenant}=await studioContext();const campaign=new URL(request.url).searchParams.get("campaign");if(campaign)z.uuid().parse(campaign);
 const ready=await admin.from("studio_workflow_rounds").select("id").limit(0);
 if(ready.error&&schemaMissing(ready.error))return json({schemaReady:false,rounds:[],jobs:[],attempts:[],dependencies:[],devices:[]});workflowError(ready.error);
 workflowError((await admin.rpc("studio_recover_workflow",{target_tenant:tenant})).error);
 let query=admin.from("studio_workflow_rounds").select("*").eq("tenant_id",tenant);
 if(campaign)query=query.eq('campaign_id',campaign);
 const rounds=await query.order("created_at",{ascending:false}).limit(200);workflowError(rounds.error);
 const selected=rounds.data??[],ids=selected.map(r=>r.id);
 const jobs=ids.length?checked(await admin.from("studio_workflow_jobs").select("id,round_id,campaign_id,run_id,job_key,role,kind,state,blocker,attempt_count,lease_until,output,output_hash,initial_step_id,created_at,input_hash,config_hash").eq("tenant_id",tenant).in("round_id",ids).order("created_at").limit(1000)):[];
 const jobIds=(jobs??[]).map(j=>j.id);
 const [attempts,dependencies,devices]=await Promise.all([
  jobIds.length?admin.from("studio_workflow_attempts").select("id,job_id,attempt_no,state,step_id,error_code,created_at,finished_at,late_receipt").in("job_id",jobIds).order("created_at",{ascending:false}).limit(3000):Promise.resolve({data:[],error:null}),
  jobIds.length?admin.from("studio_workflow_dependencies").select("job_id,requires_id").in("job_id",jobIds):Promise.resolve({data:[],error:null}),
  admin.from("studio_workflow_devices").select("id,name,state,heartbeat_at").eq("tenant_id",tenant).order("heartbeat_at",{ascending:false}).limit(10),
 ]);
 return json({schemaReady:true,rounds:selected,jobs:jobs??[],attempts:checked(attempts),dependencies:checked(dependencies),devices:(checked(devices)??[]).map(d=>({...d,online:d.state==="online"&&Date.now()-Date.parse(d.heartbeat_at)<45000}))});
});}
export async function POST(request:Request){return api(async()=>{
 const command=await body(request,workflowCommandSchema);const {admin,tenant,actorId}=await studioContext();
 if(command.action==="start"){
  requireLocalDevice();if(!process.env.OPENROUTER_API_KEY)throw new Error("PROVIDER_NOT_CONFIGURED");
  const run=checked(await admin.from("studio_runs").select("id").eq("id",command.runId).eq("tenant_id",tenant).maybeSingle());if(!run)throw new ApiError(404,"RUN_NOT_FOUND","Run not found.");
  const result=await admin.rpc("studio_start_workflow",{target_run:command.runId,acting_user:actorId});workflowError(result.error);await startLocalWorkflow();if(result.data.status!=="active")return json({round:result.data,message:"This round is complete or cancelled. Its history and budgets are retained."});return json({round:result.data,message:"Planning queued. Real provider calls use the frozen models and cumulative role/run budgets."},202);
 }
 const round=checked(await admin.from("studio_workflow_rounds").select("id").eq("id",command.roundId).eq("tenant_id",tenant).maybeSingle());if(!round)throw new ApiError(404,"WORKFLOW_NOT_FOUND","Workflow not found.");
 if(command.action==="retry"||command.action==="resume")requireLocalDevice();
 workflowError((await admin.rpc("studio_control_workflow",{target_round:command.roundId,action:command.action,target_job:command.action==="retry"?command.jobId:null,acting_user:actorId})).error);
 if(command.action==="retry"||command.action==="resume")await startLocalWorkflow();
 return json({message:command.action==="cancel"?"Cancelled. Submitted calls may still incur charges; late output cannot become active.":command.action==="pause"?"Paused. Current submissions may finish and settle; new jobs will wait.":"Queued work can continue within its existing cumulative caps."});
});}
