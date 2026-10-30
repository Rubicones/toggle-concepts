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
export const staticResourceSchema=resourceSchema.extend({kind:z.literal('still'),proxy:z.boolean(),proxyFor:z.enum(['video','3d']).optional(),resolution:z.literal('low')});
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
 const knownScenes=issuedScenes(input);
 for(const r of design.resources){if(!input.resourceIds.includes(r.id)||ids.has(r.id))throw new Error('UNISSUED_RESOURCE_ID');ids.add(r.id);if(!knownScenes.some(s=>s.id===r.scene))throw new Error('UNISSUED_SCENE_ID');if(r.referenceAssetIds.some(id=>!input.assets.some(a=>a.id===id)))throw new Error('UNISSUED_REFERENCE_ID');}
 if(input.stage==='draft'){const scenes=design.keyFrames!.map(s=>s.sceneId);if(new Set(scenes).size!==scenes.length||input.storyboard.some(s=>!scenes.includes(s.id))||scenes.some(id=>!knownScenes.some(s=>s.id===id)))throw new Error('SCENE_KEY_FRAMES_REQUIRED');for(const s of design.keyFrames!)if(new Set(s.moments.map(m=>m.id)).size!==s.moments.length)throw new Error('DUPLICATE_MOMENT');for(const r of design.resources)if(!!r.proxyFor!==!!r.proxy)throw new Error('PROXY_LABEL_REQUIRED');}
 if(memory?.reconstruction.allowed)for(const source of memory.materials.filter(m=>['product','interface'].includes(m.role)))if(!design.resources.some(r=>r.referenceAssetIds.includes(source.id)))memory.issues.push(`No reconstruction is requested for ${source.name}; keep it a reference, never substitute its screenshot as artwork.`);
 return design;
}
export const designResponseSchema={name:'director_v1',schema:z.toJSONSchema(designSchema) as Record<string,unknown>};

export const staticDesignResponseSchema={name:'static_director_v1',schema:z.toJSONSchema(staticDesignSchema) as Record<string,unknown>};
