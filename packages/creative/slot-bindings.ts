import type {CreativeDirection} from '../contracts/frame-program';
/** Logical slots retain their authoring identity even when one render window serves a montage or a screen insert. */
export function renderSlotId(direction:CreativeDirection,beatKey:string,slot:string){
 const beat=direction.skeleton?.beats.find(b=>b.key===beatKey),scene=direction.scenes.beats.find(b=>b.key===beatKey);if(!beat||!scene)return slot;
 const layer=scene.layers.find(l=>l.key===slot);if(layer?.kind==='text')return scene.layers.find(l=>l.kind==='text'&&l.source===layer.source)?.key??slot;
 const visual=beat.visuals.find(v=>v.id===slot);if(visual?.montage)return beat.visuals.find(v=>v.montage)?.id??slot;
 if(visual?.kind==='ui'){const environment=beat.visuals.find(v=>v.kind!=='ui'&&direction.media.elements.some(r=>r.element===v.id&&r.promptPack&&r.ui));if(environment)return environment.id;}
 return slot;
}

/** All montage slots price against their shared planned window, including the later shots hidden by render compaction. */
export function plannedMediaAspect(direction:CreativeDirection,config:import('../engine/types').EngineConfig,referencePlacement:string,element:string){
 const beat=direction.scenes.beats.find(b=>b.layers.some(l=>l.element===element)),layer=beat?.layers.find(l=>l.element===element);if(!beat||!layer)return 1;
 const render=renderSlotId(direction,beat.key,layer.key),box=config.beats.find(b=>b.id===beat.key||b.id.endsWith('.'+beat.key))?.layers.find(l=>l.id===render)?.per[referencePlacement]?.box;
 return box?box.w/box.h:1;
}
