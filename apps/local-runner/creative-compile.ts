import {plannedMediaAspect} from '../../packages/creative/slot-bindings';
import {deliveryFiles,storeDelivery} from './creative-delivery';
import {renderSceneEvidence} from '../../packages/creative/scene-evidence.local';
import type {SceneStrip} from '../../packages/creative/scene-evidence';
import {checkCreativeQuality} from '../../packages/creative/quality.local';
import {completeBrandGraphics} from '../../packages/creative/brand-graphics';
import {produceMediaPlan} from '../../packages/creative/media';
import {planDraftMedia,mediaRuleIssues} from '../../packages/creative/media-rules';
import {creativeStillProducer} from './creative-stills';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {adminClient,checked,sharedTenant} from '../../packages/data/shared-runtime';
import {objectStore} from '../../packages/media/s3.server';
import {creativeDirectionSchema,type FrameResource} from '../../packages/contracts/frame-program';
import {canonicalJson} from '../../packages/contracts/common';
import {sourceStoryboard,upstreamValues,type CreativeInputs} from '../../packages/creative/protocol';
import {compileDirection} from '../../packages/creative/compile-v2';
import {programViews} from '../../packages/creative/program-reader';
import {normalizeScenesRaw,COMPILE_L0_VERSION} from '../../packages/creative/normalize';
import {ensureCopyElements} from '../../packages/creative/repair';
import {lockStoryboard} from '../../packages/creative/storyboard-align';
import {sceneSpecV2Schema} from '../../packages/contracts/creative-drafts';
import {loadCreativeFonts} from '../../packages/creative/fonts.local';
import {validateBuildIntegrity} from '../../packages/creative/build-integrity';
import type {VariantEntry} from '../../packages/contracts/campaign';

export async function compileCreativeClaim(job:{id:string;run_id:string;campaign_id:string;round_id:string;lease_token:number;payload:{creativeInputs:CreativeInputs;manifest:{entries:VariantEntry[]};brandSystemHash:string}},device:string){
 const admin=adminClient(),input=job.payload.creativeInputs;
 // Postgres jsonb cannot store U+0000; never let a stray NUL character fail the whole local build.
 const finish=async(output:unknown,failure:string|null)=>checked(await admin.rpc('studio_finish_creative_local',{target_job:job.id,token:job.lease_token,device,source:canonicalJson(output).replace(/(?<!\\)\\u0000/g,'\\u001f'),failure}));
 try{
  checked(await admin.rpc('studio_begin_creative_local',{target_job:job.id,token:job.lease_token,device}));
  const refs=checked(await admin.from('studio_workflow_dependencies').select('requires_id').eq('job_id',job.id))??[],parents=checked(await admin.from('studio_workflow_jobs').select('output').in('id',refs.map(r=>r.requires_id)).eq('tenant_id',sharedTenant))??[];
  const upstream=upstreamValues(parents);
  const planning=checked(await admin.from('studio_workflow_jobs').select('output').eq('tenant_id',sharedTenant).eq('run_id',job.run_id).eq('job_key','script').maybeSingle());
  const source=sourceStoryboard(planning?.output?[planning]:[],input.direction);
  if(input.protocol!=='creative@2'&&upstream.script&&source.length)upstream.script.sourceScenes=source;
  // Re-apply the current free scene normalization, so code fixes reach directions whose scenes were saved earlier.
  // Saved scripts from before this rule may hold pinned copy without a text element; give it one before the scenes are re-read.
  if(input.protocol!=='creative@2'&&upstream.script){lockStoryboard(upstream.script,input.protectedCopy.map(p=>p.text));ensureCopyElements(upstream.script);}
  if(input.protocol!=='creative@2'&&upstream.scenes&&upstream.script)upstream.scenes=sceneSpecV2Schema.parse(normalizeScenesRaw(upstream.scenes,input.brand,upstream.script,upstream.treatment));
  let direction=creativeDirectionSchema.parse({id:input.directionId,...(input.protocol==='creative@2'?{skeleton:input.skeleton}:{}),...upstream});const resources:FrameResource[]=[...input.brand.fonts.flatMap(f=>f.files.map(file=>({revisionId:file.revisionId,sha256:file.sha256,objectKey:file.objectKey,mime:'font/sfnt',kind:'font' as const}))),...input.brand.logos.map(l=>({revisionId:l.revisionId,sha256:l.sha256,objectKey:l.objectKey,mime:l.mime,kind:'logo' as const}))];
  const assets=checked(await admin.from('asset_revisions').select('id,sha256,object_key,mime,inspection').eq('tenant_id',sharedTenant).eq('campaign_id',job.campaign_id).in('id',input.assetAliases.map(a=>a.revisionId)))??[];
  resources.push(...assets.map(a=>({revisionId:a.id,sha256:a.sha256,objectKey:a.object_key,mime:a.mime,kind:a.mime.startsWith('video/')?'video' as const:'image' as const,width:a.inspection.width,height:a.inspection.height})));
  if(input.protocol!=='creative@2')direction=completeBrandGraphics(direction,input.brand);
  direction.media=planDraftMedia(direction,input);
  const preflight=[...validateBuildIntegrity(direction,input),...mediaRuleIssues(direction,input)];
  if(preflight.some(i=>i.severity==='block')){await finish({version:'creative-result@1',stage:'compile',value:{direction,programs:[],contactFrames:[]},issues:preflight,repairLog:[]},null);return;}
  const sourceBytes=new Map<string,Buffer>();for(const resource of resources){if(resource.kind==='font')continue;const bytes=Buffer.from((await objectStore().get(resource.objectKey)).body);if(createHash('sha256').update(bytes).digest('hex')!==resource.sha256)throw new Error('SOURCE_BYTES_CHANGED');sourceBytes.set(resource.revisionId,bytes);}
  const engine=await loadCreativeFonts(input.brand,input.scope.referenceLocale,async key=>(await objectStore().get(key)).body);
  const facts=(input.brief?.facts??[]).filter(f=>f.status==='confirmed').map(f=>f.claim);
  if(direction.media.elements.some(e=>['generate','proxy'].includes(e.source))){
   if(!input.mediaEstimate)throw new Error('MEDIA_PRICE_REQUIRED');
   const planned=compileDirection(direction,input.brand,input.budget,input.scope,job.payload.manifest.entries,engine,resources,input.protectedCopy,true,undefined,facts);
   const produced=await produceMediaPlan(direction.media,input.brand,resources,creativeStillProducer(job,input),new Map(),{maxStills:input.mediaEstimate.stillCount,perStillMicroUsd:input.mediaEstimate.perStillMicroUsd,aspect:element=>plannedMediaAspect(direction,planned.config,input.scope.referencePlacement,element)});
   direction.media=produced.media;resources.push(...produced.produced);
   for(const resource of produced.produced){const bytes=Buffer.from((await objectStore().get(resource.objectKey)).body);if(createHash('sha256').update(bytes).digest('hex')!==resource.sha256)throw new Error('SOURCE_BYTES_CHANGED');sourceBytes.set(resource.revisionId,bytes);}
  }
  const shared=compileDirection(direction,input.brand,input.budget,input.scope,job.payload.manifest.entries,engine,resources,input.protectedCopy,true,undefined,facts),programs=programViews(shared);
  const reference=programs.find(p=>p.locale===input.scope.referenceLocale&&p.placementId===input.scope.referencePlacement)??programs[0];
  const quality=await checkCreativeQuality(shared,direction,input,engine,sourceBytes);shared.quality=quality;
  const issues=shared.issues;issues.push(...quality.issues);
  const sceneStrips:SceneStrip[]=[];
  if(!issues.some(i=>i.severity==='block')){for(const strip of await renderSceneEvidence(direction,shared,engine,sourceBytes,reference.engine.variant)){const {bytes,...evidence}=strip,key=`media/${sharedTenant}/${job.campaign_id}/creative/${job.id}/${strip.sha256}.png`;await objectStore().promote(key,bytes,'image/png').catch(async error=>{if(createHash('sha256').update((await objectStore().get(key)).body).digest('hex')!==strip.sha256)throw error;});sceneStrips.push({...evidence,objectKey:key});}}
  const contactFrames:{frame:number;blind:boolean;sha256:string;objectKey:string}[]=[];
  if(!issues.some(i=>i.severity==='block'))shared.delivery=await storeDelivery(await deliveryFiles(shared,direction,engine,sourceBytes,resolve('artifacts/m07f/delivery',job.id),{placement:input.scope.referencePlacement,locale:input.scope.referenceLocale}),job.campaign_id,job.id);
  await finish({version:'creative-result@1',stage:'compile',value:{direction,directionPrograms:[shared],contactFrames,sceneStrips,quality},issues,repairLog:[{direction:input.direction,level:'L0' as const,path:'compile',code:'L0_VERSION',action:COMPILE_L0_VERSION,costMicroUsd:0,attempt:0}]},null);
 }catch(error){const code=error instanceof Error?error.message:'CREATIVE_COMPILE_FAILED',detail=error instanceof Error&&typeof (error as {detail?:unknown}).detail==='string'?String((error as {detail?:unknown}).detail).slice(0,400):null;await finish({version:'creative-result@1',stage:'compile',value:null,issues:[{code,severity:'block',owner:'code',path:'compile',message:detail??'The local creative build needs recovery.',fix:'Check the source files or pending image receipt, then retry the local build. Paid image submissions keep their request IDs.'}],repairLog:[{direction:input.direction,level:'L0' as const,path:'compile',code:'L0_VERSION',action:COMPILE_L0_VERSION,costMicroUsd:0,attempt:0}]},code);}
}
