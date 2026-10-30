import { z } from "zod";
import { campaignScopeSchema, variantManifestSchema, validateVariantManifest } from "./campaign";
import { id, positiveInt, revisionRef, unique, version } from "./common";

export const CLIENT_STAGES = ["C1", "C2", "C3"] as const;
export const AD_REVIEWS = ["A1", "A2", "A3"] as const;
export const agentRoles = ["intake", "brand-kit", "research", "strategy", "variants", "script",
  "localization", "visual-direction", "image", "video", "model3d", "creative-code", "layout", "critic"] as const;
export const executionConfigSchema = z.strictObject({
  schemaVersion: version, revisionId: id, runId: id,
  assignments: z.array(z.strictObject({
    role: z.enum(agentRoles), taskType: id, providerId: id, modelId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/).max(240),
    source: z.enum(["workspace", "campaign", "role", "task", "rerun"]),
  })).nonempty(),
  // Integer micro-USD; these scopes accumulate across attempts and rounds.
  runBudgetScopeId: id, runCapMicroUsd: z.number().int().nonnegative().safe(),
  steps: z.array(z.strictObject({
    stepKey: id, budgetScopeId: id, capMicroUsd: z.number().int().nonnegative().safe(),
  })).nonempty(),
}).superRefine((v, ctx) => {
  if (new Set(v.assignments.map((a) => `${a.role}/${a.taskType}`)).size !== v.assignments.length ||
    new Set(v.steps.map((s) => s.stepKey)).size !== v.steps.length ||
    new Set([v.runBudgetScopeId, ...v.steps.map((s) => s.budgetScopeId)]).size !== v.steps.length + 1) {
    ctx.addIssue({ code: "custom", message: "Duplicate model assignment or budget scope" });
  }
});

const base = {
  schemaVersion: version, id, campaignId: id, runId: id,
  actorId: id, acceptedAt: z.string().datetime(),
  scope: campaignScopeSchema, variantManifest: variantManifestSchema,
  executionConfig: revisionRef, acceptedArtifacts: z.array(revisionRef).nonempty(),
  budgetScopes: z.strictObject({ run: id, steps: z.array(id).nonempty() }),
};
export const clientCheckpointSchema = z.discriminatedUnion("stage", [
  z.strictObject({ ...base, stage: z.literal("C1"), briefSubmission: revisionRef }),
  z.strictObject({ ...base, stage: z.literal("C2"), originC1Id: id,
    draftBatch: revisionRef, draftCandidateIds: z.array(id).length(3),
    selectedConcepts: z.array(z.strictObject({ slot: positiveInt.max(3), conceptId: id })).nonempty(),
    layoutBindings: z.array(revisionRef).nonempty(), resourceContracts: z.array(revisionRef),
    adReviews: z.strictObject({ A1: revisionRef, A2: revisionRef }),
  }),
  z.strictObject({ ...base, stage: z.literal("C3"), originC2Id: id,
    deliveryManifest: revisionRef, adReviews: z.strictObject({ A3: revisionRef }),
  }),
]);
export type ClientCheckpoint = z.infer<typeof clientCheckpointSchema>;

export function parseCheckpoint(input: unknown) {
  const checkpoint = clientCheckpointSchema.parse(input);
  validateVariantManifest(checkpoint.scope, checkpoint.variantManifest);
  if (checkpoint.campaignId !== checkpoint.scope.campaignId) throw new Error("Checkpoint campaign mismatch");
  unique(checkpoint.acceptedArtifacts.map((r) => r.revisionId), "accepted artifact");
  const refs = new Map(checkpoint.acceptedArtifacts.map((r) => [r.revisionId, r.sha256]));
  const required = checkpoint.stage === "C1" ? [checkpoint.briefSubmission] : checkpoint.stage === "C2"
    ? [checkpoint.draftBatch, ...checkpoint.layoutBindings, ...checkpoint.resourceContracts,
      checkpoint.adReviews.A1, checkpoint.adReviews.A2]
    : [checkpoint.deliveryManifest, checkpoint.adReviews.A3];
  for (const ref of [...required, checkpoint.executionConfig]) if (refs.get(ref.revisionId) !== ref.sha256) throw new Error("Checkpoint artifact missing or hash mismatch");
  unique([checkpoint.budgetScopes.run, ...checkpoint.budgetScopes.steps], "cumulative budget scope");
  if (checkpoint.stage === "C2") {
    unique(checkpoint.draftCandidateIds, "draft candidate");
    unique(checkpoint.selectedConcepts.map((s) => s.slot), "selected concept slot");
    unique(checkpoint.selectedConcepts.map((s) => s.conceptId), "selected concept");
    if (checkpoint.selectedConcepts.length !== checkpoint.scope.finalConceptCount ||
      checkpoint.selectedConcepts.some((s) => s.slot > checkpoint.scope.finalConceptCount || !checkpoint.draftCandidateIds.includes(s.conceptId))) {
      throw new Error("C2 selection must bind every ordered slot to a reviewed candidate");
    }
  }
  // Fresh JSON snapshot. Durable immutability/authorization belongs to M02/M08.
  return checkpoint;
}

export const DRAFT_REPLAY = ["kit.assemble", "kit.validate", "A1", "strategy", "variants", "scripts",
  "localization", "draft.assets", "layout.all-variants", "draft.assemble-three", "draft.qa", "A2"] as const;
export const FINAL_REPLAY = ["final.plan", "final.heavy-assets", "final.all-variants", "final.substitute",
  "final.qa", "render", "file.qa", "A3"] as const;

export function planReplay(review: "C2" | "C3", anchorInput: unknown, configInput: unknown) {
  const anchor = parseCheckpoint(anchorInput);
  const config = executionConfigSchema.parse(configInput);
  if (anchor.stage !== (review === "C2" ? "C1" : "C2")) throw new Error("Replay requires the previous client checkpoint");
  if (config.runId !== anchor.runId || config.runBudgetScopeId !== anchor.budgetScopes.run ||
    JSON.stringify([...config.steps.map((s) => s.budgetScopeId)].sort()) !== JSON.stringify([...anchor.budgetScopes.steps].sort())) {
    throw new Error("Replay cannot reset run or cumulative budget scopes");
  }
  return {
    originCheckpointId: anchor.id, runId: anchor.runId, campaignId: anchor.campaignId,
    scopeRevisionId: anchor.scope.revisionId, manifestRevisionId: anchor.variantManifest.revisionId,
    executionConfigRevisionId: config.revisionId, runBudgetScopeId: config.runBudgetScopeId,
    stepBudgetScopeIds: config.steps.map((s) => s.budgetScopeId),
    steps: review === "C2" ? DRAFT_REPLAY : FINAL_REPLAY,
    reuseGeneratedOutputs: false as const,
  };
}
