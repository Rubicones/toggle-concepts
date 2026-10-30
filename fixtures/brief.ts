// Isolated contract/database check input; never seeded into hosted campaigns.
import { randomUUID } from "node:crypto";
import { briefDraftSchema, emptyBrief, explicitCombinations } from "../packages/contracts/brief";
export function completeTestBrief() {
  const draft = { ...emptyBrief(), product: "Desk lamp", objective: "Product page visits", audience: "Home office workers", markets: "Test market", ownerName: "Test owner", ownerEmail: "owner@example.test", offer: "Explore the lamp", cta: "View lamp", destination: "https://example.test/lamp", deadline: "2026-12-10", timeZone: "Europe/Belgrade", immutables: "Product shape and approved logo", synthesis: "Abstract backgrounds only", variationNotes: "offer: lead with the product benefit; question: lead with a problem question; story: situation then product; proof: product then demonstration; primary offer: view the lamp", rights: "not_needed" as const, rightsNotes: "No original source material supplied.", locales: ["en-GB", "ru-RU"], referenceLocale: "en-GB", hooks: ["offer", "question"], beatSequences: ["story", "proof"], placementIds: ["vertical", "portrait", "square", "wide"] as const };
  const parsed = briefDraftSchema.parse(draft); parsed.entries = explicitCombinations(parsed, randomUUID); return parsed;
}
