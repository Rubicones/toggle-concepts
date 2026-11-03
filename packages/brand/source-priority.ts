// Which source wins when supplied files disagree. The brand's own guidelines outrank tokens, tokens outrank artwork and
// font files, and those outrank screenshots and references. A finding the AD marked “Use this” always stays.
import {fieldsOutsideRole,type MaterialRole} from './material-roles';
import {singleChoiceFields} from './finding-selection';
import {fontFamilyOf} from './normalize';
const FONT_FIELDS=new Set(['displayFonts','bodyFonts','monoFonts']);

const rank:Record<MaterialRole,number>={brandbook:0,tokens:1,logo:2,font:2,licence:2,unknown:3,screenshot:3,uikit:3,photo:4,reference:4};
export const rolePriority=(role:MaterialRole|undefined)=>rank[role??'unknown'];
// The brand palette is one group. Interface colours (semanticColors, read from tokens, a UI kit or screenshots) are a
// separate list and never compete with it: every source keeps them for the interface palette.
const COLOUR_FIELDS=['primaryColors','secondaryColors'];
/** Fields where one source's answer is used: the single-choice fields, and the palette as one group. */
const groupOf=(field:string)=>COLOUR_FIELDS.includes(field)?'colours':singleChoiceFields.has(field)?field:null;

type Item={field:string;decision:string;materialId:string;value?:string};
/**
 * In each one-answer group only the best-ranked source's findings carry forward (plus anything marked “Use this”);
 * every other field keeps all findings, best-ranked first. Without roles the order is unchanged.
 */
export function prioritizeFindings<T extends Item>(items:T[],roleOf?:(materialId:string)=>MaterialRole|undefined):T[]{
 if(!roleOf)return items;
 // Findings a file of its kind cannot state are left out (already-read files included), unless marked “Use this”.
 items=items.filter(i=>{const role=roleOf(i.materialId);return i.decision==='keep'||!role||i.field.startsWith('brief.')||!fieldsOutsideRole(role).includes(i.field as never);});
 // In the palette only findings that carry a colour value compete: guidelines that name colours by token (“lime =
 // action”) keep their words while the tokens file supplies the values.
 const competes=(i:T)=>groupOf(i.field)!=='colours'||/#[0-9a-f]{3,8}\b|\b(?:rgba?|oklch)\(/i.test(i.value??'');
 const r=(i:T)=>rolePriority(roleOf(i.materialId)),best=new Map<string,number>();
 for(const i of items){const g=groupOf(i.field);if(g&&i.decision!=='reject'&&competes(i))best.set(g,Math.min(best.get(g)??9,r(i)));}
 return items.filter(i=>{const g=groupOf(i.field);return !g||i.decision==='keep'||!competes(i)||r(i)===best.get(g);}).map((i,index)=>({i,index})).sort((a,b)=>r(a.i)-r(b.i)||a.index-b.index).map(x=>x.i);
}

export type BrandDecision={field:string;chosen:{value:string;file:string;role:MaterialRole};others:{findingId:string;version:number;value:string;file:string;role:MaterialRole}[];question:boolean;options:{findingId:string;version:number;value:string;file:string}[]};
type Finding={id:string;field:string;value:string;edited_value?:string|null;decision:string;version:number;material_id:string};
const norm=(v:string)=>v.toLowerCase().replace(/[^a-z0-9#]+/g,'');
/**
 * One card per single-choice field where files disagree. Different ranks resolve automatically (the losing values stay
 * one click away); a tie between equally ranked files with different values is a question for the AD.
 */
export function brandDecisions(findings:Finding[],material:(id:string)=>{file:string;role:MaterialRole}|undefined):BrandDecision[]{
 const out:BrandDecision[]=[];
 for(const field of singleChoiceFields){
  // Fonts are compared by the family they name: a file's “weight: 700” or “Archivo SemiBold” is not a disagreement.
  const rows=findings.filter(f=>f.field===field&&f.decision!=='reject').map(f=>{const raw=(f.edited_value??f.value).trim();return {f,m:material(f.material_id),value:FONT_FIELDS.has(field)?fontFamilyOf(raw)??'':raw};}).filter(x=>x.m&&x.value&&!/<svg\b/i.test(x.value));
  const distinct=[...new Map(rows.map(x=>[norm(x.value),x])).values()];if(distinct.length<2)continue;
  if(rows.some(x=>x.f.decision==='keep'))continue; // the AD already chose
  const top=Math.min(...distinct.map(x=>rolePriority(x.m!.role))),leaders=distinct.filter(x=>rolePriority(x.m!.role)===top);
  const option=(x:typeof rows[number])=>({findingId:x.f.id,version:x.f.version,value:x.value,file:x.m!.file});
  if(leaders.length>1)out.push({field,chosen:{value:leaders[0].value,file:leaders[0].m!.file,role:leaders[0].m!.role},others:[],question:true,options:leaders.map(option)});
  else out.push({field,chosen:{value:leaders[0].value,file:leaders[0].m!.file,role:leaders[0].m!.role},others:distinct.filter(x=>x!==leaders[0]).map(x=>({...option(x),role:x.m!.role})),question:false,options:[option(leaders[0])]});
 }
 return out.sort((a,b)=>Number(b.question)-Number(a.question));
}
