import type {Resource,DirectionInput} from './types';
import {imageAspectRatios} from '../contracts/image-generation';
import {digest} from './money';
import type {CatalogEntry} from './types';
export const resourcePrompt=(resource:Resource)=>`${resource.prompt}${resource.mustNotContain.length?'\nDo not include: '+resource.mustNotContain.join('; ')+'.':''}`;
export const independentResourceBindings=(input:DirectionInput)=>input.stage==='draft'&&input.brief.resourceBindingVersion===1;
export function resourceRequest(resource:Resource,input:DirectionInput,perStillMicroUsd:number){
 if(input.stage==='draft'&&(resource.kind!=='still'||resource.resolution!=='low'||typeof resource.proxy!=='boolean'||!!resource.proxyFor!==resource.proxy))throw new Error('STATIC_STILL_REQUIRED');
 if(/^\s*[\[{]/.test(resource.prompt))throw new Error('PLAIN_LANGUAGE_IMAGE_PROMPT_REQUIRED');
 if(!input.resourceIds.includes(resource.id))throw new Error('UNISSUED_RESOURCE_ID');
 const aspect=imageAspectRatios.find(a=>a===resource.aspect);if(!aspect)throw new Error('IMAGE_ASPECT_UNAVAILABLE');
 const refs=resource.referenceAssetIds.map(id=>{const asset=input.assets.find(a=>a.id===id);if(!asset)throw new Error('UNISSUED_REFERENCE_ID');if(!asset.mime.startsWith('image/'))throw new Error('IMAGE_REFERENCE_REQUIRED');if(asset.width>2048||asset.height>2048||asset.width*asset.height>2073600)throw new Error('IMAGE_REFERENCE_DIMENSIONS_UNAVAILABLE');return {id,sha256:asset.sha256};});
 const reconstruct=input.materialMemory?.reconstruction.allowed&&input.materialMemory.materials.some(m=>resource.referenceAssetIds.includes(m.id)&&['product','interface'].includes(m.role));
 const base=resourcePrompt(resource)+(reconstruct?'\nCreate a fresh polished still from the attached identity reference, not an enlarged screenshot or a screenshot panel. Preserve the observed product shape, interface content and approved details; do not invent unseen features, copy, claims or people. Omit baked-in video/advertising overlays.':'');
 const method=imageMethod(resource,input,base);
 const prompt=method?.prompt??base,key=method?digest({protocol:'director-image-method@1',directionId:input.directionId,prompt,aspect,resolution:'draft',references:refs.map(ref=>ref.sha256),method:method.identity}):independentResourceBindings(input)?digest({protocol:'director-image@1',directionId:input.directionId,prompt,aspect,resolution:'draft',references:refs.map(ref=>ref.sha256)}):digest({protocol:'director@1',directionId:input.directionId,resource,refs,...(reconstruct?{reconstructionPrompt:prompt}:{})});
 return {key,prompt,references:[...(method?.source?[method.source.revisionId]:[]),...resource.referenceAssetIds],derivedPlan:method?.derived??[],purpose:resource.purpose,aspectRatio:aspect,resolution:'draft' as const,maxCostMicroUsd:perStillMicroUsd};
}
/**
 * Image methods (blocks with brief.imageMethodsVersion 1): the prompt wrapper, the source picture and the
 * application-made references the request carries. Hashes are pinned by the worker before any request.
 */
function imageMethod(resource:Resource,input:DirectionInput,base:string){
 if(!resource.sketch&&!resource.edit&&!resource.extend)return undefined;
 if(input.brief.imageMethodsVersion!==1)throw new Error('IMAGE_METHOD_UNAVAILABLE');
 if(resource.edit){const source=resource.edit.source;if(!source)throw new Error('IMAGE_METHOD_SOURCE_REQUIRED');
  return {source,derived:[] as {kind:'sketch'|'canvas';sha256:string}[],identity:{edit:{from:resource.edit.from,instruction:resource.edit.instruction,region:resource.edit.region??null,source:source.sha256}},
   prompt:`Edit image 1, this exact photo. Change ONLY: ${resource.edit.instruction}\nKeep the framing, camera, identity, every other detail, colours and contrast exactly as in image 1. No colour grading. Do not reframe, crop, zoom or straighten.\nThe picture shows: ${base}`};}
 if(resource.extend){const source=resource.extend.source,canvas=resource.extend.canvasSha256;if(!source||!canvas)throw new Error('IMAGE_METHOD_SOURCE_REQUIRED');
  return {source:undefined,derived:[{kind:'canvas' as const,sha256:canvas}],identity:{extend:{from:resource.extend.from,place:resource.extend.place??null,instruction:resource.extend.instruction??null,source:source.sha256,canvas}},
   prompt:`Outpaint image 1: fill ONLY the flat grey areas with a seamless continuation of the same scene, with the same light, colour, perspective and lens. Do not change anything in the photo area; continue objects cut by the old edge completely.${resource.extend.instruction?' '+resource.extend.instruction:''}\nThe scene: ${base}\nNo new people, no text, no logos, no borders, no grey left.`};}
 const sketch=resource.sketch!;if(!sketch.sha256)throw new Error('IMAGE_METHOD_SKETCH_REQUIRED');
 return {source:undefined,derived:[{kind:'sketch' as const,sha256:sketch.sha256}],identity:{sketch:{shapes:sketch.shapes,sha256:sketch.sha256}},
  prompt:`Image 1 is ONLY a blurred blocking sketch for composition, camera angle and light direction; do not copy its flat shapes, colours or textures.${resource.referenceAssetIds.length?' The other images are references as described.':''}\n${base}`};
}
/** The brief's synthesis text is a permission the director must respect; only an explicit refusal (or nothing) requires an AD decision per still. */
export function synthesisPermitted(text:string){const t=text.trim().toLowerCase();return !!t&&!/^(no|none|not allowed|forbidden|never|do not|don't)\b/.test(t)&&!/^(нет|запрещ|не разреш)/.test(t);}

/** A binding is ready only for its requested image; old pixels cannot activate a changed brief. */
export function liveResourceBindings(input:DirectionInput,resources:Resource[],catalog:(CatalogEntry&{requestHash?:string})[]){
 const bindings:NonNullable<import('./live-preview').LivePreview['resources']>=Object.fromEntries(input.resourceIds.map(id=>[id,{id,url:'',ready:false}]));
 for(const resource of resources){
  if(!input.resourceIds.includes(resource.id))throw new Error('UNISSUED_RESOURCE_ID');
  const key=independentResourceBindings(input)?resourceRequest(resource,input,1).key:undefined;
  const ready=catalog.find(c=>c.id===resource.id&&(!key||c.requestHash===key));
  bindings[resource.id]={id:resource.id,sceneId:resource.scene,url:ready?.url??'',proxy:resource.proxy,proxyFor:resource.proxyFor,ready:!!ready,...(ready?{revisionId:ready.revisionId,width:ready.width,height:ready.height,...(ready.image?{image:ready.image}:{})}:{}),...(key?{requestHash:key}:{})};
 }
 return bindings;
}
