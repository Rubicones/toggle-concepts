import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {checked} from './studio';
import {ApiError} from './api';
import {resourceRequest,resourcePrompt} from '@/packages/director/resources';
import type {BlockSnapshot,WorkState} from '@/packages/director/state';
export async function directorImageAdmission(admin:SupabaseClient,tenant:string,runId:string,meta:{blockId:string;directionId:string;resourceId:string;maxCostMicroUsd:number},prompt:string,requestId:string,image:{aspectRatio:string;referenceAssetIds:string[];derivedSha256?:string[]},reservation:number){
 const block=checked(await admin.from('studio_director_blocks').select('*').eq('id',meta.blockId).eq('tenant_id',tenant).eq('run_id',runId).single());
 if(!block||!['running','review'].includes(block.status))throw new ApiError(409,'DIRECTOR_APPROVAL_REQUIRED','Approve this direction’s estimate before making a still.');
 const snapshot=block.snapshot as BlockSnapshot,input=snapshot.inputs.find(i=>i.directionId===meta.directionId),estimate=snapshot.estimates[meta.directionId];
 const work=checked(await admin.from('studio_director_work').select('state,status').eq('block_id',block.id).eq('direction_id',meta.directionId).single()),resource=(work?.state as WorkState)?.design?.resources.find(r=>r.id===meta.resourceId);
 if(!input||!resource||!work||work.status!=='running'||resource.aspect!==image.aspectRatio)throw new ApiError(409,'STALE_DIRECTOR_RESOURCE','This still must match the saved director request.');
 // The saved resource (with the sketch, source and canvas hashes the worker pinned) defines the exact request.
 let expected:ReturnType<typeof resourceRequest>;try{expected=resourceRequest(resource,input,estimate.perStillMicroUsd);}catch{throw new ApiError(409,'STALE_DIRECTOR_RESOURCE','This still must match the saved director request.');}
 const methods=!!(resource.sketch||resource.edit||resource.extend);
 if((methods?expected.prompt:resourcePrompt(resource))!==prompt||JSON.stringify(expected.references)!==JSON.stringify(image.referenceAssetIds)||JSON.stringify(expected.derivedPlan.map(d=>d.sha256))!==JSON.stringify(image.derivedSha256??[]))throw new ApiError(409,'STALE_DIRECTOR_RESOURCE','This still must match the saved director request.');
 if(input.brief.synthesisAllowed!==true&&!block.approved_resource_ids.includes(resourceRequest(resource,input,estimate.perStillMicroUsd).key))throw new ApiError(409,'RESOURCE_PERMISSION_REQUIRED','The brief does not yet permit this still.');
 if(meta.maxCostMicroUsd>estimate.perStillMicroUsd||reservation>meta.maxCostMicroUsd)throw new ApiError(409,'MEDIA_PRICE_CHANGED','Review the current still price.');
 const spec=resourceRequest(resource,input,estimate.perStillMicroUsd),ids=Array.from({length:3},(_,attempt)=>{const h=createHash('sha256').update(`${runId}:${input.roundId}:${spec.key}:${createHash('sha256').update(`still-request@2\n${prompt}`).digest('hex')}${attempt?`:retry${attempt}`:''}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;});
 if(!ids.includes(requestId))throw new ApiError(409,'UNISSUED_REQUEST_ID','The application must issue the resource request identity.');
 return {directorBlockId:block.id,directorDirectionId:meta.directionId,directorRole:'resources',directorIterationId:(work.state as WorkState).iterationId??input.iterationId,directorResourceId:resource.id};
}
