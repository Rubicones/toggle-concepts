// Backend-only qualification in an isolated loopback database. Always rolls back.
import assert from "node:assert/strict";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { completeTestBrief } from "../fixtures/brief";
import { defaultAgentSettings } from "../packages/agents/defaults";
import { buildC1Snapshot } from "../packages/data/brief-snapshot";

async function main() {
  const env = parseEnv(readFileSync(".env.m02.local", "utf8")), url = new URL(env.LOCAL_DATABASE_URL!);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("LOOPBACK_DATABASE_REQUIRED");
  const db = new Client({ connectionString: url.href, connectionTimeoutMillis: 3000 }); await db.connect();
  try {
    await db.query("begin");
    const schema = await db.query("select to_regclass('public.studio_c1_checkpoints') as c1");
    if (!schema.rows[0].c1) await db.query(readFileSync("supabase/migrations/20261024000400_c1_brief.sql", "utf8"));
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
    assert.equal((await submit()).rows[0].id, made.checkpoint.id); // Same request, no second run.
    assert.equal((await db.query("select count(*)::int as n from public.studio_runs where campaign_id=$1", [campaignId])).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int as n from public.outbox where campaign_id=$1 and event_type='C1.submitted'", [campaignId])).rows[0].n, 1);
    await rejects(() => db.query("update public.studio_c1_checkpoints set brief_text='changed' where id=$1", [made.checkpoint.id]), /IMMUTABLE_REVISION/);
    await rejects(() => db.query("select public.studio_save_brief($1,1,$2,$3)", [campaignId, draft, actorId]), /C1_ALREADY_SUBMITTED/);
    const intake = agents.find(a => a.role === "intake")!;
    const snapshot = { instructions: intake.instructions, stepCapMicroUsd: intake.step_cap_micro_usd, budgetScopeId: `budget-step-${made.checkpoint.runId}-intake`, campaignContext: { checkpointId: made.checkpoint.id } };
    const reserve = async (key: string, amount: number, cfg = snapshot) => (await db.query("select * from public.studio_reserve_step($1,$2,'intake',$3,'Isolated check',$4,$5)", [made.checkpoint.runId, key, intake.model_id, cfg, amount])).rows[0];
    const first = await reserve(randomUUID(), 30000);
    await db.query("select public.studio_finish_step($1,'succeeded',20000,'Isolated check',null,null,null)", [first.id]);
    await rejects(() => reserve(randomUUID(), 30001), /STEP_CAP_REACHED/);
    await rejects(() => reserve(randomUUID(), 1000, { ...snapshot, budgetScopeId: "fresh-budget" }), /CHECKPOINT_CONFIG_MISMATCH/);
    const key = randomUUID(), second = await reserve(key, 30000); assert.equal((await reserve(key, 30000)).id, second.id);
    await rejects(() => reserve(randomUUID(), 1), /STEP_CAP_REACHED/);
    const budget = (await db.query("select charged_micro_usd,reserved_micro_usd,cap_micro_usd from public.studio_runs where id=$1", [made.checkpoint.runId])).rows[0];
    assert.equal(Number(budget.charged_micro_usd), 20000); assert.equal(Number(budget.reserved_micro_usd), 30000); assert.equal(Number(budget.cap_micro_usd), 100000);
    await db.query("rollback");
    console.log("PASS: local migration, stale-save rejection, atomic C1/run/audit/outbox, idempotency, immutability, frozen scope and cumulative role budget. All schema/test rows rolled back; no hosted writes, paid calls or interface tests.");
  } finally { await db.query("rollback").catch(() => {}); await db.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "C1 local database check failed"); process.exitCode = 1; });
