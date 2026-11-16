// Chat-shaped plan C4: supplied files by the names the AD uploaded them under, for model-facing text; the app maps a
// name back to its id when the designer refers to it. Ids and hashes inside a file name are left out of the name. Shared by the digest and the turn reader.
import type {DirectionInput} from './types';

export function assetNames(input:Pick<DirectionInput,'assets'|'brief'>){
 const meta=Array.isArray(input.brief.suppliedAssetMetadata)?input.brief.suppliedAssetMetadata as {id?:string;name?:string}[]:[],used=new Set<string>();
 return input.assets.map((a,i)=>{const base=(meta.find(m=>m.id===a.id)?.name??'').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,}/gi,'').replace(/[-_ ]{2,}/g,'-').replace(/^[-_ ]+|[-_ ]+(?=\.[a-z0-9]+$)/gi,'').replace(/\s+/g,' ').trim().slice(0,80).replace(/^\.?[a-z0-9]{0,5}$/i,m=>m?`file ${i+1}${m.startsWith('.')?m:''}`:`file ${i+1}`)||`file ${i+1}`;let name=base;for(let n=2;used.has(name);n++)name=`${base} (${n})`;used.add(name);return {id:a.id,name,mime:a.mime};});
}
/** References as written (names or ids) → ids; an unknown name stays as written (the reader refuses it). */
export function resolveAssetReferences(refs:string[],input:Pick<DirectionInput,'assets'|'brief'>){const names=assetNames(input);return refs.map(r=>names.find(n=>n.name===r)?.id??r);}
