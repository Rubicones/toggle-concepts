// M06 backend qualification; loopback-only and rollback-only.
import assert from "node:assert/strict";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { completeTestBrief } from "../fixtures/brief";
import { defaultAgentSettings } from "../packages/agents/defaults";
import { buildC1Snapshot } from "../packages/data/brief-snapshot";
import { completeBrandDraft } from "../fixtures/brand";
import { brandSnapshot, a1ReviewSource } from "../packages/data/brand-snapshot";

async function main() {
  const env = parseEnv(readFileSync(".env.m02.local", "utf8")), url = new URL(env.LOCAL_DATABASE_URL!);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("LOOPBACK_DATABASE_REQUIRED");
  const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 3000 }); await db.connect();
  try {
    await db.query("begin");
    const schema = await db.query("select to_regclass('public.studio_c1_checkpoints') as c1");
    if (!schema.rows[0].c1) await db.query(readFileSync("supabase/migrations/20261024000400_c1_brief.sql", "utf8"));
    if (!(await db.query("select to_regclass('public.studio_a1_reviews') as a1")).rows[0].a1) await db.query(readFileSync("supabase/migrations/20261024000500_brand_kit_a1.sql","utf8"));
    const rights=(await db.query("select has_function_privilege('service_role','public.studio_save_brand(uuid,integer,jsonb,uuid)','EXECUTE') as service_rpc,has_function_privilege('authenticated','public.studio_review_a1(uuid,uuid,uuid,text,uuid)','EXECUTE') as client_rpc,has_table_privilege('service_role','public.studio_brand_revisions','INSERT') as direct_insert,has_table_privilege('service_role','public.studio_a1_reviews','TRUNCATE') as direct_truncate")).rows[0];
    assert.equal(rights.service_rpc,true);assert.equal(rights.client_rpc,false);assert.equal(rights.direct_insert,false);assert.equal(rights.direct_truncate,false);
    const actorId = randomUUID(), tenantId = randomUUID(), campaignId = randomUUID(), requestId = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,$2)", [actorId, `c1-${actorId}@example.test`]);
    await db.query("insert into public.tenants(id,name) values($1,'Rollback-only C1 verification')", [tenantId]);
    await db.query("insert into app_private.tenant_members values($1,$2,'producer')", [tenantId, actorId]);
    await db.query("insert into public.campaigns(id,tenant_id,name,brand,created_by) values($1,$2,'C1 verification','Test',$3)", [campaignId, tenantId, actorId]);
    const agents = [...defaultAgentSettings].sort((a, b) => a.role.localeCompare(b.role));
    for (const a of agents) await db.query("insert into public.studio_agents(tenant_id,role,model_id,instructions,max_output_tokens,step_cap_micro_usd) values($1,$2,$3,$4,$5,$6)", [tenantId, a.role, a.model_id, a.instructions, a.max_output_tokens, a.step_cap_micro_usd]);
    async function rejects(operation: () => Promise<unknown>, pattern: RegExp) {
      await db.query("savepoint expected_failure"); let error: unknown;
      try { await operation(); } catch (caught) { error = caught; }
      await db.query("rollback to expected_failure"); await db.query("release expected_failure");
      assert.ok(error instanceof Error && pattern.test(error.message), `Expected ${pattern}`);
    }
    const draft = completeTestBrief();
    const saved = await db.query("select (public.studio_save_brief($1,0,$2,$3)).version", [campaignId, draft, actorId]); assert.equal(saved.rows[0].version, 1);
    await rejects(() => db.query("select public.studio_save_brief($1,0,$2,$3)", [campaignId, draft, actorId]), /STALE_BRIEF/);
    const made = buildC1Snapshot({ campaign: { id: campaignId, name: "C1 verification", brand: "Test", version: 1 }, actorId, draft, agents, sources: [] });
    const args = [campaignId, 1, 1, requestId, made.briefText, made.configText, made.checkpoint, JSON.stringify(agents), actorId];
    const submit = () => db.query("select (public.studio_submit_c1($1,$2,$3,$4,$5,$6,$7,$8,$9)).id", args);
    assert.equal((await submit()).rows[0].id, made.checkpoint.id);
    let kit=completeBrandDraft(made.checkpoint.scope.locales);
    const saveBrand=(expected:number,value=kit)=>db.query("select (public.studio_save_brand($1,$2,$3,$4)).version",[campaignId,expected,value,actorId]);
    await db.query("set local role service_role");
    assert.equal((await saveBrand(0)).rows[0].version,1);
    await db.query("reset role");
    await rejects(()=>saveBrand(0),/STALE_BRAND/);
    // Exercise the source validation loop with an otherwise well-formed foreign asset.
    const foreign={id:randomUUID(),sha256:"a".repeat(64),filename:"foreign.png",mime:"image/png",bytes:100};
    const invalid={...kit,sourceAssetIds:[foreign.id]};
    await saveBrand(1,invalid);
    const invalidSnapshot=brandSnapshot(made.checkpoint,invalid,[foreign],2,null);
    await rejects(()=>db.query("select public.studio_publish_brand($1,2,$2,$3,$4)",[campaignId,randomUUID(),invalidSnapshot.source,actorId]),/INVALID_BRAND_SOURCE/);
    await saveBrand(2);
    const snap1=brandSnapshot(made.checkpoint,kit,[],3,null),publishKey=randomUUID();
    const publish=(v:number,key:string,source:string)=>db.query("select * from public.studio_publish_brand($1,$2,$3,$4,$5)",[campaignId,v,key,source,actorId]);
    const revision1=(await publish(3,publishKey,snap1.source)).rows[0];
    assert.equal((await publish(3,publishKey,snap1.source)).rows[0].id,revision1.id);
    assert.equal(revision1.sha256,snap1.sha256);
    await rejects(()=>db.query("update public.studio_brand_revisions set payload='{}' where id=$1",[revision1.id]),/IMMUTABLE_REVISION/);
    const review=(r:typeof revision1,key:string,decision:"accepted"|"changes_requested",confirmed=true)=>db.query("select * from public.studio_review_a1($1,$2,$3,$4,$5)",[campaignId,r.id,key,a1ReviewSource(r,actorId,{decision,reviewerName:"Local AD",comments:decision==="accepted"?"Reviewed the complete fixture kit":"Clarify the motion treatment",attestations:{rules:confirmed,fonts:confirmed,c1Constraints:confirmed}}),actorId]);
    await rejects(()=>review(revision1,randomUUID(),"accepted",false),/A1_BLOCKED/);
    const changeKey=randomUUID();const change=(await review(revision1,changeKey,"changes_requested")).rows[0];
    assert.equal((await review(revision1,changeKey,"changes_requested")).rows[0].id,change.id);
    await rejects(()=>review(revision1,randomUUID(),"accepted"),/A1_REVISION_REVIEWED/);
    kit={...kit,instructions:kit.instructions+" Motion: calm with no overshoot."};await saveBrand(3);
    const snap2=brandSnapshot(made.checkpoint,kit,[],4,revision1.id),revision2=(await publish(4,randomUUID(),snap2.source)).rows[0];
    assert.equal(revision2.parent_revision_id,revision1.id);assert.equal(revision2.run_id,made.checkpoint.runId);
    // A stale draft cannot be approved even if the published revision was complete.
    await saveBrand(4);await rejects(()=>review(revision2,randomUUID(),"accepted"),/STALE_BRAND/);
    const blocked={...kit,fontRightsConfirmed:false};await saveBrand(5,blocked);
    const snap3=brandSnapshot(made.checkpoint,blocked,[],6,revision2.id),revision3=(await publish(6,randomUUID(),snap3.source)).rows[0];
    await rejects(()=>review(revision3,randomUUID(),"accepted"),/A1_BLOCKED/);
    await saveBrand(6);const snap4=brandSnapshot(made.checkpoint,kit,[],7,revision3.id),revision4=(await publish(7,randomUUID(),snap4.source)).rows[0];
    await db.query(readFileSync("supabase/migrations/20261024000600_workflow_queue.sql","utf8"));
    await rejects(()=>db.query("select public.studio_start_workflow($1,$2)",[made.checkpoint.runId,actorId]),/A1_REQUIRED/);
    const accepted=(await review(revision4,randomUUID(),"accepted")).rows[0];
    await rejects(()=>db.query("select public.studio_start_workflow($1,$2)",[made.checkpoint.runId,randomUUID()]),/FORBIDDEN/);
    const runId=made.checkpoint.runId,device=randomUUID(),device2=randomUUID();
    const workflowRights=(await db.query("select has_function_privilege('authenticated','public.studio_claim_workflow(uuid,uuid)','EXECUTE') as public_claim,has_table_privilege('service_role','public.studio_workflow_jobs','INSERT') as direct_write")).rows[0];assert.equal(workflowRights.public_claim,false);assert.equal(workflowRights.direct_write,false);
    await db.query("set local role service_role");
    const start=()=>db.query("select * from public.studio_start_workflow($1,$2)",[runId,actorId]);
    const round=(await start()).rows[0];assert.equal((await start()).rows[0].id,round.id);assert.equal(round.a1_id,accepted.id);
    const jobs=(await db.query("select * from public.studio_workflow_jobs where round_id=$1 order by job_key",[round.id])).rows;assert.equal(jobs.length,7);
    assert.equal((await db.query("select count(*)::int n from public.studio_workflow_dependencies d join public.studio_workflow_jobs j on j.id=d.job_id where j.round_id=$1",[round.id])).rows[0].n,10);
    const beatDevice=async(d=device)=>db.query("select public.studio_workflow_device($1,$2,true)",[d,tenantId]);await beatDevice();await beatDevice(device2);
    const claim=async(d=device)=>(await db.query("select public.studio_claim_workflow($1,$2) as claim",[tenantId,d])).rows[0].claim;
    const first=await claim();assert.equal(first.job.job_key,'research');assert.equal(await claim(device2),null,"Dependencies must prevent a second claim");
    const refs=async(j:typeof first.job)=>(await db.query("select coalesce(jsonb_agg(jsonb_build_object('jobId',p.id,'sha256',p.output_hash,'output',p.output) order by p.job_key),'[]'::jsonb) refs from public.studio_workflow_dependencies d join public.studio_workflow_jobs p on p.id=d.requires_id where d.job_id=$1 and p.state='succeeded'",[j.id])).rows[0].refs;
    const begin=async(c:typeof first,reservation=1000)=>{
      const cfg={...c.job.payload.snapshot,upstream:await refs(c.job),pricing:{inputPrice:0.0000003,outputPrice:0.0000025},disableReasoning:true};
      return (await db.query("select * from public.studio_begin_workflow($1,$2,$3,$4,$5)",[c.job.id,c.job.lease_token,c.attempt.device_id,cfg,reservation])).rows[0];
    };
    const finish=async(c:typeof first,outcome='succeeded',cost:number|null=100,output='{"summary":"isolated backend fault receipt"}',failure:string|null=null,input=c.job.input_hash)=>(await db.query("select public.studio_complete_workflow($1,$2,$3,$4,$5,$6,$7,$8,null,null,$9) active",[c.job.id,c.job.lease_token,c.attempt.device_id,input,c.job.config_hash,outcome,cost,output,failure])).rows[0].active;
    const control=async(action:string,job:string|null=null)=>db.query("select public.studio_control_workflow($1,$2,$3,$4)",[round.id,action,job,actorId]);
    const owner=async(sql:string,args:unknown[]=[])=>{await db.query('reset role');const result=await db.query(sql,args);await db.query('set local role service_role');return result;};
    await owner("update public.studio_workflow_jobs set lease_until=now()-interval '1 second' where id=$1",[first.job.id]);
    await db.query("select public.studio_recover_workflow($1)",[tenantId]);
    const second=await claim(device2);assert.equal(second.job.id,first.job.id);assert.equal(second.job.lease_token,2);
    await rejects(()=>begin(first),/LEASE_LOST/);
    assert.equal((await db.query("select public.studio_heartbeat_workflow($1,$2,$3) ok",[first.job.id,first.job.lease_token,device])).rows[0].ok,false);
    const request=await begin(second);assert.equal(request.status,'reserved'); // Returned snapshot; row is running after atomic begin.
    await rejects(()=>begin(second),/ALREADY_SUBMITTED/);
    assert.equal(await finish(second,'failed',0,'','PROVIDER_429'),true);
    const s429=(await db.query("select * from public.studio_workflow_jobs where id=$1",[second.job.id])).rows[0];assert.equal(s429.state,'queued');
    assert.equal((await db.query("select count(*)::int n from public.studio_agent_steps where run_id=$1",[runId])).rows[0].n,1);
    await owner("update public.studio_workflow_jobs set available_at=now() where id=$1",[second.job.id]);
    const third=await claim();assert.equal(third.job.attempt_count,3);await begin(third);
    assert.equal(await finish(third),true);assert.equal(await finish(third),false,"Duplicate receipts must not settle/activate twice");
    const strategy=await claim();assert.equal(strategy.job.job_key,'strategy');
    await control('pause');assert.equal(await claim(device2),null);await rejects(()=>begin(strategy),/LEASE_LOST/);await control('resume');
    await begin(strategy);assert.equal(await finish(strategy,'failed',125,'invalid output','INVALID_OUTPUT_SCHEMA'),true);
    assert.equal((await db.query("select blocker from public.studio_workflow_rounds where id=$1",[round.id])).rows[0].blocker,'failed');
    assert.equal(await claim(),null);await control('retry',strategy.job.id);
    const strategy2=await claim();await begin(strategy2);assert.equal(await finish(strategy2),true);
    const variant=await claim();assert.equal(variant.job.job_key,'variants');await begin(variant);
    assert.equal(await finish(variant,'succeeded',100,'{"bad":"stale"}',null,'wrong-input'),false);
    assert.equal((await db.query("select state,output from public.studio_workflow_jobs where id=$1",[variant.job.id])).rows[0].output,null);
    await control('retry',variant.job.id);const variant2=await claim();await begin(variant2);await finish(variant2);
    const script=await claim();assert.equal(script.job.job_key,'script');
    await rejects(()=>begin(script,100001),/RUN_CAP_REACHED/);await finish(script,'failed',0,'','RUN_CAP_REACHED');
    assert.equal((await db.query("select blocker from public.studio_workflow_rounds where id=$1",[round.id])).rows[0].blocker,'budget_blocked');
    await control('retry',script.job.id);const script2=await claim();await begin(script2);await finish(script2);
    // Localizations and visual direction become ready only after the exact upstream artifacts.
    const parallel=await claim(),parallel2=await claim(device2);assert.notEqual(parallel.job.id,parallel2.job.id);
    await begin(parallel);await begin(parallel2);await finish(parallel);await finish(parallel2);
    assert.equal(await claim(),null);const done=(await db.query("select * from public.studio_workflow_rounds where id=$1",[round.id])).rows[0];assert.equal(done.phase,'ready_for_draft_assembly');assert.equal(done.blocker,'capability_blocked');
    assert.equal((await db.query("select count(*)::int n from public.studio_runs where campaign_id=$1",[campaignId])).rows[0].n,1);
    const budget=(await db.query("select * from public.studio_runs where id=$1",[runId])).rows[0];assert.equal(Number(budget.charged_micro_usd),825);assert.equal(Number(budget.reserved_micro_usd),0);assert.equal(Number(budget.cap_micro_usd),100000);
    // Manual queue: atomic reserve/enqueue, cancel-before-submit releases all money.
    const manualRun=async()=>{const id=randomUUID();await owner("insert into public.studio_runs(id,tenant_id,campaign_id,request_id,name,cap_micro_usd,config_snapshot) values($1,$2,$3,$4,'Backend isolated test',100000,$5)",[id,tenantId,campaignId,randomUUID(),JSON.stringify(agents)]);return id;};
    const enqueue=async(rid:string,key=randomUUID(),amount=1000)=>{const agent=agents.find(a=>a.role==='strategy')!;return (await db.query("select * from public.studio_enqueue_text($1,$2,'strategy',$3,'Test-only task',$4,$6,$5)",[rid,key,agent.model_id,{instructions:agent.instructions,maxOutputTokens:100,stepCapMicroUsd:agent.step_cap_micro_usd,pricing:{inputPrice:0.0000003,outputPrice:0.0000025},campaignContext:{mode:'manual'},outputFormat:'json_object'},actorId,amount])).rows[0];};
    const cancelRun=await manualRun();await rejects(()=>db.query("select public.studio_start_workflow($1,$2)",[cancelRun,actorId]),/C1_REQUIRED/);
    const key=randomUUID(),cancelStep=await enqueue(cancelRun,key);assert.equal((await enqueue(cancelRun,key)).id,cancelStep.id);
    const cancelRound=(await db.query("select * from public.studio_workflow_rounds where run_id=$1",[cancelRun])).rows[0];
    await db.query("select public.studio_control_workflow($1,'cancel',null,$2)",[cancelRound.id,actorId]);
    assert.equal(Number((await db.query("select reserved_micro_usd from public.studio_runs where id=$1",[cancelRun])).rows[0].reserved_micro_usd),0);
    const lateRun=await manualRun();await enqueue(lateRun);const late=await claim();await begin(late);
    await db.query("select public.studio_control_workflow($1,'cancel',null,$2)",[late.job.round_id,actorId]);
    assert.equal(await finish(late,'succeeded',150,'late provider bytes'),false);
    const lateJob=(await db.query("select * from public.studio_workflow_jobs where id=$1",[late.job.id])).rows[0];assert.equal(lateJob.state,'cancelled');assert.equal(lateJob.output,null);
    assert.equal(Number((await db.query("select charged_micro_usd from public.studio_runs where id=$1",[lateRun])).rows[0].charged_micro_usd),150);
    const preflightRun=await manualRun();await enqueue(preflightRun);const preflight=await claim();await finish(preflight,'failed',0,'','CATALOG_UNAVAILABLE');
    assert.equal(Number((await db.query("select reserved_micro_usd from public.studio_runs where id=$1",[preflightRun])).rows[0].reserved_micro_usd),0);
    const unknownRun=await manualRun();await enqueue(unknownRun);const unknown=await claim();await begin(unknown);
    await owner("update public.studio_workflow_jobs set lease_until=now()-interval '1 second' where id=$1",[unknown.job.id]);
    await db.query("select public.studio_recover_workflow($1)",[tenantId]);
    const unknownBudget=(await db.query("select * from public.studio_runs where id=$1",[unknownRun])).rows[0];assert.equal(unknownBudget.status,'closed');assert.equal(Number(unknownBudget.charged_micro_usd),1000);assert.equal(Number(unknownBudget.reserved_micro_usd),0);
    assert.equal(await finish(unknown),false);assert.equal(await claim(),null);
    assert.equal(Number((await db.query("select late_receipt from public.studio_workflow_attempts where id=$1",[unknown.attempt.id])).rows[0].late_receipt.actualCostMicroUsd),100);
    // An unsubmitted manual lease expires without losing its reservation or duplicating the request.
    const resumedRun=await manualRun(),resumedStep=await enqueue(resumedRun);const lostManual=await claim();
    await owner("update public.studio_workflow_jobs set lease_until=now()-interval '1 second' where id=$1",[lostManual.job.id]);
    await db.query("select public.studio_recover_workflow($1)",[tenantId]);
    const resumed=await claim(device2);const resumedRequest=await begin(resumed);assert.equal(resumedRequest.id,resumedStep.id);await finish(resumed);
    assert.equal(Number((await db.query("select reserved_micro_usd from public.studio_runs where id=$1",[resumedRun])).rows[0].reserved_micro_usd),0);
    // Admission locks cumulative manual role spending too; another request cannot get a new role cap.
    const capRun=await manualRun();await enqueue(capRun,randomUUID(),50000);const capClaim=await claim();await begin(capClaim);await finish(capClaim,'succeeded',50000);
    await rejects(()=>enqueue(capRun),/STEP_CAP_REACHED/);
    
    await rejects(()=>db.query("select public.studio_control_workflow($1,'retry',$2,$3)",[unknown.job.round_id,unknown.job.id,actorId]),/WORKFLOW_CANCELLED|RETRY_BLOCKED/);
    await db.query("rollback");
    console.log("PASS: M06 service-only commands; atomic C1/A1 graph; dependencies; competing claims; monotonic fencing; expired unsubmitted recovery; duplicate-submit/receipt prevention; 429 retry bound; pause; paid invalid-output retry; stale output rejection; cap blocker; explicit capability stop; cancellation before/after submit; retained charges; unknown outcome conservative settlement/no retry. All schema/test rows rolled back; no hosted writes, paid calls or interface tests.");
  }finally{await db.query("rollback").catch(()=>{});await db.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"M06 backend check failed");process.exitCode=1;});
