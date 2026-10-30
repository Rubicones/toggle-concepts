import 'server-only';
import {readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {studioContext,campaignRecord,checked} from './studio';
import {ApiError} from './api';
import {objectStore} from '@/packages/media/s3.server';
import {confinedPath} from '@/packages/director/policy.local';
import {liveSource} from '@/apps/local-runner/director/live-bundle';
import {restoreSavedLiveSource} from '@/apps/local-runner/director/saved-live-source';
import {sandboxTool} from '@/apps/local-runner/director/sandbox';
import {digest} from '@/packages/director/money';
import type {BlockSnapshot,WorkState} from '@/packages/director/state';
import type {CatalogEntry,DirectionInput} from '@/packages/director/types';
import type {Design} from '@/packages/director/contract';
import {previewMaterialAllowed} from '@/packages/director/material-memory';
import {liveResourceBindings} from '@/packages/director/resources';
import type {LiveAsset,LivePreview,LiveOptions} from '@/packages/director/live-preview';
import {liveReferenceVariant} from '@/packages/director/live-preview';
import {squareReference} from '@/packages/director/construction';
import {draftConstruction} from '@/apps/local-runner/director/construction';
import type {DraftConstruction} from '@/packages/director/construction';
import {sourceChecks,recordPreviewEvidence} from '@/apps/local-runner/director/review-evidence';
import type {SourceChecks,ReviewRecord} from '@/packages/director/review';
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
type Context={blockId:string;route:'live'|'paused'|'quote';sourceChecks?:SourceChecks;folder:string;input:DirectionInput;snapshot:Pick<BlockSnapshot,'files'>;catalog:CatalogEntry[];design?:Design;construction?:DraftConstruction};
async function context(campaignId:string,directionId:string,iterationId?:string):Promise<Context>{
 await campaignRecord(campaignId);const {admin,tenant}=await studioContext();
 const iteration=iterationId?checked(await admin.from('studio_director_iterations').select('id,block_id,source_hash,design:payload->design,catalog:payload->catalog,construction:payload->construction,sourceChecks:payload->sourceChecks').eq('id',iterationId).eq('direction_id',directionId).maybeSingle()):null;
 const query=admin.from('studio_director_blocks').select('id,inputs:snapshot->inputs,files:snapshot->files').eq('campaign_id',campaignId).eq('tenant_id',tenant).neq('status','quoted');
 const block=checked(await (iteration?query.eq('id',iteration.block_id):query.contains('snapshot',{inputs:[{directionId}]})).order('created_at',{ascending:false}).limit(1).maybeSingle());
 if(!block||iterationId&&!iteration)throw new ApiError(404,'DIRECTION_NOT_FOUND','This direction is not available.');
 const snapshot={files:block.files as BlockSnapshot['files']},input=structuredClone((block.inputs as DirectionInput[]).find(i=>i.directionId===directionId)!);if(input.stage!=='draft')throw new ApiError(409,'LIVE_STATIC_DRAFT_REQUIRED','Live preview is available for static drafts.');
 if(iteration){
  const folder=resolve('artifacts/m09/preview-revisions',iteration.id,iteration.source_hash);
  await restoreSavedLiveSource(folder,iteration.source_hash,async()=>{
   const archive=checked(await admin.from('studio_director_iterations').select('source:payload->source').eq('id',iteration.id).eq('block_id',block.id).eq('direction_id',directionId).eq('source_hash',iteration.source_hash).single());
   return archive!.source as {hash:string;files:{path:string;source:string;sha256:string}[]};
  });
  input.iterationId=iteration.id;return {blockId:block.id,route:'quote',sourceChecks:iteration.sourceChecks as SourceChecks|undefined,folder,input,snapshot,catalog:(iteration.catalog??[]) as CatalogEntry[],design:iteration.design as Design,construction:iteration.construction as DraftConstruction|undefined};
 }
 const work=checked(await admin.from('studio_director_work').select('state,iteration_id,status').eq('block_id',block.id).eq('direction_id',directionId).maybeSingle());if(!work)throw new ApiError(404,'DIRECTION_NOT_FOUND','This direction is not available.');
 const state=work.state as WorkState;input.iterationId=work.iteration_id;
 const folder=resolve('artifacts/m08/workspaces',input.runId,input.roundId,input.directionId,input.iterationId);
 return {blockId:block.id,route:['queued','running'].includes(work.status)?'live':['review','waiting'].includes(work.status)?'paused':'quote',folder,input,snapshot,catalog:state.catalog??[],design:state.design};
}
function assets(ctx:Context){
 const rows=new Map<string,LiveAsset&{objectKey?:string;revisionId?:string;proxy?:boolean}>();
 for(const file of ctx.snapshot.files)if(/^(image\/|font\/)|woff|opentype|truetype/.test(file.mime))rows.set(file.url,{name:file.url,mime:file.mime,sha256:file.sha256,objectKey:file.objectKey});
 for(const file of ctx.catalog)rows.set(file.url,{name:file.url,mime:file.mime,sha256:file.renderSha256??file.sha256,revisionId:file.revisionId,proxy:file.proxy});
 return [...rows.values()].filter(file=>previewMaterialAllowed(ctx.design?.materialMemory??ctx.input.materialMemory,file.name));
}
type Bundle={revision:string;options:LiveOptions;legacy:boolean};const builds=new Map<string,Promise<Bundle>>();
export async function liveDirectorPreview(campaignId:string,directionId:string,iterationId?:string):Promise<LivePreview>{
 const ctx=await context(campaignId,directionId,iterationId);let source;try{const root=await realpath(ctx.folder);if(root!==ctx.folder)throw new Error('WORKSPACE_SYMLINK_REJECTED');source=await liveSource(ctx.folder);}catch(error){if(['ENOENT','FRAME_NOT_WRITTEN'].includes((error as NodeJS.ErrnoException).code??(error as Error).message)){if(iterationId)throw new ApiError(409,'SAVED_PREVIEW_SOURCE_UNAVAILABLE','This saved component could not be loaded. Its stored source is retained; retry this saved preview.');return {status:'waiting',message:'The coder’s first Frame.tsx will appear here as soon as it builds.'};}throw error;}
 let info:Bundle|undefined,message:string|undefined;
 try{const saved=JSON.parse(await readFile(resolve(ctx.folder,'.reports','live',source.revision,'manifest.json'),'utf8'));info=saved;}catch{
  try{let pending=builds.get(ctx.folder);if(!pending){pending=sandboxTool(ctx.folder,'preview',{}).then(text=>JSON.parse(text.trim().split('\n').at(-1)!) as Bundle).finally(()=>builds.delete(ctx.folder));builds.set(ctx.folder,pending);}info=await pending;}catch(error){if(iterationId){console.error('[saved preview] build failed',error);throw new ApiError(409,'SAVED_PREVIEW_BUILD_FAILED','This saved component could not be built for preview. Its stored source is unchanged. Retry this saved preview; no generation is needed.');}message='The coder is updating the source. The last working preview stays available.';try{info=JSON.parse(await readFile(resolve(ctx.folder,'.reports','live-latest.json'),'utf8'));}catch{return {status:'waiting',message:'The first preview is still building. Code errors are shown in Activity.'};}}
 }
 const pictures=assets(ctx).map(({name,mime,sha256})=>({name,mime,sha256})),resources=liveResourceBindings(ctx.input,ctx.design?.resources??[],ctx.catalog);
 const scenes=ctx.design?.keyFrames??ctx.input.storyboard.map(s=>({sceneId:s.id,moments:[{id:'key-frame',description:'Key frame'}]})),identity={blockId:ctx.blockId,directionId:ctx.input.directionId,iterationId:ctx.input.iterationId,revision:info!.revision,assetRevision:digest({pictures,resources,scenes})};
 await recordPreviewEvidence(ctx.folder,{identity,options:info!.options,legacy:info!.legacy,variants:ctx.input.variants,scenes,assets:pictures,formats:ctx.input.formats});
 const reviewRows=await (await studioContext()).admin.from('studio_director_reviews').select('id,action,target,body,recipient,created_at').eq('block_id',ctx.blockId).eq('direction_id',ctx.input.directionId).eq('target->>revision',identity.revision).eq('target->>assetRevision',identity.assetRevision).order('created_at',{ascending:false}).limit(100);
 if(reviewRows.error&&!['42P01','PGRST205'].includes(reviewRows.error.code??''))throw new Error(reviewRows.error.message);
 const review={identity,enabled:!reviewRows.error,route:ctx.route,checks:await sourceChecks(ctx.folder,info!.revision,ctx.sourceChecks),records:(reviewRows.data??[]) as ReviewRecord[]};
 const options=info!.options,reference=liveReferenceVariant(ctx.input.variants,options)??squareReference(ctx.input.variants)!,legacyFormat=ctx.input.formats.find(f=>f.id===reference.format),scene=ctx.design?.keyFrames?.find(s=>s.sceneId===options.scenes[0])??ctx.design?.keyFrames?.[0];
 return {status:message?'updating':'ready',message,revision:info!.revision,assetRevision:identity.assetRevision,review,assets:pictures,resources,options,construction:ctx.construction??await draftConstruction(ctx.folder,ctx.input),legacy:info!.legacy,variants:ctx.input.variants,scenes,defaultProps:{format:info!.legacy?reference.format:'square',width:info!.legacy?legacyFormat?.width??1080:1080,height:info!.legacy?legacyFormat?.height??1080:1080,locale:reference.locale,hook:reference.hook,cta:reference.cta,length:reference.length,sceneId:options.scenes[0]??scene?.sceneId??ctx.input.storyboard[0].id,moment:scene?.moments[0]?.id??'key-frame'}};
}
export async function liveDirectorArtifact(campaignId:string,directionId:string,args:{iterationId?:string;revision?:string;name?:string;kind:'bundle'|'asset'|'source'}){
 const ctx=await context(campaignId,directionId,args.iterationId);
 if(args.kind==='source'){const source=await liveSource(ctx.folder);return {json:{hash:source.revision,files:source.files}};}
 if(args.kind==='bundle'){if(!args.revision||!/^[a-f0-9]{64}$/.test(args.revision))throw new ApiError(400,'INVALID_PREVIEW_REVISION','Choose a built preview revision.');const folder=resolve(ctx.folder,'.reports','live',args.revision);await readFile(resolve(folder,'manifest.json'));return {json:{script:await readFile(resolve(folder,'preview.js'),'utf8'),css:await readFile(resolve(folder,'preview.css'),'utf8').catch(()=>'')}};}
 const file=assets(ctx).find(f=>f.name===args.name);if(!file)throw new ApiError(404,'PREVIEW_ASSET_NOT_FOUND','This picture is not part of the approved draft.');
 let bytes:Buffer;try{bytes=await readFile(await confinedPath(ctx.folder,'public/'+file.name));}catch{
  if(file.objectKey){bytes=file.objectKey.startsWith('fixtures/')?await readFile(resolve('public',file.objectKey)):(await objectStore().get(file.objectKey)).body;}
  else{const {admin,tenant}=await studioContext(),row=checked(await admin.from('asset_revisions').select('object_key,sha256').eq('id',file.revisionId!).eq('campaign_id',campaignId).eq('tenant_id',tenant).maybeSingle());if(!row)throw new ApiError(404,'PREVIEW_ASSET_NOT_FOUND','This picture is not available.');bytes=(await objectStore().get(row.object_key)).body;if(hash(bytes)!==row.sha256)throw new Error('RESOURCE_BYTES_CHANGED');if(file.proxy){const {createCanvas,loadImage}=await import('@napi-rs/canvas'),image=await loadImage(bytes),s=Math.min(1,512/Math.max(image.width,image.height)),canvas=createCanvas(Math.max(1,Math.round(image.width*s)),Math.max(1,Math.round(image.height*s)));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);bytes=canvas.toBuffer('image/png');}}
 }
 if(bytes.length>10485760||hash(bytes)!==file.sha256)throw new Error('PREVIEW_ASSET_BYTES_CHANGED');return {bytes,mime:file.mime};
}
