import {issuedScenes} from './scenes';
import {z} from 'zod';
import type {DirectionInput,Resource} from './types';
import {normalizeDraftReferences} from './reference-boundary';
import {importMaterialObservations,type MaterialMemory} from './material-memory';
export const DIRECTOR_PROTOCOL='director@1' as const;
const id=z.string().min(1).max(100),words=z.string().min(1).max(6000);
export const resourceSchema=z.strictObject({id,kind:z.enum(['still','3d-still']),purpose:words,scene:id,prompt:words,aspect:z.string().regex(/^\d{1,3}:\d{1,3}$/),referenceAssetIds:z.array(id).max(3),mustNotContain:z.array(words).max(30)});
export const designSchema=z.strictObject({designDocument:z.string().min(80).max(131072),resources:z.array(resourceSchema).max(40)});
export const keyFramesSchema=z.array(z.strictObject({sceneId:id,moments:z.array(z.strictObject({id,description:words})).min(1).max(4)})).min(1).max(40);
const fraction=z.number().min(0).max(1),box=z.array(fraction).length(4);
/** Optional image methods (new blocks only): a blocking sketch for composition, a lossless edit of an earlier picture,
 * or an extension of an earlier picture to another aspect. The app rasterises, merges and stitches; the director decides. */
export const imageMethodSchemas={
 sketch:z.strictObject({shapes:z.array(z.strictObject({role:z.enum(['subject','object','horizon','copy','light']),box,tone:z.enum(['light','mid','dark'])})).min(1).max(8)}),
 edit:z.strictObject({from:id,instruction:z.string().min(1).max(600),region:box.optional()}),
 extend:z.strictObject({from:id,place:z.array(fraction).length(2).optional(),instruction:z.string().min(1).max(400).optional()}),
};
const derivedSource=z.strictObject({revisionId:z.string().min(1).max(100),sha256:z.string().regex(/^[a-f0-9]{64}$/),url:z.string().min(1).max(200),width:z.number().int().positive(),height:z.number().int().positive()});
/** Saved designs may carry values the application pinned before a request; the model's response schema never offers them. */
const pinnedMethods={sketch:imageMethodSchemas.sketch.extend({sha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}),edit:imageMethodSchemas.edit.extend({source:derivedSource.optional()}),extend:imageMethodSchemas.extend.extend({source:derivedSource.optional(),canvasSha256:z.string().regex(/^[a-f0-9]{64}$/).optional()})};
const staticResourceBase=resourceSchema.extend({kind:z.literal('still'),proxy:z.boolean(),proxyFor:z.enum(['video','3d']).optional(),resolution:z.literal('low')});
export const staticResourceSchema=staticResourceBase.extend({sketch:pinnedMethods.sketch.optional(),edit:pinnedMethods.edit.optional(),extend:pinnedMethods.extend.optional()});
const staticResponseResourceSchema=staticResourceBase.extend({sketch:imageMethodSchemas.sketch.optional(),edit:imageMethodSchemas.edit.optional(),extend:imageMethodSchemas.extend.optional()});
export const staticDesignSchema=designSchema.extend({designDocument:z.string().min(80).max(16000),keyFrames:keyFramesSchema,resources:z.array(staticResourceSchema).max(16),materialObservations:z.array(z.strictObject({source:z.string(),role:z.enum(['reference','product','interface','photo','logo','font','unknown']),description:z.string().max(2000)})).max(24).optional()});
export type Design=Omit<z.infer<typeof designSchema>,'resources'>&{resources:Resource[]}&{keyFrames?:z.infer<typeof keyFramesSchema>;bindings?:{kind:string;id:string;aliases:string[]}[];materialMemory?:MaterialMemory;materialObservations?:z.infer<typeof staticDesignSchema>['materialObservations']};
/** Boundary adapters resolve only issued entities; creative values and facts stay exact. */
export function readDesign(value:unknown,input:DirectionInput):Design{
 const normalized=input.stage==='draft'?normalizeDraftReferences(value,input):value;
 const bindings=input.stage==='draft'?(normalized as {bindings?:Design['bindings']})?.bindings:undefined;if(input.stage==='draft'&&normalized&&typeof normalized==='object')delete (normalized as Record<string,unknown>).bindings;
 const memory=input.materialMemory?structuredClone(input.materialMemory):undefined;
 if(input.stage==='draft'&&memory&&normalized&&typeof normalized==='object'){
  const o=normalized as Record<string,unknown>,raw=o.materialObservations??o.assetObservations??o.observations;
  delete o.materialMemory;
  if(raw!==undefined){const imported=importMaterialObservations(raw,memory);memory.evidence=raw;memory.observations=imported.observations;memory.issues=[...new Set([...memory.issues,...imported.issues])];o.materialObservations=imported.observations.map(p=>({source:p.sourceId,role:p.role,description:p.description}));delete o.assetObservations;delete o.observations;}
 }
 if(input.stage==='draft'&&normalized&&typeof normalized==='object')delete (normalized as Record<string,unknown>).materialMemory;
 const design:Design=(input.stage==='draft'?staticDesignSchema:designSchema).parse(normalized),ids=new Set<string>();if(memory)design.materialMemory=memory;if(bindings)design.bindings=bindings;
 if(input.stage==='draft')for(const r of design.resources){
  // Image methods exist only for blocks started with them; earlier blocks ignore them instead of failing an answer.
  if(input.brief.imageMethodsVersion!==1){delete r.sketch;delete r.edit;delete r.extend;continue;}
  const validBox=(b?:number[])=>!b||b[0]<b[2]&&b[1]<b[3];
  if(r.edit&&r.extend)throw new Error('IMAGE_METHOD_CONFLICT: use either edit or extend for one picture.');
  if((r.edit||r.extend)&&r.sketch)throw new Error('IMAGE_METHOD_CONFLICT: a sketch guides a fresh picture, not an edit or extension.');
  if((r.edit||r.extend)&&r.referenceAssetIds.length)throw new Error('IMAGE_METHOD_REFERENCES: an edit or extension uses only its source picture; list no other references.');
  if(r.sketch&&r.referenceAssetIds.length>2)throw new Error('IMAGE_METHOD_REFERENCES: a sketch leaves room for at most two other references.');
  if(!validBox(r.edit?.region)||r.sketch?.shapes.some(s=>!validBox(s.box)))throw new Error('IMAGE_METHOD_BOX_INVALID: boxes are [x0,y0,x1,y1] fractions with x0<x1 and y0<y1.');
  const from=r.edit?.from??r.extend?.from;if(from&&(from===r.id||!input.resourceIds.includes(from)))throw new Error('IMAGE_METHOD_SOURCE: edit or extend an earlier picture by its issued id into a different issued id.');
 }
 const knownScenes=issuedScenes(input);
 for(const r of design.resources){if(!input.resourceIds.includes(r.id)||ids.has(r.id))throw new Error('UNISSUED_RESOURCE_ID');ids.add(r.id);if(!knownScenes.some(s=>s.id===r.scene))throw new Error('UNISSUED_SCENE_ID');if(r.referenceAssetIds.some(id=>!input.assets.some(a=>a.id===id)))throw new Error('UNISSUED_REFERENCE_ID');}
 if(input.stage==='draft'){const scenes=design.keyFrames!.map(s=>s.sceneId);if(new Set(scenes).size!==scenes.length||input.storyboard.some(s=>!scenes.includes(s.id))||scenes.some(id=>!knownScenes.some(s=>s.id===id)))throw new Error('SCENE_KEY_FRAMES_REQUIRED');for(const s of design.keyFrames!)if(new Set(s.moments.map(m=>m.id)).size!==s.moments.length)throw new Error('DUPLICATE_MOMENT');for(const r of design.resources)if(!!r.proxyFor!==!!r.proxy)throw new Error('PROXY_LABEL_REQUIRED');}
 if(memory?.reconstruction.allowed)for(const source of memory.materials.filter(m=>['product','interface'].includes(m.role)))if(!design.resources.some(r=>r.referenceAssetIds.includes(source.id)))memory.issues.push(`No reconstruction is requested for ${source.name}; keep it a reference, never substitute its screenshot as artwork.`);
 return design;
}
export const designResponseSchema={name:'director_v1',schema:z.toJSONSchema(designSchema) as Record<string,unknown>};

const responseResources=(r:z.ZodType)=>staticDesignSchema.extend({resources:z.array(r).max(16)});
/** Unchanged for earlier blocks. */
export const staticDesignResponseSchema={name:'static_director_v1',schema:z.toJSONSchema(responseResources(staticResourceBase)) as Record<string,unknown>};
const withSketch={name:'static_director_v2',schema:z.toJSONSchema(responseResources(staticResourceBase.extend({sketch:imageMethodSchemas.sketch.optional()}))) as Record<string,unknown>};
const withMethods={name:'static_director_v2r',schema:z.toJSONSchema(responseResources(staticResponseResourceSchema)) as Record<string,unknown>};
/** Blocks started with image methods offer the sketch; edit and extend are offered only when earlier pictures exist. */
export function staticDesignResponseFor(input:Pick<DirectionInput,'brief'>,revision:boolean){return input.brief.imageMethodsVersion!==1?staticDesignResponseSchema:revision?withMethods:withSketch;}
