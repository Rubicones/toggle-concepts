import {findProgram} from '@/packages/creative/program-reader';
import {startLocalWorkflow} from '@/lib/server/local-compute';
import {z} from 'zod';
import {api,body,json,ApiError} from '@/lib/server/api';
import {checked} from '@/lib/server/studio';
import {reviewContext,reviewedBatch,reviewDbError} from '@/lib/server/draft-review';
import {draftReviewCommandSchema,commentTarget} from '@/packages/contracts/draft-review';
import {a2Snapshot,c2Snapshot,clientReviewBatch} from '@/packages/data/draft-review-snapshot';
import {parseCheckpoint} from '@/packages/contracts/workflow';
import {objectStore} from '@/packages/media/s3.server';
function audience(request:Request){return new URL(request.url).searchParams.get('audience')==='client'?'client' as const:'ad' as const;}
export async function GET(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/reviews'>){return api(async()=>{
 const id=z.uuid().parse((await ctx.params).id),mode=audience(request);let saved;try{saved=await reviewContext(id);}catch(e){if(e instanceof ApiError&&e.code==='M08_SCHEMA_REQUIRED')return json({schemaReady:false});throw e;}
 const {admin,tenant,round,c1}=saved,params=new URL(request.url).searchParams,batchId=params.get('batch');
 if(batchId){
  const {batch}=await reviewedBatch(saved,z.uuid().parse(batchId),mode),program=findProgram(batch.payload,params.get('direction')??'',params.get('variant')??'');
  if(!program||mode==='client'&&params.get('otherFormats')!=='true'&&program.placementId!==c1.scope.referencePlacement)throw new ApiError(404,'BINDING_NOT_FOUND','Select an offered reference creative.');
  const asset=params.get('asset');if(asset){z.uuid().parse(asset);const ids=program.scenes.flatMap(s=>s.assets).filter(a=>a.kind!=='font').map(a=>a.revisionId);if(program.engine)ids.push(...program.engine.resources.filter(r=>r.kind!=='font').map(r=>r.revisionId));if(program.audio)ids.push(program.audio.assetRevisionId);if(!ids.includes(asset))throw new ApiError(404,'ASSET_NOT_FOUND','This asset is not part of the reviewed creative.');
   const media=checked(await admin.from('asset_revisions').select('object_key,filename,mime,sha256,bytes').eq('tenant_id',tenant).eq('campaign_id',id).eq('id',asset).maybeSingle());
   if(!media&&program.engine){const ref=program.engine.resources.find(r=>r.revisionId===asset&&r.kind==='logo');const material=ref?checked(await admin.from('studio_brand_materials').select('object_key,filename,mime,sha256,bytes').eq('tenant_id',tenant).eq('campaign_id',id).eq('id',asset).eq('state','ready').maybeSingle()):null;if(!material||material.sha256!==ref!.sha256||material.object_key!==ref!.objectKey)throw new ApiError(404,'ASSET_NOT_FOUND','Reviewed kit artwork is unavailable.');return json({url:await objectStore().signGet(material.object_key,material.filename),sha256:material.sha256,mime:material.mime,bytes:material.bytes});}
   if(!media)throw new ApiError(404,'ASSET_NOT_FOUND','Reviewed media is unavailable.');
   return json({url:await objectStore().signGet(media.object_key,media.filename),sha256:media.sha256,mime:media.mime,bytes:media.bytes});
  }return json({program,batchSha256:batch.sha256});
 }
 const [batches,reviews,comments,decisions,checkpoint]=await Promise.all([
  admin.from('studio_draft_batches').select('id,round_id,sha256,source_plan_version,summary,created_at').eq('tenant_id',tenant).eq('campaign_id',id).order('created_at',{ascending:false}).limit(100),
  admin.from('studio_a2_reviews').select('id,batch_id,decision,payload').eq('tenant_id',tenant).eq('campaign_id',id),
  admin.from('studio_draft_comments').select('id,batch_id,audience,direction_id,variant_id,scene_id,frame,reviewer_name,body,blocking,created_at').eq('tenant_id',tenant).eq('campaign_id',id).order('created_at').limit(2000),
  admin.from('studio_c2_decisions').select('id,batch_id,decision,reviewer_name,comments,created_at').eq('tenant_id',tenant).eq('campaign_id',id).order('created_at',{ascending:false}),
  admin.from('studio_c2_checkpoints').select('id,sha256').eq('tenant_id',tenant).eq('campaign_id',id).maybeSingle(),
 ]);for(const r of [batches,reviews,comments,decisions,checkpoint])reviewDbError(r.error);
 const eligible=new Set((reviews.data??[]).filter(r=>r.decision==='accepted').map(r=>r.batch_id));
 const visible=(batches.data??[]).filter(b=>mode==='ad'||eligible.has(b.id));
 const visibleIds=new Set(visible.map(b=>b.id));
 return json({schemaReady:true,audience:mode,campaignName:saved.campaign.name,round:round?{id:round.id,run_id:round.run_id,round_no:round.round_no,version:round.version,phase:round.phase,status:round.status,blocker:mode==='ad'?round.blocker:null,previous_round_id:round.previous_round_id,replay_plan:mode==='ad'?round.replay_plan:null}:null,scope:c1?.scope??null,manifest:c1?.variantManifest??null,
  batches:visible.map(b=>clientReviewBatch(b,b.round_id===round?.id&&b.source_plan_version===saved.plan?.version&&round?.status==='active')),
  comments:(comments.data??[]).filter(c=>visibleIds.has(c.batch_id)&&(mode==='ad'||c.audience==='client')),reviews:mode==='ad'?reviews.data:[],decisions:decisions.data,checkpoint:checkpoint.data});
});}
export async function POST(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/reviews'>){return api(async()=>{
 const input=await body(request,draftReviewCommandSchema),saved=await reviewContext(z.uuid().parse((await ctx.params).id)),mode=audience(request);
 if(!saved.round)throw new ApiError(409,'DRAFT_ROUND_REQUIRED','Complete C1, A1 and draft assembly first.');
 if(input.action==='a2'&&mode!=='ad'||input.action==='c2'&&mode!=='client'||input.action==='comment'&&input.audience!==mode)throw new ApiError(403,'REVIEW_SURFACE_MISMATCH','Submit this action from its matching review view.');
 const {batch,a2}=await reviewedBatch(saved,input.batchId,mode),args={target_round:batch.round_id,expected_version:input.expectedVersion,request_key:input.requestId,acting_user:saved.actorId};
 if(input.action==='comment'){
  commentTarget(batch.payload.programs,input,mode==='client'?saved.c1.scope.referencePlacement:undefined);
  const result=await saved.admin.rpc('studio_add_draft_comment',{...args,content:input});reviewDbError(result.error);return json({id:result.data,message:'Comment saved against this exact batch, scene and frame.'},201);
 }
 if(input.action==='a2'){
  const source=a2Snapshot({campaignId:saved.campaign.id,runId:batch.run_id,roundId:batch.round_id,actorId:saved.actorId,batch:{revisionId:batch.id,sha256:batch.sha256},sourcePlanVersion:batch.source_plan_version,decision:input.decision,reviewerName:input.reviewerName,comments:input.comments,attestations:input.attestations});
  const result=await saved.admin.rpc('studio_review_a2',{...args,source});reviewDbError(result.error);return json({id:result.data,message:input.decision==='accepted'?'A2 accepted. This exact batch is now offered for C2.':'A2 changes recorded. Edit and compile a new plan revision.'},201);
 }
 let source:null|string=null;
 if(input.decision==='accepted'){
  if(!a2||a2.decision!=='accepted')throw new ApiError(409,'A2_REQUIRED','Accept this exact batch at A2 first.');
  const round=checked(await saved.admin.from('studio_workflow_rounds').select('a1_id').eq('id',batch.round_id).single()),a1=checked(await saved.admin.from('studio_a1_reviews').select('id,sha256').eq('id',round?.a1_id).single());if(!a1)throw new ApiError(409,'A1_REQUIRED','This round needs an accepted Brand Kit.');
  try{source=c2Snapshot({c1:parseCheckpoint(saved.c1),batch,a1,a2,actorId:saved.actorId,selection:input.selectedConceptIds}).source;}catch(e){throw new ApiError(409,'C2_SELECTION_REQUIRED',e instanceof Error?e.message:'Invalid selection.');}
 }
 const result=await saved.admin.rpc('studio_review_c2',{...args,content:input,checkpoint_source:source});reviewDbError(result.error);if(input.decision==='changes_requested'&&process.env.STUDIO_LOCAL_COMPUTE==='true')await startLocalWorkflow().catch(()=>{});return json({...result.data,message:input.decision==='accepted'?'C2 accepted. Exact scope, selected concepts, bindings, contracts and frozen settings are saved. Final generation is the next milestone.':'Feedback saved. A new full post-C1 round is waiting for the studio to review its Brand Kit at A1. Prior history and spending remain.'},201);
});}
