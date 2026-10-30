import 'server-only';
import {resolve} from 'node:path';
import {studioContext,campaignRecord,checked} from './studio';
import {ApiError} from './api';
import {startLocalWorkflow} from './local-compute';
import {quoteDirectorRevision} from './director';
import {saveScopedReview} from '@/packages/director/review-service';
import type {ReviewCommand} from '@/packages/director/review';
import type {BlockSnapshot} from '@/packages/director/state';
import {readPreviewEvidence,archiveReviewSource} from '@/apps/local-runner/director/review-evidence';
import {publishStudioChange} from '@/packages/data/studio-changes';
/** Archived source/data evidence allows a note on the viewed state after the worker has advanced. */
export async function reviewDirectorView(campaignId:string,input:ReviewCommand){
 await campaignRecord(campaignId);const {admin,tenant,actorId}=await studioContext();
 const block=checked(await admin.from('studio_director_blocks').select('id,snapshot').eq('id',input.target.blockId).eq('tenant_id',tenant).eq('campaign_id',campaignId).maybeSingle());
 const source=(block?.snapshot as BlockSnapshot|undefined)?.inputs.find(i=>i.directionId===input.target.directionId);
 if(!block||!source||source.stage!=='draft')throw new ApiError(404,'REVIEW_VIEW_NOT_FOUND','This draft view is not available.');
 return saveScopedReview(input,{
  evidence:async command=>{const t=command.target,folders=[resolve('artifacts/m08/workspaces',source.runId,source.roundId,source.directionId,t.iterationId)];
   const iteration=checked(await admin.from('studio_director_iterations').select('source_hash').eq('id',t.iterationId).eq('block_id',block.id).eq('direction_id',source.directionId).maybeSingle());if(iteration)folders.push(resolve('artifacts/m09/preview-revisions',t.iterationId,iteration.source_hash));
   for(const folder of folders)try{const evidence=await readPreviewEvidence(folder,t);await archiveReviewSource(folder,folders[0],t.revision);return evidence;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
   throw new ApiError(409,'REVIEW_VIEW_NOT_FOUND','This view’s source and image evidence is no longer available. Reopen the saved view before writing a new note.');},
  save:async command=>{const result=await admin.rpc('studio_review_director',{target_block:block.id,direction:source.directionId,request_key:command.requestId,review_action:command.kind,review_target:command.target,note_recipient:command.recipient??null,note_text:command.text??null,acting_user:actorId});
   if(result.error&&['PGRST202','42P01','42883'].includes(result.error.code??''))throw new ApiError(503,'SCOPED_REVIEW_SCHEMA_REQUIRED','Apply migration 054 to enable notes tied to a draft view. Nothing was requested or charged.');
   const saved=checked(result) as {route:'live'|'paused'|'quote';reused:boolean};await publishStudioChange('work').catch(()=>{});return saved;},
  wake:startLocalWorkflow,quote:(directionId,requestId)=>quoteDirectorRevision(campaignId,directionId,requestId),
 });
}
