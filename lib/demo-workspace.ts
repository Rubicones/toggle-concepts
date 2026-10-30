import { lumaManifest, lumaScope } from "@/fixtures/campaign";
import { validateVariantManifest } from "@/packages/contracts/campaign";

export const demoCampaigns = [
  { id: "luma-demo", brand: "Luma", name: "Evening essentials", goal: "A little more light for the things that matter.", visual: "luma", type: "demo" },
  { id: "kite-demo", brand: "Kite", name: "Everyday, upgraded", goal: "A visual study for a simpler kind of rewards.", visual: "kite", type: "demo" },
] as const;
export const demoScope = validateVariantManifest(lumaScope, lumaManifest);
export const formatOptions = [
  { label: "9:16", id: "vertical-9x16" }, { label: "4:5", id: "portrait-4x5" },
  { label: "1:1", id: "square-1x1" }, { label: "16:9", id: "wide-16x9" },
] as const;
/** `step` sections form the art director's path; the rest are secondary views. Hidden ones stay routable. */
export const campaignSections = [
  { id: "overview", label: "Overview", hidden: true }, { id: "brand-kit", label: "Brandbook", step: 1 },
  { id: "brief", label: "Questionnaire", step: 2 }, { id: "run", label: "Run", step: 3 }, { id: "drafts", label: "Drafts" },
  { id: "variants", label: "Final variants", hidden: true }, { id: "history", label: "History" },
] as const;
export type CampaignSection = typeof campaignSections[number]["id"];
