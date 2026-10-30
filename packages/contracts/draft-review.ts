import {z} from 'zod';
import {id,sha256} from './common';
import type {DraftProgram} from './drafts';
const common={batchId:z.uuid(),expectedVersion:z.number().int().positive(),requestId:z.uuid(),reviewerName:z.string().trim().min(1).max(160)};
export const draftReviewCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({...common,action:z.literal('comment'),audience:z.enum(['ad','client']),directionId:z.uuid(),variantId:id,sceneId:id,frame:z.number().int().nonnegative(),body:z.string().trim().min(1).max(4000),blocking:z.boolean()}),
 z.strictObject({...common,action:z.literal('a2'),decision:z.enum(['accepted','changes_requested']),comments:z.string().trim().min(1).max(4000),attestations:z.strictObject({creative:z.boolean(),allVariants:z.boolean(),rights:z.boolean()})}),
 z.strictObject({...common,action:z.literal('c2'),decision:z.enum(['accepted','changes_requested']),comments:z.string().trim().min(1).max(4000),selectedConceptIds:z.array(z.uuid()).max(3),confirmScope:z.boolean()}),
]);
export const a2ReviewSchema=z.strictObject({schemaVersion:z.literal('1.0'),id:z.uuid(),stage:z.literal('A2'),campaignId:z.uuid(),runId:z.uuid(),roundId:z.uuid(),actorId:z.uuid(),decidedAt:z.iso.datetime(),batch:z.strictObject({revisionId:z.uuid(),sha256}),sourcePlanVersion:z.number().int().positive(),decision:z.enum(['accepted','changes_requested']),reviewerName:z.string().min(1).max(160),comments:z.string().min(1).max(4000),attestations:z.strictObject({creative:z.boolean(),allVariants:z.boolean(),rights:z.boolean()})});
export function commentTarget(programs:DraftProgram[],target:{directionId:string;variantId:string;sceneId:string;frame:number},referencePlacement?:string){
 const program=programs.find(p=>p.directionId===target.directionId&&p.variantId===target.variantId);
 if(!program||!Number.isInteger(target.frame)||target.frame<0||target.frame>=program.durationFrames||referencePlacement&&program.placementId!==referencePlacement)throw new Error('INVALID_COMMENT_TARGET');
 let offset=0;for(const scene of program.scenes){if(scene.sceneId===target.sceneId&&target.frame>=offset&&target.frame<offset+scene.durationFrames)return program;offset+=scene.durationFrames;}
 throw new Error('INVALID_COMMENT_TARGET');
}
export function selectedConcepts(ids:string[],candidates:string[],count:number){
 if(candidates.length!==3||new Set(candidates).size!==3||ids.length!==count||new Set(ids).size!==ids.length||ids.some(id=>!candidates.includes(id)))throw new Error('C2_SELECTION_REQUIRED');
 return ids.map((conceptId,index)=>({slot:index+1,conceptId}));
}
export type DraftReviewCommand=z.infer<typeof draftReviewCommandSchema>;
export type DraftReviewView={schemaReady:boolean;audience:'ad'|'client';campaignName:string;round:{id:string;round_no:number;run_id:string;version:number;phase:string;status:string;blocker:string|null;previous_round_id:string|null;replay_plan:string[]|null}|null;
 scope:import('./campaign').CampaignScope|null;manifest:import('./campaign').VariantManifest|null;
 batches:{id:string;sha256:string;source_plan_version:number;created_at:string;current:boolean;summary:{deliveries?:{directionId:string;delivery:import('../creative/delivery').DraftDelivery}[];compilerVersion?:string;directions:{id:string;title:string;idea:string;recipe:string}[];orderedVariants:number;candidateBindings:number}}[];
 comments:{id:string;batch_id:string;audience:'ad'|'client';direction_id:string;variant_id:string;scene_id:string;frame:number;reviewer_name:string;body:string;blocking:boolean;created_at:string}[];
 reviews:{id:string;batch_id:string;decision:string;payload:z.infer<typeof a2ReviewSchema>}[];
 decisions:{id:string;batch_id:string;decision:string;reviewer_name:string;comments:string;created_at:string}[];checkpoint:{id:string;sha256:string}|null;};
