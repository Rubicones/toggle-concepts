import type {CreativeDirection} from '../contracts/frame-program';
import type {CreativeIssue,ScriptSpecV2,CreativeTreatment,SceneSpecV2,MediaPlan} from '../contracts/creative-drafts';
import type {CreativeInputs} from './protocol';
import {budgetFor} from './copy-budget';
import {brandPaints,brandTreatments} from './normalize';
import {mediaRuleIssues} from './media-rules';
import type {CreativeStage} from '../agents/prompts/creative-v1';
const structuralPattern=/^(?:UNKNOWN_KEY|ELEMENT_BINDING|COPY_BINDING|BEAT_BINDING|SCENARIO_.*|STORYBOARD_ALIGNED|VARIANT_BINDING(?:_.*)?|CUTDOWN_.*|DUPLICATE_KEY|UNKNOWN_ELEMENT|MEDIA_BINDING|CRITIC_PATH)$/;
export const structuralCode=(code:string)=>structuralPattern.test(code)||structuralPattern.test(code.replace(/^CRITIC_/,''));
/** New blocks never run the legacy identity normalizers/validators. These are checks on creative values. */
export function validateFillValues(stage:Exclude<CreativeStage,'compile'>,value:unknown,input:CreativeInputs,prior:Partial<CreativeDirection>={}):CreativeIssue[]{
 const out:CreativeIssue[]=[],brand=input.brand,skeleton=input.skeleton!;
 const add=(code:string,path:string,owner:CreativeIssue['owner'],message:string,fix='Refill this value in its app-issued slot, preserving approved copy and the storyboard.')=>out.push({code,path,owner,message,fix,severity:'block'});
 if(stage==='script'){
  const script=value as ScriptSpecV2;
  for(const beat of skeleton.beats)for(const expected of beat.copy){const copy=script.copy.find(c=>c.key===expected.id&&c.locale===expected.locale);if(!copy||copy.text!==expected.text)add('APPROVED_COPY_CHANGED',expected.id,'script','The immutable approved wording changed. Restore it from the skeleton.');}
  for(const c of script.copy){const beat=skeleton.beats.find(b=>b.key===c.beat)!,limits=skeleton.cutdowns.map(cut=>budgetFor(input.budget,beat.role,c.locale,cut.durationSeconds)?.maxChars??Infinity),limit=Math.min(...limits);
   for(const alternative of c.short)if([...alternative.replace(/\*/g,'')].length>limit)add('COPY_BUDGET',c.key,'script',`An optional alternative exceeds the ${limit}-character copy budget.`);
  }
  for(const protectedCopy of input.protectedCopy)if(!script.copy.some(c=>c.locale===protectedCopy.locale&&c.text===protectedCopy.text))add('PROTECTED_CONTENT','copy','script','The approved protected copy must remain verbatim.');
 }else if(stage==='treatment'){
  const t=value as CreativeTreatment;for(const [i,id]of t.compositionsByBeat.entries())if(!brand.compositions.some(c=>c.id===id))add('COMPOSITION_VALUE',skeleton.beats[i].key,'visual','Select a composition from the approved brand.');
  for(const [role,id]of Object.entries(t.palette))if(!brand.palette.some(c=>c.id===id))add('COLOR_VALUE',`palette.${role}`,'visual','Select an approved brand palette value.');
 }else if(stage==='scenes'){
  for(const beat of (value as SceneSpecV2).beats){const comp=brand.compositions.find(c=>c.id===beat.composition);if(!comp){add('COMPOSITION_VALUE',beat.key,'compositor','This composition is unavailable.');continue;}
   for(const region of beat.regions)if(!brand.palette.some(c=>c.id===region.paint)&&!brandPaints(brand)[region.paint])add('PAINT_VALUE',beat.key,'compositor','Choose an approved region paint.');
   for(const layer of beat.layers){if(!comp.zones[layer.zone])add('ZONE_VALUE',layer.key,'compositor','The selected composition does not have this zone.');if(!brand.palette.some(c=>c.id===layer.color))add('COLOR_VALUE',layer.key,'compositor','Select a brand color.');if(!Object.hasOwn(brand.styles,layer.style))add('STYLE_VALUE',layer.key,'compositor','Select a brand type style.');if(layer.treatment&&!brandTreatments(brand)[layer.treatment])add('TREATMENT_VALUE',layer.key,'compositor','Select an approved brand treatment.');}
  }
 }else if(stage==='media'){
  const media=value as MediaPlan;
  for(const row of media.elements){const path=row.element;
   if(row.source==='ui'&&(!row.ui||!input.assetAliases.some(a=>a.revisionId===row.ui?.referenceRevisionId)))add('UI_REFERENCE',path,'media','A UI recreation needs supplied screenshot evidence.');
   if(row.ui&&!row.ui.panels.length)add('UI_EMPTY',path,'media','Fill the visible product panels from supplied UI evidence.');
   if(row.source==='logo'&&!brand.logos.some(l=>l.id===row.reference))add('LOGO_VALUE',path,'media','The brand needs supplied logo artwork.');
   if(['generate','proxy'].includes(row.source)&&(!row.promptPack||!row.promptPack.prompt.trim()||!row.promptPack.compositionMap.trim()||!row.promptPack.lighting.trim()||!row.promptPack.prohibitions.some(p=>/text/i.test(p))||!row.promptPack.prohibitions.some(p=>/logo/i.test(p))))add('PROMPT_PACK',path,'media','Complete the protected, branded still prompt pack.');
  }
  if(prior.script&&prior.scenes&&prior.treatment)out.push(...mediaRuleIssues({id:input.directionId,skeleton,script:prior.script,scenes:prior.scenes,treatment:prior.treatment,media},input));
 }
 return out;
}
export function validateDirectionValues(direction:CreativeDirection,input:CreativeInputs){return (['script','treatment','scenes','media'] as const).flatMap(stage=>validateFillValues(stage,direction[stage],input,direction).map(issue=>({...issue,path:issue.path.startsWith(stage+'.')?issue.path:`${stage}.${issue.path}`})));}
