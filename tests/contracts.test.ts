import assert from "node:assert/strict";
import { test } from "node:test";
import { lumaManifest, lumaScope } from "../fixtures/campaign";
import { mockC1, mockC2, mockC3, mockExecution } from "../fixtures/checkpoints";
import { sampleScene } from "../fixtures/scene";
import { campaignScopeSchema, validateVariantManifest } from "../packages/contracts/campaign";
import { canonicalJson } from "../packages/contracts/common";
import { parseScene, sceneSpecSchema, validateSubstitution } from "../packages/contracts/scene";
import { parseCheckpoint, planReplay, DRAFT_REPLAY, FINAL_REPLAY, executionConfigSchema } from "../packages/contracts/workflow";

test("32 explicit rows; sparse allowlist stays sparse", () => {
  assert.equal(validateVariantManifest(lumaScope, lumaManifest).manifest.entries.length, 32);
  const sparse = { ...lumaManifest, entries: lumaManifest.entries.slice(0, 12) };
  assert.equal(validateVariantManifest({ ...lumaScope, requestedFinalVideoCount: 12 }, sparse).manifest.entries.length, 12);
});
test("duplicate IDs/tuples, counts, unknown axes, and foreign scope are rejected", () => {
  const replace = (entry: object) => ({ ...lumaManifest, entries: [entry, ...lumaManifest.entries.slice(1)] });
  assert.throws(() => validateVariantManifest(lumaScope, replace({ ...lumaManifest.entries[1] })), /Duplicate/);
  assert.throws(() => validateVariantManifest(lumaScope, replace({ ...lumaManifest.entries[1], id: "another" })), /tuple/);
  assert.throws(() => validateVariantManifest(lumaScope, { ...lumaManifest, entries: [] }));
  assert.throws(() => validateVariantManifest({ ...lumaScope, requestedFinalVideoCount: 31 }, lumaManifest), /count/);
  assert.throws(() => validateVariantManifest(lumaScope, replace({ ...lumaManifest.entries[0], locale: "de-DE" })), /outside/);
  assert.throws(() => validateVariantManifest(lumaScope, { ...lumaManifest, scopeRevisionId: "other" }), /mismatch/);
});
test("unknown schema versions/types/fields and invalid reference axes block", () => {
  assert.equal(campaignScopeSchema.safeParse({ ...lumaScope, schemaVersion: "2.0" }).success, false);
  assert.equal(sceneSpecSchema.safeParse({ ...sampleScene, accidentalField: true }).success, false);
  assert.equal(campaignScopeSchema.safeParse({ ...lumaScope, referenceLocale: "de-DE" }).success, false);
  assert.equal(sceneSpecSchema.safeParse({ ...sampleScene, layers: [{ kind: "arbitrary-js" }] }).success, false);
});
test("C2 requires exactly three unique reviewed directions and ordered selection", () => {
  assert.equal(parseCheckpoint(mockC2).stage, "C2");
  assert.throws(() => parseCheckpoint({ ...mockC2, draftCandidateIds: ["concept-a", "concept-a", "concept-c"] }), /Duplicate/);
  assert.throws(() => parseCheckpoint({ ...mockC2, selectedConcepts: [{ slot: 1, conceptId: "unreviewed" }] }), /selection/);
  assert.throws(() => parseCheckpoint({ ...mockC2, acceptedArtifacts: [] }));
  assert.throws(() => parseCheckpoint({ ...mockC2, adReviews: {} }));
  assert.equal(parseCheckpoint(mockC3).stage, "C3");
});
test("C2 feedback replays the entire post-C1 segment; C3 replays all finals after C2", () => {
  const draft = planReplay("C2", mockC1, mockExecution);
  const final = planReplay("C3", mockC2, mockExecution);
  assert.deepEqual(draft.steps, DRAFT_REPLAY); assert.deepEqual(final.steps, FINAL_REPLAY);
  assert.equal(draft.originCheckpointId, mockC1.id); assert.equal(final.originCheckpointId, mockC2.id);
  for (const replay of [draft, final]) {
    assert.equal(replay.runId, mockC1.runId); assert.equal(replay.runBudgetScopeId, "run-budget");
    assert.deepEqual(replay.stepBudgetScopeIds, ["draft-budget", "final-budget"]);
    assert.equal(replay.reuseGeneratedOutputs, false);
  }
  assert.throws(() => planReplay("C2", mockC2, mockExecution), /previous/);
  assert.throws(() => planReplay("C3", mockC2, { ...mockExecution, runBudgetScopeId: "fresh-budget" }), /cannot reset/);
  assert.throws(() => parseCheckpoint({ ...mockC1, budgetScopes: { run: "run-budget", steps: ["run-budget"] } }), /Duplicate/);
});
test("models remain configurable per role/task; caps use safe integer micro-USD", () => {
  const assignments = mockExecution.assignments.map((a) => ({ ...a, modelId: `different-${a.role}` }));
  assert.equal(executionConfigSchema.parse({ ...mockExecution, assignments }).assignments[0].modelId, "different-intake");
  assert.equal(executionConfigSchema.safeParse({ ...mockExecution, runCapMicroUsd: 0.5 }).success, false);
  assert.equal(executionConfigSchema.safeParse({ ...mockExecution, assignments: [assignments[0], assignments[0]] }).success, false);
});
test("stable slots, mandatory copy, asset references, and half-open intervals are checked", () => {
  assert.equal(parseScene(sampleScene).layers.length, 6);
  assert.throws(() => parseScene({ ...sampleScene, slots: [...sampleScene.slots, sampleScene.slots[0]] }), /Duplicate/);
  assert.throws(() => parseScene({ ...sampleScene, copy: {} }), /mandatory/);
  assert.throws(() => parseScene({ ...sampleScene, layers: sampleScene.layers.map((l) => ({ ...l, startFrame: 1 })) }), /interval/);
  assert.throws(() => parseScene({ ...sampleScene, assets: sampleScene.assets.filter((a) => a.kind !== "font") }), /font/);
  assert.throws(() => parseScene({ ...sampleScene, layers: sampleScene.layers.map((l) => ({ ...l, slotId: "foreign.slot" })) }), /slot/);
});
test("proxies require contracts; finals cannot fall back silently or violate source constraints", () => {
  const withoutFinal = { ...sampleScene, layers: sampleScene.layers.map((l) => l.kind === "video" ? { ...l, finalAssetRevisionId: null } : l) };
  assert.throws(() => parseScene(withoutFinal), /Final asset required/);
  assert.equal(parseScene({ ...withoutFinal, stage: "draft" }).stage, "draft");
  assert.throws(() => parseScene({ ...sampleScene, resourceContracts: [] }), /binding/);
  const contract = sampleScene.resourceContracts[0];
  const video = sampleScene.assets.find((a) => a.kind === "video")!;
  assert.throws(() => validateSubstitution(contract, { ...video, durationSeconds: 5 }), /short/);
  assert.throws(() => validateSubstitution(contract, { ...video, width: 180 }), /aspect/);
  assert.throws(() => validateSubstitution(contract, { ...video, protectedArea: { x: 0.1, y: 0, w: 0.9, h: 1 } }), /protected/);
});
test("portable assets reject URLs and traversal; canonical identity ignores object-key order", () => {
  for (const objectKey of ["https://host/file.mp4?token=secret", "/tmp/file.mp4", "fixtures/../escape.mp4"]) {
    assert.throws(() => parseScene({ ...sampleScene, assets: sampleScene.assets.map((a) => ({ ...a, objectKey })) }));
  }
  assert.equal(canonicalJson({ z: [2, 1], a: true }), canonicalJson({ a: true, z: [2, 1] }));
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
});
