import {logoSvg} from '@/packages/brand/logo-svg';
import 'server-only';
import {studioContext,checked} from './studio';
import {ApiError} from './api';
import {resolveBrandSystem,type CreativeMaterial} from '@/packages/brand/resolve-system';
import type {BrandDraft} from '@/packages/contracts/brand-kit';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as fontkit from 'fontkit';
import {objectStore} from '@/packages/media/s3.server';
import {draftFonts} from '@/packages/creative/compiler';

const metadataCache=new Map<string,Promise<Record<string,unknown>>>();
export async function creativeBrand(campaignId:string,revision:{id:string;kit:BrandDraft}){
 const {admin,tenant}=await studioContext();
 const rows=checked(await admin.from('studio_brand_materials').select('id,sha256,mime,object_key,state,extraction').eq('tenant_id',tenant).eq('campaign_id',campaignId).eq('state','ready'))??[];
 const materials:CreativeMaterial[]=rows.map(m=>({id:m.id,sha256:m.sha256,mime:m.mime,objectKey:m.object_key,state:m.state,metadata:m.extraction?.metadata??{}}));
 for(const material of materials){
  if(material.metadata.family&&!material.metadata.unitsPerEm||material.mime==='image/svg+xml'&&!material.metadata.svg){
   let metrics=metadataCache.get(material.sha256);if(!metrics){metrics=(async()=>{const bytes=Buffer.from((await objectStore().get(material.objectKey)).body);if(createHash('sha256').update(bytes).digest('hex')!==material.sha256)throw new Error('BRAND_HASH_MISMATCH');
    if(material.mime==='image/svg+xml'){const match=bytes.toString('utf8').match(/viewBox\s*=\s*["']([^"']+)["']/i);return {...logoSvg(bytes.toString('utf8')),...(match?{viewBox:match[1].trim().split(/[\s,]+/).map(Number)}:{})};}
    const font=fontkit.create(bytes);if('fonts' in font)throw new Error('FONT_COLLECTION_UNSUPPORTED');return {container:bytes.subarray(0,4).toString('ascii'),unitsPerEm:font.unitsPerEm,glyphCoverage:font.characterSet,averageAdvance:font.layout('abcdefghijklmnopqrstuvwxyz').positions.reduce((sum,p)=>sum+p.xAdvance,0)/26/font.unitsPerEm,averageAdvanceByScript:Object.fromEntries([['latin','abcdefghijklmnopqrstuvwxyz'],['cyrillic','абвгдежзиклмнопрстуфхцчшщ']].filter(([,sample])=>[...sample].every(ch=>font.characterSet.includes(ch.codePointAt(0)!))).map(([script,sample])=>[script,font.layout(sample).positions.reduce((sum,p)=>sum+p.xAdvance,0)/[...sample].length/font.unitsPerEm])),weight:font['OS/2']?.usWeightClass??400};
   })();metadataCache.set(material.sha256,metrics);metrics.catch(()=>metadataCache.delete(material.sha256));}
   Object.assign(material.metadata,await metrics);
  }
 }
 const fallbackFonts:CreativeMaterial[]=[];
 { // Always available: the resolver records it as a visible substitution when a brand font file is missing.
  for(const asset of draftFonts){const bytes=await readFile(`public/${asset.objectKey}`);if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('FONT_HASH_MISMATCH');const font=fontkit.create(bytes);if('fonts' in font)continue;fallbackFonts.push({id:asset.revisionId,sha256:asset.sha256,mime:'font/woff2',objectKey:asset.objectKey,state:'ready',metadata:{family:'Noto Sans',unitsPerEm:font.unitsPerEm,glyphCoverage:font.characterSet,averageAdvance:.52,weight:400}});}
 }
 return resolveBrandSystem(revision,materials,fallbackFonts);
}
export async function requireCreativeReadiness(campaignId:string,revision:{id:string;kit:BrandDraft}){
 const result=await creativeBrand(campaignId,revision),blocking=result.readiness.filter(i=>i.severity==='block');
 if(blocking.length)throw new ApiError(409,'CREATIVE_NOT_READY',blocking.map(i=>`${i.message} ${i.fix}`).join(' '));
 return result;
}
