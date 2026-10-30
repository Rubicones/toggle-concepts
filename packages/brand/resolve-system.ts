import {logoSvg} from './logo-svg';
import {resolveGraphics} from './graphic-vocabulary';
import type {BrandDraft} from '../contracts/brand-kit';
import {brandSystemSchema,cueVocabulary,type BrandSystem,type CreativeIssue} from '../contracts/creative-drafts';
import {libraryCompositions} from '../engine/layout/library';
import {contrastRatio,luminance} from '../engine/engine/util';

export type CreativeMaterial={id:string;sha256:string;mime:string;objectKey:string;state:string;metadata:Record<string,unknown>};
export type BrandResolution={system:BrandSystem;fallbacks:BrandSystem['fallbacks'];readiness:CreativeIssue[]};
const saturation=(hex:string)=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));const max=Math.max(...c);return max?(max-Math.min(...c))/max:0;};
const normalized=(s:string)=>s.normalize('NFKC').trim().toLowerCase().replace(/[\s_-]+/g,'');
/** Pure resolution of an accepted revision: no storage lookup, network or guessed logo. */
export function resolveBrandSystem(revision:{id:string;kit:BrandDraft},materials:CreativeMaterial[],fallbackFonts:CreativeMaterial[]=[]):BrandResolution{
 const kit=revision.kit,rules=kit.rules.filter(r=>r.decision==='accepted'),fallbacks:BrandSystem['fallbacks']=[],readiness:CreativeIssue[]=[];
 const value=(category:string,key:string)=>rules.find(r=>r.category===category&&r.key===key)?.value.trim()??'';
 const fallback=(path:string,reason:string,v:unknown)=>fallbacks.push({path,reason,value:JSON.stringify(v)});
 const block=(code:string,path:string,message:string,fix:string)=>readiness.push({code,severity:'block',owner:'ad',path,message,fix});
 const fonts:BrandSystem['fonts']=[];
 const warn=(code:string,path:string,message:string,fix:string)=>readiness.push({code,severity:'warn',owner:'ad',path,message,fix});
 const familyMatches=(family:string)=>family?materials.filter(m=>(kit.sourceMaterialIds??[]).includes(m.id)&&m.state==='ready'&&(normalized(String(m.metadata.family??''))===normalized(family)||normalized(String(m.metadata.family??'').replace(/\b(thin|extralight|light|regular|book|medium|semibold|demibold|extrabold|bold|black|heavy|italic)\b/gi,''))===normalized(family.replace(/\b(thin|extralight|light|regular|book|medium|semibold|demibold|extrabold|bold|black|heavy|italic)\b/gi,'')))&&Number(m.metadata.unitsPerEm)>0&&Array.isArray(m.metadata.glyphCoverage)&&m.metadata.glyphCoverage.length>0&&m.metadata.container!=='wOFF'):[];
 const roles=([['headline','headlineFamily'],['body','bodyFamily'],['accent','monospaceFamily']] as const).map(([role,key])=>({role,family:value('typography',key)})).filter(r=>r.role!=='accent'||r.family);
 const own=new Map(roles.map(r=>[r.role,familyMatches(r.family)]));
 const permitted=value('typography','draftFallback'),explicit=permitted?fallbackFonts.filter(m=>normalized(String(m.metadata.family))===normalized(permitted)):[];
 for(const {role,family} of roles){
  let matches=own.get(role)!,resolvedFamily=family;
  if(!matches.length){
   // A missing file never stops drafts: borrow another supplied brand font, then the packaged draft family. Both are recorded.
   const borrowed=roles.find(r=>r.role!==role&&own.get(r.role)!.length);
   if(explicit.length){matches=explicit;resolvedFamily=permitted;fallback(`fonts.${role}`,'Explicit A1 draft fallback',permitted);}
   else if(borrowed){matches=own.get(borrowed.role)!;resolvedFamily=borrowed.family;fallback(`fonts.${role}`,`No ${family||role} font file; uses the supplied ${borrowed.family} file`,borrowed.family);warn('FONT_SUBSTITUTED',`fonts.${role}`,`${family?`“${family}”`:`The ${role} font`} has no font file, so drafts use ${borrowed.family}.`,`Upload the ${family||role} font file in the brandbook to use it.`);}
   else if(fallbackFonts.length){matches=fallbackFonts;resolvedFamily=String(fallbackFonts[0].metadata.family);fallback(`fonts.${role}`,'No brand font file; packaged draft font',resolvedFamily);warn('FONT_SUBSTITUTED',`fonts.${role}`,`${family?`“${family}”`:`The ${role} font`} has no font file, so drafts use ${resolvedFamily}.`,`Upload the ${family||role} font file in the brandbook to use it.`);}
   else {block('FONT_UNRESOLVED',`fonts.${role}`,`The ${role} font “${family||'unspecified'}” has no usable font file.`,`Upload ${family||'the brand font'} as TTF, OTF or WOFF2 in the brandbook.`);continue;}
  }
  const metadata=matches[0].metadata;
  fonts.push({role,family:resolvedFamily,files:matches.map(m=>({revisionId:m.id,sha256:m.sha256,objectKey:m.objectKey,weight:Number(m.metadata.weight)||400,style:m.metadata.style==='italic'?'italic':'normal'})),unitsPerEm:Number(metadata.unitsPerEm),glyphCoverage:[...new Set(matches.flatMap(m=>m.metadata.glyphCoverage as number[]))].sort((a,b)=>a-b),averageAdvance:Number(metadata.averageAdvance)||.52,averageAdvanceByScript:Object.assign({},...matches.map(m=>m.metadata.averageAdvanceByScript??{}))});
  for(const locale of kit.localeChecks.map(c=>c.locale)){const sample=/^(ru|uk|bg|sr|mk|be)(-|$)/i.test(locale)?'АЯая':'AZaz',coverage=fonts.at(-1)!.glyphCoverage;if([...sample].some(c=>!coverage.includes(c.codePointAt(0)!)))block('FONT_LOCALE_COVERAGE',`fonts.${role}.${locale}`,`${resolvedFamily} lacks required ${locale} script coverage.`,'Upload a font file with this alphabet in the brandbook.');}
 }
 const logoRules=rules.filter(r=>r.category==='logo'),logoIds=new Map(logoRules.filter(r=>r.provenance.kind==='material'&&r.provenance.sourceId).map(r=>[r.provenance.sourceId!,r.key]));
 const logos:BrandSystem['logos']=materials.filter(m=>m.state==='ready'&&logoIds.has(m.id)&&['image/svg+xml','image/png','image/jpeg','image/webp'].includes(m.mime)).map((m,i)=>({id:`logo${i}`,role:m.metadata.role==='icon'||/icon|symbol|mark$/i.test(logoIds.get(m.id)??'')&&!/wordmark/i.test(logoIds.get(m.id)??'')?'icon':'wordmark',revisionId:m.id,sha256:m.sha256,objectKey:m.objectKey,mime:m.mime as BrandSystem['logos'][number]['mime'],ground:['light','dark'].includes(String(m.metadata.ground))?m.metadata.ground as 'light'|'dark':'any',...logoSvg(m.metadata.svg),...(Array.isArray(m.metadata.viewBox)&&m.metadata.viewBox.length===4?{viewBox:m.metadata.viewBox as [number,number,number,number]}:{})}));
 logos.sort((a,b)=>(a.role==='wordmark'?0:1)-(b.role==='wordmark'?0:1)).forEach((l,i)=>l.id=`logo${i}`);
 if(!logos.length)warn('LOGO_FILE_REQUIRED','logos','No logo file was chosen, so drafts run without a logo.','Choose the SVG or PNG logo in the brandbook (Wordmark or Icon) to place it.');
 const colors=rules.filter(r=>r.category==='color'&&/^#[a-f\d]{6}([a-f\d]{2})?$/i.test(r.value)).map(r=>({id:r.key,hex:r.value.slice(0,7),roles:[] as BrandSystem['palette'][number]['roles']}));
 const seen=new Set<string>();for(const c of [...colors])if(seen.has(c.hex.toLowerCase()))colors.splice(colors.indexOf(c),1);else seen.add(c.hex.toLowerCase());
 if(!colors.length){fallback('palette','No brand colors were chosen; neutral draft colors',['#0b0b0b','#ffffff']);warn('PALETTE_REQUIRED','palette','No brand colors were chosen, so drafts use black and white.','Choose the brand colors in the brandbook.');colors.push({id:'paper',hex:'#0b0b0b',roles:[]},{id:'ink',hex:'#ffffff',roles:[]});}
 const byKey=(k:string)=>colors.find(c=>c.id===k);
 let field=byKey('paper')??[...colors].sort((a,b)=>luminance(a.hex)-luminance(b.hex))[0];
 let ink=byKey('ink')&&byKey('ink')!==field?byKey('ink')!:[...colors].filter(c=>c!==field).sort((a,b)=>contrastRatio(b.hex,field.hex)-contrastRatio(a.hex,field.hex))[0];
 if(!ink||contrastRatio(ink.hex,field.hex)<3){
  // Pick the strongest chosen pair; add a neutral only when no chosen pair is readable.
  const pairs=colors.flatMap(a=>colors.filter(b=>b!==a).map(b=>[a,b] as const)).sort((x,y)=>contrastRatio(y[0].hex,y[1].hex)-contrastRatio(x[0].hex,x[1].hex));
  if(pairs.length&&contrastRatio(pairs[0][0].hex,pairs[0][1].hex)>=3){[field,ink]=luminance(pairs[0][0].hex)<luminance(pairs[0][1].hex)?pairs[0]:[pairs[0][1],pairs[0][0]];fallback('palette.roles','Chosen ink and field were not readable; strongest chosen pair used',{field:field.hex,ink:ink.hex});}
  else {const base=field,neutral=luminance(base.hex)>.18?'#0b0b0b':'#ffffff';ink={id:'neutral',hex:neutral,roles:[]};colors.push(ink);fallback('palette.ink','No readable chosen pair; neutral text color added',neutral);warn('PALETTE_CONTRAST','palette',`No two chosen colors are readable together, so text uses ${neutral}.`,'Choose a light and a dark brand color in the brandbook.');}
 }
 const accent=byKey('accent')??[...colors].filter(c=>c!==field&&c!==ink).sort((a,b)=>saturation(b.hex)-saturation(a.hex))[0]??ink;
 field.roles.push('field','surface');ink.roles.push('ink');accent.roles.push('accent','cta');
 if(!byKey('paper')||!byKey('ink')||!byKey('accent'))fallback('palette.roles','Inferred by kit keys, luminance and contrast',{field:field.id,ink:ink.id,accent:accent.id});
 const contrastPairs=colors.flatMap(a=>colors.filter(b=>a!==b).map(b=>({ink:a.id,ground:b.id,ratio:contrastRatio(a.hex,b.hex)})));
 fallback('limits.safeZonesByPlacement','Placement safe-zone defaults as frame fractions; structured typography.limits may override', {vertical:{top:.10,right:.06,bottom:.18,left:.06},other:.05});
 const styles=Object.fromEntries(([['headline','headline',3.2,8,700],['subhead','headline',2.8,5.5,600],['body','body',2.4,4,400],['cta','body',2.6,4.5,700],['legal','body',1.6,2.4,400]] as const).map(([name,font,min,max,weight])=>[name,{font,sizeU:[min,max],weight,tracking:0,case:'none',lineHeight:1.16}])) as BrandSystem['styles'];
 fallback('styles','Role defaults; sizes are percent of short side',styles);
 for(const [name,style] of Object.entries(styles)){const font=fonts.find(f=>f.role===style.font);if(font&&!font.files.some(f=>f.weight===style.weight)){const nearest=[...font.files].sort((a,b)=>Math.abs(a.weight-style.weight)-Math.abs(b.weight-style.weight))[0];fallback(`styles.${name}.weight`,'Closest supplied font weight',nearest.weight);style.weight=nearest.weight;}}
 const motion:BrandSystem['motion']={durations:{fast:.25,medium:.5,slow:1},easing:[.22,1,.36,1],allowedCues:[...cueVocabulary],movingMax:2};
 const limits:BrandSystem['limits']={readingCps:15,hookWords:5,ctaWords:3,colorsMax:3,offerByS:1.5,minTextPxByPlacement:{},safeZonesByPlacement:{vertical:{top:.10,right:.06,bottom:.18,left:.06},portrait:{top:.05,right:.05,bottom:.05,left:.05},square:{top:.05,right:.05,bottom:.05,left:.05},wide:{top:.05,right:.05,bottom:.05,left:.05}}};
 // Structured rules override defaults; unstructured motion text remains in the accepted kit.
 for(const [category,key,target] of [['motion','motionSystem',motion],['typography','limits',limits]] as const){const raw=value(category,key);try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))Object.assign(target,parsed);else fallback(`${category}.${key}`,'Library defaults',target);}catch{fallback(`${category}.${key}`,'No structured settings; library defaults',target);}}
 let compositions:BrandSystem['compositions']=libraryCompositions(Object.fromEntries(colors.map(c=>[c.id,{hex:c.hex,roles:c.roles.map(r=>r==='ink'?'text':r)}])));
 try{const structured=JSON.parse(value('layout','compositions'));if(Array.isArray(structured)&&structured.length)compositions=structured;else fallback('compositions','Parameterized template library',compositions.map(c=>c.id));}catch{fallback('compositions','Parameterized template library',compositions.map(c=>c.id));}
 compositions=compositions.map(c=>({...c,zones:{legal:[.08,.955,.92,.99],...c.zones}}));
 const product={name:value('product','name'),immutables:[value('product','immutables')].filter(Boolean),media:kit.sourceAssetIds};
 if(!product.media.length)warn('PRODUCT_MEDIA_REQUIRED','product.media','No product photo or screenshot was supplied, so drafts use typography and generated imagery only.','Add product media in the questionnaire.');
 const parseRule=(key:string)=>{const raw=value('layout',key);if(!raw)return undefined;try{return JSON.parse(raw);}catch{return null;}};
 const graphics=resolveGraphics(colors,parseRule('graphicProposal'),parseRule('graphicVocabulary'));
 for(const message of graphics.warnings)warn('BRAND_GRAPHIC_INVALID','graphics',message,'Edit the campaign graphic rules to use supported vectors and palette colours.');
 const formats=['vertical','square','portrait','wide','9:16','1:1','4:5','16:9'];
 compositions.push({id:'brand_bottom_band',label:'Brand bottom band',technique:'panel',regions:[{id:'ground',area:'full',depth:[1,1],paints:['field','gradient']},{id:'band',area:'edge',side:'bottom',depth:[.32,.44],paints:['edge']}],zones:{hero:[.12,.15,.88,.52],text:[.08,.66,.92,.77],cta:[.08,.82,.82,.92],logo:[.08,.06,.4,.12],legal:[.08,.955,.92,.99]},formats,notes:'Brand field, accent edge band, measured CTA and reserved legal zone.'},{id:'brand_side_column',label:'Brand side column',technique:'split',regions:[{id:'ground',area:'full',depth:[1,1],paints:['field','gradient']},{id:'column',area:'edge',side:'right',depth:[.32,.44],paints:['edge']}],zones:{hero:[.08,.2,.52,.76],text:[.64,.2,.92,.42],cta:[.64,.65,.92,.82],logo:[.08,.06,.4,.12],legal:[.08,.955,.92,.99]},formats:['wide','16:9'],notes:'Product beside a brand accent column; legal zone preserved.'});
 const system=brandSystemSchema.parse({version:'brand@1',revisionId:revision.id,...graphics.vocabulary,fonts,logos,palette:colors,contrastPairs,styles,motion,limits,compositions,product,voice:{tone:value('voice','tone'),say:[value('voice','copyRules')].filter(Boolean),never:rules.filter(r=>r.category==='prohibition').map(r=>r.value)},imagery:{treatment:value('imagery','treatment')},prohibitions:rules.filter(r=>r.category==='prohibition').map(r=>r.value),fallbacks});
 return {system,fallbacks,readiness};
}
