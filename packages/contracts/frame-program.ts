import type {DraftDelivery} from '../creative/delivery';
import type {QualityReport} from '../creative/quality';
import {z} from 'zod';
import type {EngineConfig,VariantState} from '../engine/types';
import type {GlyphSnapshot} from '../engine/text-snapshot';
import type {DraftProgram} from './drafts';
import {directionSkeletonSchema,brandSystemSchema,scriptSpecV2Schema,treatmentSchema,sceneSpecV2Schema,mediaPlanSchema,creativeIssueSchema,repairLogSchema,criticSchema} from './creative-drafts';
import {sha256} from './common';
import type {CreativePathMap} from '../creative/to-engine';
import type {FrameModel} from '../engine/sketch/model';

export const frameResourceSchema=z.strictObject({revisionId:z.string(),sha256,objectKey:z.string(),mime:z.string(),kind:z.enum(['font','logo','image','video']),width:z.number().positive().optional(),height:z.number().positive().optional()});
export type FrameResource=z.infer<typeof frameResourceSchema>;
export type EngineProgram={version:'frame@1';config:EngineConfig;variant:VariantState;glyphs:GlyphSnapshot;resources:FrameResource[];issues:z.infer<typeof creativeIssueSchema>[]};
export type FrameProgram=DraftProgram&{engine:EngineProgram};
export type DirectionProgram={delivery?:DraftDelivery;quality?:QualityReport;version:'frame-program@2';directionId:string;title:string;config:EngineConfig;variants:{variantId:string;state:VariantState;fps:number;durationSeconds:number}[];issues:z.infer<typeof creativeIssueSchema>[];pathMap:CreativePathMap;glyphs:GlyphSnapshot;resources:FrameResource[];frames:Record<string,FrameModel>;resourceContracts?:CreativeDirection['scenes']['resourceContracts']};
export const creativeDirectionSchema=z.strictObject({skeleton:directionSkeletonSchema.optional(),id:z.uuid(),script:scriptSpecV2Schema,treatment:treatmentSchema,scenes:sceneSpecV2Schema,media:mediaPlanSchema});
export type CreativeDirection=z.infer<typeof creativeDirectionSchema>;
export const glyphSnapshotSchema=z.strictObject({fonts:z.array(z.tuple([z.string(),z.number().positive()])),units:z.array(z.tuple([z.string(),z.object({adv:z.number(),glyphs:z.array(z.object({gid:z.number(),x:z.number(),y:z.number()})),ink:z.object({x0:z.number(),y0:z.number(),x1:z.number(),y1:z.number()})})])),paths:z.array(z.tuple([z.string(),z.string()]))});
export const engineProgramSchema=z.strictObject({version:z.literal('frame@1'),
 config:z.object({schema:z.literal('ad/engine-config@1'),beats:z.array(z.object({id:z.string()})),formats:z.array(z.object({id:z.string(),w:z.number().positive(),h:z.number().positive()})),lengths:z.record(z.string(),z.array(z.object({beat:z.string(),dur:z.number().positive()})))}).passthrough(),
 variant:z.strictObject({fmt:z.string(),lang:z.string(),hook:z.string(),cta:z.string(),len:z.string()}),glyphs:glyphSnapshotSchema,resources:z.array(frameResourceSchema),issues:z.array(creativeIssueSchema)});
export const directionProgramSchema=z.strictObject({delivery:z.custom<DraftDelivery>().optional(),quality:z.custom<QualityReport>().optional(),version:z.literal('frame-program@2'),directionId:z.uuid(),title:z.string(),config:engineProgramSchema.shape.config,variants:z.array(z.strictObject({variantId:z.string(),state:engineProgramSchema.shape.variant,fps:z.number().positive(),durationSeconds:z.number().positive()})).nonempty(),issues:z.array(creativeIssueSchema),pathMap:z.record(z.string(),z.string()),glyphs:glyphSnapshotSchema,resources:z.array(frameResourceSchema),frames:z.record(z.string(),z.custom<FrameModel>()),resourceContracts:sceneSpecV2Schema.shape.resourceContracts.optional()});
export const draftBatchV2Schema=z.strictObject({schemaVersion:z.literal('2.0'),glyphs:glyphSnapshotSchema.optional(),compilerVersion:z.enum(['m07b.1','m07d.1']),planHash:sha256,brandSystemHash:sha256,brandSystem:brandSystemSchema,directions:z.array(creativeDirectionSchema).length(3),
 editRevisions:z.array(z.strictObject({id:z.uuid(),directionId:z.uuid(),revision:z.number().int().positive()})).optional(),directionPrograms:z.array(directionProgramSchema).optional(),programs:z.array(z.object({id:z.string(),directionId:z.uuid(),variantId:z.string(),width:z.number().positive(),height:z.number().positive(),fps:z.number().positive(),durationFrames:z.number().positive(),engine:engineProgramSchema.optional()}).passthrough()).default([]),
 sourceAssets:z.array(z.strictObject({id:z.string(),sha256})),qa:z.strictObject({passed:z.boolean(),issues:z.array(creativeIssueSchema),orderedVariants:z.number().int().nonnegative(),candidateBindings:z.number().int().nonnegative(),fontMeasured:z.boolean(),measurementEngine:z.string()}),repairLog:z.array(repairLogSchema),
 budget:z.strictObject({estimateMicroUsd:z.number().int().nonnegative(),repairAllowanceMicroUsd:z.number().int().nonnegative(),repairSpentMicroUsd:z.number().int().nonnegative()}),critics:z.array(z.strictObject({direction:z.number().int().min(0).max(2),report:criticSchema})).default([]),setAside:z.array(z.strictObject({directionId:z.string(),variantId:z.string(),reason:z.string()}))});
export type DraftBatchV2=Omit<z.infer<typeof draftBatchV2Schema>,'programs'|'directionPrograms'>&{programs:DraftProgram[];directionPrograms?:DirectionProgram[]};
