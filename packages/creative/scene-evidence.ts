import type {CreativeDirection,DirectionProgram} from '../contracts/frame-program';
import {timeline} from '../engine/engine/frame';
/** One strip per approved scene, with its exact wording and a path that resolves in this saved direction. */
export function sceneEvidencePlan(direction:CreativeDirection,program:DirectionProgram,state=program.variants[0].state){
 const spans=timeline(program.config,state.len);
 return (direction.script.sourceScenes??[]).map(scene=>{
  const beat=direction.script.beats.find(b=>b.sourceSceneIds?.includes(scene.sceneId)),span=spans.find(s=>s.beat.replace(/^edit\d+\./,'')===beat?.key);
  if(!beat||!span)throw new Error(`SCENE_EVIDENCE_MISSING:${scene.sceneId}`);
  const times=[span.start+Math.min(.08,span.dur*.1),span.start+span.dur*.5,span.end-Math.min(1/program.config.render.fps,span.dur*.05)] as [number,number,number];
  return {...(direction.skeleton?{slots:direction.skeleton.slotIds.filter(id=>id.startsWith(beat.key+'.'))}:{}),sceneId:scene.sceneId,beat:beat.key,path:`scenes.beats.${beat.key}`,visualNotes:scene.visualNotes,motionNotes:motionNotes(program,span.beat,scene.visualNotes),onScreenCopy:scene.onScreenCopy,times,frames:times.map(t=>Math.round(t*program.config.render.fps)) as [number,number,number]};
 });
}
export type SceneStrip=ReturnType<typeof sceneEvidencePlan>[number]&{sha256:string;objectKey:string};
/** The storyboard has no separate motion field: give the critic the motion words of the scene and the motion actually planned. */
function motionNotes(program:DirectionProgram,beatId:string,notes:string){
 const beat=program.config.beats.find(b=>b.id===beatId),cameras=[...new Set((beat?.layers??[]).flatMap(l=>l.kind==='media'&&l.camera&&l.camera.type!=='none'?[l.camera.type]:[]))];
 const words=notes.match(/[^.,;]*\b(?:cut|cuts|zoom|pan|track|tilt|transition|montage|dissolve|fade|wipe|moving|motion|nodding|dynamic)\b[^.,;]*/gi)?.map(s=>s.trim()).filter(Boolean)??[];
 return [`Storyboard motion: ${words.length?words.join('; '):'none stated'}.`,`Planned: recipe ${beat?.recipe??'default'}${cameras.length?`, camera ${cameras.join('/')}`:''}, exit ${beat?.transition_out?.type??'cut'}.`].join(' ');
}
