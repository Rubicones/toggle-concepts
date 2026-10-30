import {directorImageAdmission} from '@/lib/server/director-image';
import {effectiveRunAgents} from '@/packages/data/run-limits';
import { z } from "zod";
import { api,body,json,ApiError } from "@/lib/server/api";
import { studioContext,checked,campaignRecord } from "@/lib/server/studio";
import { modelCatalog } from "@/lib/server/providers";
import { imageOptionsSchema } from "@/packages/contracts/image-generation";
import {resolveImageReferences,imageReferenceTokenBound} from "@/packages/agents/image-references";
import { quoteImage } from "@/packages/agents/image-provider";
import { requireLocalDevice,startLocalImage,startLocalWorkflow } from "@/lib/server/local-compute";
import { schemaMissing } from "@/lib/server/brief";
import { savedBrandInputs } from "@/lib/server/brand-kit";
import { brandDigest,brandProposalPrompt } from "@/packages/data/brand-snapshot";
import {agentStepDetailColumns} from '@/packages/data/studio-projections';
export async function GET(request:Request,ctx:RouteContext<'/api/studio/runs/[id]/steps'>){return api(async()=>{
 const {id}=await ctx.params,stepId=z.uuid().parse(new URL(request.url).searchParams.get('step')),{admin,tenant}=await studioContext();
 const step=checked(await admin.from('studio_agent_steps').select(agentStepDetailColumns).eq('tenant_id',tenant).eq('run_id',z.uuid().parse(id)).eq('id',stepId).maybeSingle());
 if(!step)throw new ApiError(404,'STEP_NOT_FOUND','Agent step not found.');
 await campaignRecord(step.campaign_id);return json(step);
});}
export async function POST(request:Request,ctx:RouteContext<"/api/studio/runs/[id]/steps">){return api(async()=>{
 const {id}=await ctx.params;z.uuid().parse(id);const input=await body(request,z.strictObject({role:z.string().min(1).max(60),prompt:z.string().trim().min(1).max(16000),requestId:z.uuid(),image:imageOptionsSchema.optional(),director:z.strictObject({blockId:z.uuid(),directionId:z.uuid(),resourceId:z.uuid(),maxCostMicroUsd:z.number().int().positive()}).optional(),creative:z.strictObject({compileJobId:z.uuid().optional(),roundId:z.uuid(),direction:z.number().int().min(0).max(2),packHash:z.string().regex(/^[a-f0-9]{64}$/),repair:z.boolean(),maxCostMicroUsd:z.number().int().positive().optional()}).optional(),brandDraftVersion:z.number().int().positive().optional()}));
 if(input.brandDraftVersion&&input.role!=="brand-kit")throw new ApiError(400,"INVALID_BRAND_TASK","A saved Brand Kit draft applies only to the brand-kit agent.");
 if(Boolean(input.creative))throw new ApiError(410,'LEGACY_CREATIVE_READ_ONLY','Historical creative image requests are read-only.');
 if(input.director&&(input.creative||input.role!=='image'))throw new ApiError(400,'INVALID_DIRECTOR_RESOURCE','A director resource uses the image role.');
 const prompt=input.brandDraftVersion?brandProposalPrompt(input.prompt):input.prompt;z.string().max(16000).parse(prompt);
 if(!process.env.OPENROUTER_API_KEY)throw new Error("PROVIDER_NOT_CONFIGURED");
 const {admin,tenant,actorId}=await studioContext();const run=checked(await admin.from("studio_runs").select("*").eq("tenant_id",tenant).eq("id",id).single());const campaign=await campaignRecord(run.campaign_id);
 if(["video","model3d"].includes(input.role))throw new Error("MEDIA_AGENT_UNAVAILABLE");
 const isImage=input.role==="image";requireLocalDevice();if(!isImage&&input.image)throw new Error("IMAGE_OPTIONS_INVALID");
 if(isImage){const ready=await admin.from('studio_provider_reconciliations').select('id').limit(0);if(ready.error)throw new ApiError(503,'M09_SCHEMA_REQUIRED','Apply the M09 migration from Settings before submitting image requests. No generation was submitted.');}
 const prior=checked(await admin.from("studio_agent_steps").select("*").eq("tenant_id",tenant).eq("request_id",input.requestId).maybeSingle());
 if(prior){if(prior.run_id!==id||prior.role!==input.role||prior.prompt!==prompt||((prior.config_snapshot.brandDraftVersion??undefined)!==input.brandDraftVersion)||(isImage&&(prior.config_snapshot.imageQuote?.aspectRatio!==(input.image?.aspectRatio??"1:1")||JSON.stringify((prior.config_snapshot.imageReferences??[]).map((r:{id:string})=>r.id))!==JSON.stringify(input.image?.referenceAssetIds??[]))))throw new Error("REQUEST_CONFLICT");if(prior.status==="reserved"){if(isImage)await startLocalImage(prior.id);else await startLocalWorkflow();}return json({id:prior.id,status:prior.status},202);}
 const agent=(await effectiveRunAgents(admin,run)).find(a=>a.role===input.role);
 if(!agent?.model_id)throw new Error("AGENT_NOT_CONFIGURED");const model=(await modelCatalog()).find(m=>m.id===agent.model_id);if(!model||(isImage?!model.outputModalities.includes("image"):model.outputModalities.length!==1||model.outputModalities[0]!=="text"))throw new Error("MODEL_UNAVAILABLE");
 // Older saved settings gave brand alignment 3,600 tokens, which a full kit can exceed. Floor it at the current default.
 const maxOutput=Math.min(input.role==="brand-kit"?Math.max(agent.max_output_tokens,16384):agent.max_output_tokens,model.maxOutput);
 // UTF-8 byte count is a conservative token bound, plus chat/system overhead.
 const c1=await admin.from("studio_c1_checkpoints").select("id,payload,brief_text").eq("tenant_id",tenant).eq("run_id",id).maybeSingle();if(c1.error&&!schemaMissing(c1.error))throw new Error("DATABASE_UNAVAILABLE");
 const brand=input.brandDraftVersion?await savedBrandInputs(campaign.id,input.brandDraftVersion):null;if(brand&&brand.c1.runId!==id)throw new ApiError(409,"C1_RUN_REQUIRED","Use the production run belonging to this C1 checkpoint.");
 const currentDraft=c1.data?checked(await admin.from("studio_brand_drafts").select("round_no").eq("tenant_id",tenant).eq("campaign_id",campaign.id).maybeSingle()):null;
 const a1=c1.data?await admin.from("studio_a1_reviews").select("id,sha256,brand_revision_id,payload").eq("tenant_id",tenant).eq("run_id",id).eq("decision","accepted").eq("round_no",currentDraft?.round_no??1).maybeSingle():null;if(a1?.error&&!schemaMissing(a1.error))throw new Error("DATABASE_UNAVAILABLE");
 const acceptedKit=a1?.data?checked(await admin.from("studio_brand_revisions").select("id,sha256,payload").eq("tenant_id",tenant).eq("run_id",id).eq("id",a1.data.brand_revision_id).single()):null;
 const campaignContext=c1.data?{mode:"c1_working",campaignId:campaign.id,checkpointId:c1.data.id,scope:c1.data.payload.scope,variantManifest:c1.data.payload.variantManifest,submittedBrief:JSON.parse(c1.data.brief_text),acceptedBrandKit:acceptedKit,acceptedA1:a1?.data??null,brandInputSnapshot:brand?.inputSnapshot??null,unacceptedBrandKitNotes:acceptedKit?null:campaign.document?.brandKit??null,checkpointState:acceptedKit?"C1 and A1 are accepted at these exact revisions. A2/A3/C2/C3 have not been supplied; this task does not run or approve the full production workflow.":"C1 submitted. A1/A2/A3 and C2/C3 have not been supplied. This manual task does not execute or approve the production workflow."}:{mode:"manual",campaignId:campaign.id,revision:campaign.version,name:campaign.name,brand:campaign.brand,goal:campaign.goal,brief:campaign.document?.brief??null,brandKit:campaign.document?.brandKit??null,checkpointState:"No accepted production checkpoint was supplied. These are manual working materials."};
 const referenceIds=input.image?.referenceAssetIds??[];let imageReferences:ReturnType<typeof resolveImageReferences>=[];
 if(isImage&&referenceIds.length){const assets=checked(await admin.from('asset_revisions').select('id,sha256,mime,bytes,inspection').eq('tenant_id',tenant).eq('campaign_id',campaign.id).in('id',referenceIds))??[];try{imageReferences=resolveImageReferences(referenceIds,assets);}catch{throw new ApiError(409,'INVALID_IMAGE_REFERENCES','Select up to three validated PNG/JPEG/WebP references from this campaign, no more than 2MP/2048px each and 10 MiB combined.');}}
 const referenceTokens=imageReferenceTokenBound(imageReferences);
 // A creative draft still needs only its prompt pack (it already carries the brand look). Sending the whole C1 brief,
 // Brand Kit and 128-entry manifest to an image model wastes its context and can exceed it.
 const requestContext=input.director&&isImage?{mode:'creative_still',campaignId:campaign.id,checkpointId:c1.data?.id??null}:input.creative&&isImage?{mode:"creative_still",campaignId:campaign.id,checkpointId:c1.data?.id??null,direction:input.creative.direction,note:"Draft still for one approved storyboard scene. Draw only the described picture: no text, logos or UI."}:campaignContext;
 const inputBound=Buffer.byteLength(prompt+agent.instructions+JSON.stringify(requestContext)+JSON.stringify(imageReferences),"utf8")+2048;
 // An image answer is the picture (~1,290 tokens) plus a short caption; the model's full text maximum is not reserved twice.
 if(inputBound+referenceTokens+(isImage?1290+Math.min(model.maxOutput,4096):maxOutput)>model.contextLength)throw new Error("PROMPT_TOO_LONG");
 const imageQuote=isImage?await quoteImage(model.id,input.image?.aspectRatio??"1:1",model.inputPrice,inputBound,model.outputPrice,model.maxOutput,undefined,{count:imageReferences.length,tokens:referenceTokens}):null;
 if(input.creative&&(!input.creative.maxCostMicroUsd||!imageQuote||imageQuote.reservation>input.creative.maxCostMicroUsd))throw new ApiError(409,'MEDIA_PRICE_CHANGED','Review the current still price before any image request.');
 const reservation=imageQuote?.reservation??Math.max(1,Math.ceil((inputBound*model.inputPrice+maxOutput*model.outputPrice)*1000000*1.1));
 const draftRound=checked(await admin.from("studio_workflow_rounds").select("id").eq("tenant_id",tenant).eq("run_id",id).eq("kind","draft").order("round_no",{ascending:false}).limit(1).maybeSingle());
 if(input.creative&&(input.role!=='image'||draftRound?.id!==input.creative.roundId))throw new ApiError(409,'STALE_CREATIVE_IMAGE','This image request belongs to another creative round.');
 let creativeRepair=input.creative?.repair??false;
 if(input.creative){
  const block=checked(await admin.from('studio_creative_blocks').select('snapshot').eq('tenant_id',tenant).eq('round_id',input.creative.roundId).maybeSingle()),task=block?.snapshot?.tasks?.find((t:{key:string})=>t.key===`creative.compile.d${input.creative!.direction}`),estimate=task?.payload?.creativeInputs?.mediaEstimate;
  if(!estimate||estimate.perStillMicroUsd<input.creative.maxCostMicroUsd!||!estimate.stillCount)throw new ApiError(409,'MEDIA_PRICE_REQUIRED','Review a current creative estimate that includes this still before requesting it.');
  if(!input.creative.compileJobId)throw new ApiError(409,'MEDIA_PRICE_REQUIRED','This still must belong to the priced local build.');
  const compileJob=checked(await admin.from('studio_workflow_jobs').select('id').eq('id',input.creative.compileJobId).eq('round_id',input.creative.roundId).eq('job_key',`creative.compile.d${input.creative.direction}`).maybeSingle());if(!compileJob)throw new ApiError(409,'STALE_CREATIVE_IMAGE','This local build was superseded; review its current price.');
  const priorImages=checked(await admin.from('studio_agent_steps').select('status,cost_micro_usd').eq('tenant_id',tenant).eq('run_id',id).eq('role','image').eq('config_snapshot->>creativeRoundId',input.creative.roundId).eq('config_snapshot->>creativeDirection',String(input.creative.direction)))??[];
  // A delivered still without a reported exact cost is settled at its reservation; only open or unknown outcomes block.
  if(priorImages.some(s=>['unknown','reserved','running'].includes(s.status)||s.cost_micro_usd===null&&s.status!=='succeeded'))throw new ApiError(409,'UNRESOLVED_PROVIDER_RECEIPT','Reconcile or collect the previous still before submitting another.');
  const buildImages=checked(await admin.from('studio_agent_steps').select('cost_micro_usd').eq('tenant_id',tenant).eq('run_id',id).eq('role','image').eq('config_snapshot->>creativeCompileJobId',input.creative.compileJobId))??[];
  creativeRepair||=buildImages.filter(s=>(s.cost_micro_usd??0)>0).length>=estimate.stillCount;
 }
 const directorFields=input.director?await directorImageAdmission(admin,tenant,id,input.director,prompt,input.requestId,{aspectRatio:input.image?.aspectRatio??'1:1',referenceAssetIds:referenceIds},reservation):{};
 const snapshot={...directorFields,...(input.creative?{creativeRoundId:input.creative.roundId,creativeCompileJobId:input.creative.compileJobId,creativePackHash:input.creative.packHash,creativeRepair,creativeDirection:input.creative.direction}:{}),imageReferences,draftRoundId:draftRound?.id??null,instructions:agent.instructions,maxOutputTokens:maxOutput,stepCapMicroUsd:agent.step_cap_micro_usd,pricing:model,campaignContext:requestContext,imageQuote,brandDraftVersion:input.brandDraftVersion??null,brandInputHash:brand?brandDigest(brand.inputSnapshot):null,budgetScopeId:c1.data?`budget-step-${id}-${input.role}`:null,outputFormat:(!isImage&&agent.instructions.startsWith("You are a specialist in Toggle AI Marketing Studio."))||brand?"json_object":null,disableReasoning:model.id==="google/gemini-2.5-flash",segment:c1.data?"post-C1-working":"manual",round:currentDraft?.round_no??1};
 const admission=await admin.rpc(isImage?"studio_reserve_step":"studio_enqueue_text",{target_run:id,request_key:input.requestId,agent_role:input.role,model:agent.model_id,prompt_text:prompt,snapshot,reservation,...(isImage?{}:{acting_user:actorId})});
 if(admission.error&&schemaMissing(admission.error))throw new ApiError(503,"WORKFLOW_SCHEMA_REQUIRED","Apply migration 006 from Settings to enable durable agent work.");
 const step=checked(admission);
 if(step.status==="reserved"){
  if(isImage){try{await startLocalImage(step.id);}catch{checked(await admin.rpc("studio_finish_step",{target_step:step.id,final_state:"failed",actual_cost:0,result_text:null,provider_generation:null,token_usage:null,failure:"LOCAL_IMAGE_START_FAILED"}));throw new Error("LOCAL_IMAGE_START_FAILED");}}
  else await startLocalWorkflow();
 }
 return json({id:step.id,status:step.status},202);
});}
