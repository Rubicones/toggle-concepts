import 'server-only';
import {createHash} from 'node:crypto';
import {ApiError} from './api';
import {savedBrandInputs,brandDbError} from './brand-kit';
import {studioContext,checked} from './studio';
import {brandAcceptanceBlockers,applyRunBrandReview} from '@/packages/contracts/brand-kit';
import {brandSnapshot,a1ReviewSource} from '@/packages/data/brand-snapshot';
import {canonicalJson} from '@/packages/contracts/common';
import {randomUUID} from 'node:crypto';
import {importBrandbookToA1} from '@/packages/brand/a1-handoff';
import {submittedBrandbook,submittedBrandbookItems} from './brandbook-a1';
import type {BrandDraft} from '@/packages/contracts/brand-kit';
/** Re-applies the run's submitted brandbook to fill rules that are still empty (colors, logo files, product media). Never overwrites a value. */
export async function supplementRunBrand(control:Pick<GuidedRunControl,'campaign_id'|'brandbook_id'|'c1_id'>,draft:BrandDraft){
 const {admin,tenant}=await studioContext();const book=await submittedBrandbook(control.campaign_id,control.brandbook_id);if(!book)return draft;
 const c1=checked(await admin.from('studio_c1_checkpoints').select('id,brief_text').eq('tenant_id',tenant).eq('id',control.c1_id).maybeSingle());if(!c1)return draft;
 const brief=JSON.parse(c1.brief_text).questionnaire;
 try{return importBrandbookToA1(draft,book,await submittedBrandbookItems(control.campaign_id,book),{id:c1.id,immutables:brief?.immutables,sourceAssetIds:Array.isArray(brief?.sourceAssetIds)?brief.sourceAssetIds:[]},randomUUID);}catch{return draft;}
}
import type {GuidedRunControl} from '@/packages/contracts/guided-run';
const stableId=(value:string)=>{const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
export function guidedDbError(error:{code?:string;message:string}|null){
 if(!error)return;
 if(['42P01','PGRST202','PGRST205'].includes(error.code??''))throw new ApiError(503,'GUIDED_RUN_SCHEMA_REQUIRED','Enable the Run dashboard update in Settings. Your submitted inputs are saved.');
 const messages:Record<string,string>={OTHER_REQUEST_PENDING:'Another request is still finishing. Wait for it to settle, then retry.',STALE_PREVIEW_RETRY:'The preview inputs changed. Reload the run before retrying.',STALE_SAVED_RESULT:'The run or its inputs changed. Historical output cannot replace the current step.',UNRECOVERABLE_OUTPUT:'This output needs a content correction; metadata recovery cannot change facts, scope or incomplete JSON.',STALE_RUN_LIMITS:'Limits were updated elsewhere. Reload and review the current values.',INVALID_RUN_LIMITS:'Limits can only increase. Review the run budget, per-agent caps and output allowance.',RETRY_BLOCKED:'This step cannot be retried safely. Check the exact error or request a correction; no call was submitted.',REPAIR_SAVED_RESULT_FIRST:'Recover or review the saved result first. No duplicate paid request was made.',UNRESOLVED_PROVIDER_RECEIPT:'Resolve the earlier provider receipt before continuing. No duplicate request was sent.',RUN_STOPPED:'The run is stopped. Continue explicitly to admit new requests.',C1_REQUIRED:'Submit the questionnaire first.',BRANDBOOK_REQUIRED:'Submit the brandbook you have first.',STALE_GUIDED_RUN:'The run advanced while you were editing. Refresh and try again.',CHANGE_PENDING:'Your earlier change is still being applied. Its progress is shown below.',CHECKPOINT_CHANGE_REQUIRED:'This change affects an accepted checkpoint. Use the client change request to open the proper replay round.',A1_ALREADY_ACCEPTED:'The accepted brand rules stay fixed. Ask for scenario changes here; brand changes need an explicit replay.',REVIEW_REQUIRED:'This step needs review or correction before it can continue.',RUN_STAGE_NOT_READY:'That step has not started yet. Ask for a change once its input is ready.'};
 const key=Object.keys(messages).find(k=>error.message.includes(k));if(key)throw new ApiError(409,key,messages[key]);
 throw new Error(error.message);
}
export async function approveRunBrand(control:GuidedRunControl,input:{reviewerName:string;notes:string;allowDraftFontFallback:boolean;fontRights?:string}){
 const {admin,tenant,actorId}=await studioContext();
 const roundDraft=checked(await admin.from('studio_brand_drafts').select('round_no').eq('tenant_id',tenant).eq('campaign_id',control.campaign_id).single());
 const accepted=checked(await admin.from('studio_a1_reviews').select('id').eq('tenant_id',tenant).eq('run_id',control.run_id).eq('decision','accepted').eq('round_no',roundDraft?.round_no??1).limit(1));
 if(!accepted?.length){
  const current=checked(await admin.from('studio_brand_drafts').select('version,payload').eq('tenant_id',tenant).eq('campaign_id',control.campaign_id).single());
  const recovered=current?.payload.proposalStepId===control.cursor.brandStepId&&typeof control.cursor.brandStepId==='string';
  // A stopped brand-alignment request is optional: the AD can continue with the curated brandbook kit.
  const brandStep=typeof control.cursor.brandStepId==='string'?checked(await admin.from('studio_agent_steps').select('status').eq('tenant_id',tenant).eq('id',control.cursor.brandStepId).maybeSingle()):null;
  const stopped=control.status==='blocked'&&!!current&&!['reserved','running'].includes(brandStep?.status??'');
  if(control.stage!=='brand'||control.status!=='review'&&!(recovered&&control.status==='blocked')&&!stopped)throw new ApiError(409,'BRAND_REVIEW_NOT_READY','Wait for the brand alignment result before approving it.');
  if(!current)throw new ApiError(409,'BRAND_DRAFT_REQUIRED','Wait for the brand alignment result.');
  const saved=await savedBrandInputs(control.campaign_id,current.version);
  const note=input.notes.trim()||`Reviewed and approved by ${input.reviewerName} in the run dashboard.`;
  const draft=applyRunBrandReview(await supplementRunBrand(control,saved.draft),{reviewerName:input.reviewerName,note,fontRights:input.fontRights,fallbackRuleId:input.allowDraftFontFallback?stableId(control.run_id+':draft-font'):null});
  const blockers=brandAcceptanceBlockers(draft,saved.c1.scope.locales,saved.c1.id,saved.assets,saved.materials);if(blockers.length)throw new ApiError(409,'BRAND_REVIEW_INCOMPLETE',blockers.slice(0,3).join(' '));
  let version=current.version;
  if(canonicalJson(draft)!==canonicalJson(saved.draft)){const result=await admin.rpc('studio_save_brand',{target_campaign:control.campaign_id,expected_version:version,draft,acting_user:actorId});brandDbError(result.error);version=result.data.version;}
  let revision=checked(await admin.from('studio_brand_revisions').select('*').eq('tenant_id',tenant).eq('campaign_id',control.campaign_id).eq('source_draft_version',version).eq('round_no',saved.round).maybeSingle());
  if(!revision){const parent=checked(await admin.from('studio_brand_revisions').select('id').eq('tenant_id',tenant).eq('campaign_id',control.campaign_id).order('revision_no',{ascending:false}).limit(1).maybeSingle());const snapshot=brandSnapshot(saved.c1,draft,saved.assets,version,parent?.id??null,saved.round,saved.materials);const result=await admin.rpc('studio_publish_brand',{target_campaign:control.campaign_id,expected_version:version,request_key:stableId(control.run_id+':publish:'+version),source:snapshot.source,acting_user:actorId});brandDbError(result.error);revision=result.data;}
  const review=a1ReviewSource(revision,actorId,{decision:'accepted',reviewerName:input.reviewerName,comments:note,attestations:{rules:true,fonts:true,c1Constraints:true}});
  brandDbError((await admin.rpc('studio_review_a1',{target_campaign:control.campaign_id,target_revision:revision.id,request_key:stableId(revision.id+':review'),source:review,acting_user:actorId})).error);
 }
 guidedDbError((await admin.rpc('studio_start_workflow',{target_run:control.run_id,acting_user:actorId})).error);
 const latest=checked(await admin.from('studio_campaign_run_controls').select('*').eq('run_id',control.run_id).single());
 const result=await admin.rpc('studio_set_guided_run',{target_run:control.run_id,expected_version:latest.version,action:'approved',change_id:null,agent_role:null,note_text:null,acting_user:actorId});guidedDbError(result.error);return result.data;
}

/** A guided run stopped on the historical M07 preview check continues once the M07b creative block exists. */
export async function resumeGuidedCreative(campaignId:string){
 const {admin,tenant,actorId}=await studioContext();
 const control=checked(await admin.from('studio_campaign_run_controls').select('run_id,stage,status,version').eq('tenant_id',tenant).eq('campaign_id',campaignId).order('created_at',{ascending:false}).limit(1).maybeSingle());
 if(control?.stage==='assembly'&&control.status==='paused'){
  // Called only after an explicit draft decision/approval; receipt recovery itself never resumes work.
  const resumed=await admin.rpc('studio_set_guided_run',{target_run:control.run_id,expected_version:control.version,action:'resume',change_id:null,agent_role:null,note_text:null,acting_user:actorId});guidedDbError(resumed.error);return true;
 }
 if(!control||control.stage!=='assembly'||!['blocked','review'].includes(control.status))return false;
 const director=await admin.from('studio_director_blocks').select('id').eq('run_id',control.run_id).neq('status','quoted').limit(1);if(director.data?.length){const resumed=await admin.rpc('studio_resume_director_run',{target_run:control.run_id,acting_user:actorId});guidedDbError(resumed.error);return true;}
 const result=await admin.rpc('studio_set_guided_run',{target_run:control.run_id,expected_version:control.version,action:'creativeStarted',change_id:null,agent_role:null,note_text:null,acting_user:actorId});
 if(result.error?.message.includes('INVALID_RUN_ACTION'))throw new ApiError(503,'M07B_RESUME_SCHEMA_REQUIRED','Apply supabase/migrations/20261026002600_creative_resume.sql, then press this button again. The creative drafts are saved.');
 guidedDbError(result.error);return true;
}
