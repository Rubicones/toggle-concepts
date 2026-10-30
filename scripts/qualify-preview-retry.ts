import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
import {emptyDraftPlan} from '../packages/contracts/drafts';
/** Called only inside verify-brand-fields-data's loopback transaction and unconditional rollback. */
export async function qualifyPreviewRetry(db:Client,tenant:string,actor:string,fixture:{run:string;round:string}){
 const {run,round}=fixture;
 async function rejects(work:()=>Promise<unknown>,pattern:RegExp){await db.query('savepoint retry_denied');let error:unknown;try{await work();}catch(e){error=e;}await db.query('rollback to retry_denied');assert.ok(error instanceof Error&&pattern.test(error.message),String(error));}
 const r=(await db.query('select * from public.studio_runs where id=$1',[run])).rows[0],cp=(await db.query('select * from public.studio_c1_checkpoints where run_id=$1',[run])).rows[0],campaign=r.campaign_id;
 const d=(await db.query('select * from public.studio_workflow_rounds where id=$1',[round])).rows[0];
 let a1=(await db.query("select id from public.studio_a1_reviews where run_id=$1 and round_no=$2 and decision='accepted'",[run,d.round_no])).rows[0]?.id;
 if(!a1){const revision=randomUUID(),payload=JSON.stringify({id:revision,originC1Id:cp.id}),review=randomUUID(),approval=JSON.stringify({id:review,stage:'A1',decision:'accepted'});
  await db.query("insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,round_no,source_draft_version,request_id,payload,canonical_text,sha256,created_by) values($1,$2,$3,$4,$5,(select coalesce(max(revision_no),0)+1 from public.studio_brand_revisions where campaign_id=$3),$6,1,$7,$8::text::jsonb,$8::text,encode(extensions.digest($8::text,'sha256'),'hex'),$9)",[revision,tenant,campaign,run,cp.id,d.round_no,randomUUID(),payload,actor]);
  await db.query("insert into public.studio_a1_reviews(id,tenant_id,campaign_id,run_id,brand_revision_id,round_no,request_id,decision,payload,canonical_text,sha256,created_by) values($1,$2,$3,$4,$5,$6,$7,'accepted',$8::text::jsonb,$8::text,encode(extensions.digest($8::text,'sha256'),'hex'),$9)",[review,tenant,campaign,run,revision,d.round_no,randomUUID(),approval,actor]);a1=review;
 }
 await db.query("update public.studio_workflow_rounds set a1_id=$2,origin_c1_id=$3,status='active',blocker='capability_blocked' where id=$1",[round,a1,cp.id]);
 await db.query("update public.studio_workflow_jobs set state='cancelled' where run_id=$1 and state in ('queued','leased')",[run]);
 for(const key of ['research','strategy','variants','script','localization','asset-plan']){
  const existing=(await db.query('select id from public.studio_workflow_jobs where round_id=$1 and job_key=$2',[round,key])).rows[0];
  if(existing)await db.query("update public.studio_workflow_jobs set state='succeeded',blocker=null where id=$1",[existing.id]);
  else await db.query("insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state) values($1,$2,$3,$4,$5,$5,'text','{}','fixture',$6,1,'succeeded')",[tenant,campaign,run,round,key,d.config_hash]);
 }
 const plan=emptyDraftPlan(randomUUID);await db.query("insert into public.studio_draft_plans(round_id,tenant_id,campaign_id,run_id,version,payload,updated_by) values($1,$2,$3,$4,1,$5,$6) on conflict(round_id) do update set payload=excluded.payload",[round,tenant,campaign,run,plan,actor]);
 const version=(await db.query('select version from public.studio_draft_plans where round_id=$1',[round])).rows[0].version;
 await db.query("update public.studio_campaign_run_controls set stage='assembly',status='running',blocker=null,cursor=cursor||jsonb_build_object('assemblyPreparedVersion',$2::int,'assemblyImportedVersion',null) where run_id=$1",[run,version]);
 const agent=(await db.query("select app_private.effective_run_agent($1,'creative-code') a",[run])).rows[0].a;
 const snapshot={instructions:agent.instructions,stepCapMicroUsd:agent.step_cap_micro_usd,maxOutputTokens:agent.max_output_tokens,budgetScopeId:`budget-step-${run}-creative-code`,campaignContext:{checkpointId:cp.id},stream:true},request=randomUUID();
 const step=(await db.query("select * from public.studio_enqueue_text($1,$2,'creative-code',$3,'Fixture preview',$4,1000,$5)",[run,request,agent.model_id,snapshot,actor])).rows[0];
 await db.query("update public.studio_campaign_run_controls set cursor=cursor||jsonb_build_object('assemblyStepId',$2::text,'assemblyRequestId',$3::text) where run_id=$1",[run,step.id,request]);
 const device=randomUUID();await db.query('select public.studio_workflow_device($1,$2,true)',[device,tenant]);
 const claim=(await db.query('select public.studio_claim_workflow($1,$2) x',[tenant,device])).rows[0].x;assert.equal(claim.job.initial_step_id,step.id);
 await db.query('select public.studio_begin_workflow($1,$2,$3,$4,1000)',[claim.job.id,claim.job.lease_token,device,{...snapshot,upstream:[]}]);
 const finish=async(token:number,input:string,config:string,outcome:string,cost:number|null,output:string|null)=>(await db.query('select public.studio_complete_workflow($1,$2,$3,$4,$5,$6,$7,$8,null,null,$9) ok',[claim.job.id,token,device,input,config,outcome,cost,output,outcome==='unknown'?'SUBMISSION_OUTCOME_UNKNOWN':null])).rows[0].ok;
 await finish(claim.job.lease_token,claim.job.input_hash,claim.job.config_hash,'unknown',null,null);
 const before=(await db.query('select charged_micro_usd,reserved_micro_usd,cap_micro_usd,config_snapshot from public.studio_runs where id=$1',[run])).rows[0],key=randomUUID();
 const retry=async(id=key,source=step.id,user=actor)=>(await db.query('select public.studio_retry_preview($1,$2,$3,$4) id',[run,source,id,user])).rows[0].id;
 await rejects(()=>retry(key,step.id,randomUUID()),/FORBIDDEN/);await rejects(()=>retry(key,randomUUID()),/STALE_PREVIEW_RETRY/);
 await db.query('savepoint review_guard');await db.query("update public.studio_campaign_run_controls set status='review' where run_id=$1",[run]);await rejects(()=>retry(),/RETRY_BLOCKED/);await db.query('rollback to review_guard');
 await db.query('savepoint stale_plan');await db.query('update public.studio_draft_plans set version=version+1 where round_id=$1',[round]);await rejects(()=>retry(),/STALE_PREVIEW_RETRY/);await db.query('rollback to stale_plan');
 await db.query('savepoint cap_guard');await db.query('update public.studio_runs set cap_micro_usd=charged_micro_usd where id=$1',[run]);await rejects(()=>retry(),/RUN_CAP_REACHED/);await db.query('rollback to cap_guard');
 await db.query('savepoint attempts_guard');await db.query('update public.studio_workflow_jobs set attempt_count=3 where id=$1',[claim.job.id]);await rejects(()=>retry(),/RETRY_BLOCKED/);await db.query('rollback to attempts_guard');
 await db.query('savepoint role_cap');await db.query("insert into public.studio_run_agent_limits values($1,'creative-code',32768,1000) on conflict(run_id,role) do update set cap_micro_usd=1000",[run]);await rejects(()=>retry(),/STEP_CAP_REACHED/);await db.query('rollback to role_cap');
 assert.equal(await retry(),key);assert.equal(await retry(),key);assert.equal(await retry(randomUUID()),key);
 assert.deepEqual((await db.query('select charged_micro_usd,reserved_micro_usd,cap_micro_usd,config_snapshot from public.studio_runs where id=$1',[run])).rows[0],before);
 const old=(await db.query('select status,cost_micro_usd,error_code from public.studio_agent_steps where id=$1',[step.id])).rows[0];assert.equal(old.status,'failed');assert.equal(old.cost_micro_usd,null);assert.equal(old.error_code,'RETRY_AUTHORIZED_UNVERIFIED');
 const audit=(await db.query('select * from public.studio_preview_retry_authorizations where step_id=$1',[step.id])).rows[0];assert.equal(audit.previous_step.status,'unknown');assert.equal(audit.held_micro_usd,'1000');
 await rejects(()=>db.query('update public.studio_preview_retry_authorizations set held_micro_usd=0 where id=$1',[key]),/IMMUTABLE|immutable/);await rejects(()=>retry(key,randomUUID()),/REQUEST_CONFLICT/);
 const next=(await db.query('select public.studio_claim_workflow($1,$2) x',[tenant,device])).rows[0].x;assert.equal(next.job.id,claim.job.id);assert.equal(next.job.attempt_count,2);
 const admitted=(await db.query('select * from public.studio_begin_workflow($1,$2,$3,$4,1000)',[next.job.id,next.job.lease_token,device,{...snapshot,upstream:[]}])).rows[0];assert.notEqual(admitted.id,step.id);assert.equal(admitted.config_snapshot.instructions,agent.instructions);
 const during=(await db.query('select charged_micro_usd,reserved_micro_usd from public.studio_runs where id=$1',[run])).rows[0];
 assert.equal(await finish(claim.job.lease_token,claim.job.input_hash,claim.job.config_hash,'succeeded',100,'Late old result'),false);
 assert.deepEqual((await db.query('select charged_micro_usd,reserved_micro_usd from public.studio_runs where id=$1',[run])).rows[0],during);assert.equal((await db.query('select state from public.studio_workflow_jobs where id=$1',[claim.job.id])).rows[0].state,'leased');
 assert.equal((await db.query('select late_receipt from public.studio_workflow_attempts where id=$1',[claim.attempt.id])).rows[0].late_receipt.output,'Late old result');
 assert.equal(await finish(next.job.lease_token,next.job.input_hash,next.job.config_hash,'succeeded',50,'New result'),true);
 const after=(await db.query('select charged_micro_usd,reserved_micro_usd from public.studio_runs where id=$1',[run])).rows[0];assert.equal(Number(after.charged_micro_usd),Number(before.charged_micro_usd)+50);assert.equal(after.reserved_micro_usd,'0');
 const acl=(await db.query("select has_function_privilege('authenticated','public.studio_retry_preview(uuid,uuid,uuid,uuid)','EXECUTE') client,has_table_privilege('service_role','public.studio_preview_retry_authorizations','INSERT') direct")).rows[0];assert.equal(acl.client,false);assert.equal(acl.direct,false);
 const qualified={run,round,sourceStep:admitted.id,job:claim.job.id};
 console.log('PASS: 019 explicit one-click retry, immutable uncertain-cost audit, full prior charge/role spend retained, duplicate click/tab dedup, actor/stage/source/version/attempt/run+role budget fences, real new queue admission and late-result isolation. Rollback-only fixtures.');
 return qualified;
}
