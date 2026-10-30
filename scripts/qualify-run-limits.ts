import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import type {Client} from 'pg';
export async function qualifyRunLimits(db:Client,tenant:string,actor:string,fixture:{run:string;round:string;replayRound:string}){
 const {run}=fixture,round=fixture.replayRound;
 async function rejects(work:()=>Promise<unknown>,pattern:RegExp){await db.query('savepoint limits_denied');let error:unknown;try{await work();}catch(e){error=e;}await db.query('rollback to limits_denied');assert.ok(error instanceof Error&&pattern.test(error.message),String(error));}
 const original=(await db.query('select * from public.studio_runs where id=$1',[run])).rows[0],cp=(await db.query('select * from public.studio_c1_checkpoints where run_id=$1',[run])).rows[0];
 const a=original.config_snapshot.find((a:{role:string})=>a.role==='research'),changes=[{role:'research',maxOutputTokens:32768,capMicroUsd:1000000}];
 const amend=async(id:string,version:number,cap=5000000,agents:unknown=changes,go=false,job:string|null=null,user=actor)=>(await db.query('select public.studio_amend_run_limits($1,$2,$3,$4,$5,$6,$7,$8) version',[run,id,version,cap,JSON.stringify(agents),go,job,user])).rows[0].version;
 await rejects(()=>amend(randomUUID(),0,5000000,changes,false,null,randomUUID()),/FORBIDDEN/);
 const key=randomUUID();assert.equal(await amend(key,0),1);assert.equal(await amend(key,0),1);await rejects(()=>amend(key,0,6000000),/REQUEST_CONFLICT/);await rejects(()=>amend(randomUUID(),0),/STALE_RUN_LIMITS/);
 assert.equal((await db.query('select app_private.effective_run_agent($1,$2) agent',[run,'research'])).rows[0].agent.max_output_tokens,32768);
 await rejects(()=>amend(randomUUID(),1,4000000),/INVALID_RUN_LIMITS/);await rejects(()=>amend(randomUUID(),1,5000000,[{role:'research',maxOutputTokens:16384,capMicroUsd:1000000}]),/INVALID_RUN_LIMITS/);
 const hash=(await db.query("select encode(extensions.digest(config_snapshot::text,'sha256'),'hex') h from public.studio_runs where id=$1",[run])).rows[0].h;
 await db.query("update public.studio_workflow_rounds set status='cancelled' where run_id=$1 and kind='draft' and id<>$2",[run,round]);
 await db.query("update public.studio_workflow_rounds set status='active',blocker='failed',config_hash=$2 where id=$1",[round,hash]);
 await db.query("insert into public.studio_workflow_jobs(tenant_id,campaign_id,run_id,round_id,job_key,role,kind,payload,input_hash,config_hash,epoch) select tenant_id,campaign_id,run_id,$2,'research','research','text',payload,input_hash,config_hash,1 from public.studio_workflow_jobs where round_id=$1 and job_key='research'",[fixture.round,round]);
 const research=(await db.query("update public.studio_workflow_jobs set state='failed',blocker='OUTPUT_TOKEN_LIMIT',attempt_count=1,config_hash=$2,payload=jsonb_build_object('prompt','Research the supplied evidence.','snapshot',jsonb_build_object('instructions',$3::text,'campaignContext',jsonb_build_object('checkpointId',$4::text),'budgetScopeId','budget-step-'||run_id||'-research')) where round_id=$1 and job_key='research' returning *",[round,hash,a.instructions,cp.id])).rows[0];
 await db.query("update public.studio_campaign_run_controls set stage='planning',status='blocked',blocker='OUTPUT_TOKEN_LIMIT' where run_id=$1",[run]);
 await db.query('select public.studio_stop_guided_run($1,$2)',[run,actor]);assert.equal((await db.query('select status from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0].status,'paused');
 const request={instructions:a.instructions,stepCapMicroUsd:500000,maxOutputTokens:32768,budgetScopeId:`budget-step-${run}-research`,campaignContext:{checkpointId:cp.id}};
 await rejects(()=>db.query('select public.studio_reserve_step($1,$2,$3,$4,$5,$6,100)',[run,randomUUID(),'research',a.model_id,'Research',request]),/RUN_STOPPED/);
 const retryKey=randomUUID();assert.equal(await amend(retryKey,1,5000000,changes,true,research.id),2);assert.equal(await amend(retryKey,1,5000000,changes,true,research.id),2);
 assert.equal((await db.query('select state from public.studio_workflow_jobs where id=$1',[research.id])).rows[0].state,'queued');assert.equal((await db.query('select status from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0].status,'running');
 // Exercise actual claim/admission with the effective tokens/cap and original frozen config hash.
 await db.query("update public.studio_workflow_jobs set state='cancelled' where run_id=$1 and id<>$2 and state='queued'",[run,research.id]);
 const device=randomUUID();await db.query('select public.studio_workflow_device($1,$2,true)',[device,tenant]);const claim=(await db.query('select public.studio_claim_workflow($1,$2) x',[tenant,device])).rows[0].x;assert.equal(claim.job.id,research.id);
 const admitted=(await db.query('select * from public.studio_begin_workflow($1,$2,$3,$4,100)',[research.id,claim.job.lease_token,device,{...request,upstream:[]}])).rows[0];assert.equal(admitted.config_snapshot.maxOutputTokens,32768);assert.equal(admitted.config_snapshot.stepCapMicroUsd,500000);
 const oldAdmitted=structuredClone(admitted.config_snapshot);assert.equal(await amend(randomUUID(),2,6000000,[{...changes[0],capMicroUsd:2000000}]),3);assert.deepEqual((await db.query('select config_snapshot from public.studio_agent_steps where id=$1',[admitted.id])).rows[0].config_snapshot,oldAdmitted);
 await db.query('select public.studio_stop_guided_run($1,$2)',[run,actor]);assert.equal((await db.query('select status from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0].status,'paused');
 // A submitted request still settles, while the stop prevents the next request.
 await db.query("select public.studio_complete_workflow($1,$2,$3,$4,$5,'failed',50,'partial result',null,'{}','OUTPUT_TOKEN_LIMIT')",[research.id,claim.job.lease_token,device,claim.job.input_hash,claim.job.config_hash]);
 assert.equal((await db.query('select status from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0].status,'paused');
 await db.query("update public.studio_workflow_attempts set state='unknown' where job_id=$1 and attempt_no=(select max(attempt_no) from public.studio_workflow_attempts where job_id=$1)",[research.id]);await rejects(()=>amend(randomUUID(),3,6000000,[],true,research.id),/UNRESOLVED_PROVIDER_RECEIPT/);
 // Manual brand retries get a new explicit request ID; old paid receipts stay unchanged.
 await db.query("update public.studio_workflow_attempts set state='failed' where job_id=$1",[research.id]);
 await db.query("update public.studio_campaign_run_controls set stage='brand',status='blocked',blocker='OUTPUT_TOKEN_LIMIT' where run_id=$1",[run]);
 const brand=original.config_snapshot.find((a:{role:string})=>a.role==='brand-kit'),manualSnapshot={instructions:brand.instructions,stepCapMicroUsd:brand.step_cap_micro_usd,maxOutputTokens:brand.max_output_tokens,budgetScopeId:`budget-step-${run}-brand-kit`,campaignContext:{checkpointId:cp.id}};
 const failed=(await db.query('select * from public.studio_reserve_step($1,$2,$3,$4,$5,$6,100)',[run,randomUUID(),'brand-kit',brand.model_id,'Brand',manualSnapshot])).rows[0];
 await db.query("select public.studio_finish_step($1,'failed',30,'partial',null,'{}','OUTPUT_TOKEN_LIMIT')",[failed.id]);
 await db.query("update public.studio_campaign_run_controls set cursor=cursor||jsonb_build_object('brandStepId',$2::text,'brandRequestId',$3::text) where run_id=$1",[run,failed.id,randomUUID()]);
 const oldCursor=(await db.query('select cursor from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0].cursor;
 assert.equal(await amend(randomUUID(),3,6000000,[],true),4);
 const retried=(await db.query('select cursor from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0].cursor;assert.equal(retried.brandStepId,null);assert.notEqual(retried.brandRequestId,oldCursor.brandRequestId);assert.equal(retried.manualLimitRetries,1);
 const waiting=(await db.query('select * from public.studio_reserve_step($1,$2,$3,$4,$5,$6,40)',[run,randomUUID(),'brand-kit',brand.model_id,'Waiting brand',manualSnapshot])).rows[0];
 await db.query("update public.studio_campaign_run_controls set cursor=cursor||jsonb_build_object('brandStepId',$2::text) where run_id=$1",[run,waiting.id]);await db.query('select public.studio_stop_guided_run($1,$2)',[run,actor]);
 const count=(await db.query('select count(*)::int n from public.studio_agent_steps where run_id=$1',[run])).rows[0].n;assert.equal(await amend(randomUUID(),4,6000000,[],true),5);
 assert.equal((await db.query('select cursor from public.studio_campaign_run_controls where run_id=$1',[run])).rows[0].cursor.brandStepId,waiting.id);assert.equal((await db.query('select count(*)::int n from public.studio_agent_steps where run_id=$1',[run])).rows[0].n,count);
 await db.query("select public.studio_finish_step($1,'failed',0,null,null,null,'CANCELLED_BEFORE_SUBMIT')",[waiting.id]);
 await db.query("update public.studio_campaign_run_controls set status='review' where run_id=$1",[run]);await rejects(()=>amend(randomUUID(),5,6000000,[],true),/REVIEW_REQUIRED/);
 const final=(await db.query('select * from public.studio_runs where id=$1',[run])).rows[0];assert.deepEqual(final.config_snapshot,original.config_snapshot);assert.equal(final.charged_micro_usd,'230');assert.equal(final.reserved_micro_usd,'0');assert.equal(final.cap_micro_usd,'6000000');
 const acl=(await db.query("select has_function_privilege('authenticated','public.studio_amend_run_limits(uuid,uuid,integer,bigint,jsonb,boolean,uuid,uuid)','EXECUTE') client,has_table_privilege('service_role','public.studio_run_agent_limits','UPDATE') direct")).rows[0];assert.equal(acl.client,false);assert.equal(acl.direct,false);
 assert.equal(createHash('sha256').update(JSON.stringify(cp.payload)).digest('hex'),createHash('sha256').update(JSON.stringify((await db.query('select payload from public.studio_c1_checkpoints where id=$1',[cp.id])).rows[0].payload)).digest('hex'));
 console.log('PASS: 017 audited/idempotent increases, actor/version fences, no lowering, unchanged C1/models/instructions/history, real 32K admission, top-up during submitted call, stop/settlement, explicit retry and unknown-receipt guard. Rolled back.');
 return {run,round,job:research.id,step:admitted.id};
}
