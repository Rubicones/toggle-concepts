import { z } from "zod";
import { id, positiveInt, unique, version } from "./common";

export const placementSchema = z.strictObject({
  id, width: positiveInt, height: positiveInt, fps: positiveInt.max(60),
});
export const campaignScopeSchema = z.strictObject({
  schemaVersion: version, revisionId: id, campaignId: id,
  draftConceptCount: z.literal(3), finalConceptCount: positiveInt.max(3),
  referencePlacement: id, referenceLocale: id,
  locales: z.array(id).nonempty(), hooks: z.array(id).nonempty(),
  beatSequences: z.array(id).nonempty(), offers: z.array(id).nonempty(),
  durationsSeconds: z.array(positiveInt.max(60)).nonempty(),
  placements: z.array(placementSchema).nonempty(),
  combinationMode: z.literal("explicit_manifest"),
  requestedFinalVideoCount: positiveInt,
}).superRefine((scope, ctx) => {
  for (const values of [scope.locales, scope.hooks, scope.beatSequences, scope.offers,
    scope.durationsSeconds, scope.placements.map((p) => p.id)]) {
    if (new Set<unknown>(values).size !== values.length) ctx.addIssue({ code: "custom", message: "Duplicate scope axis value" });
  }
  if (!scope.locales.includes(scope.referenceLocale) || !scope.placements.some((p) => p.id === scope.referencePlacement)) {
    ctx.addIssue({ code: "custom", message: "Reference locale/placement must belong to scope" });
  }
});

// C1 orders concept slots; C2 binds them to actual reviewed directions.
export const variantEntrySchema = z.strictObject({
  id, conceptSlot: positiveInt.max(3), locale: id, hook: id,
  beatSequence: id, durationSeconds: positiveInt, placementId: id, offer: id,
  inputRevisionIds: z.array(id).nonempty(),
});
export const variantManifestSchema = z.strictObject({
  schemaVersion: version, revisionId: id, campaignId: id, scopeRevisionId: id,
  entries: z.array(variantEntrySchema).nonempty(),
});

export type CampaignScope = z.infer<typeof campaignScopeSchema>;
export type VariantManifest = z.infer<typeof variantManifestSchema>;
export type VariantEntry = z.infer<typeof variantEntrySchema>;
export function variantTuple(v: VariantEntry) {
  return JSON.stringify([v.conceptSlot, v.locale, v.hook, v.beatSequence, v.durationSeconds, v.placementId, v.offer]);
}

export function validateVariantManifest(scopeInput: unknown, manifestInput: unknown) {
  const scope = campaignScopeSchema.parse(scopeInput);
  const manifest = variantManifestSchema.parse(manifestInput);
  if (manifest.campaignId !== scope.campaignId || manifest.scopeRevisionId !== scope.revisionId) throw new Error("Scope revision/campaign mismatch");
  if (manifest.entries.length !== scope.requestedFinalVideoCount) throw new Error("Ordered count does not match explicit manifest");
  unique(manifest.entries.map((v) => v.id), "variant ID");
  unique(manifest.entries.map(variantTuple), "variant tuple");
  for (const v of manifest.entries) {
    if (v.conceptSlot > scope.finalConceptCount || !scope.locales.includes(v.locale) ||
      !scope.hooks.includes(v.hook) || !scope.beatSequences.includes(v.beatSequence) ||
      !scope.durationsSeconds.includes(v.durationSeconds) || !scope.offers.includes(v.offer) ||
      !scope.placements.some((p) => p.id === v.placementId)) throw new Error(`Variant outside accepted scope: ${v.id}`);
    unique(v.inputRevisionIds, "variant input revision");
  }
  for (let slot = 1; slot <= scope.finalConceptCount; slot++) {
    if (!manifest.entries.some((v) => v.conceptSlot === slot)) throw new Error("Missing final concept slot");
  }
  return { scope, manifest };
}
