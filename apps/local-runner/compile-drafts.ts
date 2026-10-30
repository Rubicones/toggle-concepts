import {createHash} from "node:crypto";
import {adminClient,checked,sharedTenant} from "../../packages/data/shared-runtime";
import {objectStore} from "../../packages/media/s3.server";
import {canonicalJson} from "../../packages/contracts/common";
import {prepareDrafts,finishDrafts,type DraftContext} from "../../packages/creative/compiler";
import {measureDraftText} from "../../packages/creative/measure.local";
import type {DraftPlan} from "../../packages/contracts/drafts";
export async function compileDraftClaim(job:{id:string;lease_token:number;payload:unknown},device:string){
 const admin=adminClient(),payload=job.payload as {plan:DraftPlan;context:DraftContext};
 const finish=async(value:unknown,failure:string|null)=>checked(await admin.rpc("studio_finish_draft_compile",{target_job:job.id,token:job.lease_token,device,source:canonicalJson(value),failure}));
 try{
  checked(await admin.rpc("studio_begin_draft_compile",{target_job:job.id,token:job.lease_token,device}));
  const prepared=prepareDrafts(payload.plan,payload.context);
  if(prepared.compilation.qa.issues.length){await finish(prepared.compilation,null);return;}
  // Inspect immutable private bytes again by digest before certifying a media binding.
  for(const ref of prepared.compilation.sourceAssets){
   const source=checked(await admin.from("asset_revisions").select("object_key,sha256,bytes").eq("id",ref.id).eq("tenant_id",sharedTenant).eq("campaign_id",payload.context.scope.campaignId).single());
   if(!source||source.sha256!==ref.sha256)throw new Error("SOURCE_REVISION_CHANGED");
   const bytes=(await objectStore().get(source.object_key)).body;
   if(bytes.length!==source.bytes||createHash("sha256").update(bytes).digest("hex")!==ref.sha256)throw new Error("SOURCE_BYTES_CHANGED");
  }
  const measured=await measureDraftText(prepared.tasks),compilation=finishDrafts(prepared.compilation,measured.fits,measured.engine);
  await finish(compilation,null);
 }catch(error){const known=["FONT_HASH_MISMATCH","SOURCE_REVISION_CHANGED","SOURCE_BYTES_CHANGED","LEASE_LOST","RUN_NOT_ACTIVE","STORAGE_UNAVAILABLE","INCOMPLETE_DRAFT_BATCH","STALE_DRAFT_INPUTS"];const code=error instanceof Error&&known.includes(error.message)?error.message:"LOCAL_COMPILER_UNAVAILABLE";
  await finish({schemaVersion:"1.0",qa:{passed:false,issues:[{code,message:code==="LOCAL_COMPILER_UNAVAILABLE"?"Check that local Chrome is installed and the saved plan is valid, then retry the local build.":code}]}},code);
 }
}
