import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import * as fontkit from 'fontkit';
import type {BrandSystem} from '../contracts/creative-drafts';
import {TextEngine} from '../engine/engine/textengine';
export async function creativeFontData(brand:BrandSystem,locale:string,read:(objectKey:string)=>Promise<Uint8Array>){
 const fonts:{key:string;data:Uint8Array}[]=[];
 for(const font of brand.fonts){const candidates=[];
  for(const file of font.files){const raw=await (file.objectKey.startsWith('fixtures/')?readFile(`public/${file.objectKey}`):read(file.objectKey));if(createHash('sha256').update(raw).digest('hex')!==file.sha256)throw new Error('FONT_HASH_MISMATCH');const parsed=fontkit.create(Buffer.from(raw));if('fonts' in parsed)throw new Error('FONT_COLLECTION_UNSUPPORTED');candidates.push({raw,file,coverage:parsed.characterSet});}
  const sample=/^(ru|uk|bg|sr|mk|be)(-|$)/i.test(locale)?'АЯая':'AZaz',selected=candidates.sort((a,b)=>sample.split('').filter(c=>b.coverage.includes(c.codePointAt(0)!)).length-sample.split('').filter(c=>a.coverage.includes(c.codePointAt(0)!)).length||Math.abs(a.file.weight-(font.role==='headline'?700:400))-Math.abs(b.file.weight-(font.role==='headline'?700:400)))[0];
  if(!selected)throw new Error('FONT_FILE_REQUIRED');
  for(const candidate of [selected,...candidates.filter(c=>c!==selected&&c.file.weight===selected.file.weight)]){let data=new Uint8Array(candidate.raw);const signature=Buffer.from(data.subarray(0,4)).toString('ascii');
   if(signature==='wOF2'){const {decompress}=await import('wawoff2');data=new Uint8Array(await decompress(data));}
   else if(signature==='wOFF')throw new Error('WOFF1_CONVERSION_REQUIRED');
   fonts.push({key:font.role,data});
  }

 }
 return fonts;
}

export async function loadCreativeFonts(brand:BrandSystem,locale:string,read:(key:string)=>Promise<Uint8Array>){return TextEngine.create(await creativeFontData(brand,locale,read));}
