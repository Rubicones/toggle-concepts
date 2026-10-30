import "server-only";
import {currentDraftRound} from "@/packages/data/current-draft-round";
import {ApiError} from "./api";
import {campaignRecord,studioContext,checked} from "./studio";
import {schemaMissing} from "./brief";
import {draftHash} from "@/packages/creative/compiler";
import {draftPlanSchema,type DraftSource} from "@/packages/contracts/drafts";
import type {DraftContext} from "@/packages/creative/compiler";
export function draftDbError(error:{message:string;code?:string}|null){
 if(!error)return;if(schemaMissing(error))throw new ApiError(503,"M07_SCHEMA_REQUIRED","Apply the M07 migration from Settings.");
 const messages:Record<string,string>={STALE_DRAFT_PLAN:"The assembly plan changed. Reload before saving or building.",STALE_DRAFT_INPUTS:"Inputs differ from the queued build. Save a new plan revision before building again.",PLANNING_REQUIRED:"Finish all six planning jobs before proposing or compiling drafts.",A1_REQUIRED:"Accept A1 and start the checkpoint planning workflow first.",WORKFLOW_BLOCKED:"Resolve the workflow blocker before compiling.",INVALID_DRAFT_ASSET:"Select validated media from this campaign.",REPLAY_ASSET_REUSE_BLOCKED:"Choose new generated draft candidates for this replay; original supplied sources can be reused.",DRAFT_REVIEW_LOCKED:"This batch has been offered at A2. Client C2 feedback opens a new draft round.",RETRY_BLOCKED:"This local build exhausted its three attempts. Resolve the compiler issue and save a revised plan before rebuilding.",INCOMPLETE_DRAFT_BATCH:"The compiler did not return three complete directions for every ordered row."};
 const code=Object.keys(messages).find(k=>error.message.includes(k));if(code)throw new ApiError(409,code,messages[code]);throw new Error(error.message);
}
export async function draftContext(campaignId:string,allowInactive=false){
 const campaign=await campaignRecord(campaignId),base=await studioContext(),{admin,tenant}=base;
 const roundResult=await currentDraftRound(admin,tenant,campaign.id);draftDbError(roundResult.error);
 const round=roundResult.data;if(!round||(!allowInactive&&round.status!=="active")||!round.a1_id)throw new ApiError(409,"DRAFT_ROUND_REQUIRED","Accept A1, then start planning in this campaign’s Drafts tab.");
 const [cp,a1,plan,assets,jobs,run]=await Promise.all([
  admin.from("studio_c1_checkpoints").select("payload,brief_text").eq("id",round.origin_c1_id).eq("tenant_id",tenant).single(),
  admin.from("studio_a1_reviews").select("brand_revision_id").eq("id",round.a1_id).eq("tenant_id",tenant).eq("decision","accepted").single(),
  admin.from("studio_draft_plans").select("*").eq("round_id",round.id).maybeSingle(),
  admin.from("asset_revisions").select("id,mime,bytes,sha256,filename,inspection").eq("tenant_id",tenant).eq("campaign_id",campaign.id).order("id"),
  admin.from("studio_workflow_jobs").select("id,job_key,state,output,output_hash,created_at,blocker").eq("round_id",round.id).order("job_key"),
  admin.from("studio_runs").select("*").eq("id",round.run_id).eq("tenant_id",tenant).single(),
 ]);for(const result of [cp,a1,plan,assets,jobs,run])draftDbError(result.error);
 const brand=checked(await admin.from("studio_brand_revisions").select("id,payload").eq("id",a1.data!.brand_revision_id).eq("tenant_id",tenant).single());if(!brand)throw new Error("A1_REQUIRED");
 const context:DraftContext={submittedBrief:JSON.parse(cp.data!.brief_text),scope:cp.data!.payload.scope,manifest:cp.data!.payload.variantManifest,brand:{id:brand.id,kit:brand.payload.kit},scriptRevisionId:`script-${jobs.data?.find(j=>j.job_key==="script")?.id??"missing"}`,assets:(assets.data??[]) as DraftSource[],planningRefs:(jobs.data??[]).filter(j=>["research","strategy","variants","script","localization","asset-plan"].includes(j.job_key)&&j.state==="succeeded").map(j=>({id:j.id,sha256:j.output_hash}))};
 return {...base,campaign,round,context,plan:plan.data?{...plan.data,payload:draftPlanSchema.parse(plan.data.payload)}:null,jobs:jobs.data??[],run:run.data!};
}
export function buildSnapshot(saved:Awaited<ReturnType<typeof draftContext>>){
 if(!saved.plan)throw new ApiError(409,"PLAN_REQUIRED","Save the assembly plan first.");
 const plan=draftPlanSchema.parse(saved.plan.payload);
 const ids=new Set(plan.directions.flatMap(d=>d.bindings.flatMap(b=>[b.heroAssetId,b.logoAssetId,b.audioAssetId].filter(Boolean))));
 return {schemaVersion:"1.0",planVersion:saved.plan.version,planHash:draftHash(plan),plan,context:{...saved.context,assets:saved.context.assets.filter(a=>ids.has(a.id))}};
}
