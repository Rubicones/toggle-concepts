import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { test } from "node:test";
import { briefDraftSchema, emptyBrief, briefBlockers, compileBriefScope, resizeCreativeSlots } from "../packages/contracts/brief";
import { defaultAgentSettings } from "../packages/agents/defaults";
import { buildC1Snapshot } from "../packages/data/brief-snapshot";
import { parseCheckpoint, planReplay, DRAFT_REPLAY } from "../packages/contracts/workflow";

import { completeTestBrief } from "../fixtures/brief";

test("incomplete questionnaires save structurally but cannot submit; explicit 32-row order stays sparse", () => {
  assert.equal(briefDraftSchema.safeParse(emptyBrief()).success, true);
  assert.ok(briefBlockers(emptyBrief()).length > 0);
  const draft = completeTestBrief(); assert.deepEqual(briefBlockers(draft), []); assert.equal(draft.entries.length, 32);
  const refs = { campaignId: randomUUID(), scopeId: randomUUID(), manifestId: randomUUID(), briefId: randomUUID() };
  assert.equal(compileBriefScope(draft, refs).manifest.entries.length, 32);
  draft.entries = draft.entries.slice(0, 3); assert.equal(compileBriefScope(draft, refs).manifest.entries.length, 3);
  assert.equal(draft.entries.length, 3); // Compilation does not expand the axes.
  draft.entries.push({ ...draft.entries[0], id: randomUUID() }); assert.throws(() => compileBriefScope(draft, refs), /Duplicate variant tuple/);
});
test("facts, rights, displayed price and foreign bindings block submission", () => {
  const draft = completeTestBrief();
  assert.ok(briefBlockers({ ...draft, rights: "unknown" }).some(b => b.includes("rights")));
  assert.ok(briefBlockers({ ...draft, sourceAssetIds: [randomUUID()] }).some(b => b.includes("rights")));
  assert.ok(briefBlockers({ ...draft, showPrice: true }).some(b => b.includes("price")));
  assert.ok(briefBlockers({ ...draft, facts: [{ id: randomUUID(), claim: "Twice as bright", source: "", status: "inferred" }] }).some(b => b.includes("Claim")));
  assert.ok(briefBlockers({ ...draft, referenceLocale: "de-DE" }).length);
  assert.ok(briefBlockers({ ...draft, deadline: "2026-02-30" }).length);
  assert.ok(briefBlockers({ ...draft, timeZone: "invented/zone" }).length);
  assert.equal(briefDraftSchema.safeParse({ ...draft, tenantId: "injected" }).success, false);
});
test("C1 freezes real model slugs, exact brief hashes and reusable cumulative replay scopes", () => {
  const campaign = { id: randomUUID(), name: "Contract test", brand: "Test", version: 1, document: { brief: "Preserved notes" } }, draft = completeTestBrief();
  const made = buildC1Snapshot({ campaign, draft, agents: defaultAgentSettings, sources: [], actorId: randomUUID() });
  assert.equal(parseCheckpoint(made.checkpoint).stage, "C1");
  assert.equal(made.checkpoint.briefSubmission.sha256, createHash("sha256").update(made.briefText).digest("hex"));
  assert.equal(made.checkpoint.executionConfig.sha256, createHash("sha256").update(made.configText).digest("hex"));
  assert.ok(made.config.assignments.some(a => a.modelId === "google/gemini-2.5-flash"));
  draft.product = "Changed later"; campaign.document.brief = "Later notes";
  assert.equal(JSON.parse(made.briefText).questionnaire.product, "Desk lamp");
  assert.equal(JSON.parse(made.briefText).legacyBriefNotes, "Preserved notes");
  const replay = planReplay("C2", made.checkpoint, made.config);
  assert.deepEqual(replay.steps, DRAFT_REPLAY); assert.equal(replay.runId, made.checkpoint.runId);
  assert.equal(replay.runBudgetScopeId, made.checkpoint.budgetScopes.run); assert.equal(replay.reuseGeneratedOutputs, false);
});
test("C1 can reserve hook/beat scope before scenario content is generated", () => {
  const draft = completeTestBrief(); draft.variationNotes = "";
  assert.deepEqual(briefBlockers(draft), []);
  const rows = structuredClone(draft.entries);
  const made = buildC1Snapshot({campaign:{id:randomUUID(),name:"Scenario",brand:"Brand",version:1},draft,agents:defaultAgentSettings,sources:[],actorId:randomUUID()});
  const frozen = JSON.parse(made.briefText);
  assert.equal(frozen.questionnaire.variationNotes, "");
  assert.equal(frozen.creativeDevelopment.contentStage, "scenario");
  assert.deepEqual(frozen.creativeDevelopment.hookSlots, draft.hooks);
  assert.deepEqual(frozen.creativeDevelopment.beatSequenceSlots, draft.beatSequences);
  assert.deepEqual(draft.entries, rows);
  assert.equal(made.checkpoint.variantManifest.entries.length, 32);
  assert.match(frozen.creativeDevelopment.instructions, /Generate actual opening hooks/);
  assert.ok(briefBlockers({...draft,offer:""}).some(b=>b==='Offer is required.'));
  assert.ok(briefBlockers({...draft,rights:"unknown"}).some(b=>b.includes('rights')));
});
test("creative option counts preserve old slot IDs and do not rewrite ordered rows", () => {
  assert.deepEqual(resizeCreativeSlots(['primary'],2,'hook'),['primary','hook-1']);
  assert.deepEqual(resizeCreativeSlots(['hook-1','custom'],3,'hook'),['hook-1','custom','hook-2']);
  assert.deepEqual(resizeCreativeSlots(['story','proof'],1,'beats'),['story']);
  for(const count of [0,9,1.5,NaN])assert.throws(()=>resizeCreativeSlots(['primary'],count,'hook'));
  const draft=completeTestBrief(),rows=structuredClone(draft.entries);
  draft.hooks=resizeCreativeSlots(draft.hooks,1,'hook');
  assert.deepEqual(draft.entries,rows);
  assert.ok(briefBlockers(draft).some(b=>b.includes('Variant outside accepted scope')));
});
