import type {DirectorEvent} from './events';
import type {Variant} from './types';
export type SavedPreview={variant:Variant;sceneId:string;moment:string;event:DirectorEvent};
/** A read-only projection of immutable render events. Never schedules a render or model request. */
export function savedPreviews(events:DirectorEvent[],variants:Variant[],iterationId?:string){
 const known=new Map(variants.map(v=>[v.id,v])),latest=new Map<string,SavedPreview>();
 for(const event of events){
  if(event.kind!=='render'||event.status!=='done'||!event.imageUrl||iterationId&&!event.stepId.startsWith(iterationId+':'))continue;
  const detail=event.detail as {variantId?:string;sceneId?:string;moment?:string}|undefined,parts=event.stepId.split(':'),index=parts.findIndex(p=>known.has(p));
  const variant=known.get(detail?.variantId??parts[index]),sceneId=detail?.sceneId??parts[index+1],moment=detail?.moment??parts.slice(index+2).join(':');
  if(!variant||!sceneId||!moment)continue;
  const key=JSON.stringify([variant.id,sceneId,moment]),prior=latest.get(key);
  if(!prior||event.at>=prior.event.at)latest.set(key,{variant,sceneId,moment,event});
 }
 return [...latest.values()];
}
