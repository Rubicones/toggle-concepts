import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {brandSheetLabels,brandSheetSections,type BrandSheetSection} from '@/packages/brand/brand-sheet';

export type BrandSheetView={
 /** false before migration 20261103000200 is applied */
 schemaReady:boolean;
 /** a brandbook was submitted, so a sheet can be built */
 submitted:boolean;
 state:'none'|'queued'|'building'|'ready'|'failed';
 /** the shown sheet was built from an earlier submission than the latest one */
 stale:boolean;
 error:string|null;builtAt:string|null;
 sections:{section:BrandSheetSection;label:string;images:{sha256:string;width:number;height:number}[]}[];
};
const missing=(e:{code?:string}|null)=>!!e&&['42P01','PGRST205','PGRST202'].includes(e.code??'');

/** The sheet the agents receive for this brand, and the state of its latest build. */
export async function brandSheetView(admin:SupabaseClient,tenant:string,scope:string):Promise<BrandSheetView>{
 const empty:BrandSheetView={schemaReady:true,submitted:false,state:'none',stale:false,error:null,builtAt:null,sections:[]};
 const builds=await admin.from('studio_brand_sheet_builds').select('submission_id,state,error_code,built_at,requested_at').eq('tenant_id',tenant).eq('campaign_id',scope).order('requested_at',{ascending:false}).limit(10);
 if(missing(builds.error))return {...empty,schemaReady:false};if(builds.error)throw new Error(builds.error.message);
 const head=await admin.from('studio_brandbook_heads').select('submission_id').eq('campaign_id',scope).maybeSingle(),headId=(head.data as {submission_id?:string}|null)?.submission_id??null;
 const rows=(builds.data??[]) as {submission_id:string;state:BrandSheetView['state'];error_code:string|null;built_at:string|null}[];
 const current=rows.find(r=>r.submission_id===headId)??rows[0],ready=rows.find(r=>r.state==='ready');
 if(!current)return {...empty,submitted:!!headId};
 const shown=current.state==='ready'?current:ready;
 const images=shown?await admin.from('studio_brand_sheets').select('section,position,slice,sha256,width,height').eq('submission_id',shown.submission_id).order('position').order('slice'):null;
 if(images?.error)throw new Error(images.error.message);
 const list=(images?.data??[]) as {section:BrandSheetSection;sha256:string;width:number;height:number}[];
 return {schemaReady:true,submitted:!!headId,state:current.state,stale:!!shown&&shown.submission_id!==headId,error:current.state==='failed'?current.error_code:null,builtAt:shown?.built_at??null,
  sections:brandSheetSections.map(section=>({section,label:brandSheetLabels[section],images:list.filter(i=>i.section===section).map(({sha256,width,height})=>({sha256,width,height}))})).filter(s=>s.images.length)};
}

/** Queue a build for the brand's latest submission; false when the migration is missing or nothing was submitted. */
export async function requestBrandSheet(admin:SupabaseClient,scope:string,actor:string){
 const result=await admin.rpc('studio_request_brand_sheet',{target_campaign:scope,acting_user:actor});
 if(result.error){if(missing(result.error)||/BRANDBOOK_NOT_SUBMITTED/.test(result.error.message))return false;throw new Error(result.error.message);}
 return true;
}

export type PinnedSheetPage={section:BrandSheetSection;slice:number;url:string;objectKey:string;sha256:string;width:number;height:number};
/** Pages the live critic receives (designer pipeline plan, point 1d): the first page of each section, at most four,
 * from the sheet of the brandbook submission the accepted kit was imported from. Empty when no sheet is ready. */
export async function pinnedBrandSheet(admin:SupabaseClient,tenant:string,kit:{brandbookImports?:{submissionId:string}[]},limit=4):Promise<PinnedSheetPage[]>{
 const submission=kit.brandbookImports?.at(-1)?.submissionId;if(!submission)return [];
 const build=await admin.from('studio_brand_sheet_builds').select('state').eq('tenant_id',tenant).eq('submission_id',submission).maybeSingle();
 if(build.error||(build.data as {state?:string}|null)?.state!=='ready')return [];
 const rows=await admin.from('studio_brand_sheets').select('section,slice,sha256,object_key,width,height').eq('submission_id',submission).eq('slice',0).order('position');
 if(rows.error)return [];
 return ((rows.data??[]) as {section:BrandSheetSection;slice:number;sha256:string;object_key:string;width:number;height:number}[]).slice(0,limit).map(r=>({section:r.section,slice:r.slice,url:`${r.sha256}.png`,objectKey:r.object_key,sha256:r.sha256,width:r.width,height:r.height}));
}
