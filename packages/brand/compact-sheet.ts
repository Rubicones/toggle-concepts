// Chat-shaped plan C2 (second part): the compact brand sheet. A few plain specimen pages (2–4, never more than 6) with
// only the brand's essentials: its logos on dark and on light, its palette, a type specimen in its own fonts, the
// signature pictures as a contact sheet, and its interface components when it has an interface. Like the full sheet
// (packages/brand/brand-sheet.ts) it is deliberately undesigned so agents do not copy it as a look. Every role of a
// run reads it in the shared prefix at a small fixed cost; the full sheet stays for the roles that design or judge.
// Pure: the same input gives the same HTML; the runner renders each page at a fixed size, without a model.
import {scriptSamples,typeTreatment,type BrandSheetInput,type SheetAssets} from './brand-sheet';

/** Every compact page is rendered at exactly this size (no slicing); requests carry it as a 1024 px JPEG. */
export const COMPACT_PAGE={width:1280,height:960} as const;
export const COMPACT_MAX_PAGES=6;
export type CompactPageKey='identity'|'type'|'pictures'|'interface';
export const compactPageLabels:Record<CompactPageKey,string>={identity:'Logo and colour',type:'Type',pictures:'Signature pictures',interface:'Interface'};
export type CompactPicture={name:string;why:string;src:string};

const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clip=(v:string,n:number)=>v.length<=n?v:v.slice(0,n-1)+'…';
const page=(key:CompactPageKey,title:string,body:string,head='')=>`<!doctype html><html><head><meta charset="utf-8"><title>${esc(compactPageLabels[key])}</title><style>
*{box-sizing:border-box}html,body{margin:0;background:#ECECEC;color:#2B2B2B;font:13px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;overflow:hidden}
main{width:${COMPACT_PAGE.width}px;height:${COMPACT_PAGE.height}px;padding:28px 36px;display:grid;gap:18px;align-content:start;overflow:hidden}
header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #C9C9C9;padding-bottom:8px}
h1{margin:0;font-size:18px;font-weight:600}h2{margin:0 0 8px;font-size:13px;font-weight:600;color:#444}.meta,.label{color:#6B6B6B;font-size:12px}
.row{display:grid;gap:12px}figure{margin:0;background:#F7F7F7;border:1px solid #D6D6D6;border-radius:6px;padding:8px;display:grid;gap:6px;min-width:0}
figure .box{display:grid;place-items:center;border-radius:4px;overflow:hidden}figure img{max-width:100%;max-height:100%;object-fit:contain}
figcaption{font-size:12px;color:#555;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.dark{background:#161616}.light{background:#FFFFFF}
.chip{height:64px;border-radius:4px;border:1px solid rgba(0,0,0,.12)}.empty{color:#6B6B6B}
</style>${head}</head><body><main><header><h1>${esc(title)}</h1><span class="meta">${esc(compactPageLabels[key])} · compact brand sheet</span></header>${body}</main></body></html>`;
const grid=(cols:number,items:string[],height:number)=>`<div class="row" style="grid-template-columns:repeat(${cols},1fr)">${items.map(i=>i.replace('class="box','style="height:'+height+'px" class="box')).join('')}</div>`;
const figure=(src:string,caption:string,ground='')=>`<figure><div class="box ${ground}"><img src="${esc(src)}" alt=""></div><figcaption>${esc(caption)}</figcaption></figure>`;
const swatch=(value:string,name:string)=>`<div><div class="chip" style="background:${esc(value)}"></div><span class="label">${esc(name)} ${esc(value)}</span></div>`;

function typeBlocks(input:BrandSheetInput,families:BrandSheetInput['card']['fonts'],big:number){
 const sample=scriptSamples(input.locales)[0].sample;
 return families.map(f=>{const t=typeTreatment(f.family,input.typographyRules),style=`font-family:'compact-${esc(f.family)}',system-ui;text-transform:${t.transform};${t.spacing?`letter-spacing:${t.spacing};`:''}`;
  const weights=[...new Set([f.weights[0],f.weights.at(-1)].filter((w):w is number=>typeof w==='number'))];
  return `<section><h2>${esc(f.family)} <span class="label">${esc(f.weights.join(', '))}</span></h2>${weights.map(w=>`<div style="${style}font-weight:${w};font-size:${big}px;line-height:1.1;white-space:nowrap;overflow:hidden">Aa Bb 0123</div><div style="${style}font-weight:${w};font-size:18px;white-space:nowrap;overflow:hidden">${esc(sample)}</div>`).join('')}</section>`;}).join('');
}

/** The compact pages of a brand, in a fixed order; empty sections are left out. At most COMPACT_MAX_PAGES. */
export function compactSheetPages(input:BrandSheetInput,assets:SheetAssets,pictures:CompactPicture[]):{key:CompactPageKey;html:string}[]{
 const {card}=input,title=card.name?.value??'Brand',out:{key:CompactPageKey;html:string}[]=[];
 const faces=card.fonts.flatMap(f=>f.files.map(file=>`@font-face{font-family:"compact-${esc(f.family)}";font-weight:${file.weight};font-style:${file.style};src:url("${esc(assets.file(file.id))}")}`)).join('');
 const logos=card.logos.slice(0,3).flatMap(l=>(['dark','light'] as const).map(g=>figure(assets.file(l.id,l.delegatesColour?g:undefined),`${l.file} · on ${g}`,g)));
 const roles={paper:'Background',ink:'Text',accent:'Accent'} as const;
 const colours=[...card.palette.map(p=>swatch(p.value,roles[p.role])),...card.interfaceColours.slice(0,5).map(c=>swatch(c.value,clip(c.label||'Interface',24)))];
 // One page for logo, colour and type when the brand has at most two families; type gets its own page otherwise.
 const together=card.fonts.length<=2,fonts=card.fonts.slice(0,4);
 const identity=`<section><h2>Logos</h2>${logos.length?grid(Math.min(6,logos.length),logos,together?150:260):'<p class="empty">No logo file.</p>'}</section>
<section><h2>Palette</h2>${colours.length?`<div class="row" style="grid-template-columns:repeat(8,1fr)">${colours.join('')}</div>`:'<p class="empty">No colour values found.</p>'}</section>
${together?(fonts.length?`<section><h2>Type</h2>${typeBlocks(input,fonts,48)}</section>`:'<p class="empty">No font files.</p>'):''}`;
 out.push({key:'identity',html:page('identity',title,identity,together?`<style>${faces}</style>`:'')});
 if(!together)out.push({key:'type',html:page('type',title,typeBlocks(input,fonts,56),`<style>${faces}</style>`)});
 if(pictures.length)out.push({key:'pictures',html:page('pictures',title,grid(3,pictures.slice(0,6).map(p=>figure(p.src,`${p.name} · ${clip(p.why,80)}`)),pictures.length>3?360:720))});
 const files=card.interfaceFiles.slice(0,6).map(f=>figure(assets.file(f.id),f.file)),components=card.components.slice(0,12).map(c=>`<li>${esc(clip(c.value,110))}</li>`).join('');
 if(files.length||components)out.push({key:'interface',html:page('interface',title,`${files.length?grid(3,files,components?260:360):''}${components?`<section><h2>Components</h2><ul style="columns:2;margin:0">${components}</ul></section>`:''}`)});
 return out.slice(0,COMPACT_MAX_PAGES);
}
