import {issuedScenes} from './scenes';
import type {BrandDraft} from '../contracts/brand-kit';
import type {BrandKit,Format,Scene,Variant,DirectionInput} from './types';
import {requestId,digest} from './money';
import {variantAxisSummary} from './variant-selection';
import {materialMemoryContext} from './material-memory';
import {creativeHandoffContext} from './creative-handoff';
import {planningScene,type PlanningDirection} from './planning';
import {resolveReference} from '../agents/knowledge';
export type BrandMaterial={id:string;filename:string;mime:string;sha256:string;objectKey:string;metadata:Record<string,unknown>;text?:string};
export function sourceFilename(m:{sha256:string;mime:string;filename?:string;metadata?:Record<string,unknown>}){const font=!!m.metadata?.family,extension=font?(m.metadata?.container==='wOF2'||m.mime.includes('woff2')?'woff2':m.metadata?.container==='OTTO'||m.mime.includes('otf')?'otf':m.mime.includes('woff')?'woff':'ttf'):m.mime==='image/svg+xml'?'svg':m.mime==='image/jpeg'?'jpg':m.mime==='image/webp'?'webp':m.mime.startsWith('video/')?(m.mime==='video/webm'?'webm':'mp4'):m.mime.startsWith('audio/')?(m.mime==='audio/wav'?'wav':m.mime==='audio/mpeg'?'mp3':m.mime==='audio/ogg'?'ogg':'m4a'):'png';return m.sha256+'.'+extension;}
export function approvedBrandModule(kit:BrandDraft,materials:BrandMaterial[],copy:BrandKit['copy'],facts:Record<string,string>):BrandKit{
 const rules=kit.rules.filter(r=>r.decision==='accepted'&&!['compositions','zones','graphicProposal'].includes(r.key)),fonts=materials.filter(m=>typeof m.metadata.family==='string').map(m=>({family:String(m.metadata.family),url:sourceFilename(m),weight:String(m.metadata.weight??400),style:String(m.metadata.style??'normal')})),logoIds=new Set(rules.filter(r=>r.category==='logo').map(r=>r.provenance.sourceId)),logos=materials.filter(m=>m.mime.startsWith('image/')&&(logoIds.has(m.id)||/logo|wordmark/i.test(m.filename))).map(m=>({id:m.id,url:sourceFilename(m),clearSpacePx:Number(rules.find(r=>r.category==='logo'&&r.key==='clearSpacePx')?.value??0)}));
 if(logos.some(l=>!Number.isFinite(l.clearSpacePx)||l.clearSpacePx<0))throw new Error('APPROVED_LOGO_CLEAR_SPACE_REQUIRED');
 if(!fonts.length)throw new Error('APPROVED_FONT_FILES_REQUIRED');if(!logos.length)throw new Error('APPROVED_LOGO_FILE_REQUIRED');
 const minimumContrast=Number(rules.find(r=>r.key==='minimumContrast')?.value??4.5);if(!Number.isFinite(minimumContrast)||minimumContrast<1||minimumContrast>21)throw new Error('APPROVED_CONTRAST_VALUE_REQUIRED');
 return {tokens:Object.fromEntries(rules.map(r=>[`${r.category}.${r.key}`,r.value])),fonts,logos,rules:{allowedFonts:[...new Set(fonts.map(f=>f.family))],forbiddenColours:rules.filter(r=>/^forbiddenColou?rs$/i.test(r.key)).flatMap(r=>r.value.match(/#[a-f0-9]{6}/gi)??[]),minimumContrast,logoRequired:true},copy,facts,references:materials.filter(m=>m.mime.startsWith('image/')&&!logos.some(l=>l.id===m.id)).map(m=>({id:m.id,url:sourceFilename(m)})),rawKit:{instructions:kit.instructions,boundaries:kit.boundaries,rules,links:kit.links,fontRights:kit.fontRights,materials:materials.map(m=>({id:m.id,filename:m.filename,mime:m.mime,metadata:m.metadata,text:m.metadata.family?undefined:m.text}))}};
}
export function directorFormats(placements:{id:string;width:number;height:number;fps:number}[]):Format[]{return placements.map(p=>{const vertical=p.height/p.width>1.65;return {...p,minTextPx:Math.max(16,Math.round(Math.min(p.width,p.height)*32/1080)),safe:{left:p.width*(vertical?.06:.05),right:p.width*(vertical?.06:.05),top:p.height*(vertical?.10:.05),bottom:p.height*(vertical?.18:.05)}};});}
/** A storyboard problem with a plain explanation for the AD (the planning agent writes free JSON). */
export function storyboardProblem(detail:string){return Object.assign(new Error('APPROVED_STORYBOARD_REQUIRED'),{detail});}
const seconds=(...values:unknown[])=>{for(const v of values){if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'){const t=v.trim().replace(/s(ec(onds?)?)?$/i,'').trim(),clock=/^(\d+):(\d+(?:\.\d+)?)$/.exec(t);if(clock)return Number(clock[1])*60+Number(clock[2]);if(/^\d+(\.\d+)?$/.test(t))return Number(t);}}return undefined;};
const words=(...values:unknown[])=>{for(const v of values)if(typeof v==='string')return v;return undefined;};
export function cleanOnScreenCopyLine(line:string){
 return line
  .replace(/^\s*(?:on[- ]?screen(?:\s+(?:copy|text|super|headline))?|voice\s*over|vo|narration|super|title\s*card|text\s*on\s*screen)\s*:\s*/i,'')
  .replace(/\n\s*(?:on[- ]?screen(?:\s+(?:copy|text|super|headline))?|voice\s*over|vo|narration|super|title\s*card|text\s*on\s*screen)\s*:\s*/gi,'\n')
  .trim();
}
/** Accepts the storyboard shapes the planning agent has produced (startTime/visualNotes and startTimeSeconds/scene). */
export function approvedScenes(raw:unknown,directionId:string):Scene[]{
 const list=Array.isArray(raw)?raw:raw&&typeof raw==='object'?Object.values(raw as Record<string,unknown>).find(Array.isArray):undefined;
 if(!Array.isArray(list)||!list.length)throw storyboardProblem('it has no timed storyboard scenes');
 return list.map((item,index)=>{
  if(!item||typeof item!=='object')throw storyboardProblem(`scene ${index+1} is not a scene`);
  const s=planningScene(item),start=seconds(s.startTime,s.startTimeSeconds,s.start,s.startSeconds),end=seconds(s.endTime,s.endTimeSeconds,s.end,s.endSeconds)??(start!==undefined?(()=>{const d=seconds(s.duration,s.durationSeconds);return d===undefined?undefined:start+d;})():undefined);
  const visual=words(s.visualNotes,s.scene,s.visual,s.visuals,s.description,s.shot,s.motionNotes,s.narration)??(typeof s.visualPremiseRef==='string'?`Visual premise ${s.visualPremiseRef}`:''),copy=words(s.onScreenCopy,s.onScreenText,s.copy,s.text)??'';
  if(start===undefined||end===undefined||end<=start)throw storyboardProblem(`scene ${index+1} has no valid start and end time (its fields: ${Object.keys(s).slice(0,12).join(', ')})`);
  const extractedCopy=Array.isArray(s.onScreenCopy)?s.onScreenCopy.map(v=>typeof v==='string'?v:v&&typeof v==='object'?words((v as Record<string,unknown>).onScreenCopy,(v as Record<string,unknown>).onScreenText,(v as Record<string,unknown>).copy,(v as Record<string,unknown>).text,(v as Record<string,unknown>).headline,(v as Record<string,unknown>).line):undefined).filter((v):v is string=>typeof v==='string'&&!!v.trim()):s.onScreenCopy&&typeof s.onScreenCopy==='object'?[words((s.onScreenCopy as Record<string,unknown>).onScreenCopy,(s.onScreenCopy as Record<string,unknown>).onScreenText,(s.onScreenCopy as Record<string,unknown>).copy,(s.onScreenCopy as Record<string,unknown>).text,(s.onScreenCopy as Record<string,unknown>).headline,(s.onScreenCopy as Record<string,unknown>).line)].filter((v):v is string=>typeof v==='string'&&!!v.trim()):[];
  const rawCopyLines=Array.isArray(s.onScreenCopy)&&s.onScreenCopy.every(v=>typeof v==='string')?s.onScreenCopy as string[]:copy?[copy]:extractedCopy;
  const copyLines=rawCopyLines.map(cleanOnScreenCopyLine).filter(Boolean);
  const rawSourceId=s.sceneId??s.id;
  return {id:requestId({directionId,scene:index}),...((typeof rawSourceId==='string'||typeof rawSourceId==='number')&&String(rawSourceId).trim()?{sourceSceneId:String(rawSourceId).trim()}:{}),start,end,copy:copyLines,visualNotes:visual,motionNotes:typeof s.motionNotes==='string'?s.motionNotes:visual,maxStaticSeconds:typeof s.maxStaticSeconds==='number'?s.maxStaticSeconds:.75};
 });
}
export type ApprovedLocalization={copySlot:string;locale:string;text:string;variantIds:string[];sceneId?:string;direction?:string};
export function variantFacts(args:{variants:Variant[];scenes:Scene[];directionIndex:number;referenceLocale:string;localization:ApprovedLocalization[];sourceDirections?:PlanningDirection[];protectedCopy:Record<string,Record<string,string>>}){
 const facts:NonNullable<DirectionInput['variantFacts']>={};
 const stripSlot=(slotName:string)=>slotName.replace(/^onscreen(?:copy)?[_ .-]/i,'').replace(/[_ .-]onscreen(?:copy)?$/i,'');
 const escapeRegex=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const notAudio=(slotName:string)=>!/narration|voice(?:over)?|audio|subtitle|sfx|music/i.test(slotName);
 for(const v of args.variants){
  // An authored hook can have its own storyboard. Preserve that source's IDs and copy;
  // the creative agents decide its relationship to the direction's displayed key frames.
  const rows=args.localization.filter(r=>r.locale===v.locale&&r.variantIds.includes(v.id));
  const routes=(args.sourceDirections??[]).filter(d=>{
   const bindings=d.value.variantBindings;
   return bindings&&typeof bindings==='object'&&!Array.isArray(bindings)&&Object.hasOwn(bindings,`hook-${v.hook}`)&&d.storyboard.some(raw=>{const scene=planningScene(raw),ids=[scene.id,scene.sceneId,scene.slotId,scene.slot,scene.copySlot].filter((x):x is string|number=>(typeof x==='string'||typeof x==='number')&&!!String(x).trim()).map(x=>String(x).trim());return ids.some(id=>rows.some(r=>r.sceneId===id||stripSlot(r.copySlot)===id));});
  });
  const own=routes.find(d=>args.sourceDirections!.indexOf(d)===args.directionIndex);
  if(!own&&routes.length>1)throw new Error('AMBIGUOUS_LOCALIZED_SCENE_COPY');
  const route=own??routes[0],alternate=route&&args.sourceDirections!.indexOf(route)!==args.directionIndex;
  const sourceDirection=route??args.sourceDirections?.[args.directionIndex];
  const currentDirId=sourceDirection?.id;
  const stripDirectionToken=(slotName:string)=>{
   let cleaned=stripSlot(slotName).replace(/^(?:concept|direction|dir)[_ .-]?\d+[_ .-]/i,'').replace(/[_ .-](?:concept|direction|dir)[_ .-]?\d+$/i,'');
   if(currentDirId)cleaned=cleaned.replace(new RegExp(`^${escapeRegex(currentDirId)}[_ .:-]+`,'i'),'').replace(new RegExp(`[_ .:-]+${escapeRegex(currentDirId)}$`,'i'),'');
   return cleaned;
  };
  const scenes=alternate?approvedScenes(route.storyboard,requestId({directionScene:args.scenes[0]?.id,sourceDirection:route.id})):args.scenes;
  const sourceBoard=sourceDirection?.storyboard??[];
  const entities=scenes.map((s,index)=>{
   const raw=sourceBoard[index]?planningScene(sourceBoard[index]):undefined;
   const slotAliases=raw?[raw.id,raw.sceneId,raw.slotId,raw.slot,raw.copySlot,raw.beatId,raw.shotId].filter((x):x is string|number=>(typeof x==='string'||typeof x==='number')&&!!String(x).trim()).map(x=>String(x).trim()):[];
   return {id:s.id,aliases:[...new Set([s.sourceSceneId,...slotAliases].filter((x):x is string=>!!x))]};
  });
  const resolvesToEntity=(r:ApprovedLocalization)=>resolveReference(r.sceneId,entities).status==='resolved'||resolveReference(stripSlot(r.copySlot),entities).status==='resolved'||resolveReference(stripDirectionToken(r.copySlot),entities).status==='resolved';
  const explicitOnScreen=rows.filter(r=>/(?:^|[_ .-])onscreen(?:copy)?(?:[_ .-]|$)/i.test(r.copySlot)&&notAudio(r.copySlot));
  const onScreen=explicitOnScreen.length?explicitOnScreen:rows.filter(r=>notAudio(r.copySlot)&&(/^(?:(?:concept|direction|dir)[_ .-]?\d+[_ .-])?(?:scene|beat|shot)[_ .-]/i.test(r.copySlot)&&!/cta|offer|legal|disclaimer/i.test(r.copySlot)||resolvesToEntity(r)));
  const sceneCopy:Record<string,string[]>={};
  for(const [index,scene]of scenes.entries()){
   const matches=onScreen.filter(r=>{
    const named=resolveReference(r.sceneId,entities),primarySlot=resolveReference(stripSlot(r.copySlot),entities),slot=primarySlot.status==='missing'?resolveReference(stripDirectionToken(r.copySlot),entities):primarySlot;
    if(named.status==='ambiguous'||slot.status==='ambiguous'||named.status==='resolved'&&slot.status==='resolved'&&named.id!==slot.id)throw new Error('AMBIGUOUS_LOCALIZED_SCENE_COPY');
    if(named.status==='resolved')return named.id===scene.id;
    if(slot.status==='resolved')return slot.id===scene.id;
    if(r.copySlot===`onScreen_${args.directionIndex+1}_${index+1}`||r.copySlot===`onScreen_${index+1}`)return true;
    const numbered=/^(?:(?:concept|direction|dir)[_ .-]?(\d+)[_ .-])?(?:onscreen(?:copy)?|scene|beat|shot)[_ .-](?:(\d+)[_ .-])?(\d+)$/i.exec(r.copySlot);
    if(!numbered)return false;
    const dirNum=numbered[1]??numbered[2],sceneNum=numbered[3];
    return (dirNum===undefined||Number(dirNum)===args.directionIndex+1)&&Number(sceneNum)===index+1;
   });
   const values=[...new Set(matches.map(r=>cleanOnScreenCopyLine(r.text)).filter(Boolean))];
   if(values.length>1)throw new Error('AMBIGUOUS_LOCALIZED_SCENE_COPY');
   if(values.length)sceneCopy[scene.id]=values;
   else{
    const hookRows=index===0?rows.filter(r=>notAudio(r.copySlot)&&/^(?:opening[_ .-]?)?hook(?:[_ .-].*)?$/i.test(stripDirectionToken(r.copySlot))):[];
    const hookValues=[...new Set(hookRows.map(r=>cleanOnScreenCopyLine(r.text)).filter(Boolean))];
    if(hookValues.length>1)throw new Error('AMBIGUOUS_LOCALIZED_SCENE_COPY');
    if(hookValues.length===1)sceneCopy[scene.id]=hookValues;
    else if(v.locale===args.referenceLocale){
     const dirObj=sourceDirection?.value;
     const hookMap=dirObj?.hook&&typeof dirObj.hook==='object'&&!Array.isArray(dirObj.hook)?dirObj.hook as Record<string,unknown>:undefined;
     const hookCandidate=index===0&&hookMap?(hookMap[v.hook]??hookMap[`hook-${v.hook}`]):undefined;
     const cleanedHook=typeof hookCandidate==='string'?cleanOnScreenCopyLine(hookCandidate):'';
     const subcopySuffix=cleanedHook&&!cleanedHook.includes('\n')&&scene.copy[0]?.includes('\n')?'\n'+scene.copy[0].split('\n').slice(1).join('\n'):'';
     sceneCopy[scene.id]=cleanedHook?[cleanedHook+subcopySuffix,...scene.copy.slice(1)]:scene.copy;
    }
    else throw Object.assign(new Error('APPROVED_LOCALIZED_SCENE_COPY_REQUIRED'),{detail:`Scene ${index+1}, ${v.locale}, hook ${v.hook}, ${v.length}s has no approved on-screen binding.`});
   }
  }
  const protectedText=Object.entries(args.protectedCopy).map(([key,locales])=>{const localized=rows.find(r=>r.copySlot===key||r.copySlot===`${key}_primary`);return localized?.text??locales[v.locale]??'';}).filter(Boolean);
  if(!rows.length&&(v.locale!==args.referenceLocale||v.hook!=='primary'))throw new Error('APPROVED_VARIANT_COPY_REQUIRED');
  facts[v.id]={...(alternate?{storyboard:scenes}:{}),sceneCopy,required:[...new Set([...Object.values(sceneCopy).flat(),...onScreen.map(r=>cleanOnScreenCopyLine(r.text)).filter(Boolean),...protectedText])]};
 }
 const signatures=new Map<string,string>();for(const v of args.variants){const key=digest({format:v.format,locale:v.locale,hook:v.hook,cta:v.cta,length:v.length}),copyHash=digest(facts[v.id]);if(signatures.has(key)&&signatures.get(key)!==copyHash)throw new Error('AMBIGUOUS_ORDERED_VARIANTS');signatures.set(key,copyHash);}return facts;
}

/** The director sees reference copy and summaries; all approved variant data stays in the generated module. */
export function compactDirectionBrief(input:DirectionInput,keys:string[]){
 return Object.fromEntries(keys.filter(key=>input.brief[key]!==undefined&&input.brief[key]!==input.brand.facts[key]).map(key=>[key,input.brief[key]]));
}
export function slimDirectorInput(input:DirectionInput){
 const reference=input.variants[0],facts=reference?input.variantFacts?.[reference.id]:undefined;
 const brief=compactDirectionBrief(input,['product','offer','cta','legal','immutables','synthesisPermission','synthesisAllowed',...(!input.creativeHandoff?['objective','audience','variationNotes']:[])]);
 const raw=input.brand.rawKit as {instructions?:string;boundaries?:string;rules?:unknown[]}|undefined;
 const extraRules=(raw?.rules??[]).filter(value=>{const rule=value as Record<string,unknown>;return String(input.brand.tokens[`${rule.category}.${rule.key}`]??'')!==String(rule.value??'');});
 const actions=[`Represented ${input.variants.length} ordered variants as unique axes and combinations; full identifiers remain in the generated brand module.`];
 if(input.creativeHandoff)actions.push(...input.creativeHandoff.actions);
 if(Object.values(input.variantFacts??{}).some(f=>f.storyboard))actions.push('Represented hook-specific storyboards by source IDs and short visual notes; exact alternative copy remains in the generated brand module.');
 if(extraRules.length!==(raw?.rules?.length??0))actions.push('Removed duplicate brand-rule summaries; their complete values remain in brand tokens.');
 return {protocol:input.protocol,stage:'draft',directionId:input.directionId,issuedScenes:issuedScenes(input).map(s=>({id:s.id,sourceSceneId:s.sourceSceneId})),storyboard:input.storyboard.map(s=>({...s,copy:facts?.sceneCopy[s.id]??s.copy})),
 brand:{tokens:input.brand.tokens,fonts:input.brand.fonts,logos:input.brand.logos,rules:input.brand.rules,facts:input.brand.facts,summary:{instructions:raw?.instructions?.slice(0,2000),boundaries:raw?.boundaries?.slice(0,1000),rules:extraRules.slice(0,30).map(value=>{const rule=value as Record<string,unknown>;return {category:rule.category,key:rule.key,value:String(rule.value??'').slice(0,512)};})}},
 variantStoryboards:[...new Map(input.variants.filter(v=>v.locale===reference?.locale).flatMap(v=>{const f=input.variantFacts?.[v.id];return f?.storyboard?[[v.hook,{hook:v.hook,scenes:f.storyboard.map(s=>({id:s.id,sourceSceneId:s.sourceSceneId,visualNotes:s.visualNotes.slice(0,160)}))}] as const]:[];})).values()],
 referenceVariant:reference,referenceCopy:facts?{required:facts.required,sceneCopy:facts.sceneCopy}:Object.fromEntries(Object.entries(input.brand.copy).map(([k,v])=>[k,v[reference?.locale]])),
 variantAxes:variantAxisSummary(input.variants),formats:input.formats,
 assets:input.assets.map(a=>({id:a.id,mime:a.mime,width:a.width,height:a.height})),creativeHandoff:creativeHandoffContext(input,'director'),materialMemory:materialMemoryContext(input.materialMemory,!input.creativeHandoff),resourceIds:input.resourceIds,brief,compaction:{actions}};
}

/** Vision review needs approved copy and hard rules, not the director's full source dossier. */
export function staticCriticInput(input:DirectionInput){
 const reference=input.variants[0],facts=reference?input.variantFacts?.[reference.id]:undefined;
 const summarized:string[]=[];
 const tokens=Object.fromEntries(Object.entries(input.brand.tokens).map(([key,value])=>{
  if(typeof value==='string'&&value.length>160&&/^(layout\.|spacing\.|typography\.rules$|voice\.tone$)/.test(key)){summarized.push(key);return [key,value.slice(0,160)+' [source summary]'];}
  return [key,value];
 }));
 return {directionId:input.directionId,storyboard:input.storyboard.map(s=>({id:s.id,copy:facts?.sceneCopy[s.id]??s.copy,visualNotes:s.visualNotes})),
  referenceVariant:reference,requiredCopy:facts?.required??Object.entries(input.brand.copy).map(([,value])=>value[reference?.locale]).filter(Boolean),
  variantAxes:variantAxisSummary(input.variants),formats:input.formats.map(f=>({id:f.id,width:f.width,height:f.height})),
  brand:{tokens,fonts:input.brand.fonts.map(f=>({family:f.family,weight:f.weight,style:f.style})),logos:input.brand.logos.map(l=>({id:l.id,clearSpacePx:l.clearSpacePx,required:l.required})),rules:input.brand.rules,facts:input.brand.facts},
  synthesisPermission:input.brief.synthesisPermission,
  compaction:{actions:[`Used a review summary of ${summarized.length} long source notes; all approved copy, hard brand rules, logo clear space and protected facts remain exact.`]}};
}
