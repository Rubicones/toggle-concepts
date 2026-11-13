// Chat-shaped plan C2 (second part): the stored brand pack (migration 20261113000100), read and written with a service
// client so the local runner (no browser session) and the studio routes share one source. Without the migration every
// read answers "no stored pack" and the run context keeps the first part's pack.
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {canonicalJson} from '../agents/prepared-request';
import {effectiveMaterialRole} from './material-roles';
import {BRAND_CHARACTER_SCHEMA,BRAND_CHARACTER_TASK,BRAND_PACK_STORE_VERSION,CHARACTER_PICTURE_LIMIT,brandCharacterContext,brandCharacterInstructions,candidateLabel,materialCatalogue,parseBrandCharacter,pictureCandidates,markedFindings,markedMaterials,
 type CatalogueEntry,type PackFinding,type PackMaterial,type SheetRef,type StoredBrandPack} from './brand-pack-contents';

export async function brandPackStoreReady(admin:SupabaseClient){
 const r=await admin.rpc('studio_brand_pack_version');return !r.error&&r.data===BRAND_PACK_STORE_VERSION;
}
const COLUMNS='id,version,origin,character,signatures,catalogue,sheet,source_sha256,created_at';
/** The latest version of a revision's pack; null without the migration or before one exists. */
export async function latestBrandPack(admin:SupabaseClient,revisionId:string):Promise<StoredBrandPack|null>{
 const r=await admin.from('studio_brand_packs').select(COLUMNS).eq('brand_revision_id',revisionId).order('version',{ascending:false}).limit(1).maybeSingle();
 return r.error||!r.data?null:r.data as unknown as StoredBrandPack;
}
/** The campaign whose brand materials a campaign uses (its brand source when one is set). */
export async function brandScopeOf(admin:SupabaseClient,campaignId:string){
 const r=await admin.from('campaigns').select('brand_source_campaign_id').eq('id',campaignId).maybeSingle();
 return (r.error?null:(r.data as {brand_source_campaign_id?:string|null}|null)?.brand_source_campaign_id)??campaignId;
}

/** Only what the AD marked "Use this": its findings and the materials they come from. */
export async function loadUseThis(admin:SupabaseClient,tenant:string,scope:string):Promise<{materials:PackMaterial[];findings:PackFinding[]}>{
 const findings:PackFinding[]=[];
 for(let offset=0;offset<5000;offset+=1000){const page=await admin.from('studio_brand_findings').select('field,value,edited_value,decision,material_id').eq('tenant_id',tenant).eq('campaign_id',scope).eq('decision','keep').order('seq').range(offset,offset+999);if(page.error)throw new Error(page.error.message);findings.push(...(page.data??[]) as PackFinding[]);if((page.data??[]).length<1000)break;}
 const ids=[...new Set(findings.map(f=>f.material_id))],materials:PackMaterial[]=[];
 for(let i=0;i<ids.length;i+=100){
  const q=(cols:string)=>admin.from('studio_brand_materials').select(cols).eq('tenant_id',tenant).eq('campaign_id',scope).in('id',ids.slice(i,i+100));
  const base='id,filename,relative_path,mime,state,included,extraction';let res=await q(`${base},role`);if(res.error)res=await q(base);if(res.error)throw new Error(res.error.message);
  for(const row of (res.data??[]) as unknown as (Omit<PackMaterial,'role'>&{role?:string|null})[])materials.push({...row,role:effectiveMaterialRole({filename:row.filename,relative_path:row.relative_path,mime:row.mime,extraction:row.extraction??undefined,role:row.role}).role});
 }
 return {materials,findings};
}

/** The brand sheet pages of the brandbook the accepted kit was imported from (the same rule as studio_start_workflow). */
export async function sheetRefsForRevision(admin:SupabaseClient,payload:unknown):Promise<SheetRef[]>{
 const p=payload as {kit?:{brandbookImports?:{submissionId?:string}[]};brandbookImports?:{submissionId?:string}[]}|null;
 const imports=p?.kit?.brandbookImports??p?.brandbookImports??[],submission=Array.isArray(imports)?imports.at(-1)?.submissionId:undefined;if(!submission)return [];
 const build=await admin.from('studio_brand_sheet_builds').select('state').eq('submission_id',submission).maybeSingle();if(build.error||build.data?.state!=='ready')return [];
 const rows=await admin.from('studio_brand_sheets').select('section,slice,position,sha256,object_key,width,height').eq('submission_id',submission).order('position').order('slice').limit(20);
 return rows.error?[]:(rows.data??[]).map(r=>({section:r.section,slice:r.slice,sha256:r.sha256,objectKey:r.object_key,width:r.width,height:r.height}));
}

/** The same brand (accepted kit and "Use this" evidence) gives the same digest, so its pack is reused, not rewritten. */
export function packSourceSha(revisionPayload:unknown,materials:PackMaterial[],findings:PackFinding[]){
 const kit=(revisionPayload as {kit?:unknown}|null)?.kit??revisionPayload;
 return createHash('sha256').update(canonicalJson({version:2,kit,materials:markedMaterials(materials,findings).map(m=>m.id),findings:markedFindings(findings,1000)})).digest('hex');
}

export type CharacterAgent={instructions:string;max_output_tokens:number;step_cap_micro_usd:number;model_id:string};
export type CharacterModel={id:string;maxOutput:number;inputPrice:number;outputPrice:number}&Record<string,unknown>;
/** The one character request: its task text and frozen snapshot (an ordinary manual brand-kit step). */
export function brandCharacterRequest(args:{runId:string;checkpointId:string|null;revisionId:string;revisionPayload:unknown;materials:PackMaterial[];findings:PackFinding[];sheet:SheetRef[];skill:{id:string;text:string}|null;agent:CharacterAgent;model:CharacterModel}){
 const catalogue=materialCatalogue(args.revisionPayload,args.materials,args.findings),sourceSha=packSourceSha(args.revisionPayload,args.materials,args.findings);
 const images=pictureCandidates(catalogue).slice(0,CHARACTER_PICTURE_LIMIT).map(e=>({materialId:e.materialId,label:candidateLabel(e),...e.picture}));
 const snapshot={instructions:args.agent.instructions,protocolInstructions:brandCharacterInstructions(args.skill),maxOutputTokens:Math.min(8192,args.agent.max_output_tokens,args.model.maxOutput),stepCapMicroUsd:args.agent.step_cap_micro_usd,pricing:args.model,
  campaignContext:brandCharacterContext({checkpointId:args.checkpointId,revision:args.revisionPayload,findings:args.findings,catalogue}),budgetScopeId:args.checkpointId?`budget-step-${args.runId}-brand-kit`:null,
  outputFormat:'json_schema',responseSchema:BRAND_CHARACTER_SCHEMA as unknown as {name:string;schema:Record<string,unknown>},disableReasoning:args.model.id==='google/gemini-2.5-flash',
  segment:'brand-character',localStage:'brand character',brandCharacter:{version:1,revisionId:args.revisionId,sourceSha,catalogue,sheet:args.sheet},brandCharacterImages:images};
 return {prompt:BRAND_CHARACTER_TASK,snapshot,catalogue,sourceSha,images:images.length};
}
type CharacterSnapshot={brandCharacter?:{revisionId:string;sourceSha:string;catalogue:CatalogueEntry[];sheet:SheetRef[]}};

/** A succeeded character step becomes the revision's next pack version (once per step). Null when it cannot. */
export async function ingestBrandCharacter(admin:SupabaseClient,stepId:string):Promise<StoredBrandPack|null>{
 const step=await admin.from('studio_agent_steps').select('id,status,output,config_snapshot').eq('id',stepId).maybeSingle();
 const s=step.data as {id:string;status:string;output:string|null;config_snapshot:CharacterSnapshot}|null;const bc=s?.config_snapshot?.brandCharacter;
 if(step.error||!s||s.status!=='succeeded'||!s.output||!bc)return null;
 let parsed;try{parsed=parseBrandCharacter(s.output,bc.catalogue);}catch{return null;}
 const r=await admin.rpc('studio_add_brand_pack',{target_revision:bc.revisionId,pack_origin:'model',origin_step:s.id,expected_version:null,source_sha:bc.sourceSha,character_text:parsed.character,signature_list:parsed.signatures,catalogue_list:bc.catalogue,sheet_list:bc.sheet,acting_user:null});
 return r.error?null:r.data as StoredBrandPack;
}
/** Succeeded character steps of a revision whose version was not stored yet (a runner stopped in between). */
export async function ingestPendingCharacters(admin:SupabaseClient,runId:string,revisionId:string){
 const steps=await admin.from('studio_agent_steps').select('id').eq('run_id',runId).eq('role','brand-kit').eq('status','succeeded').eq('config_snapshot->brandCharacter->>revisionId',revisionId).order('created_at').limit(20);
 if(steps.error||!steps.data?.length)return;
 const stored=await admin.from('studio_brand_packs').select('origin_step_id').in('origin_step_id',steps.data.map(s=>s.id));if(stored.error)return;
 const done=new Set((stored.data??[]).map(r=>r.origin_step_id));
 for(const s of steps.data)if(!done.has(s.id))await ingestBrandCharacter(admin,s.id);
}
