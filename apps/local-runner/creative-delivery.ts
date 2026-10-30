import {createHash} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import type {DirectionProgram,CreativeDirection,FrameProgram} from '../../packages/contracts/frame-program';
import type {GlyphEngine} from '../../packages/engine/text-snapshot';
import {snapshotEngine} from '../../packages/engine/text-snapshot';
import {programViews} from '../../packages/creative/program-reader';
import {renderSceneEvidence} from '../../packages/creative/scene-evidence.local';
import {offscreenPixels} from '../../packages/creative/quality.local';
import {canonicalJson} from '../../packages/contracts/common';
import type {DraftDelivery} from '../../packages/creative/delivery';
import {renderCreative} from './creative-render';
import {adminClient,checked,sharedTenant} from '../../packages/data/shared-runtime';
import {objectStore} from '../../packages/media/s3.server';
const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export async function deliveryFiles(program:DirectionProgram,direction:CreativeDirection,engine:GlyphEngine,sourceBytes:Map<string,Uint8Array>,output:string,reference={placement:program.variants[0].state.fmt,locale:program.variants[0].state.lang},renderVideo:(program:FrameProgram,urls:Record<string,string>,output:string)=>Promise<Uint8Array>=async(program,urls,output)=>{await renderCreative(program,urls,output,{mp4:true,contacts:false});return readFile(resolve(output,'creative.mp4'));}){
 if(!program.quality?.passed||program.issues.some(i=>i.severity==='block'))throw new Error('DRAFT_QA_BLOCKED');
 const view=programViews(program).find(v=>v.placementId===reference.placement&&v.locale===reference.locale)??programViews(program)[0],assetUrls=Object.fromEntries([...sourceBytes].map(([id,bytes])=>[id,`data:${program.resources.find(r=>r.revisionId===id)?.mime??'image/png'};base64,${Buffer.from(bytes).toString('base64')}`]));
 await mkdir(output,{recursive:true});
 const scenes=await renderSceneEvidence(direction,program,engine,sourceBytes,view.engine.variant);let pngs=scenes.map(s=>s.bytes);
 if(!pngs.length){const render=await offscreenPixels(program,engine,sourceBytes,view.engine.variant,640);pngs=[.15,.5,.85].map(p=>render.png(p*view.durationFrames/view.fps));}
 const images=await Promise.all(pngs.map(png=>loadImage(png))),strip=createCanvas(Math.max(...images.map(i=>i.width)),images.reduce((n,i)=>n+i.height,0)),g=strip.getContext('2d');let y=0;for(const image of images){g.drawImage(image,0,y);y+=image.height;}
 const contact=strip.toBuffer('image/png'),mp4=await renderVideo(view,assetUrls,output);
 if(mp4.length<12||Buffer.from(mp4.subarray(4,8)).toString()!=='ftyp')throw new Error('DRAFT_MP4_INVALID');
 return {variantId:view.variantId,programHash:hash(canonicalJson(program.config)),mp4:{bytes:mp4,sha256:hash(mp4),mime:'video/mp4'},contactStrip:{bytes:contact,sha256:hash(contact),mime:'image/png'}};
}
export async function storeDelivery(files:Awaited<ReturnType<typeof deliveryFiles>>,campaignId:string,buildId:string):Promise<DraftDelivery>{
 const store=objectStore();const save=async(file:typeof files.mp4,extension:string)=>{const objectKey=`media/${sharedTenant}/${campaignId}/creative/${buildId}/${file.sha256}.${extension}`;await store.promote(objectKey,Buffer.from(file.bytes),file.mime).catch(async error=>{if(hash((await store.get(objectKey)).body)!==file.sha256)throw error;});return {objectKey,sha256:file.sha256,mime:file.mime,bytes:file.bytes.length};};
 return {version:'creative-delivery@1',variantId:files.variantId,programHash:files.programHash,mp4:await save(files.mp4,'mp4'),contactStrip:await save(files.contactStrip,'png')};
}
/** Edit exports run in the local worker; a lease and config digest prevent stale publication. */
export async function processCreativeDelivery(device:string){
 const admin=adminClient(),claim=checked(await admin.rpc('studio_claim_creative_delivery',{target_tenant:sharedTenant,device}));if(!claim)return false;
 try{
  const revision=checked(await admin.from('studio_creative_edit_revisions').select('program').eq('id',claim.edit_revision_id).eq('tenant_id',sharedTenant).single()),job=checked(await admin.from('studio_workflow_jobs').select('campaign_id,output,payload').eq('id',claim.job_id).eq('tenant_id',sharedTenant).single());if(!revision||!job)throw new Error('DELIVERY_SOURCE_MISSING');const program=revision.program as DirectionProgram;
  if(hash(canonicalJson(program.config))!==claim.program_hash)throw new Error('DELIVERY_SOURCE_CHANGED');
  const direction=JSON.parse(job.output).value.direction as CreativeDirection,bytes=new Map<string,Uint8Array>();
  for(const resource of program.resources)if(resource.kind!=='font'){const source=(await objectStore().get(resource.objectKey)).body;if(hash(source)!==resource.sha256)throw new Error('SOURCE_BYTES_CHANGED');bytes.set(resource.revisionId,source);}
  const delivery=await storeDelivery(await deliveryFiles(program,direction,snapshotEngine(program.glyphs),bytes,resolve('artifacts/m07f/delivery',claim.id),{placement:job.payload.creativeInputs.scope.referencePlacement,locale:job.payload.creativeInputs.scope.referenceLocale}),job.campaign_id,claim.id);
  checked(await admin.rpc('studio_finish_creative_delivery',{target:claim.id,token:claim.lease_token,device,artifacts:delivery,failure:null}));
 }catch{checked(await admin.rpc('studio_finish_creative_delivery',{target:claim.id,token:claim.lease_token,device,artifacts:null,failure:'DRAFT_DELIVERY_FAILED'}));}
 return true;
}
