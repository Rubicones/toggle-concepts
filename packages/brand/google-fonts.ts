/**
 * Brand fonts from Google Fonts (all open-licensed). When the Brand Kit names a family and the supplied files lack its
 * weights, the application downloads that family's weights once at draft start and pins them by hash; the draft
 * sandbox itself stays offline. The application never chooses a font: it only completes the one the brand names.
 */
import type {BrandDraft} from '../contracts/brand-kit';
import {normalizeFontFamily,fontFamilyOf} from './normalize';

const GENERIC=new Set(['sans-serif','serif','monospace','system-ui','cursive','fantasy','inherit','arial','helvetica','helvetica neue','times','times new roman','georgia','verdana','sf pro','san francisco','-apple-system']);
/** Comparison key: style words in a file's family name ("Archivo SemiBold") do not make another family. */
export const normalizeFamily=(name:string)=>normalizeFontFamily(name).toLowerCase().replace(/[^a-z0-9]/g,'');
export const GOOGLE_FONT_WEIGHTS=[100,200,300,400,500,600,700,800,900] as const;

/** Family names the accepted Brand Kit typography rules and supplied font files name ("Schibsted Grotesk (OFL, …)" → "Schibsted Grotesk"). */
export function brandFontFamilies(kit:Pick<BrandDraft,'rules'>,materials:{objectKey?:string;metadata:Record<string,unknown>}[]=[]){
 const out:string[]=[],add=(raw:string)=>{
  const name=(fontFamilyOf(raw)??normalizeFontFamily(raw.split(/[(,;/\n]/)[0].replace(/["'«»“”]/g,'').trim())).trim();
  if(name.length<2||name.length>60||!/^[\p{L}\p{N} .-]+$/u.test(name)||GENERIC.has(name.toLowerCase()))return;
  if(!out.some(n=>normalizeFamily(n)===normalizeFamily(name)))out.push(name);
 };
 for(const r of kit.rules)if(r.decision==='accepted'&&r.category==='typography'&&/family$/i.test(r.key))add(String(r.value));
 for(const m of materials)if(!String(m.objectKey??'').startsWith('fixtures/')&&typeof m.metadata?.family==='string')add(String(m.metadata.family));
 return out;
}

/** Weights in 100..900 that the supplied non-italic files of this family do not yet cover. */
export function missingFamilyWeights(family:string,materials:{metadata:Record<string,unknown>}[]){
 const own=materials.filter(m=>typeof m.metadata.family==='string'&&normalizeFamily(String(m.metadata.family))===normalizeFamily(family)&&m.metadata.style!=='italic');
 const covered=(w:number)=>own.some(m=>{
  const r=m.metadata.weightRange;
  if(Array.isArray(r)&&r.length===2&&Number.isFinite(Number(r[0]))&&Number.isFinite(Number(r[1])))return w>=Number(r[0])&&w<=Number(r[1]);
  return (Number(m.metadata.weight)||400)===w;
 });
 return GOOGLE_FONT_WEIGHTS.filter(w=>!covered(w));
}

/** True when the supplied files of this family do not cover every standard weight (100..900). */
export function familyNeedsWeights(family:string,materials:{metadata:Record<string,unknown>}[]){
 return missingFamilyWeights(family,materials).length>0;
}

/** Letters each campaign language needs beyond basic Latin (lower and upper case are both checked). */
const LOCALE_LETTERS:Record<string,string>={
 ru:'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',uk:'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя',be:'абвгдеёжзійклмнопрстуўфхцчшыьэюя',bg:'абвгдежзийклмнопрстуфхцчшщъьюя',sr:'абвгдђежзијклљмнњопрстћуфхцчџш',mk:'абвгдѓежзѕијклљмнњопрстќуфхцчџш',
 kk:'аәбвгғдеёжзийкқлмнңоөпрстуұүфхһцчшщъыіьэюя',ky:'абвгдеёжзийклмңнооөпрстуүфхцчшщъыьэюя',mn:'абвгдеёжзийклмноөпрстуүфхцчшщъыьэюя',
 tr:'çğıiöşü',az:'çəğıiöşü',pl:'ąćęłńóśźż',cs:'áčďéěíňóřšťúůýž',sk:'áäčďéíĺľňóôŕšťúýž',hu:'áéíóöőúüű',ro:'ăâîșț',de:'äöüß',fr:'àâæçéèêëîïôœùûüÿ',es:'áéíñóúü¿¡',pt:'ãõçáâêéíóôú',it:'àèéìòù',
 nl:'ëï',sv:'åäö',da:'æøå',nb:'æøå',no:'æøå',fi:'äö',is:'áðéíóúýþæö',lt:'ąčęėįšųūž',lv:'āčēģīķļņšūž',et:'äöõüšž',hr:'čćđšž',sl:'čšž',el:'αβγδεζηθικλμνξοπρστυφχψωάέήίόύώ',vi:'ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ',
};
/** The letters a campaign's locales need from its brand fonts ("kk-KZ" → Kazakh Cyrillic, "tr-TR" → ç ğ ı ö ş ü). */
export function localeLetters(locales:readonly string[]){
 const set=new Set<string>();
 for(const locale of locales){const letters=LOCALE_LETTERS[locale.toLowerCase().split(/[-_]/)[0]]??'';for(const ch of letters){set.add(ch);set.add(ch.toLocaleUpperCase(locale));}}
 // "ı" upper-cases to "I" and "ß" to "SS": keep single letters only.
 return [...set].filter(ch=>[...ch].length===1).join('');
}
/** True when no supplied file of this family has every letter the campaign's locales need. */
export function familyMissesLetters(family:string,materials:{metadata:Record<string,unknown>}[],letters:string){
 if(!letters)return false;
 const own=materials.filter(m=>typeof m.metadata.family==='string'&&normalizeFamily(String(m.metadata.family))===normalizeFamily(family)&&Array.isArray(m.metadata.glyphCoverage));
 if(!own.length)return false;
 const need=[...letters].map(ch=>ch.codePointAt(0)!);
 return !own.some(m=>{const have=new Set(m.metadata.glyphCoverage as number[]);return need.every(n=>have.has(n));});
}

export const googleFontCssUrl=(family:string,weight:number)=>`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g,'+')}:wght@${weight}`;

/** Reads a css2 response. Only a single, unsplit file per weight is usable (the draft loader has no unicode-range). */
export function parseGoogleFontCss(css:string){
 const blocks=[...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(m=>m[1]);
 if(blocks.length!==1)return null;
 const block=blocks[0],src=block.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?([a-z0-9]+)['"]?\)/i);
 if(!src||/unicode-range/i.test(block))return null;
 const url=src[1].replace(/["']/g,'').trim();
 if(!/^https:\/\/fonts\.gstatic\.com\/[\w/.-]+$/.test(url))return null;
 return {url,format:src[2].toLowerCase(),weight:Number(block.match(/font-weight:\s*(\d+)/)?.[1]??0),style:block.match(/font-style:\s*(\w+)/)?.[1]??'normal'};
}
