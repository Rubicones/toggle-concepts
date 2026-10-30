import { z } from "zod";
import { canonicalJson, id } from "./common";
import { campaignScopeSchema, validateVariantManifest, variantTuple, type VariantEntry } from "./campaign";

const text = (max: number) => z.string().max(max);
export const briefPlacementOptions = [
  { id: "vertical", label: "9:16 · Stories", width: 1080, height: 1920, fps: 30 },
  { id: "portrait", label: "4:5 · Feed", width: 1080, height: 1350, fps: 30 },
  { id: "square", label: "1:1 · Square", width: 1080, height: 1080, fps: 30 },
  { id: "wide", label: "16:9 · Wide", width: 1920, height: 1080, fps: 30 },
] as const;
const rowSchema = z.strictObject({ id: z.uuid(), conceptSlot: z.number().int().min(1).max(3), locale: id, hook: id, beatSequence: id,
  durationSeconds: z.number().int().min(1).max(60), placementId: z.enum(["vertical", "portrait", "square", "wide"]), offer: id });
export const briefDraftSchema = z.strictObject({
  schemaVersion: z.literal("1.0"), product: text(1500), objective: text(1200), audience: text(1500), markets: text(500),
  ownerName: text(160), ownerEmail: text(200), offer: text(1000), cta: text(300), destination: text(500),
  deadline: text(20), timeZone: text(100), immutables: text(2000), synthesis: text(1000), variationNotes: text(3000),
  rights: z.enum(["unknown", "confirmed", "not_needed"]), rightsNotes: text(1500),
  showPrice: z.boolean(), price: text(100), currency: text(3), priceSource: text(500), priceConfirmed: z.boolean(),
  facts: z.array(z.strictObject({ id: z.uuid(), claim: text(1000), status: z.enum(["confirmed", "provided", "inferred", "proposed", "unknown"]), source: text(1000) })).max(20),
  sourceAssetIds: z.array(z.uuid()).max(20),
  locales: z.array(id).max(8), hooks: z.array(id).max(8), beatSequences: z.array(id).max(8), offers: z.array(id).max(4),
  durationsSeconds: z.array(z.number().int().min(1).max(60)).max(4),
  placementIds: z.array(z.enum(["vertical", "portrait", "square", "wide"])).max(4),
  referenceLocale: text(160), referencePlacement: z.enum(["vertical", "portrait", "square", "wide"]),
  finalConceptCount: z.number().int().min(1).max(3), runCapMicroUsd: z.number().int().min(10000).max(100000000),
  entries: z.array(rowSchema).max(128),
});
export type BriefDraft = z.infer<typeof briefDraftSchema>;
export type BriefRow = BriefDraft["entries"][number];
export type BriefRecord = { schemaReady: boolean; brandbookPrefill?: {submission_id:string;fields:Record<string,unknown>;conflicts:string[];created_at:string}|null; draft: { version: number; payload: BriefDraft; updated_at: string } | null;
  checkpoint: { id: string; run_id: string; created_at: string; payload: import("./workflow").ClientCheckpoint; brief_text: string } | null;
  assets: { id: string; filename: string; sha256: string; mime: string; bytes: number }[] };
export function emptyBrief(goal = ""): BriefDraft {
  return { schemaVersion: "1.0", product: "", objective: goal, audience: "", markets: "", ownerName: "", ownerEmail: "", offer: "", cta: "", destination: "",
    deadline: "", timeZone: "Europe/Belgrade", immutables: "", synthesis: "", variationNotes: "", rights: "unknown", rightsNotes: "", showPrice: false, price: "", currency: "USD", priceSource: "", priceConfirmed: false,
    facts: [], sourceAssetIds: [], locales: ["en-GB"], hooks: ["primary"], beatSequences: ["primary"], offers: ["primary"], durationsSeconds: [15], placementIds: ["vertical"], referenceLocale: "en-GB", referencePlacement: "vertical", finalConceptCount: 1, runCapMicroUsd: 5000000, entries: [] };
}
export function compileBriefScope(draft: BriefDraft, refs: { campaignId: string; scopeId: string; manifestId: string; briefId: string }) {
  const scope = campaignScopeSchema.parse({ schemaVersion: "1.0", revisionId: refs.scopeId, campaignId: refs.campaignId, draftConceptCount: 3, finalConceptCount: draft.finalConceptCount,
    referencePlacement: draft.referencePlacement, referenceLocale: draft.referenceLocale, locales: draft.locales, hooks: draft.hooks, beatSequences: draft.beatSequences, offers: draft.offers,
    durationsSeconds: draft.durationsSeconds, placements: draft.placementIds.map(key => { const p = briefPlacementOptions.find(v => v.id === key)!; return { id: p.id, width: p.width, height: p.height, fps: p.fps }; }),
    combinationMode: "explicit_manifest", requestedFinalVideoCount: draft.entries.length });
  return validateVariantManifest(scope, { schemaVersion: "1.0", revisionId: refs.manifestId, campaignId: refs.campaignId, scopeRevisionId: refs.scopeId,
    entries: draft.entries.map(row => ({ ...row, inputRevisionIds: [refs.briefId] })) });
}
export function briefBlockers(draft: BriefDraft): string[] {
  const errors: string[] = [];
  for (const [label, value] of [["Product", draft.product], ["Objective", draft.objective], ["Audience", draft.audience], ["Market", draft.markets], ["Responsible person", draft.ownerName],
    ["Offer", draft.offer], ["CTA", draft.cta], ["Product invariants", draft.immutables], ["Synthetic-content permissions", draft.synthesis]]) if (!value.trim()) errors.push(`${label} is required.`);
  if (!z.email().safeParse(draft.ownerEmail).success) errors.push("Enter the responsible person's email.");
  try { const url = new URL(draft.destination); if (!["https:", "http:"].includes(url.protocol)) throw new Error(); } catch { errors.push("Enter an HTTP(S) CTA destination."); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.deadline) || Number.isNaN(Date.parse(draft.deadline)) || new Date(draft.deadline).toISOString().slice(0, 10) !== draft.deadline) errors.push("Enter a valid delivery date.");
  try { new Intl.DateTimeFormat("en", { timeZone: draft.timeZone }).format(); } catch { errors.push("Enter a valid IANA time zone."); }
  if (draft.rights === "unknown" || (draft.sourceAssetIds.length && draft.rights !== "confirmed")) errors.push("Confirm source rights before submission; selected media cannot use 'not needed'.");
  if (draft.showPrice && (!draft.priceConfirmed || !Number.isFinite(Number(draft.price)) || Number(draft.price) <= 0 || !/^[A-Z]{3}$/.test(draft.currency) || !draft.priceSource.trim())) errors.push("Displayed price needs a positive amount, currency, source and confirmation.");
  for (const [index, fact] of draft.facts.entries()) if (!fact.claim.trim() || fact.status !== "confirmed" || !fact.source.trim()) errors.push(`Claim ${index + 1} needs confirmed wording and a source, or must be removed from scope.`);
  if (new Set(draft.facts.map(f => f.id)).size !== draft.facts.length || new Set(draft.sourceAssetIds).size !== draft.sourceAssetIds.length) errors.push("Duplicate claim or source identity.");
  try { compileBriefScope(draft, { campaignId: "preview", scopeId: "scope-preview", manifestId: "manifest-preview", briefId: "brief-preview" }); }
  catch (error) { errors.push(error instanceof z.ZodError ? "Complete unique axes, reference locale/format and at least one ordered row." : error instanceof Error ? error.message : "Variant scope is invalid."); }
  return errors;
}
export function combinationCount(draft: BriefDraft) {
  return draft.finalConceptCount * draft.locales.length * draft.hooks.length * draft.beatSequences.length * draft.offers.length * draft.durationsSeconds.length * draft.placementIds.length;
}
// C1 reserves the quantity and identities; scenario development supplies content.
// Existing IDs and explicit rows are never silently renamed or regenerated.
export function resizeCreativeSlots(values: string[], count: number, prefix: 'hook' | 'beats'): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 8) throw new Error('Choose between 1 and 8 creative options.');
  const slots = values.slice(0, count);
  for (let next = 1; slots.length < count; next++) {
    const id = `${prefix}-${next}`;
    if (!slots.includes(id)) slots.push(id);
  }
  return slots;
}
// Only called by the explicit Add all combinations button. Never on save/submit.
export function explicitCombinations(draft: BriefDraft, makeId: () => string): BriefRow[] {
  if (combinationCount(draft) > 128) throw new Error("More than 128 combinations. Narrow the axes or add selected rows individually.");
  const rows: BriefRow[] = [];
  for (let slot = 1; slot <= draft.finalConceptCount; slot++) for (const locale of draft.locales) for (const hook of draft.hooks) for (const beatSequence of draft.beatSequences)
    for (const offer of draft.offers) for (const durationSeconds of draft.durationsSeconds) for (const placementId of draft.placementIds) rows.push({ id: makeId(), conceptSlot: slot, locale, hook, beatSequence, offer, durationSeconds, placementId });
  return rows;
}
export function rowKey(row: BriefRow) { return variantTuple(row as VariantEntry); }
export function draftIdentity(draft: BriefDraft) { return canonicalJson(draft); }

export const briefSuggestionFields=["product","objective","audience","markets","offer","cta","destination","immutables","synthesis","rightsNotes","variationNotes"] as const;
