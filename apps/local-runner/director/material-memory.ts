import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as fontkit from 'fontkit';
import {createMaterialMemory,type MaterialRecord} from '../../../packages/director/material-memory';
import type {DirectionInput} from '../../../packages/director/types';

/** Actual bytes, not filename extensions or model assertions, define font capabilities. */
export function inspectMaterialFont(bytes:Uint8Array):NonNullable<MaterialRecord['font']>&{coverage:number[]}{
 const parsed=fontkit.create(Buffer.from(bytes));if('fonts' in parsed)throw new Error('FONT_COLLECTION_UNSUPPORTED');
 const axis=parsed.variationAxes?.wght,weight=parsed['OS/2']?.usWeightClass??400;
 return {family:parsed.familyName,weights:[weight],...(axis?{range:[axis.min,axis.max] as [number,number]}:{}),style:/italic/i.test(parsed.subfamilyName)?'italic':'normal',coverage:parsed.characterSet};
}

/** No provider calls. Cache technical observations by the hash of verified source bytes. */
export async function prepareMaterialMemory(folder:string,input:DirectionInput){
 const memory=createMaterialMemory(input),dir=resolve(folder,'.reports','materials');await mkdir(dir,{recursive:true});
 for(const material of memory.materials.filter(m=>m.role==='font')){
  if(!/^[\w.-]+$/.test(material.url))throw new Error('RESOURCE_PATH_REJECTED');
  const bytes=await readFile(resolve(folder,'public',material.url)),sha=createHash('sha256').update(bytes).digest('hex');
  if(material.sha256&&material.sha256!==sha)throw new Error('RESOURCE_BYTES_CHANGED');material.sha256=sha;
  const cache=resolve(dir,`${sha}.json`);let font:ReturnType<typeof inspectMaterialFont>;
  try{const saved=JSON.parse(await readFile(cache,'utf8')),f=saved.font;if(saved.version!==1||saved.sha256!==sha||typeof f?.family!=='string'||!Array.isArray(f.weights)||!f.weights.length||!f.weights.every(Number.isFinite)||!Array.isArray(f.coverage)||!f.coverage.every(Number.isInteger))throw new Error('STALE_FONT_MEMORY');font=f;}
  catch{font=inspectMaterialFont(bytes);await writeFile(cache+'.tmp',JSON.stringify({version:1,sha256:sha,font}));await rename(cache+'.tmp',cache);}
  // Full glyph tables belong only to the local hash cache, never to source snapshots or prompts.
  material.font={family:font.family,weights:font.weights,range:font.range,style:font.style};
  const requested=[...new Set(Object.values(input.brand.tokens).filter((v):v is string=>typeof v==='string').flatMap(v=>[...v.matchAll(/weight\s*[:=]\s*(\d{3})\b/gi)].map(m=>Number(m[1]))))];
  for(const weight of requested)if(!font.weights.includes(weight)&&!(font.range&&weight>=font.range[0]&&weight<=font.range[1]))material.issues.push(`This file does not supply weight ${weight}; do not claim synthetic bold is the supplied brand weight.`);
  const sample=Object.values(input.variantFacts??{}).flatMap(f=>Object.values(f.sceneCopy).flat()).join(''),coverage=new Set(font.coverage),missing=[...new Set([...sample].filter(c=>!/[\s\u200b-\u200f\ufeff]/.test(c)&&!coverage.has(c.codePointAt(0)!)))];
  if(missing.length)material.issues.push(`This file lacks ${missing.length} distinct copy characters; use the supplied compatible fallback where needed.`);
 }
 memory.revision=createHash('sha256').update(JSON.stringify({...memory,revision:''})).digest('hex');
 await writeFile(resolve(dir,'memory.json.tmp'),JSON.stringify(memory));await rename(resolve(dir,'memory.json.tmp'),resolve(dir,'memory.json'));return memory;
}
