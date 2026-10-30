import 'server-only';
import {ApiError} from './api';
import {studioContext,checked,campaignRecord} from './studio';
import {schemaMissing} from './brief';
import {readGenerationReceipt,bindGenerationReceipt} from '@/packages/agents/receipts';
export function receiptError(error:{message:string;code?:string}|null){
 if(!error)return;if(schemaMissing(error))throw new ApiError(503,'M09_SCHEMA_REQUIRED','Enable provider receipt reconciliation with the M09 migration in Settings.');
 const messages:Record<string,string>={INVALID_PROVIDER_RECEIPT:'Provider metadata is incomplete or has an unsupported cost. The conservative charge is retained.',RECEIPT_ID_MISMATCH:'The provider receipt does not match the saved model/generation.',RECEIPT_LINK_UNPROVEN:'This generation cannot be linked to this saved request. The charge is retained. Legacy requests without a recorded generation ID cannot be matched by guesswork.',RECEIPT_TIME_MISMATCH:'The generation timestamp does not match this request.',RECEIPT_ALREADY_BOUND:'This generation is already bound to another request.',RECEIPT_CONFLICT:'A different immutable receipt already exists for this step.',RECONCILIATION_NOT_REQUIRED:'Only an uncertain request needs receipt reconciliation.',RUN_REOPEN_BLOCKED:'This run cannot be reopened through receipt recovery.',UNRESOLVED_PROVIDER_COST:'Reconcile every uncertain request and wait for in-flight work before reopening.',RUN_CAP_REACHED:'This run has no remaining budget. Its cap and prior spending are unchanged.',REQUEST_CONFLICT:'This request ID belongs to different work.',FORBIDDEN:'This studio actor cannot reconcile this run.',RECEIPT_NOT_FOUND:'The provider has no receipt at this ID yet. A missing receipt does not prove zero cost.',RECEIPT_NOT_FINAL:'The provider has not reported a final finish reason. Wait and check again.',BYOK_RECONCILIATION_UNSUPPORTED:'BYOK costs are not supported by this reconciliation adapter. The charge remains unchanged.',RECEIPT_RATE_LIMITED:'The provider receipt lookup was rate limited. Wait before checking again.',RECEIPT_LOOKUP_UNAVAILABLE:'Provider receipt lookup is unavailable. No charges were changed.'};
 const code=Object.keys(messages).find(k=>error.message.includes(k));if(code)throw new ApiError(409,code,messages[code]);throw new Error(error.message);
}
export async function receiptContext(){const base=await studioContext();receiptError((await base.admin.from('studio_provider_reconciliations').select('id').limit(0)).error);return base;}
export async function receiptForStep(stepId:string,requestedId?:string){
 const base=await receiptContext(),{admin,tenant}=base;
 const step=checked(await admin.from('studio_agent_steps').select('id,campaign_id,run_id,model_id,status,provider_id,created_at,reserve_micro_usd').eq('tenant_id',tenant).eq('id',stepId).maybeSingle());if(!step)throw new ApiError(404,'STEP_NOT_FOUND','Agent request not found.');await campaignRecord(step.campaign_id);
 const late=checked(await admin.from('studio_workflow_attempts').select('late_receipt').eq('step_id',step.id).maybeSingle());
 const lateId=typeof late?.late_receipt?.providerId==='string'?late.late_receipt.providerId:null,known=step.provider_id??lateId;
 const id=known??requestedId;if(!id)throw new ApiError(409,'PROVIDER_ID_REQUIRED','No generation ID was saved. Supply an ID from your provider activity; it must carry this request’s exact tag. Legacy untagged requests remain unresolved.');
 if(known&&requestedId&&known!==requestedId)throw new ApiError(409,'RECEIPT_ID_MISMATCH','Use the generation ID already saved for this step.');
 try{const receipt=bindGenerationReceipt(await readGenerationReceipt(id),step,lateId);return {...base,step,receipt};}catch(e){receiptError({message:e instanceof Error?e.message:'RECEIPT_LOOKUP_UNAVAILABLE'});throw e;}
}
