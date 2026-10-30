import {brandDraftSchema, requiredBrandRules, type BrandDraft, type BrandRule} from '../contracts/brand-kit';
import {findingPresentation} from './finding-presentation';
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
};
const excerpt=(value:string,max:number)=>value.length<=max?value:value.slice(0,max-1).replace(/[\uD800-\uDBFF]$/,'')+'…';
function displayText(item:BrandbookItem){
 if(/<svg\b/i.test(item.value)||/^data:image\//i.test(item.value))return `Supplied ${item.field} artwork (finding ${item.findingId}; source ${item.materialId}). Keep the original artwork available for AD review.`;
 try{const parsed=JSON.parse(item.value);if(typeof parsed==='string')return parsed;if(parsed&&typeof parsed==='object')return JSON.stringify(parsed,null,2);}catch{}
 return item.value;
}
function choicesFor(key:string,items:BrandbookItem[]):BrandbookChoice[]{
 const rows=items.filter(item=>item.decision!=='reject'&&mapping[key]?.includes(item.field));
 return rows.flatMap(item=>{
  const source={findingId:item.findingId,status:item.evidence,materialId:item.materialId,locator:excerpt(item.locator,1000)};
  if(key.startsWith('color.'))return findingPresentation(item.value,item.field).colors.filter(c=>/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(c.value)).map(c=>({...source,label:[c.label,c.context,c.value].filter(Boolean).join(' · '),value:c.value}));
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
const saturation=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));const max=Math.max(...c);return max?(max-Math.min(...c))/max:0;};
/** Ink, paper and accent from the colors the AD kept: named roles first, then luminance, contrast and saturation. */
export function pickBrandColors(choices:BrandbookChoice[]){
 const unique=[...new Map(choices.map(c=>[c.value.slice(0,7).toLowerCase(),c])).values()];
 const named=(re:RegExp)=>{const hits=[...new Set(unique.filter(c=>re.test(c.label)).map(c=>c.value.slice(0,7).toLowerCase()))];return hits.length===1?unique.find(c=>c.value.slice(0,7).toLowerCase()===hits[0]):undefined;};
 const out:Partial<Record<'ink'|'paper'|'accent',BrandbookChoice>>={};
 out.paper=named(/\b(paper|background|canvas|bg|surface)\b/i)??[...unique].sort((a,b)=>saturation(a.value)-saturation(b.value)||Math.abs(luminance(b.value)-.5)-Math.abs(luminance(a.value)-.5))[0];
 if(out.paper){const paper=out.paper;out.ink=named(/\b(ink|foreground|text|fg)\b/i);if(!out.ink||out.ink===paper)out.ink=[...unique].filter(c=>c!==paper).sort((a,b)=>contrastRatio(b.value,paper.value)-contrastRatio(a.value,paper.value))[0];}
 out.accent=named(/\b(accent|primary|brand|cta|highlight)\b/i);if(!out.accent||out.accent===out.paper||out.accent===out.ink)out.accent=[...unique].filter(c=>c!==out.paper&&c!==out.ink).sort((a,b)=>saturation(b.value)-saturation(a.value))[0];
 return out;
}

/** Curate working A1 fields from an immutable source book. Never approve anything. Safe to repeat: only empty, unreviewed rules are filled. */
export function importBrandbookToA1(base:BrandDraft,book:BrandbookHeader,items:BrandbookItem[],c1:{id:string;immutables?:string;sourceAssetIds?:string[]},makeId:()=>string){
 const draft:BrandDraft=structuredClone(base),usable=items.filter(item=>item.decision!=='reject');
 if(!draft.sourceAssetIds.length&&c1.sourceAssetIds?.length)draft.sourceAssetIds=[...new Set(c1.sourceAssetIds)].slice(0,20);
 const colorRows=usable.filter(i=>mapping['color.ink'].includes(i.field)),keptColors=colorRows.filter(i=>i.decision==='keep');
 const colorPicks=pickBrandColors(choicesFor('color.ink',keptColors.length?keptColors:colorRows));
 const text=(fields:string[])=>usable.filter(i=>fields.includes(i.field)).map(displayText).filter(Boolean).join('\n\n');
 if(!draft.instructions.trim())draft.instructions=excerpt(text(['brandName','brandDescription','voice','tone','imagery'])||'Develop campaign directions from the submitted C1 brief and cited brandbook. Preserve product facts and source artwork; propose any missing creative rules for the art director to review.',8000);
 if(!draft.boundaries.trim())draft.boundaries=excerpt(text(['productIdentity','prohibitions'])||c1.immutables||'',3000);
 if(!draft.fontRights.trim())draft.fontRights=excerpt(text(['fontLicenses']),2000);
 draft.sourceMaterialIds=[...new Set([...(draft.sourceMaterialIds??[]),...usable.map(i=>i.materialId)])];
 const keys=[...requiredBrandRules.map(([category,key])=>`${category}.${key}`),...Object.keys(mapping).filter(key=>!requiredBrandRules.some(([c,k])=>key===`${c}.${k}`)&&usable.some(i=>mapping[key].includes(i.field)))];
 for(const fullKey of keys){
  const [category,...parts]=fullKey.split('.'),key=parts.join('.'),existing=draft.rules.find(r=>r.category===category&&r.key===key);
  if(existing&&(existing.value.trim()||existing.decision!=='unreviewed'))continue;
  const rows=usable.filter(i=>mapping[fullKey]?.includes(i.field)),selected=rows.filter(i=>i.decision==='keep'),preferred=selected.length?selected:rows;
  const choices=choicesFor(fullKey,preferred);
  let value='';
  const candidate=category==='color'||category==='typography'&&key.endsWith('Family');
  let evidenceRows=preferred;
  if(candidate){
   if(category==='color'){
    const pick=colorPicks[key as 'ink'|'paper'|'accent'];
    if(pick){value=pick.value.slice(0,7);evidenceRows=rows.filter(r=>r.findingId===pick.findingId);}
   }else{
    // Weights of one family are one choice; with several families the first kept one wins and stays editable.
    const families=[...new Set(choices.map(c=>familyOf(c.value)))];
    if(families.length){value=families[0];evidenceRows=rows.filter(r=>choices.some(c=>c.findingId===r.findingId&&familyOf(c.value)===families[0]));}
   }
  }else value=excerpt(preferred.map(displayText).join('\n\n'),2000);
  const source=evidenceRows[0]??rows[0];
  let rule:BrandRule={id:existing?.id??makeId(),category:category as BrandRule['category'],key,value,status:source?evidenceRows.some(i=>i.evidence==='inferred')?'inferred':'provided':'unknown',decision:'unreviewed',sourceVerified:false,
   provenance:source?{kind:'material',sourceId:source.materialId,locator:excerpt(source.locator,1000)}:{kind:'proposal',sourceId:null,locator:''},
   reason:source?`Imported from brandbook v${book.version_no}. Review the cited findings${candidate?' and choose the campaign value':''}. Full originals remain in the submitted book.`:'Missing from submitted materials; the AD must provide or source this rule.',
   ...(source?{brandbookSource:{submissionId:book.id,findingIds:[...new Set((evidenceRows.length?evidenceRows:rows).map(i=>i.findingId))]}}:{})};
  if(fullKey==='product.immutables'&&!value&&c1.immutables?.trim())rule={...rule,value:excerpt(c1.immutables,2000),status:'provided',provenance:{kind:'c1',sourceId:c1.id,locator:'Submitted questionnaire: immutables'},reason:'Copied from the fixed C1 product constraints; AD source review is pending.'};
  if(existing)draft.rules[draft.rules.indexOf(existing)]=rule;else draft.rules.push(rule);
 }
 // Each kept logo/icon file becomes its own logo rule so the creative engine can place the actual artwork.
 const artwork=usable.filter(i=>['wordmark','icon','logo','logoFiles','symbol'].includes(i.field)&&i.decision==='keep');
 for(const [index,item] of artwork.slice(0,4).entries()){
  const key=`${item.field==='icon'||item.field==='symbol'?'icon':'wordmark'}${index?index+1:''}`;
  if(draft.rules.some(r=>r.category==='logo'&&(r.key===key||r.provenance.kind==='material'&&r.provenance.sourceId===item.materialId&&r.key!=='usage'))||draft.rules.length>=40)continue;
  draft.rules.push({id:makeId(),category:'logo',key,value:excerpt(`Supplied ${item.field} artwork (${item.materialId}). Place exactly as drawn.`,2000),status:item.evidence,decision:'unreviewed',sourceVerified:false,provenance:{kind:'material',sourceId:item.materialId,locator:excerpt(item.locator||'logo file',1000)},reason:`Chosen in brandbook v${book.version_no}.`,brandbookSource:{submissionId:book.id,findingIds:[item.findingId]}});
 }
 if(!draft.brandbookImports?.some(i=>i.submissionId===book.id&&i.sha256===book.sha256))draft.brandbookImports=[...(draft.brandbookImports??[]),{submissionId:book.id,versionNo:book.version_no,sha256:book.sha256,findingCount:items.length}];
 return brandDraftSchema.parse(draft);
}
