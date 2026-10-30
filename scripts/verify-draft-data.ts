// M06 backend qualification; loopback-only and rollback-only.
import assert from "node:assert/strict";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import {compilerFixture} from "../fixtures/drafts";
import {prepareDrafts,finishDrafts,draftHash} from "../packages/creative/compiler";
import {canonicalJson} from "../packages/contracts/common";
import {measureDraftText} from "../packages/creative/measure.local";
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
    await db.query('reset role');await db.query(readFileSync('supabase/migrations/20261024000700_draft_compiler.sql','utf8'));
    const fixture=compilerFixture(made.checkpoint.scope,made.checkpoint.variantManifest);fixture.context.brand={id:revision4.id,kit};fixture.context.submittedBrief=JSON.parse(made.briefText);fixture.context.scriptRevisionId=`script-${jobs.find(j=>j.job_key==='script').id}`;fixture.context.planningRefs=jobs.filter(j=>j.kind==='text').map(j=>({id:j.id,sha256:'b'.repeat(64)}));
    for(const asset of fixture.context.assets){
      await db.query("insert into public.upload_sessions(id,tenant_id,campaign_id,asset_id,request_id,filename,claimed_mime,claimed_bytes,staging_key,created_by) values($1,$2,$3,$1,$4,$5,$6,$7,$8,$9)",[asset.id,tenantId,campaignId,randomUUID(),asset.filename,asset.mime,asset.bytes,'staging/'+asset.id,actorId]);
      await db.query("insert into public.asset_revisions(id,tenant_id,campaign_id,asset_id,upload_session_id,filename,object_key,sha256,mime,bytes,inspection,created_by) values($1,$2,$3,$1,$1,$4,$5,$6,$7,$8,$9,$10)",[asset.id,tenantId,campaignId,asset.filename,'media/'+asset.id,asset.sha256,asset.mime,asset.bytes,asset.inspection,actorId]);
    }
    const save=async(version:number)=>db.query('select * from public.studio_save_draft_plan($1,$2,$3,$4)',[round.id,version,fixture.plan,actorId]);
    await db.query('set local role service_role');assert.equal((await save(0)).rows[0].version,1);await rejects(()=>save(0),/STALE_DRAFT_PLAN/);
    const snapshot=(version:number)=>({schemaVersion:'1.0',planVersion:version,planHash:draftHash(fixture.plan),plan:fixture.plan,context:fixture.context});
    const queue=async(version:number)=>(await db.query('select * from public.studio_queue_draft_compile($1,$2,$3,$4)',[round.id,version,snapshot(version),actorId])).rows[0];
    await rejects(()=>queue(1),/PLANNING_REQUIRED/);
    await db.query('reset role');await db.query("update public.studio_workflow_jobs set state='succeeded',output='isolated planning receipt',output_hash=$2 where round_id=$1 and kind='text'",[round.id,'b'.repeat(64)]);await db.query('set local role service_role');
    const queued=await queue(1);assert.equal((await queue(1)).id,queued.id);
    const first=await claim();assert.equal(first.job.kind,'compile');
    const begin=async(c:typeof first)=>db.query('select public.studio_begin_draft_compile($1,$2,$3)',[c.job.id,c.job.lease_token,c.attempt.device_id]);
    const finish=async(c:typeof first,value:unknown,failure:string|null=null)=>(await db.query('select public.studio_finish_draft_compile($1,$2,$3,$4,$5) active',[c.job.id,c.job.lease_token,c.attempt.device_id,canonicalJson(value),failure])).rows[0].active;
    await begin(first);
    await db.query('reset role');await db.query("update public.studio_workflow_jobs set lease_until=now()-interval '1 second' where id=$1",[first.job.id]);await db.query('set local role service_role');
    await db.query('select public.studio_recover_workflow($1)',[tenantId]);const recovered=await claim(device2);assert.equal(recovered.job.id,first.job.id);assert.equal(recovered.job.lease_token,2);await begin(recovered);
    const prepared=prepareDrafts(fixture.plan,fixture.context);assert.equal(prepared.compilation.qa.issues.length,0);const measured=await measureDraftText(prepared.tasks),compiled=finishDrafts(prepared.compilation,measured.fits,measured.engine);assert.equal(compiled.qa.passed,true);
    assert.equal(await finish(first,compiled),false);
    await save(1);assert.equal(await finish(recovered,compiled),false,'A saved new plan must fence the old build');
    const job2=await queue(2);const active=await claim();assert.equal(active.job.id,job2.id);await begin(active);await rejects(()=>begin(active),/ALREADY_SUBMITTED/);
    await rejects(()=>finish(active,{...compiled,programs:compiled.programs.slice(1)}),/INCOMPLETE_DRAFT_BATCH/);
    await db.query("select public.studio_control_workflow($1,'pause',null,$2)",[round.id,actorId]);assert.equal(await finish(active,compiled),true);assert.equal((await db.query('select blocker from public.studio_workflow_rounds where id=$1',[round.id])).rows[0].blocker,'paused_by_user');await db.query("select public.studio_control_workflow($1,'resume',null,$2)",[round.id,actorId]);assert.equal(await finish(active,compiled),false);assert.equal((await queue(2)).state,'succeeded');
    const batch=(await db.query('select * from public.studio_draft_batches where round_id=$1',[round.id])).rows[0];assert.equal(batch.source_plan_version,2);assert.equal(batch.sha256,draftHash(compiled));assert.equal(batch.summary.directions.length,3);assert.equal(batch.summary.orderedVariants,made.checkpoint.variantManifest.entries.length);
    await db.query('reset role');await rejects(()=>db.query("update public.studio_draft_batches set summary='{}' where id=$1",[batch.id]),/IMMUTABLE_REVISION/);await db.query('set local role service_role');
    assert.equal((await db.query('select phase from public.studio_workflow_rounds where id=$1',[round.id])).rows[0].phase,'awaiting_ad_drafts');
    const budget=(await db.query('select charged_micro_usd,reserved_micro_usd,cap_micro_usd from public.studio_runs where id=$1',[runId])).rows[0];assert.equal(Number(budget.charged_micro_usd),0);assert.equal(Number(budget.reserved_micro_usd),0);assert.equal(Number(budget.cap_micro_usd),100000);
    const permissions=(await db.query("select has_table_privilege('service_role','public.studio_draft_batches','INSERT') writes,has_function_privilege('authenticated','public.studio_save_draft_plan(uuid,integer,jsonb,uuid)','EXECUTE') client_writes")).rows[0];assert.equal(permissions.writes,false);assert.equal(permissions.client_writes,false);
    await save(2);await queue(3);const cancelled=await claim();await begin(cancelled);await db.query("select public.studio_control_workflow($1,'cancel',null,$2)",[round.id,actorId]);assert.equal(await finish(cancelled,compiled),false);assert.equal((await db.query('select count(*)::int n from public.studio_draft_batches where round_id=$1',[round.id])).rows[0].n,1);
    await db.query('rollback');console.log('PASS: M07 incremental migration, service-only plan/build commands, optimistic versions, planning gate, exact source checks, idempotent queue, safe local recovery, lease/version fencing, measured three-direction/all-row publication, incomplete-batch rejection, immutable history, unchanged budgets, no AD/client approval. All schema/test data rolled back; no hosted writes, paid calls or interface tests.');
  }finally{await db.query('rollback').catch(()=>{});await db.end();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'M07 backend check failed');process.exitCode=1;});
