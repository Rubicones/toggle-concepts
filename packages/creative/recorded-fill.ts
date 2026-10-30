import type {CreativeInputs} from './protocol';
import type {CreativeDirection} from '../contracts/frame-program';
import {fillMotionView,fillFactView,suitableAliases} from '../agents/prompts/creative-v2';
import type {CreativeStage} from '../agents/prompts/creative-v1';
/** Offline fixture adapter only. Discard captured identities and emit the exact value-only response shape. */
export function recordedFill(stage:Exclude<CreativeStage,'compile'>,input:CreativeInputs,recorded:CreativeDirection){
 const skeleton=input.skeleton!,motion=fillMotionView(input);
 const old=(id:string,i:number)=>recorded.script.beats.find(b=>b.sourceSceneIds?.includes(id))??recorded.script.beats[i];
 const beats=skeleton.beats.map((b,i)=>{
  const beat=old(b.sourceSceneIds[0],i),scene=recorded.scenes.beats.find(s=>s.key===beat?.key),comp=input.brand.compositions.find(c=>c.id===scene?.composition);
  const visual=(kind:string)=>beat?.elements.find(e=>kind==='logo'?e.kind==='logo':kind==='ui'?e.kind==='ui'||e.kind==='product':!['logo','text','graphic'].includes(e.kind));
  if(stage==='script')return {label:b.label,objective:beat?.objective??b.visualNotes,visuals:b.visuals.map(v=>({label:v.label,description:visual(v.kind)?.what??v.description})),copy:b.copy.map(c=>({label:c.label,alternatives:[],short:recorded.script.copy.find(x=>x.beat===beat?.key&&x.locale===c.locale)?.text??''}))};
  if(stage==='treatment')return {label:b.label,composition:comp?.id??input.brand.compositions[0].id,...recorded.treatment.palette,technique:recorded.treatment.technique,imagery:recorded.treatment.imagery.style,motionCharacter:recorded.treatment.motionCharacter};
  if(stage==='scenes')return {label:b.label,regions:(comp??input.brand.compositions[0]).regions.map(r=>({label:`${b.key} region ${r.id}`,paint:scene?.regions.find(s=>s.id===r.id)?.paint??r.paints[0]})),visuals:b.visuals.map(v=>{
   const layer=scene?.layers.find(l=>l.element===visual(v.kind)?.key),graphic=layer?.graphic,type=graphic&&graphic.type!=='standin'?graphic.type:'none',fact=recorded.script.data.findIndex(d=>d.key===graphic?.data);
   return {label:v.label,zone:layer?.zone??(v.kind==='logo'?'logo':'hero'),style:layer?.style??'body',color:layer?.color??recorded.treatment.palette.ink,treatment:layer?.treatment??'plain',graphic:type,chart:graphic?.chart??'none',fact:`d${Math.max(0,fact)}`,icon:graphic?.icon||'none'};
  }),copy:b.copy.map(c=>({label:c.label,zone:c.slot==='cta'?'cta':c.slot==='legal'?'legal':'text',style:c.slot==='hook'?'headline':c.slot==='cta'?'cta':'body',color:recorded.treatment.palette.ink,treatment:c.slot==='cta'?'button':'plain'}))};
  if(stage==='media')return {label:b.label,visuals:b.visuals.map(v=>{
   const row=recorded.media.elements.find(m=>m.element===visual(v.kind)?.key);
   return {label:v.label,subject:v.description,setting:'The approved scene setting',light:row?.promptPack?.lighting??'Brand daylight',composition:row?.promptPack?.compositionMap??v.description,assets:suitableAliases(input,v.kind).map(a=>v.kind==='ui'&&(a.revisionId===row?.ui?.referenceRevisionId||a.key===row?.reference)),panels:row?.ui?.panels.map(p=>({label:p.label,value:p.value,kind:p.kind,progress:p.progress}))??[]};
  })};
  // The capture has no critic answer. This is explicitly a fake semantic round for transport/gate tests, not visual acceptance.
  return {label:b.label,verdict:'match',findings:[]};
 });
 return {beats,...(stage==='scenes'?{motion:motion.motion.map(v=>{const b=skeleton.beats.find(b=>v.id===b.key+'.motion')!;return {label:v.label,recipe:b.role==='cta'?'endcard-cta':b.visuals.some(v=>v.kind==='ui')?'ui-walkthrough':'product-reveal'};}),cuts:motion.cuts.map(v=>({label:v.label,type:'crossfade',direction:'none'})),cameras:motion.cameras.map(v=>({label:v.label,camera:'drift'}))}:{}),...(stage==='script'?{hooks:skeleton.hooks.map(h=>({label:h.label,angle:recorded.script.hooks.find(x=>x.hookAxisId===h.id)?.angle??h.label})),facts:fillFactView(input).map((slot,i)=>{const d=recorded.script.data[i];return {label:slot.label,used:!!d,caption:d?.label??'',value:d?.value??0,unit:d?.unit??'',from:d?.from??0,format:d?.format??'int',source:d?.sourceRef??''};})}:{})};
}
