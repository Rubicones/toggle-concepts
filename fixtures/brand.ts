// Backend test data only; never inserted into hosted workspaces.
import { randomUUID } from "node:crypto";
import { emptyBrandDraft, newBrandRule, requiredBrandRules } from "../packages/contracts/brand-kit";
export function completeBrandDraft(locales:string[]) {
 const draft=emptyBrandDraft(locales);draft.instructions="AD-authored capsule for isolated qualification.";draft.boundaries="Preserve C1 product shape, logo, claims and scope; experiment only with backgrounds.";
 const values:Record<string,string>={"logo.usage":"Use approved logo without distortion", "product.immutables":"Product shape and approved logo", "color.ink":"#102F40","color.paper":"#F4FAFD","typography.headlineFamily":"Noto Sans","typography.bodyFamily":"Noto Sans","layout.safeAreaRule":"Keep mandatory copy inside the placement safe area","motion.motionSystem":"Calm frame-driven entrances; no overshoot","imagery.treatment":"Accurate product with abstract backgrounds","voice.tone":"Clear and concise","sound.policy":"No voice or music in this profile","prohibition.policy":"No unsupported claims or altered product geometry"};
 draft.rules=requiredBrandRules.map(([category,key])=>({...newBrandRule(category,key,randomUUID()),value:values[`${category}.${key}`],decision:"accepted" as const,reason:"Explicit AD campaign extension, preserving C1.",provenance:{kind:"ad_instruction" as const,sourceId:null,locator:"AD capsule instruction"}}));
 draft.fontRights="Fixture rights note; human attestation is simulated only in this isolated test.";draft.fontRightsConfirmed=true;draft.localeChecks=locales.map(locale=>({locale,verified:true,note:"Isolated test coverage attestation"}));return draft;
}
