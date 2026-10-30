import {fillBriefIdentity} from '@/packages/brand/brief-identity';
import {canonicalJson} from '@/packages/contracts/common';
import {creativeStaleness} from '@/packages/creative/staleness';
import {creativeBrand} from '@/lib/server/creative-brand';
import {previewContinuationPlan} from '@/lib/server/preview-continuation';
import {runBudget} from '@/packages/contracts/run-budget';
import {settlePreviewRetryState} from '@/packages/data/preview-retry-state';
import {previewDiagnostic,PREVIEW_PROTOCOL,needsPreviewUpgrade,type PreviewInputs} from '@/packages/contracts/preview-proposal';
import {previewRequest,PREVIEW_SELECTION_REQUEST} from '@/lib/server/preview-request';
import {localizationCoverage} from '@/packages/contracts/localization';
import {draftLineage,isCurrentDraftBlock} from '@/packages/director/draft-lineage';
import {visibleDraftControl,visibleRunControl} from '@/packages/contracts/run-availability';
import {manualAttempt} from '@/packages/data/manual-attempt';
import {appendGuidedFeedback} from '@/packages/data/guided-feedback';
import {createHash} from 'node:crypto';
import {planningRecovery,outputDiagnostic} from '@/packages/contracts/agent-output';
import {isPlanningJob} from '@/packages/contracts/planning-job';
import {effectiveRunAgents} from '@/packages/data/run-limits';
import {providerFailureSummary} from '@/packages/contracts/provider-error';
import {modelCatalog} from '@/packages/agents/catalog';
import {diagnoseBrandProposal} from '@/packages/brand/proposal-diagnostic';
import {importSavedBrandProposal} from '@/lib/server/brand-kit';
import {readyBrandMaterialRefs} from '@/lib/server/brand-intake';
import {brandDraftSchema} from '@/packages/contracts/brand-kit';
import {api,body,json,ApiError} from '@/lib/server/api';
import {studioContext,campaignRecord,checked} from '@/lib/server/studio';
import {schemaMissing} from '@/lib/server/brief';
import {guidedRunCommand} from '@/packages/contracts/guided-run';
import {guidedDbError,approveRunBrand,resumeGuidedCreative} from '@/lib/server/guided-run';
import {submittedBrandbook} from '@/lib/server/brandbook-a1';
import {startLocalWorkflow,requireLocalDevice} from '@/lib/server/local-compute';
import {draftContext,draftDbError} from '@/lib/server/drafts';
export async function GET(_:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/run'>){return api(async()=>{
 const {id}=await ctx.params;await campaignRecord(id);const {admin,tenant}=await studioContext();
 const cp=checked(await admin.from('studio_c1_checkpoints').select('id,run_id,payload,brief_text').eq('campaign_id',id).eq('tenant_id',tenant).maybeSingle()),book=await submittedBrandbook(id);
 const run=cp?checked(await admin.from('studio_runs').select('*').eq('id',cp.run_id).eq('tenant_id',tenant).single()):null;
 const ready=await admin.from('studio_campaign_run_controls').select('run_id').limit(0);if(ready.error&&!schemaMissing(ready.error))guidedDbError(ready.error);
 const control=cp&&!ready.error?checked(await admin.from('studio_campaign_run_controls').select('*').eq('run_id',cp.run_id).eq('tenant_id',tenant).maybeSingle()):null;
 const round=cp?checked(await admin.from('studio_workflow_rounds').select('id,run_id,origin_c1_id,phase,blocker,status,a1_id').eq('run_id',cp.run_id).eq('kind','draft').eq('tenant_id',tenant).order('round_no',{ascending:false}).limit(1).maybeSingle()):null;
 const jobs=round?checked(await admin.from('studio_workflow_jobs').select('id,job_key,role,kind,state,blocker,output,output_hash,attempt_count,attempt_allowance,available_at,created_at').eq('round_id',round.id).eq('tenant_id',tenant).not('job_key','like','%.history.%').order('created_at')):[];
 const changes=cp&&!ready.error?checked(await admin.from('studio_run_change_requests').select('id,role,note,state,created_at').eq('run_id',cp.run_id).order('created_at',{ascending:false}).limit(10)):[];
 const requestIds=control?[control.cursor.brandRequestId,control.cursor.assemblyRequestId].filter(v=>typeof v==='string'):[];
 const steps=cp&&requestIds.length?checked(await admin.from('studio_agent_steps').select('id,role,status,error_code,cost_micro_usd,output,model_id,usage,config_snapshot,reserve_micro_usd').eq('tenant_id',tenant).eq('run_id',cp.run_id).in('request_id',requestIds))??[]:[];
 const assembly=control?.cursor.assemblyStepId&&cp?await manualAttempt(admin,tenant,cp.run_id,String(control.cursor.assemblyStepId)):null;
 if(assembly&&assembly.stepId!==control?.cursor.assemblyStepId){const latest=checked(await admin.from('studio_agent_steps').select('id,role,status,error_code,cost_micro_usd,output,model_id,usage,config_snapshot,reserve_micro_usd').eq('id',assembly.stepId).eq('run_id',cp!.run_id).eq('tenant_id',tenant).maybeSingle());const old=steps.findIndex(s=>s.id===control?.cursor.assemblyStepId);if(old>=0)steps.splice(old,1);if(latest)steps.push(latest);}
 const limitProbe=await admin.from('studio_run_limit_revisions').select('id').limit(0);if(limitProbe.error&&!schemaMissing(limitProbe.error))guidedDbError(limitProbe.error);
 const revisions=run&&!limitProbe.error?checked(await admin.from('studio_run_limit_revisions').select('id,version,created_at,previous_run_cap,run_cap,continue_run').eq('run_id',run.id).eq('tenant_id',tenant).order('version',{ascending:false}).limit(20))??[]:[];
 const limits={ready:!limitProbe.error,version:revisions[0]?.version??0,agents:run?await effectiveRunAgents(admin,run,{directorOverrides:control?.stage!=='planning'}):[],history:revisions};
 let failureStep=null;
 const failedJob=jobs?.find(j=>j.state==='failed'||j.state==='blocked'&&j.kind==='text');
 if(failedJob){const attempt=checked(await admin.from('studio_workflow_attempts').select('step_id,state').eq('job_id',failedJob.id).order('attempt_no',{ascending:false}).limit(1).maybeSingle());
  const last=attempt?.step_id?checked(await admin.from('studio_agent_steps').select('id,role,model_id,status,error_code,output,cost_micro_usd,reserve_micro_usd,usage,config_snapshot').eq('id',attempt.step_id).eq('tenant_id',tenant).maybeSingle()):null;
  if(last){
   let recoveryReady=false,canRecover=false,validMetadata=false,variantIdentityRecovery=false,diagnostics:string[]=[];
   if(last.output&&last.error_code==='INVALID_OUTPUT_SCHEMA'&&cp){try{const recovered=planningRecovery(last.output,last.role,cp.payload.variantManifest);variantIdentityRecovery=recovered.changes.includes('application-variant-identities');validMetadata=true;canRecover=control?.stage==='planning'&&['blocked','paused'].includes(control.status)&&run?.status==='active'&&Number(run.reserved_micro_usd)===0&&failedJob.state==='failed'&&attempt?.state==='failed'&&last.status==='failed'&&last.cost_micro_usd!==null&&last.cost_micro_usd>=0&&last.cost_micro_usd<=last.reserve_micro_usd&&last.usage?._studio?.finishReason==='stop';if(canRecover){const version=await admin.rpc(variantIdentityRecovery?'studio_workflow_binding_recovery_version':'studio_workflow_role_recovery_version');recoveryReady=!version.error&&version.data===(variantIdentityRecovery?'variant-identities@1':'role-label@2');}diagnostics=[canRecover?(variantIdentityRecovery?'Only application-owned variant IDs are restored from exact ordered axes. All creative content and the original paid receipt are kept.':'Only the role spelling changes. All creative content, questions, warnings and the original paid receipt are kept.'):'The saved answer is complete. Recovery is available after the run is active and the stopped requests have settled.'];}catch(error){const d=outputDiagnostic(error);diagnostics=[d.message,...d.issues];}}
   failureStep={id:last.id,jobId:failedJob.id,role:last.role,model:last.model_id,status:last.status,code:last.error_code??failedJob.blocker,output:last.output,cost:last.cost_micro_usd,maxOutputTokens:last.config_snapshot.maxOutputTokens,message:validMetadata?(variantIdentityRecovery?'The saved answer is complete. Variant ID typos can be corrected from exact approved bindings without another generation.':'The saved answer is complete. Its role label can be corrected locally without another generation.'):providerFailureSummary(last.error_code??failedJob.blocker??'STEP_FAILED',last.output,last.usage).message,canRecover,recoveryReady,variantIdentityRecovery,diagnostics};
   if(last.role==='localization'&&last.output&&cp){const coverage=localizationCoverage(last.output,cp.payload.variantManifest.entries);if(coverage&&(coverage.foreign||coverage.missing||coverage.localeMismatches)){failureStep.message=`The saved copy matches ${coverage.covered} of ${coverage.expected} ordered output bindings. ${coverage.missing} bindings are missing${coverage.foreign?` and ${coverage.foreign} unknown variant ID${coverage.foreign===1?' was':'s were'} returned`:''}.`;failureStep.diagnostics=['The text is saved, but missing or invented bindings cannot be guessed. A corrected request now uses application-owned binding indexes for each locale, concept and duration.'];}}

  }
 }
 let planningConfigRecovery=null;
 const planningStop=jobs?.find(j=>isPlanningJob(j,'draft')&&j.state==='failed'&&j.blocker==='CHECKPOINT_CONFIG_MISMATCH');
 if(planningStop){const last=checked(await admin.from('studio_workflow_attempts').select('step_id,state,error_code').eq('job_id',planningStop.id).order('attempt_no',{ascending:false}).limit(1).maybeSingle());if(last?.state==='failed'&&last.error_code==='CHECKPOINT_CONFIG_MISMATCH'&&!last.step_id){const protocol=await admin.rpc('studio_planning_admission_version');planningConfigRecovery={jobId:planningStop.id,role:planningStop.role,ready:!protocol.error&&protocol.data==='planning@2'};}}
 const assemblyStep=assembly&&!assembly.pending?steps.find(s=>s.id===assembly.stepId):null;
 if(control?.stage==='assembly'&&assemblyStep&&['failed','unknown'].includes(assemblyStep.status))failureStep={id:assemblyStep.id,jobId:assembly?.job?.id??'',role:assemblyStep.role,model:assemblyStep.model_id,status:assemblyStep.status,code:assemblyStep.error_code,output:assemblyStep.output,cost:assemblyStep.cost_micro_usd,maxOutputTokens:assemblyStep.config_snapshot.maxOutputTokens,canRecover:false,recoveryReady:false,diagnostics:providerFailureSummary(assemblyStep.error_code??'STEP_FAILED',assemblyStep.output,assemblyStep.usage).details,message:assemblyStep.status==='unknown'&&!assemblyStep.usage?._studio?.providerError?'Preview generation was interrupted. Retry this step to continue; your completed planning stays saved.':assemblyStep.error_code==='RECONCILED_NO_ACTIVATION'?'The provider cost is verified. No complete preview result was received. You can authorize a new preview attempt after reopening this run.':providerFailureSummary(assemblyStep.error_code??'STEP_FAILED',assemblyStep.output,assemblyStep.usage).message.replace('No kit was imported.','No preview was imported.')};
 if(failureStep&&control?.stage==='assembly'&&assembly?.job?.state==='failed'&&assembly.errorCode&&assembly.errorCode!=='RECONCILED_NO_ACTIVATION'){failureStep.code=assembly.errorCode;failureStep.message=providerFailureSummary(assembly.errorCode,assemblyStep?.output,assemblyStep?.usage).message.replace('No kit was imported.','No preview was imported.');}
 const previewInputs=assemblyStep?.config_snapshot.campaignContext?{plan:assemblyStep.config_snapshot.campaignContext.draftAssembly.plan,entries:assemblyStep.config_snapshot.campaignContext.draftAssembly.context.manifest.entries,assets:assemblyStep.config_snapshot.campaignContext.availableAssets,planning:assemblyStep.config_snapshot.campaignContext.planning} as PreviewInputs:null;
 const importFailure=!!(control?.stage==='assembly'&&control.blocker==='INVALID_PROPOSAL'&&assemblyStep?.status==='succeeded'&&assemblyStep.output&&previewInputs);
 if(importFailure){const diagnostics=previewDiagnostic(assemblyStep!.output!,previewInputs!);failureStep={id:assemblyStep!.id,jobId:assembly!.job!.id,role:assemblyStep!.role,model:assemblyStep!.model_id,status:assemblyStep!.status,code:'INVALID_PROPOSAL',output:assemblyStep!.output,cost:assemblyStep!.cost_micro_usd,maxOutputTokens:assemblyStep!.config_snapshot.maxOutputTokens,canRecover:false,recoveryReady:false,diagnostics,message:'The agent responded, but its result is not an importable preview plan. Retry uses the corrected preview contract; completed planning stays saved.'};}
 const uncertain=cp?checked(await admin.from('studio_agent_steps').select('reserve_micro_usd,cost_micro_usd').eq('tenant_id',tenant).eq('run_id',cp.run_id).eq('status','unknown'))??[]:[];
 const retryProbe=await admin.from('studio_preview_retry_authorizations').select('id').limit(0);
 if(retryProbe.error&&!schemaMissing(retryProbe.error))guidedDbError(retryProbe.error);
 const authorizations=cp&&!retryProbe.error?checked(await admin.from('studio_preview_retry_authorizations').select('held_micro_usd').eq('tenant_id',tenant).eq('run_id',cp.run_id))??[]:[];
 const uncertainMicroUsd=uncertain.reduce((sum,s)=>sum+Number(s.cost_micro_usd!==null&&s.cost_micro_usd>=0&&s.cost_micro_usd<=s.reserve_micro_usd?s.cost_micro_usd:s.reserve_micro_usd),0)+authorizations.reduce((sum,a)=>sum+Number(a.held_micro_usd),0);
 const protocolUpgrade=!!(control?.stage==='assembly'&&assemblyStep&&assembly?.job&&needsPreviewUpgrade(assemblyStep));
 const correctionProbe=protocolUpgrade?await admin.rpc('studio_preview_protocol_version'):null;
 if(correctionProbe?.error&&!schemaMissing(correctionProbe.error))guidedDbError(correctionProbe.error);
 const assemblyRetry=protocolUpgrade?{stepId:assemblyStep!.id,attempts:assembly!.job!.attempt_count,ready:!correctionProbe?.error&&correctionProbe?.data===PREVIEW_PROTOCOL,kind:'correct' as const}:assemblyStep&&['failed','unknown'].includes(assemblyStep.status)&&assembly?.job&&['failed','blocked'].includes(assembly.job.state)&&assembly.job.attempt_count<3&&(run?.status==='active'||run?.closure_reason==='provider_status_unknown')?{stepId:assemblyStep.id,attempts:assembly.job.attempt_count,ready:!retryProbe.error,kind:'retry' as const}:null;
 let assemblyContinuation=null,continuationError=null;
 if(run&&limitProbe.error===null){try{assemblyContinuation=(await previewContinuationPlan(admin,tenant,run,control,limits.agents,limits.version,async()=>previewRequest(await draftContext(id),PREVIEW_SELECTION_REQUEST)))?.quote??null;}catch{continuationError='The next attempt could not be estimated. Refresh to load its current cost before continuing.';}}
 if(failureStep&&assembly?.job?.state==='failed'&&['RUN_CAP_REACHED','STEP_CAP_REACHED'].includes(assembly.errorCode??'')){failureStep.message=assembly.errorCode==='STEP_CAP_REACHED'?'Nothing was sent to the AI provider: the next attempt does not fit the remaining preview-assembly allowance. Earlier charges and unconfirmed holds stay counted.':'Nothing was sent to the AI provider: the next attempt does not fit the remaining run budget. Earlier charges and unconfirmed holds stay counted.';failureStep.diagnostics=[];}
 const budgetSteps=run?checked(await admin.from('studio_agent_steps').select('role,status,cost_micro_usd,reserve_micro_usd').eq('tenant_id',tenant).eq('run_id',run.id))??[]:[];
 if(failureStep&&failureStep.role!=='brand-kit')failureStep.message=failureStep.message.replace('No kit was imported.','Nothing was applied.');
 const budget=run?runBudget(run,limits.agents,budgetSteps,{code:failureStep?.code??control?.blocker,role:failureStep?.role??failedJob?.role??null}):null;
 const retryAction=assemblyContinuation?.mode==='replace'||protocolUpgrade&&assemblyContinuation?null:assemblyRetry;
 let brandResult=null;
 const brandStep=steps?.find(s=>s.id===control?.cursor.brandStepId&&s.role==='brand-kit');
 if(brandStep&&cp&&control?.stage==='brand'){
  const draft=checked(await admin.from('studio_brand_drafts').select('version,payload').eq('tenant_id',tenant).eq('campaign_id',id).single()),assets=checked(await admin.from('asset_revisions').select('id,filename,mime,bytes,sha256').eq('tenant_id',tenant).eq('campaign_id',id))??[];
  if(draft)brandResult=diagnoseBrandProposal({stepId:brandStep.id,model:brandStep.model_id,costMicroUsd:brandStep.cost_micro_usd,status:brandStep.status,errorCode:brandStep.error_code,usage:brandStep.usage,output:brandStep.output,draft:brandDraftSchema.parse(draft.payload),draftVersion:draft.version,preparedVersion:Number(control.cursor.brandPreparedVersion),checkpointId:cp.id,briefRevisionId:cp.payload.briefSubmission.revisionId,assets,materials:await readyBrandMaterialRefs(id)});
 }
 const creativeProbe=round?await admin.from('studio_creative_blocks').select('estimate_micro_usd,repair_allowance_micro_usd,repair_log,questions,snapshot,brand_system_hash').eq('tenant_id',tenant).eq('round_id',round.id).maybeSingle():null;
 const creativeRepairSteps=round&&creativeProbe?.data?checked(await admin.from('studio_agent_steps').select('id,role,status,cost_micro_usd,config_snapshot').eq('tenant_id',tenant).eq('run_id',cp!.run_id).eq('config_snapshot->>creativeRepair','true').eq('config_snapshot->>creativeRoundId',round.id))??[]:[];
 const creative=creativeProbe?.data?{estimateMicroUsd:creativeProbe.data.estimate_micro_usd,repairAllowanceMicroUsd:creativeProbe.data.repair_allowance_micro_usd,repairSpentMicroUsd:creativeRepairSteps.reduce((sum,s)=>sum+(s.cost_micro_usd??0),0),repairCharges:creativeRepairSteps.map(s=>({stepId:s.id,role:s.role,direction:s.config_snapshot.campaignContext?.direction??s.config_snapshot.creativeDirection??0,costMicroUsd:s.cost_micro_usd,status:s.status})),repairLog:creativeProbe.data.repair_log,questions:creativeProbe.data.questions}:null;
 if(creative&&run){const counters=await admin.rpc('studio_creative_counters',{target_run:run.id,target_tenant:tenant});if(counters.error&&!schemaMissing(counters.error))guidedDbError(counters.error);if(!counters.error)Object.assign(creative,{counters:counters.data});}
 if(creative&&creativeProbe?.data){const a1=checked(await admin.from('studio_a1_reviews').select('brand_revision_id').eq('id',round!.a1_id).maybeSingle());if(a1){const revision=checked(await admin.from('studio_brand_revisions').select('id,payload').eq('id',a1.brand_revision_id).maybeSingle());if(revision){const current=await creativeBrand(id,{id:revision.id,kit:revision.payload.kit});fillBriefIdentity(current.system,JSON.parse(cp?.brief_text??'{}').questionnaire?.product);Object.assign(creative,creativeStaleness(creativeProbe.data.snapshot,creativeProbe.data.brand_system_hash,createHash('sha256').update(canonicalJson(current.system)).digest('hex')));}}}
 const creativeReadiness=null;const directorProbe=await admin.from('studio_director_blocks').select('id,run_id,round_id,status,snapshot').eq('tenant_id',tenant).eq('campaign_id',id).neq('status','quoted').order('created_at',{ascending:false});const lineage=round?draftLineage(round,jobs??[]):null,currentDirector=directorProbe.data?.find(b=>isCurrentDraftBlock(b,lineage)),directorActive=!!currentDirector,directorReady=!directorProbe.error;
 const devices=checked(await admin.from('studio_workflow_devices').select('id').eq('tenant_id',tenant).eq('state','online').gte('heartbeat_at',new Date(Date.now()-45000).toISOString()).limit(1));
 let reviewerName='';try{reviewerName=JSON.parse(cp?.brief_text??'{}').questionnaire?.ownerName??'';}catch{}
 // Why each queued creative step is not running yet, so a stall is never silent.
 const creativeWaits:Record<string,string>={};
 if(round&&jobs?.some(j=>j.job_key.startsWith('creative.')&&j.state==='queued')){
  const queued=jobs.filter(j=>j.job_key.startsWith('creative.')&&j.state==='queued'),deps=checked(await admin.from('studio_workflow_dependencies').select('job_id,requires_id').in('job_id',queued.map(j=>j.id)))??[];
  for(const job of queued){
   const pending=deps.filter(d=>d.job_id===job.id).map(d=>jobs.find(j=>j.id===d.requires_id)).filter(p=>p&&p.state!=='succeeded');
   const d=Number(job.job_key.match(/\.d(\d+)$/)?.[1]??0),earlier=[0,1,2].find(x=>x<d&&jobs.some(j=>j.job_key.startsWith('creative.')&&j.job_key.endsWith(`.d${x}`)&&j.state!=='succeeded'));
   if(earlier!==undefined){creativeWaits[job.job_key]=`after Direction ${earlier+1}`;continue;}
   creativeWaits[job.job_key]=run?.status!=='active'?`run ${run?.status}`:round.status!=='active'?`round ${round.status}`:round.blocker?`round blocked: ${round.blocker}`:job.attempt_count>=job.attempt_allowance?`attempt limit ${job.attempt_count}/${job.attempt_allowance}`:pending.length?`after ${pending.map(p=>p!.job_key.replace(/^creative\./,'')).join(', ')}`:new Date(job.available_at).getTime()>Date.now()?'retry scheduled':!devices?.length?'worker offline':'ready for the worker';
  }
 }
 return json({planningConfigRecovery,directorActive,directorReady,creativeWaits,creative,creativeReadiness,limits,budget,failureStep,assemblyRetry:retryAction,assemblyContinuation,continuationError,uncertainMicroUsd,brandResult,schemaReady:!ready.error,workerOnline:!!devices?.length,brief:cp?{id:cp.id,orderedVariants:cp.payload.variantManifest.entries.length,locales:cp.payload.scope.locales,reviewerName}:null,book:book?{id:book.id,version_no:book.version_no,findings:book.summary.findings}:null,run,control:visibleRunControl(directorReady?visibleDraftControl(control,round,{active:directorActive,status:currentDirector?.status}):control,run,assembly?.pending?steps.filter(s=>s.role!=='creative-code'):steps),round,jobs:(jobs??[]).map(j=>{if(!j.job_key.startsWith('creative.')||!j.output)return j;try{const result=JSON.parse(j.output);return {...j,output:JSON.stringify({stage:result.stage,issues:result.issues,repairLog:result.repairLog})};}catch{return j;}}),changes:changes??[],steps:steps??[]});
});}
export async function POST(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/run'>){return api(async()=>{
 const {id}=await ctx.params;await campaignRecord(id);const input=await body(request,guidedRunCommand),{admin,tenant,actorId}=await studioContext();requireLocalDevice();
 const cp=checked(await admin.from('studio_c1_checkpoints').select('run_id').eq('campaign_id',id).eq('tenant_id',tenant).maybeSingle());if(!cp)throw new ApiError(409,'C1_REQUIRED','Submit the questionnaire first.');
 if(input.action==='recoverPlanningConfig'){
  const job=checked(await admin.from('studio_workflow_jobs').select('id').eq('id',input.jobId).eq('run_id',cp.run_id).eq('tenant_id',tenant).maybeSingle());if(!job)throw new ApiError(404,'WORKFLOW_JOB_NOT_FOUND','This saved planning step is not available.');
  const result=await admin.rpc('studio_recover_planning_config',{target_job:job.id,request_key:input.requestId,acting_user:actorId});
  if(result.error){if(['PGRST202','42883'].includes(result.error.code??''))throw new ApiError(503,'PLANNING_ADMISSION_SCHEMA_REQUIRED','Apply migration 20261029005500_planning_admission_scope.sql, then continue saved planning. No provider request was sent.');const messages:Record<string,string>={STALE_PLANNING_RECOVERY:'This planning step changed. Reload its current saved status.',CHECKPOINT_CONFIG_MISMATCH:'The saved planning source still differs from its checkpoint. No new request was admitted.',UNRESOLVED_PROVIDER_RECEIPT:'An earlier request needs its receipt settled before planning can continue.',PLANNING_ATTEMPTS_EXHAUSTED:'This planning step used its approved attempts. Its history and completed work remain saved.',RUN_STOPPED:'Resume the run before continuing planning.'};const code=Object.keys(messages).find(k=>result.error!.message.includes(k));if(code)throw new ApiError(409,code,messages[code]);guidedDbError(result.error);}
  let processing=true;try{await startLocalWorkflow();}catch{processing=false;}
  return json({message:processing?'Saved planning is queued within the existing budget. Completed steps are kept.':'Planning recovery is saved. Use Continue work to start local processing.',requestId:input.requestId,processing},202);
 }
 if(input.action==='continueAssembly'){
  const replaced=await admin.from('studio_preview_request_replacements').select('id,run_id').eq('source_attempt_id',input.attemptId).maybeSingle();
  if(!replaced.error&&replaced.data){if(replaced.data.run_id!==cp.run_id)throw new ApiError(409,'REQUEST_CONFLICT','This attempt already has a different continuation. Reload the run.');let processing=true;try{await startLocalWorkflow();}catch{processing=false;}return json({message:processing?'This request was already replaced and is queued. Earlier charges stay counted.':'This request was already replaced. Use Continue work to start local processing.'},202);}
  const prior=await admin.from('studio_preview_budget_continuations').select('id,run_id,job_id,source_attempt_id,quote_id').eq('source_attempt_id',input.attemptId).maybeSingle();
  if(prior.error&&schemaMissing(prior.error))throw new ApiError(503,'PREVIEW_CONTINUATION_SCHEMA_REQUIRED','Apply the Preview continuation update shown below, then continue. No request was submitted.');
  guidedDbError(prior.error);
  if(prior.data){if(prior.data.run_id!==cp.run_id||prior.data.job_id!==input.jobId)throw new ApiError(409,'REQUEST_CONFLICT','This attempt already has a different continuation. Reload the run.');let processing=true;try{await startLocalWorkflow();}catch{processing=false;}return json({message:processing?'This attempt was already authorized and is queued. Earlier charges stay counted.':'This attempt was already authorized. Use Continue work to start local processing.'},202);}
  const run=checked(await admin.from('studio_runs').select('*').eq('id',cp.run_id).eq('tenant_id',tenant).single()),control=checked(await admin.from('studio_campaign_run_controls').select('*').eq('run_id',cp.run_id).eq('tenant_id',tenant).single());
  const revisions=checked(await admin.from('studio_run_limit_revisions').select('version').eq('run_id',cp.run_id).order('version',{ascending:false}).limit(1));
  const plan=await previewContinuationPlan(admin,tenant,run,control,await effectiveRunAgents(admin,run),revisions?.[0]?.version??0,async()=>previewRequest(await draftContext(id),PREVIEW_SELECTION_REQUEST)),quote=plan?.quote;
  if(!quote||quote.jobId!==input.jobId||quote.attemptId!==input.attemptId||quote.quoteId!==input.quoteId||quote.reservationMicroUsd!==input.maxCostMicroUsd||quote.runCapMicroUsd!==input.runCapMicroUsd||quote.agentCapMicroUsd!==input.agentCapMicroUsd||quote.expectedVersion!==input.expectedVersion)throw new ApiError(409,'PREVIEW_ESTIMATE_CHANGED','The attempt or its price changed. Review the updated price, then continue. No request was submitted.');
  if(!quote.ready)throw new ApiError(503,'PREVIEW_CONTINUATION_SCHEMA_REQUIRED','Apply the Preview continuation update shown below, then continue. No request was submitted.');
  const common={target_run:cp.run_id,target_job:quote.jobId,source_attempt:quote.attemptId,request_key:input.requestId,quote_hash:quote.quoteId,expected_version:quote.expectedVersion,reservation:quote.reservationMicroUsd,run_cap:quote.runCapMicroUsd,agent_cap:quote.agentCapMicroUsd,acting_user:actorId};
  // An outdated wire protocol is never resent: replace it with a new request in the current protocol.
  const result=quote.mode==='replace'&&plan.request?await admin.rpc('studio_replace_preview_request',{...common,model:plan.request.model,prompt_text:plan.request.prompt,snapshot:plan.request.snapshot}):await admin.rpc('studio_continue_preview',common);
  if(result.error&&schemaMissing(result.error))throw new ApiError(503,'PREVIEW_CONTINUATION_SCHEMA_REQUIRED','Apply the Preview continuation update shown below, then continue. No request was submitted.');
  guidedDbError(result.error);
  let processing=true;try{await startLocalWorkflow();}catch{processing=false;}
  const raised=quote.needsLimitIncrease?' Only the limit increases shown were authorized.':'';
  const what=quote.mode==='replace'?'New preview request (current format)':`Attempt ${quote.nextAttempt}`;
  return json({message:processing?`${what} queued.${raised} Earlier charges stay counted.`:`${what} authorized.${raised} Use Continue work to start local processing.`},202);
 }
 if(input.action==='retryAssembly'){
  const source=checked(await admin.from('studio_agent_steps').select('*').eq('id',input.stepId).eq('run_id',cp.run_id).eq('tenant_id',tenant).single());
  if(source&&needsPreviewUpgrade(source)){
   const version=await admin.rpc('studio_preview_protocol_version');
   if(version.error||version.data!==PREVIEW_PROTOCOL)throw new ApiError(503,'PREVIEW_PROTOCOL_SCHEMA_REQUIRED','Apply the Preview contract update in Technical details, then Retry. No request was submitted.');
   const control=checked(await admin.from('studio_campaign_run_controls').select('stage,status,blocker,cursor').eq('run_id',cp.run_id).eq('tenant_id',tenant).single());
   if(control?.stage==='assembly'&&control.status==='running'&&typeof control.cursor.assemblyStepId==='string'){
    const current=await manualAttempt(admin,tenant,cp.run_id,control.cursor.assemblyStepId);
    if(current.stepId!==source.id||current.pending||!['failed','succeeded'].includes(current.job?.state??''))throw new ApiError(409,'STALE_PREVIEW_RETRY','The preview step changed. Reload the run before retrying.');
    try{await settlePreviewRetryState({initialStep:control.cursor.assemblyStepId,wake:startLocalWorkflow,read:async()=>checked(await admin.from('studio_campaign_run_controls').select('stage,status,blocker,cursor').eq('run_id',cp.run_id).eq('tenant_id',tenant).single())});}
    catch(error){if(error instanceof Error&&error.message==='PREVIEW_RETRY_SETTLING')throw new ApiError(409,'PREVIEW_RETRY_SETTLING','The failed preview is still being synchronized. No new AI request was submitted. Wait a moment and press Retry again.');throw error;}
   }
   const saved=await draftContext(id),proposal=await previewRequest(saved,'Select saved copy and real media references for all three directions and every binding. Never regenerate copy, scope or resource names.');
   const result=await admin.rpc('studio_correct_preview_protocol',{target_run:cp.run_id,source_step:source.id,request_key:input.requestId,model:proposal.model,prompt_text:proposal.prompt,snapshot:{...proposal.snapshot,sourcePreviewStepId:source.id},reservation:proposal.reservation,acting_user:actorId});
   if(result.error&&schemaMissing(result.error))throw new ApiError(503,'PREVIEW_PROTOCOL_SCHEMA_REQUIRED','Apply the Preview contract database update from Technical details, then Retry.');
   guidedDbError(result.error);let processing=true;try{await startLocalWorkflow();}catch{processing=false;}
   return json({message:processing?'Preview reference selection queued. Saved copy and media are reused; earlier charges remain counted.':'Correction saved. Use Continue work to resume local processing.',requestId:input.requestId,processing},202);
  }
  const result=await admin.rpc('studio_retry_preview',{target_run:cp.run_id,target_step:input.stepId,request_key:input.requestId,acting_user:actorId});
  if(result.error&&schemaMissing(result.error))throw new ApiError(503,'SIMPLE_RETRY_SCHEMA_REQUIRED','The Retry database update is required. Open Setup update in the technical details.');
  guidedDbError(result.error);
  let processing=true;try{await startLocalWorkflow();}catch{processing=false;}
  return json({message:processing?'Retry queued. Completed planning is kept; the earlier request stays counted in your budget.':'Retry saved. Local processing could not start; use Continue work to resume.',requestId:input.requestId,processing},202);
 }
 if(input.action==='recoverWorkflowResult'){
  const job=checked(await admin.from('studio_workflow_jobs').select('*').eq('id',input.jobId).eq('run_id',cp.run_id).eq('tenant_id',tenant).single()),step=checked(await admin.from('studio_agent_steps').select('*').eq('id',input.stepId).eq('run_id',cp.run_id).eq('tenant_id',tenant).single()),checkpoint=checked(await admin.from('studio_c1_checkpoints').select('payload').eq('run_id',cp.run_id).eq('tenant_id',tenant).single());
  if(!job||!step?.output||!checkpoint)throw new ApiError(409,'RESULT_NOT_FOUND','The saved response is no longer available.');
  let normalized;try{normalized=planningRecovery(step.output,job.role,checkpoint.payload.variantManifest);}catch(error){throw new ApiError(409,'UNRECOVERABLE_OUTPUT',outputDiagnostic(error).message);}
  const result=await admin.rpc('studio_recover_saved_workflow_output',{target_job:job.id,target_step:step.id,expected_input:job.input_hash,expected_config:job.config_hash,original_sha:createHash('sha256').update(step.output).digest('hex'),result_text:normalized.text,acting_user:actorId});guidedDbError(result.error);
  return json({message:'Saved result recovered without an AI call or additional charge. Processing is stopped; continue when you are ready.'});
 }
 if(input.action==='stop'){guidedDbError((await admin.rpc('studio_stop_guided_run',{target_run:cp.run_id,acting_user:actorId})).error);return json({message:'Stopped. No new requests will start. Submitted requests may finish; their actual costs remain counted.'});}
 if(input.action==='restart'){
  // Same brief, Brand Kit, agents and caps; planning and drafts are made again. History and charges are kept.
  const result=await admin.rpc('studio_restart_guided_run',{target_run:cp.run_id,acting_user:actorId});
  if(result.error){const known:Record<string,string>={RUN_NOT_STARTED:'Planning has not started yet; there is nothing to restart.',CHECKPOINT_CHANGE_REQUIRED:'These drafts are already with the client. Request changes through the client review instead.',DRAFT_REVIEW_LOCKED:'These drafts were already accepted. Request changes through the client review instead.',RUN_BUSY:'A step is running right now. Wait for it to finish, then restart.',UNRESOLVED_PROVIDER_RECEIPT:'A paid request has not settled yet. Wait for it, then restart.',RUN_NOT_ACTIVE:'This run is closed and cannot be restarted.'};
   if(['42883','PGRST202'].includes(result.error.code??''))throw new ApiError(503,'RESTART_SCHEMA_REQUIRED','Apply supabase/migrations/20261028003400_restart_guided_run.sql to enable restarting a run.');
   const key=Object.keys(known).find(k=>result.error!.message.includes(k));if(key)throw new ApiError(409,key,known[key]);guidedDbError(result.error);}
  await startLocalWorkflow();return json({message:'Run restarted from planning with the same brief and Brand Kit. Earlier results and costs stay in its history.'},202);
 }
 if(input.action==='limits'){
  const config=checked(await admin.from('studio_runs').select('id,config_snapshot').eq('id',cp.run_id).eq('tenant_id',tenant).single());
  const catalog=await modelCatalog();for(const change of input.agents){const agent=config?.config_snapshot.find((a:{role:string})=>a.role===change.role),model=catalog.find(m=>m.id===agent?.model_id);if(!model||change.maxOutputTokens>model.maxOutput)throw new ApiError(409,'MODEL_OUTPUT_LIMIT',`The selected ${change.role} model cannot use that output allowance. Maximum: ${model?.maxOutput??'unavailable'} tokens.`);}
  const result=await admin.rpc('studio_amend_run_limits',{target_run:cp.run_id,request_key:input.requestId,expected_version:input.expectedVersion,run_cap:input.runCapMicroUsd,agents:input.agents,continue_run:input.continueRun,retry_job:input.retryJobId,acting_user:actorId});guidedDbError(result.error);
  if(input.continueRun)await startLocalWorkflow();return json({message:input.continueRun?'Limits authorized. Continuing from the stopped step; earlier charges remain counted.':'Limits updated. No request was started.',version:result.data});
 }
 if(input.action==='wake'){const run=checked(await admin.from('studio_runs').select('status').eq('id',cp.run_id).eq('tenant_id',tenant).single());if(run?.status!=='active')throw new ApiError(409,'UNRESOLVED_PROVIDER_RECEIPT','Check the provider receipt and reopen this run before continuing.');await resumeGuidedCreative(id).catch(()=>false);await startLocalWorkflow();return json({message:'Local processing resumed from the saved position.'},202);}
 if(input.action==='start'){
  const result=await admin.rpc('studio_start_guided_run',{target_run:cp.run_id,acting_user:actorId});guidedDbError(result.error);await startLocalWorkflow();return json({message:'Run started. Submitted inputs are carried forward automatically.',control:result.data},202);
 }
 const control=checked(await admin.from('studio_campaign_run_controls').select('*').eq('run_id',cp.run_id).eq('tenant_id',tenant).single());
 if(input.action==='recoverBrandResult'){
  if(control.stage!=='brand'||control.cursor.brandStepId!==input.stepId)throw new ApiError(409,'RESULT_NOT_CURRENT','Only this run’s current saved brand result can be recovered.');
  const result=await importSavedBrandProposal(id,input.expectedVersion,input.stepId);
  return json({message:'Saved result recovered. No AI request or additional charge. Review the campaign rules below.',version:result.version});
 }
 if(input.action==='approveBrand'){const result=await approveRunBrand(control,input);await startLocalWorkflow();return json({message:'Brand review recorded. Scenarios and planning will now advance automatically.',control:result});}
 if(input.action==='confirmDraftInputs'){
  if(control.stage!=='assembly'||control.status!=='review')throw new ApiError(409,'REVIEW_REQUIRED','Wait for the preview source review.');
  const saved=await draftContext(id);if(saved.plan?.version!==input.expectedPlanVersion)throw new ApiError(409,'STALE_DRAFT_PLAN','The preview plan changed. Reload before confirming.');
  const plan={...saved.plan.payload,assetUseConfirmed:true};const update=await admin.rpc('studio_save_draft_plan',{target_round:saved.round.id,expected_version:saved.plan.version,plan,acting_user:actorId});draftDbError(update.error);
  const result=await admin.rpc('studio_set_guided_run',{target_run:cp.run_id,expected_version:control.version,action:'inputsApproved',change_id:null,agent_role:null,note_text:null,acting_user:actorId});guidedDbError(result.error);await startLocalWorkflow();return json({message:'Source review recorded. Local preview checks will start automatically.'});
 }
 if(input.action==='pause'||input.action==='resume'){
  const rounds=checked(await admin.from('studio_workflow_rounds').select('id,blocker').eq('run_id',cp.run_id).eq('tenant_id',tenant).eq('status','active'))??[];
  for(const round of rounds)if(input.action==='pause'&&!round.blocker||input.action==='resume'&&round.blocker==='paused_by_user')guidedDbError((await admin.rpc('studio_control_workflow',{target_round:round.id,action:input.action,target_job:null,acting_user:actorId})).error);
 }
 if(input.action==='change'){
  const result=await appendGuidedFeedback(async()=>{const latest=checked(await admin.from('studio_campaign_run_controls').select('version').eq('run_id',cp.run_id).eq('tenant_id',tenant).single());if(!latest)throw new ApiError(409,'GUIDED_RUN_REQUIRED','Start the run before sending feedback.');return latest.version;},async version=>await admin.rpc('studio_set_guided_run',{target_run:cp.run_id,expected_version:version,action:'change',change_id:input.requestId,agent_role:input.role,note_text:input.note,acting_user:actorId}));guidedDbError(result.error);
  let processing=true;try{await startLocalWorkflow();}catch{processing=false;}
  return json({message:processing?'Feedback saved. Your revision is queued for the agent.':'Feedback saved. Local processing could not start; use Continue work to resume.',requestId:input.requestId,processing},202);
 }
 const result=await admin.rpc('studio_set_guided_run',{target_run:cp.run_id,expected_version:input.expectedVersion,action:input.action,change_id:null,agent_role:null,note_text:null,acting_user:actorId});guidedDbError(result.error);
 if(input.action!=='pause')await startLocalWorkflow();return json({message:input.action==='pause'?'Run paused. Submitted work may finish settling.':'Run resumed.'});
});}
