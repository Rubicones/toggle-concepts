import {startLocalWorkflow,requireLocalDevice} from '@/lib/server/local-compute';
import {z} from 'zod';
import {api,body,json,ApiError} from '@/lib/server/api';
import {studioContext,campaignRecord,checked} from '@/lib/server/studio';
import {reviewContext,reviewedBatch} from '@/lib/server/draft-review';
import {objectStore} from '@/packages/media/s3.server';
import {createHash} from 'node:crypto';
import {canonicalJson} from '@/packages/contracts/common';
import type {DraftDelivery,DeliveryView} from '@/packages/creative/delivery';
export async function GET(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/creative/delivery'>){return api(async()=>{
 const campaignId=z.uuid().parse((await ctx.params).id),params=new URL(request.url).searchParams,{admin,tenant}=await studioContext();await campaignRecord(campaignId);
 let delivery:DraftDelivery|undefined,state:DeliveryView['state']='pending';
 if(params.has('batch')){
  const audience=params.get('audience')==='client'?'client':'ad',saved=await reviewContext(campaignId),batch=await reviewedBatch(saved,z.uuid().parse(params.get('batch')),audience),directionId=z.uuid().parse(params.get('directionId'));
  delivery=batch.batch.payload.schemaVersion==='2.0'?batch.batch.payload.directionPrograms?.find(p=>p.directionId===directionId)?.delivery:undefined;state=delivery?'ready':'pending';
 }else{
  const direction=z.coerce.number().int().min(0).max(2).parse(params.get('direction'));
  const job=checked(await admin.from('studio_workflow_jobs').select('id,output,output_hash').eq('tenant_id',tenant).eq('campaign_id',campaignId).eq('job_key',`creative.compile.d${direction}`).order('created_at',{ascending:false}).limit(1).maybeSingle());
  if(!job)throw new ApiError(404,'BUILD_NOT_FOUND','Build this direction first.');
  const revision=checked(await admin.from('studio_creative_edit_revisions').select('program,source_hash').eq('job_id',job.id).order('revision',{ascending:false}).limit(1).maybeSingle());
  if(revision&&revision.source_hash===job.output_hash){const programHash=createHash('sha256').update(canonicalJson(revision.program.config)).digest('hex'),row=checked(await admin.from('studio_creative_deliveries').select('state,artifacts').eq('job_id',job.id).eq('program_hash',programHash).maybeSingle());state=row?.state??'pending';delivery=row?.state==='ready'?row.artifacts:undefined;}
  else {try{delivery=JSON.parse(job.output??'null')?.value?.directionPrograms?.[0]?.delivery;state=delivery?'ready':job.output?'failed':'pending';}catch{/* historical build */}}
 }
 const sign=async(file:DraftDelivery['mp4'],name:string)=>{if(!file.objectKey.startsWith(`media/${tenant}/${campaignId}/creative/`))throw new ApiError(409,'DELIVERY_SOURCE_INVALID','This file does not belong to the selected creative.');return objectStore().signGet(file.objectKey,name);};
 const file=params.get('file');if(file){if(!delivery)throw new ApiError(409,'DELIVERY_PENDING','Draft files are still being prepared.');if(file!=='mp4'&&file!=='contactStrip')throw new ApiError(400,'INVALID_DELIVERY_FILE','Choose an MP4 or contact strip.');return Response.redirect(await sign(delivery[file],file==='mp4'?'creative-draft.mp4':'creative-contact-strip.png'));}
 return json({state,...(delivery?{variantId:delivery.variantId,programHash:delivery.programHash,mp4Url:await sign(delivery.mp4,'creative-draft.mp4'),contactStripUrl:await sign(delivery.contactStrip,'creative-contact-strip.png')}:{})} satisfies DeliveryView);
});}

export async function POST(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/creative/delivery'>){return api(async()=>{
 requireLocalDevice();const campaignId=z.uuid().parse((await ctx.params).id),input=await body(request,z.strictObject({direction:z.number().int().min(0).max(2)})),{admin,tenant,actorId}=await studioContext();await campaignRecord(campaignId);
 const job=checked(await admin.from('studio_workflow_jobs').select('id,output_hash').eq('tenant_id',tenant).eq('campaign_id',campaignId).eq('job_key',`creative.compile.d${input.direction}`).order('created_at',{ascending:false}).limit(1).maybeSingle());
 if(!job)throw new ApiError(404,'BUILD_NOT_FOUND','Build this direction first.');
 const edit=checked(await admin.from('studio_creative_edit_revisions').select('id,source_hash,program').eq('job_id',job.id).order('revision',{ascending:false}).limit(1).maybeSingle());
 if(!edit||edit.source_hash!==job.output_hash)throw new ApiError(409,'DELIVERY_REBUILD_REQUIRED','Re-check and save this direction before preparing its files.');
 const programHash=createHash('sha256').update(canonicalJson(edit.program.config)).digest('hex');checked(await admin.rpc('studio_queue_creative_delivery',{target_edit:edit.id,program_hash:programHash,acting_user:actorId}));await startLocalWorkflow();return json({state:'pending',message:'Draft file rendering queued locally. No model request is needed.'});
});}
