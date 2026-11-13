// Chat-shaped plan C2 (second part, follow-up): builds and stores the compact brand sheet of a brand pack version
// (packages/brand/compact-sheet.ts) with the full sheet's data and assets (packages/brand/brand-sheet-data.ts) and
// the same offline headless browser, at a fixed page size, content-addressed as staging/brand-pack-sheet/<sha>.png.
// No model call. Stored once per version (migration 20261113000200); without it nothing is stored and runs keep the
// signature pictures in their prefix.
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {objectStore} from '../../packages/media/s3.server';
import {inlineSheetAssets,loadBrandSheetSource} from '../../packages/brand/brand-sheet-data';
import {COMPACT_PAGE,compactSheetPages,type CompactPageKey} from '../../packages/brand/compact-sheet';
import {packPictures,type StoredBrandPack} from '../../packages/brand/brand-pack-contents';
import {brandScopeOf} from '../../packages/brand/brand-pack-store';
import {renderFixedPage} from './brand-sheet';

export type CompactPage={page:CompactPageKey;sha256:string;objectKey:string;width:number;height:number};
type Deps={get?:(key:string)=>Promise<Buffer>;put?:(key:string,body:Buffer,mime:string)=>Promise<unknown>;render?:(html:string)=>Promise<Buffer>};
const sha256=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const rows=(data:unknown)=>((data??[]) as {page:CompactPageKey;sha256:string;object_key:string;width:number;height:number}[]).map(r=>({page:r.page,sha256:r.sha256,objectKey:r.object_key,width:r.width,height:r.height}));

/** The stored compact sheet of a version; null without the migration, [] before it is built. */
export async function storedCompactSheet(admin:SupabaseClient,packId:string):Promise<CompactPage[]|null>{
 const r=await admin.from('studio_brand_pack_sheets').select('page,sha256,object_key,width,height').eq('pack_id',packId).order('position');
 return r.error?null:rows(r.data);
}

/** Renders a version's compact pages and stores them (first write wins); returns the stored pages. */
export async function buildCompactSheet(admin:SupabaseClient,pack:Pick<StoredBrandPack,'signatures'|'catalogue'>&{id:string;tenant_id:string;campaign_id:string},deps:Deps={}):Promise<CompactPage[]>{
 const store=deps.get&&deps.put?null:objectStore(),get=deps.get??(async(key:string)=>Buffer.from((await store!.get(key)).body)),put=deps.put??((key:string,body:Buffer,mime:string)=>store!.putStaging(key,body,mime));
 const source=await loadBrandSheetSource(admin,pack.tenant_id,await brandScopeOf(admin,pack.campaign_id),get),assets=await inlineSheetAssets(source,get);
 const pictures=[];
 for(const p of packPictures(pack)){try{const bytes=await get(p.ref.objectKey);if(sha256(bytes)===p.ref.sha256)pictures.push({name:p.name,why:p.why,src:`data:image/jpeg;base64,${bytes.toString('base64')}`});}catch{/* left out */}}
 const pages:CompactPage[]=[];
 for(const {key,html} of compactSheetPages(source,assets,pictures)){
  const png=Buffer.from(await (deps.render??(h=>renderFixedPage(h,COMPACT_PAGE)))(html)),hash=sha256(png),objectKey=`staging/brand-pack-sheet/${hash}.png`;
  try{await put(objectKey,png,'image/png');}catch(error){if(!(error instanceof Error&&error.message==='Precondition'))throw error;}
  pages.push({page:key,sha256:hash,objectKey,width:COMPACT_PAGE.width,height:COMPACT_PAGE.height});
 }
 const r=await admin.rpc('studio_set_brand_pack_sheet',{target_pack:pack.id,pages});if(r.error)throw new Error(r.error.message);
 return rows(r.data);
}

/** The compact sheet a run context freezes: the stored one, else built now; null when it cannot be had. */
export async function compactSheetFor(admin:SupabaseClient,pack:StoredBrandPack,deps:Deps={}):Promise<CompactPage[]|null>{
 if(!pack.id||!pack.tenant_id||!pack.campaign_id)return null;
 const stored=await storedCompactSheet(admin,pack.id);if(stored===null)return null;if(stored.length)return stored;
 try{const built=await buildCompactSheet(admin,{...pack,id:pack.id,tenant_id:pack.tenant_id,campaign_id:pack.campaign_id},deps);return built.length?built:null;}
 catch(error){console.error('[brand-pack] the compact brand sheet could not be built:',error instanceof Error?error.message:error);return null;}
}

/** Runner tick: builds the compact sheet of the newest pack version that has none (an AD edit), one at a time. */
let lastSweep=0;const failed=new Set<string>();
export async function processCompactSheets(admin:SupabaseClient,now=Date.now()){
 if(now-lastSweep<30000)return false;lastSweep=now;
 const ready=await admin.rpc('studio_brand_pack_sheet_version');if(ready.error||ready.data!=='brand-pack-sheet@1')return false;
 const recent=await admin.from('studio_brand_packs').select('id,tenant_id,campaign_id,version,origin,character,signatures,catalogue,sheet').gte('created_at',new Date(now-86400000).toISOString()).order('created_at',{ascending:false}).limit(5);
 for(const pack of (recent.error?[]:recent.data??[]) as StoredBrandPack[]){const stored=await storedCompactSheet(admin,pack.id!);if(stored&&!stored.length&&!failed.has(pack.id!)){if(!await compactSheetFor(admin,pack))failed.add(pack.id!);return true;}}
 return false;
}
