import {processDirectorWork} from './director/worker';
import {processCreativeDelivery} from './creative-delivery';
import {creativeExecutionSnapshot} from '../../packages/creative/request-snapshot';
import {compileCreativeClaim} from './creative-compile';
import {prepareCreativeOutput,creativeTransportUpstream,type CreativeInputs} from '../../packages/creative/protocol';
import {loadCreativeVision} from '../../packages/creative/vision.local';
import type {CreativeStage} from '../../packages/agents/prompts/creative-v1';
import {textRequestQuote,retryOutputLimit,requireRequestAllowance} from '../../packages/agents/text-quote';
import {preparePreviewProposal,PREVIEW_PROTOCOL,type PreviewInputs} from '../../packages/contracts/preview-proposal';
import {planningTransportTask,PLANNING_RETRY_FEEDBACK,type LocalizationVariant} from '../../packages/contracts/localization';
import {agentResponseSchema,prepareAgentOutput,outputDiagnostic} from '../../packages/contracts/agent-output';
import {effectiveRunAgents} from '../../packages/data/run-limits';
import {isPlanningJob} from '../../packages/contracts/planning-job';
import {variantAuditTask} from '../../packages/contracts/variant-identities';
import {transientExecutionFailure} from '../../packages/director/execution-failures';
// Trusted local dispatcher. Never imported by Next.js; never executes generated code.
import {processGuidedCampaign} from "./guided-campaign";
import type {ProviderErrorDetail} from "../../packages/contracts/provider-error";
import {diagnoseIntakeOutput} from "../../packages/contracts/brand-intake";
import {loadBrandVision} from "../../packages/brand/vision.local";
import {processBrandFieldAnalysis,flushBrandReadReceipts} from "./brand-field-analysis";
import {processBrandMaterial} from "./brand-materials";
import {compileDraftClaim} from "./compile-drafts";
import {randomUUID} from "node:crypto";
import {mkdir,open,readFile,writeFile,rename,unlink,readdir,stat} from "node:fs/promises";
import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {adminClient,checked,sharedTenant} from "../../packages/data/shared-runtime";
import {modelCatalog} from "../../packages/agents/catalog";
import {submitText,type TextSnapshot} from "../../packages/agents/text-provider";
import type {AgentSetting} from "../../packages/contracts/shared";

type Snapshot=TextSnapshot&{stepCapMicroUsd:number;budgetScopeId?:string|null;campaignContext?:{variantManifest?:{entries:Record<string,unknown>[]}}};
type Claim={job:{id:string;job_key:string;kind:string;role:string;campaign_id:string;run_id:string;round_id:string;initial_step_id:string|null;input_hash:string;config_hash:string;lease_token:number;attempt_count:number;payload:{prompt:string;snapshot:Snapshot;creativeInputs?:CreativeInputs;manifest?:import('../../packages/contracts/campaign').VariantManifest;brandSystemHash?:string}};attempt:{id:string};round:{kind:string}};
const admin=adminClient(),device=randomUUID(),directory=resolve("artifacts/m06"),lock=resolve(directory,"worker.lock");
let stopping=false;process.once("SIGTERM",()=>{stopping=true;});process.once("SIGINT",()=>{stopping=true;});
/**
 * The worker is a detached process: restarting the app does not restart it, and a busy worker never idles out.
 * It fingerprints the code it runs and, between jobs, hands over to a fresh worker when that code changed on disk.
 */
const CODE_DIRS=["apps/local-runner","packages"];
async function codeFingerprint(){
 let newest=0,count=0;
 const walk=async(dir:string):Promise<void>=>{for(const entry of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const path=resolve(dir,entry.name);if(entry.isDirectory()){if(entry.name!=="node_modules")await walk(path);}else if(/\.(ts|tsx|json)$/.test(entry.name)){count++;newest=Math.max(newest,(await stat(path)).mtimeMs);}}};
 for(const dir of CODE_DIRS)await walk(resolve(dir));
 return `${count}:${newest}`;
}
let restartForNewCode=false;
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function rpc(name:string,args:Record<string,unknown>){return checked(await admin.rpc(name,args));}
async function flushProviderAnchors(){
 for(const file of await readdir(resolve(directory,'provider-ids'))){if(!file.endsWith('.json'))continue;
  const path=resolve(directory,'provider-ids',file),anchor=JSON.parse(await readFile(path,'utf8'));
  const attempt=checked(await admin.from('studio_workflow_attempts').select('state,late_receipt').eq('id',anchor.attemptId).single());
  if(attempt&&['claimed','submitted'].includes(attempt.state))continue;
  if(attempt?.state==='unknown'&&!attempt.late_receipt)await rpc('studio_complete_workflow',anchor.receipt);
  await unlink(path);
 }
}
async function flushReceipts(){
 for(const file of await readdir(resolve(directory,"receipts"))){if(!file.endsWith('.json'))continue;
  const path=resolve(directory,"receipts",file),receipt=JSON.parse(await readFile(path,"utf8"));
  // Replays only idempotent settlement/fenced activation, never a provider submission.
  await rpc("studio_complete_workflow",receipt);await unlink(path);
 }
}
async function execute(claim:Claim){
 const {job,attempt}=claim;let submitted=false,heartbeatBusy=false;
 if(Boolean(job.payload.creativeInputs)||job.kind==='compile'){await rpc('studio_retire_creative_claim',{target_job:job.id,token:job.lease_token,device});return;}
 const beat=setInterval(()=>{if(heartbeatBusy)return;heartbeatBusy=true;void rpc("studio_heartbeat_workflow",{target_job:job.id,token:job.lease_token,device}).catch(()=>{}).finally(()=>{heartbeatBusy=false;});},15000);
 if(job.kind==="compile"){try{if(job.payload.creativeInputs)await compileCreativeClaim(job as Parameters<typeof compileCreativeClaim>[0],device);else await compileDraftClaim(job,device);}finally{clearInterval(beat);}return;}
 let outputLimit=job.payload.snapshot.maxOutputTokens,protocolSchema:string|null=null;
 let result:{outcome:string;cost:number|null;text:string|null;generation:string|null;usage:unknown;failure:string|null;finishReason?:string|null;validation?:unknown;providerError?:ProviderErrorDetail;originalOutput?:string;normalizations?:string[]}={outcome:"failed",cost:0,text:null,generation:null,usage:null,failure:null};
 try{
  if(!process.env.OPENROUTER_API_KEY)throw new Error("PROVIDER_NOT_CONFIGURED");
  const run=checked(await admin.from("studio_runs").select("id,config_snapshot").eq("id",job.run_id).eq("tenant_id",sharedTenant).single());
  if(!run)throw new Error("RUN_NOT_ACTIVE");
  const agent=(await effectiveRunAgents(admin,run as {id:string;config_snapshot:AgentSetting[]},{directorOverrides:!isPlanningJob(job,claim.round.kind)})).find(a=>a.role===job.role);if(!agent?.model_id)throw new Error("AGENT_NOT_CONFIGURED");
  const dependencies=checked(await admin.from("studio_workflow_dependencies").select("requires_id").eq("job_id",job.id));
  let upstream:{jobId:string;sha256:string;output:string}[]=[];
  if(dependencies?.length){const parents=checked(await admin.from("studio_workflow_jobs").select("id,job_key,output,output_hash,state").in("id",dependencies.map(d=>d.requires_id)).eq("tenant_id",sharedTenant).order("job_key"));
   if(!parents||parents.some(p=>p.state!=="succeeded"||!p.output_hash))throw new Error("STALE_WORKFLOW");
   upstream=parents.map(p=>({jobId:p.id,sha256:p.output_hash,output:p.output}));}
  const model=(await modelCatalog()).find(m=>m.id===agent.model_id);
  if(!model||model.outputModalities.length!==1||model.outputModalities[0]!=="text")throw new Error("MODEL_UNAVAILABLE");
  const snapshot:Snapshot={...job.payload.snapshot,upstream,pricing:model,stepCapMicroUsd:agent.step_cap_micro_usd,maxOutputTokens:retryOutputLimit((job.payload.snapshot as unknown as {previewProtocol?:string}).previewProtocol,job.payload.snapshot.maxOutputTokens,agent.max_output_tokens,model.maxOutput),disableReasoning:model.id==="google/gemini-2.5-flash"};
  const creative=job.payload.creativeInputs?{input:job.payload.creativeInputs,stage:(job.payload.snapshot as unknown as {creativeStage:Exclude<CreativeStage,'compile'>}).creativeStage}:null;
  if(creative)Object.assign(snapshot,creativeExecutionSnapshot({...snapshot,maxOutputTokens:job.payload.snapshot.maxOutputTokens},creative.stage,agent.max_output_tokens,model.maxOutput),{creativeRepair:job.attempt_count>1});
  if(claim.round.kind==='draft'&&agent.model_id==='google/gemini-2.5-flash'&&!snapshot.responseSchema){
   if(!model.supportedParameters.includes('structured_outputs')&&!model.supportedParameters.includes('response_format'))throw new Error('STRUCTURED_OUTPUT_UNAVAILABLE');
   snapshot.responseSchema=agentResponseSchema(job.role,snapshot.campaignContext?.variantManifest);snapshot.outputFormat='json_schema';
  }
  let transportTask=claim.round.kind==='draft'&&snapshot.campaignContext?.variantManifest?(job.role==='variants'?variantAuditTask+(job.attempt_count>1?`\n${PLANNING_RETRY_FEEDBACK}`:''):planningTransportTask(job.role,snapshot.campaignContext.variantManifest.entries as LocalizationVariant[],job.attempt_count)):'';
  if(transportTask)snapshot.transportTask=transportTask;
  let reservation:number;
  // Manual requests already have a frozen quote/reservation. Don't change the admitted request on restart.
  const initial=job.initial_step_id?checked(await admin.from("studio_agent_steps").select("status,reserve_micro_usd,config_snapshot").eq("id",job.initial_step_id).single()):null;
  if(initial?.status==="reserved"){
   Object.assign(snapshot,initial.config_snapshot,{upstream});transportTask=initial.config_snapshot.transportTask??'';reservation=initial.reserve_micro_usd;
   if(model.inputPrice>snapshot.pricing.inputPrice*1.1||model.outputPrice>snapshot.pricing.outputPrice*1.1)throw new Error("MODEL_PRICE_CHANGED");
  }else{
   const quote=textRequestQuote(job.payload.prompt,creative?{...snapshot,upstream:creativeTransportUpstream(upstream,creative.input.direction)}:snapshot,transportTask,creative?.stage==='critic'?creative.input.criticSceneCount??6:creative?.stage==='media'?Math.min(3,creative.input.assetAliases.length):((snapshot as unknown as {brandVisionImages?:unknown[]}).brandVisionImages?.length??0));
   if(quote.inputTokenBound+snapshot.maxOutputTokens>model.contextLength)throw new Error('PROMPT_TOO_LONG');
   reservation=quote.reservationMicroUsd;

  }
  // Preview assembly can legitimately run beyond the short non-streaming deadline.
  if(job.role==='creative-code'&&initial?.status!=='reserved')snapshot.stream=true;
  if((snapshot as unknown as {previewProtocol?:string}).previewProtocol===PREVIEW_PROTOCOL)snapshot.maxOutputTokens=Math.min(snapshot.maxOutputTokens,job.payload.snapshot.maxOutputTokens);
  if(job.role==='creative-code'){
   const allowance=await admin.from('studio_preview_budget_continuations').select('reservation_micro_usd').eq('job_id',job.id).eq('next_attempt_no',job.attempt_count).maybeSingle();
   if(allowance.error&&!['42P01','PGRST205'].includes(allowance.error.code??''))throw new Error(allowance.error.message);
   requireRequestAllowance(reservation,allowance.data?.reservation_micro_usd??null);
  }
  protocolSchema=snapshot.responseSchema?.name??null;
  const vision=creative?await loadCreativeVision(creative.stage,creative.input,job.campaign_id,upstream):await loadBrandVision(snapshot as unknown as Record<string,unknown>,job.campaign_id);
  if(stopping)throw new Error("LOCAL_PROCESS_STOPPING");
  const submittedStep=await rpc("studio_begin_workflow",{target_job:job.id,token:job.lease_token,device,snapshot,reservation});
  // From this point a crash/timeout is uncertain and can never be automatically resubmitted.
  submitted=true;
  outputLimit=snapshot.maxOutputTokens;
  result=await submitText(agent.model_id,job.payload.prompt+(transportTask?'\n'+transportTask:''),creative?{...snapshot,upstream:creativeTransportUpstream(upstream,creative.input.direction)}:snapshot,vision,submittedStep.id,async generation=>{
   // Durable provider identity only: replaying this anchor cannot submit or activate output.
   const path=resolve(directory,'provider-ids',`${attempt.id}.json`),tmp=path+'.tmp';
   await writeFile(tmp,JSON.stringify({attemptId:attempt.id,receipt:{target_job:job.id,token:job.lease_token,device,expected_input:job.input_hash,expected_config:job.config_hash,outcome:'unknown',actual_cost:null,result_text:null,provider_generation:generation,token_usage:null,failure:'PROCESS_INTERRUPTED'}}),{mode:0o600});await rename(tmp,path);
  });
  if(result.outcome==="succeeded"&&result.text){
   try{
    const text=result.text;
    if((snapshot as unknown as {materialFingerprint?:string}).materialFingerprint){
     const sources=((snapshot as unknown as {brandMaterialIds:string[]}).brandMaterialIds).map(id=>({id})),diagnostic=diagnoseIntakeOutput(text,sources,snapshot.maxOutputTokens,result.finishReason);
     if(diagnostic)result={...result,outcome:diagnostic.code==='AGENT_INPUT_BLOCKED'?'blocked':'failed',failure:diagnostic.code,validation:diagnostic};
    }
    if(creative&&(result.outcome==='succeeded'||result.outcome==='failed'&&result.failure==='OUTPUT_TOKEN_LIMIT'&&result.text&&result.cost!==null)){const normalized=prepareCreativeOutput(result.text!,creative.stage,creative.input,upstream);result={...result,text:JSON.stringify(normalized),originalOutput:result.text!,normalizations:[creative.input.protocol==='creative@2'?'creative@2':'m07b.1'],...(normalized.issues.some(i=>i.severity==='block')?{outcome:'blocked',failure:'CREATIVE_REPAIR_REQUIRED'}:{})};}
    if(!creative&&result.outcome==='succeeded'&&job.role==='creative-code'&&(snapshot as unknown as {draftPlanVersion?:number}).draftPlanVersion){
     const context=(snapshot as unknown as {campaignContext:{draftAssembly:{plan:PreviewInputs['plan'];context:{manifest:{entries:PreviewInputs['entries']}}};availableAssets:PreviewInputs['assets'];planning?:PreviewInputs['planning']}}).campaignContext;
     const prepared=preparePreviewProposal(text,{plan:context.draftAssembly.plan,entries:context.draftAssembly.context.manifest.entries,assets:context.availableAssets,planning:context.planning});
     if(prepared.normalized)result={...result,text:prepared.text,originalOutput:text,normalizations:[PREVIEW_PROTOCOL]};
     if(prepared.blocked)result={...result,outcome:'blocked',failure:'AGENT_INPUT_BLOCKED'};
    }
    if(!creative&&result.outcome==="succeeded"&&(claim.round.kind==="draft"||snapshot.outputFormat==="json_object"||snapshot.outputFormat==="json_schema")){
     const validation=prepareAgentOutput(result.text!,job.role,claim.round.kind==="draft",snapshot.campaignContext?.variantManifest);
     if(validation.changes.length)result={...result,text:validation.text,originalOutput:text,normalizations:validation.changes};
     if(validation.blocked)result={...result,outcome:"blocked",failure:"AGENT_INPUT_BLOCKED"};
    }
   }catch(error){result={...result,outcome:"failed",failure:"INVALID_OUTPUT_SCHEMA",validation:outputDiagnostic(error)};}
  }
 }catch(error){result={outcome:submitted?"unknown":"failed",cost:submitted?null:0,text:null,generation:null,usage:null,failure:submitted?"SUBMISSION_OUTCOME_UNKNOWN":error instanceof Error?error.message:"PREFLIGHT_FAILED"};}
 finally{clearInterval(beat);}
 const receipt={target_job:job.id,token:job.lease_token,device,expected_input:job.input_hash,expected_config:job.config_hash,outcome:result.outcome,actual_cost:result.cost,result_text:result.text,provider_generation:result.generation,token_usage:(result.usage||result.providerError||result.finishReason)?{...(result.usage as Record<string,unknown>),_studio:{finishReason:result.finishReason??null,maxOutputTokens:outputLimit,validation:result.validation??null,providerError:result.providerError??null,normalizations:result.normalizations??[],...(result.originalOutput?{originalOutput:result.originalOutput}:{}),responseSchema:protocolSchema}}:null,failure:result.failure};
 const file=resolve(directory,"receipts",`${attempt.id}.json`),tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(receipt),{mode:0o600});await rename(tmp,file);
 await rpc("studio_complete_workflow",receipt);await unlink(file);await unlink(resolve(directory,'provider-ids',`${attempt.id}.json`)).catch(()=>{});
}
async function main(){
 const host=new URL(process.env.NEXT_PUBLIC_APP_URL??"https://invalid").hostname;
 if(process.env.STUDIO_LOCAL_COMPUTE!=="true"||process.env.STUDIO_SHARED_MODE!=="true"||!["localhost","127.0.0.1","[::1]"].includes(host)||process.env.VERCEL||process.env.AWS_LAMBDA_FUNCTION_NAME)throw new Error("LOCAL_DEVICE_REQUIRED");
 await mkdir(resolve(directory,"receipts"),{recursive:true,mode:0o700});
 await mkdir(resolve(directory,"provider-ids"),{recursive:true,mode:0o700});
 try{const handle=await open(lock,"wx",0o600);await handle.writeFile(String(process.pid));await handle.close();}
 catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;const pid=Number(await readFile(lock,"utf8"));try{process.kill(pid,0);return;}catch(e){if((e as NodeJS.ErrnoException).code!=="ESRCH")return;}await unlink(lock);return main();}
 let timer:NodeJS.Timeout|undefined;
 try{
  await rpc("studio_workflow_device",{device,target_tenant:sharedTenant,online:true});
  timer=setInterval(()=>{void rpc("studio_workflow_device",{device,target_tenant:sharedTenant,online:true}).catch(()=>{});},15000);
  let idle=Date.now(),checked_at=Date.now();const startedWith=await codeFingerprint();
  while(!stopping&&Date.now()-idle<60000){
   if(Date.now()-checked_at>5000){checked_at=Date.now();if(await codeFingerprint()!==startedWith){restartForNewCode=true;break;}}
   await flushReceipts();await flushProviderAnchors();try{if(await processDirectorWork(device)){idle=Date.now();continue;}}catch(error){console.error('[director] worker step failed; it is retried on the next tick:',error instanceof Error?error.message:error);await wait(5000);}try{if(await processGuidedCampaign())idle=Date.now();}catch{/* A guided coordinator failure never replays a provider submission. */}try{await flushBrandReadReceipts();if(await processBrandFieldAnalysis()){idle=Date.now();continue;}}catch(error){const code=(error as {code?:string}).code;if(!["PGRST202","PGRST205","42P01"].includes(code??""))console.error("Brand field reader is waiting for recovery.");}try{if(await processBrandMaterial()){idle=Date.now();continue;}}catch{/* Older projects can continue M06 work until brand intake is enabled. */}try{if(await processCreativeDelivery(device)){idle=Date.now();continue;}}catch{/* Deployment may still be waiting for the M07f migration. */}await rpc("studio_recover_workflow",{target_tenant:sharedTenant});
   const claim=await rpc("studio_claim_workflow",{target_tenant:sharedTenant,device}) as Claim|null;
   if(claim){idle=Date.now();await execute(claim);}else await wait(2000);
  }
 }finally{if(timer)clearInterval(timer);await rpc("studio_workflow_device",{device,target_tenant:sharedTenant,online:false}).catch(()=>{});await unlink(lock).catch(()=>{});
  // Hand over to a worker that loads the current code; it takes the lock and continues the queue.
  if(restartForNewCode){const child=spawn(process.execPath,["--import","tsx",resolve("apps/local-runner/workflow.ts")],{cwd:process.cwd(),env:process.env,stdio:"ignore",detached:true});child.unref();}}
}
async function supervise(){
 for(let attempt=0;!stopping;attempt++){
  try{await main();return;}catch(error){
   if(error instanceof Error&&transientExecutionFailure(error.message)&&attempt<10){
    console.error('Local worker is recovering a temporary connection interruption; saved request identities and receipts are retained.');
    await wait(Math.min(30000,1000*2**Math.min(attempt,5)));continue;
   }throw error;
  }
 }
}
void supervise().catch(error=>{
 // Name the reason (a code or the first line, never secrets or payloads) so a stopped worker can be fixed.
 const reason=error instanceof Error?error.message.split("\n")[0].replace(/(key|token|secret|password)=\S+/gi,"$1=…").slice(0,300):String(error).slice(0,300);
 console.error(`Local workflow stopped: ${reason}${reason==="LOCAL_DEVICE_REQUIRED"?" (needs STUDIO_LOCAL_COMPUTE=true, STUDIO_SHARED_MODE=true and a localhost NEXT_PUBLIC_APP_URL)":""}. Resume from Queue. Submitted requests are never repeated without reconciliation.`);
 process.exitCode=1;
});
