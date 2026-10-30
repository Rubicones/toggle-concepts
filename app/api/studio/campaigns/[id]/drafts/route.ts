import {findProgram} from '@/packages/creative/program-reader';
import {creativeStart} from '@/lib/server/creative-drafts';
import {z} from "zod";
import {api,body,json,ApiError} from "@/lib/server/api";
import {draftContext} from "@/lib/server/drafts";
import {studioContext,checked,campaignRecord} from "@/lib/server/studio";
import {schemaMissing} from "@/lib/server/brief";
import {draftRequestSchema} from "@/packages/contracts/drafts";
import {requireLocalDevice} from "@/lib/server/local-compute";
export async function GET(request:Request,ctx:RouteContext<"/api/studio/campaigns/[id]/drafts">){return api(async()=>{
 const {id}=await ctx.params;await campaignRecord(z.uuid().parse(id));const {admin,tenant}=await studioContext();
 const [schema,workflow,c1,a1]=await Promise.all([admin.from("studio_draft_plans").select("round_id").limit(0),admin.from("studio_workflow_rounds").select("id").limit(0),admin.from("studio_c1_checkpoints").select("id").limit(0),admin.from("studio_a1_reviews").select("id").limit(0)]);
 if([schema,workflow,c1,a1].some(r=>r.error&&schemaMissing(r.error)))return json({schemaReady:!schema.error,workflowReady:!workflow.error,c1Ready:!c1.error,a1Ready:!a1.error,round:null,c1:null,plan:null,assets:[],batches:[],jobs:[],proposals:[]});
 let saved:Awaited<ReturnType<typeof draftContext>>;try{saved=await draftContext(id,true);}catch(e){if(e instanceof ApiError&&e.code==="DRAFT_ROUND_REQUIRED")return json({schemaReady:true,workflowReady:true,c1Ready:true,a1Ready:true,round:null,c1:null,plan:null,assets:[],batches:[],jobs:[],proposals:[]});throw e;}
 const params=new URL(request.url).searchParams,batchId=params.get("batch"),directionId=params.get("direction"),variantId=params.get("variant");
 // A QA-blocked local build is never a batch, but its compiled programs stay inspectable so the
 // art director can see exactly what failed. Read-only; nothing here certifies or imports it.
 const buildJob=params.get("build");
 if(buildJob){z.uuid().parse(buildJob);const job=checked(await admin.from("studio_workflow_jobs").select("id,kind,state,output,payload").eq("id",buildJob).eq("tenant_id",tenant).eq("campaign_id",id).eq("kind","compile").single());if(!job?.output)throw new ApiError(404,"BUILD_NOT_FOUND","This local build has no saved result.");
  let result:{programs?:{directionId:string;variantId:string}[];qa?:{issues?:{directionId?:string;variantId?:string}[]}};try{result=JSON.parse(job.output);}catch{throw new ApiError(409,"BUILD_UNREADABLE","The saved local build cannot be read.");}
  const program=result.programs?.find(p=>p.directionId===directionId&&p.variantId===variantId);if(!program)throw new ApiError(404,"BINDING_NOT_FOUND","This build did not produce that variant. Its issues are listed on the run page.");
  return json({program,hash:null,historical:Number(job.payload?.planVersion)!==saved.plan?.version,qaFailed:job.state!=="succeeded",issues:(result.qa?.issues??[]).filter(i=>(!i.directionId||i.directionId===directionId)&&(!i.variantId||i.variantId===variantId))});}
 if(batchId){z.uuid().parse(batchId);const batch=checked(await admin.from("studio_draft_batches").select("id,sha256,payload,source_plan_version").eq("id",batchId).eq("tenant_id",tenant).eq("campaign_id",id).single());if(!batch)throw new ApiError(404,"BATCH_NOT_FOUND","Draft batch not found.");
  if(params.get("report")==="true")return json({qa:batch.payload.qa});
  const program=findProgram(batch.payload,directionId??'',variantId??'');if(!program)throw new ApiError(404,"BINDING_NOT_FOUND","That draft binding is not in this batch.");return json({program,hash:batch.sha256,historical:batch.source_plan_version!==saved.plan?.version});}
 const creativeProbe=await admin.from('studio_creative_blocks').select('round_id').eq('round_id',saved.round.id).eq('tenant_id',tenant).maybeSingle();
 const [batches,proposals]=await Promise.all([admin.from("studio_draft_batches").select("id,sha256,source_plan_version,summary,created_at").eq("tenant_id",tenant).eq("round_id",saved.round.id).order("created_at",{ascending:false}).limit(20),admin.from("studio_agent_steps").select("id,status,output,error_code,config_snapshot").eq("tenant_id",tenant).eq("run_id",saved.run.id).eq("role","creative-code").order("created_at",{ascending:false}).limit(20)]);
 return json({creativeActive:!!creativeProbe.data,schemaReady:true,workflowReady:true,c1Ready:true,a1Ready:true,round:saved.round,c1:{scope:saved.context.scope,variantManifest:saved.context.manifest},plan:saved.plan,assets:saved.context.assets,batches:checked(batches),jobs:saved.jobs.filter(j=>j.job_key.startsWith("draft-compile")),proposals:checked(proposals)});
});}
export async function PUT(){return api(async()=>{throw new ApiError(410,'LEGACY_CREATIVE_READ_ONLY','Historical assembly plans are read-only. Use Draft versions for new creative work.');});}
export async function POST(request:Request,ctx:RouteContext<"/api/studio/campaigns/[id]/drafts">){return api(async()=>{const {id}=await ctx.params;z.uuid().parse(id);const input=await body(request,draftRequestSchema);if(input.action==='import')throw new ApiError(410,'LEGACY_CREATIVE_READ_ONLY','Historical slot-based proposals are read-only.');requireLocalDevice();return json(await creativeStart(id));});}
