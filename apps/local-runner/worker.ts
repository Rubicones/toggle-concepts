// Independent local mock process. No rendering/provider work is triggered here.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { lumaScope, lumaManifest } from "../../fixtures/campaign";
import { sampleScene } from "../../fixtures/scene";
import { validateVariantManifest } from "../../packages/contracts/campaign";
import { parseScene } from "../../packages/contracts/scene";
import { workerStatusSchema } from "../../packages/contracts/studio";

if (process.env.MOCK_PROVIDERS && process.env.MOCK_PROVIDERS !== "true") {
  console.error("LIVE_MODE_UNAVAILABLE: this worker only validates local fixtures. Set MOCK_PROVIDERS=true or leave it unset.");
  process.exit(1);
}
const startedAt = new Date().toISOString();
const { manifest } = validateVariantManifest(lumaScope, lumaManifest);
parseScene(sampleScene);
const folder = resolve("artifacts/m01/worker");
mkdirSync(folder, { recursive: true });
const writeStatus = (state: "idle" | "stopped") => {
  const status = workerStatusSchema.parse({ schemaVersion: "1.0", deviceId: "local-mock-worker", mode: "mock", state,
    startedAt, heartbeatAt: new Date().toISOString(), checkedVariants: manifest.entries.length, checks: "passed", capabilities: ["contract-validation"] });
  const temporary = resolve(folder, `status-${process.pid}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(status, null, 2)}\n`);
  renameSync(temporary, resolve(folder, "status.json"));
};
if (process.argv.includes("--once")) {
  console.log(JSON.stringify({ mode: "mock", checks: "passed", variants: manifest.entries.length, scene: sampleScene.revisionId }));
} else {
  writeStatus("idle");
  console.log("Toggle local worker · MOCK MODE\nValidated 32 explicit variants and the local SceneSpec.\nWaiting locally. No production jobs, paid calls, or rendering are started.\nHeartbeat: every 2 seconds. Stop with Ctrl+C.");
  const heartbeat = setInterval(() => writeStatus("idle"), 2000);
  const stop = () => { clearInterval(heartbeat); writeStatus("stopped"); console.log("Local mock worker stopped."); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}
