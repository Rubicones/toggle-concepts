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
 const prompt=resourcePrompt(resource)+(reconstruct?'\nCreate a fresh polished still from the attached identity reference, not an enlarged screenshot or a screenshot panel. Preserve the observed product shape, interface content and approved details; do not invent unseen features, copy, claims or people. Omit baked-in video/advertising overlays.':''),key=independentResourceBindings(input)?digest({protocol:'director-image@1',directionId:input.directionId,prompt,aspect,resolution:'draft',references:refs.map(ref=>ref.sha256)}):digest({protocol:'director@1',directionId:input.directionId,resource,refs,...(reconstruct?{reconstructionPrompt:prompt}:{})});
 return {key,prompt,references:resource.referenceAssetIds,purpose:resource.purpose,aspectRatio:aspect,resolution:'draft' as const,maxCostMicroUsd:perStillMicroUsd};
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
