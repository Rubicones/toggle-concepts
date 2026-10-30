import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
import {emptyDraftPlan} from '../packages/contracts/drafts';
/**
 * Migration 024: a stopped preview whose saved wire protocol is outdated is replaced by a new
 * request with the current protocol. Reproduces the live case: preview-selection-2 answered
 * HTTP 502 five times; Retry resent the identical request. Rollback-only fixtures.
 */
export async function qualifyPreviewReplacement(db:Client,tenant:string,actor:string,fixture:{run:string;round:string}){
 const {run,round}=fixture,R=70000;
 async function rejects(work:()=>Promise<unknown>,pattern:RegExp){await db.query('savepoint replace_denied');let error:unknown;try{await work();}catch(e){error=e;}await db.query('rollback to replace_denied');assert.ok(error instanceof Error&&pattern.test(error.message),String(error));}
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
 await db.query("insert into public.studio_run_agent_limits values($1,'creative-code',32768,1000000) on conflict(run_id,role) do update set cap_micro_usd=1000000",[run]);
 await db.query('update public.studio_runs set cap_micro_usd=greatest(cap_micro_usd,charged_micro_usd+reserved_micro_usd+3*$2) where id=$1',[run,R]);
 const agent=(await one("select app_private.effective_run_agent($1,'creative-code') a",[run])).a;
 const snap=(protocol:string,schema:string,cap:number)=>({instructions:agent.instructions,stepCapMicroUsd:cap,maxOutputTokens:protocol.endsWith('3')?8192:2824,budgetScopeId:`budget-step-${run}-creative-code`,campaignContext:{checkpointId:cp.id},stream:true,previewProtocol:protocol,outputFormat:'json_schema',responseSchema:{name:schema,schema:{type:'object'}},draftPlanVersion:version,draftInputHash:'f'.repeat(64)});
 const request=randomUUID(),v2=snap('preview-selection-2','preview_selection_v2',1000000);
 const step=await one("select * from public.studio_enqueue_text($1,$2,'creative-code',$3,'v2 selection',$4,$5,$6)",[run,request,agent.model_id,v2,R,actor]);
 await db.query("update public.studio_campaign_run_controls set cursor=cursor||jsonb_build_object('assemblyStepId',$2::text,'assemblyRequestId',$3::text) where run_id=$1",[run,step.id,request]);
 const device=randomUUID();await db.query('select public.studio_workflow_device($1,$2,true)',[device,tenant]);
 const claim=async()=>(await one('select public.studio_claim_workflow($1,$2) x',[tenant,device])).x;
 const finish=async(c:{job:{id:string;lease_token:number;input_hash:string;config_hash:string}},outcome:string,cost:number|null,output:string|null,failure:string|null)=>(await one('select public.studio_complete_workflow($1,$2,$3,$4,$5,$6,$7,$8,null,null,$9) ok',[c.job.id,c.job.lease_token,device,c.job.input_hash,c.job.config_hash,outcome,cost,output,failure])).ok;
 // The live failure: the v2 request reaches Google and returns HTTP 502 with no receipt.
 const c1=await claim();await one('select * from public.studio_begin_workflow($1,$2,$3,$4,$5)',[c1.job.id,c1.job.lease_token,device,{...v2,upstream:[]},R]);
 assert.equal(await finish(c1,'unknown',null,null,'PROVIDER_502'),true);
 const ledger=async()=>await one('select charged_micro_usd,reserved_micro_usd,cap_micro_usd,status from public.studio_runs where id=$1',[run]);
 const before=await ledger(),v0=Number((await one('select coalesce(max(version),0) v from public.studio_run_limit_revisions where run_id=$1',[run])).v),key=randomUUID(),quote='c'.repeat(64);
 const agentCap=Number(agent.step_cap_micro_usd)>=1000000?Number(agent.step_cap_micro_usd):1000000;
 const replace=async(o:{id?:string;snapshot?:object;user?:string;version?:number;run?:number;agent?:number}={})=>(await one('select public.studio_replace_preview_request($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) id',[run,c1.job.id,c1.attempt.id,o.id??key,quote,o.version??v0,agent.model_id,'v3 selection',o.snapshot??snap('preview-selection-3','preview_selection_v3',o.agent??agentCap),R,o.run??Number(before.cap_micro_usd),o.agent??agentCap,o.user??actor])).id;
 await rejects(()=>replace({user:randomUUID()}),/FORBIDDEN/);
 await rejects(()=>replace({snapshot:v2}),/STALE_PREVIEW_RETRY/);
 await rejects(()=>replace({snapshot:{...snap('preview-selection-3','preview_selection_v3',agentCap),draftPlanVersion:version+1}}),/STALE_PREVIEW_RETRY/);
 await rejects(()=>replace({snapshot:{...snap('preview-selection-3','preview_selection_v3',agentCap),stepCapMicroUsd:agentCap-1}}),/INVALID_RUN_LIMITS/);
 await rejects(()=>replace({version:v0+1}),/STALE_RUN_LIMITS/);
 const next=await replace();assert.notEqual(next,step.id);assert.equal(await replace(),next);assert.equal(await replace({id:randomUUID()}),next);
 const old=await one('select status,cost_micro_usd,error_code from public.studio_agent_steps where id=$1',[step.id]);assert.equal(old.status,'failed');assert.equal(old.cost_micro_usd,null);assert.equal(old.error_code,'RETRY_AUTHORIZED_UNVERIFIED');
 const after=await ledger();assert.equal(after.status,'active');assert.equal(after.charged_micro_usd,before.charged_micro_usd);assert.equal(Number(after.reserved_micro_usd),Number(before.reserved_micro_usd)+R);
 const fresh=await one('select status,config_snapshot from public.studio_agent_steps where id=$1',[next]);assert.equal(fresh.status,'reserved');assert.equal(fresh.config_snapshot.previewProtocol,'preview-selection-3');
 const g=await one('select status,cursor from public.studio_campaign_run_controls where run_id=$1',[run]);assert.equal(g.status,'running');assert.equal(g.cursor.assemblyStepId,next);assert.equal(g.cursor.assemblyRequestId,key);
 assert.equal((await one('select state from public.studio_workflow_jobs where id=$1',[c1.job.id])).state,'failed');
 // The new request is admitted and settles normally; a late v2 answer cannot activate or bill twice.
 const c2=await claim();assert.equal(c2.job.initial_step_id,next);assert.equal(c2.job.attempt_count,1);
 const admitted=await one('select * from public.studio_begin_workflow($1,$2,$3,$4,$5)',[c2.job.id,c2.job.lease_token,device,{...fresh.config_snapshot,upstream:[]},R]);assert.equal(admitted.id,next);
 const during=await ledger();assert.equal(await finish(c1,'succeeded',30000,'{"late":true}',null),false);assert.deepEqual(await ledger(),during);
 assert.equal(await finish(c2,'succeeded',41000,'{"d0":{}}',null),true);
 const done=await ledger();assert.equal(Number(done.charged_micro_usd),Number(during.charged_micro_usd)+41000);
 await rejects(()=>db.query('update public.studio_preview_request_replacements set reservation_micro_usd=1 where id=$1',[key]),/IMMUTABLE|immutable/);
 const acl=await one("select has_function_privilege('authenticated','public.studio_replace_preview_request(uuid,uuid,uuid,uuid,text,integer,text,text,jsonb,bigint,bigint,bigint,uuid)','EXECUTE') client,public.studio_preview_protocol_version() p,public.studio_preview_continue_version() v");
 assert.equal(acl.client,false);assert.equal(acl.p,'preview-selection-3');assert.equal(acl.v,24);
 console.log('PASS: 024 replaces an outdated preview-selection-2 request after a provider 502 with a new preview-selection-3 request; unconfirmed charge stays counted, same plan/input/checkpoint fences, exact limits, click/tab dedup, late v2 result isolated, ACLs. Rollback-only fixtures.');
}
