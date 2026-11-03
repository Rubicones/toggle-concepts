/**
 * Brand fonts from Google Fonts (all open-licensed). When the Brand Kit names a family and the supplied files lack its
 * weights, the application downloads that family's weights once at draft start and pins them by hash; the draft
 * sandbox itself stays offline. The application never chooses a font: it only completes the one the brand names.
 */
import type {BrandDraft} from '../contracts/brand-kit';
import {normalizeFontFamily} from './normalize';

const GENERIC=new Set(['sans-serif','serif','monospace','system-ui','cursive','fantasy','inherit','arial','helvetica','helvetica neue','times','times new roman','georgia','verdana','sf pro','san francisco','-apple-system']);
/** Comparison key: style words in a file's family name ("Archivo SemiBold") do not make another family. */
export const normalizeFamily=(name:string)=>normalizeFontFamily(name).toLowerCase().replace(/[^a-z0-9]/g,'');
export const GOOGLE_FONT_WEIGHTS=[100,200,300,400,500,600,700,800,900] as const;

/** Family names the accepted Brand Kit typography rules name first ("Schibsted Grotesk (OFL, …)" → "Schibsted Grotesk"). */
export function brandFontFamilies(kit:Pick<BrandDraft,'rules'>){
 const out:string[]=[];
 for(const r of kit.rules){
  if(r.decision!=='accepted'||r.category!=='typography'||!/family$/i.test(r.key))continue;
  const name=String(r.value).split(/[(,;/\n]/)[0].replace(/["'«»“”]/g,'').trim();
  if(name.length<2||name.length>60||!/^[\p{L}\p{N} .-]+$/u.test(name)||GENERIC.has(name.toLowerCase()))continue;
  if(!out.some(n=>normalizeFamily(n)===normalizeFamily(name)))out.push(name);
 }
 return out;
}

/** True when the supplied files of this family cannot render both regular and bold text (no variable axis, no bold file). */
export function familyNeedsWeights(family:string,materials:{metadata:Record<string,unknown>}[]){
 const own=materials.filter(m=>typeof m.metadata.family==='string'&&normalizeFamily(String(m.metadata.family))===normalizeFamily(family)&&m.metadata.style!=='italic');
 if(own.some(m=>Array.isArray(m.metadata.weightRange)))return false;
 const weights=own.map(m=>Number(m.metadata.weight)||400);
 return !(weights.some(w=>w<=500)&&weights.some(w=>w>=700));
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
