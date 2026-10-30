import type {TextSnapshot} from '../agents/text-provider';
import {textRequestQuote} from '../agents/text-quote';
import type {LoopState} from './state';
// textRequestQuote uses UTF-8 bytes plus conservative image/transport reserves, not measured tokens.
export const DRAFT_INPUT_TARGET=32768;
export const DRAFT_INPUT_CAP=65536;
export function draftRequestCap(contextLength:number,maxOutputTokens:number){return contextLength>=DRAFT_INPUT_CAP+maxOutputTokens?DRAFT_INPUT_CAP:DRAFT_INPUT_TARGET;}
/** Planning prose is evidence, not the approved-copy store. Keep its structure and source references. */
function planningSummary(value:unknown,characters:number):unknown{
 if(typeof value==='string')return value.length>characters?value.slice(0,characters)+' [summary; full source saved]':value;
 if(Array.isArray(value))return value.map(item=>planningSummary(item,characters));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,planningSummary(item,characters)]));
 return value;
}
function planningExcerpt(value:unknown,budget:number){
 const passages:{key:string;text:string}[]=[];
 const visit=(item:unknown,key:string)=>{
  if(typeof item==='string')passages.push({key:key.slice(-32),text:item});
  else if(Array.isArray(item))item.forEach(v=>visit(v,key));
  else if(item&&typeof item==='object')Object.entries(item).forEach(([k,v])=>visit(v,k));
 };
 visit(value,'source');
 const share=Math.max(1,Math.floor(budget/Math.max(1,passages.length))-1);
 return {summary:passages.map(p=>`${p.key.slice(0,Math.min(12,Math.floor(share/3)))}: ${p.text}`.slice(0,share)).join('\n').slice(0,budget),source:'Excerpt only; complete planning and provenance remain in the saved snapshot.'};
}
/** Source lives on disk. Even the newest writes are represented by file names and byte counts. */
export function compactDraftTranscript(entries:LoopState['transcript']){
 return entries.slice(-10).map(entry=>{let text=entry.text;try{const value=JSON.parse(text);if(entry.from==='agent'){const files=value.files??value.calls?.filter((c:{tool:string})=>c.tool==='write');if(files)text=JSON.stringify({written:files.map((f:{path:string;source?:string})=>({path:f.path,characters:f.source?.length??0})),note:'Source is on disk. Read only your own files if needed.'});}}catch{/* retain a bounded observation */}return {...entry,text:text.slice(0,1400)};});
}
export function compactDraftRequest(prompt:string,snapshot:TextSnapshot,images:{url:string;label:string;required?:boolean}[],cap=Math.min(snapshot.requestInputCap??DRAFT_INPUT_CAP,DRAFT_INPUT_CAP),allowanceInputCap=cap){
 const ceiling=Math.min(cap,Math.max(0,allowanceInputCap)),target=Math.min(ceiling,DRAFT_INPUT_TARGET);
 const cfg=structuredClone(snapshot),pictures=[...images],actions:string[]=[],bound=()=>textRequestQuote(prompt,cfg,'',pictures.length).inputTokenBound,before=bound();
 if(cfg.campaignContext&&typeof cfg.campaignContext==='object'){
  const context=cfg.campaignContext as {compaction?:{actions?:unknown[]};input?:{compaction?:{actions?:unknown[]}};previousDesign?:Record<string,unknown>};
  for(const summary of [context.compaction,context.input?.compaction])for(const action of summary?.actions??[])if(typeof action==='string')actions.push(action);
  if(context.previousDesign&&typeof context.previousDesign==='object'){
   // A sealed design contains derived technical state as well as authored decisions.
   // Revisions need the authored design; current memory and issued identities are
   // already supplied separately. Never recursively resend historical raw evidence.
   const {materialMemory,bindings,...authored}=context.previousDesign;
   if(materialMemory!==undefined||bindings!==undefined){
    const document=String(authored.designDocument??''),references=Array.isArray(bindings)?bindings.flatMap(binding=>{
     if(!binding||binding.kind!=='resource'||!Array.isArray(binding.aliases))return [];
     const aliases=binding.aliases.filter((alias:unknown)=>typeof alias==='string'&&alias!==binding.id&&document.includes(alias));
     return aliases.length?[{kind:'resource',id:binding.id,aliases}]:[];
    }):[];
    context.previousDesign={...authored,...(references.length?{bindings:references}:{})};
    actions.push('Removed duplicate material memory and reference-binding metadata from the previous design; retained resource aliases used by its prose. Its full design document, key frames, resource briefs and material observations are unchanged; historical evidence remains saved.');
   }
  }
 }
 {try{const value=JSON.parse(prompt);if(Array.isArray(value.previousValidationFailures)){value.previousValidationFailures=value.previousValidationFailures.slice(-2).map((v:Record<string,unknown>)=>({error:String(v.error??'Invalid answer').slice(0,400),detail:String(v.detail??'').slice(0,600)}));prompt=JSON.stringify(value);actions.push('Bounded the two latest repair errors in the actual request envelope; saved answers remain on disk.');}if(Array.isArray(value.toolResults)){value.toolResults=compactDraftTranscript(value.toolResults);const next=JSON.stringify(value);if(next!==prompt)actions.push('Replaced source writes and older tool output with compact observations.');prompt=next;}}catch{/* non-tool tasks keep their exact prompt */}}
 if(bound()>target&&cfg.campaignContext&&typeof cfg.campaignContext==='object'){
  const context=cfg.campaignContext as Record<string,unknown>;
  const input=(context.input&&typeof context.input==='object'?context.input:context) as Record<string,unknown>;
  const handoff=input.creativeHandoff as {strategy?:unknown;visual?:unknown}|undefined;
  if(handoff){
   const original={strategy:handoff.strategy,visual:handoff.visual};
   for(const characters of [320,160,80]){
    if(bound()<=target)break;
    handoff.strategy=planningSummary(original.strategy,characters);handoff.visual=planningSummary(original.visual,characters);
    actions.push(`Summarized strategy and visual-source prose to at most ${characters} characters per passage. Full sources and provenance remain saved; approved copy, brand rules, AD intent and the current design are unchanged.`);
   }
  }
  if(Array.isArray(context.previousValidationFailures)){context.previousValidationFailures=context.previousValidationFailures.slice(-2).map(v=>{try{const parsed=JSON.parse(String(v));return {error:String(parsed.error??'Invalid previous answer').slice(0,1000)};}catch{return String(v).slice(0,1000);}});actions.push('Kept only the two latest validation summaries.');}
 }
 if(bound()>target){try{const value=JSON.parse(prompt);let removed=0;while(bound()>target&&Array.isArray(value.toolResults)&&value.toolResults.length>1){value.toolResults.shift();removed++;prompt=JSON.stringify(value);}if(removed)actions.push(`Omitted ${removed} older observations; current source and latest findings remain.`);}catch{/* preserve exact non-tool prompts */}}
 while(bound()>target&&pictures.some(p=>!p.required)&&!cfg.preserveImages){const index=pictures.map(p=>!p.required).lastIndexOf(true);pictures.splice(index,1);actions.push('Omitted an optional reference image to fit this request; selected creative references remain.');}
 if(bound()>target&&cfg.campaignContext&&typeof cfg.campaignContext==='object'){
  const context=cfg.campaignContext as Record<string,unknown>,input=(context.input&&typeof context.input==='object'?context.input:context) as Record<string,unknown>;
  const memory=input.materialMemory as {rules?:unknown[]}|undefined,brand=input.brand as {tokens?:Record<string,unknown>}|undefined;
  if(memory?.rules&&brand?.tokens){
   memory.rules=memory.rules.filter(value=>{const rule=value as {key?:string};return !rule.key||!Object.hasOwn(brand.tokens!,rule.key);});
   actions.push('Omitted duplicate material-rule metadata; exact approved rules remain in brand.tokens and complete provenance remains saved.');
  }
  delete input.compaction;
  const handoff=input.creativeHandoff as {strategy?:unknown;visual?:unknown}|undefined;
  if(bound()>ceiling&&handoff){
   if(handoff.strategy!==undefined)handoff.strategy=planningExcerpt(handoff.strategy,800);
   if(handoff.visual!==undefined)handoff.visual=planningExcerpt(handoff.visual,1800);
   actions.push('Used bounded strategy and visual-source excerpts, with passages in source order. Full sources remain saved; exact copy, brand rules, AD intent, required pictures and the current design are unchanged.');
  }
 }
 const after=bound();
 if(ceiling<cap)actions.push(`Compacted against ${ceiling} raw input units available within the remaining billed-token allowance, including the cache-write price bound. The ${cap} hard size limit and monetary caps are unchanged.`);
 if(after>target&&after<=ceiling)actions.push(`The complete request needs ${after} conservative input units after compaction: above the ${target} preferred target, within the ${ceiling} available input ceiling. Existing price, model-context and cumulative allowance checks still apply.`);
 const compaction={before,after,target,cap,allowanceInputCap:ceiling,actions};
 if(after>cap)throw Object.assign(new Error('DRAFT_REQUEST_SIZE_CAP'),{compaction,detail:'The required design and approved facts exceed this request’s size limit. Shorten the design or source summaries before continuing.'});
 if(after>ceiling)throw Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{compaction,detail:`The required request needs ${after} raw input units after compaction; ${ceiling} fit the remaining allowance including cache-write pricing. Nothing was sent.`});
 return {prompt,snapshot:{...cfg,requestInputCap:cap},images:pictures,compaction};
}
