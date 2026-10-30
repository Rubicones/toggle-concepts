import {graphicProposalSchema} from './graphic-vocabulary';
import {canonicalizeAgentRole} from './agent-output';
import { z } from "zod";

export const brandCategories = ["logo", "product", "color", "typography", "spacing", "layout", "motion", "imagery", "voice", "sound", "prohibition"] as const;
export const brandRuleSchema = z.strictObject({
  id: z.uuid(), category: z.enum(brandCategories), key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/).max(80), value: z.string().max(2000),
  status: z.enum(["confirmed", "provided", "inferred", "proposed", "unknown"]), decision: z.enum(["unreviewed", "accepted", "rejected"]), sourceVerified: z.boolean(),
  provenance: z.strictObject({ kind: z.enum(["c1", "asset", "link", "material", "ad_instruction", "proposal"]), sourceId: z.uuid().nullable(), locator: z.string().max(1000) }),
  reason: z.string().max(1000),
  brandbookSource: z.strictObject({submissionId:z.uuid(),findingIds:z.array(z.uuid()).nonempty()}).optional(),
});
export const brandDraftSchema = z.strictObject({
  schemaVersion: z.literal("1.0"), mode: z.enum(["ad_led", "hybrid", "agent_led"]), instructions: z.string().max(8000), boundaries: z.string().max(3000),
  sourceAssetIds: z.array(z.uuid()).max(20), sourceMaterialIds:z.array(z.uuid()).max(100).optional(),
  links: z.array(z.strictObject({ id: z.uuid(), title: z.string().max(160), url: z.string().max(1000), excerpt: z.string().max(6000) })).max(12),
  rules: z.array(brandRuleSchema).max(40),
  conflicts: z.array(z.strictObject({ id: z.uuid(), text: z.string().max(1000), resolved: z.boolean(), resolution: z.string().max(1500) })).max(20),
  fontRights: z.string().max(2000), fontRightsConfirmed: z.boolean(),
  localeChecks: z.array(z.strictObject({ locale: z.string().max(160), verified: z.boolean(), note: z.string().max(1000) })).max(8),
  proposalStepId: z.uuid().nullable(),intakeStepId:z.uuid().optional(),
  brandbookImports:z.array(z.strictObject({submissionId:z.uuid(),versionNo:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/),findingCount:z.number().int().nonnegative()})).optional(),
});
export type BrandDraft = z.infer<typeof brandDraftSchema>;
export type BrandRule = z.infer<typeof brandRuleSchema>;
export type BrandAsset = { id: string; sha256: string; filename: string; mime: string; bytes: number };
export const requiredBrandRules = [
  ["logo", "usage"], ["product", "immutables"], ["color", "ink"], ["color", "paper"],
  ["typography", "headlineFamily"], ["typography", "bodyFamily"], ["layout", "safeAreaRule"],
  ["motion", "motionSystem"], ["imagery", "treatment"], ["voice", "tone"], ["sound", "policy"], ["prohibition", "policy"],
] as const;
export function emptyBrandDraft(locales: string[]): BrandDraft {
  return { schemaVersion: "1.0", mode: "hybrid", instructions: "", boundaries: "", sourceAssetIds: [], links: [], rules: [], conflicts: [], fontRights: "", fontRightsConfirmed: false,
    localeChecks: locales.map(locale => ({ locale, verified: false, note: "" })), proposalStepId: null };
}
export function newBrandRule(category: typeof brandCategories[number], key: string, id: string): BrandRule {
  return { id, category, key, value: "", status: "proposed", decision: "unreviewed", sourceVerified: false, provenance: { kind: "ad_instruction", sourceId: null, locator: "" }, reason: "" };
}
export function brandInputErrors(draft: BrandDraft, c1Id: string, assets: BrandAsset[], materials:BrandAsset[] = [],allowIncomplete=false) {
  const errors: string[] = [];
  if (!allowIncomplete&&(new Set(draft.rules.map(r => r.id)).size !== draft.rules.length || new Set(draft.rules.map(r => `${r.category}.${r.key}`)).size !== draft.rules.length)) errors.push("Rule identities and category/key pairs must be unique.");
  for (const [label, values] of [["material",draft.sourceMaterialIds??[]],["source", draft.sourceAssetIds], ["link", draft.links.map(l => l.id)], ["locale", draft.localeChecks.map(l => l.locale)], ["conflict", draft.conflicts.map(c => c.id)]] as const) if (new Set(values).size !== values.length) errors.push(`Duplicate ${label} identity.`);
  if (draft.sourceAssetIds.some(id => !assets.some(a => a.id === id))) errors.push("A selected source is not a validated campaign asset.");
  if((draft.sourceMaterialIds??[]).some(id=>!materials.some(m=>m.id===id)))errors.push("A selected brand material is not processed in this campaign.");
  if(!allowIncomplete)for (const link of draft.links) { try { const u = new URL(link.url); if (!["http:", "https:"].includes(u.protocol) || !link.title.trim()) throw new Error(); } catch { errors.push("Every source link needs a title and HTTP(S) URL."); } }
  for (const rule of draft.rules) {
    const p = rule.provenance;
    if ((p.kind === "c1" && p.sourceId !== c1Id) || (p.kind === "asset" && !draft.sourceAssetIds.includes(p.sourceId ?? "")) || (p.kind === "link" && !draft.links.some(l => l.id === p.sourceId)) || (p.kind === "material" && !(draft.sourceMaterialIds??[]).includes(p.sourceId??"")) || (["ad_instruction","proposal"].includes(p.kind) && p.sourceId !== null)) errors.push(`Rule ${rule.category}.${rule.key} has a foreign source reference.`);
  }
  return errors;
}
export function brandAcceptanceBlockers(draft: BrandDraft, locales: string[], c1Id: string, assets: BrandAsset[], materials:BrandAsset[] = []) {
  const errors = brandInputErrors(draft, c1Id, assets,materials);
  if (!draft.instructions.trim() || !draft.boundaries.trim()) errors.push("Provide AD instructions and creative-freedom boundaries.");
  if (draft.rules.some(r => r.decision === "unreviewed")) errors.push("Review every rule: accept it for this campaign or reject it.");
  const accepted = draft.rules.filter(r => r.decision === "accepted");
  for (const [category, key] of requiredBrandRules) if (!accepted.some(r => r.category === category && r.key === key && r.value.trim())) errors.push(`Accept a value for ${category}.${key}.`);
  for (const rule of accepted) {
    const label = `${rule.category}.${rule.key}`;
    if (!rule.value.trim() || !rule.provenance.locator.trim() || !rule.reason.trim()) errors.push(`${label} needs a value, source location and decision rationale.`);
    if (rule.status === "unknown") errors.push(`${label} has unknown evidence status.`);
    if (rule.provenance.kind === "proposal") errors.push(`${label} is an unsourced agent proposal. Select a real source or explicitly author it as an AD instruction before acceptance.`);
    if (["confirmed", "provided"].includes(rule.status) && !rule.sourceVerified) errors.push(`${label} needs explicit AD source verification.`);
    if (rule.provenance.kind === "ad_instruction" && !draft.instructions.trim()) errors.push(`${label} has no AD instruction source.`);
    if (rule.category === "color" && !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(rule.value)) errors.push(`${label} must be an exact hex color.`);
  }
  if (draft.conflicts.some(c => !c.text.trim() || !c.resolved || !c.resolution.trim())) errors.push("Describe and resolve all recorded conflicts with an explanation.");
  if (!draft.fontRightsConfirmed || !draft.fontRights.trim()) errors.push("Record and confirm font rights and permitted substitutions.");
  if (draft.localeChecks.some(c => !locales.includes(c.locale)) || locales.some(locale => !draft.localeChecks.some(c => c.locale === locale && c.verified && c.note.trim()))) errors.push("The AD must record typography/glyph coverage checks for every C1 locale.");
  return errors;
}
export function brandTokens(draft: BrandDraft) {
  const tokens: Record<string, Record<string, { value: string; ruleId: string; originStatus: string }>> = {};
  for (const r of draft.rules.filter(r => r.decision === "accepted")) { tokens[r.category] ??= {}; tokens[r.category][r.key] = { value: r.value, ruleId: r.id, originStatus: r.status }; }
  return tokens;
}
const proposalRuleSchema = brandRuleSchema.omit({ id: true, decision: true, sourceVerified: true });
export const brandProposalSchema = z.strictObject({ graphics:graphicProposalSchema.optional(),rules: z.array(proposalRuleSchema).max(40), conflicts: z.array(z.string().max(1000)).max(20) });
export function importBrandProposal(output: string, draft: BrandDraft, stepId: string, makeId: () => string, c1Reference?: {checkpointId:string;briefRevisionId:string}): BrandDraft {
  const envelope = z.object({ role: z.literal("brand-kit"), deliverable: z.object({ brandKitProposal: brandProposalSchema }) }).parse(JSON.parse(canonicalizeAgentRole(output,"brand-kit").text));
  const p = envelope.deliverable.brandKitProposal;
  if(p.graphics){const encoded=JSON.stringify(p.graphics);p.rules.push({category:'layout',key:'graphicProposal',value:encoded.length<=2000?encoded:JSON.stringify({button:p.graphics.button,highlight:p.graphics.highlight,iconStyle:p.graphics.iconStyle}),status:'proposed',provenance:{kind:'proposal',sourceId:null,locator:'Optional structured brand graphics'},reason:encoded.length<=2000?'Optional proposal; validate palette and SVG before use.':'Optional SVG omitted because it exceeds the campaign rule limit.'});}
  // Rules the AD curated from the brandbook stay; the agent only fills keys that are missing or empty.
  const curated = draft.rules.filter(r => r.brandbookSource && r.decision !== "rejected"), kept = curated.filter(r => r.value.trim()), keptKeys = new Set(kept.map(r => `${r.category}.${r.key}`));
  const added = p.rules.filter(r => !keptKeys.has(`${r.category}.${r.key}`)).filter((r, i, all) => all.findIndex(o => o.category === r.category && o.key === r.key) === i).slice(0, Math.max(0, 40 - curated.length));
  if (!kept.length && !added.length) throw new Error("EMPTY_BRAND_PROPOSAL");
  return brandDraftSchema.parse({ ...draft, proposalStepId: stepId, rules: [...kept, ...curated.filter(r => !r.value.trim() && !added.some(a => a.category === r.category && a.key === r.key)), ...added.map(r => ({ ...r, id: makeId(), decision: "unreviewed" as const, sourceVerified: false,
    provenance:r.provenance.kind==="c1"&&c1Reference&&r.provenance.sourceId===c1Reference.briefRevisionId?{...r.provenance,sourceId:c1Reference.checkpointId,locator:`Submitted brief ${c1Reference.briefRevisionId}: ${r.provenance.locator}`.slice(0,1000)}:r.provenance,
    status: r.status === "confirmed" ? "provided" as const : r.status, reason: r.status === "confirmed" ? `Model claimed confirmation; AD verification is pending. ${r.reason}` : r.reason }))],
    conflicts: p.conflicts.map(text => ({ id: makeId(), text, resolved: false, resolution: "" })), fontRightsConfirmed: false, localeChecks: draft.localeChecks.map(c => ({ ...c, verified: false })) });
}
export type BrandRevision = { id: string; revision_no: number; source_draft_version: number; sha256: string; created_at: string; payload: { kit: BrandDraft; inputs: { sourceAssets: BrandAsset[] }; tokens: ReturnType<typeof brandTokens>; blockers: string[] } };
export type A1Review = { id: string; brand_revision_id: string; round_no:number; decision: "accepted" | "changes_requested"; sha256: string; created_at: string; payload: { reviewerName: string; comments: string } };
export type BrandWorkspaceRecord = {creativeReadiness?:import('../brand/resolve-system').BrandResolution|null; draftReplay?:{roundId:string;roundNo:number;feedback:{id:string;comments:string}|null}|null; schemaReady: boolean; c1SchemaReady:boolean; budget:{status:string;cap_micro_usd:number;charged_micro_usd:number;reserved_micro_usd:number}|null; c1: { id: string; run_id: string; payload: import("./workflow").ClientCheckpoint } | null;
  submittedBrandbook?:{id:string;version_no:number;sha256:string;summary:{findings:number}}|null;brandbookChoices?:Record<string,import('../brand/a1-handoff').BrandbookChoice[]>;
  draft: { version: number; round_no:number; payload: BrandDraft; updated_at: string } | null; assets: BrandAsset[]; materials?:BrandAsset[]; revisions: BrandRevision[]; reviews: A1Review[];
  steps: { id: string; status: string; prompt: string; output: string | null; error_code: string | null; cost_micro_usd: number | null; usage?:{_studio?:{providerError?:import("./provider-error").ProviderErrorDetail;finishReason?:string|null;maxOutputTokens?:number}}|null; config_snapshot: { brandDraftVersion?: number } }[] };

/**
 * The single-click run review: accept every non-rejected rule, adopt unsourced proposals as AD
 * extensions, record the human attestations and optionally the Noto Sans draft fallback.
 * Shared by the server approval and the run page, so the page can show what would still block.
 */
const stableRuleId = (seed: string) => { let h = 2166136261; const hex: string[] = []; for (let round = 0; round < 4; round++) { for (const ch of `${round}:${seed}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; hex.push(h.toString(16).padStart(8, "0")); } const x = hex.join(""); return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-8${x.slice(17, 20)}-${x.slice(20, 32)}`; };
export function applyRunBrandReview(source: BrandDraft, input: { reviewerName: string; note: string; fontRights?: string; fallbackRuleId: string | null }): BrandDraft {
  const draft: BrandDraft = structuredClone(source);
  draft.rules = draft.rules.map((rule) =>
    rule.decision === "rejected" || (!rule.value.trim() && !requiredBrandRules.some(([c, k]) => c === rule.category && k === rule.key))
      ? { ...rule, decision: "rejected" as const }
      : {
          ...rule,
          decision: "accepted",
          sourceVerified: true,
          ...(rule.provenance.kind === "proposal"
            ? {
                provenance: { kind: "ad_instruction" as const, sourceId: null, locator: `Run brand review: ${input.reviewerName}` },
                status: rule.status === "unknown" ? ("proposed" as const) : rule.status,
                reason: `AD adopted this campaign extension. ${rule.reason}`.slice(0, 1000),
              }
            : {}),
        },
  );
  // Required rules the brandbook did not cover get recorded, editable defaults so one click always completes the review.
  const defaults: Record<string, string> = {
    "logo.usage": "Place the supplied logo exactly as drawn; never redraw or recolour it.",
    "product.immutables": "Keep the product, its interface and every claim exactly as supplied.",
    "color.ink": draft.rules.find(r => r.category === "color" && r.key === "paper" && /^#[0-9a-f]{6}/i.test(r.value) && parseInt(r.value.slice(1, 3), 16) > 128) ? "#0b0b0b" : "#ffffff",
    "color.paper": "#0b0b0b",
    "typography.headlineFamily": draft.rules.find(r => r.category === "typography" && r.key === "bodyFamily" && r.value.trim())?.value ?? "Noto Sans",
    "typography.bodyFamily": draft.rules.find(r => r.category === "typography" && r.key === "headlineFamily" && r.value.trim())?.value ?? "Noto Sans",
    "layout.safeAreaRule": "Keep text, logo and CTA inside each placement's safe zone.",
    "motion.motionSystem": "Calm, short eases; at most two moving elements at once.",
    "imagery.treatment": "Use the supplied product media; generated imagery stays on-brand and text-free.",
    "voice.tone": "Clear, confident and concise.",
    "sound.policy": "No sound unless the brief supplies an audio file.",
    "prohibition.policy": "Do not alter the logo, product interface or protected claims.",
  };
  for (const [category, key] of requiredBrandRules) {
    const existing = draft.rules.find(r => r.category === category && r.key === key);
    if (existing?.decision === "rejected" || existing?.value.trim()) continue;
    const rule: BrandRule = { id: existing?.id ?? stableRuleId(`${category}.${key}:${source.rules.map(r => r.id).join(",")}`), category, key, value: defaults[`${category}.${key}`], status: "proposed", decision: "accepted", sourceVerified: true,
      provenance: { kind: "ad_instruction", sourceId: null, locator: `Run brand review default: ${input.reviewerName}` }, reason: "Default used because the brandbook had no value for this rule. Change it with a brand change request." };
    if (existing) draft.rules[draft.rules.indexOf(existing)] = rule; else if (draft.rules.length < 40) draft.rules.push(rule);
  }
  if (input.fontRights?.trim()) draft.fontRights = input.fontRights.trim();
  if (!draft.fontRights.trim()) draft.fontRights = `Font use confirmed by ${input.reviewerName} in the run review.`;
  draft.fontRightsConfirmed = true;
  draft.localeChecks = draft.localeChecks.map((check) => ({
    ...check,
    verified: true,
    note: check.note.trim() || `Human typography/coverage attestation by ${input.reviewerName}: ${input.note}`.slice(0, 1000),
  }));
  if (input.fallbackRuleId && !draft.rules.some((r) => r.category === "typography" && r.key === "draftFallback"))
    draft.rules.push({
      id: input.fallbackRuleId,
      category: "typography",
      key: "draftFallback",
      value: "Noto Sans",
      status: "proposed",
      decision: "accepted",
      sourceVerified: true,
      provenance: { kind: "ad_instruction", sourceId: null, locator: `Run review: ${input.reviewerName}` },
      reason: "The AD explicitly permits the packaged Noto Sans family for local draft previews. Original brand families remain recorded.",
    });
  if (!draft.instructions.trim()) draft.instructions = `Use the approved brand rules. Reviewed by ${input.reviewerName}.`;
  if (!draft.boundaries.trim()) draft.boundaries = "Stay within the accepted brand rules; product, logo and interface stay exact.";
  return draft;
}
