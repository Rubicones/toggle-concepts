// Contract fixtures, not authenticated approvals or a completed client flow.
import { lumaManifest, lumaScope } from "./campaign";
import { agentRoles, executionConfigSchema, parseCheckpoint } from "../packages/contracts/workflow";

export const mockExecution = executionConfigSchema.parse({
  schemaVersion: "1.0", revisionId: "mock-config-r1", runId: "demo-run",
  assignments: agentRoles.map((role) => ({ role, taskType: "default", providerId: "mock", modelId: `mock-${role}`, source: "role" })),
  runBudgetScopeId: "run-budget", runCapMicroUsd: 50_000_000,
  steps: [{ stepKey: "drafts", budgetScopeId: "draft-budget", capMicroUsd: 20_000_000 },
    { stepKey: "finals", budgetScopeId: "final-budget", capMicroUsd: 30_000_000 }],
});
// Synthetic hashes are allowed only in mock contract data.
const ref = (revisionId: string) => ({ revisionId, sha256: "a".repeat(64) });
const base = {
  schemaVersion: "1.0", campaignId: "luma-demo", runId: "demo-run", actorId: "mock-client",
  acceptedAt: "2026-10-24T10:00:00.000Z", scope: lumaScope, variantManifest: lumaManifest,
  executionConfig: ref("mock-config-r1"), budgetScopes: { run: "run-budget", steps: ["draft-budget", "final-budget"] },
};
export const mockC1 = parseCheckpoint({ ...base, id: "mock-c1", stage: "C1",
  briefSubmission: ref("brief-r1"), acceptedArtifacts: [ref("brief-r1"), ref("mock-config-r1")] });
export const mockC2 = parseCheckpoint({ ...base, id: "mock-c2", stage: "C2", originC1Id: "mock-c1",
  draftBatch: ref("mock-batch-r1"), draftCandidateIds: ["concept-a", "concept-b", "concept-c"],
  selectedConcepts: [{ slot: 1, conceptId: "concept-b" }], layoutBindings: [ref("all-layouts-r1")],
  resourceContracts: [ref("resource-contracts-r1")], adReviews: { A1: ref("mock-A1"), A2: ref("mock-A2") },
  acceptedArtifacts: ["mock-batch-r1", "all-layouts-r1", "resource-contracts-r1", "mock-A1", "mock-A2", "mock-config-r1"].map(ref),
});
export const mockC3 = parseCheckpoint({ ...base, id: "mock-c3", stage: "C3", originC2Id: "mock-c2",
  deliveryManifest: ref("mock-delivery-r1"), adReviews: { A3: ref("mock-A3") },
  acceptedArtifacts: ["mock-delivery-r1", "mock-A3", "mock-config-r1"].map(ref),
});
