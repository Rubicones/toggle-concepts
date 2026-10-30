import {promoteEventImage} from '../../../packages/director/event-image';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {checked,sharedTenant} from '../../../packages/data/shared-runtime';
import {publishStudioChange} from '../../../packages/data/studio-changes';
import {objectStore} from '../../../packages/media/s3.server';
import type {DirectorEvent} from '../../../packages/director/events';
import {publicStepMessage,boundedEventDetail} from '../../../packages/director/events';
export function directorEvents(admin:SupabaseClient,context:{blockId:string;directionId:string;iterationId:()=>string;campaignId:string;device:string;token:number;models?:Record<string,string>}){
 const emit=async(key:string,event:Omit<DirectorEvent,'id'|'at'>,imagePath?:string)=>{
  let image:unknown;
  if(imagePath){const bytes=await readFile(imagePath),sha=createHash('sha256').update(bytes).digest('hex'),objectKey=`media/${sharedTenant}/${context.campaignId}/director/events/${sha}.png`;await promoteEventImage(objectStore(),objectKey,bytes);image={objectKey,mime:'image/png'};}
  checked(await admin.rpc('studio_append_director_event',{target:context.blockId,direction:context.directionId,iteration:context.iterationId(),device:context.device,token:context.token,event_key:`${context.iterationId()}:${key}`,document:{costMicroUsd:0,model:context.models?.[({design:'director',picture:'resources',coder:'assembler',checks:'assembler',critic:'critic'} as Record<string,string>)[event.kind]??'local']??'Local processing',...event,detail:boundedEventDetail(event.detail),stepId:`${context.iterationId()}:${event.stepId}`,message:publicStepMessage(event.message),...(image?{image}:{} )}}));
  await publishStudioChange('work').catch(()=>{});
 };
 return {emit,async tool(turn:number,action:{tool:string;path?:string;source?:string},execute:()=>Promise<unknown>){
  const key=`coder:${turn}:${action.tool}:${action.path??''}`,startedAt=new Date().toISOString();await emit(key+':running',{stepId:key,kind:'coder',status:'running',startedAt,message:`The coder is ${action.tool==='write'?'saving its layout':'checking its work'}.`});
  try{const result=await execute();await emit(key+':done',{stepId:key,kind:['checks','typecheck','bundle'].includes(action.tool)?'checks':'coder',status:'done',startedAt,endedAt:new Date().toISOString(),message:action.tool==='write'?`The coder saved ${action.path?.split('/').at(-1)} (${Buffer.byteLength(action.source??'')} bytes).`:`The coder finished ${action.tool==='typecheck'?'checking types':action.tool==='bundle'?'building the layout':action.tool==='finish'?'this version':action.tool==='checks'?'automatic checks':action.tool==='renderStill'?'a still preview':({read:'reading its source',listResources:'listing available pictures',brand:'reading the brand guide',lint:'checking code policy'} as Record<string,string>)[action.tool]??'its working step'}.`,detail:{action:{tool:action.tool,path:action.path},result}});
   if(action.tool==='renderStill'&&result&&typeof result==='object'&&'output' in result&&!('stills' in result)){const r=result as {output?:string;stills?:{output?:string;file:string}[]};const files=r.stills?.map(s=>({output:s.output??r.output!,file:s.file}))??(await readdir(r.output!)).filter(f=>f.endsWith('.png')).map(file=>({output:r.output!,file}));for(const {output,file} of files){await emit(`${key}:${output.split('/').at(-1)}:${file}`,{stepId:`${key}:${output.split('/').at(-1)}:${file}`,kind:'render',status:'done',message:'Work in progress, not checked.'},resolve(output,file));}}
   return result;
  }catch(error){await emit(key+':failed',{stepId:key,kind:['checks','typecheck','bundle'].includes(action.tool)?'checks':'coder',status:'failed',endedAt:new Date().toISOString(),message:'This coding step needs another attempt.',detail:{error:error instanceof Error?error.message:'Tool failed',...(error&&typeof error==='object'&&'sourceRevision' in error?{sourceRevision:error.sourceRevision}:{})}});throw error;}
 }};
}

/** Free on-demand jobs have a separate lease; completed direction work must never be impersonated. */
export function directorDeliveryEvents(admin:SupabaseClient,context:{iterationId:string;variantId:string;campaignId:string;device:string;token:number}){
 return async(key:string,event:Omit<DirectorEvent,'id'|'at'>,imagePath?:string)=>{
  let image:unknown;if(imagePath){const bytes=await readFile(imagePath),sha=createHash('sha256').update(bytes).digest('hex'),objectKey=`media/${sharedTenant}/${context.campaignId}/director/events/${sha}.png`;await promoteEventImage(objectStore(),objectKey,bytes);image={objectKey,mime:'image/png'};}
  checked(await admin.rpc('studio_append_director_delivery_event',{iteration:context.iterationId,variant:context.variantId,device:context.device,token:context.token,event_key:`${context.iterationId}:${context.variantId}:${key}`,document:{costMicroUsd:0,model:'Local still renderer',...event,stepId:`${context.iterationId}:${context.variantId}:${event.stepId}`,detail:boundedEventDetail(event.detail),message:publicStepMessage(event.message),...(image?{image}:{})}}));await publishStudioChange('work').catch(()=>{});
 };
}
