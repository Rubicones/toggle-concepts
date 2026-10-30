import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
import {emptyDraftPlan} from '../packages/contracts/drafts';
/**
 * Migration 023: one explicit Retry / Continue-anyway path for a stopped preview.
 * Reproduces the live failure: a provider 502 leaves its full allowance counted,
 * the next attempt is rejected by the creative-code cap, and the run is stuck.
 * Called only inside verify-brand-fields-data's loopback transaction and rollback.
 */
export async function qualifyPreviewContinue(db:Client,tenant:string,actor:string,fixture:{run:string;round:string}){
 const {run,round}=fixture,R=400000;
 async function rejects(work:()=>Promise<unknown>,pattern:RegExp){await db.query('savepoint continue_denied');let error:unknown;try{await work();}catch(e){error=e;}await db.query('rollback to continue_denied');assert.ok(error instanceof Error&&pattern.test(error.message),String(error));}
 const one=async(sql:string,args:unknown[]=[])=>(await db.query(sql,args)).rows[0];
 const r=await one('select * from public.studio_runs where id=$1',[run]),cp=await one('select * from public.studio_c1_checkpoints where run_id=$1',[run]),campaign=r.campaign_id;
 const d=await one('select * from public.studio_workflow_rounds where id=$1',[round]);
 let a1=(await one("select id from public.studio_a1_reviews where run_id=$1 and round_no=$2 and decision='accepted'",[run,d.round_no]))?.id;
 if(!a1){const revision=randomUUID(),payload=JSON.stringify({id:revision,originC1Id:cp.id}),review=randomUUID(),approval=JSON.stringify({id:review,stage:'A1',decision:'accepted'});
  await db.query("insert into public.studio_brand_revisions(id,tenant_id,campaign_id,run_id,origin_c1_id,revision_no,round_no,source_draft_version,request_id,payload,canonical_text,sha256,created_by) values($1,$2,$3,$4,$5,(select coalesce(max(revision_no),0)+1 from public.studio_brand_revisions where campaign_id=$3),$6,1,$7,$8::text::jsonb,$8::text,encode(extensions.digest($8::text,'sha256'),'hex'),$9)",[revision,tenant,campaign,run,cp.id,d.round_no,randomUUID(),payload,actor]);
  await db.query("insert into public.studio_a1_reviews(id,tenant_id,campaign_id,run_id,brand_revision_id,round_no,request_id,decision,payload,canonical_text,sha256,created_by) values($1,$2,$3,$4,$5,$6,$7,'accepted',$8::text::jsonb,$8::text,encode(extensions.digest($8::text,'sha256'),'hex'),$9)",[review,tenant,campaign,run,revision,d.round_no,randomUUID(),approval,actor]);a1=review;
 }
 await db.query("update public.studio_workflow_rounds set a1_id=$2,origin_c1_id=$3,status='active',blocker='capability_blocked' where id=$1",[round,a1,cp.id]);
 await db.query("update public.studio_workflow_jobs set state='cancelled' where run_id=$1 and state in ('queued','leased')",[run]);
 for(const key of ['research','strategy','variants','script','localization','asset-plan']){
  const existing=await one('select id from public.studio_workflow_jobs where round_id=$1 and job_key=$2',[round,key]);
  if(existing)await db.query("update public.studio_workflow_jobs set state='succeeded',blocker=null where id=$1",[existing.id]);
  else await db.query("insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch,state) values($1,$2,$3,$4,$5,$5,'text','{}','fixture',$6,1,'succeeded')",[tenant,campaign,run,round,key,d.config_hash]);
 }
 const plan=emptyDraftPlan(randomUUID);await db.query("insert into public.studio_draft_plans(round_id,tenant_id,campaign_id,run_id,version,payload,updated_by) values($1,$2,$3,$4,1,$5,$6) on conflict(round_id) do update set payload=excluded.payload",[round,tenant,campaign,run,plan,actor]);
 const version=(await one('select version from public.studio_draft_plans where round_id=$1',[round])).version;
 await db.query("update public.studio_campaign_run_controls set stage='assembly',status='running',blocker=null,cursor=cursor||jsonb_build_object('assemblyPreparedVersion',$2::int,'assemblyImportedVersion',null) where run_id=$1",[run,version]);
 // The live configuration: a $0.50 cumulative preview allowance and a ~$0.40 conservative request.
 await db.query("insert into public.studio_run_agent_limits values($1,'creative-code',32768,500000) on conflict(run_id,role) do update set cap_micro_usd=500000",[run]);
 await db.query('update public.studio_runs set cap_micro_usd=greatest(cap_micro_usd,charged_micro_usd+reserved_micro_usd+2*$2) where id=$1',[run,R]);
 const agent=(await one("select app_private.effective_run_agent($1,'creative-code') a",[run])).a;
 const snap=(cap:number)=>({instructions:agent.instructions,stepCapMicroUsd:cap,maxOutputTokens:agent.max_output_tokens,budgetScopeId:`budget-step-${run}-creative-code`,campaignContext:{checkpointId:cp.id},stream:true,upstream:[]});
 const request=randomUUID(),{upstream:_,...enqueued}=snap(500000);void _;
 const step=(await one("select * from public.studio_enqueue_text($1,$2,'creative-code',$3,'Fixture preview',$4,$5,$6)",[run,request,agent.model_id,enqueued,R,actor]));
 await db.query("update public.studio_campaign_run_controls set cursor=cursor||jsonb_build_object('assemblyStepId',$2::text,'assemblyRequestId',$3::text) where run_id=$1",[run,step.id,request]);
 const device=randomUUID();await db.query('select public.studio_workflow_device($1,$2,true)',[device,tenant]);
 const claim=async()=>(await one('select public.studio_claim_workflow($1,$2) x',[tenant,device])).x;
 const begin=async(c:{job:{id:string;lease_token:number}},cap:number)=>await one('select * from public.studio_begin_workflow($1,$2,$3,$4,$5)',[c.job.id,c.job.lease_token,device,snap(cap),R]);
 const finish=async(c:{job:{id:string;lease_token:number;input_hash:string;config_hash:string}},outcome:string,cost:number|null,output:string|null,failure:string|null)=>(await one('select public.studio_complete_workflow($1,$2,$3,$4,$5,$6,$7,$8,null,null,$9) ok',[c.job.id,c.job.lease_token,device,c.job.input_hash,c.job.config_hash,outcome,cost,output,failure])).ok;
 const ledger=async()=>await one('select charged_micro_usd,reserved_micro_usd,cap_micro_usd,status,closure_reason from public.studio_runs where id=$1',[run]);
 const limitVersion=async()=>Number((await one('select coalesce(max(version),0) v from public.studio_run_limit_revisions where run_id=$1',[run])).v);
 const agentCap=async()=>Number((await one("select app_private.effective_run_agent($1,'creative-code') a",[run])).a.step_cap_micro_usd);
 const spent=async()=>Number((await one("select coalesce(sum(case when status in ('reserved','running') or cost_micro_usd is null or cost_micro_usd<0 or cost_micro_usd>reserve_micro_usd then reserve_micro_usd else cost_micro_usd end),0) n from public.studio_agent_steps where run_id=$1 and role='creative-code'",[run])).n);
 // 1. Attempt 1: the provider returns 502 with no billing receipt. Its full allowance stays counted.
 const c1=await claim();assert.equal(c1.job.initial_step_id,step.id);await begin(c1,500000);
 assert.equal(await finish(c1,'unknown',null,null,'PROVIDER_502'),true);
 assert.equal((await ledger()).status,'closed');assert.equal(await spent(),R);
 // 2. The old one-click Retry queues attempt 2, which the cumulative cap rejects before submission.
 assert.ok(await one('select public.studio_retry_preview($1,$2,$3,$4) id',[run,step.id,randomUUID(),actor]));
 const c2=await claim();assert.equal(c2.job.attempt_count,2);
 await rejects(()=>begin(c2,500000),/STEP_CAP_REACHED/);
 assert.equal(await finish(c2,'failed',0,null,'STEP_CAP_REACHED'),true);
 const stuck=await one('select state,blocker,attempt_count,active_attempt from public.studio_workflow_jobs where id=$1',[c1.job.id]);assert.equal(stuck.state,'failed');assert.equal(stuck.blocker,'STEP_CAP_REACHED');
 await db.query("update public.studio_campaign_run_controls set status='blocked',blocker='STEP_CAP_REACHED' where run_id=$1",[run]);
 // The old Retry deduplicates to its first authorization and leaves the job stopped: the live dead end.
 await db.query('select public.studio_retry_preview($1,$2,$3,$4) id',[run,step.id,randomUUID(),actor]);assert.equal((await one('select state from public.studio_workflow_jobs where id=$1',[c1.job.id])).state,'failed');
 // 3. Continue anyway: exactly enough cumulative room for one quoted request.
 const before=await ledger(),v0=await limitVersion(),need=await spent()+R,key=randomUUID(),quote='a'.repeat(64);
 const go=async(o:{id?:string;attempt?:string;user?:string;version?:number;run?:number;agent?:number;q?:string}={})=>(await one('select public.studio_continue_preview($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id',[run,c1.job.id,o.attempt??stuck.active_attempt,o.id??key,o.q??quote,o.version??v0,R,o.run??Number(before.cap_micro_usd),o.agent??need,o.user??actor])).id;
 await rejects(()=>go({user:randomUUID()}),/FORBIDDEN/);
 await rejects(()=>go({agent:need-1}),/INVALID_RUN_LIMITS/);
 await rejects(()=>go({run:Number(before.charged_micro_usd)+Number(before.reserved_micro_usd)+R-1}),/INVALID_RUN_LIMITS/);
 await rejects(()=>go({version:v0+1}),/STALE_RUN_LIMITS/);
 await rejects(()=>go({attempt:c1.attempt.id}),/STALE_PREVIEW_RETRY/);
 await db.query('savepoint review_guard');await db.query("update public.studio_campaign_run_controls set status='review' where run_id=$1",[run]);await rejects(()=>go(),/RETRY_BLOCKED/);await db.query('rollback to review_guard');
 assert.equal(await go(),key);assert.equal(await go(),key);assert.equal(await go({id:randomUUID()}),key);
 await rejects(()=>go({q:'b'.repeat(64)}),/REQUEST_CONFLICT/);
 const raised=await ledger();assert.equal(raised.charged_micro_usd,before.charged_micro_usd);assert.equal(raised.reserved_micro_usd,before.reserved_micro_usd);assert.equal(raised.status,'active');
 assert.equal(await agentCap(),need);assert.equal(await limitVersion(),v0+1);
 const revision=await one('select * from public.studio_run_limit_revisions where id=$1',[key]);assert.equal(revision.continue_run,true);assert.equal(revision.retry_job_id,c1.job.id);
 const queued=await one('select state,attempt_allowance from public.studio_workflow_jobs where id=$1',[c1.job.id]);assert.equal(queued.state,'queued');assert.equal(queued.attempt_allowance,3);
 assert.equal((await one('select status from public.studio_campaign_run_controls where run_id=$1',[run])).status,'running');
 // 4. Attempt 3 is admitted under the raised allowance, then the provider fails again without a receipt.
 const c3=await claim();assert.equal(c3.job.attempt_count,3);const s3=await begin(c3,need);assert.equal(Number(s3.reserve_micro_usd),R);
 assert.equal(await finish(c3,'unknown',null,null,'PROVIDER_502'),true);
 // 5. A fourth paid attempt needs one more explicit authorization; automatic retries stop at three.
 assert.equal(await claim(),null);
 const v1=await limitVersion(),need2=await spent()+R,key2=randomUUID(),run2=Number((await ledger()).charged_micro_usd)+Number((await ledger()).reserved_micro_usd)+R;
 const capBefore=Number((await ledger()).cap_micro_usd);
 assert.equal((await one('select public.studio_continue_preview($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id',[run,c1.job.id,c3.attempt.id,key2,quote,v1,R,Math.max(capBefore,run2),need2,actor])).id,key2);
 const unverified=await one('select status,cost_micro_usd,error_code from public.studio_agent_steps where id=$1',[s3.id]);assert.equal(unverified.status,'failed');assert.equal(unverified.cost_micro_usd,null);assert.equal(unverified.error_code,'RETRY_AUTHORIZED_UNVERIFIED');
 assert.equal((await one('select attempt_allowance from public.studio_workflow_jobs where id=$1',[c1.job.id])).attempt_allowance,4);
 const c4=await claim();assert.equal(c4.job.attempt_count,4);await begin(c4,need2);
 const during=await ledger();
 // The abandoned attempt's late answer is evidence only: no activation, no second settlement.
 assert.equal(await finish(c3,'succeeded',90000,'{"late":true}',null),false);assert.deepEqual(await ledger(),during);
 assert.equal(await finish(c4,'succeeded',120000,'{"deliverable":{}}',null),true);
 const done=await ledger();assert.equal(Number(done.charged_micro_usd),Number(during.charged_micro_usd)+120000);assert.equal(Number(done.reserved_micro_usd),Number(during.reserved_micro_usd)-R);
 assert.equal((await one('select state from public.studio_workflow_jobs where id=$1',[c1.job.id])).state,'succeeded');
 await rejects(()=>db.query('update public.studio_preview_budget_continuations set reservation_micro_usd=1 where id=$1',[key]),/IMMUTABLE|immutable/);
 const acl=await one("select has_function_privilege('authenticated','public.studio_continue_preview(uuid,uuid,uuid,uuid,text,integer,bigint,bigint,bigint,uuid)','EXECUTE') client,has_table_privilege('service_role','public.studio_preview_budget_continuations','INSERT') direct,public.studio_preview_continue_version() v");
 assert.equal(acl.client,false);assert.equal(acl.direct,false);assert.equal(acl.v,23);
 console.log('PASS: 023 reproduces 502 hold + cap-stopped retry; one explicit Retry/Continue path raises only the shown run/agent allowances with an audited revision; unconfirmed charges stay counted; actor/version/limit/source/review fences; click/tab dedup; a fourth paid attempt only after explicit authorization; late result isolation. Rollback-only fixtures.');
}
