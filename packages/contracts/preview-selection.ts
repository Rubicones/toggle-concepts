import {z} from 'zod';
import {localizationBindings} from './localization';
import type {PreviewInputs} from './preview-proposal';
export const SELECTION_PROTOCOL='preview-selection-3';
/** Older selection protocols whose saved requests may still need an upgrade or replay. */
export const isSelectionProtocol=(protocol:string|undefined)=>!!protocol&&protocol.startsWith('preview-selection-');
export type PlanningSource={id:string;role:string;output:string};
export type SelectionInputs=PreviewInputs&{planning?:PlanningSource[]};
/** Copy remains source data. The model chooses indexes, never regenerates the manuscript. */
export function previewSelectionCatalog(input:SelectionInputs){
 const job=input.planning?.find(j=>j.role==='localization');
 if(!job)throw new Error('PREVIEW_LOCALIZED_COPY_REQUIRED');
 const parsed=JSON.parse(job.output),rows=z.array(z.object({text:z.string().min(1),copySlot:z.string(),locale:z.string(),variantIds:z.array(z.string()).optional(),variantId:z.string().optional()})).parse(parsed.deliverable?.localizedCopy);
 const groups=localizationBindings(input.entries);
 const copies:{index:number;text:string;slot:string;locale:string;variantIds:string[]}[]=[];
 for(const r of rows){const ids=r.variantIds??(r.variantId?[r.variantId]:[]),prior=copies.find(c=>c.text===r.text&&c.slot===r.copySlot&&c.locale===r.locale);if(prior)prior.variantIds=[...new Set([...prior.variantIds,...ids])];else copies.push({index:copies.length,text:r.text,slot:r.copySlot,locale:r.locale,variantIds:ids});}
 // Final concept slots are selection positions, not draft direction IDs. A source
 // for another selection position is eligible only when every copy axis matches.
 const compatible=(a:typeof groups[number],b:typeof groups[number])=>a.locale===b.locale&&a.hook===b.hook&&a.beatSequence===b.beatSequence&&a.offer===b.offer&&a.durationSeconds===b.durationSeconds;
 const eligible=groups.map(g=>copies.filter(c=>c.locale===g.locale&&groups.some(source=>compatible(g,source)&&source.variantIds.every(id=>c.variantIds.includes(id)))).map(c=>c.index));
 if(eligible.some(e=>!e.length))throw new Error('PREVIEW_LOCALIZED_COPY_REQUIRED');
 return {copies,eligible,groups};
}
function existingBinding(input:SelectionInputs,d:number,ids:string[]){
 const matches=input.plan.directions[d].bindings.filter(b=>b.variantIds.some(id=>ids.includes(id)));
 if(matches.length&&(ids.some(id=>!matches.some(b=>b.variantIds.includes(id)))||new Set(matches.map(b=>JSON.stringify([b.legal,b.resource]))).size!==1))throw new Error('PREVIEW_EXISTING_CONTRACT_MISMATCH');
 return matches[0];
}
const sequences=[['hook','proof','cta'],['hook','cta','proof'],['proof','hook','cta'],['proof','cta','hook'],['cta','hook','proof'],['cta','proof','hook']] as const;
const timing=[[1,1,1],[2,2,1],[1,2,1],[2,1,1]] as const;
export function selectionProtocol(input:SelectionInputs){
 const catalog=previewSelectionCatalog(input);for(let d=0;d<3;d++)for(const group of catalog.groups)existingBinding(input,d,group.variantIds);
 const images=input.assets.flatMap((a,i)=>a.mime.startsWith('image/')&&a.inspection.width&&a.inspection.height?[i]:[]),audio=input.assets.flatMap((a,i)=>a.mime==='audio/wav'?[i]:[]);
 if(!images.length)throw new Error('PREVIEW_ASSET_MISSING');
 // Gemini (Google AI Studio) answered HTTP 500/502 "internal error" to every v2 request: 108 integer
 // enums in fixed per-group objects plus a nullable type union. v3 keeps the schema to plain
 // integers and one array; eligibility, counts and media kinds are enforced locally on import.
 const int={type:'integer'};
 const binding={type:'object',additionalProperties:false,properties:{hook:int,proof:int,cta:int},required:['hook','proof','cta']};
 const direction={type:'object',additionalProperties:false,properties:{hero:int,logo:int,audio:int,sequence:int,timing:int,bindings:{type:'array',items:binding}},required:['hero','logo','audio','sequence','timing','bindings']};
 const responseSchema={name:'preview_selection_v3',schema:{type:'object',additionalProperties:false,properties:{d0:direction,d1:direction,d2:direction},required:['d0','d1','d2']}};
 const task=`PREVIEW REFERENCE SELECTION ${SELECTION_PROTOCOL}. Return ONLY numeric selections in the supplied schema. No generated copy, explanations, filenames, resource objects or legal text. Select existing localized hook/proof/CTA text for EACH binding in EACH direction d0,d1,d2: "bindings" is an array with exactly ${catalog.groups.length} items in GROUPS order, item i uses only ALLOWED COPY INDEXES BY BINDING[i]. These three complete draft candidates each cover ALL groups; final conceptSlot is a selection position, never a reason to omit a group. Keep the three scenarios distinct, follow each direction's source scenario, locale, duration, hook/beat/offer and reading time. The application attaches the saved direction identities/recipes, exact variant IDs, copy, and existing legal/proxy contracts. Select a real product image and logo by MEDIA SOURCES index (images: ${JSON.stringify(images)}). Audio: a WAV index (${JSON.stringify(audio)}) or -1 if none. Sequence indexes: ${JSON.stringify(sequences)}. Timing indexes: ${JSON.stringify(timing)}. Missing suitable copy must be corrected in the scenario/localization step, never invented here.\nGROUPS: ${JSON.stringify(catalog.groups.map(({variantIds,...g})=>({...g,orderedOutputs:variantIds.length})))}\nCOPY SOURCES: ${JSON.stringify(catalog.copies.map(c=>({index:c.index,text:c.text,slot:c.slot,locale:c.locale})))}\nALLOWED COPY INDEXES BY BINDING: ${JSON.stringify(catalog.eligible)}\nMEDIA SOURCES: ${JSON.stringify(input.assets.map((a,index)=>({index,name:a.filename,mime:a.mime,...a.inspection})))}`;
 return {responseSchema,task,maxOutputTokens:Math.max(16384,1024+catalog.groups.length*150),protocolInstructions:'This operation selects references to already saved creative work. Follow the exact preview_selection_v3 schema instead of generic role output headings. All leaf values are numeric indexes (-1 only for no audio). Do not regenerate text, IDs, scope or resource contracts. Frozen evidence, budget, source and review instructions continue to apply.'};
}
export function expandPreviewSelection(value:unknown,input:SelectionInputs){
 const catalog=previewSelectionCatalog(input),integer=z.number().int().nonnegative();
 const pick=z.strictObject({hook:integer,proof:integer,cta:integer});
 // v3 sends an ordered array; v2 receipts used fixed b0..bN keys. Both normalize to b-keys.
 const bindings=z.union([z.array(pick).length(catalog.groups.length).transform(rows=>Object.fromEntries(rows.map((r,i)=>[`b${i}`,r]))),z.strictObject(Object.fromEntries(catalog.groups.map((_,i)=>[`b${i}`,pick])))]);
 const dir=z.strictObject({hero:integer,logo:integer,audio:z.number().int().min(-1).nullable().transform(v=>v===-1?null:v),sequence:integer.max(5),timing:integer.max(3),bindings});
 const selected=z.strictObject({d0:dir,d1:dir,d2:dir}).parse(value);
 const scenarioJob=input.planning?.find(j=>j.role==='script'),scenarios=scenarioJob?JSON.parse(scenarioJob.output).deliverable?.threeDirections:[];
 return {...input.plan,assetUseConfirmed:false,directions:input.plan.directions.map((original,d)=>{
  const choice=selected[`d${d}` as keyof typeof selected];
  const asset=(index:number|null,mime:string)=>{if(index===null)return null;const a=input.assets[index];if(!a||!a.mime.startsWith(mime))throw new Error('PREVIEW_ASSET_MISSING');return a.id;};
  const heroAssetId=asset(choice.hero,'image/'),logoAssetId=asset(choice.logo,'image/'),audioAssetId=asset(choice.audio,'audio/wav');
  const scenario=scenarios?.[d];const idea=typeof scenario?.premise==='string'?scenario.premise:original.idea;
  return {...original,idea,bindings:catalog.groups.map((g,i)=>{
   const pick=choice.bindings[`b${i}`] as {hook:number;proof:number;cta:number};
   const copy=(index:number)=>{if(!catalog.eligible[i].includes(index))throw new Error('PREVIEW_COPY_SOURCE_MISMATCH');return catalog.copies[index].text;};
   const existing=existingBinding(input,d,g.variantIds);
   if(existing?.resource&&existing.heroAssetId!==heroAssetId)throw new Error('PREVIEW_RESOURCE_SOURCE_MISMATCH');
   const tail=(BigInt('0x'+original.id.slice(-12))^BigInt(i+1)).toString(16).padStart(12,'0');
   return {id:original.id.slice(0,-12)+tail,variantIds:g.variantIds,locale:g.locale,hook:copy(pick.hook),proof:copy(pick.proof),cta:copy(pick.cta),legal:existing?.legal??'',sequence:[...sequences[choice.sequence]],beatWeights:[...timing[choice.timing]],heroAssetId,logoAssetId,audioAssetId,resource:existing?.resource??null};
  })};
 })};
}
