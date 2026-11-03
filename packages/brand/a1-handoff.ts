import {brandDraftSchema, requiredBrandRules, type BrandDraft, type BrandRule} from '../contracts/brand-kit';
import {findingPresentation} from './finding-presentation';
import {selectFindings} from './finding-selection';
import {prioritizeFindings} from './source-priority';
import {cssColorToHex,fontFamilyOf} from './normalize';
import type {MaterialRole} from './material-roles';
import {contrastRatio,luminance} from '../engine/engine/util';

export type BrandbookItem={findingId:string;field:string;value:string;originalValue?:string;decision:string;evidence:'provided'|'inferred';materialId:string;locator:string};
export type BrandbookHeader={id:string;version_no:number;sha256:string;summary:{findings:number}};
export type BrandbookChoice={findingId:string;label:string;value:string;status:'provided'|'inferred';materialId:string;locator:string};
const mapping:Record<string,string[]>={
 'logo.usage':['logoUsage','wordmark','icon'], 'product.immutables':['productIdentity'],
 'color.ink':['primaryColors','secondaryColors','semanticColors'], 'color.paper':['primaryColors','secondaryColors','semanticColors'], 'color.accent':['primaryColors','secondaryColors','semanticColors'],
 'typography.headlineFamily':['displayFonts'], 'typography.bodyFamily':['bodyFonts'],
 'layout.safeAreaRule':['safeArea'], 'motion.motionSystem':['motion'], 'imagery.treatment':['imagery','photography','illustration'],
 'voice.tone':['voice','tone'], 'sound.policy':['sound'], 'prohibition.policy':['prohibitions'],
 'typography.monospaceFamily':['monoFonts'],'typography.rules':['typographyRules'],'spacing.system':['spacing'],
 'layout.grid':['layout'],'layout.accessibility':['accessibility'],'voice.copyRules':['copyRules'],'voice.localization':['localization'],
 // The product's interface: its components and interface colours (UI kit, tokens, screenshots), kept apart from the brand palette.
 'product.components':['components'],'product.interfaceColors':['semanticColors'],
};
const excerpt=(value:string,max:number)=>value.length<=max?value:value.slice(0,max-1).replace(/[\uD800-\uDBFF]$/,'')+'…';
function displayText(item:BrandbookItem){
 if(/<svg\b/i.test(item.value)||/^data:image\//i.test(item.value))return `Supplied ${item.field} artwork (finding ${item.findingId}; source ${item.materialId}). Keep the original artwork available for AD review.`;
 try{const parsed=JSON.parse(item.value);if(typeof parsed==='string')return parsed;if(parsed&&typeof parsed==='object')return JSON.stringify(parsed,null,2);}catch{}
 return item.value;
}
export function choicesFor(key:string,items:BrandbookItem[]):BrandbookChoice[]{
 const rows=selectFindings(items).filter(item=>mapping[key]?.includes(item.field));
 return rows.flatMap(item=>{
  const source={findingId:item.findingId,status:item.evidence,materialId:item.materialId,locator:excerpt(item.locator,1000)};
  // Token colours are often oklch() or rgb(): each is converted to #RRGGBB so it can be chosen like a hex value.
  if(key.startsWith('color.'))return findingPresentation(item.value,item.field).colors.map(c=>({...c,hex:/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(c.value)?c.value:/^#[a-f\d]{3,4}$/i.test(c.value)?null:cssColorToHex(c.value)})).filter((c):c is typeof c&{hex:string}=>!!c.hex).map(c=>({...source,label:[c.label,c.context,c.value].filter(Boolean).join(' · '),value:c.hex}));
  let value=item.value;try{const parsed=JSON.parse(value);if(typeof parsed==='string')value=parsed;else if(parsed&&typeof parsed==='object'){const family=parsed.family??parsed.fontFamily??parsed.name;if(typeof family==='string')value=family;}}catch{}
  return [{...source,label:excerpt(value,140),value:excerpt(value,2000)}];
 });
}
export function brandbookRuleChoices(draft:BrandDraft,books:Map<string,BrandbookItem[]>){
 return Object.fromEntries(draft.rules.filter(r=>r.brandbookSource&&(r.category==='color'||r.category==='typography'&&r.key.endsWith('Family'))).map(rule=>[rule.id,choicesFor(`${rule.category}.${rule.key}`,books.get(rule.brandbookSource!.submissionId)??[])]));
}

/** Curate working A1 fields from an immutable source book. Never approve anything. */
const weightWords=/\b(thin|hairline|extralight|ultralight|light|regular|book|normal|medium|semibold|demibold|extrabold|ultrabold|bold|black|heavy|italic|oblique|\d{3})\b/gi;
const familyOf=(v:string)=>v.replace(weightWords,'').replace(/\s+/g,' ').trim()||v.trim();
/** The typeface a font finding names: the family only, never the brandbook sentence around it (that goes to typography.rules). */
const fontFamily=(raw:string)=>{const v=raw.split(/\s+(?:for|used|in|on|as|is|are|across|with)\s+|\s+[—–-]\s+/i)[0];return fontFamilyOf(v)??(v.trim().length<=40&&v.trim().split(/\s+/).length<=4?familyOf(v):null);};
const isFontSentence=(v:string)=>v.trim().split(/\s+/).length>=5&&!/^\s*[{[]/.test(v);
const saturation=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));const max=Math.max(...c);return max?(max-Math.min(...c))/max:0;};
const SATURATED=0.25;
const ROLE_WORDS={paper:/\b(paper|background|canvas|bg|surface)\b/i,ink:/\b(ink|foreground|text|fg)\b/i,accent:/\b(accent|primary|brand|cta|highlight)\b/i};
/**
 * Ink, paper and accent from the colors the AD kept: named roles first, then luminance, contrast and saturation.
 * A saturated colour never becomes paper or ink unless a source names it so, and a single colour is the accent.
 */
export function pickBrandColors(choices:BrandbookChoice[]){
 const unique=[...new Map(choices.map(c=>[c.value.slice(0,7).toLowerCase(),c])).values()];
 const named=(re:RegExp)=>{const hits=[...new Set(unique.filter(c=>re.test(c.label)).map(c=>c.value.slice(0,7).toLowerCase()))];return hits.length===1?unique.find(c=>c.value.slice(0,7).toLowerCase()===hits[0]):undefined;};
 const out:Partial<Record<'ink'|'paper'|'accent',BrandbookChoice>>={};
 const neutral=unique.filter(c=>saturation(c.value)<=SATURATED);
 if(unique.length===1&&!named(ROLE_WORDS.paper)&&!named(ROLE_WORDS.ink)){out.accent=unique[0];return out;}
 out.paper=named(ROLE_WORDS.paper)??[...neutral].sort((a,b)=>saturation(a.value)-saturation(b.value)||Math.abs(luminance(b.value)-.5)-Math.abs(luminance(a.value)-.5))[0];
 const paper=out.paper;
 out.ink=named(ROLE_WORDS.ink);if(!out.ink||out.ink===paper)out.ink=paper?neutral.filter(c=>c!==paper).sort((a,b)=>contrastRatio(b.value,paper.value)-contrastRatio(a.value,paper.value))[0]:undefined;
 out.accent=named(ROLE_WORDS.accent);if(!out.accent||out.accent===out.paper||out.accent===out.ink)out.accent=[...unique].filter(c=>c!==out.paper&&c!==out.ink).sort((a,b)=>saturation(b.value)-saturation(a.value))[0];
 return out;
}
const WORD_SOURCES=['primaryColors','secondaryColors','semanticColors','brandDescription','imagery','layout','typographyRules'];
const blackOrWhite=(w:string)=>/black/i.test(w)?'#000000':'#FFFFFF';
/** Paper and ink named in words only ("pure black background", "white text"); used when no value is given for them. */
export function paletteFromWords(items:BrandbookItem[]){
 const out:Partial<Record<'paper'|'ink',BrandbookChoice>>={};
 const paper=[/\b(?:pure\s+|true\s+|deep\s+)?(black|white)\b[^.\n;]{0,30}?\b(?:background|canvas|ground|bg)s?\b/i,/\b(?:background|canvas|bg)s?\b[^.\n;]{0,24}?\b(?:is|are|in|:|=)?\s*(?:pure\s+|true\s+|deep\s+)?(black|white)\b/i];
 const ink=[/\b(?:pure\s+)?(black|white)\s+(?:text|type|copy|foreground)\b/i,/\b(?:text|type|copy|foreground)\b[^.\n;]{0,20}?\b(?:is|in|:|=)?\s*(?:pure\s+)?(black|white)\b/i];
 for(const item of items.filter(i=>WORD_SOURCES.includes(i.field))){
  for(const [role,patterns] of [['paper',paper],['ink',ink]] as const){if(out[role])continue;for(const re of patterns){const m=re.exec(item.value);if(m){out[role]={findingId:item.findingId,label:`“${excerpt(m[0].trim(),80)}”`,value:blackOrWhite(m[1]),status:'inferred',materialId:item.materialId,locator:excerpt(item.locator,1000)};break;}}}
 }
 if(out.paper&&out.ink&&out.paper.value===out.ink.value)delete out.ink;
 return out;
}
/**
 * The brand palette (paper, ink, accent) as the kit and the brand card use it. Interface colours never enter it: a
 * semantic colour counts only when a brand source (not a screenshot or UI kit) names it paper, ink or accent. Values
 * win; words fill paper and ink only when no value is given.
 */
export function brandPalette(usable:BrandbookItem[],roleOf?:(materialId:string)=>MaterialRole|undefined){
 const byId=new Map(usable.map(i=>[i.findingId,i]));
 const choices=choicesFor('color.ink',usable).filter(c=>{const i=byId.get(c.findingId);if(i?.field!=='semanticColors')return true;const role=roleOf?.(i.materialId);return role!=='screenshot'&&role!=='uikit'&&Object.values(ROLE_WORDS).some(re=>re.test(c.label));});
 const picks=pickBrandColors(choices),words=paletteFromWords(usable.filter(i=>{const role=roleOf?.(i.materialId);return role!=='screenshot'&&role!=='uikit';}));
 const out:Partial<Record<'ink'|'paper'|'accent',BrandbookChoice&{fromWords?:true}>>={...picks};
 for(const role of ['paper','ink'] as const)if(!out[role]&&words[role]&&words[role]!.value.toLowerCase()!==out.accent?.value.slice(0,7).toLowerCase()&&words[role]!.value!==out[role==='paper'?'ink':'paper']?.value.slice(0,7).toUpperCase())out[role]={...words[role]!,fromWords:true};
 return out;
}
/** Interface colours as one readable list: "label · #RRGGBB" per line, each value once. */
function interfaceColourList(items:BrandbookItem[]){
 const seen=new Set<string>(),lines:string[]=[];
 for(const item of items)for(const c of findingPresentation(item.value,item.field).colors){const hex=/^#[a-f\d]{6}/i.test(c.value)?c.value.slice(0,7).toUpperCase():cssColorToHex(c.value);if(!hex||seen.has(hex))continue;seen.add(hex);lines.push([c.label,c.context].filter(Boolean).join(' · ')+(c.label||c.context?' · ':'')+hex);}
 return lines.join('\n');
}

/** Curate working A1 fields from an immutable source book. Never approve anything. Safe to repeat: only empty, unreviewed rules are filled.
 * Everything found carries forward unless the AD excluded it; in single-choice fields (logo, fonts, name) “Use this” narrows it to the pick.
 * Groups with nothing found stay empty for the brand agent to build. */
export function importBrandbookToA1(base:BrandDraft,book:BrandbookHeader,items:BrandbookItem[],c1:{id:string;immutables?:string;sourceAssetIds?:string[]},makeId:()=>string,roleOf?:(materialId:string)=>MaterialRole|undefined){
 // When files disagree the better-ranked source wins (source-priority.ts); without roles the order is unchanged.
 const draft:BrandDraft=structuredClone(base),usable=prioritizeFindings(selectFindings(items),roleOf);
 if(!draft.sourceAssetIds.length&&c1.sourceAssetIds?.length)draft.sourceAssetIds=[...new Set(c1.sourceAssetIds)].slice(0,20);
 const colorPicks=brandPalette(usable,roleOf);
 const rowsFor=(fullKey:string)=>fullKey==='typography.rules'?usable.filter(i=>i.field==='typographyRules'||['displayFonts','bodyFonts','monoFonts'].includes(i.field)&&isFontSentence(displayText(i))):usable.filter(i=>mapping[fullKey]?.includes(i.field));
 const text=(fields:string[])=>usable.filter(i=>fields.includes(i.field)).map(displayText).filter(Boolean).join('\n\n');
 if(!draft.instructions.trim())draft.instructions=excerpt(text(['brandName','brandDescription','voice','tone','imagery'])||'Develop campaign directions from the submitted C1 brief and cited brandbook. Preserve product facts and source artwork; propose any missing creative rules for the art director to review.',8000);
 if(!draft.boundaries.trim())draft.boundaries=excerpt(text(['productIdentity','prohibitions'])||c1.immutables||'',3000);
 if(!draft.fontRights.trim())draft.fontRights=excerpt(text(['fontLicenses']),2000);
 draft.sourceMaterialIds=[...new Set([...(draft.sourceMaterialIds??[]),...usable.map(i=>i.materialId)])];
 const keys=[...requiredBrandRules.map(([category,key])=>`${category}.${key}`),...Object.keys(mapping).filter(key=>!requiredBrandRules.some(([c,k])=>key===`${c}.${k}`)&&rowsFor(key).length)];
 for(const fullKey of keys){
  const [category,...parts]=fullKey.split('.'),key=parts.join('.'),existing=draft.rules.find(r=>r.category===category&&r.key===key);
  if(existing&&(existing.value.trim()||existing.decision!=='unreviewed'))continue;
  const rows=rowsFor(fullKey),preferred=rows;
  const choices=choicesFor(fullKey,preferred);
  let value='';
  const candidate=category==='color'||category==='typography'&&key.endsWith('Family');
  let evidenceRows=preferred,fromWords:string|undefined;
  if(candidate){
   if(category==='color'){
    const pick=colorPicks[key as 'ink'|'paper'|'accent'];
    if(pick){value=pick.value.slice(0,7);evidenceRows=usable.filter(r=>r.findingId===pick.findingId);fromWords=pick.fromWords?pick.label:undefined;}
   }else{
    // Weights of one family are one choice; with several families the first kept one wins and stays editable.
    const families=[...new Set(choices.map(c=>fontFamily(c.value)).filter((f):f is string=>!!f))];
    if(families.length){value=families[0];evidenceRows=rows.filter(r=>choices.some(c=>c.findingId===r.findingId&&fontFamily(c.value)===families[0]));}
   }
  }else value=excerpt(fullKey==='product.interfaceColors'?interfaceColourList(preferred):preferred.map(displayText).join('\n\n'),2000);
  const source=evidenceRows[0]??rows[0];
  let rule:BrandRule={id:existing?.id??makeId(),category:category as BrandRule['category'],key,value,status:source?fromWords||evidenceRows.some(i=>i.evidence==='inferred')?'inferred':'provided':'unknown',decision:'unreviewed',sourceVerified:false,
   provenance:source?{kind:'material',sourceId:source.materialId,locator:excerpt(source.locator,1000)}:{kind:'proposal',sourceId:null,locator:''},
   reason:source?(fromWords?`Imported from brandbook v${book.version_no}: no colour value is given, so this is read from the wording ${fromWords}. Check it before accepting.`:`Imported from brandbook v${book.version_no}. Review the cited findings${candidate?' and choose the campaign value':''}. Full originals remain in the submitted book.`):'Not found in the brandbook; the brand agent proposes this rule.',
   ...(source?{brandbookSource:{submissionId:book.id,findingIds:[...new Set((evidenceRows.length?evidenceRows:rows).map(i=>i.findingId))]}}:{})};
  if(fullKey==='product.immutables'&&!value&&c1.immutables?.trim())rule={...rule,value:excerpt(c1.immutables,2000),status:'provided',provenance:{kind:'c1',sourceId:c1.id,locator:'Submitted questionnaire: immutables'},reason:'Copied from the fixed C1 product constraints; AD source review is pending.'};
  if(existing)draft.rules[draft.rules.indexOf(existing)]=rule;else draft.rules.push(rule);
 }
 // Each included logo/icon file becomes its own logo rule so the creative engine can place the actual artwork.
 // Only artwork: drawn marks in the finding itself, or a file the AD marked as a logo. A guidelines sentence about the
 // wordmark ("the wordmark is lowercase") is not a logo file.
 const artwork=usable.filter(i=>['wordmark','icon','logo','logoFiles','symbol'].includes(i.field)&&(/<svg\b|^data:image\//i.test(i.value.trim())||roleOf?.(i.materialId)==='logo'));
 for(const [index,item] of artwork.slice(0,4).entries()){
  const key=`${item.field==='icon'||item.field==='symbol'?'icon':'wordmark'}${index?index+1:''}`;
  if(draft.rules.some(r=>r.category==='logo'&&(r.key===key||r.provenance.kind==='material'&&r.provenance.sourceId===item.materialId&&r.key!=='usage'))||draft.rules.length>=40)continue;
  draft.rules.push({id:makeId(),category:'logo',key,value:excerpt(`Supplied ${item.field} artwork (${item.materialId}). Place exactly as drawn.`,2000),status:item.evidence,decision:'unreviewed',sourceVerified:false,provenance:{kind:'material',sourceId:item.materialId,locator:excerpt(item.locator||'logo file',1000)},reason:`Found in brandbook v${book.version_no}.`,brandbookSource:{submissionId:book.id,findingIds:[item.findingId]}});
 }
 if(!draft.brandbookImports?.some(i=>i.submissionId===book.id&&i.sha256===book.sha256))draft.brandbookImports=[...(draft.brandbookImports??[]),{submissionId:book.id,versionNo:book.version_no,sha256:book.sha256,findingCount:items.length}];
 return brandDraftSchema.parse(draft);
}
