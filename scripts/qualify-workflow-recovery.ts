import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import type {Client} from 'pg';
import {planningRecovery} from '../packages/contracts/agent-output';
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
export async function qualifyWorkflowRecovery(db:Client,actor:string,fixture:{run:string;round:string;job:string;step:string}){
 const {run,round,job,step}=fixture;
 async function rejects(work:()=>Promise<unknown>,pattern:RegExp){await db.query('savepoint output_denied');let error:unknown;try{await work();}catch(e){error=e;}await db.query('rollback to output_denied');assert.ok(error instanceof Error&&pattern.test(error.message),String(error));}
 const raw=JSON.stringify({schemaVersion:'1.0',role:'Research and evidence analyst',status:'draft',summary:'Source-backed results',deliverable:{evidenceLedger:[{claim:'Audio only',status:'provided',source:'Exact submitted brief'}]},inputRefs:[],assumptions:[],blockingQuestions:[],warnings:[],handoff:{nextRole:'strategy',requiredInputs:[],checks:[]}}),normalized=planningRecovery(raw,'research',{entries:[]}).text;
 await db.query("update public.studio_agent_steps set output=$2,error_code='INVALID_OUTPUT_SCHEMA',usage='{\"_studio\":{\"finishReason\":\"stop\"}}' where id=$1",[step,raw]);
 await db.query("update public.studio_workflow_jobs set state='failed',blocker='INVALID_OUTPUT_SCHEMA' where id=$1",[job]);
 await db.query("update public.studio_workflow_rounds set blocker='failed' where id=$1",[round]);await db.query("update public.studio_campaign_run_controls set stage='planning',status='blocked',blocker='INVALID_OUTPUT_SCHEMA' where run_id=$1",[run]);
 const current=(await db.query('select * from public.studio_workflow_jobs where id=$1',[job])).rows[0],ledger=(await db.query('select charged_micro_usd,reserved_micro_usd,config_snapshot from public.studio_runs where id=$1',[run])).rows[0],count=(await db.query('select count(*)::int n from public.studio_agent_steps where run_id=$1',[run])).rows[0].n;
 const recover=async(text=normalized,user=actor,input:string|null=current.input_hash,sha:string|null=hash(raw))=>(await db.query('select public.studio_recover_saved_workflow_output($1,$2,$3,$4,$5,$6,$7) id',[job,step,input,current.config_hash,sha,text,user])).rows[0].id;
 await rejects(()=>recover(normalized,randomUUID()),/FORBIDDEN/);await rejects(()=>recover(normalized,actor,'foreign'),/STALE_SAVED_RESULT/);await rejects(()=>recover(normalized,actor,current.input_hash,'f'.repeat(64)),/UNRECOVERABLE_OUTPUT/);
 await rejects(()=>recover(normalized,actor,null),/STALE_SAVED_RESULT/);await rejects(()=>recover(normalized,actor,current.input_hash,null),/UNRECOVERABLE_OUTPUT/);
 await rejects(()=>recover(normalized.replace('Audio only','Invented video export')),/UNRECOVERABLE_OUTPUT/);
 await db.query('savepoint stale_round');await db.query("update public.studio_workflow_rounds set status='cancelled' where id=$1",[round]);await rejects(()=>recover(),/STALE_SAVED_RESULT/);await db.query('rollback to stale_round');
 const id=await recover();assert.ok(id);assert.equal(await recover(),id);
 const result=(await db.query('select state,output,output_hash from public.studio_workflow_jobs where id=$1',[job])).rows[0];assert.equal(result.state,'succeeded');assert.equal(result.output,normalized);assert.equal(result.output_hash,hash(normalized));
 const source=(await db.query('select status,output,error_code from public.studio_agent_steps where id=$1',[step])).rows[0];assert.equal(source.status,'failed');assert.equal(source.output,raw);assert.equal(source.error_code,'INVALID_OUTPUT_SCHEMA');assert.deepEqual((await db.query('select charged_micro_usd,reserved_micro_usd,config_snapshot from public.studio_runs where id=$1',[run])).rows[0],ledger);assert.equal((await db.query('select count(*)::int n from public.studio_agent_steps where run_id=$1',[run])).rows[0].n,count);
 assert.equal((await db.query('select status from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0].status,'paused');assert.equal((await db.query('select blocker from public.studio_workflow_rounds where id=$1',[round])).rows[0].blocker,'paused_by_user');
 await rejects(()=>recover(normalized.replace('Audio only','Altered content')),/REQUEST_CONFLICT/);await rejects(()=>db.query('update public.studio_workflow_output_recoveries set normalized_output=$2 where id=$1',[id,'{}']),/IMMUTABLE|immutable/);
 const acl=(await db.query("select has_function_privilege('authenticated','public.studio_recover_saved_workflow_output(uuid,uuid,text,text,text,text,uuid)','EXECUTE') client,has_table_privilege('service_role','public.studio_workflow_output_recoveries','INSERT') direct")).rows[0];assert.equal(acl.client,false);assert.equal(acl.direct,false);
 console.log('PASS: 018 exact metadata-only recovery, full input/round/hash fencing, no content edits, immutable original receipts and recovery audit, unchanged ledger/request count, idempotency, paused next step and service-only writes. Rolled back.');
}
