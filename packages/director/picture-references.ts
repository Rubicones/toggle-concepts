// Live run 5: the designer asked for a generated photograph with the brand's own object in it, naming the supplied
// mark as a reference, and the request was refused (the mark is a brand file, not a campaign upload). In version 6 a
// picture may take, as references, the client's supplied files and the brand's own pictures that draft code may draw
// (its marks and the kit pictures marked "Use this"), at most three in all. Pure.
import {assetNames} from './asset-names';
import {drawableReferences} from './material-memory';
import type {DirectionInput} from './types';

export const MAX_PICTURE_REFERENCES=3;
export type BrandName={name:string;url:string};
/** The brand files a picture may name: each by its url, by its place in brand.ts, and by its catalogue name. */
export function brandReferenceNames(input:Pick<DirectionInput,'brand'>,catalogue:{name:string;materialId?:string}[]=[]):BrandName[]{
 const out:BrandName[]=[],add=(name:string|undefined,url:string)=>{if(name&&!out.some(o=>o.name===name))out.push({name,url});};
 input.brand.logos.forEach((l,i)=>{add(l.url,l.url);add(`brand.logos[${i}]`,l.url);add(catalogue.find(e=>e.materialId===l.id)?.name,l.url);});
 const drawable=new Set(drawableReferences(input).map(r=>r.id));
 input.brand.references.forEach((r,i)=>{if(!drawable.has(r.id)||!/\.(png|jpe?g|webp|svg)$/i.test(r.url))return;add(r.url,r.url);add(`brand.references[${i}]`,r.url);add(catalogue.find(e=>e.materialId===r.id)?.name,r.url);});
 return out;
}
export type SplitReferences={assetIds:string[];brandUrls:string[];/** why the picture cannot be asked for as written; empty when it can */problems:string[]};
/** References as the designer wrote them → supplied file ids and brand file urls; anything else is named with its reason. */
export function splitPictureReferences(refs:string[],input:Pick<DirectionInput,'assets'|'brief'|'brand'>,brand:BrandName[]):SplitReferences{
 const names=assetNames(input),assetIds:string[]=[],brandUrls:string[]=[],problems:string[]=[];
 for(const raw of refs){const ref=raw.trim().replace(/^['"`]|['"`]$/g,''),asset=names.find(n=>n.name===ref||n.id===ref),own=brand.find(b=>b.name===ref);
  if(asset){if(!asset.mime.startsWith('image/'))problems.push(`"${ref}" is not a picture file`);else if(!assetIds.includes(asset.id))assetIds.push(asset.id);}
  else if(own){if(!brandUrls.includes(own.url))brandUrls.push(own.url);}
  else problems.push(`"${ref}" is not a file a picture may take as a reference`);}
 if(assetIds.length+brandUrls.length>MAX_PICTURE_REFERENCES)problems.push(`a picture takes at most ${MAX_PICTURE_REFERENCES} references and this one names ${assetIds.length+brandUrls.length}`);
 return {assetIds,brandUrls,problems};
}
/** What the designer reads when a picture was not asked for because of its references; the picture is not counted. */
export const referenceRefusal=(purpose:string,problems:string[])=>`No picture was asked for (${purpose.slice(0,80)}) and none was counted: ${problems.join('; ')}. A reference is a supplied file or one of the brand's pictures marked "use it", by the name or url given in your context.`;
/** Version 6, the hero task: what a picture may take as a reference. */
export const PICTURE_REFERENCES_DESIGNER=`A picture may take up to ${MAX_PICTURE_REFERENCES} references: the supplied files and the brand's own pictures marked "use it", named as they are named in your context. Name one when the generated picture must contain that real object.`;
