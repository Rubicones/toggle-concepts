import type {LoopState} from './state';
type Entry=LoopState['transcript'][number];
const OLD_TEXT=800;
/**
 * The assembler sees its whole working history every turn. Older file writes are replaced by a pointer to the file on
 * disk (it can `read` the current version) and older tool results are shortened, so input grows linearly instead of
 * re-sending every full source on every turn. The newest `keep` entries are verbatim.
 */
export function compactTranscript(transcript:Entry[],keep=6):Entry[]{
 return transcript.map((entry,index)=>{
  if(index>=transcript.length-keep)return entry;
  if(entry.from==='agent'){
   try{
    const reply=JSON.parse(entry.text) as {calls?:{tool:string;path?:string;source?:string}[]};
    if(Array.isArray(reply.calls))return {from:'agent',text:JSON.stringify({calls:reply.calls.map(call=>call.tool==='write'&&typeof call.source==='string'?{tool:'write',path:call.path,source:`[${call.source.length} characters written earlier; the current file is on disk: use read to see it]`}:call)})};
   }catch{/* an invalid reply is shortened below */}
   return {from:'agent',text:entry.text.length>OLD_TEXT?`${entry.text.slice(0,OLD_TEXT)}…[older reply shortened]`:entry.text};
  }
  return {from:'tool',text:entry.text.length>OLD_TEXT?`${entry.text.slice(0,OLD_TEXT)}…[older tool result shortened]`:entry.text};
 });
}
export const OUTPUT_LIMIT_FEEDBACK='Your last response was longer than the output limit, was cut off and discarded (nothing was written). Write one file per response, keep each file under about 500 lines, and split large components into several files that import each other.';

import type {DirectionInput,CatalogEntry} from './types';
import type {Design} from './contract';
import {variantAxisSummary} from './variant-selection';
import {compactDirectionBrief} from './inputs';
import {materialMemoryContext} from './material-memory';
import {creativeHandoffContext} from './creative-handoff';
import {agentReviewNotes} from './review';
/**
 * What the coding agent receives every turn. The full approved data (brand module with all copy and variant facts,
 * input.json, catalog.json) is in its folder and readable with the read/brand/listResources tools, so it is not
 * re-sent on each of up to 30 turns.
 */
export function assemblerContext(input:DirectionInput,design:Design,catalog:CatalogEntry[],notes:unknown[]){
 const scopedNotes=notes.some(n=>!!n&&typeof n==='object'&&'target' in n);
 const brief=input.stage==='draft'?compactDirectionBrief(input,['product','offer','cta','legal','immutables','synthesisPermission']):Object.fromEntries(['product','offer','cta','legal','immutables','synthesisPermission'].filter(key=>input.brief[key]!==undefined).map(key=>[key,input.brief[key]]));
 const selectedResources=new Set(design.resources.flatMap(r=>[r.id,...r.referenceAssetIds]));
 const referenceFacts=input.creativeHandoff?input.variantFacts?.[input.variants[0]?.id]:undefined,referenceWords=new Set(input.storyboard.flatMap(s=>referenceFacts?.sceneCopy[s.id]??s.copy));
 return {
  files:input.stage==='draft'?'For a new component write Frame.tsx FIRST. When currentFiles contains Frame.tsx, edit that source in place: use exact edits for the requested correction; keep unrelated scenes, options, styling and adaptive logic. A CSS/helper-only correction need not rewrite Frame.tsx. Generated brand.ts, entry.tsx, draft.json, input.json and catalog.json are read-only; use the API below. Frame props: width, height, format, locale, hook, cta, length, sceneId, moment. For a new component build square first; on revisions preserve the existing square and adaptation. Dimensions drive continuous adaptation. No image exports or motion.':'Your folder already holds brand.ts, runtime.ts, entry.tsx, input.json and catalog.json (generated, read-only). Do not read them: their API is below. Start by writing Composition.tsx (split large parts into extra files), then typecheck, bundle, renderStill and checks.',
  brandModule:scopedNotes&&input.stage==='draft'?"Read-only './brand': {brand,copy,variants,variantFacts,resources}; never page through generated data. variants: {id,format,locale,hook,cta,length}[]. variantFacts[id]={sceneCopy:{sceneId:string[]},required:string[]}; render exact words. resources[id]={url,ready,proxy,proxyFor,width?,height?,image?}; image (when ready) = measured facts: subject [x0,y0,x1,y1] and focus [x,y] as fractions, luma/busy 3x3 grids (row by row from top-left, 0..1) and calm cell indexes. Use them for object-position, text side and the legibility technique; they are measurements, not decisions; read inside Frame. Reference words are in storyboard/additionalRequiredCopy.":brandModuleGuide(input),
  ...(input.stage==='draft'?{adaptiveCanvas:{width:1080,height:1080,continuous:true}}:{}),
  storyboard:input.stage==='draft'?input.storyboard.map(s=>({id:s.id,copy:referenceFacts?.sceneCopy[s.id]??s.copy,visualNotes:s.visualNotes})):input.storyboard,formats:input.formats,
  ...(input.creativeHandoff?{additionalRequiredCopy:referenceFacts?.required.filter(text=>!referenceWords.has(text))??[]}:{}),
  ...(input.stage==='draft'?{variantAxes:variantAxisSummary(input.variants),referenceVariants:input.formats.map(format=>input.variants.find(v=>v.format===format.id)).filter(Boolean),compaction:{actions:[`Represented ${input.variants.length} ordered variants as compact axes and reference identifiers.`,`Omitted the repeated index of ${Object.keys(input.brand.copy).length} copy keys; exact variant copy remains in the generated brand module.`,'Omitted storyboard timing and motion notes from static coder context; the complete director design and static visual notes remain.',scopedNotes?'Resource-access guide deduplicated; issued bindings and exact view notes remain.':'Included director-requested pictures and references; listResources retains the complete supplied catalog.']}}:{variants:input.variants.map(v=>[v.id,v.format,v.locale,v.hook,v.cta,v.length].join(' | '))}),
  brand:{tokens:input.brand.tokens,fonts:input.brand.fonts,logos:input.brand.logos,rules:input.brand.rules,...(input.stage==='draft'?{}:{copyKeys:Object.keys(input.brand.copy)}),facts:input.brand.facts},
  brief,
  resources:input.stage==='draft'?design.resources.map(r=>({id:r.id,scene:r.scene,purpose:r.purpose,proxy:r.proxy,proxyFor:r.proxyFor,aspect:r.aspect,access:'resources[id] updates as pictures arrive, with width/height and measured image facts'})):catalog.filter(r=>selectedResources.has(r.id)||input.stage!=='draft').map(r=>({id:r.id,url:r.url,width:r.width,height:r.height,mime:r.mime,proxy:r.proxy,proxyFor:r.proxyFor,purpose:design.resources.find(d=>d.id===r.id)?.purpose})),
  ...(input.stage==='draft'?{otherResources:scopedNotes?'Other supplied artwork: listResources. Logos: brand.logos.':'The complete supplied resource catalog remains available through listResources. Logos are in brand.logos. Context resources lists the director-requested pictures and their reference assets.'}:{}),
  materialMemory:input.stage==='draft'?materialMemoryContext(design.materialMemory??input.materialMemory,!input.creativeHandoff):undefined,
  creativeHandoff:input.stage==='draft'?creativeHandoffContext(input,'coder'):undefined,
  referenceBindings:input.stage==='draft'&&input.materialMemory?design.bindings?.filter(b=>b.kind!=='asset'&&b.aliases.some(alias=>alias!==b.id&&design.designDocument.includes(alias))).map(b=>({id:b.id,aliases:b.aliases.filter(alias=>alias!==b.id&&design.designDocument.includes(alias))})):undefined,
  designDocument:design.designDocument,keyFrames:design.keyFrames,notes:agentReviewNotes(notes),
  ...(notes.length?{revisionGuidance:'Edit the existing authored source for the latest AD correction and captured view. Earlier notes and the design document are context, not instructions to rebuild the component. Preserve everything outside the necessary fix, including images, scenes, ready options and adaptive branches. Director-addressed notes explain creative intent; coder-addressed notes request implementation fixes. Do not recreate Frame.tsx merely to finish a new revision. Preserve exact approved copy and scope; flag any request requiring changes to those instead of silently ignoring it.'}:{}),
 };
}

/**
 * The generated brand module is large (all approved copy for every ordered variant). The coding agent gets its API and
 * the facts of the reference variant instead of paging through 200 KB of data with read calls.
 */
export function brandModuleGuide(input:DirectionInput){
 const reference=input.variants[0],facts=reference?input.variantFacts?.[reference.id]:undefined;
 if(input.stage==='draft'&&input.creativeHandoff)return [
  "Read-only './brand': import {brand,copy,variants,variantFacts,resources} from './brand'; never page through generated files.",
  'brand.tokens/fonts/logos/rules match context.brand; fonts load automatically. Use Img/staticFile from remotion and data-brand-logo={logo.id}.',
  'variants contains issued {id,format,locale,hook,cta,length}; filter by copy axes, prefer format match, otherwise use the same copy binding. variantFacts[v.id]={sceneCopy:{sceneId:string[]},required:string[]}; render exact words. Optional facts.storyboard preserves authored hook-specific scene IDs; implement the director’s mapping to displayed key frames without replacing copy. Reference scene copy is in storyboard; additionalRequiredCopy preserves other mandatory words.',
  'resources[id]={url,ready,proxy,proxyFor,width?,height?,image?}; image (when ready) = measured facts: subject [x0,y0,x1,y1] and focus [x,y] as fractions, luma/busy 3x3 grids (row by row from top-left, 0..1) and calm cell indexes. Use them for object-position, text side and the legibility technique; they are measurements, not decisions. It updates live: read inside Frame, use a placeholder while pending. Dimensions drive adaptation; variants are copy bindings, not render jobs.',
 ].join('\n');
 if(input.stage==='draft')return [
  "Generated module './brand' (read-only; never page through it): import {brand, copy, variantFacts, variants, resources} from './brand';",
  'brand.tokens contains the complete values given in context.brand.tokens. brand.fonts are loaded automatically. brand.logos and brand.rules match context.brand. Use <Img src={staticFile(logo.url)} data-brand-logo={logo.id}/> from remotion.',
  'resources: Record<issuedId,{url,ready,proxy,proxyFor,width?,height?,image?}>; image = measured subject/focus fractions and 3x3 luma/busy/calm grids for crop and legibility choices; read it INSIDE Frame. If not ready, draw your own placeholder. It updates when pictures arrive. Export literal previewOptions readiness for hooks,ctas,locales,lengths,scenes,adaptive.',
  'copy: Record<key,Record<locale,string>>. Do not enumerate its generated keys: variantFacts is the authoritative binding of exact approved words to each scene and variant.',
  `variants: ${input.variants.length} issued entries {id,format,locale,hook,cta,length}; variantFacts: Record<variantId,{sceneCopy:Record<sceneId,string[]>;required:string[]}>. Reference identifiers bind approved copy; they are not render jobs.`,
  'Use width/height for adaptive layout. Pick copy with const candidates=variants.filter(x=>x.locale===locale&&x.hook===hook&&x.cta===cta&&x.length===length); const v=candidates.find(x=>x.format===format)??candidates[0]; const facts=variantFacts[v.id]; render facts.sceneCopy verbatim and include facts.required across the scene frames. Optional facts.storyboard holds the authored alternative narrative and source scene IDs for this hook; decide its mapping to displayed key frames in code, never substitute primary copy.',
  facts?`Reference variant ${reference.id}: ${JSON.stringify({required:facts.required,sceneCopy:facts.sceneCopy}).slice(0,4000)}`:'',
 ].filter(Boolean).join('\n');
 return [
  "Generated module './brand' (read-only; import it, never copy its data): import {brand, copy, variantFacts, variants} from './brand';",
  `brand.tokens: Record<string,string|number> with keys ${Object.keys(input.brand.tokens).slice(0,80).join(', ')}`,
  `brand.fonts (loaded automatically by FontFace): ${JSON.stringify(input.brand.fonts.map(f=>({family:f.family,weight:f.weight,style:f.style})))}`,
  `brand.logos: ${JSON.stringify(input.brand.logos)} — draw with <Img src={staticFile(logo.url)} data-brand-logo={logo.id}/> from 'remotion'.`,
  `brand.rules: ${JSON.stringify(input.brand.rules)}`,
  `copy: Record<key, Record<locale,string>>; keys: ${Object.keys(input.brand.copy).slice(0,40).join(', ')}${Object.keys(input.brand.copy).length>40?' …':''}`,
  `variants: ${input.variants.length} entries {id,format,locale,hook,cta,length}. variantFacts: Record<variantId,{sceneCopy:Record<sceneId,string[]>;required:string[]}>.`,
  'Pick the current variant from the props: const v=variants.find(x=>x.format===format&&x.locale===locale&&x.hook===hook&&x.cta===cta&&x.length===length)!; const facts=variantFacts[v.id]; facts.sceneCopy[scene.id] is the exact on-screen copy of a scene; every string in facts.required must appear verbatim.',
  `Scene ids and timing (seconds): ${JSON.stringify(input.storyboard.map(s=>({id:s.id,start:s.start,end:s.end})))}`,
  facts?`Facts of the reference variant ${reference.id} (${reference.format}, ${reference.locale}): ${JSON.stringify({required:facts.required,sceneCopy:facts.sceneCopy}).slice(0,4000)}`:'',
 ].filter(Boolean).join('\n');
}
