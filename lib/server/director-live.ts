import 'server-only';
import {usesDesigner} from '@/packages/director/designer';
import {readFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {studioContext,campaignRecord,checked} from './studio';
import {ApiError} from './api';
import {objectStore} from '@/packages/media/s3.server';
import {confinedPath} from '@/packages/director/policy.local';
import {existsSync} from 'node:fs';
import {liveSource} from '@/apps/local-runner/director/live-bundle';
import {restoreSavedLiveSource} from '@/apps/local-runner/director/saved-live-source';
import {sandboxTool} from '@/apps/local-runner/director/sandbox';
import {digest} from '@/packages/director/money';
import type {BlockSnapshot,WorkState} from '@/packages/director/state';
import type {CatalogEntry,DirectionInput} from '@/packages/director/types';
import type {Design} from '@/packages/director/contract';
import {previewMaterialAllowed} from '@/packages/director/material-memory';
import {liveResourceBindings} from '@/packages/director/resources';
import {finalVersionNotes} from '@/packages/director/final-notes';
import type {LiveAsset,LivePreview,LiveOptions} from '@/packages/director/live-preview';
import {liveReferenceVariant,designedFormats,liveFormat} from '@/packages/director/live-preview';
import {fontFindingLines} from '@/packages/director/layout-inspection';
import {squareReference} from '@/packages/director/construction';
import {draftConstruction} from '@/apps/local-runner/director/construction';
import type {DraftConstruction} from '@/packages/director/construction';
import {sourceChecks,recordPreviewEvidence} from '@/apps/local-runner/director/review-evidence';
import type {SourceChecks,ReviewRecord} from '@/packages/director/review';
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
type Context={blockId:string;route:'live'|'paused'|'quote';sourceChecks?:SourceChecks;folder:string;input:DirectionInput;snapshot:Pick<BlockSnapshot,'files'>;catalog:CatalogEntry[];design?:Design;construction?:DraftConstruction;designer?:{renders?:Record<string,number>;findings?:{views:string[]}[];hero?:{sceneId:string;format:string;accepted:boolean}};/** Point 2d: the latest measured findings, when any. */measured?:{code:string;detail:string}[];/** The work lives on another studio computer. */remote?:boolean};
async function context(campaignId:string,directionId:string,iterationId?:string):Promise<Context>{
 await campaignRecord(campaignId);const {admin,tenant}=await studioContext();
 const iteration=iterationId?checked(await admin.from('studio_director_iterations').select('id,block_id,source_hash,design:payload->design,catalog:payload->catalog,construction:payload->construction,sourceChecks:payload->sourceChecks,designer:payload->designer,review:payload->review').eq('id',iterationId).eq('direction_id',directionId).maybeSingle()):null;
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
  input.iterationId=iteration.id;return {blockId:block.id,route:'quote',sourceChecks:iteration.sourceChecks as SourceChecks|undefined,folder,input,snapshot,catalog:(iteration.catalog??[]) as CatalogEntry[],design:iteration.design as Design,construction:iteration.construction as DraftConstruction|undefined,designer:{renders:(iteration.designer as {renders?:Record<string,number>}|null)?.renders,...((iteration.designer as {hero?:{sceneId:string;format:string;state:string}}|null)?.hero?{hero:{sceneId:(iteration.designer as {hero:{sceneId:string}}).hero.sceneId,format:(iteration.designer as {hero:{format:string}}).hero.format,accepted:(iteration.designer as {hero:{state:string}}).hero.state==='accepted'}}:{}),findings:((iteration.review as {inspection?:{findings?:{severity:string;views:string[]}[]}}|null)?.inspection?.findings??[]).filter(f=>f.severity==='hard')},measured:(iteration.review as {inspection?:{findings?:{code:string;detail:string}[]}}|null)?.inspection?.findings};
 }
 const work=checked(await admin.from('studio_director_work').select('state,iteration_id,status').eq('block_id',block.id).eq('direction_id',directionId).maybeSingle());if(!work)throw new ApiError(404,'DIRECTION_NOT_FOUND','This direction is not available.');
 const state=work.state as WorkState;input.iterationId=work.iteration_id;
 let folder=resolve('artifacts/m08/workspaces',input.runId,input.roundId,input.directionId,input.iterationId),remote=false;
 // Work made on another studio computer (a colleague's Local Claude run) has no workspace folder here.
 // 1. While it is being made: the worker shares each working revision in storage (live-share.ts); show the latest.
 // 2. Otherwise its sealed iteration keeps the full source in the database.
 if(!existsSync(folder)){
  remote=true;
  const shared=checked(await admin.from('studio_director_events').select('live:payload->detail->liveSource').eq('block_id',block.id).eq('direction_id',directionId).eq('iteration_id',work.iteration_id).not('payload->detail->liveSource','is',null).order('created_at',{ascending:false}).limit(1).maybeSingle()) as {live?:{hash?:unknown;objectKey?:unknown}}|null;
  const live=shared?.live;
  if(live&&typeof live.hash==='string'&&/^[a-f0-9]{64}$/.test(live.hash)&&typeof live.objectKey==='string'&&live.objectKey.startsWith(`media/${tenant}/${campaignId}/director/live/`)){
   const hash=live.hash,objectKey=live.objectKey;folder=resolve('artifacts/m09/remote-live',directionId,hash);
   await restoreSavedLiveSource(folder,hash,async()=>JSON.parse(Buffer.from((await objectStore().get(objectKey)).body).toString('utf8')));
  }else{
   const sealed=work.iteration_id?checked(await admin.from('studio_director_iterations').select('id').eq('id',work.iteration_id).eq('direction_id',directionId).maybeSingle()):null;
   if(sealed)return {...await context(campaignId,directionId,sealed.id),route:['queued','running'].includes(work.status)?'live':['review','waiting'].includes(work.status)?'paused':'quote',remote:true};
   return {blockId:block.id,route:'live',folder,input,snapshot,catalog:[],remote:true};
  }
 }
 return {blockId:block.id,route:['queued','running'].includes(work.status)?'live':['review','waiting'].includes(work.status)?'paused':'quote',remote,folder,input,snapshot,catalog:state.catalog??[],design:state.design,...(state.designer?.lastRender?{measured:state.designer.lastRender.findings.map(f=>({code:f.code,detail:f.detail}))}:{}),designer:{...(state.designer?.hero?{hero:{sceneId:state.designer.hero.sceneId,format:state.designer.hero.format,accepted:state.designer.hero.state==='accepted'}}:{}),renders:state.designer?.renders,findings:state.designer?.lastRender?state.designer.lastRender.findings.filter(f=>f.severity==='hard').map(f=>({views:[f.view]})):[]}};
}
function assets(ctx:Context){
 const rows=new Map<string,LiveAsset&{objectKey?:string;revisionId?:string;proxy?:boolean}>();
 for(const file of ctx.snapshot.files)if(/^(image\/|font\/)|woff|opentype|truetype/.test(file.mime))rows.set(file.url,{name:file.url,mime:file.mime,sha256:file.sha256,objectKey:file.objectKey});
 for(const file of ctx.catalog)rows.set(file.url,{name:file.url,mime:file.mime,sha256:file.renderSha256??file.sha256,revisionId:file.revisionId,proxy:file.proxy});
 // A cutout is a derived, content-addressed file (designer pipeline plan, point 2c): loaded from staging when the workspace is gone.
 for(const file of ctx.catalog)if(file.cutout)rows.set(file.cutout.url,{name:file.cutout.url,mime:'image/png',sha256:file.cutout.sha256,objectKey:file.cutout.objectKey});
 return [...rows.values()].filter(file=>previewMaterialAllowed(ctx.design?.materialMemory??ctx.input.materialMemory,file.name));
}
type Bundle={revision:string;options:LiveOptions;legacy:boolean};const builds=new Map<string,Promise<Bundle>>();
export async function liveDirectorPreview(campaignId:string,directionId:string,iterationId?:string):Promise<LivePreview>{
 const ctx=await context(campaignId,directionId,iterationId);let source;try{const root=await realpath(ctx.folder);if(root!==ctx.folder)throw new Error('WORKSPACE_SYMLINK_REJECTED');source=await liveSource(ctx.folder);}catch(error){if(['ENOENT','FRAME_NOT_WRITTEN'].includes((error as NodeJS.ErrnoException).code??(error as Error).message)){if(iterationId)throw new ApiError(409,'SAVED_PREVIEW_SOURCE_UNAVAILABLE','This saved component could not be loaded. Its stored source is retained; retry this saved preview.');return {status:'waiting',message:ctx.remote?'This direction is being made on another studio computer. Its preview appears here as soon as a version is saved.':'The coder’s first Frame.tsx will appear here as soon as it builds.'};}throw error;}
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
 const finalNotes=finalVersionNotes(ctx.design,ctx.input);
 const formats=usesDesigner(ctx.input)?designedFormats(ctx.input.formats,(ctx.design?.keyFrames??[]).map(k=>k.sceneId),ctx.designer?.renders??{},ctx.designer?.findings??[],ctx.designer?.hero):[];
 // Point 3d: a designer draft with a hero frame opens on the hero scene in the hero format.
 const hero=ctx.designer?.hero,heroFormat=ctx.input.brief.squarePreviewVersion===1?ctx.input.formats[0]:hero?ctx.input.formats.find(f=>f.id===hero.format):undefined,heroSceneId=hero&&(options.scenes.includes(hero.sceneId)||!options.scenes.length)?hero.sceneId:undefined;
 return {squareOnly:ctx.input.brief.squarePreviewVersion===1,status:message?'updating':'ready',message,revision:info!.revision,assetRevision:identity.assetRevision,review,...(finalNotes.length?{finalNotes}:{}),...(usesDesigner(ctx.input)?{designer:true,formats}:{}),...(ctx.measured?{fontChecks:fontFindingLines(ctx.measured)}:{}),assets:pictures,resources,options,construction:ctx.construction??await draftConstruction(ctx.folder,ctx.input),legacy:info!.legacy,variants:ctx.input.variants,scenes,defaultProps:{format:heroFormat?liveFormat(heroFormat.width,heroFormat.height):info!.legacy?reference.format:'square',width:heroFormat?.width??(info!.legacy?legacyFormat?.width??1080:1080),height:heroFormat?.height??(info!.legacy?legacyFormat?.height??1080:1080),locale:reference.locale,hook:reference.hook,cta:reference.cta,length:reference.length,sceneId:heroSceneId??options.scenes[0]??scene?.sceneId??ctx.input.storyboard[0].id,moment:scene?.moments[0]?.id??'key-frame'}};
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
