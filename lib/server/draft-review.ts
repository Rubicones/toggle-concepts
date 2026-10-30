import 'server-only';
import {ApiError} from './api';
import {campaignRecord,studioContext,checked} from './studio';
import {schemaMissing} from './brief';
import type {DraftCompilation} from '@/packages/contracts/drafts';
export function reviewDbError(error:{message:string;code?:string}|null){
 if(!error)return;if(schemaMissing(error))throw new ApiError(503,'M08_SCHEMA_REQUIRED','Enable A2/C2 review with the M08 migration in Settings.');
 const messages:Record<string,string>={STALE_DRAFT_REVIEW:'The round or batch changed. Refresh before submitting this decision.',A2_REQUIRED:'The art director must accept this exact batch at A2 before client access.',A1_REQUIRED:'Review and accept a fresh Brand Kit at A1 for this round first.',DRAFT_REVIEW_LOCKED:'This batch is locked for client review. A C2 change request creates a new draft round.',DRAFT_REVISION_REVIEWED:'This exact batch already has a decision. Compile a revised batch for a new review.',A2_BLOCKED:'Check all A2 attestations and resolve blocking comments in a new compiled revision.',C2_BLOCKED:'Blocking comments require changes and a new draft round before acceptance.',C2_SELECTION_REQUIRED:'Select exactly the ordered number of distinct directions and confirm the scope.',C2_SNAPSHOT_MISMATCH:'The accepted scope, bindings, contracts or decisions changed. Refresh before accepting.',INVALID_COMMENT_TARGET:'Choose a frame inside the selected scene and reviewed creative.',REPLAY_ASSET_REUSE_BLOCKED:'This replay references an earlier generated candidate. Create new draft assets; original supplied sources remain usable.',REQUEST_CONFLICT:'This request ID belongs to a different review.',FORBIDDEN:'This studio actor cannot review this campaign.'};
 const code=Object.keys(messages).find(k=>error.message.includes(k));if(code)throw new ApiError(409,code,messages[code]);throw new Error(error.message);
}
export async function reviewContext(campaignId:string){
 const campaign=await campaignRecord(campaignId),base=await studioContext(),{admin,tenant}=base;
 const ready=await admin.from('studio_a2_reviews').select('id').limit(0);reviewDbError(ready.error);
 const round=checked(await admin.from('studio_workflow_rounds').select('*').eq('tenant_id',tenant).eq('campaign_id',campaign.id).eq('kind','draft').order('round_no',{ascending:false}).limit(1).maybeSingle());
 const cp=checked(await admin.from('studio_c1_checkpoints').select('id,payload').eq('tenant_id',tenant).eq('campaign_id',campaign.id).maybeSingle());
 const plan=round?checked(await admin.from('studio_draft_plans').select('version').eq('round_id',round.id).maybeSingle()):null;
 return {...base,campaign,round,c1:cp?.payload??null,plan};
}
export async function reviewedBatch(saved:Awaited<ReturnType<typeof reviewContext>>,id:string,audience:'ad'|'client'){
 const batch=checked(await saved.admin.from('studio_draft_batches').select('*').eq('tenant_id',saved.tenant).eq('campaign_id',saved.campaign.id).eq('id',id).maybeSingle());
 if(!batch)throw new ApiError(404,'BATCH_NOT_FOUND','That draft batch is not available.');
 const a2=checked(await saved.admin.from('studio_a2_reviews').select('*').eq('batch_id',batch.id).maybeSingle());
 if(audience==='client'&&a2?.decision!=='accepted')throw new ApiError(403,'A2_REQUIRED','The art director has not offered this batch for client review.');
 return {batch:batch as {id:string;run_id:string;round_id:string;sha256:string;source_plan_version:number;payload:DraftCompilation|import('@/packages/contracts/frame-program').DraftBatchV2},a2};
}
