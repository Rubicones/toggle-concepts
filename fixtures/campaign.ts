import { campaignScopeSchema, validateVariantManifest, type VariantEntry } from "../packages/contracts/campaign";

export const lumaScope = campaignScopeSchema.parse({
  schemaVersion: "1.0", campaignId: "luma-demo", revisionId: "scope-r1",
  draftConceptCount: 3, finalConceptCount: 1,
  referencePlacement: "vertical-9x16", referenceLocale: "ru-RU",
  locales: ["ru-RU", "en-GB"], hooks: ["context", "product-first"],
  beatSequences: ["problem-demo-cta", "demo-proof-cta"], offers: ["explore"],
  durationsSeconds: [15],
  placements: [
    { id: "vertical-9x16", width: 1080, height: 1920, fps: 30 },
    { id: "portrait-4x5", width: 1080, height: 1350, fps: 30 },
    { id: "square-1x1", width: 1080, height: 1080, fps: 30 },
    { id: "wide-16x9", width: 1920, height: 1080, fps: 30 },
  ],
  combinationMode: "explicit_manifest", requestedFinalVideoCount: 32,
});

// Only this fixture explicitly orders the full product. Domain code never expands axes.
const entries: VariantEntry[] = [];
for (const locale of lumaScope.locales) for (const hook of lumaScope.hooks)
  for (const beatSequence of lumaScope.beatSequences) for (const placement of lumaScope.placements) {
    entries.push({ id: `luma-${entries.length + 1}`, conceptSlot: 1, locale, hook, beatSequence,
      placementId: placement.id, durationSeconds: 15, offer: "explore", inputRevisionIds: ["brief-r1"] });
  }
export const lumaManifest = validateVariantManifest(lumaScope, {
  schemaVersion: "1.0", campaignId: "luma-demo", revisionId: "variants-r1", scopeRevisionId: "scope-r1", entries,
}).manifest;

// Independent 6-second capability sample; it does not satisfy the 32-file order.
export const spikeScope = campaignScopeSchema.parse({
  ...lumaScope, campaignId: "m00-spike", revisionId: "spike-scope-r1",
  locales: ["ru-RU"], hooks: ["context"], beatSequences: ["demo"],
  durationsSeconds: [6], placements: [{ id: "spike-wide", width: 640, height: 360, fps: 30 }],
  referencePlacement: "spike-wide", requestedFinalVideoCount: 1,
});
export const spikeManifest = validateVariantManifest(spikeScope, {
  schemaVersion: "1.0", campaignId: "m00-spike", revisionId: "spike-variants-r1", scopeRevisionId: "spike-scope-r1",
  entries: [{ id: "spike-ru-wide", conceptSlot: 1, locale: "ru-RU", hook: "context", beatSequence: "demo",
    durationSeconds: 6, placementId: "spike-wide", offer: "explore", inputRevisionIds: ["m00-script-r1"] }],
}).manifest;
