import type {DraftEdits} from '../contracts/draft-edits';
import type {BrandSystem,SceneSpecV2} from '../contracts/creative-drafts';
import type {CreativeDirection} from '../contracts/frame-program';
import type {EngineConfig,Cue,Beat,Box} from '../engine/types';
export const recipeNames=['hook-punch','product-reveal','ui-walkthrough','stat-count','testimonial','endcard-cta','montage-on-beat'] as const;
export const cameraNames=['none','push-in','pull-out','pan-left','pan-right','pan-up','pan-down','tilt','drift','parallax'] as const;
export const transitionNames=['cut','crossfade','push-left','push-right','push-up','push-down','slide-left','slide-right','slide-up','slide-down','zoom-through','wipe','match'] as const;
export type RecipeName=typeof recipeNames[number];export type CameraName=typeof cameraNames[number];export type TransitionName=typeof transitionNames[number];
export function motionEnum<T extends string>(value:unknown,choices:readonly T[]):T|undefined{
 if(typeof value!=='string')return undefined;let key=value.toLowerCase().trim().replace(/[\s_]+/g,'-');
 key=({'zoom':'push-in','zoom-in':'push-in','zoom-out':'pull-out','pan':'pan-right','track':'pan-right','dissolve':'crossfade','smooth':'crossfade','seamless':'match','ken-burns':'drift','hook':'hook-punch','cta':'endcard-cta','montage':'montage-on-beat','wipe-left':'wipe','zoom-through':'zoom-through'} as Record<string,string>)[key]??key;
 return choices.find(c=>c===key);
}
/**
 * Storyboard motion words. Camera words describe this scene's own picture; recipe words its own pacing.
 * Transition words ("cut back to…", "seamless transition to…") describe how this scene is ENTERED,
 * so the caller applies them to the previous beat's exit.
 */
export function storyboardMotion(note:string){const motion={
 camera:/zoom(?:\s+out)|pull\s*out/i.test(note)?'pull-out' as const:/zoom|push\s*in/i.test(note)?'push-in' as const:/\bpan|track/i.test(note)?(/left/i.test(note)?'pan-left' as const:'pan-right' as const):/tilt/i.test(note)?'tilt' as const:undefined,
 transitionIn:/match(?:\s|-)?cut/i.test(note)?'match' as const:/\b(?:fast|quick|hard|jump)?\s*cuts?\s+(?:back\s+)?(?:to|into|on)\b/i.test(note)?'cut' as const:/(?:seamless|smooth)\s+(?:transition|blend|move)|dissolve|fade\s+(?:to|into)/i.test(note)?'crossfade' as const:/\bwipe/i.test(note)?'wipe' as const:undefined,
 recipe:/montage|quick cuts/i.test(note)?'montage-on-beat' as const:undefined,
};
 // `transition` is kept for older callers; it is the same entry transition, not this scene's exit.
 return {...motion,transition:motion.transitionIn};}

type RecipeSpec={kinetic:'word'|'line'|'mask';entrance:'pop'|'rise'|'scale'|'fade';camera:CameraName;transition:TransitionName;cursor:boolean;life:boolean};
/** Each recipe is a different choreography, not a label: entrance, type, camera, exit and UI behaviour all change. */
export const recipeSpecs:Record<RecipeName,RecipeSpec>={
 'hook-punch':{kinetic:'word',entrance:'pop',camera:'push-in',transition:'push-left',cursor:false,life:false},
 'product-reveal':{kinetic:'line',entrance:'rise',camera:'push-in',transition:'zoom-through',cursor:false,life:true},
 'ui-walkthrough':{kinetic:'line',entrance:'rise',camera:'none',transition:'slide-left',cursor:true,life:false},
 'stat-count':{kinetic:'mask',entrance:'scale',camera:'drift',transition:'crossfade',cursor:false,life:false},
 'testimonial':{kinetic:'mask',entrance:'fade',camera:'drift',transition:'crossfade',cursor:false,life:true},
 'endcard-cta':{kinetic:'line',entrance:'rise',camera:'pull-out',transition:'crossfade',cursor:false,life:true},
 'montage-on-beat':{kinetic:'line',entrance:'fade',camera:'push-in',transition:'cut',cursor:false,life:false},
};
/** All timing belongs here. Choice order: editor overlay → storyboard words → the scenes agent → the recipe default. */
export function applyMotionRecipes(config:EngineConfig,direction:CreativeDirection,brand:BrandSystem,forceDefaults=false,overlay?:DraftEdits){
 const allowed=(type:string)=>brand.motion.allowedCues.includes(type as never),add=(beat:Beat,cue:Cue)=>{const target='target' in cue?cue.target:'region' in cue?cue.region:'',spatial=['rise','drop','move','pop','scale','float','rock','edge'].includes(cue.type);if(allowed(cue.type)&&(!spatial||!beat.never?.includes(target)))beat.cues.push(cue);};
 const sceneNotes=(key:string|undefined)=>{const script=direction.script.beats.find(b=>b.key===key);return (direction.script.sourceScenes??[]).filter(s=>script?.sourceSceneIds?.includes(s.sceneId)).map(s=>s.visualNotes).join(' ');};
 // A transition must be drawable with the brand's allowed motion; otherwise it softens to a crossfade (or a cut when fades are not allowed).
 const drawable=(t:TransitionName):TransitionName=>/^(push|slide)/.test(t)&&!allowed('move')||t==='zoom-through'&&!allowed('scale')?(allowed('fade')?'crossfade':'cut'):t==='crossfade'&&!allowed('fade')?'cut':t;
 for(const beat of config.beats){
  const key=beat.id.replace(/^edit\d+\./,''),saved=direction.scenes.beats.find(b=>b.key===key),script=direction.script.beats.find(b=>b.key===key);if(!saved||!script)continue;
  const index=direction.script.beats.indexOf(script),words=storyboardMotion(sceneNotes(key)),entering=storyboardMotion(sceneNotes(direction.script.beats[index+1]?.key)).transitionIn;
  const seconds=Math.min(...Object.values(config.lengths).flatMap(spans=>spans.filter(s=>s.beat===beat.id).map(s=>s.dur))),fast=Math.min(brand.motion.durations.fast,seconds*.15),entrance=Math.min(brand.motion.durations.medium,seconds*.3);
  const recipe:RecipeName=(!forceDefaults?overlay?.motion.find(m=>m.beat===key)?.recipe:undefined)??words.recipe??(!forceDefaults?saved.recipe:undefined)??(script.role==='hook'?'hook-punch':script.role==='cta'?'endcard-cta':beat.layers.some(l=>l.kind==='ui')?'ui-walkthrough':script.elements.some(e=>/counter|chart|stat/i.test(e.what))?'stat-count':'product-reveal');
  const spec=recipeSpecs[recipe];
  beat.recipe=recipe;
  beat.transition_out={type:drawable((!forceDefaults?overlay?.motion.find(m=>m.beat===key)?.transitionOut:undefined)??entering??(!forceDefaults?saved.transitionOut:undefined)??spec.transition),duration:Math.min(brand.motion.durations.fast,seconds*.2)};
  // Keep authored semantic UI cues; replace primitive timings with the recipe's deterministic choreography.
  beat.cues=beat.cues.filter(q=>q.type==='ui'||q.type==='edge'||q.type==='clip');
  let stagger=0;
  for(const layer of beat.layers){
   const authored=saved.layers.find(l=>l.key===layer.id),protectedAtZero=script.role==='hook'&&(layer.kind==='logo'||layer.kind==='text'&&config.slot_axis[layer.slot]==='hook'),persistent=layer.kind==='logo';
   if(persistent){layer.persistent=`logo:${layer.logo}`;beat.cues=beat.cues.filter(q=>!('target' in q)||q.target!==layer.id);}
   const start=Math.min(stagger++*fast*.35,Math.max(0,seconds*.3-entrance));
   if(!persistent&&!protectedAtZero){
    add(beat,{type:'fade',target:layer.id,t:start,dur:entrance,curve:'out3'});
    // Pictures, screens and graphics enter with the recipe's own gesture; text enters through its kinetic type.
    // Screens and pictures fade in place: their life comes from the camera and the UI choreography. Resizing them per
    // frame would re-rasterise the screen at every size and could sweep them over copy.
    if(layer.kind!=='text'&&layer.kind!=='media'&&layer.kind!=='ui'){
     if(spec.entrance==='pop')add(beat,{type:'pop',target:layer.id,t:start,dur:entrance,from:.86,curve:'out3'});
     else if(spec.entrance==='rise')add(beat,{type:'rise',target:layer.id,t:start,dur:entrance,from_u:2,curve:'out3'});
     else if(spec.entrance==='scale')add(beat,{type:'scale',target:layer.id,t:start,dur:entrance,from:.92,to:1,curve:'out3'});
    }
   }
   if(layer.kind==='text'){
    // The end card holds its copy to the last frame; other beats hand their copy to the transition.
    if(beat.transition_out.type!=='cut'&&recipe!=='endcard-cta'&&config.slot_axis[layer.slot]!=='cta'&&layer.style!=='legal')add(beat,{type:'fade',target:layer.id,t:`end-${beat.transition_out.duration}`,dur:beat.transition_out.duration*.3,out:true,curve:'out3'});
    // Reading remains at rest; masks and stagger finish in the first 30%.
    if(!protectedAtZero&&!persistent&&(allowed('fade')||allowed('draw')))layer.kinetic={mode:!allowed('fade')||spec.kinetic==='mask'&&allowed('draw')?'mask':spec.kinetic==='word'?'word':'line',start,duration:entrance};
    if(allowed('draw'))layer.emphasis={start:protectedAtZero?0:start+entrance,duration:fast};
    if(allowed('scale')&&recipe==='endcard-cta'&&/cta|button/.test(layer.treatment??config.kit.styles[layer.style]?.treatment??''))layer.press={start:seconds*.55,duration:Math.min(brand.motion.durations.medium,seconds*.25)};
   }
   if(layer.kind==='media'){
    layer.camera={type:(!forceDefaults?overlay?.layers.find(l=>l.beat===key&&l.layer===layer.id)?.camera:undefined)??words.camera??(!forceDefaults?authored?.camera:undefined)??spec.camera,amount:.12};
    if(layer.camera.type!=='none'&&(beat.never?.includes(layer.id)||!allowed(/pan|tilt/.test(layer.camera.type)?'move':'scale')))layer.camera.type=allowed('scale')&&!beat.never?.includes(layer.id)?'drift':'none';
    if(forceDefaults&&config.parts[layer.part]?.frame_cameras)config.parts[layer.part].frame_cameras=config.parts[layer.part].frame_cameras!.map(()=>layer.camera!.type);
    const count=config.parts[layer.part]?.files?.length??0;if(count>1&&allowed('items')){config.kit.motion.allowed=[...new Set([...config.kit.motion.allowed,'sequence'])];beat.cues.push({type:'sequence',target:layer.id,fps:count/seconds,loop:false});}
   }
   // Gentle life on graphics during the hold, when the brand allows it.
   if(spec.life&&(layer.kind==='graphic'||layer.kind==='mark')&&!persistent)add(beat,{type:'float',target:layer.id,amp_u:.6,period:Math.max(2,seconds),t:start+entrance});
   const uiId=layer.kind==='ui'?layer.ui:layer.kind==='media'?layer.screen_insert?.ui:undefined;
   if(uiId){
    const spec2=config.ui[uiId];if(!spec2)continue;
    for(const [i,component]of spec2.screens[0].components.entries())add(beat,{type:'ui',target:layer.id,part:component.id,fade:[Math.min(entrance*.5,i*fast*.12),fast],...(component.type==='number'?{count:[0,Math.min(seconds*.65,brand.motion.durations.slow)] as [number,number]}:{}),...(component.type==='button'?{press:[seconds*.55,fast] as [number,number]}:{})});
    // Only a walkthrough drives the screen: cursor between key parts and a scroll. Elsewhere the screen enters and holds.
    if(spec.cursor){const keys=spec2.screens[0].components.filter(c=>c.key).slice(0,4);add(beat,{type:'ui',target:layer.id,part:'*',scroll:[entrance*.5,seconds-entrance*.5,0,Math.min(60,spec2.screen_h*.03)],...(keys.length>1?{cursor:{points:keys.map(c=>[c.x+c.w*.5,c.y+c.h*.5] as [number,number]),t:entrance*.5,dur:seconds-entrance*.5}}:{})});}
   }
  }
  for(const region of beat.regions)if(region.area.kind==='edge'){region.persistent=`band:${region.id}`;add(beat,{type:'edge',region:region.id,from:.94,to:1,t:0,dur:seconds,curve:'linear'});}
 }
}
export function cameraBox(box:Box,type:CameraName,progress:number,amount=.12):Box{
 const p=Math.max(0,Math.min(1,progress)),overscan=1+amount*2;
 let scale=overscan,dx=0,dy=0;
 if(type==='none')return box;
 if(type==='push-in')scale=1+amount*p;
 else if(type==='pull-out')scale=1+amount*(1-p);
 else if(type==='pan-left'||type==='pan-right')dx=(type==='pan-left'?-1:1)*(p-.5)*box.w*amount;
 else if(type==='pan-up'||type==='pan-down'||type==='tilt')dy=(type==='pan-up'?-1:1)*(p-.5)*box.h*amount;
 else {scale=1+amount*(.5+p*.5);dx=(p-.5)*box.w*amount*.35;dy=(p-.5)*box.h*amount*.2;}
 return {x:box.x+(box.w-box.w*scale)/2+dx,y:box.y+(box.h-box.h*scale)/2+dy,w:box.w*scale,h:box.h*scale};
}
export function normalizeMotionChoices(beat:Record<string,unknown>){
 const recipe=motionEnum(beat.recipe,recipeNames),transitionOut=motionEnum(beat.transitionOut,transitionNames);return {...(recipe?{recipe}:{}),...(transitionOut?{transitionOut}:{})};
}
export type SceneMotion=Pick<SceneSpecV2['beats'][number],'recipe'|'transitionOut'>;
