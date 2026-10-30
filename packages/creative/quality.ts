import type {CreativeDirection,DirectionProgram} from '../contracts/frame-program';
import type {CreativeIssue} from '../contracts/creative-drafts';
import {timeline,buildFrame,copyLines} from '../engine/engine/frame';
import type {GlyphEngine} from '../engine/text-snapshot';
import {storyboardMotion} from './motion-recipes';
export type SlideshowScore={beat:string;changedSteps:number;eligibleSteps:number;exemptSteps:number;score:number;passed:boolean;
 /** Share of steps that still change with every camera move switched off: entrances, type, UI, graphics and transitions. */
 choreography?:number};
/** A beat moves on ≥90% of its 0.2 s steps, and at least this share of them comes from something other than a camera move on a still. */
export const MIN_CHOREOGRAPHY=.2;
export type QualityReport={version:'creative-quality@1';slideshow:SlideshowScore[];fidelity:CreativeIssue[];issues:CreativeIssue[];defaultRecipeRepair:boolean;passed:boolean};
export const plainCopy=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/\*/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** Pixel buffers are at 10fps. Compare 0.2s steps; never infer visible change from cue names or timestamps. */
export async function slideshowScores(program:DirectionProgram,state:DirectionProgram['variants'][number]['state'],pixels:(time:number)=>Promise<Uint8Array>|Uint8Array):Promise<SlideshowScore[]>{
 const scores:SlideshowScore[]=[];
 for(const span of timeline(program.config,state.len)){
  const beat=program.config.beats.find(b=>b.id===span.beat)!;let changedSteps=0,eligibleSteps=0,exemptSteps=0;
  const samples=new Map<number,Uint8Array>();
  for(let i=0;i<=Math.ceil(span.dur*10);i++){const t=Math.min(span.end-1e-5,span.start+i/10);samples.set(i,await pixels(t));}
  for(let i=2;i<=Math.floor(span.dur*10+1e-6);i+=2){
   const from=(i-2)/10,to=i/10,exempt=beat.holds?.some(h=>h.intentional&&h.duration>0&&h.duration<=.6&&from>=h.start-1e-6&&to<=h.start+h.duration+1e-6);
   if(exempt){exemptSteps++;continue;}
   eligibleSteps++;const a=samples.get(i-2)!,b=samples.get(i)!;
   if(a.length!==b.length||a.length===0)throw new Error('SLIDESHOW_PIXELS_INVALID');
   let visible=0,total=0;for(let k=0;k<a.length;k+=4){const d=Math.abs(a[k]-b[k])+Math.abs(a[k+1]-b[k+1])+Math.abs(a[k+2]-b[k+2]);if(d>=18)visible++;total+=d;}
   const pixelsCount=a.length/4;// A visible change is a small but real area (≥0.2% of the frame), not compression-level noise.
   if(visible/pixelsCount>=.002&&total/pixelsCount>=.15)changedSteps++;
  }
  const score=eligibleSteps?changedSteps/eligibleSteps:1;
  scores.push({beat:span.beat,changedSteps,eligibleSteps,exemptSteps,score,passed:score>=.9});
 }
 return scores;
}
/** Test every ordered variant against its own selected scenes and copy. Historical batches are never rewritten. */
export function fidelityIssues(direction:CreativeDirection,program:DirectionProgram,engine:GlyphEngine):CreativeIssue[]{
 const issues:CreativeIssue[]=[];
 const add=(code:string,path:string,message:string)=>issues.push({code,path,message,severity:'block',owner:code==='STORYBOARD_COPY_MISSING'?'script':'ad',fix:'Restore this approved storyboard content and rebuild. A labelled stand-in cannot be delivered.'});
 for(const variant of program.variants){const spans=timeline(program.config,variant.state.len),selected=new Set(spans.map(s=>s.beat.replace(/^edit\d+\./,'')));
  for(const source of direction.script.sourceScenes??[]){
   const keys=direction.script.beats.filter(b=>selected.has(b.key)&&b.sourceSceneIds?.includes(source.sceneId)).map(b=>b.key);
   if(!keys.length){add('STORYBOARD_SCENE_MISSING','script.beats',`${source.sceneId} is missing from ${variant.state.fmt}/${variant.state.lang}/${variant.state.len}.`);continue;}
   if(variant.state.lang!==direction.script.copy.find(c=>keys.includes(c.beat))?.locale)continue;
   const shown=spans.filter(s=>keys.includes(s.beat.replace(/^edit\d+\./,''))).flatMap(s=>program.config.beats.find(b=>b.id===s.beat)!.layers.flatMap(l=>l.kind==='text'?copyLines(program.config,l.slot,variant.state):[]));
   if(source.onScreenCopy.trim()&&!source.onScreenCopy.split(/[.!?\n]+/).map(plainCopy).filter(Boolean).every(sentence=>plainCopy(shown.join(' ')).includes(sentence)))add('STORYBOARD_COPY_MISSING','script.copy',`${source.sceneId} is missing its approved copy in ${variant.state.fmt}/${variant.state.lang}/${variant.state.len}: ${source.onScreenCopy}`);
  }
  for(const span of spans){const frame=buildFrame({cfg:program.config,engine},variant.state,span.start+span.dur*.5);
   for(const element of frame.els){const path=program.pathMap[`${element.beat}.${element.id}`]??'scenes.beats';
    if(element.standin||element.media?.standin)add('STANDIN_REMAINS',path,`${element.beat}.${element.id} is still pending or failed in ${variant.state.fmt}/${variant.state.lang}/${variant.state.len}.`);
    if(element.media&&!element.media.cutout){const {dest,visible}=element.media;if(dest.w+1<visible.w||dest.h+1<visible.h)add('MEDIA_LETTERBOX',path,`${element.beat}.${element.id} has unused space inside its media window in ${variant.state.fmt}/${variant.state.lang}/${variant.state.len}.`);}
   }
  }
 }
 for(const length of Object.keys(program.config.lengths)){const spans=timeline(program.config,length);for(const [i,span]of spans.entries())if(i<spans.length-1){const beat=program.config.beats.find(b=>b.id===span.beat)!,key=span.beat.replace(/^edit\d+\./,''),script=direction.script.beats.find(b=>b.key===key),notes=(direction.script.sourceScenes??[]).filter(s=>script?.sourceSceneIds?.includes(s.sceneId)).map(s=>s.visualNotes).join(' ');
  // A cut is right when the storyboard enters the next scene with one ("fast cut back to…") or this scene is cut on the beat.
  const nextKey=spans[i+1].beat.replace(/^edit\d+\./,''),nextScript=direction.script.beats.find(b=>b.key===nextKey),nextNotes=(direction.script.sourceScenes??[]).filter(s=>nextScript?.sourceSceneIds?.includes(s.sceneId)).map(s=>s.visualNotes).join(' ');
  if((!beat.transition_out||beat.transition_out.type==='cut')&&storyboardMotion(nextNotes).transitionIn!=='cut'&&!/\b(?:quick|fast|hard)\s+cuts\b|montage/i.test(notes))add('TRANSITION_REQUIRED',`scenes.beats.${key}`,`The cut after ${key} has no transition and the storyboard does not call for a cut.`);
 }}
 return [...new Map(issues.map(i=>[`${i.code}:${i.path}:${i.message}`,i])).values()];
}
