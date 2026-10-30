// Trusted Node-only snapshot builder. No database or provider side effects.
import { createHash, randomUUID } from "node:crypto";
import { compileBriefScope, type BriefDraft, type BriefRecord } from "../contracts/brief";
import { canonicalJson } from "../contracts/common";
import { executionConfigSchema, parseCheckpoint } from "../contracts/workflow";
import type { AgentSetting } from "../contracts/shared";
export function buildC1Snapshot({campaign,draft,agents,sources:sourceOrder,actorId}:{campaign:{id:string;name:string;brand:string;version:number;document?:Record<string,unknown>};draft:BriefDraft;agents:AgentSetting[];sources:BriefRecord["assets"];actorId:string}) {
  const campaignId = campaign.id;
  const runId = randomUUID(), briefId = randomUUID(), configId = randomUUID();
  const { scope, manifest } = compileBriefScope(draft, { campaignId, scopeId: randomUUID(), manifestId: randomUUID(), briefId });
  const config = executionConfigSchema.parse({ schemaVersion: "1.0", revisionId: configId, runId,
    assignments: agents.filter(a => a.model_id).map(a => ({ role: a.role, taskType: a.role, providerId: "openrouter", modelId: a.model_id, source: "workspace" })),
    runBudgetScopeId: `budget-run-${runId}`, runCapMicroUsd: draft.runCapMicroUsd,
    steps: agents.map(a => ({ stepKey: a.role, budgetScopeId: `budget-step-${runId}-${a.role}`, capMicroUsd: a.step_cap_micro_usd })) });
  const briefText = canonicalJson({ schemaVersion: "1.0", revisionId: briefId, campaignId, campaignRevision: campaign.version,
    brand: campaign.brand, campaignName: campaign.name, legacyBriefNotes: campaign.document?.brief ?? "", questionnaire: draft, sources: sourceOrder,
    creativeDevelopment: {schemaVersion: "1.0", contentStage: "scenario", hookSlots: draft.hooks, beatSequenceSlots: draft.beatSequences,
      instructions: "C1 reserves creative slot IDs and ordered quantities, not completed scripts. Generate actual opening hooks, narrative beat sequences and timing together with the three scenarios during internal script development. Bind the generated content to these exact slot IDs for each direction and ordered variant. Optional variationNotes are guidance, not a required client-written scenario. Preserve supplied facts, offer, CTA and constraints; do not expand the ordered manifest."} });
  const configText = canonicalJson({ schemaVersion: "1.0", executionConfig: config, agents });
  const ref = (revisionId: string, value: string) => ({ revisionId, sha256: createHash("sha256").update(value).digest("hex") });
  const briefRef = ref(briefId, briefText), configRef = ref(configId, configText);
  const checkpoint = parseCheckpoint({ schemaVersion: "1.0", id: randomUUID(), campaignId, runId, actorId, acceptedAt: new Date().toISOString(), stage: "C1",
    scope, variantManifest: manifest, briefSubmission: briefRef, executionConfig: configRef,
    acceptedArtifacts: [briefRef, configRef, ...sourceOrder.map(s => ({ revisionId: s.id, sha256: s.sha256 }))],
    budgetScopes: { run: config.runBudgetScopeId, steps: config.steps.map(s => s.budgetScopeId) } });
  if (checkpoint.stage !== "C1") throw new Error("INVALID_C1_SNAPSHOT");
  return { checkpoint, briefText, configText, config };
}
