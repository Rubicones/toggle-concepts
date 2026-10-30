import {createHash} from 'node:crypto';
import {canonicalJson} from '../contracts/common';
import type {MediaPlan,BrandSystem,CreativeRepair} from '../contracts/creative-drafts';
import type {FrameResource} from '../contracts/frame-program';
import {nearestImageRatio} from './media-rules';
export type StillRequest={key:string;prompt:string;references:string[];purpose:string;aspectRatio:ReturnType<typeof nearestImageRatio>;resolution:'draft';maxCostMicroUsd?:number};
export type StillProducer=(request:StillRequest)=>Promise<FrameResource>;
/** The pack hash includes framing, look, shot identity and reference digests. A durable producer reconciles it before submitting. */
export async function produceMediaPlan(plan:MediaPlan,brand:BrandSystem,resources:FrameResource[],produce:StillProducer,cache:Map<string,FrameResource>=new Map(),options:{aspect?:(element:string)=>number;maxStills?:number;perStillMicroUsd?:number}={}){
 const media=structuredClone(plan),produced:FrameResource[]=[],log:CreativeRepair[]=[];
 const count=media.elements.filter(r=>['generate','proxy'].includes(r.source)).reduce((n,r)=>n+Math.max(1,r.shots?.length??0),0);
 if(options.maxStills!==undefined&&count>options.maxStills)throw new Error('MEDIA_ESTIMATE_EXCEEDED');
 let first:FrameResource|undefined;const identical=new Map<string,FrameResource>();
 for(const row of media.elements){
  if(!['generate','proxy'].includes(row.source))continue;
  if(!row.promptPack)throw new Error('PROMPT_PACK_REQUIRED');
  const shotReferences:string[]=[];
  for(const [shotIndex,shot]of (row.shots?.length?row.shots:[row.promptPack.prompt]).entries()){
   const referenceIds=[...new Set([...(first?[first.revisionId]:[]),...row.promptPack.references])].slice(0,3);
   const references=referenceIds.map(id=>{const resource=[...resources,...produced].find(r=>r.revisionId===id);if(!resource)throw new Error('UNKNOWN_IMAGE_REFERENCE');return {id,sha256:resource.sha256};});
   const aspectRatio=nearestImageRatio(options.aspect?.(row.element)??1);
   if(row.ui){const [x,y]=aspectRatio.split(':').map(Number),ratio=row.ui.aspect/(x/y),area=row.promptPack.protectedArea,maxW=Math.max(.05,Math.min(.7,area.w)),maxH=Math.max(.05,Math.min(.7,area.h)),w=Math.min(maxW,maxH*ratio),h=w/ratio,cx=Math.max(.15+w/2,Math.min(.85-w/2,area.x+area.w/2)),cy=Math.max(.15+h/2,Math.min(.85-h/2,area.y+area.h/2));row.promptPack.protectedArea={x:cx-w/2,y:cy-h/2,w,h};}
   const pack={...row.promptPack,...(row.ui?{screenInsert:'Leave the protectedArea empty, flat and unobstructed. Code composites the supplied live UI into that exact area; never generate product UI.'}:{}),shot,shotIndex,aspectRatio,resolution:'draft' as const,cropMargins:{x:.15,y:.15,w:.7,h:.7},look:{treatment:brand.imagery.treatment,palette:brand.palette.map(c=>c.hex),light:row.promptPack.lighting},prohibitions:[...row.promptPack.prohibitions,...brand.prohibitions,'Never render text, lettering, logos, wordmarks or UI inside generated images.'],productImmutables:brand.product.immutables};
   const key=createHash('sha256').update(canonicalJson({brandRevision:brand.revisionId,pack,references})).digest('hex');
   row.generation={status:'pending',reason:'The priced draft still is pending reconciliation.',packHash:key};
   const contentKey=canonicalJson({pack,references:row.promptPack.references});
   let resource=identical.get(contentKey)??cache.get(key);
   if(!resource){resource=await produce({key,purpose:row.promptPack.purpose,references:referenceIds,prompt:canonicalJson(pack),aspectRatio:pack.aspectRatio,resolution:'draft',maxCostMicroUsd:options.perStillMicroUsd});if(resource.kind!=='image')throw new Error('GENERATED_STILL_REQUIRED');cache.set(key,resource);}
   identical.set(contentKey,resource);
   first??=resource;produced.push(resource);shotReferences.push(resource.revisionId);
   row.generation={status:'ready',reason:'Draft still collected from the saved provider receipt.',packHash:key};
  }
  row.reference=shotReferences[0];row.shotReferences=shotReferences;row.fit='cover';
  if(row.source==='generate')row.source='asset';
  if(row.contract)row.contract.referenceAssetRevisionId=row.reference;
 }
 return {media,produced,log};
}
