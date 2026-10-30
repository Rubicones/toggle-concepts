import {readPrograms} from '../creative/program-reader';
// Node-only pure snapshot construction. Decisions are committed by a locked RPC.
import {createHash,randomUUID} from 'node:crypto';
import {canonicalJson} from '../contracts/common';
import {a2ReviewSchema,selectedConcepts} from '../contracts/draft-review';
import {parseCheckpoint,type ClientCheckpoint} from '../contracts/workflow';
import type {DraftCompilation} from '../contracts/drafts';
export const reviewHash=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
export function a2Snapshot(input:Omit<import('zod').infer<typeof a2ReviewSchema>,'schemaVersion'|'id'|'stage'|'decidedAt'>){return canonicalJson(a2ReviewSchema.parse({schemaVersion:'1.0',id:randomUUID(),stage:'A2',decidedAt:new Date().toISOString(),...input}));}
export function c2Snapshot({c1,batch,a1,a2,actorId,selection}:{c1:ClientCheckpoint;batch:{id:string;sha256:string;payload:DraftCompilation|import('../contracts/frame-program').DraftBatchV2};a1:{id:string;sha256:string};a2:{id:string;sha256:string};actorId:string;selection:string[]}){
 if(c1.stage!=='C1'||!batch.payload.qa.passed||!batch.payload.qa.fontMeasured||batch.payload.qa.issues.length)throw new Error('DRAFT_QA_BLOCKED');
 const programs=batch.payload.schemaVersion==='1.0'?batch.payload.programs:readPrograms(batch.payload),candidates=[...new Set(programs.map(p=>p.directionId))];
 if(programs.length!==3*c1.variantManifest.entries.length)throw new Error('INCOMPLETE_DRAFT_BATCH');
 for(const direction of candidates)for(const row of c1.variantManifest.entries)if(programs.filter(p=>p.directionId===direction&&p.variantId===row.id&&p.locale===row.locale&&p.placementId===row.placementId).length!==1)throw new Error('INCOMPLETE_DRAFT_BATCH');
 const layouts=programs.map(p=>({revisionId:p.id,sha256:reviewHash(p)}));
 const contracts=new Map(programs.flatMap(p=>p.scenes.flatMap(s=>s.resourceContracts)).map(c=>[c.revisionId,c]));
 const resources=[...contracts].map(([revisionId,c])=>({revisionId,sha256:reviewHash(c)}));
 const refs=[c1.executionConfig,{revisionId:batch.id,sha256:batch.sha256},{revisionId:a1.id,sha256:a1.sha256},{revisionId:a2.id,sha256:a2.sha256},...layouts,...resources];
 const checkpoint=parseCheckpoint({schemaVersion:'1.0',stage:'C2',id:randomUUID(),campaignId:c1.campaignId,runId:c1.runId,actorId,acceptedAt:new Date().toISOString(),scope:c1.scope,variantManifest:c1.variantManifest,executionConfig:c1.executionConfig,budgetScopes:c1.budgetScopes,originC1Id:c1.id,draftBatch:{revisionId:batch.id,sha256:batch.sha256},draftCandidateIds:candidates,selectedConcepts:selectedConcepts(selection,candidates,c1.scope.finalConceptCount),layoutBindings:layouts,resourceContracts:resources,adReviews:{A1:refs[2],A2:refs[3]},acceptedArtifacts:refs});
 return {checkpoint,source:canonicalJson(checkpoint)};
}
// Restricted client projection, deliberately constructed without spreading internal rows.
export function clientReviewBatch(batch:{id:string;sha256:string;source_plan_version:number;created_at:string;summary:unknown},current:boolean){return {id:batch.id,sha256:batch.sha256,source_plan_version:batch.source_plan_version,created_at:batch.created_at,summary:batch.summary,current};}
