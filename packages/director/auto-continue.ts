// Local preview builds without repeated budget approvals: continue a draft direction that stopped on a role's
// allowance, through the same priced extension the AD would approve. Used by the runner right after the stop and by the
// app when the policy is switched on for a run that is already waiting. Server-side only.
import type {SupabaseClient} from '@supabase/supabase-js';
import {resumeBudgetClock} from './money';
import {skipsBudgetReapproval,continuableRole,autoContinuationKey,autoContinuationTimes} from './budget-policy';
import type {ADQuestion} from './state';

export type AutoContinued={continued:true;role:string;costMicroUsd:number}|{continued:false;reason:string};

/** Reads the stop, the run's frozen execution and its policy; continues once, or says why it did not. */
export async function continueWithoutReapproval(admin:SupabaseClient,args:{blockId:string;directionId:string;device:string}):Promise<AutoContinued>{
 const work=await admin.from('studio_director_work').select('status,question,state').eq('block_id',args.blockId).eq('direction_id',args.directionId).maybeSingle();
 const question=work.data?.question as ADQuestion|null|undefined,role=continuableRole(question);
 if(work.error||work.data?.status!=='review'||!question||!role)return {continued:false,reason:'NOT_AN_ALLOWANCE_STOP'};
 const block=await admin.from('studio_director_blocks').select('run_id,snapshot').eq('id',args.blockId).maybeSingle();if(block.error||!block.data)return {continued:false,reason:'BLOCK_NOT_FOUND'};
 const [execution,policy]=await Promise.all([
  admin.from('studio_text_executions').select('mode,device_id').eq('scope_kind','run').eq('scope_id',block.data.run_id).maybeSingle(),
  admin.from('studio_run_budget_policy').select('policy').eq('run_id',block.data.run_id).maybeSingle(),
 ]);
 // A database without the policy migration reads as 'ask'.
 const snapshot=block.data.snapshot as {inputs?:{directionId:string;stage?:string}[];estimates?:Record<string,{roles?:Record<string,{maxCostMicroUsd?:number}|undefined>}>};
 const stage=snapshot.inputs?.find(i=>i.directionId===args.directionId)?.stage??null;
 if(!skipsBudgetReapproval({mode:execution.data?.mode,executionDevice:execution.data?.device_id,device:args.device,policy:policy.error?null:policy.data?.policy,stage}))return {continued:false,reason:'BUDGET_REAPPROVAL_REQUIRED'};
 const roleMax=snapshot.estimates?.[args.directionId]?.roles?.[role]?.maxCostMicroUsd;if(!roleMax)return {continued:false,reason:'DIRECTOR_ALLOWANCE_REQUIRED'};
 const params={target:args.blockId,direction:args.directionId,question_id:question.id,role_key:role,request_key:autoContinuationKey(question.id,role,roleMax),device:args.device,resume_state:{...resumeBudgetClock((work.data.state??{}) as Parameters<typeof resumeBudgetClock>[0]),wrapUp:false}};
 // The coder's base allowance is smaller than one of its answers: add it several times, so it is not stopped after
 // every answer (migration 20261112000300). Only the tokens actually used are counted.
 let r=await admin.rpc('studio_auto_extend_director',{...params,times:autoContinuationTimes(role)});
 if(r.error&&['PGRST202','42883'].includes(r.error.code??''))r=await admin.rpc('studio_auto_extend_director',params);
 if(r.error)return {continued:false,reason:r.error.message.slice(0,200)};
 return {continued:true,role,costMicroUsd:Number(r.data)};
}
