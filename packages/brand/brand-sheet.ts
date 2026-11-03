// The brand sheet: the brand as images for the agents that design (designer pipeline plan, point 1). Each section is a
// plain specimen page (light grey, system-font labels, a fixed thumbnail grid) built only from the supplied files and
// the kit's own words. It is deliberately not a brand-like composition: agents would copy it. A model never redraws
// brand material; the runner renders these pages to PNG with headless Chromium.
import type {BrandCard} from './brand-card';

export const brandSheetSections=['logo-colour','typography','interface','product','rules'] as const;
export type BrandSheetSection=typeof brandSheetSections[number];
export const brandSheetLabels:Record<BrandSheetSection,string>={'logo-colour':'Logo & colour',typography:'Typography',interface:'Interface components',product:'Product & photography',rules:'Rules in use'};
/** Page width in CSS pixels; the runner splits taller pages into slices of at most SHEET_MAX_HEIGHT. */
export const SHEET_WIDTH=1280,SHEET_MAX_HEIGHT=1600;

export type SheetMaterial={id:string;filename:string;mime:string;role:string};
export type BrandSheetInput={
 card:BrandCard;
 materials:SheetMaterial[];
 /** Campaign locales, for one coverage sample line per script. */
 locales:string[];
 /** Accepted or found typography rule sentences (case, tracking), in the kit's own words. */
 typographyRules:string[];
};
/** How a file is referenced from the page: the route uses its asset URL, the runner a data URL. */
export type SheetAssets={file:(id:string,ground?:'dark'|'light')=>string};

const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clip=(v:string,n:number)=>v.length<=n?v:v.slice(0,n-1)+'…';
const image=(m:SheetMaterial)=>m.mime.startsWith('image/');

/** One sample line per writing system the campaign needs; Latin always. */
const SCRIPT_SAMPLES:{test:RegExp;script:string;sample:string}[]=[
 {test:/^(ru|uk|be|bg|sr|mk|kk|ky|mn|tg|tt|ba)(-|$)/i,script:'Cyrillic',sample:'Съешь ещё этих мягких булок 0123'},
 {test:/^(kk)(-|$)/i,script:'Kazakh',sample:'Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі'},
 {test:/^(tr|az)(-|$)/i,script:'Turkish',sample:'Ağaç İstanbul çığ şöyle ü'},
 {test:/^(pl|cs|sk|hu|ro|hr|sl|lt|lv|et)(-|$)/i,script:'Latin extended',sample:'Zażółć gęślą jaźń · Příliš žluťoučký · ăâîșț'},
 {test:/^(el)(-|$)/i,script:'Greek',sample:'Ξεσκεπάζω την ψυχοφθόρα βδελυγμία'},
 {test:/^(vi)(-|$)/i,script:'Vietnamese',sample:'Tiếng Việt có dấu: ằ ẩ ẫ ặ ố ồ ổ ỗ ộ'},
 {test:/^(ar|fa|ur)(-|$)/i,script:'Arabic',sample:'نص حكيم له سر قاطع وذو شأن عظيم'},
 {test:/^(he)(-|$)/i,script:'Hebrew',sample:'דג סקרן שט בים מאוכזב'},
 {test:/^(hi|mr|ne)(-|$)/i,script:'Devanagari',sample:'ऋषियों को सताने वाले दुष्ट राक्षसों'},
 {test:/^(ja)(-|$)/i,script:'Japanese',sample:'いろはにほへと 日本語の見本'},
 {test:/^(zh)(-|$)/i,script:'Chinese',sample:'我能吞下玻璃而不伤身体'},
 {test:/^(ko)(-|$)/i,script:'Korean',sample:'키스의 고유조건은 입술끼리'},
 {test:/^(th)(-|$)/i,script:'Thai',sample:'เป็นมนุษย์สุดประเสริฐเลิศคุณค่า'},
];
export function scriptSamples(locales:string[]){
 const out=[{script:'Latin',sample:'The quick brown fox jumps over the lazy dog 0123'}];
 for(const s of SCRIPT_SAMPLES)if(locales.some(l=>s.test.test(l))&&!out.some(o=>o.script===s.script))out.push({script:s.script,sample:s.sample});
 return out;
}

/** The kit's case and tracking rule for one family, read from its own sentences ("Archivo, all caps, +2% tracking"). */
export function typeTreatment(family:string,rules:string[]){
 const key=family.toLowerCase(),about=rules.filter(r=>r.toLowerCase().includes(key)),text=(about.length?about:rules.filter(r=>!/[A-Z][a-z]+ [A-Z]?[a-z]*\s*\(/.test(r))).join(' ').toLowerCase();
 const transform=/\b(all caps|upper ?case|capitals|caps only)\b/.test(text)?'uppercase':/\blower ?case\b/.test(text)?'lowercase':'none';
 const m=/(?:tracking|letter[- ]?spacing)[^0-9+\-−]{0,20}([+\-−]?\d+(?:\.\d+)?)\s*(em|%|px)?/.exec(text);
 let spacing:string|null=null;
 if(m){const n=Number(m[1].replace('−','-')),unit=m[2]??'';spacing=unit==='px'?`${n}px`:unit==='em'?`${n}em`:unit==='%'?`${n/100}em`:Math.abs(n)>=5?`${n/1000}em`:`${n/100}em`;}
 return {transform,spacing,source:about[0]??null};
}

const page=(section:BrandSheetSection,title:string,body:string,head='')=>`<!doctype html><html><head><meta charset="utf-8"><title>${esc(brandSheetLabels[section])}</title><style>
*{box-sizing:border-box}html,body{margin:0;background:#ECECEC;color:#2B2B2B;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{width:${SHEET_WIDTH}px;padding:40px 48px 48px;display:grid;gap:28px}
header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid #C9C9C9;padding-bottom:12px}
h1{margin:0;font-size:22px;font-weight:600}h2{margin:0 0 10px;font-size:15px;font-weight:600;color:#444}
.meta{color:#6B6B6B;font-size:13px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.grid.two{grid-template-columns:repeat(2,1fr)}
figure{margin:0;background:#F7F7F7;border:1px solid #D6D6D6;border-radius:6px;padding:10px;display:grid;gap:8px}
figure .box{height:220px;display:grid;place-items:center;border-radius:4px;overflow:hidden}figure img{max-width:100%;max-height:100%;object-fit:contain}
figcaption{font-size:12px;color:#555;word-break:break-word}.dark{background:#161616}.light{background:#FFFFFF}
.swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}.swatch{display:grid;gap:6px}.chip{height:88px;border-radius:4px;border:1px solid rgba(0,0,0,.12)}
.lines{display:grid;gap:6px}.line{display:grid;grid-template-columns:120px 1fr;gap:16px;align-items:baseline}.label{color:#6B6B6B;font-size:12px}
.rule{display:grid;grid-template-columns:1fr 260px;gap:16px;align-items:center;background:#F7F7F7;border:1px solid #D6D6D6;border-radius:6px;padding:12px 14px}
.rule .box{height:140px}.empty{color:#6B6B6B}
</style>${head}</head><body><main><header><h1>${esc(title)}</h1><span class="meta">${esc(brandSheetLabels[section])} · brand sheet</span></header>${body}</main></body></html>`;

const figure=(src:string,caption:string,ground='')=>`<figure><div class="box ${ground}"><img src="${esc(src)}" alt=""></div><figcaption>${esc(caption)}</figcaption></figure>`;
const empty=(text:string)=>`<p class="empty">${esc(text)}</p>`;

/** One section as a complete HTML page. Labels are the kit's own words: rule values, component names, file names. */
export function brandSheetHtml(section:BrandSheetSection,input:BrandSheetInput,assets:SheetAssets){
 const {card}=input,title=card.name?.value??'Brand';
 const byFile=new Map(input.materials.map(m=>[m.filename,m]));
 if(section==='logo-colour'){
  const logos=card.logos.flatMap(l=>(['dark','light'] as const).map(g=>figure(assets.file(l.id,l.delegatesColour?g:undefined),`${l.file} · on ${g}`,g)));
  const sw=(value:string,name:string,file:string)=>`<div class="swatch"><div class="chip" style="background:${esc(value)}"></div><div><strong>${esc(name)}</strong> ${esc(value)}<br><span class="label">${esc(file)}</span></div></div>`;
  const roles={paper:'Background',ink:'Text',accent:'Accent'} as const;
  return page(section,title,`<section><h2>Logos</h2>${logos.length?`<div class="grid">${logos.join('')}</div>`:empty('No logo file.')}</section>
<section><h2>Brand palette</h2>${card.palette.length?`<div class="swatches">${card.palette.map(p=>sw(p.value,roles[p.role],p.file)).join('')}</div>`:empty('No colour values found.')}</section>
<section><h2>Interface palette</h2>${card.interfaceColours.length?`<div class="swatches">${card.interfaceColours.map(c=>sw(c.value,c.label||'Interface',c.file)).join('')}</div>`:empty('No interface colours.')}</section>`);
 }
 if(section==='typography'){
  const samples=scriptSamples(input.locales);
  const faces=card.fonts.flatMap(f=>f.files.map(file=>`@font-face{font-family:"sheet-${esc(f.family)}";font-weight:${file.weight};font-style:${file.style};src:url("${esc(assets.file(file.id))}")}`)).join('');
  const blocks=card.fonts.map(f=>{const t=typeTreatment(f.family,input.typographyRules),style=`font-family:'sheet-${esc(f.family)}',system-ui;text-transform:${t.transform};${t.spacing?`letter-spacing:${t.spacing};`:''}`;
   const sizes=f.weights.map(w=>`<div class="lines"><span class="label">${esc(f.family)} ${w}</span>${[96,48,24,14].map(px=>`<div class="line"><span class="label">${px} px</span><div style="${style}font-weight:${w};font-size:${px}px;line-height:1.15;white-space:nowrap;overflow:hidden">${esc(px>=48?'Aa Bb 0123':samples[0].sample)}</div></div>`).join('')}</div>`).join('');
   const coverage=samples.map(s=>`<div class="line"><span class="label">${esc(s.script)}</span><div style="${style}font-weight:${f.weights[0]??400};font-size:24px">${esc(s.sample)}</div></div>`).join('');
   return `<section><h2>${esc(f.family)}</h2>${t.source?`<p class="label">${esc(clip(t.source,200))}</p>`:''}${sizes}<div class="lines" style="margin-top:12px"><span class="label">Letters the campaign needs (a letter in another font means the family lacks it)</span>${coverage}</div></section>`;}).join('');
  return page(section,title,card.fonts.length?blocks:empty('No font files.'),`<style>${faces}</style>`);
 }
 if(section==='interface'){
  const names=(file:string)=>card.components.filter(c=>c.file===file).map(c=>clip(c.value,90));
  const files=card.interfaceFiles.map(f=>{const n=names(f.file);return figure(assets.file(f.id),`${f.file}${n.length?' · '+n.join(' · '):''}`);});
  const loose=card.components.filter(c=>!card.interfaceFiles.some(f=>f.file===c.file)).map(c=>`<li>${esc(clip(c.value,160))}</li>`).join('');
  return page(section,title,`${files.length?`<div class="grid">${files.join('')}</div>`:empty('No UI kit files or screenshots.')}${loose?`<section><h2>Components named in the guidelines</h2><ul>${loose}</ul></section>`:''}`);
 }
 if(section==='product'){
  const files=input.materials.filter(m=>image(m)&&['photo','reference','screenshot','unknown'].includes(m.role)).map(m=>figure(assets.file(m.id),m.filename));
  return page(section,title,`${card.product?`<p>${esc(clip(card.product.value,400))}</p>`:''}${files.length?`<div class="grid">${files.join('')}</div>`:empty('No product photos, screenshots or imagery references.')}`);
 }
 const rules=[...card.rules,...card.vocabulary].map(r=>{const m=byFile.get(r.file);const example=m&&image(m)?`<div class="box"><img src="${esc(assets.file(m.id))}" alt=""></div>`:'<div></div>';return `<div class="rule"><div>${esc(clip(r.value,240))}<br><span class="label">${esc(r.file)}</span></div>${example}</div>`;});
 return page(section,title,rules.length?`<div class="lines" style="gap:12px">${rules.join('')}</div>`:empty('No rules found.'));
}
