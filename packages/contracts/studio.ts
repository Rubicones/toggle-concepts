import { z } from "zod";
import { id, version } from "./common";

// M01 local shell records; these are not C1 submissions or production artifacts.
export const localCampaignSchema = z.strictObject({
  schemaVersion: version, id, name: z.string().trim().min(1).max(80),
  brand: z.string().trim().min(1).max(60), goal: z.string().trim().max(1200),
  createdAt: z.string().datetime(),
});
export const studioStoreSchema = z.strictObject({
  schemaVersion: version, workspaceName: z.string().trim().min(1).max(60),
  interfaceLocale: z.literal("en"), reducedMotion: z.boolean(),
  campaigns: z.array(localCampaignSchema).max(100),
});
export type LocalCampaign = z.infer<typeof localCampaignSchema>;
export type StudioStore = z.infer<typeof studioStoreSchema>;
export const workerStatusSchema = z.strictObject({
  schemaVersion: version, deviceId: z.literal("local-mock-worker"), mode: z.literal("mock"),
  state: z.enum(["idle", "stopped", "error"]), startedAt: z.string().datetime(), heartbeatAt: z.string().datetime(),
  checkedVariants: z.number().int().nonnegative(), checks: z.enum(["passed", "failed"]),
  capabilities: z.tuple([z.literal("contract-validation")]),
});
export type WorkerStatus = z.infer<typeof workerStatusSchema>;
export const workerViewSchema = z.strictObject({
  online: z.boolean(), status: workerStatusSchema.nullable(), reason: z.enum(["ready", "not-started", "stale", "stopped", "invalid", "unavailable"]),
});
export type WorkerView = z.infer<typeof workerViewSchema>;
export function workerView(status: WorkerStatus | null, now: number): WorkerView {
  if (!status) return { online: false, status: null, reason: "not-started" };
  const age = now - Date.parse(status.heartbeatAt);
  const reason = status.state === "stopped" ? "stopped" : status.state === "error" || status.checks !== "passed"
    ? "invalid" : age > 8000 || age < -2000 ? "stale" : "ready";
  return { online: reason === "ready", status, reason };
}
