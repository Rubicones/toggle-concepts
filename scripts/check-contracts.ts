import {structuralJSONSchema} from '../packages/contracts/schema-export';
import {brandSystemSchema,copyBudgetSchema,scriptSpecV2Schema,treatmentSchema,sceneSpecV2Schema,mediaPlanSchema,criticSchema,creativeIssueSchema,repairLogSchema,flatProviderSchema} from '../packages/contracts/creative-drafts';
import {engineProgramSchema,draftBatchV2Schema} from '../packages/contracts/frame-program';
import {creativePatchSchema} from '../packages/agents/prompts/creative-repair-v1';
import {localizationBindings} from '../packages/contracts/localization';
import {previewProtocol} from '../packages/contracts/preview-proposal';
import {compilerFixture} from '../fixtures/drafts';
import {agentResponseSchema} from '../packages/contracts/agent-output';
import {runLimitChangeSchema} from '../packages/contracts/run-limits';
import {guidedRunCommand} from '../packages/contracts/guided-run';
import {fieldFindingSchema,fieldResponseSchema} from "../packages/brand/field-extraction";
import {draftReviewCommandSchema,a2ReviewSchema} from "../packages/contracts/draft-review";
import {imageOptionsSchema} from "../packages/contracts/image-generation";
import {imageReferenceSchema} from "../packages/agents/image-references";
import {providerReceiptSchema,receiptCommandSchema} from "../packages/contracts/provider-receipt";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { lumaManifest, lumaScope, spikeManifest, spikeScope } from "../fixtures/campaign";
import { mockC1, mockC2, mockC3 } from "../fixtures/checkpoints";
import { sampleScene } from "../fixtures/scene";
import { campaignScopeSchema, validateVariantManifest, variantManifestSchema } from "../packages/contracts/campaign";
import { parseScene, sceneSpecSchema, finalResourceContractSchema } from "../packages/contracts/scene";
import { clientCheckpointSchema, parseCheckpoint, executionConfigSchema } from "../packages/contracts/workflow";
import { renderManifestSchema } from "../packages/contracts/render";
import { uploadRequestSchema, campaignRequestSchema, noteRequestSchema, shareRequestSchema, workspaceResponseSchema, clientResponseSchema, readAccessSchema, uploadAccessSchema, accessRequestSchema, accessResponseSchema } from "../packages/contracts/data";
import { fileDigest } from "../apps/local-runner/files";
import { localCampaignSchema, studioStoreSchema, workerStatusSchema, workerViewSchema } from "../packages/contracts/studio";
import {draftPlanSchema,draftRequestSchema,draftBatchRefSchema} from "../packages/contracts/drafts";
import {workflowCommandSchema,agentEnvelopeSchema} from "../packages/contracts/orchestration";
import { briefDraftSchema } from "../packages/contracts/brief";
import { brandDraftSchema, brandProposalSchema } from "../packages/contracts/brand-kit";

import {compactIntakeSchema,compactIntakeV2Schema,universalIntakeSchema} from "../packages/brand/intake-output";
import {materialExtractionSchema,intakeProposalSchema} from "../packages/contracts/brand-intake";
validateVariantManifest(lumaScope, lumaManifest);
validateVariantManifest(spikeScope, spikeManifest);
parseScene(sampleScene);
[mockC1, mockC2, mockC3].forEach(parseCheckpoint);
for (const asset of sampleScene.assets) assert.equal(fileDigest(`public/${asset.objectKey}`), asset.sha256, `Changed bytes: ${asset.objectKey}`);
mkdirSync("artifacts/m00/schemas", { recursive: true });
for (const [name, schema] of Object.entries({ CampaignScope: campaignScopeSchema, VariantManifest: variantManifestSchema,
  ClientCheckpoint: clientCheckpointSchema, ExecutionConfig: executionConfigSchema, SceneSpec: sceneSpecSchema,
  FinalResourceContract: finalResourceContractSchema, RenderManifest: renderManifestSchema })) {
  writeFileSync(`artifacts/m00/schemas/${name}.json`, `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`);
}
mkdirSync("artifacts/m01/schemas", { recursive: true });
for (const [name, schema] of Object.entries({ LocalCampaign: localCampaignSchema, StudioStore: studioStoreSchema,
  WorkerStatus: workerStatusSchema, WorkerView: workerViewSchema })) {
  writeFileSync(`artifacts/m01/schemas/${name}.json`, `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`);
}
mkdirSync("artifacts/m02/schemas", { recursive: true });
for (const [name, schema] of Object.entries({ UploadRequest: uploadRequestSchema, CampaignRequest: campaignRequestSchema,
  NoteRequest: noteRequestSchema, ShareRequest: shareRequestSchema, WorkspaceResponse: workspaceResponseSchema,
  ClientResponse: clientResponseSchema, ReadAccess: readAccessSchema, UploadAccess: uploadAccessSchema,
  AccessRequest: accessRequestSchema, AccessResponse: accessResponseSchema })) {
  writeFileSync(`artifacts/m02/schemas/${name}.json`, `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`);
}
mkdirSync("artifacts/m04/schemas", { recursive: true });
writeFileSync("artifacts/m04/schemas/BriefDraft.json", `${JSON.stringify(z.toJSONSchema(briefDraftSchema), null, 2)}\n`);
mkdirSync("artifacts/m05/schemas", { recursive: true });
for(const [name,schema] of Object.entries({BrandDraft:brandDraftSchema,BrandProposal:brandProposalSchema}))writeFileSync(`artifacts/m05/schemas/${name}.json`, `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`);
mkdirSync("artifacts/m06/schemas",{recursive:true});
for(const [name,schema] of Object.entries({WorkflowCommand:workflowCommandSchema,AgentEnvelope:agentEnvelopeSchema}))writeFileSync(`artifacts/m06/schemas/${name}.json`,`${JSON.stringify(structuralJSONSchema(schema),null,2)}\n`);
mkdirSync("artifacts/m07/schemas",{recursive:true});
for(const [name,schema] of Object.entries({DraftPlan:draftPlanSchema,DraftRequest:draftRequestSchema,DraftBatchRef:draftBatchRefSchema}))writeFileSync(`artifacts/m07/schemas/${name}.json`,`${JSON.stringify(structuralJSONSchema(schema),null,2)}\n`);
mkdirSync("artifacts/brand-intake/schemas",{recursive:true});
for(const [name,schema] of Object.entries({BrandMaterialExtraction:materialExtractionSchema,BrandIntakeProposal:intakeProposalSchema,BrandIntakeNativeResponseV1:compactIntakeSchema(2),BrandIntakeNativeResponseV2:compactIntakeV2Schema(2),BrandIntakeUniversalResponse:universalIntakeSchema(2)}))writeFileSync(`artifacts/brand-intake/schemas/${name}.json`,`${JSON.stringify(structuralJSONSchema(schema),null,2)}\n`);
mkdirSync("artifacts/m08/schemas",{recursive:true});
for(const [name,schema] of Object.entries({DraftReviewCommand:draftReviewCommandSchema,A2Review:a2ReviewSchema}))writeFileSync(`artifacts/m08/schemas/${name}.json`,`${JSON.stringify(structuralJSONSchema(schema),null,2)}\n`);
mkdirSync("artifacts/m09/schemas",{recursive:true});
for(const [name,schema] of Object.entries({ProviderReceipt:providerReceiptSchema,ReceiptCommand:receiptCommandSchema,ImageOptions:imageOptionsSchema,ImageReference:imageReferenceSchema}))writeFileSync(`artifacts/m09/schemas/${name}.json`,`${JSON.stringify(structuralJSONSchema(schema),null,2)}\n`);
mkdirSync("artifacts/brand-fields/schemas",{recursive:true});
for(const [name,schema] of Object.entries({BrandFieldFinding:fieldFindingSchema,BrandFieldResponse:fieldResponseSchema}))writeFileSync(`artifacts/brand-fields/schemas/${name}.json`,`${JSON.stringify(structuralJSONSchema(schema),null,2)}\n`);

mkdirSync("artifacts/guided-run/schemas",{recursive:true});
writeFileSync("artifacts/guided-run/schemas/RunCommand.json",JSON.stringify(z.toJSONSchema(guidedRunCommand),null,2));

writeFileSync("artifacts/guided-run/schemas/RunLimitChange.json",JSON.stringify(z.toJSONSchema(runLimitChangeSchema),null,2));

for(const role of ["research","strategy","variants","script","localization","visual-direction"])writeFileSync(`artifacts/guided-run/schemas/${role}-response.json`,JSON.stringify(agentResponseSchema(role,role==='localization'?{entries:lumaManifest.entries}:undefined).schema,null,2));

const previewFixture=compilerFixture();const previewPlanning=[{id:'schema-localization-fixture',role:'localization',output:JSON.stringify({deliverable:{localizedCopy:localizationBindings(previewFixture.context.manifest.entries).map(r=>({variantIds:r.variantIds,locale:r.locale,copySlot:'hook',text:'Saved example copy'}))}})}];writeFileSync("artifacts/m07/schemas/PreviewNativeResponse.json",JSON.stringify(previewProtocol({plan:previewFixture.plan,entries:previewFixture.context.manifest.entries,assets:previewFixture.context.assets,planning:previewPlanning}).responseSchema.schema,null,2));

mkdirSync('artifacts/m07b/schemas',{recursive:true});
for(const [name,schema] of Object.entries({BrandSystem:brandSystemSchema,CopyBudget:copyBudgetSchema,ScriptSpecV2:scriptSpecV2Schema,Treatment:treatmentSchema,SceneSpecV2:sceneSpecV2Schema,MediaPlan:mediaPlanSchema,CreativeCritic:criticSchema,CreativeIssue:creativeIssueSchema,CreativeRepair:repairLogSchema,EngineProgram:engineProgramSchema,DraftBatchV2:draftBatchV2Schema,CreativePatch:creativePatchSchema}))writeFileSync(`artifacts/m07b/schemas/${name}.json`,JSON.stringify(structuralJSONSchema(schema),null,2)+'\n');
for(const [name,schema] of Object.entries({script:scriptSpecV2Schema,treatment:treatmentSchema,scenes:sceneSpecV2Schema,media:mediaPlanSchema,critic:criticSchema,repair:creativePatchSchema}))writeFileSync(`artifacts/m07b/schemas/${name}-native.json`,JSON.stringify(flatProviderSchema(schema),null,2)+'\n');
console.log('M07b: twelve versioned contracts and six flat native schemas exported.');
console.log("PASS: ordered manifests, C1/C2/C3, SceneSpec, actual asset hashes and structural/transport schema exports. Known historical engine payloads are explicitly labelled opaque.");
console.log("Cross-artifact invariants use the exported validators; JSON Schema alone is insufficient.");
