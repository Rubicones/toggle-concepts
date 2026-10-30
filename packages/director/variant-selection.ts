import type {Variant} from './types';
export type VariantAxis='format'|'locale'|'hook'|'cta'|'length';
export const variantAxes:VariantAxis[]=['format','locale','hook','cta','length'];
/** Art direction needs the ordered combinations, not every generated variant UUID. */
export function variantAxisSummary(variants:Variant[]){
 const axes={format:[...new Set(variants.map(v=>v.format))],locale:[...new Set(variants.map(v=>v.locale))],hook:[...new Set(variants.map(v=>v.hook))],cta:[...new Set(variants.map(v=>v.cta))],length:[...new Set(variants.map(v=>v.length))]};
 const combinations=[...new Set(variants.map(v=>variantAxes.map(key=>(axes[key] as (string|number)[]).indexOf(v[key])).join('.')))];
 const complete=variants.length>0&&Object.values(axes).reduce((count,values)=>count*values.length,1)===combinations.length;
 return {axes,order:variantAxes,count:variants.length,uniqueCombinations:combinations.length,combinations:complete?'all' as const:combinations.map(value=>value.split('.').map(Number))};
}
/** Keep the other axes where possible, always selecting an issued combination. */
export function selectVariant(variants:Variant[],current:Variant,axis:VariantAxis,value:string){
 const candidates=variants.filter(v=>String(v[axis])===value),score=(v:Variant)=>variantAxes.filter(key=>key!==axis&&v[key]===current[key]).length;
 return candidates.sort((a,b)=>score(b)-score(a))[0]??current;
}
