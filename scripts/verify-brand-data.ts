// M05 backend qualification; loopback-only and rollback-only.
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
    const acceptKey=randomUUID(),accepted=(await review(revision4,acceptKey,"accepted")).rows[0];
    assert.equal((await review(revision4,acceptKey,"accepted")).rows[0].id,accepted.id);
    await rejects(()=>saveBrand(7),/A1_ALREADY_ACCEPTED/);
    await rejects(()=>db.query("update public.studio_a1_reviews set decision='changes_requested' where id=$1",[accepted.id]),/IMMUTABLE_REVISION/);
    assert.equal((await db.query("select count(*)::int as n from public.studio_runs where campaign_id=$1",[campaignId])).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int as n from public.outbox where campaign_id=$1 and event_type='A1.accepted'",[campaignId])).rows[0].n,1);
    const budget=(await db.query("select cap_micro_usd,charged_micro_usd,reserved_micro_usd from public.studio_runs where id=$1",[made.checkpoint.runId])).rows[0];
    assert.equal(Number(budget.cap_micro_usd),100000);assert.equal(Number(budget.charged_micro_usd),0);assert.equal(Number(budget.reserved_micro_usd),0);
    await db.query("rollback");
    console.log("PASS: migration 005, optimistic drafts, foreign-source rejection, exact hashes, immutable parent-linked revisions, idempotent A1 changes/acceptance, stale/blocked acceptance guards, frozen accepted kit, one original run/cap and atomic outbox. All schema/test data rolled back. No hosted writes, paid calls or interface tests.");
  } finally { await db.query("rollback").catch(() => {}); await db.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "A1 local database check failed"); process.exitCode = 1; });
