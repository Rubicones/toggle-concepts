import {validateDirectionValues} from './value-validation';
import type {CreativeInputs} from './protocol';
import type {CreativeDirection,FrameProgram} from '../contracts/frame-program';
import type {BrandSystem,CopyBudget,CreativeIssue} from '../contracts/creative-drafts';
import type {CampaignScope,VariantEntry} from '../contracts/campaign';
import {validateScript,validateScenes,validateTreatment,validateMedia,type ProtectedCopy} from './validate';

export function validateRenderedCopy(direction:CreativeDirection,program:FrameProgram,protectedCopy:ProtectedCopy[]=[]):CreativeIssue[]{
 const timeline=program.engine.config.lengths[program.engine.variant.len]??[],selected=new Set(timeline.map(b=>b.beat.replace(/^edit\d+\./,''))),visible=new Set(program.engine.config.beats.filter(b=>timeline.some(t=>t.beat===b.id)).flatMap(b=>b.layers.filter(l=>l.kind==='text').map(l=>l.slot.replace(/^edit\d+\./,''))));
 return direction.script.copy.flatMap(copy=>{
  const pinned=protectedCopy.some(p=>p.locale===copy.locale&&p.text===copy.text),required=pinned||selected.has(copy.beat)&&['legal','cta'].includes(copy.slot);
  if(copy.locale!==program.locale||!required||visible.has(copy.key))return [];
  return [{code:'PROTECTED_COPY_NOT_RENDERED',severity:'block' as const,owner:selected.has(copy.beat)?'compositor' as const:'script' as const,path:selected.has(copy.beat)?`scenes.beats.${copy.beat}.layers`:'script.bindings',message:`Required copy is absent from the rendered ${program.placementId} edit: ${copy.text}`,fix:'Bind this exact copy key to a visible text layer in every ordered edit. Do not remove or paraphrase it.'}];
 });
}

/** Re-check saved builds too: a historic succeeded job is not proof of current build integrity. */
export function validateBuildIntegrity(direction:CreativeDirection,input:{brand:BrandSystem;budget:CopyBudget;scope:CampaignScope;variants:VariantEntry[];protectedCopy:ProtectedCopy[];assetAliases:{key:string;revisionId:string}[]},programs:FrameProgram[]=[]):CreativeIssue[]{
 const prefix=(root:string,issues:CreativeIssue[])=>issues.map(i=>({...i,path:`${root}.${i.path}`}));
 const issues=direction.skeleton?validateDirectionValues(direction,{...input,skeleton:direction.skeleton} as CreativeInputs):[...prefix('script',validateScript(direction.script,input.brand,input.budget,input.scope,input.protectedCopy,input.variants)),...prefix('treatment',validateTreatment(direction.treatment,direction.script,input.brand)),...prefix('scenes',validateScenes(direction.scenes,direction.script,input.brand)),...prefix('media',validateMedia(direction.media,direction.script,input.brand,input.assetAliases.flatMap(a=>[a.key,a.revisionId])))];
 for(const program of programs)issues.push(...validateRenderedCopy(direction,program,input.protectedCopy));
 return [...new Map(issues.map(i=>[`${i.code}:${i.path}:${i.message}`,i])).values()];
}
