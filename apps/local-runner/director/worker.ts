import {transientExecutionFailure} from '../../../packages/director/execution-failures';
import {recoverUnsubmittedClock} from '../../../packages/director/working-clock';
import {withCreativeHandoff} from '../../../packages/director/creative-handoff';
import {usesLiveDraft,livePipeline,ensureLivePreviewToolchain} from './live-pipeline';
import {liveTools} from './live-tools';
import {staticCoderReasoning} from '../../../packages/director/coder-reasoning';
import {modelCatalog} from '../../../packages/agents/catalog';
import {designDirection} from './design';
import {directorTask,directorRequestOutputLimit,hasCutOffAnswer} from '../../../packages/director/design-attempts';
import {wrapStaticFrames} from './static-wrap';
import {compactStaticCriticRequest,packCriticImages} from './static-evidence';
import {compactDraftRequest,draftRequestCap} from '../../../packages/director/request-size';
import {applyLiveControls,beginLiveRevision,type LiveControl} from '../../../packages/director/live-controls';
import {staticStillTools as staticTools} from './static-tools';
import {assembleStatic,staticSourceContext} from './static-assembler';
import {staticCoderInstructions,staticFilesSchema,staticToolsSchema} from '../../../packages/agents/prompts/static-coder';
import {slimDirectorInput} from '../../../packages/director/inputs';
import {directorEvents} from './events';
import {publishDirectorReference,processDirectorDelivery,restoreIteration,type SealedIteration} from './delivery';
import {materialize,visionImages} from './assets';
import {prepareMaterialMemory} from './material-memory';
import {critiqueIteration} from './critic';
import {directorCriticInstructions,directorCriticSchema,staticCriticInstructions} from '../../../packages/agents/prompts/director-critic-v1';
import {resourceRequest} from '../../../packages/director/resources';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {adminClient,checked,sharedTenant} from '../../../packages/data/shared-runtime';
import {effectiveRunAgents} from '../../../packages/data/run-limits';
import {directorPrompt,staticDirectorPrompt} from '../../../packages/agents/prompts/director-v1';
import {assemblerInstructions,assemblerProviderSchema} from '../../../packages/agents/prompts/assembler-v1';
import {readDesign} from '../../../packages/director/contract';
import {paidText,requestId,roleNames,resumeBudgetClock,retryableProviderFailure,type Role} from '../../../packages/director/money';
import type {BlockSnapshot,WorkState,ADQuestion} from '../../../packages/director/state';
import {directorLedger,directorTextConfig,directorInputAllowance,flushDirectorReceipts} from './ledger';
import {createWorkspace,writeResources} from './workspace';
import {draftConstruction} from './construction';
import {sourceChecks,prepareReviewNotes} from './review-evidence';
import {liveSource} from './live-bundle';
import {agentReviewNotes} from '../../../packages/director/review';
import {coderOnlyRevision} from '../../../packages/director/revision-notes';
import {buildResourceCatalog,type PricedResource} from './resources';
import {directorStillProducer} from '../creative-stills';
import {assemble} from './assembler';
import {compositionTools} from './tools';
import {snapshotFolder} from './snapshots';
import {sandboxTool} from './sandbox';
import {ensureDirectorToolchain} from './toolchain';
import {compactTranscript,assemblerContext} from '../../../packages/director/transcript';
import {providerJsonSchema} from '../../../packages/director/provider-schema';
import {questionForFailure} from '../../../packages/director/questions';
export {questionForFailure};
export type DirectorClaim={block:{id:string;run_id:string;round_id:string;campaign_id:string;snapshot:BlockSnapshot;approved_resource_ids:string[]};work:{direction_id:string;iteration_id:string;lease_token:number;state:WorkState}};
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export async function executeDirector(claim:DirectorClaim,device:string){
 const admin=adminClient(),{block,work}=claim,snapshot=block.snapshot,state=structuredClone(work.state),input=structuredClone(snapshot.inputs.find(i=>i.directionId===work.direction_id)!);if(!input)throw new Error('DIRECTOR_INPUT_MISSING');
 let recoveredClock:{activeMs:number;excludedMs:number}|undefined;
 input.iterationId=state.iterationId??work.iteration_id;state.iterationId=input.iterationId;state.iteration??=1;
 if(state.phase==='director'&&state.workingClockVersion!==2&&state.roleStartedAt?.director!==undefined){
  const requests=checked(await admin.from('studio_agent_steps').select('id').eq('run_id',input.runId).eq('config_snapshot->>directorBlockId',block.id).eq('config_snapshot->>directorDirectionId',input.directionId).eq('config_snapshot->>directorRole','director').limit(1))??[];
  const recovered=recoverUnsubmittedClock(state,requests.length===0);if(recovered){Object.assign(state,recovered.state);recoveredClock={activeMs:recovered.activeMs,excludedMs:recovered.excludedMs};state.events=[...(state.events??[]),{at:Date.now(),text:`Recovered the unsubmitted working clock: ${recovered.activeMs}ms of recorded active work; ${recovered.excludedMs}ms waiting excluded. No allowance was added.`}];}
 }
 if(state.pausedAt!==undefined||state.reviewStartedAt!==undefined)Object.assign(state,resumeBudgetClock(state));
 delete state.pausedAt;delete state.reviewStartedAt;

 let saveQueue=Promise.resolve();
 const estimate=snapshot.estimates[input.directionId],save=async(status='running',question:ADQuestion|null=null)=>{if(status==='review')state.reviewStartedAt=Date.now();const saved=structuredClone(state);saveQueue=saveQueue.catch(()=>{}).then(async()=>{checked(await admin.rpc('studio_checkpoint_director',{target:block.id,direction:input.directionId,device,token:work.lease_token,new_state:saved,next_status:status,question_data:question}));});await saveQueue;};
 // A short activity log the AD (and support) can read: every request, its outcome, retries, wrap-up and stops.
 const note=(text:string)=>{state.events=[...(state.events??[]),{at:Date.now(),text:text.slice(0,300)}].slice(-30);};
 note(`Work started (phase: ${state.phase??'director'}${state.wrapUp?', wrap-up requested':''}).`);
 const events=directorEvents(admin,{blockId:block.id,directionId:input.directionId,iterationId:()=>input.iterationId,campaignId:block.campaign_id,device,token:work.lease_token,models:{director:snapshot.models.director.modelId,assembler:snapshot.models.assembler.modelId,critic:snapshot.models.critic.modelId,resources:snapshot.resourceModelId??'Image model'}});
 const beat=setInterval(()=>{void Promise.resolve(admin.rpc('studio_heartbeat_director',{target:block.id,direction:input.directionId,device,token:work.lease_token})).catch(()=>{});},15000);
 try{
  if(recoveredClock){await events.emit('clock:recovery',{stepId:'clock:recovery',kind:'control',status:'done',costMicroUsd:0,message:'Corrected waiting time in the unsubmitted director clock. Recorded active work is retained; no allowance was added.',detail:recoveredClock});await save();}
  // Nothing is bought before the renderer is known to work on this Mac.
  if(!input.stage)throw new Error('LEGACY_DRAFT_READ_ONLY');
  if(usesLiveDraft(input))await ensureLivePreviewToolchain();else await ensureDirectorToolchain();
  const folder=await createWorkspace('artifacts/m08/workspaces',input);state.folder=folder;await materialize(folder,snapshot);state.notes??=snapshot.notes?.[input.directionId]??[];
  if(input.stage==='draft'&&input.materialMemory){input.materialMemory=await prepareMaterialMemory(folder,input);await events.emit(`materials:${input.materialMemory.revision}`,{stepId:`materials:${input.materialMemory.revision}`,kind:'checks',status:'done',costMicroUsd:0,message:'Source materials and supplied font capabilities are ready for the agents.',detail:{revision:input.materialMemory.revision,issues:[...input.materialMemory.issues,...input.materialMemory.materials.flatMap(m=>m.issues)]}});}
  if(!state.seedLoaded&&snapshot.seedWork?.[input.directionId]){const seed=snapshot.seedWork[input.directionId],restored=await restoreIteration({id:seed.iterationId,block_id:block.id,direction_id:input.directionId,source_hash:seed.source.hash,payload:{folder:'',source:seed.source,design:seed.design,catalog:seed.catalog,reports:{}}} as SealedIteration,snapshot,block.campaign_id);state.pendingSource=restored.folder;state.previousDesign=seed.design;state.catalog=seed.catalog;if(coderOnlyRevision(snapshot,state.notes))state.design=readDesign(seed.design,input);state.seedLoaded=true;}
  if(!state.seedLoaded&&snapshot.seedIterationIds?.[input.directionId]){const seed=checked(await admin.from('studio_director_iterations').select('*').eq('id',snapshot.seedIterationIds[input.directionId]).single());if(!seed)throw new Error('ITERATION_REQUIRED');const restored=await restoreIteration(seed as SealedIteration,snapshot,block.campaign_id);state.pendingSource=restored.folder;state.previousDesign=seed.payload.design;state.catalog=seed.payload.catalog;if(coderOnlyRevision(snapshot,state.notes))state.design=readDesign(seed.payload.design,input);state.seedLoaded=true;}
  if(state.pendingSource){if(resolve(state.pendingSource)!==resolve(folder)){const prior=await snapshotFolder(state.pendingSource,input.iterationId);for(const file of prior.files)if(!['brand.ts','runtime.ts','entry.tsx','input.json','catalog.json'].includes(file.path)){await mkdir(resolve(folder,file.path,'..'),{recursive:true});await writeFile(resolve(folder,file.path),file.source);}await cp(resolve(state.pendingSource,'public'),resolve(folder,'public'),{recursive:true});}state.pendingSource=undefined;}
  state.notes=await prepareReviewNotes(folder,input,state.notes);
  const controls=async()=>{const rows=checked(await admin.from('studio_director_controls').select('*').eq('block_id',block.id).eq('direction_id',input.directionId).order('created_at').order('id'))??[],result=applyLiveControls(state,rows as LiveControl[]);if(result.stopped)throw new Error('STALE_DIRECTOR_LEASE');if(result.reviseDirector||result.reviseCoder&&(state.assembler?.turn??0)>0)state.liveRevision=result.reviseDirector?'director':'assembler';if(state.liveRevision)throw new Error('DIRECTOR_LIVE_REVISION');if(state.wrapUp)throw new Error('DIRECTOR_LIVE_WRAP_UP');};
  try{await controls();}catch(error){if(!(error instanceof Error&&error.message==='DIRECTOR_LIVE_WRAP_UP'))throw error;}
  if(input.stage!=='draft'&&state.wrapUp&&['assembled','critic'].includes(state.phase??'')){const iteration=checked(await admin.from('studio_director_iterations').select('*').eq('id',input.iterationId).single());if(iteration)await publishDirectorReference(iteration as SealedIteration,input,block.campaign_id);state.phase='complete';await save('done');return;}
  if(state.wrapUp&&!state.design)throw new Error('WRAP_UP_NOTHING_TO_SHOW');
  const callOnce=async(role:Exclude<Role,'resources'>,prompt:string,protocolInstructions:string,responseSchema:{name:string;schema:Record<string,unknown>},context:unknown,identity:unknown,images:{url:string;label:string}[]=[])=>{
   await controls();state.roleStartedAt??={};if(!state.roleStartedAt[role]){state.roleStartedAt[role]=Date.now();await save();}const remainingMs=input.stage==='draft'||role==='assembler'?estimate.roles[role].timeMs-(Date.now()-state.roleStartedAt[role]!):600000;if(remainingMs<=0)throw Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{detail:`${role}: its approved working time is used up`});
   const config=snapshot.models[role];if(role!=='assembler'&&!config.vision)throw new Error('VISION_MODEL_REQUIRED');const run=checked(await admin.from('studio_runs').select('id,config_snapshot').eq('id',input.runId).single()),agent=(await effectiveRunAgents(admin,run!)).find(a=>a.role===roleNames[role]);if(!agent||agent.model_id!==config.modelId)throw new Error('FROZEN_MODEL_REQUIRED');
   let outputLimit=Math.min(config.maxOutputTokens,agent.max_output_tokens);
   if(input.stage==='draft'&&role==='director'&&estimate.roles.director.requests>2&&hasCutOffAnswer(state.directorFeedback??[])){
    const maximum=config.modelMaxOutputTokens??(await modelCatalog()).find(model=>model.id===config.modelId)?.maxOutput;if(!maximum)throw new Error('MODEL_UNAVAILABLE');
    outputLimit=directorRequestOutputLimit({configured:config.maxOutputTokens,modelMaximum:maximum,agentMaximum:agent.max_output_tokens,approvedRequests:estimate.roles.director.requests,feedback:state.directorFeedback??[]});
   }
   let base:import('../../../packages/agents/text-provider').TextSnapshot&{directorIterationId:string;modelId:string;budgetScopeId:string;stepCapMicroUsd:number}={...(input.stage==='draft'?{cachePrompt:true,cacheSessionId:`${block.id}:${input.directionId}:${role}`,requestInputCap:draftRequestCap(config.contextLength,outputLimit)}:{}),directorIterationId:input.iterationId,timeoutMs:input.stage==='draft'?1800000:Math.min(1800000,remainingMs),instructions:config.instructions,protocolInstructions,modelId:config.modelId,maxOutputTokens:outputLimit,pricing:config.pricing,campaignContext:{checkpointId:snapshot.checkpointId,...context as object},budgetScopeId:`budget-step-${input.runId}-${roleNames[role]}`,stepCapMicroUsd:agent.step_cap_micro_usd,outputFormat:'json_schema',responseSchema:{name:responseSchema.name,schema:providerJsonSchema(responseSchema.schema) as Record<string,unknown>},stream:true};
   // First reuse the exact frozen request on restart; allowance accounting must not change its identity.
   const id=requestId({blockId:block.id,iterationId:input.iterationId,role,identity}),prior=checked(await admin.from('studio_agent_steps').select('prompt,config_snapshot').eq('run_id',input.runId).eq('config_snapshot->>directorCallId',id).maybeSingle());
   if(input.stage==='draft'&&!prior){const policy=await admin.rpc('studio_draft_request_policy_version');if(policy.error||policy.data!=='draft-size@2')throw Object.assign(new Error('DRAFT_SIZE_SCHEMA_REQUIRED'),{detail:'Apply migration 058, then retry within the approved allowance. No request was sent.'});}
   if(input.stage==='draft'&&!prior){try{const availableInput=await directorInputAllowance(admin,{runId:input.runId,blockId:block.id,directionId:input.directionId,role,snapshot:base});const compacted=role==='critic'?await compactStaticCriticRequest(prompt,base,images):compactDraftRequest(prompt,base,images,base.requestInputCap,availableInput);prompt=compacted.prompt;images=compacted.images;base={...base,...compacted.snapshot};if(compacted.compaction.actions.length)await events.emit(`compact:${id}`,{stepId:`compact:${id}`,kind:'compaction',status:'done',costMicroUsd:0,message:'This request was compacted to stay within its size limit.',detail:compacted.compaction});}catch(error){await events.emit(`compact:${id}:failed`,{stepId:`compact:${id}`,kind:'compaction',status:'failed',costMicroUsd:0,message:error instanceof Error&&error.message==='ROLE_ALLOWANCE_EXHAUSTED'?'The required request does not fit the remaining billed-token allowance. No request was sent.':'The required material exceeds this request’s size limit. No request was sent.',detail:(error as {compaction?:unknown}).compaction});throw error;}}
   if(prior)images=prior.config_snapshot.visionPacking==='all-formats'?await packCriticImages(images,prior.config_snapshot.directorVisionCount??images.length):images.slice(0,prior.config_snapshot.directorVisionCount??images.length);
   const admitted=prior?{snapshot:prior.config_snapshot,remainingMicroUsd:estimate.roles[role].maxCostMicroUsd}:await directorTextConfig(admin,{runId:input.runId,blockId:block.id,directionId:input.directionId,role,snapshot:base,prompt,visionCount:images.length});
   const cfg={...admitted.snapshot,directorCallId:id};
   // Use an advertised effort level: supporting reasoning does not mean it can be disabled. Frozen receipts retain their exact settings.
   if(!prior&&input.stage==='draft'&&role==='assembler')Object.assign(cfg,staticCoderReasoning((await modelCatalog()).find(model=>model.id===config.modelId)));
   if((cfg.directorRawInputBound??cfg.directorInputTokens??0)+cfg.maxOutputTokens>config.contextLength)throw new Error('PROMPT_TOO_LONG');
   if(role==='director'&&cfg.maxOutputTokens>config.maxOutputTokens)await events.emit(`answer-room:${id}`,{stepId:`answer-room:${id}`,kind:'control',status:'done',model:config.modelId,costMicroUsd:0,message:'The added allowance gives this design answer more room to finish.',detail:{approvedAttempts:estimate.roles.director.requests,maxOutputTokens:cfg.maxOutputTokens}});
   // The AD sees that an answer is being written and since when (a long answer streams for minutes).
   state.activeCall={role,startedAt:Date.now()};note(`${role}: request sent${JSON.stringify(identity).includes('"retry"')?' (retry)':''}.`);await save();
   try{const answer=await paidText({identity:id,role,model:config.modelId,prompt:prior?.prompt??prompt,snapshot:cfg,allowanceMicroUsd:admitted.remainingMicroUsd,images,ledger:directorLedger(admin,{runId:input.runId,blockId:block.id,directionId:input.directionId,device,token:work.lease_token})});note(`${role}: answer received (${answer.text.length.toLocaleString('en-US')} characters, $${(answer.costMicroUsd/1e6).toFixed(3)}${answer.reused?', saved earlier':''}).`);return answer;}
   catch(error){note(`${role}: request failed — ${error instanceof Error?error.message:'unknown'}${(error as {detail?:string})?.detail?`: ${(error as {detail?:string}).detail}`:''}.`);throw error;}
   finally{delete state.activeCall;}
  };
  // A settled provider failure (rate limit, overload, empty or cut stream) is retried with a new request identity, at most
  // three times per call, inside the approved allowance. Open (unknown) receipts are never resubmitted.
  const call=async(role:Exclude<Role,'resources'>,prompt:string,protocolInstructions:string,responseSchema:{name:string;schema:Record<string,unknown>},context:unknown,identity:unknown,images:{url:string;label:string}[]=[])=>{
   // Identities only move forward, so an earlier failed request is never replayed; each execution may submit at most
   // three new requests for one call. Skipping an already-failed saved request costs nothing and uses no attempt.
   const key=`${role}:${JSON.stringify(identity)}`;let budget=3;
   for(;;){const retry=state.callRetries?.[key]??0;
    try{return await callOnce(role,prompt,protocolInstructions,responseSchema,context,retry?{identity,retry}:identity,images);}
    catch(error){const saved=error instanceof Error&&error.message==='SAVED_REQUEST_FAILED';if(!retryableProviderFailure(error)||!saved&&budget<=0)throw error;if(!saved)budget--;state.callRetries={...state.callRetries,[key]:retry+1};await save();if(!saved)await wait(5000*2**(2-budget));}
   }
  };

  if(!state.design&&!state.wrapUp){state.phase='director';state.directorFeedback??=[];await save();
   const protocol=input.stage==='draft'?staticDirectorPrompt:directorPrompt;
   await designDirection({input,state,approvedRequests:estimate.roles.director.requests,perStillMicroUsd:estimate.perStillMicroUsd,
    call:async(attempt,feedback)=>call('director',directorTask(protocol.prompt,feedback),withCreativeHandoff(input,'director',protocol.instructions),protocol.responseSchema,{input:input.stage==='draft'?slimDirectorInput(input):input,notes:agentReviewNotes((state.notes??[]).filter(n=>n.recipient==='director')),previousDesign:state.previousDesign},{attempt},await visionImages(folder,input)),
    ready:async design=>{if(design.materialMemory)input.materialMemory=design.materialMemory;await events.emit('design',{stepId:'design',kind:'design',status:'done',message:'The design document is ready.',detail:design});},save});
  }

  if(state.design?.materialMemory)input.materialMemory=state.design.materialMemory;
  // Current drafts expose the generator itself. This branch never captures images or invokes the visual critic.
  if(usesLiveDraft(input)){
   const existing=checked(await admin.from('studio_director_iterations').select('id,source_hash').eq('id',input.iterationId).eq('block_id',block.id).eq('direction_id',input.directionId).maybeSingle());
   if(existing){state.sourceHash=existing.source_hash;state.phase='complete';state.wrapUp=false;await save('done');return;}
   const design=state.design!;state.catalog??=[];state.phase='assembler';state.assembler??={turn:0,startedAt:Date.now(),transcript:[],complete:false};
   await writeFile(resolve(folder,'draft.json'),JSON.stringify(design));await writeResources(folder,input,state.catalog);await save();
   const preview=async(info:{revision?:string;options?:unknown;error?:string})=>{await events.emit(`preview:${info.revision??state.assembler!.turn}:${info.error?'updating':'ready'}`,{stepId:`preview:${info.revision??state.assembler!.turn}`,kind:'preview',status:info.error?'failed':'done',costMicroUsd:0,message:info.error?'The source is updating; the last working component stays available.':'Frame.tsx is live. New options and adaptive changes are ready to try.',detail:info});};
   const seal=async()=>{const source=await snapshotFolder(folder,input.iterationId);state.sourceHash=source.hash;state.reports={};checked(await admin.rpc('studio_append_director_iteration',{target:block.id,direction:input.directionId,device,token:work.lease_token,iteration:input.iterationId,number:state.iteration,source_hash:source.hash,document:{protocol:'director@1',presentation:'live',sourceChecks:await sourceChecks(folder,(await liveSource(folder)).revision),construction:await draftConstruction(folder,input),design,catalog:state.catalog,source,reports:{},folder,variants:input.variants,unchecked:true}}));state.phase='complete';state.wrapUp=false;await events.emit('live:delivery',{stepId:'live:delivery',kind:'delivery',status:'done',message:'The live draft generator is ready for your review. No image export or visual check was run.'});await save('done');};
   if(state.wrapUp){state.wrapUp=false;const tools=liveTools(folder,input,Date.now()+480000,preview);await tools.execute({tool:'bundle'});await seal();return;}
   await livePipeline(async guard=>{
    const catalog=await buildResourceCatalog({folder,input,design,maxStills:estimate.maxStills,perStillMicroUsd:estimate.perStillMicroUsd,allowed:r=>input.brief.synthesisAllowed===true||block.approved_resource_ids.includes(resourceRequest(r,input,estimate.perStillMicroUsd).key),produce:async(request,resource)=>{await guard();await events.emit(`picture:${resource.id}:running`,{stepId:`picture:${resource.id}`,kind:'picture',status:'running',message:'A picture has been requested.',proxy:resource.proxy,prompt:resource.prompt,reservedMicroUsd:estimate.perStillMicroUsd});return directorStillProducer({blockId:block.id,runId:input.runId,roundId:input.roundId,campaignId:block.campaign_id,directionId:input.directionId},estimate)(request,resource);},cached:state.catalog as PricedResource[],loadCached:async entry=>{const row=checked(await admin.from('asset_revisions').select('object_key,sha256').eq('id',entry.revisionId).eq('tenant_id',sharedTenant).eq('campaign_id',block.campaign_id).maybeSingle());if(!row||row.sha256!==entry.sha256)throw new Error('RESOURCE_BYTES_CHANGED');return (await (await import('../../../packages/media/s3.server')).objectStore().get(row.object_key)).body;},save:async(entry,meta)=>{state.catalog=[...(state.catalog??[]).filter(r=>r.id!==entry.id),entry];await writeResources(folder,input,state.catalog);await save();await events.emit(`picture:${entry.id}:done`,{stepId:`picture:${entry.id}`,kind:'picture',status:'done',message:meta?.reused?'A saved picture is reused in the live preview.':entry.proxy?'A still proxy is ready in the live preview.':'A picture is ready in the live preview.',proxy:entry.proxy,costMicroUsd:meta?.reused?0:entry.costMicroUsd,detail:{requestHash:entry.requestHash,stepId:entry.stepId,reused:meta?.reused??false}},resolve(folder,'public',entry.thumbnail));}});
    state.catalog=catalog;await writeResources(folder,input,catalog);await save();
   },async guard=>{
    const tools=liveTools(folder,input,state.assembler!.startedAt+estimate.roles.assembler.timeMs,preview),execute=async(action:import('../../../packages/agents/prompts/assembler-v1').AssemblerAction)=>{try{await guard();}catch(error){if(action.tool!=='write'||!(error instanceof Error&&['DIRECTOR_LIVE_WRAP_UP','DIRECTOR_LIVE_REVISION'].includes(error.message)))throw error;}return events.tool(state.assembler!.turn*1000+state.assembler!.transcript.length,action,()=>tools.execute(action));};
    await assembleStatic({state:state.assembler!,recoverExisting:true,maxTurns:estimate.roles.assembler.requests,timeMs:estimate.roles.assembler.timeMs,filesContext:async loop=>{const source=await staticSourceContext(folder,input.iterationId);if(source.oversized)return source;try{compactDraftRequest(JSON.stringify({toolResults:loop.transcript,currentFiles:source.files,...(source.construction?{construction:source.construction}:{})}),{instructions:snapshot.models.assembler.instructions,protocolInstructions:withCreativeHandoff(input,'coder',staticCoderInstructions),maxOutputTokens:snapshot.models.assembler.maxOutputTokens,pricing:snapshot.models.assembler.pricing,responseSchema:staticFilesSchema,campaignContext:{checkpointId:snapshot.checkpointId,...assemblerContext(input,design,[...input.assets,...state.catalog!],state.notes??[])}},[]);}catch{return {...source,oversized:true};}return source;},call:async(loop,mode,currentFiles,construction)=>{await guard();return (await call('assembler',JSON.stringify({toolResults:loop.transcript,...(currentFiles?.length?{currentFiles}:{}),...(construction?{construction}:{})}),withCreativeHandoff(input,'coder',staticCoderInstructions)+(mode==='tools'?' Return calls using write, read, typecheck, bundle, listResources and finish. Image render tools are unavailable.':''),mode==='files'?staticFilesSchema:staticToolsSchema,assemblerContext(input,design,[...input.assets,...state.catalog!],state.notes??[]),{turn:loop.turn,mode,live:true})).text;},tool:execute,save:async loop=>{state.assembler=loop;await save();}});
   },controls);
   // Resources can finish after the source request. Their URLs are mutable data, not another layout generation.
   await controls();await liveTools(folder,input,Date.now()+480000,preview).execute({tool:'bundle'});await seal();return;
  }

  // "Wrap up and show the draft": render the code written so far without any further model request.
  if(state.wrapUp&&!['assembled','critic','complete'].includes(state.phase??'')){
   // A failed wrap-up does not stick: Try again continues the coding agent instead of repeating the wrap-up.
   state.wrapUp=false;note('Wrap-up: building the code written so far.');
   if(!state.design)throw Object.assign(new Error('WRAP_UP_NOTHING_TO_SHOW'),{detail:'The design document or its pictures are not ready yet, so there is no film to render.'});
   state.catalog??=[];if(input.stage==='draft')await writeFile(resolve(folder,'draft.json'),JSON.stringify(state.design));
   try{await sandboxTool(folder,'bundle',{});}catch(error){throw Object.assign(new Error('WRAP_UP_BUILD_FAILED'),{detail:`The code written so far does not build yet: ${(error instanceof Error?error.message:'build failed').slice(-400)}`});}
   const reference=input.variants[0],reports:Record<string,import('../../../packages/director/types').CheckReport>={};
   for(const format of input.formats){const variant=input.variants.find(v=>v.format===format.id);if(!variant)continue;
    if(input.stage==='draft'){const report=await wrapStaticFrames({design:state.design,render:async(sceneId,moment)=>JSON.parse((await sandboxTool(folder,'render',{variant,options:{sceneId,moment,check:false}},undefined,async still=>{await controls();const file=await (await import('../../../packages/director/policy.local')).confinedPath(folder,still.file.startsWith(folder+'/')?still.file.slice(folder.length+1):'rejected');await events.emit(`wrap:${variant.id}:${sceneId}:${moment}`,{stepId:`wrap:${variant.id}:${sceneId}:${moment}`,kind:'render',status:'done',proxy:state.design!.resources.some(r=>r.scene===sceneId&&r.proxy),message:'Work in progress, not checked.'},file);})).trim().split('\n').at(-1)!),failed:async(sceneId,moment,error)=>{await events.emit(`wrap:${variant.id}:${sceneId}:${moment}:failed`,{stepId:`wrap:${variant.id}:${sceneId}:${moment}`,kind:'render',status:'failed',message:'This moment could not be rendered. The remaining moments are still being collected.',detail:{error:error instanceof Error?error.message:'Render failed'}});}});if(report)reports[variant.id]=report;continue;}
    try{const result=JSON.parse((await sandboxTool(folder,'render',{variant,options:{video:variant.id===reference.id,check:true}})).trim().split('\n').at(-1)!);reports[variant.id]=result.report;}
    catch(error){if(variant.id===reference.id)throw Object.assign(new Error('WRAP_UP_RENDER_FAILED'),{detail:`The film could not be rendered: ${(error instanceof Error?error.message:'render failed').slice(-400)}`});}
   }
   if(input.stage==='draft'&&!reports[reference.id])throw new Error('WRAP_UP_RENDER_FAILED');
   const sealed=await snapshotFolder(folder,input.iterationId);state.sourceHash=sealed.hash;state.reports=reports;state.phase='assembled';
   checked(await admin.rpc('studio_append_director_iteration',{target:block.id,direction:input.directionId,device,token:work.lease_token,iteration:input.iterationId,number:state.iteration,source_hash:sealed.hash,document:{protocol:'director@1',design:state.design,catalog:state.catalog,source:sealed,reports,folder,variants:input.variants,unchecked:true}}));await save();
   const iteration=checked(await admin.from('studio_director_iterations').select('*').eq('id',input.iterationId).single());if(!iteration)throw new Error('ITERATION_REQUIRED');
   await publishDirectorReference(iteration as SealedIteration,input,block.campaign_id);await events.emit('delivery',{stepId:'delivery',kind:'delivery',status:'done',message:'The draft version is ready to view.'});
   state.phase='complete';state.wrapUp=false;await save('done');return;
  }
  if(!['assembled','critic','complete'].includes(state.phase??'')){
   state.phase='resources';await save();state.catalog=await buildResourceCatalog({folder,input,design:state.design!,maxStills:estimate.maxStills,perStillMicroUsd:estimate.perStillMicroUsd,allowed:r=>input.brief.synthesisAllowed===true||block.approved_resource_ids.includes(resourceRequest(r,input,estimate.perStillMicroUsd).key),produce:async(request,resource)=>{await events.emit(`picture:${resource.id}:running`,{stepId:`picture:${resource.id}`,kind:'picture',status:'running',message:'A picture has been requested.',proxy:resource.proxy,prompt:resource.prompt,reservedMicroUsd:estimate.perStillMicroUsd});return directorStillProducer({blockId:block.id,runId:input.runId,roundId:input.roundId,campaignId:block.campaign_id,directionId:input.directionId},estimate)(request,resource);},cached:(state.catalog??[]) as PricedResource[],save:async entry=>{await events.emit(`picture:${entry.id}:done`,{stepId:`picture:${entry.id}`,kind:'picture',status:'done',message:entry.proxy?'A still proxy is ready.':'A picture is ready.',proxy:entry.proxy,prompt:state.design!.resources.find(r=>r.id===entry.id)?.prompt,costMicroUsd:entry.costMicroUsd},resolve(folder,'public',entry.thumbnail));state.catalog=[...(state.catalog??[]).filter(e=>e.id!==entry.id),entry];await save();}});await save();
   state.phase='assembler';state.assembler??={turn:0,startedAt:Date.now(),transcript:[],complete:false};let toolSequence=state.assembler.transcript.length;const tools=input.stage==='draft'?staticTools(folder,input,state.design!,state.assembler.startedAt+estimate.roles.assembler.timeMs,async still=>{await controls();const file=await (await import('../../../packages/director/policy.local')).confinedPath(folder,still.file.startsWith(folder+'/')?still.file.slice(folder.length+1):'rejected');await events.emit(`still:${state.assembler!.turn}:${toolSequence}:${still.variantId}:${still.sceneId}:${still.moment}`,{stepId:`still:${state.assembler!.turn}:${toolSequence}:${still.variantId}:${still.sceneId}:${still.moment}`,kind:'render',status:'done',proxy:state.design!.resources.some(r=>r.scene===still.sceneId&&r.proxy),message:'Work in progress, not checked.',detail:{variantId:still.variantId,sceneId:still.sceneId,moment:still.moment}},file);}):compositionTools(folder,input,state.assembler.startedAt+estimate.roles.assembler.timeMs);if(input.stage==='draft')await writeFile(resolve(folder,'draft.json'),JSON.stringify(state.design));
   const execute=async(action:import('../../../packages/agents/prompts/assembler-v1').AssemblerAction)=>{toolSequence=state.assembler!.transcript.length;try{await controls();}catch(error){if(action.tool!=='write'||!(error instanceof Error&&['DIRECTOR_LIVE_WRAP_UP','DIRECTOR_LIVE_REVISION'].includes(error.message)))throw error;}return events.tool(state.assembler!.turn*1000+toolSequence,action,()=>tools.execute(action));},saveLoop=async(loop:NonNullable<WorkState['assembler']>)=>{state.assembler=loop;state.reports=tools.reports;await save();};
   if(input.stage==='draft')await assembleStatic({state:state.assembler,maxTurns:estimate.roles.assembler.requests,timeMs:estimate.roles.assembler.timeMs,filesContext:async loop=>{const source=await staticSourceContext(folder,input.iterationId);if(source.oversized)return source;try{compactDraftRequest(JSON.stringify({toolResults:loop.transcript,...(source.files.length?{currentFiles:source.files}:{}),...(source.construction?{construction:source.construction}:{})}),{instructions:snapshot.models.assembler.instructions,protocolInstructions:withCreativeHandoff(input,'coder',staticCoderInstructions),maxOutputTokens:snapshot.models.assembler.maxOutputTokens,pricing:snapshot.models.assembler.pricing,responseSchema:staticFilesSchema,campaignContext:{checkpointId:snapshot.checkpointId,...assemblerContext(input,state.design!,[...input.assets,...state.catalog!],state.notes??[])}},[]);}catch{return {...source,oversized:true};}return source;},call:async(loop,mode,currentFiles,construction)=>(await call('assembler',JSON.stringify({toolResults:loop.transcript,...(currentFiles?.length?{currentFiles}:{}),...(construction?{construction}:{})}),withCreativeHandoff(input,'coder',staticCoderInstructions)+(mode==='tools'?' Fallback: return JSON calls using write, read, typecheck, bundle, listResources and finish. Image exports are unavailable.':''),mode==='files'?staticFilesSchema:staticToolsSchema,assemblerContext(input,state.design!,[...input.assets,...state.catalog!],state.notes??[]),{turn:loop.turn,mode})).text,tool:execute,save:saveLoop});
   else await assemble({state:state.assembler,maxTurns:estimate.roles.assembler.requests,maxToolCalls:estimate.roles.assembler.requests*2,timeMs:estimate.roles.assembler.timeMs,call:async loop=>(await call('assembler',JSON.stringify({toolResults:compactTranscript(loop.transcript)}),assemblerInstructions,assemblerProviderSchema,assemblerContext(input,state.design!,[...input.assets,...state.catalog!],state.notes??[]),{turn:loop.turn})).text,tool:execute,save:saveLoop});
   state.reports=Object.keys(tools.reports).length?tools.reports:JSON.parse(await readFile(resolve(folder,'.reports','objective-results.json'),'utf8'));const sealed=await snapshotFolder(folder,input.iterationId);const finish=state.assembler.transcript.filter(t=>t.from==='tool').map(t=>JSON.parse(t.text)).findLast(t=>t.tool==='finish'&&t.result?.complete);if(finish?.result.sourceHash!==sealed.hash)throw new Error('CURRENT_SOURCE_CHECKS_REQUIRED');state.sourceHash=sealed.hash;state.phase='assembled';
   checked(await admin.rpc('studio_append_director_iteration',{target:block.id,direction:input.directionId,device,token:work.lease_token,iteration:input.iterationId,number:state.iteration,source_hash:sealed.hash,document:{protocol:'director@1',design:state.design,catalog:state.catalog,source:sealed,reports:state.reports,folder,variants:input.variants}}));await save();
  }
  if(state.phase==='assembled'||state.phase==='critic'){const iteration=checked(await admin.from('studio_director_iterations').select('*').eq('id',input.iterationId).single());if(!iteration)throw new Error('ITERATION_REQUIRED');await publishDirectorReference(iteration as SealedIteration,input,block.campaign_id);await events.emit('delivery',{stepId:'delivery',kind:'delivery',status:'done',message:'The draft version is ready to view.'});}
  if(state.phase==='assembled'||state.phase==='critic')await critiqueIteration({admin,blockId:block.id,input,state,folder,device,token:work.lease_token,call:(context,images)=>call('critic',input.stage==='draft'?'Review these static scene moments in every format.':'Review these rendered films in every format.',input.stage==='draft'?staticCriticInstructions:directorCriticInstructions,directorCriticSchema,context,'critique',images),save,emit:events.emit});
 }catch(error){const failure=error instanceof Error?error:new Error('DIRECTOR_EXECUTION_FAILED');state.lastFailure=failure.message;note(`Stopped: ${failure.message}${(failure as Error&{detail?:string}).detail?` — ${(failure as Error&{detail?:string}).detail}`:''}`);
  // An allowance stop of the coding agent says what its last tool result was, so the AD sees whether it was progressing.
  const lastTool=state.assembler?.transcript.findLast(t=>t.from==='tool')?.text;if(/ALLOWANCE/.test(failure.message)&&lastTool)Object.assign(failure,{detail:`${(failure as Error&{detail?:string}).detail??''} Last tool result: ${lastTool.slice(0,300)}`.trim()});
  if(failure.message==='STALE_DIRECTOR_LEASE')return;// another claim owns this work now
  try{
   if(failure.message==='DIRECTOR_LIVE_WRAP_UP'||state.wrapUp){await save('queued');return;}
   if(failure.message==='DIRECTOR_LIVE_REVISION'||state.liveRevision){beginLiveRevision(state,{blockId:block.id,directionId:input.directionId});await save('queued');return;}
   if(failure.message==='RUN_STOPPED'){state.pausedAt=Date.now();await save('queued');return;}
   if(transientExecutionFailure(failure.message)&&(state.transientRetries??0)<10){state.transientRetries=(state.transientRetries??0)+1;state.retryAt=Date.now()+Math.min(120000,3000*2**Math.min(state.transientRetries,6));state.pausedAt=Date.now();await events.emit(`local-retry:${state.transientRetries}`,{stepId:`local-retry:${state.transientRetries}`,kind:'control',status:'queued',costMicroUsd:0,message:'The local worker is recovering a temporary interruption. Saved source and approved limits are retained; no decision is needed.',detail:{code:failure.message,retryAt:state.retryAt}});await save('queued');return;}
   await save('review',questionForFailure(input,failure,failure.message==='RESOURCE_PERMISSION_REQUIRED'?estimate.perStillMicroUsd:estimate.maxCostMicroUsd));
  }catch(saveError){console.error('[director] could not save the stop reason; the lease will expire and the work is retried',failure.message,saveError instanceof Error?saveError.message:saveError);}
 }
 finally{clearInterval(beat);}
}
export async function processDirectorWork(device:string){await flushDirectorReceipts(adminClient());if(await processDirectorDelivery(device))return true;const result=await adminClient().rpc('studio_claim_director',{target_tenant:sharedTenant,device});if(result.error){if(['PGRST202','PGRST205','42883','42P01'].includes(result.error.code??''))return false;throw new Error(result.error.message);}if(!result.data)return false;await executeDirector(result.data as DirectorClaim,device);return true;}
