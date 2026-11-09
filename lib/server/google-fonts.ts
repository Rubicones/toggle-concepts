import {createHash} from 'node:crypto';
import * as fontkit from 'fontkit';
import {objectStore} from '@/packages/media/s3.server';
import type {BrandDraft} from '@/packages/contracts/brand-kit';
import type {BrandMaterial} from '@/packages/director/inputs';
import {fontMetadata} from '@/packages/brand/font-metadata';
import {normalizeFontFamily} from '@/packages/brand/normalize';
import {brandFontFamilies,familyMissesLetters,missingFamilyWeights,googleFontCssUrl,parseGoogleFontCss,normalizeFamily,GOOGLE_FONT_WEIGHTS} from '@/packages/brand/google-fonts';

const MAX_FONT_BYTES=3*1024*1024;
type Fetch=typeof fetch;
type Store={putStaging:(key:string,body:Buffer,mime:string)=>Promise<unknown>;head:(key:string)=>Promise<unknown>};

/**
 * Completes the brand's named fonts from Google Fonts before a draft starts (see packages/brand/google-fonts.ts).
 * Any failure (offline, family not on Google Fonts, unexpected response) leaves the materials unchanged.
 */
/** `letters`: what the campaign's locales need (localeLetters). When supplied files lack them, Google's full file (every script the family supports) is added: the browser combines faces of one family, so the missing letters come from it while shared letters keep a fixed order (apps/local-runner/director/workspace.ts adds faces in list order). */
export async function googleFontMaterials(kit:Pick<BrandDraft,'rules'>,materials:BrandMaterial[],id:(seed:unknown)=>string,deps:{fetch?:Fetch;store?:Store}={},letters=''){
 const get=deps.fetch??fetch,added:BrandMaterial[]=[],notes:string[]=[];
 for(const family of brandFontFamilies(kit,materials)){
  const needed=familyMissesLetters(family,materials,letters)?[...GOOGLE_FONT_WEIGHTS]:missingFamilyWeights(family,materials);
  if(!needed.length)continue;
  const canonicalFamily=normalizeFontFamily(family),wanted=normalizeFamily(canonicalFamily);
  const found=await Promise.all(needed.map(async weight=>{
   try{
    const css=await get(googleFontCssUrl(canonicalFamily,weight),{headers:{'User-Agent':'curl/8.4.0'},signal:AbortSignal.timeout(8000)});if(!css.ok)return null;
    const face=parseGoogleFontCss(await css.text());if(!face||face.style!=='normal')return null;
    const file=await get(face.url,{signal:AbortSignal.timeout(15000)});if(!file.ok)return null;
    const bytes=Buffer.from(await file.arrayBuffer());if(bytes.length>MAX_FONT_BYTES)return null;
    const font=fontkit.create(bytes);if('fonts' in font)return null;
    const metadata=fontMetadata(font as Parameters<typeof fontMetadata>[0],bytes),actual=normalizeFamily(String(metadata.family));
    if(!wanted||(actual!==wanted&&!actual.startsWith(wanted))||metadata.style!=='normal')return null;
    return {bytes,metadata:{...metadata,family:canonicalFamily,weight:face.weight||weight,source:'google-fonts'}};
   }catch{return null;}
  }));
  const files=found.filter((f):f is NonNullable<typeof f>=>!!f).filter((f,i,all)=>all.findIndex(x=>x.metadata.weight===f.metadata.weight)===i);
  if(!files.length){notes.push(`${canonicalFamily}: not available from Google Fonts here; supplied files are used as they are.`);continue;}
  for(const f of files){
   const sha256=createHash('sha256').update(f.bytes).digest('hex'),container=String(f.metadata.container),ext=container==='wOF2'?'woff2':container==='wOFF'?'woff':container==='OTTO'?'otf':'ttf',mime=ext==='ttf'?'font/ttf':`font/${ext}`,objectKey=`staging/google-fonts/${sha256}.${ext}`;
   const store=deps.store??objectStore();
   try{await store.putStaging(objectKey,f.bytes,mime);}catch(error){try{await store.head(objectKey);}catch{throw error;}}
   added.push({id:id({googleFont:sha256}),filename:`${canonicalFamily.replace(/\s+/g,'')}-${f.metadata.weight}.${ext}`,mime,sha256,objectKey,metadata:f.metadata});
  }
  notes.push(`${canonicalFamily}: ${files.map(f=>f.metadata.weight).join(', ')} from Google Fonts.`);
 }
 return {materials:added,notes};
}
