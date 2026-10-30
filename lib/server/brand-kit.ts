import "server-only";
import {randomUUID} from "node:crypto";
import {importBrandProposal} from "@/packages/contracts/brand-kit";
import {brandDigest} from "@/packages/data/brand-snapshot";
import {validateBrandbookReferences} from "./brandbook-a1";
import {draftRoundFeedback} from "./draft-round";
import {readyBrandMaterialRefs} from "./brand-intake";
import { ApiError } from "./api";
import { campaignRecord, studioContext, checked } from "./studio";
import { schemaMissing } from "./brief";
import { brandDraftSchema, brandInputErrors } from "@/packages/contracts/brand-kit";
import { brandInputs } from "@/packages/data/brand-snapshot";
import { parseCheckpoint } from "@/packages/contracts/workflow";

export function brandDbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (schemaMissing(error)) throw new ApiError(503, "A1_SCHEMA_REQUIRED", "Apply the Brand Kit/A1 migration from Settings first.");
  const messages: Record<string, string> = { C1_REQUIRED: "Submit C1 before building its Brand Kit.", A1_ALREADY_ACCEPTED: "A1 already accepted an exact Brand Kit revision. Client C2 feedback opens a new full draft round.", STALE_BRAND: "The draft or latest revision changed. Reload before continuing.", A1_REVISION_REVIEWED: "This revision already has an A1 decision. Publish a corrected revision for another review.", BRAND_REVISION_UNCHANGED: "This saved draft already has a revision. Edit and save before publishing another.", A1_BLOCKED: "Resolve all Brand Kit blockers and confirm the three AD attestations before accepting A1.", REQUEST_CONFLICT: "This request ID belongs to a different action.", BRAND_SNAPSHOT_MISMATCH: "The saved inputs or parent revision changed. Reload and publish the current draft.", INVALID_BRAND_SOURCE: "Select only exact validated source revisions belonging to this campaign.", INVALID_PROPOSAL_STEP: "The proposal step does not belong to this C1 run or has no successful provider result." };
  const key = Object.keys(messages).find(k => error.message.includes(k));
  if (key) throw new ApiError(409, key, messages[key]);
  if (error.code === "42501") throw new ApiError(403, "FORBIDDEN", "The studio actor cannot review this campaign.");
  throw new Error("DATABASE_UNAVAILABLE");
}
export async function savedBrandInputs(campaignId: string, expectedVersion: number, allowAccepted = false) {
  await campaignRecord(campaignId); const context = await studioContext(); const { admin, tenant } = context;
  const cpResult = await admin.from("studio_c1_checkpoints").select("id,run_id,payload").eq("tenant_id", tenant).eq("campaign_id", campaignId).maybeSingle(); brandDbError(cpResult.error);
  if (!cpResult.data) throw new ApiError(409, "C1_REQUIRED", "Submit C1 before building its Brand Kit.");
  const [draftResult, assetsResult] = await Promise.all([
    admin.from("studio_brand_drafts").select("version,round_no,payload").eq("tenant_id", tenant).eq("campaign_id", campaignId).maybeSingle(),
    admin.from("asset_revisions").select("id,filename,mime,bytes,sha256").eq("tenant_id", tenant).eq("campaign_id", campaignId),
  ]);
  const accepted=await admin.from("studio_a1_reviews").select("id").eq("tenant_id",tenant).eq("run_id",cpResult.data.run_id).eq("round_no",draftResult.data?.round_no??1).eq("decision","accepted").maybeSingle();
  brandDbError(draftResult.error); brandDbError(accepted.error);
  if (accepted.data && !allowAccepted) throw new ApiError(409, "A1_ALREADY_ACCEPTED", "A1 already accepted this kit. Client C2 feedback opens a new full draft round.");
  if (!draftResult.data || draftResult.data.version !== expectedVersion) throw new ApiError(409, "STALE_BRAND", "Save the latest Brand Kit draft before continuing.");
  const draft = brandDraftSchema.parse(draftResult.data.payload), assets = checked(assetsResult) ?? [], c1 = parseCheckpoint(cpResult.data.payload);
  await validateBrandbookReferences(campaignId,draft);
  const materials=await readyBrandMaterialRefs(campaignId);const errors = brandInputErrors(draft, c1.id, assets,materials); if (errors.length) throw new ApiError(409, "INVALID_BRAND_INPUTS", errors.join(" "));
  return { ...context, c1, draft, assets, materials,round: draftResult.data.round_no, inputSnapshot: {...brandInputs(c1, draft, assets,materials),draftReplay:await draftRoundFeedback(campaignId)} };
}

/** Import a saved, paid response only. Never generates or approves anything. */
export async function importSavedBrandProposal(campaignId:string,expectedVersion:number,stepId:string){
 const {admin,tenant,actorId}=await studioContext();await campaignRecord(campaignId);
 const current=checked(await admin.from('studio_brand_drafts').select('version,payload').eq('tenant_id',tenant).eq('campaign_id',campaignId).single());
 const cp=checked(await admin.from('studio_c1_checkpoints').select('run_id').eq('tenant_id',tenant).eq('campaign_id',campaignId).single());
 if(!cp||!current)throw new ApiError(409,'BRAND_DRAFT_REQUIRED','This run needs its saved C1 and working Brand Kit.');
 const step=checked(await admin.from('studio_agent_steps').select('*').eq('tenant_id',tenant).eq('run_id',cp.run_id).eq('id',stepId).eq('role','brand-kit').single());
 if(!step)throw new ApiError(404,'RESULT_NOT_FOUND','The saved result does not belong to this run.');
 if(current.payload.proposalStepId===stepId)return {version:current.version,draft:brandDraftSchema.parse(current.payload)};
 const saved=await savedBrandInputs(campaignId,expectedVersion);
 if(step.status!=='succeeded'||!step.output||step.config_snapshot.brandDraftVersion!==expectedVersion||step.config_snapshot.brandInputHash!==brandDigest(saved.inputSnapshot))throw new ApiError(409,'STALE_PROPOSAL','This saved result belongs to different inputs. No new AI request was made.');
 let draft;try{draft=importBrandProposal(step.output,saved.draft,step.id,randomUUID,saved.c1.stage==='C1'?{checkpointId:saved.c1.id,briefRevisionId:saved.c1.briefSubmission.revisionId}:undefined);}catch(error){
  const issues=error&&typeof error==='object'&&'issues' in error?JSON.stringify(error.issues):'The saved response is not a complete Brand Kit proposal.';
  throw new ApiError(409,'INVALID_BRAND_PROPOSAL',issues.slice(0,1600));
 }
 await validateBrandbookReferences(campaignId,draft);
 const errors=brandInputErrors(draft,saved.c1.id,saved.assets,saved.materials);if(errors.length)throw new ApiError(409,'INVALID_BRAND_PROPOSAL',errors.join(' '));
 const result=await admin.rpc('studio_save_brand',{target_campaign:campaignId,expected_version:expectedVersion,draft,acting_user:actorId});brandDbError(result.error);return {version:result.data.version,draft};
}
