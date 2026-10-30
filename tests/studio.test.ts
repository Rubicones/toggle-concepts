import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { localCampaignSchema, studioStoreSchema, workerStatusSchema, workerView } from "../packages/contracts/studio";

const timestamp = "2026-10-24T12:00:00.000Z";
const status = workerStatusSchema.parse({ schemaVersion: "1.0", deviceId: "local-mock-worker", mode: "mock", state: "idle", startedAt: timestamp,
  heartbeatAt: timestamp, checkedVariants: 32, checks: "passed", capabilities: ["contract-validation"] });
test("M01 local records are bounded, versioned, and keep the interface English", () => {
  const campaign = localCampaignSchema.parse({ schemaVersion: "1.0", id: "local-demo", name: "  An idea  ", brand: "Luma", goal: "A local note", createdAt: timestamp });
  assert.equal(campaign.name, "An idea");
  const store = { schemaVersion: "1.0", workspaceName: "Studio", interfaceLocale: "en", reducedMotion: false, campaigns: [campaign] };
  assert.equal(studioStoreSchema.parse(store).campaigns.length, 1);
  assert.equal(studioStoreSchema.safeParse({ ...store, interfaceLocale: "ru" }).success, false);
  assert.equal(localCampaignSchema.safeParse({ ...campaign, name: " " }).success, false);
  assert.equal(localCampaignSchema.safeParse({ ...campaign, goal: "a".repeat(1201) }).success, false);
  assert.equal(studioStoreSchema.safeParse({ ...store, schemaVersion: "2.0" }).success, false);
});
test("worker readiness reflects a recent successful heartbeat, not a browser assumption", () => {
  const now = Date.parse(timestamp);
  assert.equal(workerView(status, now + 2000).online, true);
  assert.equal(workerView(status, now + 8001).reason, "stale");
  assert.equal(workerView(status, now - 3000).reason, "stale");
  assert.equal(workerView({ ...status, state: "stopped" }, now).reason, "stopped");
  assert.equal(workerView({ ...status, checks: "failed" }, now).online, false);
  assert.equal(workerView(null, now).online, false);
});
test("the mock worker cannot advertise production capabilities or live mode", () => {
  assert.equal(workerStatusSchema.safeParse({ ...status, mode: "live" }).success, false);
  assert.equal(workerStatusSchema.safeParse({ ...status, capabilities: ["render", "paid-generation"] }).success, false);
  assert.throws(() => execFileSync(process.execPath, ["--import", "tsx", "apps/local-runner/worker.ts", "--once"], {
    env: { ...process.env, MOCK_PROVIDERS: "false" }, stdio: "pipe",
  }), (error: unknown) => /LIVE_MODE_UNAVAILABLE/.test(String((error as { stderr: Buffer }).stderr)));
});
