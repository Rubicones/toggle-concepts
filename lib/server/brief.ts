import "server-only";
import { z } from "zod";
import { briefDraftSchema, briefBlockers } from "@/packages/contracts/brief";
import { agentRoles } from "@/packages/contracts/workflow";
import { campaignRecord, checked, studioContext } from "./studio";
import { ApiError } from "./api";
import { buildC1Snapshot } from "@/packages/data/brief-snapshot";

export function schemaMissing(error: { code?: string } | null) { return !!error && ["42P01", "PGRST205", "PGRST202"].includes(error.code ?? ""); }
export function briefDbError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (schemaMissing(error)) throw new ApiError(503, "C1_SCHEMA_REQUIRED", "Apply the C1 migration from Settings before saving or submitting a questionnaire.");
  if (error.code === "40001") throw new ApiError(409, "STALE_BRIEF", "The brief, campaign or model settings changed. Reload before saving or submitting.");
  if (error.message.includes("C1_ALREADY_SUBMITTED")) throw new ApiError(409, "C1_ALREADY_SUBMITTED", "C1 is already submitted. Its scope and budget cannot be overwritten. Scope amendment is a later explicit workflow action.");
  console.error('[brief database]',{code:error.code,message:error.message});
  if(error.message.includes('BRIEF_SNAPSHOT_MISMATCH'))throw new ApiError(409,'STALE_BRIEF','The saved questionnaire changed. Reload before starting the run.');
  throw new Error("DATABASE_UNAVAILABLE");
}
const agentSchema = z.strictObject({ role: z.enum(agentRoles), model_id: z.string().nullable(), instructions: z.string().max(12000), max_output_tokens: z.number().int().min(64).max(32768), step_cap_micro_usd: z.number().int().min(1).max(10000000) });
export async function submitBrief(campaignId: string, expectedVersion: number, requestId: string) {
  const campaign = await campaignRecord(campaignId), { admin, tenant, actorId } = await studioContext();
  const prior = await admin.from("studio_c1_checkpoints").select("id,run_id,draft_version").eq("tenant_id", tenant).eq("campaign_id", campaignId).eq("request_id", requestId).maybeSingle(); briefDbError(prior.error);
  if (prior.data) { if (prior.data.draft_version !== expectedVersion) throw new ApiError(409, "REQUEST_CONFLICT", "This request belongs to another brief revision."); return prior.data; }
  const draftResult = await admin.from("studio_brief_drafts").select("version,payload").eq("tenant_id", tenant).eq("campaign_id", campaignId).single(); briefDbError(draftResult.error);
  if (!draftResult.data || draftResult.data.version !== expectedVersion) throw new ApiError(409, "STALE_BRIEF", "Save the latest questionnaire before submitting C1.");
  const draft = briefDraftSchema.parse(draftResult.data.payload), blockers = briefBlockers(draft);
  if (blockers.length) throw new ApiError(409, "BRIEF_INCOMPLETE", blockers.join(" "));
  const sources = checked(await admin.from("asset_revisions").select("id,filename,mime,bytes,sha256").eq("tenant_id", tenant).eq("campaign_id", campaignId).in("id", draft.sourceAssetIds));
  if ((sources?.length ?? 0) !== draft.sourceAssetIds.length) throw new ApiError(409, "INVALID_BRIEF_SOURCE", "Select only validated media belonging to this campaign.");
  const sourceOrder = draft.sourceAssetIds.map(id => sources!.find(s => s.id === id)!);
  const agents = z.array(agentSchema).length(agentRoles.length).parse(checked(await admin.from("studio_agents").select("role,model_id,instructions,max_output_tokens,step_cap_micro_usd").eq("tenant_id", tenant).order("role")));
  if (agents.some(a => !["video", "model3d"].includes(a.role) && !a.model_id)) throw new ApiError(409, "AGENT_NOT_CONFIGURED", "Configure all text and image agents in Models & agents before freezing C1. Video and 3D can remain unassigned.");
  const { checkpoint, briefText, configText } = buildC1Snapshot({ campaign, draft, sourceDraft:draftResult.data.payload, agents, sources: sourceOrder, actorId });
  const result = await admin.rpc("studio_submit_c1", { target_campaign: campaignId, expected_draft_version: expectedVersion, expected_campaign_version: campaign.version,
    request_key: requestId, brief_source: briefText, config_source: configText, checkpoint, agents, acting_user: actorId });
  briefDbError(result.error); return { id: result.data.id, run_id: result.data.run_id };
}
