// Role effort (docs/reviews/2026-11-09-role-effort.md): how hard each role thinks. Creative roles think at high effort,
// the others at medium. One rule for every request builder, both transports and Models & agents.
import type {CatalogModel} from './catalog';
import type {TextSnapshot} from './text-provider';
import {FLASH_TEXT_MODELS} from './local-models';

export type Effort=NonNullable<TextSnapshot['reasoningEffort']>;
/** Runs whose frozen instructions are this version or later use role effort. Earlier runs keep their exact settings. */
export const ROLE_EFFORT_VERSION='2026-11-09.2';
/** Live-draft blocks started with brief.effortVersion 1 or later use role effort and the larger thinking output caps. */
export const DRAFT_EFFORT_VERSION=1;

const ORDER:readonly Effort[]=['minimal','low','medium','high','xhigh','max'];
/** Planning and draft roles that invent, write, design, build or judge the creative. */
const CREATIVE=new Set(['strategy','script','visual-direction','creative-code','layout','critic','designer','director','assembler']);
/** Roles that read, extract, check scope or translate. */
const SUPPORTING=new Set(['intake','brand-kit','research','variants','localization']);

/** The effort a role asks for; null for roles that do not produce text (image, video, 3D). */
export function roleEffort(role:string):Effort|null{
 if(CREATIVE.has(role))return 'high';
 if(SUPPORTING.has(role))return 'medium';
 return null;
}
export const isCreativeRole=(role:string)=>CREATIVE.has(role);

/**
 * The level a model is asked for. An advertised list gives the wanted level when offered, otherwise the closest offered
 * level below it, otherwise the lowest offered level above it. A model that reasons without an advertised list gets the
 * wanted level. A model that does not reason gets nothing.
 */
export function supportedEffort(wanted:Effort,model:Pick<CatalogModel,'reasoning'|'supportedParameters'>|undefined):Effort|null{
 const list=model?.reasoning?.supported_efforts;
 if(Array.isArray(list)){
  const offered=ORDER.filter(e=>list.includes(e));if(!offered.length)return null;
  if(offered.includes(wanted))return wanted;
  const below=offered.filter(e=>ORDER.indexOf(e)<ORDER.indexOf(wanted));
  return below.length?below[below.length-1]:offered[0];
 }
 return model?.reasoning||model?.supportedParameters?.includes('reasoning')?wanted:null;
}

/**
 * The reasoning settings of one request. Local Claude takes the role's level as --effort. On OpenRouter, the Flash
 * text models keep reasoning off (the earlier rule); other models get the closest level they advertise.
 */
export function roleReasoning(role:string,model:Pick<CatalogModel,'id'|'reasoning'|'supportedParameters'>|undefined,mode:'openrouter'|'local_claude'):Pick<TextSnapshot,'reasoningEffort'|'disableReasoning'>{
 const wanted=roleEffort(role);if(!wanted)return {};
 if(mode==='local_claude')return {reasoningEffort:wanted,disableReasoning:false};
 if(model&&(FLASH_TEXT_MODELS as readonly string[]).includes(model.id))return {disableReasoning:true};
 const effort=supportedEffort(wanted,model);
 return effort?{reasoningEffort:effort,disableReasoning:false}:{};
}

/** True when frozen instructions carry ROLE_EFFORT_VERSION or later. */
export function usesRoleEffort(instructions?:string|null){
 const found=/Instruction version (\d{4}-\d{2}-\d{2})\.(\d+)/.exec(instructions??'');if(!found)return false;const [date,n]=ROLE_EFFORT_VERSION.split('.');
 return found[1]>date||found[1]===date&&Number(found[2])>=Number(n);
}

/** Plain words for Models & agents. */
export function effortLabel(role:string):string|null{
 const e=roleEffort(role);if(!e)return null;
 return e==='high'?'High — creative role':'Medium — supporting role';
}
