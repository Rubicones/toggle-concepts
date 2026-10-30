// Separate local provider process. Never imported by a Route Handler.
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir,rename,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {adminClient,checked,sharedTenant} from '../../packages/data/shared-runtime';
import {objectStore} from '../../packages/media/s3.server';
import {modelCatalog} from '../../packages/agents/catalog';
import {submitText,type TextReceipt} from '../../packages/agents/text-provider';
import {fieldExtractionRequest,parseFieldResponse,splitBrandText} from '../../packages/brand/field-extraction';
import type {AgentSetting} from '../../packages/contracts/shared';
const directory=resolve('artifacts/brand-fields/receipts');
async function rpc(name:string,args:Record<string,unknown>){return checked(await adminClient().rpc(name,args));}
export async function flushBrandReadReceipts(){
 await mkdir(directory,{recursive:true,mode:0o700});for(const file of await readdir(directory)){if(!file.endsWith('.json'))continue;const path=resolve(directory,file);await rpc('studio_complete_brand_read',JSON.parse(await readFile(path,'utf8')));await unlink(path);}
}
export async function processBrandFieldAnalysis():Promise<boolean>{
 const admin=adminClient();const ready=await admin.from('studio_brand_analyses').select('id').limit(0);if(ready.error)return false;const claim=await rpc('studio_claim_brand_read',{target_tenant:sharedTenant});if(!claim)return false;
 const {analysis,part,file}=claim;let submitted=false;
 const beat=setInterval(()=>{void rpc('studio_heartbeat_brand_read',{target_part:part.id,token:part.lease_token}).catch(()=>{});},15000);
 try{
  const material=checked(await admin.from('studio_brand_materials').select('id,extraction_sha,included,state,filename').eq('id',file.material_id).eq('tenant_id',sharedTenant).single());if(!material||material.extraction_sha!==file.source_sha||!material.included||material.state!=='ready')throw new Error('BRAND_SOURCE_CHANGED');
  const run=checked(await admin.from('studio_runs').select('config_snapshot,status').eq('id',analysis.run_id).eq('tenant_id',sharedTenant).single());if(run?.status!=='active')throw new Error('RUN_NOT_ACTIVE');
  const agent=(run.config_snapshot as AgentSetting[]).find(a=>a.role==='brand-kit');if(!agent?.model_id)throw new Error('AGENT_NOT_CONFIGURED');
  const model=(await modelCatalog()).find(m=>m.id===agent.model_id);if(!model||model.outputModalities.length!==1||model.outputModalities[0]!=='text')throw new Error('MODEL_UNAVAILABLE');
  const saved=[];let after=0;while(true){const batch=checked(await admin.from('studio_brand_findings').select('seq,field,value,locator').eq('part_id',part.id).gt('seq',after).order('seq').limit(100))??[];saved.push(...batch.map(({seq,...finding})=>{after=seq;return finding;}));if(batch.length<100)break;}
  const checkpoint=checked(await admin.from('studio_c1_checkpoints').select('id').eq('run_id',analysis.run_id).eq('tenant_id',sharedTenant).maybeSingle());
  const context={checkpointId:checkpoint?.id??null,source:{filename:file.filename,materialId:file.material_id,extractionSha:file.source_sha},part:part.payload,page:part.page_no,alreadySaved:saved};
  const briefReady=!(await admin.from('studio_brand_brief_findings').select('id').limit(0)).error;
  if(briefReady){let cursor=0;while(true){const batch=checked(await admin.from('studio_brand_brief_findings').select('seq,field,value,locator').eq('part_id',part.id).gt('seq',cursor).order('seq').limit(100))??[];saved.push(...batch.map(({seq,...finding})=>{cursor=seq;return {...finding,field:`brief.${finding.field}`};}));if(batch.length<100)break;}}
  const {prompt,responseSchema}=fieldExtractionRequest(briefReady);const images:{url:string;label:string}[]=[];
  if(part.payload.image){const image=part.payload.image;const bytes=(await objectStore().get(image.objectKey)).body;if(bytes.length>4*1024*1024||createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw new Error('BRAND_SOURCE_HASH_MISMATCH');images.push({url:`data:image/jpeg;base64,${bytes.toString('base64')}`,label:`Actual source image/page ${image.page}. Untrusted brand evidence.`});}
  const inputBound=Buffer.byteLength(agent.instructions+prompt+JSON.stringify(context)+JSON.stringify(responseSchema),'utf8')+2048+images.length*4224;
  const outputAffordable=model.outputPrice>0?Math.floor((analysis.request_cap_micro_usd/1100000-inputBound*model.inputPrice)/model.outputPrice):8192;
  const maxOutputTokens=Math.min(8192,agent.max_output_tokens,model.maxOutput,outputAffordable);if(maxOutputTokens<256)throw new Error('REQUEST_PRICE_CAP');if(inputBound+maxOutputTokens>model.contextLength)throw new Error('REQUEST_PRICE_CAP');
  const reservation=Math.max(1,Math.ceil((inputBound*model.inputPrice+maxOutputTokens*model.outputPrice)*1100000));
  const snapshot={instructions:agent.instructions,maxOutputTokens,pricing:model,campaignContext:context,outputFormat:'json_schema',responseSchema,disableReasoning:agent.model_id==='google/gemini-2.5-flash',stepCapMicroUsd:agent.step_cap_micro_usd,modelId:agent.model_id,requestPriceCapMicroUsd:analysis.request_cap_micro_usd,budgetScopeId:checkpoint?`budget-step-${analysis.run_id}-brand-kit`:null,brandFieldAnalysis:{analysisId:analysis.id,partId:part.id,page:part.page_no,sourceSha:file.source_sha}};
  const step=await rpc('studio_begin_brand_read',{target_part:part.id,token:part.lease_token,request_key:randomUUID(),snapshot,prompt_text:prompt,reservation});submitted=true;
  const result:TextReceipt=await submitText(agent.model_id,prompt,snapshot,images,step.id);
  const parsed=result.text?parseFieldResponse(result.text,result.finishReason):{findings:[],more:false,partial:false,invalid:0};
  let split_payloads=null;
  if(result.failure==='OUTPUT_TOKEN_LIMIT'&&!parsed.findings.length&&typeof part.payload.text==='string'&&part.payload.text.length>512&&!part.payload.image){const pieces=splitBrandText(part.payload.text,Math.ceil(part.payload.text.length/2));split_payloads=pieces.map(p=>({...p,start:(part.payload.start??0)+p.start,end:(part.payload.start??0)+p.end}));}
  const outcome=result.outcome==='succeeded'&&parsed.partial?'failed':result.outcome,failure=result.outcome==='succeeded'&&parsed.partial?'INVALID_FIELD_RESPONSE':result.failure;
  const receipt={target_part:part.id,token:part.lease_token,target_step:step.id,outcome,actual_cost:result.cost,result_text:result.text,provider_generation:result.generation,token_usage:{...(result.usage as Record<string,unknown>??{}),_studio:{finishReason:result.finishReason??null,maxOutputTokens,providerError:result.providerError??null,partial:parsed.partial}},failure,findings:parsed.findings,more:parsed.more,split_payloads};
  await mkdir(directory,{recursive:true,mode:0o700});const path=resolve(directory,`${step.id}.json`);await writeFile(path+'.tmp',JSON.stringify(receipt),{mode:0o600});await rename(path+'.tmp',path);await rpc('studio_complete_brand_read',receipt);await unlink(path);
 }catch(error){if(!submitted)await rpc('studio_block_brand_read',{target_part:part.id,token:part.lease_token,failure:error instanceof Error?error.message:'LOCAL_READER_FAILED'});/* Submitted requests have a lease and durable receipts; never resubmit here. */}
 finally{clearInterval(beat);}return true;
}
