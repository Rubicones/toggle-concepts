import {unsubmittedDirectorClaim} from '@/lib/server/director-claim-recovery';
import {z} from 'zod';
import {api,body,json,ApiError} from '@/lib/server/api';
import {studioContext,campaignRecord,checked} from '@/lib/server/studio';
import {receiptContext,receiptForStep,receiptError} from '@/lib/server/provider-receipts';
import {receiptCommandSchema,generationIdSchema} from '@/packages/contracts/provider-receipt';
import {canonicalJson} from '@/packages/contracts/common';
export async function GET(request:Request){return api(async()=>{
 const params=new URL(request.url).searchParams,step=params.get('step'),run=params.get('run');if(run)z.uuid().parse(run);
 if(step){const saved=await receiptForStep(z.uuid().parse(step),params.has('generation')?generationIdSchema.parse(params.get('generation')):undefined);return json({receipt:saved.receipt,applies:saved.step.status==='unknown',reservationMicroUsd:saved.step.reserve_micro_usd});}
 const {admin,tenant}=await studioContext(),schema=await admin.from('studio_provider_reconciliations').select('id').limit(0);if(schema.error){if(schema.error.code==='PGRST205'||schema.error.code==='42P01')return json({schemaReady:false,steps:[],runs:[],reconciliations:[]});receiptError(schema.error);}
 const stepQuery=admin.from('studio_agent_steps').select('id,campaign_id,run_id,role,model_id,status,provider_id,cost_micro_usd,reserve_micro_usd,error_code,created_at').eq('tenant_id',tenant).or('status.eq.unknown,and(status.eq.running,config_snapshot->>directorBlockId.not.is.null)');if(run)stepQuery.eq('run_id',run);const steps=checked(await stepQuery.order('created_at',{ascending:false}).limit(200));
 const runQuery=admin.from('studio_runs').select('id,campaign_id,name,status,closure_reason,charged_micro_usd,reserved_micro_usd,cap_micro_usd').eq('tenant_id',tenant).eq('status','closed');if(run)runQuery.eq('id',run);const runs=checked(await runQuery.order('created_at',{ascending:false}).limit(200));
 const historyQuery=admin.from('studio_provider_reconciliations').select('id,step_id,run_id,provider_id,actual_cost_micro_usd,previous_charge_micro_usd,outcome,created_at').eq('tenant_id',tenant);if(run)historyQuery.eq('run_id',run);const reconciliations=checked(await historyQuery.order('created_at',{ascending:false}).limit(300));const proofSteps=await Promise.all((steps??[]).map(async s=>{const proof=s.status==='unknown'&&s.error_code==='PROCESS_INTERRUPTED'&&!s.provider_id?await unsubmittedDirectorClaim(s.id):null;if(!proof)return s;const version=await admin.rpc('studio_unsubmitted_claim_recovery_version');return {...s,unsubmittedRecovery:{ready:!version.error&&version.data==='claim@1'}};}));return json({schemaReady:true,steps:run?proofSteps.filter(s=>s.run_id===run):proofSteps,runs:run?runs?.filter(r=>r.id===run):runs,reconciliations:run?reconciliations?.filter(r=>r.run_id===run):reconciliations});
});}
export async function POST(request:Request){return api(async()=>{
 const input=await body(request,receiptCommandSchema);
 if(input.action==='reopen'){const {admin,tenant,actorId}=await receiptContext(),run=checked(await admin.from('studio_runs').select('id').eq('tenant_id',tenant).eq('id',input.runId).maybeSingle());if(!run)throw new ApiError(404,'RUN_NOT_FOUND','Run not found.');
  const result=await admin.rpc('studio_reopen_reconciled_run',{target_run:run.id,request_key:input.requestId,acting_user:actorId});receiptError(result.error);return json({message:'Run reopened with its original remaining caps. Queued work stays paused; resume or retry explicitly. No provider call was submitted.'});
 }
 if(input.action==='recoverUnsubmitted'){
  const {admin,tenant,actorId}=await receiptContext(),step=checked(await admin.from('studio_agent_steps').select('id,campaign_id,config_snapshot').eq('tenant_id',tenant).eq('id',input.stepId).single());if(!step)throw new ApiError(404,'STEP_NOT_FOUND','That request is no longer available.');await campaignRecord(step.campaign_id);
  const proof=await unsubmittedDirectorClaim(step.id);if(!proof)throw new ApiError(409,'UNSUBMITTED_CLAIM_PROOF_REQUIRED','A private pre-submission claim record is required. An absent provider receipt does not prove zero cost.');
  const result=await admin.rpc('studio_recover_unsubmitted_director_claim',{target_step:step.id,request_key:input.requestId,source:{...proof,configSnapshot:step.config_snapshot},acting_user:actorId});receiptError(result.error);return json({message:'The unsubmitted claim was recovered without an AI request. Earlier paid charges and caps are unchanged. Reopen the reconciled run explicitly, then continue within its approved allowance.'});
 }
 // Always fetch fresh provider evidence on commit. Browser-supplied prices/receipts are forbidden.
 const saved=await receiptForStep(input.stepId,input.generationId),result=await saved.admin.rpc('studio_apply_provider_receipt',{target_step:saved.step.id,request_key:input.requestId,source:canonicalJson(saved.receipt),acting_user:saved.actorId});receiptError(result.error);
 return json({reconciliation:result.data,message:result.data.outcome==='overrun'?'The actual provider cost exceeded the reservation. Evidence is saved; the run stays closed and the conservative ledger is unchanged.':'Provider cost reconciled. Historical output was not activated. Reopen the run explicitly after every uncertain charge is resolved.'});
});}
