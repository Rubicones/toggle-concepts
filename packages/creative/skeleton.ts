import {directionSkeletonSchema,type DirectionSkeleton,type BrandSystem,type ScriptSpecV2} from '../contracts/creative-drafts';
import type {CampaignScope} from '../contracts/campaign';
import type {ProtectedCopy} from './validate';
import {visualKinds,montageShots} from './media-rules';
import {storyboardMotion} from './motion-recipes';
import {storyboardCutdowns} from './storyboard-align';
export type LocalizedScene={sceneId:string;locale:string;text:string;hookAxis?:string};
export function buildDirectionSkeleton(scenes:NonNullable<ScriptSpecV2['sourceScenes']>,scope:CampaignScope,direction:number,protectedCopy:ProtectedCopy[]=[],localized:LocalizedScene[]=[],brand?:BrandSystem):DirectionSkeleton{
 if(!scenes.length||scenes.some((s,i)=>s.endTime<=s.startTime||Math.abs(s.startTime-(i?scenes[i-1].endTime:0))>1e-6)||new Set(scenes.map(s=>s.sceneId)).size!==scenes.length)throw new Error('SOURCE_STORYBOARD_INVALID');
 const beats=scenes.map((scene,index)=>{
  const key=`b${index}`,last=index===scenes.length-1,role=index===0?'hook' as const:last?'cta' as const:/proof|testimonial|stat/i.test(scene.visualNotes)?'proof' as const:'demo' as const;
  let kinds=visualKinds(scene.visualNotes);if(kinds.includes('people'))kinds=kinds.filter(k=>k!=='place'&&k!=='footage');
  if((index===0||last)&&brand?.logos.length&&!kinds.includes('logo'))kinds.push('logo');if(!kinds.length)kinds=['graphic'];
  const visuals=kinds.flatMap(kind=>(kind==='people'||kind==='footage'?montageShots(scene.visualNotes):[scene.visualNotes]).map(description=>({kind,description,montage:/montage/i.test(scene.visualNotes)&&['people','footage'].includes(kind)}))).map((v,i)=>({...v,id:`${key}.visual.${i}`,label:`${key} visual ${i+1}: ${v.kind}`}));
  const copy:DirectionSkeleton['beats'][number]['copy']=scope.locales.flatMap(locale=>{
   const translated=locale===scope.referenceLocale?undefined:localized.find(s=>s.sceneId===scene.sceneId&&s.locale===locale&&!s.hookAxis)?.text;
   if(locale!==scope.referenceLocale&&!translated)throw new Error(`STORYBOARD_LOCALIZATION_REQUIRED:${scene.sceneId}/${locale}`);
   const text=translated??scene.onScreenCopy;
   const rows:DirectionSkeleton['beats'][number]['copy']=text.trim()?[{id:`${key}.copy.0`,label:`${key} approved ${locale}`,locale,slot:role==='hook'?'hook':'body',text,locked:true}]:[];
   if(last)for(const item of protectedCopy.filter(p=>p.locale===locale))if(!rows.some(c=>c.text===item.text))rows.push({id:`${key}.copy.${rows.length}`,label:`${key} ${item.slot} ${locale}`,locale,slot:item.slot==='offer'?'body':item.slot,text:item.text,locked:true});
   if(index===0)for(const [i,hook]of scope.hooks.entries())if(i&&text.trim())rows.push({id:`${key}.hook.${i}`,label:`${key} hook ${hook} ${locale}`,locale,slot:'hook',text:localized.find(s=>s.sceneId===scene.sceneId&&s.locale===locale&&s.hookAxis===hook)?.text??text,locked:true,hookAxis:hook});
   return rows;
  });
  const motion=storyboardMotion(scene.visualNotes),transitionOut=storyboardMotion(scenes[index+1]?.visualNotes??'').transitionIn;
  // The fresh skeleton is hashed before JSON storage; omit unlocked fields rather than emitting undefined.
  return {key,label:`Scene ${index+1}: ${scene.sceneId}`,sourceSceneIds:[scene.sceneId],start:scene.startTime,end:scene.endTime,role,visualNotes:scene.visualNotes,motionNotes:scene.visualNotes,...(motion.recipe?{recipe:motion.recipe}:{}),...(motion.camera?{camera:motion.camera}:{}),...(transitionOut?{transitionOut}:{}),visuals,copy};
 });
 return directionSkeletonSchema.parse({version:'DirectionSkeleton@1',direction,beats,hooks:scope.hooks.map((id,i)=>({id,label:`Hook ${id}`,slotId:`b0.angle.${i}`})),cutdowns:storyboardCutdowns(scenes,scope.durationsSeconds),slotIds:[...scope.hooks.map((_,i)=>`b0.angle.${i}`),...Array.from({length:8},(_,i)=>`d${i}`),...beats.flatMap(b=>[...b.visuals.map(v=>v.id),...new Set(b.copy.map(c=>c.id)),`${b.key}.motion`,`${b.key}.cut`])]});
}

/** Localization rows are admitted planning evidence; only scene-labelled on-screen rows can replace a locale's primary. */
export function localizedSkeletonCopy(output:string|null|undefined,variants:{id:string;locale:string;hook:string;conceptSlot:number}[],direction:number):LocalizedScene[]{
 if(!output)return [];let parsed;try{parsed=JSON.parse(output);}catch{return [];}
 const rows=parsed?.deliverable?.localizedCopy;if(!Array.isArray(rows))return [];
 return rows.flatMap((row:Record<string,unknown>)=>{
  if(typeof row.text!=='string'||typeof row.locale!=='string'||typeof row.copySlot!=='string')return [];
  const ids=Array.isArray(row.variantIds)?row.variantIds:typeof row.variantId==='string'?[row.variantId]:[],matches=variants.filter(v=>ids.includes(v.id));if(!matches.length)return [];
  const owner=String(row.conceptId??row.directionId??row.copySlot).match(/(?:concept|direction|territory)[-_. ]?([1-3])/i),selected=typeof row.direction==='number'?row.direction:owner?Number(owner[1])-1:0;if(selected!==direction)return [];
  const match=row.copySlot.match(/(?:scene[-_. ]?)(\d+)/i);if(!match||/narration|voice|audio/i.test(row.copySlot))return [];
  return [{sceneId:`scene-${Number(match[1])}`,locale:row.locale,text:row.text,...(matches[0].hook!=='primary'?{hookAxis:matches[0].hook}:{})}];
 });
}
