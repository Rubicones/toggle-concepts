import {structuralCode} from './value-validation';
import {budgetFor} from './copy-budget';
import type {CreativeInputs,CreativeResult} from './protocol';
import type {CreativeStage} from '../agents/prompts/creative-v1';
import {fillView,fillMotionView,fillFactView,fillHookView,suitableAliases} from '../agents/prompts/creative-v2';
import type {DirectionSkeleton,ScriptSpecV2,CreativeTreatment,SceneSpecV2,MediaPlan,CreativeCritic,CreativeRepair} from '../contracts/creative-drafts';
import {brandPaints,brandTreatments} from './normalize';
import {contrastRatio} from '../engine/engine/util';
import {isEngineFinding} from './critic';
export type FillRow=Record<string,unknown>;
const obj=(v:unknown):FillRow=>v&&typeof v==='object'&&!Array.isArray(v)?v as FillRow:{};
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const str=(v:unknown,fallback='')=>typeof v==='string'&&v.trim()?v:fallback;
const strings=(v:unknown)=>arr(v).filter((s):s is string=>typeof s==='string'&&!!s.trim());
const cleanLabel=(v:unknown)=>str(v).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function chosen(v:unknown,choices:string[],fallback=choices[0]??'none'){return typeof v==='string'&&choices.includes(v)?v:Array.isArray(v)&&v.filter(x=>x===true).length===1?choices[v.indexOf(true)]??fallback:fallback;}
export function mergeCreativeFill(stage:Exclude<CreativeStage,'compile'>,raw:unknown,input:CreativeInputs,prior:Partial<{script:ScriptSpecV2;treatment:CreativeTreatment;scenes:SceneSpecV2;media:MediaPlan}>):CreativeResult{
 const skeleton=input.skeleton;if(!skeleton)throw new Error('DIRECTION_SKELETON_REQUIRED');
 const result:CreativeResult={version:'creative-result@1',stage,value:null,issues:[],repairLog:[],fill:null},log=(code:string,path:string,action:string)=>result.repairLog.push({direction:input.direction,level:'L0',code,path,action,costMicroUsd:0,attempt:0});
 let defaultPath='values';
 const select=(value:unknown,choices:string[],fallback=choices[0]??'none')=>{
  const flags=Array.isArray(value)?value:[],valid=typeof value==='string'&&choices.includes(value)||flags.every(v=>typeof v==='boolean')&&(flags.filter(v=>v===true).length===1&&flags.indexOf(true)<choices.length||fallback==='none'&&flags.length>0&&flags.every(v=>v===false));
  if(!valid)log('SLOT_DEFAULT',defaultPath,'Used the issued code/brand default for an absent or invalid creative value.');return chosen(value,choices,fallback);
 };
 const zip=(expected:{label:string;id?:string;key?:string}[],value:unknown,path:string):FillRow[]=>{
  const rows=arr(value).map(obj),used=new Set<number>();if(rows.length>expected.length)log('SLOT_TRUNCATION',path,`Dropped ${rows.length-expected.length} extra value entries.`);
  return expected.map((slot,i)=>{let at=rows.findIndex((r,n)=>!used.has(n)&&cleanLabel(r.label)===cleanLabel(slot.label));
   if(at<0&&rows[i]&&!used.has(i)){const target=cleanLabel(slot.label),similar=rows.map((r,n)=>({n,label:cleanLabel(r.label)})).filter(r=>!used.has(r.n)&&r.label.length>3&&(target.startsWith(r.label)||r.label.startsWith(target)));if(similar.length===1)at=similar[0].n;}
   if(at>=0){used.add(at);if(at!==i)log('LABEL_REORDER',path,`Placed echoed label ${slot.label} in its issued position.`);return {...rows[at],label:slot.label};}
   if(!rows[i]||used.has(i)){log('SLOT_DEFAULT',path,`Used code/brand defaults for ${slot.label}.`);if(stage==='critic')result.issues.push({code:'CRITIC_EVIDENCE_REQUIRED',severity:'block',owner:'ad',path:slot.id??slot.key??path,message:`The paid critic supplied no judgment for ${slot.label}.`,fix:'The AD must review the saved scene evidence; do not buy a second critic round.'});return {label:slot.label};}
   used.add(i);log('SLOT_REASK',path,`Unresolved echoed label for ${slot.label}.`);
   result.issues.push({code:input.repairRequest?.slots?.length?'SLOT_REASK_EXHAUSTED':'SLOT_REASK_REQUIRED',severity:'block',owner:input.repairRequest?.slots?.length?'ad':stage==='script'?'script':stage==='treatment'?'visual':stage==='scenes'?'compositor':stage==='critic'?'ad':'media',path:slot.id??slot.key??path,message:`The label for ${slot.label} could not be aligned.`,fix:'Re-ask this issued slot once, using the same restricted value schema.'});return {label:slot.label};
  });
 };
 const view=fillView(input),incoming=obj(raw),fresh:FillRow[]=zip(view,incoming.beats,'beats').map((r,i)=>({...r,...(['script','scenes','media'].includes(stage)?{visuals:zip(view[i].visuals,r.visuals,view[i].key+'.visual')}:{}),...(['script','scenes'].includes(stage)?{copy:zip(view[i].copy,r.copy,view[i].key+'.copy')}:{})}));
 if(stage==='scenes'){const slots=fillMotionView(input),motion=zip(slots.motion,incoming.motion,'motion'),cuts=zip(slots.cuts,incoming.cuts,'cuts'),cameras=zip(slots.cameras,incoming.cameras,'cameras');for(const [i,b]of view.entries()){const recipe=motion.find(r=>r.label===b.key+' motion'),cut=cuts.find(r=>r.label===b.key+' cut');if(recipe)fresh[i].recipe=recipe.recipe;if(cut)fresh[i].transition={type:cut.type,direction:cut.direction};for(const v of arr(fresh[i].visuals).map(obj)){const camera=cameras.find(c=>c.label===v.label);if(camera)v.camera=camera.camera;}}}
 // A restricted re-ask overlays value slots only. Identity comes from the complete frozen skeleton again.
 const previous=obj(input.repairRequest?.previousFill),oldBeats=arr(previous.beats).map(obj);
 const beats:FillRow[]=skeleton.beats.map(b=>{
  const next=fresh.find(r=>r.label===b.label),old=oldBeats.find(r=>r.label===b.label)??{};
  const combine=(name:'visuals'|'copy',slots:{label:string}[])=>slots.map(slot=>arr(next?.[name]).map(obj).find(r=>r.label===slot.label)??arr(old[name]).map(obj).find(r=>r.label===slot.label)??{label:slot.label});
  const selected=input.repairRequest?.slots,top=!selected?.length||selected.includes(b.key)?next:{...(selected.includes(b.key+'.motion')?{recipe:next?.recipe}:{}),...(selected.includes(b.key+'.cut')?{transition:next?.transition}:{})};
  return {...old,...top,label:b.label,visuals:combine('visuals',b.visuals),copy:combine('copy',b.copy)};
 });
 const fill:FillRow={...previous,...incoming,beats};
 if(stage==='script'){
  const hooks=zip(fillHookView(input).map(h=>({...h,id:h.slotId})),incoming.hooks,'hooks'),facts=zip(fillFactView(input),incoming.facts,'facts');
  fill.hooks=skeleton.hooks.map(h=>hooks.find(r=>r.label===h.label)??arr(previous.hooks).map(obj).find(r=>r.label===h.label)??{label:h.label});
  fill.facts=Array.from({length:8},(_,i)=>({label:`Fact ${i+1}`})).map(f=>facts.find(r=>r.label===f.label)??arr(previous.facts).map(obj).find(r=>r.label===f.label)??f);
 }
 result.fill=fill;
 const brand=input.brand,colors=brand.palette.map(c=>c.id),field=brand.palette.find(c=>c.roles.includes('field'))?.id??colors[0],ink=brand.palette.find(c=>c.roles.includes('ink'))?.id??colors[1]??colors[0],accent=brand.palette.find(c=>c.roles.includes('accent'))?.id??ink;
 if(stage==='script'){
  const script:ScriptSpecV2={version:'script@2',direction:input.direction,oneLine:skeleton.beats[0].visualNotes,technique:'window',sourceScenes:skeleton.beats.map(b=>({sceneId:b.sourceSceneIds[0],startTime:b.start,endTime:b.end,visualNotes:b.visualNotes,onScreenCopy:b.copy.find(c=>c.locale===input.scope.referenceLocale&&!c.hookAxis)?.text??'',narration:''})),cutdowns:skeleton.cutdowns,beats:[],copy:[],hooks:[],data:[],bindings:[],questions:[]};
  for(const [bi,b]of skeleton.beats.entries()){
   defaultPath=b.key;const values=beats[bi],copies=arr(values.copy).map(obj),visuals=arr(values.visuals).map(obj),base=b.copy.filter(c=>!c.hookAxis);
   script.beats.push({key:b.key,role:b.role,objective:str(values.objective,b.visualNotes),focal:b.visuals.find(v=>v.kind!=='logo')?.id??base[0]?.id??b.visuals[0].id,sourceSceneIds:b.sourceSceneIds,elements:[...b.visuals.map((v,i)=>({key:v.id,kind:(v.kind==='logo'?'logo':v.kind==='ui'?'ui':v.kind==='graphic'?'graphic':v.kind==='object'?'product':'media') as ScriptSpecV2['beats'][number]['elements'][number]['kind'],what:v.description+' '+str(visuals[i]?.description)})),...base.filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i).map(c=>({key:c.id,kind:'text' as const,what:c.text}))]});
   for(const [ci,c]of b.copy.entries()){
    const alternatives=[...strings(copies[ci]?.alternatives),str(copies[ci]?.short)].filter(Boolean),limit=Math.min(...skeleton.cutdowns.map(cut=>budgetFor(input.budget,b.role,c.locale,cut.durationSeconds)?.maxChars??Infinity)),maxWords=c.slot==='hook'?brand.limits.hookWords:c.slot==='cta'?brand.limits.ctaWords:Infinity;
    const short=alternatives.filter(text=>[...text.replace(/\*/g,'')].length<=limit&&text.trim().split(/\s+/).length<=maxWords);if(short.length!==alternatives.length)log('SLOT_DEFAULT',c.id,'Discarded optional alternatives outside the copy budget; the locked primary stays verbatim.');
    script.copy.push({key:c.id,beat:b.key,slot:c.slot,locale:c.locale,text:c.text,short});
   }
  }
  const hooks=arr(fill.hooks).map(obj);script.hooks=skeleton.hooks.map((h,i)=>({hookAxisId:h.id,angle:str(hooks[i]?.angle,h.label),beat:skeleton.beats[0].key}));
  script.data=arr(fill.facts).slice(0,8).flatMap((v,i)=>{const r=obj(v);return r.used===true?[{key:`d${i}`,label:str(r.caption,`Fact ${i+1}`),value:Number(r.value)||0,from:Number(r.from)||0,unit:str(r.unit),format:select(r.format,['int','dec1','percent','money']) as 'int',sourceRef:str(r.source,'Unverified fact')}]:[];});
  const keys=script.copy.filter(c=>!bHook(skeleton,c.key)).map(c=>c.key);
  script.bindings=[...new Map(input.variants.map(v=>{const cut=skeleton.cutdowns.find(c=>c.durationSeconds===v.durationSeconds)!;return [JSON.stringify([v.hook,v.offer,v.beatSequence,v.durationSeconds]),{hookAxisId:v.hook,offerAxisId:v.offer,beatSequenceId:v.beatSequence,durationSeconds:v.durationSeconds,beats:cut.beats,beatSeconds:cut.beatSeconds,copyKeys:keys}] as const;})).values()];
  result.value=script;
 }else if(stage==='treatment'){
  const first=beats[0],composition=(b:FillRow,i:number)=>select(b.composition,brand.compositions.map(c=>c.id),brand.compositions.find(c=>c.id.includes(skeleton.beats[i].visuals.some(v=>v.kind==='ui')?'window':'split'))?.id??brand.compositions[0].id);
  result.value={version:'treatment@1',technique:str(first.technique,'window'),compositionsByBeat:beats.map(composition),palette:{field:select(first.field,colors,field),surface:select(first.surface,colors,field),ink:select(first.ink,colors,ink),accent:select(first.accent,colors,accent)},typeRoles:[],imagery:{style:str(first.imagery,brand.imagery.treatment),crop:'cover',treatment:brand.imagery.treatment},motionCharacter:str(first.motionCharacter,'Brand motion'),beatValues:beats.map((b,i)=>({beat:skeleton.beats[i].key,composition:composition(b,i),technique:str(b.technique,'window'),imagery:str(b.imagery,brand.imagery.treatment),motionCharacter:str(b.motionCharacter,'Brand motion'),palette:{field:select(b.field,colors,field),surface:select(b.surface,colors,field),ink:select(b.ink,colors,ink),accent:select(b.accent,colors,accent)}})),transitions:[],signature:{mode:'none',ids:[]}} satisfies CreativeTreatment;
 }else if(stage==='scenes'){
  const treatment=prior.treatment!,script=prior.script!,scenes:SceneSpecV2={version:'scene@2',stage:'draft',direction:input.direction,beats:[],resourceContracts:[]};
  for(const [bi,b]of skeleton.beats.entries()){
   defaultPath=b.key;const r=beats[bi],comp=brand.compositions.find(c=>c.id===treatment.compositionsByBeat[bi])!,zones=Object.keys(comp.zones),visuals=arr(r.visuals).map(obj),copies=arr(r.copy).map(obj),base=b.copy.filter(c=>!c.hookAxis),primary=base[0],palette=treatment.beatValues?.find(v=>v.beat===b.key)?.palette??treatment.palette;
   const layer=(id:string,element:string,kind:SceneSpecV2['beats'][number]['layers'][number]['kind'],source:string,row:FillRow,zone:string,style:string,order:number)=>({key:id,element,kind,source,zone:select(row.zone,zones,zones.includes(zone)?zone:zones[0]),style:select(row.style,Object.keys(brand.styles),style),color:select(row.color,colors,palette.ink),order,registryId:'',treatment:select(row.treatment,Object.keys(brandTreatments(brand)),style==='cta'?'button':'plain'),align:'left' as const,valign:'center' as const});
   const layers:SceneSpecV2['beats'][number]['layers']=b.visuals.map((v,i)=>{
    defaultPath=v.id;const value=visuals[i]??{},logo=v.kind==='logo',graphic=v.kind==='graphic'&&['stat','chart','icon','pattern'].includes(String(value.graphic)),asCopy=v.kind==='graphic'&&!graphic&&primary;
    const l=layer(v.id,v.id,logo?'logo':asCopy?'text':graphic?'graphic':v.kind==='ui'?'ui':'image',logo?brand.logos[0]?.id??'missing':asCopy?primary.id:v.id,value,logo?'logo':asCopy?'text':'hero',asCopy?'body':'body',logo?20:asCopy?15:0);
    if(asCopy){l.zone=zones.includes('text')?'text':zones[0];l.style='body';l.color=palette.ink;}
    if(graphic)Object.assign(l,{graphic:{type:value.graphic,chart:select(value.chart,['none','ring','bar']),data:select(value.fact,script.data.map(d=>d.key),'none'),icon:select(value.icon,Object.keys(brand.icons??{}),'none')}});
    if(!logo&&!asCopy)Object.assign(l,{shape:'rect',camera:b.camera??select(value.camera,['none','push-in','pull-out','pan-left','pan-right','pan-up','pan-down','tilt','drift','parallax'],'drift')});return l;
   });
   for(const c of base.filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i)){const row=copies[b.copy.indexOf(c)]??{};layers.push(layer(c.id,c.id,'text',c.id,row,c.slot==='cta'?'cta':c.slot==='legal'?'legal':'text',c.slot==='hook'?'headline':c.slot==='cta'?'cta':c.slot==='legal'?'legal':'body',10+layers.length));}
   const regionValues=zip(comp.regions.map(region=>({label:`${b.key} region ${region.id}`})),r.regions,b.key+'.regions');
   const transition=obj(r.transition),lockedCut=!!b.transitionOut||bi===skeleton.beats.length-1,type=lockedCut?'crossfade':select(transition.type,['cut','crossfade','push','slide','zoom-through','wipe','match'],'crossfade'),dir=lockedCut?'none':select(transition.direction,['left','right','up','down','none'],'left');
   scenes.beats.push({key:b.key,composition:comp.id,regions:comp.regions.map((region,i)=>({id:region.id,area:region.area,paint:select(regionValues[i].paint,[...colors,...Object.keys(brandPaints(brand))],region.area==='full'&&palette.field!==field?palette.field:region.paints[0]??field)})),layers,recipe:b.recipe??select(r.recipe,['hook-punch','product-reveal','ui-walkthrough','stat-count','testimonial','endcard-cta','montage-on-beat'],b.role==='hook'?'hook-punch':b.role==='cta'?'endcard-cta':b.visuals.some(v=>v.kind==='ui')?'ui-walkthrough':'product-reveal') as 'hook-punch',transitionOut:(b.transitionOut??(type==='push'||type==='slide'?`${type}-${dir==='none'?'left':dir}`:type)) as 'crossfade',cues:[],never:[]});
  }
  // The app owns reference bindings, including non-primary hook axes. No model key is consulted.
  void script;result.value=scenes;
 }else if(stage==='media'){
  const plan:MediaPlan={version:'media@1',elements:[]};
  for(const [bi,b]of skeleton.beats.entries())for(const [vi,v]of b.visuals.entries()){
   if(v.kind==='graphic')continue;defaultPath=v.id;const r=obj(arr(beats[bi].visuals)[vi]),aliases=suitableAliases(input,v.kind),selected=select(r.assets,aliases.map(a=>a.key),'none'),asset=aliases.find(a=>a.key===selected),ui=v.kind==='ui',logo=v.kind==='logo',scene=prior.scenes?.beats[bi],ground=scene?.regions.find(r=>r.area==='full')?.paint??field;
   const source=logo?'logo':ui?'ui':asset?'asset':'generate',reference=logo?brand.logos[0]?.id??'missing':ui?(asset??aliases[0])?.revisionId??'missing-ui':asset?.revisionId??`pending_${v.id}`;
   const panels=arr(r.panels).map(obj).map((p,i)=>({key:`${v.id}.panel.${i}`,label:str(p.label),value:str(p.value),kind:select(p.kind,['label','bar','line','button','number','chip']) as 'label',progress:Math.max(0,Math.min(1,Number(p.progress)||0))}));
   plan.elements.push({element:v.id,source,reference,fit:logo?'contain':'cover',ground,promptPack:source==='generate'?{purpose:v.description,references:[],compositionMap:str(r.composition,v.description),protectedArea:{x:.15,y:.15,w:.7,h:.7},cropMargins:{x:.15,y:.15,w:.7,h:.7},lighting:str(r.light,'Brand lighting'),prohibitions:['No text or lettering','No logos or UI'],prompt:`${v.description}. Subject: ${str(r.subject,v.description)}. Setting: ${str(r.setting,'The approved storyboard setting')}. ${brand.imagery.treatment}. ${prior.treatment?.beatValues?.[bi]?.imagery??''}`}:null,ui:ui?{device:'tablet',aspect:(asset??aliases[0])?((asset??aliases[0])!.width/(asset??aliases[0])!.height):1.6,referenceRevisionId:reference,panels}:null,contract:null,...(v.montage?{shots:[v.description]}:{})});
  }
  // A screen shown in a place shares its generated environment's protected window with the live UI slot.
  for(const b of skeleton.beats){const ui=b.visuals.find(v=>v.kind==='ui'),screen=plan.elements.find(r=>r.element===ui?.id);if(!screen?.ui)continue;
   for(const v of b.visuals.filter(v=>['people','place','footage','object'].includes(v.kind))){const environment=plan.elements.find(r=>r.element===v.id);if(environment?.promptPack&&environment.source==='generate')environment.ui=structuredClone(screen.ui);}
  }
  result.value=plan;
 }else{
  const critic:CreativeCritic={version:'critic@1',scenes:[],findings:[]};
  for(const [bi,b]of skeleton.beats.entries()){
   defaultPath=b.key;const r=beats[bi],slots=[...b.visuals.map(v=>v.id),...new Set(b.copy.map(c=>c.id)),b.key+'.motion',b.key+'.cut'],verdict=select(r.verdict,['match','partial','miss'],'partial') as 'match'|'partial'|'miss';
   const findings=arr(r.findings).map(obj).filter(f=>!isEngineFinding(str(f.rule))&&!structuralCode(str(f.rule)));
   if(verdict==='miss'&&!findings.length)findings.push({slot:slots.map((_,i)=>i===0),rule:'Scene mismatch',fix:'Restore the approved scene visual.',severity:'block'});
   for(const f of findings){if(!Array.isArray(f.slot)||f.slot.filter(v=>v===true).length!==1||f.slot.indexOf(true)>=slots.length)result.issues.push({code:'CRITIC_SLOT_VALUE',severity:'block',owner:'ad',path:b.key,message:'A semantic finding did not select exactly one supplied scene slot.',fix:'Review the retained finding against its scene evidence without another paid critic round.'});const slot=select(f.slot,slots,slots[0]),visual=b.visuals.find(v=>v.id===slot),copy=b.copy.find(c=>c.id===slot),owner=copy?'script':visual&&['people','place','footage','object','ui'].includes(visual.kind)?'media':'compositor',root=owner==='script'?'script.copy':owner==='media'?'media.elements':'scenes.beats',rows=owner==='script'?prior.script?.copy:owner==='media'?prior.media?.elements:prior.scenes?.beats,index=rows?.findIndex(row=>'key' in row?row.key===(copy?.id??b.key):'element' in row&&row.element===slot)??-1,path=`${root}.${Math.max(0,index)}`;
    critic.findings.push({slot,path,owner,rule:str(f.rule,'Scene mismatch'),fix:str(f.fix,'Restore the approved storyboard.'),severity:verdict==='miss'||f.severity==='block'?'block':'warn'});
   }
   critic.scenes!.push({sceneId:b.sourceSceneIds[0],result:verdict,path:`scenes.beats.${bi}`,owner:'compositor',fix:verdict==='match'?'Preserve this scene.':'Restore its approved content.'});
  }
  result.value=critic;
 }
 // Actual contrast choices remain values; defaults choose the most contrasting brand color.
 if(stage==='scenes')for(const beat of (result.value as SceneSpecV2).beats){const ground=brand.palette.find(c=>c.id===beat.regions.find(r=>r.area==='full')?.paint);if(ground)for(const l of beat.layers)if(['text','logo'].includes(l.kind)&&contrastRatio(brand.palette.find(c=>c.id===l.color)!.hex,ground.hex)<4.5)l.color=[...brand.palette].sort((a,b)=>contrastRatio(b.hex,ground.hex)-contrastRatio(a.hex,ground.hex))[0].id;}
 return result;
}
function bHook(s:DirectionSkeleton,key:string){return s.beats.some(b=>b.copy.some(c=>c.id===key&&c.hookAxis));}
export function slotRepairTargets(input:CreativeInputs,issues:{path:string}[]){
 const skeleton=input.skeleton!;return [...new Set(issues.flatMap(issue=>{const direct=[...skeleton.slotIds].sort((a,b)=>b.length-a.length).find(id=>issue.path===id||issue.path.startsWith(id+'.')||issue.path.includes('.'+id));if(direct)return [direct];const beat=skeleton.beats.find(b=>issue.path.includes(b.key));return [beat?.key??skeleton.beats[0].key];}))];
}
export function fillLogCounts(log:CreativeRepair[]){return {reorders:log.filter(l=>l.code==='LABEL_REORDER').length,truncations:log.filter(l=>l.code==='SLOT_TRUNCATION').length,defaults:log.filter(l=>l.code==='SLOT_DEFAULT').length,slotReasks:log.filter(l=>l.code==='SLOT_REASK').length};}
