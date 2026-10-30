import assert from "node:assert/strict";
import { createHash,randomUUID } from "node:crypto";
import { test } from "node:test";
import { completeBrandDraft } from "../fixtures/brand";
import { completeTestBrief } from "../fixtures/brief";
import { defaultAgentSettings } from "../packages/agents/defaults";
import { brandAcceptanceBlockers,brandInputErrors,brandTokens,emptyBrandDraft,importBrandProposal } from "../packages/contracts/brand-kit";
import { brandSnapshot,brandInputs } from "../packages/data/brand-snapshot";
import { buildC1Snapshot } from "../packages/data/brief-snapshot";

test("A1 requires complete reviewed rules, exact colors, rights and every C1 locale",()=>{
 const cp=randomUUID(),locales=["en-GB","ru-RU"],draft=completeBrandDraft(locales);
 assert.deepEqual(brandAcceptanceBlockers(draft,locales,cp,[]),[]);
 assert.ok(brandAcceptanceBlockers(emptyBrandDraft(locales),locales,cp,[]).length>0);
 const unknown=structuredClone(draft);unknown.rules[0].status="unknown";assert.ok(brandAcceptanceBlockers(unknown,locales,cp,[]).some(e=>e.includes("unknown")));
 const pending=structuredClone(draft);pending.rules[0].decision="unreviewed";assert.ok(brandAcceptanceBlockers(pending,locales,cp,[]).some(e=>e.includes("every rule")));
 const bad=structuredClone(draft);bad.rules.find(r=>r.category==="color")!.value="url(https://invalid.test)";assert.ok(brandAcceptanceBlockers(bad,locales,cp,[]).some(e=>e.includes("hex")));
 draft.localeChecks.pop();assert.ok(brandAcceptanceBlockers(draft,locales,cp,[]).some(e=>e.includes("every C1 locale")));
});
test("rule provenance cannot point to foreign sources, and accepting a proposal preserves its origin",()=>{
 const draft=completeBrandDraft(["en-GB"]),cp=randomUUID();assert.equal(brandTokens(draft).color.ink.originStatus,"proposed");
 draft.rules[0].provenance={kind:"asset",sourceId:randomUUID(),locator:"foreign"};assert.ok(brandInputErrors(draft,cp,[]).length);
 draft.rules[0].provenance={kind:"c1",sourceId:randomUUID(),locator:"other checkpoint"};assert.ok(brandInputErrors(draft,cp,[]).some(e=>e.includes("foreign")));
});
test("AI import cannot approve rules, source verification or font checks",()=>{
 const draft=completeBrandDraft(["en-GB"]),rule=draft.rules[0];const {id,decision,sourceVerified,...candidate}=rule;void id;void decision;void sourceVerified;
 const output=JSON.stringify({role:"brand-kit",deliverable:{brandKitProposal:{rules:[{...candidate,status:"confirmed"}],conflicts:["Confirm the logo source"]}}});
 const result=importBrandProposal(output,draft,randomUUID(),randomUUID);
 assert.equal(result.rules[0].status,"provided");assert.equal(result.rules[0].decision,"unreviewed");assert.equal(result.rules[0].sourceVerified,false);assert.equal(result.fontRightsConfirmed,false);assert.equal(result.localeChecks[0].verified,false);assert.equal(result.conflicts[0].resolved,false);
 assert.throws(()=>importBrandProposal(JSON.stringify({role:"brand-kit",deliverable:{brandKitProposal:{rules:[{...candidate,decision:"accepted"}],conflicts:[]}}}),draft,randomUUID(),randomUUID));
});
test("Brand Kit snapshots hash exact inputs and do not claim linked pages or assets were read",()=>{
 const made=buildC1Snapshot({campaign:{id:randomUUID(),name:"Test",brand:"Test",version:1},draft:completeTestBrief(),agents:defaultAgentSettings,sources:[],actorId:randomUUID()});
 const draft=completeBrandDraft(made.checkpoint.scope.locales);draft.links=[{id:randomUUID(),title:"Reference",url:"https://example.test/brand",excerpt:""}];
 const inputs=brandInputs(made.checkpoint,draft,[]);assert.equal(inputs.links[0].contentState,"not_fetched");assert.match(inputs.limitations,/No linked page/);
 const snapshot=brandSnapshot(made.checkpoint,draft,[],1,null);assert.equal(snapshot.sha256,createHash("sha256").update(snapshot.source).digest("hex"));
 draft.instructions="Later edit";assert.notEqual(snapshot.payload.kit.instructions,draft.instructions);assert.equal(snapshot.payload.originC1Id,made.checkpoint.id);assert.equal(snapshot.payload.runId,made.checkpoint.runId);
});
