// Read-only, full JSON export of how this campaign's brandbook was read: uploaded materials and their extraction, the
// analysis runs, the parts each request read, the agent steps, every finding with its review, the submitted brandbook,
// the A1 working kit and the latest brand revision. For debugging brandbook parsing; it never changes anything.
import {z} from 'zod';
import {api,ApiError} from '@/lib/server/api';
import {campaignRecord,studioContext,checked} from '@/lib/server/studio';
import {schemaMissing} from '@/lib/server/brief';

const PAGE=1000,PROMPT_PREVIEW=4000;
type Query={range:(from:number,to:number)=>PromiseLike<{data:unknown[]|null;error:{code?:string;message:string}|null}>};
async function all<T>(query:()=>Query):Promise<T[]>{
 const rows:T[]=[];
 for(let offset=0;;offset+=PAGE){const page=await query().range(offset,offset+PAGE-1);if(page.error){if(schemaMissing(page.error))return rows;throw new ApiError(500,'BRAND_EXPORT_FAILED',page.error.message);}rows.push(...(page.data??[]) as T[]);if((page.data?.length??0)<PAGE)return rows;}
}
const chunks=<T,>(items:T[],size=200)=>Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));

export async function GET(_:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/brand-export'>){return api(async()=>{
 const campaign=await campaignRecord(z.uuid().parse((await ctx.params).id)),{admin,tenant}=await studioContext(),id=campaign.id;
 const materials=await all<Record<string,unknown>>(()=>admin.from('studio_brand_materials').select('id,filename,relative_path,mime,bytes,sha256,state,included,attempts,error_code,extraction,extraction_sha,created_at').eq('tenant_id',tenant).eq('campaign_id',id).order('created_at'));
 const analyses=await all<{id:string}>(()=>admin.from('studio_brand_analyses').select('*').eq('tenant_id',tenant).eq('campaign_id',id).order('created_at'));
 const fileReads:{id:string}[]=[];for(const group of chunks(analyses.map(a=>a.id)))fileReads.push(...await all<{id:string}>(()=>admin.from('studio_brand_file_reads').select('*').in('analysis_id',group).order('position')));
 const readParts:{step_id:string|null}[]=[];for(const group of chunks(fileReads.map(f=>f.id)))readParts.push(...await all<{step_id:string|null}>(()=>admin.from('studio_brand_read_parts').select('id,file_id,sort_key,page_no,status,step_id,blocker,payload').in('file_id',group).order('sort_key')));
 const findings=await all<{step_id:string}>(()=>admin.from('studio_brand_findings').select('id,seq,material_id,source_sha,part_id,step_id,field,value,locator,evidence,decision,edited_value,version,created_at').eq('tenant_id',tenant).eq('campaign_id',id).order('seq'));
 const stepIds=[...new Set([...readParts.map(p=>p.step_id),...findings.map(f=>f.step_id)].filter((s):s is string=>!!s))];
 const steps:Record<string,unknown>[]=[];for(const group of chunks(stepIds))steps.push(...await all<Record<string,unknown>>(()=>admin.from('studio_agent_steps').select('id,role,model_id,status,error_code,cost_micro_usd,usage,output,prompt,created_at').in('id',group).order('created_at')));
 const submissions=await all<{id:string}>(()=>admin.from('studio_brandbook_submissions').select('*').eq('tenant_id',tenant).eq('campaign_id',id).order('version_no',{ascending:false}));
 const latest=submissions[0],items=latest?await all<Record<string,unknown>>(()=>admin.from('studio_brandbook_submission_items').select('source_finding_id,source_seq,payload').eq('submission_id',latest.id).order('source_seq')):[];
 const draft=checked(await admin.from('studio_brand_drafts').select('version,round_no,payload,updated_at').eq('tenant_id',tenant).eq('campaign_id',id).maybeSingle());
 const revision=checked(await admin.from('studio_brand_revisions').select('id,revision_no,sha256,created_at,payload').eq('tenant_id',tenant).eq('campaign_id',id).order('revision_no',{ascending:false}).limit(1).maybeSingle());
 const body={version:'brand-export@1',exportedAt:new Date().toISOString(),campaignId:id,
  counts:{materials:materials.length,analyses:analyses.length,fileReads:fileReads.length,readParts:readParts.length,steps:steps.length,findings:findings.length,submissions:submissions.length,submissionItems:items.length},
  materials,analyses,fileReads,readParts,
  steps:steps.map(s=>({...s,prompt:typeof s.prompt==='string'&&s.prompt.length>PROMPT_PREVIEW?`${s.prompt.slice(0,PROMPT_PREVIEW)}… [${s.prompt.length} chars]`:s.prompt})),
  findings,submissions,submittedBrandbook:latest?{submissionId:latest.id,items}:null,a1Draft:draft,latestBrandRevision:revision};
 return new Response(JSON.stringify(body,null,1),{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="brand-export-${id.slice(0,8)}.json"`,'Cache-Control':'private, no-store'}});
});}
