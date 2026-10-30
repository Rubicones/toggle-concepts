import type {DirectionProgram,FrameProgram} from '../contracts/frame-program';
import type {GlyphSnapshot} from '../engine/text-snapshot';
import {unpackGlyphs} from './glyph-pack';
import type {DraftProgram} from '../contracts/drafts';

/** Historical video/export consumers receive a view onto the shared config. Nothing is duplicated in storage. */
export function programViews(program:DirectionProgram):FrameProgram[]{
 return program.variants.map(v=>{
  const fmt=program.config.formats.find(f=>f.id===v.state.fmt)!;
  const colors=program.config.kit.colors;
  const scenes=(program.config.lengths[v.state.len]??[]).map((span,i)=>({schemaVersion:'1.0' as const,sceneId:`${program.directionId}.${span.beat}`,revisionId:`${program.directionId}.${v.variantId}.${span.beat}`,semanticRole:(i===0?'hook':i===(program.config.lengths[v.state.len].length-1)?'cta':'demo') as 'hook'|'cta'|'demo',scriptRevisionId:program.directionId,brandRevisionId:program.directionId,durationFrames:Math.round((program.config.lengths[v.state.len].slice(0,i+1).reduce((n,b)=>n+b.dur,0))*v.fps)-Math.round(program.config.lengths[v.state.len].slice(0,i).reduce((n,b)=>n+b.dur,0)*v.fps),fps:v.fps,seed:0,locale:v.state.lang,placementId:fmt.id,width:fmt.w,height:fmt.h,stage:'draft' as const,mandatoryCopyKeys:[],copy:{},slots:[],layers:[],assets:[],resourceContracts:program.resourceContracts??[],fontAssetRevisionIds:program.resources.filter(r=>r.kind==='font').map(r=>r.revisionId),fallbackPolicy:'review-required-for-visual-change' as const}));
  return {id:`${program.directionId}.${v.variantId}`,directionId:program.directionId,variantId:v.variantId,title:program.title,idea:program.title,recipe:'product',width:fmt.w,height:fmt.h,fps:v.fps,durationFrames:Math.round(v.durationSeconds*v.fps),locale:v.state.lang,placementId:v.state.fmt,colors:{ink:Object.values(colors).find(c=>c.roles.includes('text')||c.roles.includes('ink'))?.hex??'#000000',paper:Object.values(colors).find(c=>c.roles.includes('field'))?.hex??'#ffffff'},scenes,audio:null,engine:{version:'frame@1',config:program.config,variant:v.state,glyphs:program.glyphs,resources:program.resources,issues:program.issues}};
 });
}
export function readPrograms(value:{programs?:DraftProgram[];directionPrograms?:DirectionProgram[];glyphs?:GlyphSnapshot}):FrameProgram[]{
 if(value.directionPrograms)return value.directionPrograms.flatMap(programViews);
 return unpackGlyphs((value.programs??[]).filter((p):p is FrameProgram=>!!p.engine),value.glyphs);
}
export function findProgram(value:{programs?:DraftProgram[];directionPrograms?:DirectionProgram[];glyphs?:GlyphSnapshot},directionId:string,variantId:string):DraftProgram|undefined{
 if(value.directionPrograms)return value.directionPrograms.flatMap(programViews).find(p=>p.directionId===directionId&&p.variantId===variantId);
 const p=value.programs?.find(p=>p.directionId===directionId&&p.variantId===variantId);
 return p?.engine?unpackGlyphs([p as FrameProgram],value.glyphs)[0]:p;
}
