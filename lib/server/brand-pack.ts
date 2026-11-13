import 'server-only';
// Chat-shaped plan C2 (second part): the stored brand pack on the studio side. After A1 the brand character is
// written by ONE ordinary manual brand-kit step (studio_enqueue_text: reserved in the ledger against the run's and the
// role's caps, run by the local workflow worker on the run's own transport, its usage on the run's request list). The
// AD reads and edits the result on the brand page; every edit adds a version.
import {createHash,randomUUID} from 'node:crypto';
import {ApiError} from './api';
import {studioContext,checked} from './studio';
import {modelCatalog} from './providers';
import {startLocalWorkflow} from './local-compute';
import {effectiveRunAgents} from '@/packages/data/run-limits';
import {readSkills} from '@/packages/agents/skill-files';
import {textRequestQuote} from '@/packages/agents/text-quote';
import {LOCAL_TEXT_RESERVATION_MICRO_USD} from '@/packages/agents/local-usage';
import type {TextSnapshot} from '@/packages/agents/text-provider';
import type {AgentSetting} from '@/packages/contracts/shared';
import {brandPackStoreReady,brandCharacterRequest,brandScopeOf,ingestPendingCharacters,latestBrandPack,loadUseThis,packSourceSha,sheetRefsForRevision} from '@/packages/brand/brand-pack-store';
import {brandSheetLabels,type BrandSheetSection} from '@/packages/brand/brand-sheet';
import {estimateImageTokens,packImageSize,packPictures,pictureCandidates,swapSignatures,type StoredBrandPack} from '@/packages/brand/brand-pack-contents';

const stableId=(value:string)=>{const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
type Accepted={runId:string;revisionId:string;payload:unknown;campaignId:string};

/** The accepted brand revision of a run (its latest accepted A1). */
async function acceptedOfRun(runId:string):Promise<Accepted|null>{
 const {admin,tenant}=await studioContext();
 const a1=await admin.from('studio_a1_reviews').select('brand_revision_id').eq('tenant_id',tenant).eq('run_id',runId).eq('decision','accepted').order('round_no',{ascending:false}).limit(1).maybeSingle();
 if(a1.error||!a1.data)return null;
 const b=checked(await admin.from('studio_brand_revisions').select('id,campaign_id,payload').eq('tenant_id',tenant).eq('id',a1.data.brand_revision_id).maybeSingle());if(!b)return null;
 return {runId,revisionId:b.id,payload:b.payload,campaignId:b.campaign_id};
}
/** The campaign's latest accepted brand revision: the one its brand page shows. */
async function acceptedOfCampaign(campaignId:string):Promise<Accepted|null>{
 const {admin,tenant}=await studioContext();
 const a1=await admin.from('studio_a1_reviews').select('run_id').eq('tenant_id',tenant).eq('campaign_id',campaignId).eq('decision','accepted').order('created_at',{ascending:false}).limit(1).maybeSingle();
 return a1.error||!a1.data?null:acceptedOfRun(a1.data.run_id);
}
async function runMode(runId:string){
 const {admin}=await studioContext();
 const row=await admin.from('studio_text_executions').select('*').eq('scope_kind','run').eq('scope_id',runId).maybeSingle();
 const e=(row.error?null:row.data) as {mode?:string;context_mode?:string|null}|null;
 return {local:e?.mode==='local_claude',shared:e?.mode==='local_claude'&&e.context_mode==='shared'};
}
const characterSteps=async(runId:string,revisionId:string)=>{const {admin,tenant}=await studioContext();return checked(await admin.from('studio_agent_steps').select('id,status,error_code,created_at').eq('tenant_id',tenant).eq('run_id',runId).eq('role','brand-kit').eq('config_snapshot->brandCharacter->>revisionId',revisionId).order('created_at',{ascending:false}).limit(5))??[];};

export type CharacterRequestResult={state:'queued'|'reused'|'exists'|'skipped';reason?:string};
/**
 * Asks for the brand character of a run's accepted brand. `auto` (A1 acceptance): only for Local 'shared' runs (the
 * runs whose agents read the pack, on the subscription), only when the revision has no pack yet, and the same brand
 * described before is reused without a model request. Otherwise (the AD's "Write it again"): always one new request.
 */
export async function requestBrandCharacter(runId:string,options:{auto:boolean}):Promise<CharacterRequestResult>{
 const {admin,tenant,actorId}=await studioContext();
 if(!await brandPackStoreReady(admin))return {state:'skipped',reason:'BRAND_PACK_SCHEMA_REQUIRED'};
 const accepted=await acceptedOfRun(runId);if(!accepted)return {state:'skipped',reason:'A1_REQUIRED'};
 const mode=await runMode(runId);if(options.auto&&!mode.shared)return {state:'skipped',reason:'NOT_A_SHARED_LOCAL_RUN'};
 const existing=await latestBrandPack(admin,accepted.revisionId);if(options.auto&&existing)return {state:'exists'};
 if((await characterSteps(runId,accepted.revisionId)).some(s=>['reserved','running'].includes(s.status)))return {state:'queued'};
 const run=checked(await admin.from('studio_runs').select('id,config_snapshot').eq('tenant_id',tenant).eq('id',runId).single()) as {id:string;config_snapshot:AgentSetting[]};
 const scope=await brandScopeOf(admin,accepted.campaignId),{materials,findings}=await loadUseThis(admin,tenant,scope),sheet=await sheetRefsForRevision(admin,accepted.payload);
 // The same brand (kit and "Use this" evidence) already described: a copy, no model request.
 if(options.auto){
  const same=await admin.from('studio_brand_packs').select('character,signatures,catalogue,brand_revision_id').eq('tenant_id',tenant).eq('source_sha256',packSourceSha(accepted.payload,materials,findings)).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(!same.error&&same.data){const copied=await admin.rpc('studio_add_brand_pack',{target_revision:accepted.revisionId,pack_origin:'copy',origin_step:null,expected_version:null,source_sha:packSourceSha(accepted.payload,materials,findings),character_text:same.data.character,signature_list:same.data.signatures,catalogue_list:same.data.catalogue,sheet_list:sheet,acting_user:actorId});if(!copied.error)return {state:'reused'};}
 }
 const agent=(await effectiveRunAgents(admin,run)).find(a=>a.role==='brand-kit');if(!agent?.model_id)return {state:'skipped',reason:'AGENT_NOT_CONFIGURED'};
 const model=(await modelCatalog()).find(m=>m.id===agent.model_id);if(!model||model.outputModalities.length!==1||model.outputModalities[0]!=='text')return {state:'skipped',reason:'MODEL_UNAVAILABLE'};
 if(!mode.local&&!process.env.OPENROUTER_API_KEY)return {state:'skipped',reason:'PROVIDER_NOT_CONFIGURED'};
 let skill:{id:string;text:string}|null=null;try{const s=readSkills().find(x=>x.id==='brand-character');skill=s?{id:s.id,text:s.text}:null;}catch{skill=null;}
 const c1=await admin.from('studio_c1_checkpoints').select('id').eq('tenant_id',tenant).eq('run_id',runId).maybeSingle();
 const request=brandCharacterRequest({runId,checkpointId:c1.data?.id??null,revisionId:accepted.revisionId,revisionPayload:accepted.payload,materials,findings,sheet,skill,agent:{...agent,model_id:agent.model_id},model});
 // A Local request reserves the minimum (subscription); an OpenRouter one its quoted price, inside the role's cap.
 const reservation=mode.local?LOCAL_TEXT_RESERVATION_MICRO_USD:textRequestQuote(request.prompt,request.snapshot as unknown as TextSnapshot,'',request.images).reservationMicroUsd;
 const requestKey=options.auto?stableId(`${accepted.revisionId}:brand-character`):randomUUID();
 const result=await admin.rpc('studio_enqueue_text',{target_run:runId,request_key:requestKey,agent_role:'brand-kit',model:agent.model_id,prompt_text:request.prompt,snapshot:request.snapshot,reservation,acting_user:actorId});
 if(result.error)return {state:'skipped',reason:result.error.message.slice(0,120)};
 await startLocalWorkflow().catch(()=>undefined);
 return {state:'queued'};
}
/** At A1 acceptance: never stops the acceptance; whatever happens, the run continues (with the first part's pack). */
export async function requestBrandCharacterQuietly(runId:string){try{return await requestBrandCharacter(runId,{auto:true});}catch{return {state:'skipped' as const,reason:'UNEXPECTED'};}}

export type BrandPackView={schemaReady:boolean;accepted:boolean;
 pack:null|{version:number;origin:string;createdAt?:string;character:string;characterTokens:number;signatures:{name:string;why:string;kind:string;url:string}[];sheet:{label:string;url:string}[];materials:number;more:number;tokens:number;pictures:number};
 pictures:{name:string;kind:string;line:string;url:string}[];versions:{version:number;origin:string;createdAt:string}[];
 request:{state:'none'|'waiting'|'failed';failure?:string};local:boolean};
const pictureUrl=(campaignId:string,sha:string)=>`/api/studio/campaigns/${campaignId}/brand-pack?picture=${sha}`;
const sheetUrl=(campaignId:string,sha:string)=>`/api/studio/campaigns/${campaignId}/brand-fields?sheetImage=${sha}`;
export function packSummary(campaignId:string,pack:StoredBrandPack){
 const byName=new Map(pictureCandidates(pack.catalogue).map(e=>[e.name,e]));
 const pictures=packPictures(pack),tokens=Math.ceil(Buffer.byteLength(pack.character,'utf8')/4)+pack.catalogue.length*25+pictures.reduce((n,p)=>{const s=packImageSize(p.kind,p.ref.width,p.ref.height);return n+estimateImageTokens(s.width,s.height);},0);
 const materials=pack.catalogue.filter(e=>e.materialId).length;
 return {version:pack.version,origin:pack.origin,createdAt:pack.created_at,character:pack.character,characterTokens:Math.ceil(Buffer.byteLength(pack.character,'utf8')/4),
  signatures:pack.signatures.flatMap(s=>{const e=byName.get(s.name);return e?[{name:s.name,why:s.why,kind:e.kind,url:pictureUrl(campaignId,e.picture.sha256)}]:[];}),
  sheet:pack.sheet.map(s=>({label:`${brandSheetLabels[s.section as BrandSheetSection]??s.section}${s.slice?` · part ${s.slice+1}`:''}`,url:sheetUrl(campaignId,s.sha256)})),materials,more:Math.max(0,materials-pack.signatures.length),tokens,pictures:pictures.length};
}
export async function brandPackView(campaignId:string):Promise<BrandPackView>{
 const {admin,tenant}=await studioContext(),empty:BrandPackView={schemaReady:false,accepted:false,pack:null,pictures:[],versions:[],request:{state:'none'},local:false};
 const accepted=await acceptedOfCampaign(campaignId);
 if(!await brandPackStoreReady(admin))return {...empty,accepted:!!accepted};
 if(!accepted)return {...empty,schemaReady:true};
 await ingestPendingCharacters(admin,accepted.runId,accepted.revisionId);
 const pack=await latestBrandPack(admin,accepted.revisionId),steps=await characterSteps(accepted.runId,accepted.revisionId),last=steps[0];
 const versions=(checked(await admin.from('studio_brand_packs').select('version,origin,created_at').eq('tenant_id',tenant).eq('brand_revision_id',accepted.revisionId).order('version',{ascending:false}).limit(20))??[]).map(v=>({version:v.version,origin:v.origin,createdAt:v.created_at}));
 const waiting=!!last&&['reserved','running'].includes(last.status),failed=!!last&&['failed','unknown'].includes(last.status)&&(!pack||Date.parse(pack.created_at??'')<Date.parse(last.created_at));
 return {schemaReady:true,accepted:true,pack:pack?packSummary(campaignId,pack):null,pictures:pack?pictureCandidates(pack.catalogue).map(e=>({name:e.name,kind:e.kind,line:e.line,url:pictureUrl(campaignId,e.picture.sha256)})):[],versions,
  request:waiting?{state:'waiting'}:failed?{state:'failed',failure:last.error_code??undefined}:{state:'none'},local:(await runMode(accepted.runId)).local};
}
/** The AD's edit: a new version with the changed character and/or signature pictures. */
export async function editBrandPack(campaignId:string,input:{expectedVersion:number;character?:string;signatures?:string[]}){
 const {admin,actorId}=await studioContext();
 if(!await brandPackStoreReady(admin))throw new ApiError(503,'BRAND_PACK_SCHEMA_REQUIRED','Apply the brand pack update (migration 20261113000100) first. Nothing was changed.');
 const accepted=await acceptedOfCampaign(campaignId);if(!accepted)throw new ApiError(409,'A1_REQUIRED','Approve the brand first.');
 const latest=await latestBrandPack(admin,accepted.revisionId);if(!latest)throw new ApiError(409,'BRAND_PACK_REQUIRED','The brand character has not been written yet.');
 if(latest.version!==input.expectedVersion)throw new ApiError(409,'STALE_BRAND_PACK','Someone saved a newer version. Reload before editing.');
 const character=(input.character??latest.character).trim();if(character.length<200)throw new ApiError(400,'BRAND_CHARACTER_TOO_SHORT','The character needs at least a few sentences.');
 const signatures=input.signatures?swapSignatures(input.signatures,latest):latest.signatures;
 const result=await admin.rpc('studio_add_brand_pack',{target_revision:accepted.revisionId,pack_origin:'edit',origin_step:null,expected_version:latest.version,source_sha:latest.source_sha256??'0'.repeat(64),character_text:character,signature_list:signatures,catalogue_list:latest.catalogue,sheet_list:latest.sheet,acting_user:actorId});
 if(result.error){if(result.error.message.includes('STALE_BRAND_PACK'))throw new ApiError(409,'STALE_BRAND_PACK','Someone saved a newer version. Reload before editing.');throw new Error(result.error.message);}
 return {version:(result.data as StoredBrandPack).version};
}
/** The AD's "Write it again": one new character request for the campaign's accepted brand. */
export async function rewriteBrandCharacter(campaignId:string){
 const accepted=await acceptedOfCampaign(campaignId);if(!accepted)throw new ApiError(409,'A1_REQUIRED','Approve the brand first.');
 const r=await requestBrandCharacter(accepted.runId,{auto:false});
 if(r.state==='skipped')throw new ApiError(409,r.reason??'BRAND_CHARACTER_UNAVAILABLE',`The brand character could not be requested (${r.reason}).`);
 return r;
}
/** A picture of the campaign's pack (a catalogue picture), for the brand page. */
export async function brandPackPicture(campaignId:string,sha:string){
 const {admin}=await studioContext(),accepted=await acceptedOfCampaign(campaignId);if(!accepted)return null;
 const pack=await latestBrandPack(admin,accepted.revisionId),entry=pack?pictureCandidates(pack.catalogue).find(e=>e.picture.sha256===sha):undefined;
 return entry?entry.picture.objectKey:null;
}
