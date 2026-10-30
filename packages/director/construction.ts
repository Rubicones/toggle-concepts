import type {DirectionInput,Variant} from './types';
import type {LiveOptions} from './live-preview';
export const squareFirstDraft=(input:DirectionInput)=>input.stage==='draft'&&input.brief.draftConstructionVersion===1;
export const sameCopyBinding=(a:Pick<Variant,'locale'|'hook'|'cta'|'length'>,b:Pick<Variant,'locale'|'hook'|'cta'|'length'>)=>a.locale===b.locale&&a.hook===b.hook&&a.cta===b.cta&&a.length===b.length;
/** A square viewport uses an existing copy binding even if square was not ordered. */
export function squareReference(variants:Variant[]){const first=variants[0];return first&&(variants.find(v=>v.format==='square'&&sameCopyBinding(v,first))??first);}
export function remainingDraftOptions(input:DirectionInput,options?:LiveOptions){
 const axes=(['hook','cta','locale','length'] as const).flatMap(axis=>{const key=({hook:'hooks',cta:'ctas',locale:'locales',length:'lengths'} as const)[axis];return [...new Set(input.variants.map(v=>v[axis]))].filter(value=>!options?.[key].some(v=>v===value)).map(value=>`${axis} ${value}`);});
 return [...axes,...input.storyboard.filter(s=>!options?.scenes.includes(s.id)).map(s=>`scene ${s.id}`),...(options?.adaptive?[]:['continuous adaptive sizing'])];
}
export type DraftConstruction={stage:'square'|'adaptation'|'options'|'complete';squareRevision?:string;currentChecked:boolean;remaining:string[];focus:string};
export function constructionProgress(input:DirectionInput,options:LiveOptions|undefined,squareRevision:string|undefined,currentChecked:boolean):DraftConstruction{
 const remaining=remainingDraftOptions(input,options),stage=!squareRevision?'square':!options?.adaptive?'adaptation':remaining.length||!currentChecked?'options':'complete';
 const focus=stage==='square'?'Resolve every scene at 1080 square first: hierarchy, product staging, type, copy/image relationship and spacing. Publish only working reference options.':stage==='adaptation'?'Preserve the square design; develop continuous width/height behaviour in the same Frame.tsx. Recompose deliberately; do not merely scale a fixed square or generate format files.':stage==='options'?'Preserve the square and adaptive design; implement remaining copy/scene options in the same source. Repair current code if needed.':'Source checks and declared options are complete. Creative quality awaits AD review.';
 return {stage,...(squareRevision?{squareRevision}:{}),currentChecked,remaining,focus};
}
