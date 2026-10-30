import {z} from "zod";
import {id,rect,sha256} from "./common";
import type {SceneSpec} from "./scene";
export const draftRecipes=["editorial","split","product"] as const;
export const draftBindingSchema=z.strictObject({
 id:z.uuid(),variantIds:z.array(id).min(1).max(128),locale:id,
 hook:z.string().max(800),proof:z.string().max(1400),cta:z.string().max(500),legal:z.string().max(1200),
 sequence:z.array(z.enum(["hook","proof","cta"])).length(3),beatWeights:z.tuple([z.number().positive().max(100),z.number().positive().max(100),z.number().positive().max(100)]).default([1,1,1]),
 heroAssetId:z.uuid().nullable(),logoAssetId:z.uuid().nullable(),audioAssetId:z.uuid().nullable(),
 resource:z.discriminatedUnion("kind",[
  z.strictObject({kind:z.literal("video"),motionIntent:z.string().max(1000),compositionIntent:z.string().max(1000),protectedArea:rect}),
  z.strictObject({kind:z.literal("model3d"),cameraRecipeId:id,boundsMeters:z.strictObject({x:z.number().positive(),y:z.number().positive(),z:z.number().positive()}),compositionIntent:z.string().max(1000),protectedArea:rect}),
 ]).nullable(),
});
export const draftPlanSchema=z.strictObject({schemaVersion:z.literal("1.0"),
 fontFamily:z.literal("Noto Sans"),assetUseConfirmed:z.boolean(),mandatoryLegal:z.string().max(1200),
 directions:z.array(z.strictObject({id:z.uuid(),title:z.string().max(120),idea:z.string().max(1000),recipe:z.enum(draftRecipes),bindings:z.array(draftBindingSchema).max(128)})).length(3),
});
export type DraftPlan=z.infer<typeof draftPlanSchema>;
export type DraftBinding=z.infer<typeof draftBindingSchema>;
export type DraftSource={id:string;mime:string;sha256:string;bytes:number;filename:string;inspection:{width?:number|null;height?:number|null;durationSeconds?:number|null;streams?:{type:string;channels?:number|null;sampleRate?:number|null}[]}};
export type DraftProgram={engine?:import('./frame-program').EngineProgram;id:string;directionId:string;variantId:string;title:string;idea:string;recipe:typeof draftRecipes[number];width:number;height:number;fps:number;durationFrames:number;locale:string;placementId:string;colors:{ink:string;paper:string};scenes:SceneSpec[];audio:{assetRevisionId:string;objectKey:string;sha256:string;gain:number}|null};
export type DraftIssue={code:string;message:string;directionId?:string;variantId?:string;slotId?:string};
export type DraftFit={key:string;fontSize:number;lines:string[];widths:number[];fits:boolean};
export type DraftTextTask={key:string;text:string;width:number;height:number;minFont:number;maxFont:number;maxLines:number};
export type DraftCompilation={schemaVersion:"1.0";compilerVersion:"m07.1";planHash:string;sourceAssets:{id:string;sha256:string}[];programs:DraftProgram[];qa:{passed:boolean;issues:DraftIssue[];orderedVariants:number;candidateBindings:number;fontMeasured:boolean;measurementEngine:string;fits:DraftFit[]}};
export const draftRequestSchema=z.discriminatedUnion("action",[
 z.strictObject({action:z.literal("build"),expectedVersion:z.number().int().positive()}),
 z.strictObject({action:z.literal("propose"),expectedVersion:z.number().int().positive(),requestId:z.uuid(),correction:z.string().max(2000)}),
 z.strictObject({action:z.literal("import"),expectedVersion:z.number().int().positive(),stepId:z.uuid()}),
]);
export const draftBatchRefSchema=z.strictObject({id:z.uuid(),sha256,source_plan_version:z.number().int().positive()});
export function emptyDraftPlan(makeId:()=>string):DraftPlan{return {schemaVersion:"1.0",fontFamily:"Noto Sans",assetUseConfirmed:false,mandatoryLegal:"",directions:draftRecipes.map((recipe,i)=>({id:makeId(),title:`Direction ${i+1}`,idea:"",recipe,bindings:[]}))};}
export type DraftWorkspaceRecord={creativeActive?:boolean;schemaReady:boolean;workflowReady:boolean;c1Ready:boolean;a1Ready:boolean;round:{id:string;run_id:string;phase:string;blocker:string|null;status:string}|null;c1:{scope:import("./campaign").CampaignScope;variantManifest:import("./campaign").VariantManifest}|null;
 plan:{version:number;payload:DraftPlan}|null;assets:DraftSource[];batches:{id:string;sha256:string;source_plan_version:number;created_at:string;summary:{directions:{id:string;title:string;idea:string;recipe:string}[];orderedVariants:number;candidateBindings:number}}[];
 jobs:{id:string;job_key?:string;state:string;blocker:string|null;output:string|null;created_at:string}[];proposals:{id:string;status:string;output:string|null;error_code:string|null;config_snapshot:{draftPlanVersion?:number}}[]};
