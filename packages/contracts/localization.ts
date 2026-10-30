import {canonicalJson} from './common';
export type LocalizationVariant={id:string;locale:string;conceptSlot:number;hook:string;beatSequence:string;offer:string;durationSeconds:number;placementId:string};
export type LocalizationBinding={binding:number;locale:string;conceptSlot:number;hook:string;beatSequence:string;offer:string;durationSeconds:number;variantIds:string[];placements:string[]};
/** Application-owned IDs; only format siblings share copy, never distinct duration/hook/offer scopes. */
export function localizationBindings(entries:LocalizationVariant[]):LocalizationBinding[]{
 const groups=new Map<string,LocalizationBinding>();
 for(const row of entries){const key=canonicalJson([row.conceptSlot,row.locale,row.hook,row.beatSequence,row.offer,row.durationSeconds]);let group=groups.get(key);if(!group){group={binding:groups.size,conceptSlot:row.conceptSlot,locale:row.locale,hook:row.hook,beatSequence:row.beatSequence,offer:row.offer,durationSeconds:row.durationSeconds,variantIds:[],placements:[]};groups.set(key,group);}group.variantIds.push(row.id);if(!group.placements.includes(row.placementId))group.placements.push(row.placementId);}
 return [...groups.values()];
}
export function localizationTask(entries:LocalizationVariant[]){return `APPLICATION-OWNED LOCALIZATION BINDINGS\n${JSON.stringify(localizationBindings(entries).map(({variantIds,...group})=>({...group,orderedOutputs:variantIds.length})))}\nReturn deliverable.localizedCopy rows with binding (the exact numeric index above), copySlot and text. Cover EVERY binding with all necessary on-screen, narration and CTA copy from the source scenarios. Adapt wording to that binding's exact duration, locale, hook, beat sequence and offer. Do not generate variant UUIDs or locale fields: the application attaches the exact IDs and locale after validation. Format siblings share each group's copy; different durations must be considered separately. Empty output or a subset is not completion. If source facts prevent completion, return status blocked with explicit blockingQuestions. This transport format replaces variantId/locale repetition in the output only; all source and scope requirements remain.`;}
export function bindLocalizedCopy(deliverable:Record<string,unknown>,entries:LocalizationVariant[]){
 if(!Array.isArray(deliverable.localizedCopy)||!deliverable.localizedCopy.some(r=>r&&typeof r==='object'&&'binding' in r))return {deliverable,changed:false};
 const bindings=localizationBindings(entries),seen=new Set<string>();
 const rows=deliverable.localizedCopy.map((row:unknown)=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('LOCALIZATION_BINDING_MISMATCH');const r=row as Record<string,unknown>;
  if(!Number.isInteger(r.binding)||Number(r.binding)<0||Number(r.binding)>=bindings.length||'variantId' in r||'variantIds' in r||'locale' in r)throw new Error('LOCALIZATION_BINDING_MISMATCH');
  if(typeof r.copySlot!=='string'||!r.copySlot.trim()||typeof r.text!=='string'||!r.text.trim())throw new Error('LOCALIZATION_BINDING_MISMATCH');
  const key=`${r.binding}:${r.copySlot}`;if(seen.has(key))throw new Error('LOCALIZATION_DUPLICATE_COPY_SLOT');seen.add(key);
  const group=bindings[Number(r.binding)],{binding,...copy}=r;void binding;return {...copy,locale:group.locale,variantIds:[...group.variantIds]};
 });
 return {deliverable:{...deliverable,localizedCopy:rows},changed:true};
}

export function localizationCoverage(output:string,entries:{id:string;locale:string}[]){
 try{const rows=JSON.parse(output)?.deliverable?.localizedCopy;if(!Array.isArray(rows))return null;const expected=new Map(entries.map(r=>[r.id,r.locale])),covered=new Set<string>(),foreign=new Set<string>();let localeMismatches=0;
 for(const row of rows){const ids=row?.variantIds??(row?.variantId?[row.variantId]:[]);if(!Array.isArray(ids))continue;for(const id of ids){if(!expected.has(id))foreign.add(String(id));else if(expected.get(id)!==row.locale)localeMismatches++;else covered.add(id);}}
 return {rows:rows.length,covered:covered.size,expected:expected.size,missing:expected.size-covered.size,foreign:foreign.size,localeMismatches};
 }catch{return null;}
}
