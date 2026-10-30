"use client";
import {Disclosure} from '@/components/ui/disclosure';
import {Select} from '@/components/ui/select';
import { useRef, useState } from "react";
import { Play, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/packages/contracts/shared";
import { canContinueFailure } from "@/packages/contracts/run-limits";
import { agentLabel, type RunBudget } from "@/packages/contracts/run-budget";
import type { GuidedRunView } from "@/packages/contracts/guided-run";
import { WorkflowMigration } from "./brief-workspace";
import styles from "./guided-run-workspace.module.css";

type Command = (value: unknown) => Promise<boolean>;
/** Rounded for people; exact amounts stay in tooltips and the audit trail. */
export const approx = (micro: number) => (micro > 0 && micro < 10000 ? "<$0.01" : `$${(micro / 1000000).toFixed(2)}`);
const pct = (n: number, of: number) => (of > 0 ? Math.min(100, Math.max(0, (n / of) * 100)) : 0);
const TIPS = {
  spent: "Confirmed provider charges.",
  held: "Requests the provider never confirmed (for example an HTTP 502). Their full allowance stays counted because a charge cannot be ruled out.",
  flight: "Reserved for requests that are running right now. Settles to the actual cost when they finish.",
  left: "What the next request may still reserve under the run budget.",
};

/** toggle2-style run budget: one bar, one line of numbers, one button. Agent allowances underneath. */
export function RunBudgetCard({ data, busy, command }: { data: GuidedRunView; busy: boolean; command: Command }) {
  const [open, setOpen] = useState(false);
  const b = data.budget;
  if (!data.run || !b) return null;
  const stopped = b.blockedBy !== null;
  const editable = data.run.status === "active" && !!data.limits?.ready;
  const agents = b.agents.filter((a) => a.usedMicroUsd > 0 || a.blocked);
  const quote = data.assemblyContinuation;
  return (
    <section className={styles.budget} data-state={stopped ? "blocked" : undefined} aria-label="Run budget">
      <div className={styles.budgetHead}>
        <p className={styles.eyebrow}>
          <Wallet size={13} /> RUN BUDGET
        </p>
        {editable && (
          <Button size="sm" variant={stopped && !quote ? "default" : "outline"} disabled={busy} onClick={() => setOpen(true)}>
            Raise budget
          </Button>
        )}
      </div>
      <div className={styles.amount}>
        {approx(b.freeMicroUsd)}
        <span>left of {money(b.capMicroUsd)}</span>
      </div>
      <div
        className={styles.bar}
        role="img"
        aria-label={`Spent ${money(b.settledMicroUsd)}, unconfirmed ${money(b.heldMicroUsd)}, in flight ${money(b.inFlightMicroUsd)}, left ${money(b.freeMicroUsd)} of ${money(b.capMicroUsd)}`}
      >
        <i data-kind="spent" style={{ width: `${pct(b.settledMicroUsd, b.capMicroUsd)}%` }} title={`${money(b.settledMicroUsd)} · ${TIPS.spent}`} />
        <i data-kind="held" style={{ width: `${pct(b.heldMicroUsd, b.capMicroUsd)}%` }} title={`${money(b.heldMicroUsd)} · ${TIPS.held}`} />
        <i data-kind="flight" style={{ width: `${pct(b.inFlightMicroUsd, b.capMicroUsd)}%` }} title={`${money(b.inFlightMicroUsd)} · ${TIPS.flight}`} />
      </div>
      <div className={styles.legend}>
        <div title={TIPS.spent}>
          <small><span data-kind="spent" />Spent</small>
          <strong>{approx(b.settledMicroUsd)}</strong>
        </div>
        <div title={TIPS.held}>
          <small><span data-kind="held" />Unconfirmed</small>
          <strong>{approx(b.heldMicroUsd)}</strong>
        </div>
        <div title={TIPS.flight}>
          <small><span data-kind="flight" />In flight</small>
          <strong>{approx(b.inFlightMicroUsd)}</strong>
        </div>
      </div>
      {b.heldMicroUsd > 0 && (
        <small>
          {money(b.heldMicroUsd)} is held for requests the provider never confirmed. It stays counted until a provider receipt confirms the actual cost.
        </small>
      )}
      <div className={styles.agentBudget}>
        <small>Each request must fit the run budget and its agent’s cumulative allowance.</small>
        {agents.length === 0 ? (
          <small>No agent has spent anything yet.</small>
        ) : (
          agents.map((a) => (
            <div key={a.role} data-blocked={a.blocked || undefined}>
              <span>{agentLabel(a.role)}</span>
              <span className={styles.miniBar} aria-hidden="true">
                <i data-kind="spent" style={{ width: `${pct(a.settledMicroUsd, a.capMicroUsd)}%` }} />
                <i data-kind="held" style={{ width: `${pct(a.heldMicroUsd, a.capMicroUsd)}%` }} />
                <i data-kind="flight" style={{ width: `${pct(a.inFlightMicroUsd, a.capMicroUsd)}%` }} />
              </span>
              <span title={`Spent ${money(a.settledMicroUsd)} · unconfirmed ${money(a.heldMicroUsd)} · in flight ${money(a.inFlightMicroUsd)}`}>
                {approx(a.usedMicroUsd)} / {approx(a.capMicroUsd)}
              </span>
            </div>
          ))
        )}
      </div>
      {stopped && (
        <p className={styles.budgetStop} role="status">
          {b.blockedBy === "run"
            ? "Stopped: the next request does not fit the run budget. Nothing was sent to the provider."
            : `Stopped: ${agentLabel(b.blockedRole ?? "")} has no room left in its allowance. Nothing was sent to the provider.`}{" "}
          {quote ? "Use Continue anyway below to see the price and go on." : "Raise the budget to continue."}
        </p>
      )}
      {editable && <RaiseBudgetDialog key={`${data.run.id}-${data.limits?.version ?? 0}`} open={open} onOpenChange={setOpen} data={data} budget={b} busy={busy} command={command} />}
    </section>
  );
}

function RaiseBudgetDialog({
  open,
  onOpenChange,
  data,
  budget,
  busy,
  command,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: GuidedRunView;
  budget: RunBudget;
  busy: boolean;
  command: Command;
}) {
  // Image stills are paid per request too, so their allowance must be raisable here; video/3D have no provider yet.
  const agents = (data.limits?.agents ?? []).filter((a) => a.model_id && !["video", "model3d"].includes(a.role));
  const control = data.control;
  const capUsd = budget.capMicroUsd / 1000000;
  const [runCap, setRunCap] = useState(() => (budget.blockedBy === "run" ? Math.ceil(capUsd + 2) : capUsd));
  const [caps, setCaps] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      agents.map((a) => {
        const row = budget.agents.find((r) => r.role === a.role);
        const current = a.step_cap_micro_usd / 1000000;
        return [a.role, row?.blocked ? Math.max(current, Math.ceil((row.usedMicroUsd / 1000000 + 0.6) * 10) / 10) : current];
      }),
    ),
  );
  const [tokens, setTokens] = useState(16384);
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const failed = data.jobs.find((j) => j.kind === "text" && j.state === "failed");
  const stoppedCode =
    control?.status === "paused" ? String((control.cursor.stoppedFrom as { blocker?: string } | undefined)?.blocker ?? "stopped_by_user") : control?.blocker;
  // A request stopped by a cap was never sent; raising the cap and retrying it is always safe in planning.
  const budgetStop = control?.stage === "planning" && ["RUN_CAP_REACHED", "STEP_CAP_REACHED"].includes(stoppedCode ?? "");
  const canContinue =
    (budgetStop &&
      ["blocked", "paused"].includes(control!.status) &&
      (!failed || failed.attempt_count < 3) &&
      !(control!.cursor.stoppedFrom as { status?: string } | undefined)?.status?.includes("review")) ||
    (!data.assemblyContinuation &&
    !data.assemblyRetry &&
    !!control &&
    ["blocked", "paused"].includes(control.status) &&
    canContinueFailure(stoppedCode) &&
    !data.failureStep?.canRecover &&
    (!failed || failed.attempt_count < 3) &&
    !(control.cursor.stoppedFrom as { status?: string } | undefined)?.status?.includes("review"));
  const recommended = () =>
    setCaps(Object.fromEntries(agents.map((a) => [a.role, Math.max(caps[a.role] ?? 0, a.step_cap_micro_usd / 1000000, 0.5)])));
  const changes = agents
    .map((a) => ({
      role: a.role,
      // Response length is a text setting; an image request keeps its own.
      maxOutputTokens: a.role === "image" ? a.max_output_tokens : Math.min(32768, Math.max(a.max_output_tokens, tokens)),
      capMicroUsd: Math.max(a.step_cap_micro_usd, Math.round((caps[a.role] ?? 0) * 1000000)),
      current: a,
    }))
    .filter((c) => c.capMicroUsd > c.current.step_cap_micro_usd || c.maxOutputTokens > c.current.max_output_tokens)
    .map(({ role, maxOutputTokens, capMicroUsd }) => ({ role, maxOutputTokens, capMicroUsd }));
  const runCapMicro = Math.round(runCap * 1000000);
  const invalid =
    !Number.isFinite(runCap) ||
    runCapMicro < budget.capMicroUsd ||
    runCap > 100 ||
    agents.some((a) => !Number.isFinite(caps[a.role]) || Math.round(caps[a.role] * 1000000) < a.step_cap_micro_usd || caps[a.role] > 100);
  const unchanged = runCapMicro === budget.capMicroUsd && changes.length === 0;
  async function save(continueRun: boolean) {
    const content = {
        expectedVersion: data.limits!.version,
        runCapMicroUsd: runCapMicro,
        agents: changes,
        continueRun,
        retryJobId: continueRun && failed ? failed.id : null,
      },
      signature = JSON.stringify(content);
    if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
    if (await command({ action: "limits", ...content, requestId: pending.current.id })) {
      pending.current = null;
      onOpenChange(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Raise the budget</DialogTitle>
        <DialogDescription>
          Spent {money(budget.settledMicroUsd)}, unconfirmed {money(budget.heldMicroUsd)}, in flight {money(budget.inFlightMicroUsd)}; cap now{" "}
          {money(budget.capMicroUsd)}. Every paid request reserves first and settles to its actual cost. These are ceilings, not charges.
        </DialogDescription>
        {!data.limits?.ready ? (
          <WorkflowMigration stage="Run limits" />
        ) : (
          <div className={styles.raiseForm}>
            <label>
              Run budget, USD
              <input type="number" inputMode="decimal" min={capUsd} max={100} step={0.5} value={runCap} onChange={(e) => setRunCap(Number(e.target.value))} />
            </label>
            <div className={styles.raiseAgents}>
              <small>
                Agent allowances, USD (cumulative for the whole run).{" "}
                <button type="button" className="text-link" onClick={recommended}>
                  Set every agent to at least $0.50
                </button>
              </small>
              {agents.map((a) => {
                const row = budget.agents.find((r) => r.role === a.role);
                return (
                  <label key={a.role} data-blocked={row?.blocked || undefined}>
                    <span>
                      {agentLabel(a.role)}
                      <small>{row ? `${approx(row.usedMicroUsd)} used` : "nothing used"}</small>
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={a.step_cap_micro_usd / 1000000}
                      max={100}
                      step={0.1}
                      value={caps[a.role] ?? 0}
                      onChange={(e) => setCaps({ ...caps, [a.role]: Number(e.target.value) })}
                    />
                  </label>
                );
              })}
            </div>
            <Disclosure>
              <summary>Advanced · response length</summary>
              <label>
                Output room for each response
                <Select value={tokens} onChange={(e) => setTokens(Number(e.target.value))}>
                  <option value={16384}>16,384 tokens · standard</option>
                  <option value={32768}>32,768 tokens · longer responses (higher reservations)</option>
                </Select>
              </label>
            </Disclosure>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button variant={canContinue ? "outline" : "default"} disabled={busy || invalid || unchanged} onClick={() => void save(false)}>
                Save
              </Button>
              {canContinue && (
                <Button disabled={busy || invalid} onClick={() => void save(true)}>
                  <Play size={14} />
                  Save and continue
                </Button>
              )}
            </div>
            {invalid && <small role="alert">Limits can only increase, up to $100.</small>}
            {canContinue && <small>Continue retries the stopped request once; it can incur a new charge. Reviews are never skipped.</small>}
            {data.limits.history.length > 0 && (
              <Disclosure>
                <summary>Limit changes · {data.limits.history.length}</summary>
                {data.limits.history.map((revision) => (
                  <p key={revision.id} className={styles.limitNote}>
                    {money(Number(revision.previous_run_cap))} → {money(Number(revision.run_cap))} · {new Date(revision.created_at).toLocaleString("en-GB")}
                    {revision.continue_run ? " · continuation authorized" : ""}
                  </p>
                ))}
              </Disclosure>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The one action for a stopped preview: price first, then exactly the limit increases it needs. */
export function PreviewContinuation({
  quote,
  heldMicroUsd,
  busy,
  command,
}: {
  quote: NonNullable<GuidedRunView["assemblyContinuation"]>;
  heldMicroUsd: number;
  busy: boolean;
  command: Command;
}) {
  const pending = useRef<{ quoteId: string; id: string } | null>(null);
  async function proceed() {
    if (pending.current?.quoteId !== quote.quoteId) pending.current = { quoteId: quote.quoteId, id: crypto.randomUUID() };
    if (
      await command({
        action: "continueAssembly",
        requestId: pending.current.id,
        jobId: quote.jobId,
        attemptId: quote.attemptId,
        quoteId: quote.quoteId,
        expectedVersion: quote.expectedVersion,
        maxCostMicroUsd: quote.reservationMicroUsd,
        runCapMicroUsd: quote.runCapMicroUsd,
        agentCapMicroUsd: quote.agentCapMicroUsd,
      })
    )
      pending.current = null;
  }
  const replace = quote.mode === "replace";
  const label = quote.needsLimitIncrease ? "Continue anyway" : replace ? "Send corrected request" : "Retry";
  return (
    <div className={styles.continueCard}>
      <div>
        <strong>
          Next attempt ≈ {approx(quote.typicalMicroUsd)}
          <small> · holds up to {approx(quote.reservationMicroUsd)} while it runs</small>
        </strong>
        <small>
          {quote.typicalBasis === "history"
            ? "Typical cost from earlier confirmed previews with this model."
            : "Estimate: full input plus a typical-length response."}{" "}
          You pay the actual usage; the hold is released when it settles.
        </small>
      </div>
      {replace && (
        <p className={styles.replaceNote}>
          Resending the saved request would repeat the same failure. This sends a new request in the current, simplified response format
          {quote.fromProtocol ? ` (replaces ${quote.fromProtocol})` : ""}; your saved planning, copy and media stay the same.
        </p>
      )}
      {quote.needsLimitIncrease && (
        <ul>
          {quote.agentCapMicroUsd > quote.currentAgentCapMicroUsd && (
            <li>
              Preview assembly allowance {money(quote.currentAgentCapMicroUsd)} → <b>{money(quote.agentCapMicroUsd)}</b>
              <small> ({approx(quote.agentSpentMicroUsd)} already counted)</small>
            </li>
          )}
          {quote.runCapMicroUsd > quote.currentRunCapMicroUsd && (
            <li>
              Run budget {money(quote.currentRunCapMicroUsd)} → <b>{money(quote.runCapMicroUsd)}</b>
            </li>
          )}
        </ul>
      )}
      <Button disabled={busy || !quote.ready} onClick={() => void proceed()}>
        <Play size={14} />
        {busy ? "Starting…" : `${label} · ≈ ${approx(quote.typicalMicroUsd)}`}
      </Button>
      <small>
        {replace ? "New request. " : `Attempt ${quote.nextAttempt}. `}
        {quote.needsLimitIncrease ? "Authorizes this one request and only the increases above. " : ""}
        {heldMicroUsd > 0 ? `The unconfirmed ${approx(heldMicroUsd)} stays counted. ` : ""}Completed planning is reused.
      </small>
      {!quote.ready && <WorkflowMigration stage="Preview continuation" />}
    </div>
  );
}
