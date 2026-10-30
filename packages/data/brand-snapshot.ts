import { createHash, randomUUID } from "node:crypto";
import { canonicalJson } from "../contracts/common";
import { brandAcceptanceBlockers, brandInputErrors, brandTokens, type BrandDraft, type BrandAsset } from "../contracts/brand-kit";
import type { ClientCheckpoint } from "../contracts/workflow";
export function brandInputs(c1: ClientCheckpoint, draft: BrandDraft, assets: BrandAsset[], materials:BrandAsset[] = []) {
  const errors = brandInputErrors(draft, c1.id, assets,materials); if (errors.length) throw new Error(errors.join(" "));
  return { schemaVersion: "1.0", c1Id: c1.id, scopeRevisionId: c1.scope.revisionId, manifestRevisionId: c1.variantManifest.revisionId, briefSubmission: c1.stage === "C1" ? c1.briefSubmission : null,
    ...(draft.sourceMaterialIds?.length?{sourceMaterials:draft.sourceMaterialIds.map(id=>materials.find(m=>m.id===id)!)}:{}),
    sourceAssets: draft.sourceAssetIds.map(id => assets.find(a => a.id === id)!), links: draft.links.map(l => ({ ...l, contentState: l.excerpt.trim() ? "ad_supplied_excerpt" : "not_fetched" })),
    draft, limitations: "AD text, pasted excerpts, asset metadata and immutable processed-material references are supplied to this task. No linked page, image pixels, PDF, font or document was inspected by the text agent." };
}
export const brandDigest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
export function brandSnapshot(c1: ClientCheckpoint, draft: BrandDraft, assets: BrandAsset[], version: number, parentId: string | null, round = 1,materials:BrandAsset[] = []) {
  if (!Number.isSafeInteger(round) || round < 1) throw new Error("INVALID_ROUND");
  const payload = { schemaVersion: "1.0", id: randomUUID(), campaignId: c1.campaignId, runId: c1.runId, originC1Id: c1.id, parentRevisionId: parentId, sourceDraftVersion: version,
    sourceStepId: draft.proposalStepId, round, inputs: brandInputs(c1, draft, assets,materials), kit: draft, tokens: brandTokens(draft), blockers: brandAcceptanceBlockers(draft, c1.scope.locales, c1.id, assets,materials) };
  const source = canonicalJson(payload); return { payload: JSON.parse(source) as typeof payload, source, sha256: createHash("sha256").update(source).digest("hex") };
}
export function a1ReviewSource(revision:{id:string;sha256:string;campaign_id:string;run_id:string;origin_c1_id:string;round_no:number},actorId:string,input:{decision:"accepted"|"changes_requested";reviewerName:string;comments:string;attestations:{rules:boolean;fonts:boolean;c1Constraints:boolean}}) {
  return canonicalJson({schemaVersion:"1.0",id:randomUUID(),stage:"A1",round:revision.round_no,campaignId:revision.campaign_id,runId:revision.run_id,originC1Id:revision.origin_c1_id,actorId,decidedAt:new Date().toISOString(),brandRevision:{revisionId:revision.id,sha256:revision.sha256},...input});
}
export function brandProposalPrompt(correction: string) {
  return `Build or correct the Brand Kit from the frozen C1 and brandInputSnapshot. Rules in the working draft that already have brandbook values are kept automatically; return only rules that are missing or empty, or that the correction changes. An empty rules array is valid when nothing is missing. ${correction}\nReturn the required working-artifact JSON envelope with role "brand-kit" and deliverable.brandKitProposal containing exactly {"rules":[{"category":"color","key":"ink","value":"#102F40","status":"proposed","provenance":{"kind":"ad_instruction","sourceId":null,"locator":"specific input location"},"reason":"why this rule fits"}],"conflicts":[]}. The example color is illustrative; choose from actual inputs. Allowed categories: logo,product,color,typography,spacing,layout,motion,imagery,voice,sound,prohibition. Required keys: logo.usage,product.immutables,color.ink,color.paper,typography.headlineFamily,typography.bodyFamily,layout.safeAreaRule,motion.motionSystem,imagery.treatment,voice.tone,sound.policy,prohibition.policy. Status: provided,inferred,proposed,unknown (never claim AD confirmation). Provenance kind: c1,asset,link,material,ad_instruction. For material use the exact supplied processed-material UUID and its cited finding location; the imported brandbook rules are extracted evidence, not human approvals. For kind c1 use brandInputSnapshot.c1Id (the checkpoint UUID); the submitted brief revision is a child artifact of that checkpoint. sourceId must be the exact supplied C1/asset/link/material UUID; null for ad_instruction. Use only supplied excerpts/metadata: never claim to inspect unseen pixels, linked pages, PDFs, fonts, glyph coverage or licenses. No approval/verification fields; the AD must review every proposal. Keep rules concise to fit the output limit. Retain protected C1 invariants; report contradictions as conflicts.`;
}
