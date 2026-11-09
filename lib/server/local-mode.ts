import "server-only";
// The Local / OpenRouter switch on this computer (docs/plans/2026-11-06-local-claude-pipeline-plan.md, §4). The local
// app reads its own device id and qualified profile from ~/.toggle (written by `npm run local-claude:doctor`); it never
// reads Claude tokens. Hosted deployments have no device and always use OpenRouter.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CapabilityProfile } from "@/apps/local-runner/local-claude/qualify";
import { LOCAL_MODEL_MAPPING_VERSION } from "@/packages/agents/local-models";

const home = () => process.env.TOGGLE_HOME ?? join(homedir(), ".toggle");
export type LocalDevice = { id: string; label: string };
export type LocalModeState = {
  device: LocalDevice | null;
  profile: { cliVersion: string; model: string | null; textRoles: string; visualRoles: string; reasons: string[]; limitations: string[]; createdAt: string } | null;
  /** Why Local cannot be chosen on this computer, in plain words; null when it can. */
  blocked: string | null;
  /** The profile summary frozen on new runs when Local is chosen. */
  summary: Record<string, unknown> | null;
};

export async function localModeState(): Promise<LocalModeState> {
  let device: LocalDevice | null = null, text = "", profile: CapabilityProfile | null = null;
  try { const raw = JSON.parse(await readFile(join(home(), "device.json"), "utf8")); if (typeof raw.id === "string" && typeof raw.label === "string") device = { id: raw.id, label: raw.label }; } catch { /* not set up */ }
  try { text = await readFile(join(home(), "local-claude", "profile.json"), "utf8"); profile = JSON.parse(text) as CapabilityProfile; } catch { /* not qualified */ }
  const view = profile ? { cliVersion: profile.cli.version, model: profile.model.actual ?? null, textRoles: profile.verdict.textRoles, visualRoles: profile.verdict.visualRoles, reasons: profile.verdict.reasons, limitations: profile.verdict.limitations ?? [], createdAt: profile.createdAt } : null;
  const blocked = !device ? "This computer is not set up for Local mode. Run npm run local-claude:doctor -- --fix in the studio folder."
    : !profile ? "Claude Code has not been checked on this computer yet. Run npm run local-claude:doctor -- --fix --extra-usage-off."
    : profile.device.id !== device.id ? "The Claude Code check belongs to another computer. Run the check again here."
    : profile.verdict.textRoles !== "ready" ? `The Claude Code check found a blocker: ${profile.verdict.reasons.join("; ")}.`
    : !profile.model.actual || !/^claude-sonnet-/.test(profile.model.actual) ? "The check did not pin a Sonnet model. Run it again with --model sonnet."
    : null;
  const summary = !blocked && profile ? { executionModel: profile.model.actual, cliVersion: profile.cli.version, mappingVersion: LOCAL_MODEL_MAPPING_VERSION, profileSha: createHash("sha256").update(text).digest("hex"), visual: profile.verdict.visualRoles === "ready" } : null;
  return { device, profile: view, blocked, summary };
}
