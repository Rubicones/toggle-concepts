import {createHash} from 'node:crypto';
import {adminClient,checked,sharedTenant,sharedActors} from '../../packages/data/shared-runtime';
import {validateNextUpload} from '../../packages/media/validate-upload.local';
import type {StillProducer} from '../../packages/creative/media';
import {stillPromptText} from '../../packages/creative/still-prompt';
import type {CreativeInputs} from '../../packages/creative/protocol';
/** Use the existing image admission/receipt path. Never retry a failed or unknown submission. */
export function creativeStillProducer(job:{id:string;run_id:string;round_id:string;campaign_id:string},input:CreativeInputs,options:{director?:{blockId:string;directionId:string;resourceId:string};onReceipt?:(receipt:{stepId:string;costMicroUsd:number|null;reused:boolean})=>Promise<void>}={}):StillProducer{
 return async request=>{
  if(!input.mediaEstimate||!request.maxCostMicroUsd)throw new Error('MEDIA_PRICE_REQUIRED');
  const host=new URL(process.env.NEXT_PUBLIC_APP_URL??'https://invalid');if(!['localhost','127.0.0.1','[::1]'].includes(host.hostname))throw new Error('LOCAL_DEVICE_REQUIRED');
  const admin=adminClient(),text=stillPromptText(request.prompt);
  // One request ID per still and attempt. A request the provider refused (settled as failed) may be retried twice with a
  // new ID; a request whose outcome is unknown is never resubmitted (it may have been charged).
  let requestId='',step:{id:string;status:string;output:string|null;cost_micro_usd:number|null;error_code:string|null}|null=null;
  for(let attempt=0;attempt<3;attempt++){
   // The words sent to the model are part of the request identity: a better prompt gets fresh attempts.
   const digest=createHash('sha256').update(`${job.run_id}:${job.round_id}:${request.key}:${createHash('sha256').update(`still-request@2\n${text}`).digest('hex')}${attempt?`:retry${attempt}`:''}`).digest('hex');
   requestId=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
   step=checked(await admin.from('studio_agent_steps').select('id,status,output,cost_micro_usd,error_code').eq('tenant_id',sharedTenant).eq('request_id',requestId).maybeSingle());
   // A still whose cost was reconciled after an unknown outcome was delivered and paid for: use it, never buy it again.
   if(step?.status!=='failed'||step.error_code==='RECONCILED_NO_ACTIVATION'||attempt===2)break;
  }
  const reused=!!step;
  if(!step){
   let response:Response;try{response=await fetch(new URL(`/api/studio/runs/${job.run_id}/steps`,host),{method:'POST',headers:{'Content-Type':'application/json',Origin:host.origin},body:JSON.stringify({role:'image',requestId,prompt:text,image:{aspectRatio:request.aspectRatio,referenceAssetIds:request.references,referenceUseConfirmed:true,...(request.derived?.length?{derivedReferences:request.derived}:{})},...(options.director?{director:{...options.director,maxCostMicroUsd:request.maxCostMicroUsd}}:{creative:{compileJobId:job.id,roundId:job.round_id,direction:input.direction,packHash:request.key,repair:false,maxCostMicroUsd:request.maxCostMicroUsd}})}),signal:AbortSignal.timeout(30000)});}catch(error){throw Object.assign(new Error('LOCAL_API_UNAVAILABLE'),{detail:`The build could not reach the app at ${host.origin} to request a still (${error instanceof Error?error.message:'network error'}). Keep next dev running there, or start the worker from the app so it uses the same address. Nothing was charged.`});}
   if(!response.ok){let code='CREATIVE_IMAGE_ADMISSION_REQUIRED',said='';try{const problem=await response.json();if(typeof problem.code==='string'&&/^[A-Z_]+$/.test(problem.code))code=problem.code;if(typeof problem.message==='string')said=problem.message.slice(0,300);}catch{/* retain admission failure */}
    // Nothing was sent to the provider. Say which budget stopped the still so the run page points at the right limit.
    const budget={STEP_CAP_REACHED:'The image role has reached its budget for this run (or one still costs more than its per-request cap). Raise the image agent cap in the run limits, then continue.',RUN_CAP_REACHED:'The run budget is used up. Raise the run cap in the run limits, then continue.'}[code];
    throw Object.assign(new Error(code),{detail:`The draft still was not requested (${code}); nothing was charged. ${budget??said}`});}
  }
  // Up to ~6 minutes: drawing plus reading the exact cost back can take a while. A longer wait resumes for free.
  for(let n=0;n<120;n++){
   step=checked(await admin.from('studio_agent_steps').select('id,status,output,cost_micro_usd,error_code').eq('tenant_id',sharedTenant).eq('request_id',requestId).single());
   if(!step)throw new Error('CREATIVE_IMAGE_RECEIPT_MISSING');
   // Name the provider outcome so the run page shows why the still is missing.
   if(step.status==='unknown')throw new Error(`CREATIVE_IMAGE_RECONCILIATION_REQUIRED:${step.error_code??'outcome unknown'}`);
   const reconciled=step.status==='failed'&&step.error_code==='RECONCILED_NO_ACTIVATION'&&!!step.output;
   if(['failed','cancelled'].includes(step.status)&&!reconciled){let said='';try{said=String(JSON.parse(step.output??'null')?.providerError??'');}catch{/* no saved explanation */}
    throw Object.assign(new Error(`CREATIVE_IMAGE_FAILED:${step.error_code??step.status}`),{detail:`The image provider refused this still (${step.error_code??step.status}); nothing was charged.${said?` Provider says: ${said}`:''}`});}
   if(step.status==='succeeded'||reconciled){
    // A delivered still whose exact cost the provider did not report stays charged at its reservation (the conservative
    // ledger); the picture itself is valid and is used.
    const output=JSON.parse(step.output??'null');
    const resource=output?.uploadId?checked(await admin.from('asset_revisions').select('id,sha256,object_key,mime,inspection').eq('tenant_id',sharedTenant).eq('campaign_id',job.campaign_id).eq('upload_session_id',output.uploadId).maybeSingle()):null;
    if(resource){await options.onReceipt?.({stepId:step.id,costMicroUsd:step.cost_micro_usd,reused});return {revisionId:resource.id,sha256:resource.sha256,objectKey:resource.object_key,mime:resource.mime,kind:'image',width:resource.inspection.width,height:resource.inspection.height};}
    // The still is paid and uploaded but not yet validated into the library (the image process validates it on exit;
    // a separate media worker may not run). Validate pending uploads here, locally and for free.
    if(n>=3&&output?.uploadId)await sharedActors().then(actors=>validateNextUpload(actors.worker)).catch(()=>null);
   }
   await new Promise(resolve=>setTimeout(resolve,3000));
  }
  throw Object.assign(new Error('CREATIVE_IMAGE_PENDING'),{detail:'A draft still is still being drawn. The build resumes by itself and collects it; nothing is bought twice.'});
 };
}

/** Director resources use the same priced image admission, receipts and reconciled outputs. */
export function directorStillProducer(context:{blockId:string;runId:string;roundId:string;campaignId:string;directionId:string},estimate:{perStillMicroUsd:number;maxStills:number}){
 return async(request:import('../../packages/creative/media').StillRequest,resource:import('../../packages/director/types').Resource)=>{
  let receipt:{stepId:string;costMicroUsd:number|null;reused:boolean}|undefined;
  const frame=await creativeStillProducer({id:context.blockId,run_id:context.runId,round_id:context.roundId,campaign_id:context.campaignId},{direction:0,mediaEstimate:{perStillMicroUsd:estimate.perStillMicroUsd,stillCount:estimate.maxStills}} as CreativeInputs,{director:{blockId:context.blockId,directionId:context.directionId,resourceId:resource.id},onReceipt:async value=>{receipt=value;}})(request);
  if(!receipt||receipt.costMicroUsd===null)throw new Error('RESOURCE_RECEIPT_REQUIRED');
  const bytes=(await (await import('../../packages/media/s3.server')).objectStore().get(frame.objectKey)).body;
  return {...frame,bytes,stepId:receipt.stepId,costMicroUsd:receipt.costMicroUsd,reused:receipt.reused};
 };
}
