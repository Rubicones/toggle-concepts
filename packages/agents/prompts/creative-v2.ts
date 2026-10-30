import {z} from 'zod';
import {flatProviderSchema,dataFormats} from '../../contracts/creative-drafts';
import {recipeNames,cameraNames} from '../../creative/motion-recipes';
import {brandPaints,brandTreatments} from '../../creative/normalize';
import {isScreenshot} from '../../creative/media-rules';
import type {CreativeInputs} from '../../creative/protocol';
import {creativeOutputLimits,type CreativeStage} from './creative-v1';
export const transitionTypes=['cut','crossfade','push','slide','zoom-through','wipe','match'] as const;
export const transitionDirections=['left','right','up','down','none'] as const;
/** Large choice lists are positional boolean selections, never an unbounded string or model-issued index. */
export function issuedChoice(values:string[]){const unique=[...new Set(values)];return unique.length<=12?z.enum((unique.length?unique:['none']) as [string,...string[]]):z.array(z.boolean());}
export function suitableAliases(input:CreativeInputs,kind:string){return input.assetAliases.filter(a=>kind==='ui'?isScreenshot(a.summary):['people','place','footage'].includes(kind)?!isScreenshot(a.summary)&&!/(?:app.?icon|logo|wordmark)/i.test(a.summary):true);}
export function fillView(input:CreativeInputs){
 if(!input.skeleton)throw new Error('DIRECTION_SKELETON_REQUIRED');const slots=input.repairRequest?.slots;
 return input.skeleton.beats.filter(b=>!slots?.length||slots.some(s=>s===b.key||s.startsWith(b.key+'.'))).map(b=>({...b,visuals:b.visuals.filter(v=>!slots?.length||slots.includes(b.key)||slots.includes(v.id)),copy:b.copy.filter(c=>!slots?.length||slots.includes(b.key)||slots.includes(c.id))}));
}
export function fillMotionView(input:CreativeInputs){const view=fillView(input),slots=input.repairRequest?.slots,keep=(id:string)=>!slots?.length||slots.includes(id)||slots.includes(id.split('.')[0]);return {
 motion:view.filter(b=>!b.recipe&&keep(b.key+'.motion')).map(b=>({id:b.key+'.motion',label:b.key+' motion'})),
 cuts:view.filter(b=>b.key!==input.skeleton!.beats.at(-1)!.key&&!b.transitionOut&&keep(b.key+'.cut')).map(b=>({id:b.key+'.cut',label:b.key+' cut'})),
 cameras:view.flatMap(b=>!b.camera?b.visuals.filter(v=>!['logo','graphic','ui'].includes(v.kind)).map(v=>({id:v.id,label:v.label})):[]),
};}
export function fillFactView(input:CreativeInputs){const selected=input.repairRequest?.slots;return Array.from({length:8},(_,i)=>({id:`d${i}`,label:`Fact ${i+1}`})).filter(s=>!selected?.length||selected.includes(s.id));}
export function fillHookView(input:CreativeInputs){const selected=input.repairRequest?.slots;return input.skeleton!.hooks.map((h,i)=>({...h,slotId:h.slotId??`b0.angle.${i}`})).filter(h=>!selected?.length||selected.includes(h.slotId)||selected.includes('b0'));}
export function fillSchema(stage:Exclude<CreativeStage,'compile'>,input:CreativeInputs){
 const brand=input.brand,choice=issuedChoice,label={label:z.string()},text=z.string(),list=z.array(text),panel=z.strictObject({label:text,value:text,kind:z.enum(['label','bar','line','button','number','chip']),progress:z.number()}),colors=brand.palette.map(c=>c.id),zones=[...new Set(brand.compositions.flatMap(c=>Object.keys(c.zones)))];
 const visual=z.strictObject({...label,zone:choice(zones),style:choice(Object.keys(brand.styles)),color:choice(colors),treatment:choice(Object.keys(brandTreatments(brand))),graphic:z.enum(['none','stat','chart','icon','pattern']),chart:z.enum(['none','ring','bar']),fact:choice(Array.from({length:8},(_,i)=>`d${i}`)),icon:choice(Object.keys(brand.icons??{}))});
 const copy=z.strictObject({...label,zone:choice(zones),style:choice(Object.keys(brand.styles)),color:choice(colors),treatment:choice(Object.keys(brandTreatments(brand)))});
 if(stage==='script')return z.strictObject({beats:z.array(z.strictObject({...label,objective:text,visuals:z.array(z.strictObject({...label,description:text})),copy:z.array(z.strictObject({...label,alternatives:list,short:text}))})),hooks:z.array(z.strictObject({...label,angle:text})),facts:z.array(z.strictObject({...label,used:z.boolean(),caption:text,value:z.number(),unit:text,from:z.number(),format:z.enum(dataFormats),source:text}))});
 if(stage==='treatment')return z.strictObject({beats:z.array(z.strictObject({...label,composition:choice(brand.compositions.map(c=>c.id)),field:choice(colors),surface:choice(colors),ink:choice(colors),accent:choice(colors),technique:text,imagery:text,motionCharacter:text}))});
 if(stage==='scenes')return z.strictObject({beats:z.array(z.strictObject({...label,regions:z.array(z.strictObject({...label,paint:choice([...colors,...Object.keys(brandPaints(brand))])})),visuals:z.array(visual),copy:z.array(copy)})),motion:z.array(z.strictObject({...label,recipe:z.enum(recipeNames)})),cuts:z.array(z.strictObject({...label,type:z.enum(transitionTypes),direction:z.enum(transitionDirections)})),cameras:z.array(z.strictObject({...label,camera:z.enum(cameraNames)}))});
 if(stage==='media'){
  // Keep suitable source choices separate by kind; the agent cannot freely name an alias.
  return z.strictObject({beats:z.array(z.strictObject({...label,visuals:z.array(z.strictObject({...label,subject:text,setting:text,light:text,composition:text,assets:z.array(z.boolean()),panels:z.array(panel)}))}))});
 }
 return z.strictObject({beats:z.array(z.strictObject({...label,verdict:z.enum(['match','partial','miss']),findings:z.array(z.strictObject({slot:z.array(z.boolean()),rule:text,fix:text,severity:z.enum(['block','warn'])}))}))});
}
export function creativePromptV2(stage:Exclude<CreativeStage,'compile'>,input:CreativeInputs){
 const view=fillView(input),schema=flatProviderSchema(fillSchema(stage,input));
 const instructions='Creative protocol creative@2. Return only values in positional arrays aligned with the supplied view. Labels are exact echoes for order checking, never identifiers. Do not return keys, paths, indices, targets, bindings, sourceSceneIds or cutdowns. Approved primary copy and locked storyboard motion cannot be changed. Alternatives are optional extras. Never invent facts, product UI, assets or rights. Code owns all identity, source selection and timing. No executable code. Critic: semantic findings only, one round; do not echo measured geometry warnings.';
 const views=view.map(b=>({...b,...(stage==='scenes'?{compositionValues:input.brand.compositions.map(c=>({composition:c.id,zones:Object.keys(c.zones),regions:c.regions.map(r=>({label:`${b.key} region ${r.id}`,paintChoices:r.paints}))}))}:{}),visuals:b.visuals.map(v=>({...v,assetChoices:suitableAliases(input,v.kind).map(a=>({alias:a.key,summary:a.summary})),assetSelection:'positional booleans; at most one true; no alias strings'})),criticSlots:[...b.visuals.map(v=>v.id),...new Set(b.copy.map(c=>c.id)),b.key+'.motion',b.key+'.cut']}));
 return {instructions,prompt:JSON.stringify({stage,view:views,...(stage==='scenes'?fillMotionView(input):{}),hooks:fillHookView(input),...(stage==='script'?{factSlots:fillFactView(input),factsInstruction:'Echo every fact slot label. Set used=false and empty values for unused slots; only used facts quoting an approved source may be drawn.'}:{}),choiceEncoding:'Enums up to 12; larger choices use one positional true in a boolean array. Critic slots and media asset choices are always positional.',task:stage==='script'?'Fill objectives, descriptions, optional alternatives/shorts, hook angles and up to eight quoted facts. Never supply primary copy.':stage==='media'?'For generated slots fill subject, setting, light and composition. For UI slots fill panels from supplied product evidence; assets choose only from that slot’s suitable list.':stage==='critic'?'For every supplied scene return a verdict and semantic findings. Each finding selects exactly one entry of that scene’s criticSlots.':'Fill creative values in the supplied order. Locked motion choices are ignored in your answer.'}),responseSchema:{name:`m07g_${stage}_v2`,schema},maxOutputTokens:creativeOutputLimits[stage]};
}
