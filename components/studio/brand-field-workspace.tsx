"use client";
import {Disclosure} from '@/components/ui/disclosure';
import styles from "./brand-field-workspace.module.css";
import { BrandFindingValue } from "./brand-finding-value";
import type { BrandVisualSource } from "@/packages/brand/finding-presentation";
import { Fragment, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Download, FileText, Pause, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { studioRequest, useShared } from "@/lib/shared-http";
import { money } from "@/packages/contracts/shared";
import type { BrandAnalysisView, SavedBrandFinding } from "@/packages/brand/field-extraction";
import { brandAnalysisCanContinue, brandAnalysisNotice } from "@/packages/brand/workspace-metrics";
import { flushCampaignSaves } from "@/lib/use-persisted-draft";
import { WorkflowMigration } from "./brief-workspace";
export function BrandFieldWorkspace({ campaignId, sourcesReady, onContinue }: { campaignId: string; sourcesReady: boolean; onContinue?: () => void }) {
  const router = useRouter();
  const endpoint = `/api/studio/campaigns/${campaignId}/brand-fields`,
    { data, error, refresh } = useShared<BrandAnalysisView>(endpoint),
    [chosenCap, setCap] = useState<number | null>(null),
    [runCap, setRunCap] = useState(0.3),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [open, setOpen] = useState<string | null>(null),
    [filter, setFilter] = useState("populated"),
    [search, setSearch] = useState("");
  const submitRequest = useRef<string | null>(null);
  async function command(value: unknown) {
    setBusy(true);
    setMessage("");
    try {
      if (["submit", "prefill"].includes((value as { action: string }).action)) await flushCampaignSaves(campaignId);
      const result = await studioRequest<{ message: string }>(endpoint, "POST", value);
      setMessage(result.message);
      refresh();
      if ((value as { action: string }).action === "submit") submitRequest.current = null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the brandbook.");
    } finally {
      setBusy(false);
    }
  }
  // Saving the brandbook is free (no AI); it also fills unanswered questionnaire fields.
  async function continueToBrief() {
    setBusy(true);
    setMessage("");
    try {
      await flushCampaignSaves(campaignId);
      submitRequest.current ??= crypto.randomUUID();
      await studioRequest(endpoint, "POST", { action: "submit", requestId: submitRequest.current });
      submitRequest.current = null;
      await studioRequest(endpoint, "POST", { action: "prefill" }).catch(() => undefined);
      onContinue?.();
      router.push(`/campaigns/${campaignId}/brief`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the brandbook.");
    } finally {
      setBusy(false);
    }
  }
  if (error && !data)
    return (
      <div className="notice" role="alert">
        <p>{error}</p>
        <Button variant="outline" onClick={refresh}>
          Retry loading brand fields
        </Button>
      </div>
    );
  if (!data) return <p>Loading brand fields…</p>;
  if (!data.schemaReady) return <WorkflowMigration stage="Incremental brand fields" />;
  const active = data.analyses.find((a) => !["completed", "cancelled"].includes(a.status)),
    latest = active ?? data.analyses[0],
    files = data.files.filter((f) => f.analysis_id === latest?.id),
    count = data.fields.reduce((n, f) => n + f.count, 0),
    completed = files.filter((f) => f.status === "completed").length,
    skipped = files.filter((f) => f.status === "skipped").length,
    cap = chosenCap ?? (latest ? latest.request_cap_micro_usd / 1000000 : 0.03),
    filled = data.fields.filter((f) => f.count > 0).length,
    chosen = data.fields.reduce((n, f) => n + f.kept, 0),
    continuable = brandAnalysisCanContinue(latest);
  const visible = data.fields.filter(
    (f) =>
      (filter === "all" ||
        (filter === "populated" && f.count > 0) ||
        (filter === "review" && (f.unreviewed ?? f.count - f.kept) > 0) ||
        (filter === "chosen" && f.kept > 0)) &&
      `${f.label} ${f.key}`.toLowerCase().includes(search.toLowerCase()),
  );
  const stopNotice = brandAnalysisNotice(latest, data.usage?.lastRequestOutputLimit);
  const staleCancelled = latest?.status === "cancelled",
    blocked = latest?.status === "blocked",
    status =
      latest?.status === "active"
        ? "Reading your sources"
        : staleCancelled
          ? "Work stopped"
          : latest?.status === "completed"
            ? "Sources processed"
            : latest?.status === "budget_blocked"
              ? "Budget needs attention"
              : latest?.status === "paused"
                ? "Work paused"
                : blocked
                  ? (stopNotice?.title ?? "Review needed")
                  : latest?.status === "unknown"
                    ? "Last request unconfirmed"
                    : "Ready to build your brandbook";
  return (
    <section className={styles.workspace}>
      {error && (
        <div className="notice" role="alert">
          <p>{error} Showing the last loaded findings.</p>
          <Button variant="outline" onClick={refresh}>
            Retry loading brand fields
          </Button>
        </div>
      )}
      <header className="brandbook-heading">
        <div>
          <p className="eyebrow">CHOOSE WHAT FITS</p>
          <h2>Pick your brand, field by field.</h2>
          <p>Open a field and press “Use this” on what fits. Undecided fields are fine.</p>
        </div>
        <div className="brandbook-total">
          <strong>
            {filled}
            <span>/28</span>
          </strong>
          <small>fields found · {chosen} choices made</small>
        </div>
      </header>
      <div className="brandbook-overview">
        <section className="brandbook-work-card">
          <div className="brandbook-status">
            <span className={`brandbook-status-dot ${latest?.status === "active" ? "is-active" : ""}`} />
            {status}
          </div>
          <h3>{count ? `${count.toLocaleString()} findings from your files` : "Nothing read yet"}</h3>
          <p>
            {staleCancelled
              ? "Continue from the saved position. Files you skipped stay skipped."
              : blocked && latest?.blocker === "NO_NEW_FINDINGS"
                ? "The last pass found only existing items. Continue to the next part."
                : stopNotice
                  ? stopNotice.detail
                  : latest?.status === "budget_blocked"
                    ? "Your findings are safe. Check the request allowance and remaining budget before continuing."
                    : count
                      ? "Every finding is saved. New files are read when you press the button."
                      : "We read each file and sort what we find into brand fields."}
          </p>
          <div className="data-heading-actions">
            {continuable ? (
              <Button
                disabled={busy || !data.workspaceReady}
                onClick={() => void command({ action: "continue", analysisId: latest!.id, requestCap: Math.round(cap * 1000000) })}
              >
                <Play size={15} />
                Continue work
              </Button>
            ) : !active ? (
              <Button
                disabled={busy || !sourcesReady}
                onClick={() =>
                  void command({ action: "start", requestId: crypto.randomUUID(), requestCap: Math.round(cap * 1000000), runCap: Math.round(runCap * 1000000) })
                }
              >
                <Play size={15} />
                {latest ? "Read new files" : "Read my brandbook"}
              </Button>
            ) : (
              <Badge variant="outline">Review needed</Badge>
            )}
            {latest?.status === "active" && (
              <Button variant="outline" disabled={busy} onClick={() => void command({ action: "pause", analysisId: latest.id })}>
                <Pause size={15} />
                Pause
              </Button>
            )}
          </div>
          <Disclosure className="brandbook-settings">
            <summary>
              Processing settings
              <ChevronDown size={14} />
            </summary>
            <div className="studio-form">
              <label>
                Maximum price per request, USD
                <input
                  type="number"
                  min="0.0001"
                  max="10"
                  step="0.01"
                  value={cap}
                  disabled={active?.status === "active" || active?.status === "unknown" || busy}
                  onChange={(e) => setCap(Number(e.target.value))}
                />
              </label>
              {!data.run && (
                <label>
                  New preparation budget, USD
                  <input type="number" min="0.01" max="10" step="0.01" value={runCap} onChange={(e) => setRunCap(Number(e.target.value))} />
                </label>
              )}
            </div>
            <p className="muted">Requests must fit the price allowance and cumulative budget. Previous charges stay recorded.</p>
            <div className="data-heading-actions">
              {active?.status === "blocked" && (
                <Button variant="outline" disabled={busy} onClick={() => void command({ action: "skip", analysisId: active.id })}>
                  Skip this file
                </Button>
              )}
              {active && active.status !== "unknown" && (
                <Button variant="outline" disabled={busy} onClick={() => void command({ action: "cancel", analysisId: active.id })}>
                  Stop remaining work
                </Button>
              )}
            </div>
          </Disclosure>
        </section>
        <BrandBudget data={data} compact />
      </div>
      {!data.workspaceReady ? <WorkflowMigration stage="Brandbook workspace" /> : !data.updatesReady && <WorkflowMigration stage="Brandbook updates" />}
      {message && (
        <p className="brandbook-message" role="status">
          {message}
        </p>
      )}
      {latest?.blocker && !staleCancelled && latest.blocker !== "NO_NEW_FINDINGS" && (
        <p className="notice" role="status">
          {stopNotice ? (
            <>
              <strong>{stopNotice.title}.</strong> {stopNotice.detail}
            </>
          ) : (
            <>
              {latest.status === "unknown"
                ? "The last reading request didn’t confirm whether it finished, so it won’t be repeated automatically. Everything found so far is saved — you can continue to the questionnaire."
                : `${latest.blocker.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}. Everything found so far is saved.`}
            </>
          )}
        </p>
      )}
      {latest && (
        <Disclosure className="brandbook-files">
          <summary>
            <FileText size={17} />
            <strong>
              {completed}/{files.length} files processed
            </strong>
            <span>
              {skipped ? `${skipped} skipped · ` : ""}
              {count.toLocaleString()} findings saved
            </span>
            <ChevronDown size={16} />
          </summary>
          <div>
            {files.map((f) => (
              <div className="brandbook-file" key={f.id}>
                <span>{f.filename}</span>
                <small>
                  {f.done}/{f.total} parts
                </small>
                <Badge variant={f.status === "completed" ? "blue" : "outline"}>{f.status.replaceAll("_", " ")}</Badge>
              </div>
            ))}
          </div>
        </Disclosure>
      )}
      <div className="brandbook-field-toolbar">
        <div>
          <h3>Brand fields</h3>
        </div>
        <label className="brandbook-search">
          <Search size={16} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a field…" aria-label="Search brand fields" />
        </label>
      </div>
      <div className="brandbook-filter-row" aria-label="Filter brand fields">
        {[
          ["populated", `Found (${filled})`],
          ["review", "Not decided"],
          ["chosen", "Chosen"],
          ["all", "All fields"],
        ].map(([key, label]) => (
          <button type="button" aria-pressed={filter === key} key={key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}

      </div>
      <div className="brandbook-fields">
        {visible.map((field) => (
          <Fragment key={field.key}>
            <article className={`brandbook-field ${open === field.key ? "is-open" : ""}`}>
              <button
                id={`brand-field-toggle-${field.key}`}
                className="brandbook-field-toggle"
                type="button"
                aria-expanded={open === field.key}
                aria-controls={`brand-field-${field.key}`}
                onClick={() => setOpen(open === field.key ? null : field.key)}
              >
                <span>
                  <small>{field.merge === "array" ? "CANDIDATES" : "ACCUMULATED TEXT"}</small>
                  <strong>{field.label}</strong>
                  <span>{field.count ? `${field.count} ${field.count === 1 ? "finding" : "findings"} · ${field.kept} chosen` : "No findings yet"}</span>
                </span>
                <ChevronDown size={19} />
              </button>
            </article>
            {open === field.key && (
              <section
                id={`brand-field-${field.key}`}
                aria-labelledby={`brand-field-toggle-${field.key}`}
                className="brandbook-field-content"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setOpen(null);
                    document.getElementById(`brand-field-toggle-${field.key}`)?.focus();
                  }
                }}
              >
                <header className="brandbook-drawer-heading">
                  <h4>{field.label}</h4>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOpen(null);
                      document.getElementById(`brand-field-toggle-${field.key}`)?.focus();
                    }}
                  >
                    Close findings
                  </Button>
                </header>
                <FindingList endpoint={endpoint} field={field.key} merge={field.merge} onChanged={refresh} />
              </section>
            )}
          </Fragment>
        ))}
      </div>
      {!visible.length && (
        <p className="brandbook-empty">
          {count ? "No fields match this filter." : "Findings will appear here as each file is processed."}
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setSearch("");
            }}
          >
            Show all fields
          </button>
        </p>
      )}
      <div className="step-footer">
        <p>
          {data.submission
            ? `Saved as version ${data.submission.version_no}. Continuing saves your latest choices.`
            : chosen
              ? `${chosen} choices made. You can come back and change them.`
              : "Choose at least the logo, colors and fonts, then continue."}
        </p>
        <div className="step-footer-actions">
          {data.submission && (
            <a href={`${endpoint}?submission=${data.submission.id}`} download className="text-link">
              <Download size={14} /> Download
            </a>
          )}
          <Button disabled={busy || count === 0 || !data.workspaceReady || !data.updatesReady} onClick={() => void continueToBrief()}>
            Continue to questionnaire
            <ArrowRight size={15} />
          </Button>
        </div>
      </div>
    </section>
  );
}
function BrandBudget({ data, compact = false }: { data: BrandAnalysisView; compact?: boolean }) {
  const usage = data.usage,
    cap = data.run?.cap_micro_usd ?? 0,
    spent = usage?.spentMicroUsd ?? data.run?.charged_micro_usd ?? 0,
    reserved = usage?.reservedMicroUsd ?? data.run?.reserved_micro_usd ?? 0,
    available = usage?.availableMicroUsd ?? Math.max(0, cap - spent - reserved),
    width = (amount: number) => (cap ? Math.max(0, Math.min(100, (amount / cap) * 100)) : 0);
  if (compact)
    return (
      <section className="brandbook-budget is-compact" title={`${money(reserved)} reserved for requests in flight`}>
        <span className="eyebrow">READING COST</span>
        <div className="brandbook-budget-title">
          <strong>{money(spent)}</strong>
          <span>{cap ? `of ${money(cap)}` : "spent"}</span>
        </div>
        <div className="brandbook-budget-bar" role="img" aria-label={`Spent ${money(spent)}, reserved ${money(reserved)}, available ${money(available)}`}>
          <i className="is-spent" style={{ width: `${width(spent)}%` }} />
          <i className="is-reserved" style={{ width: `${width(reserved)}%` }} />
          <i className="is-free" style={{ width: `${cap ? width(available) : 100}%` }} />
        </div>
      </section>
    );
  return (
    <section className="brandbook-budget">
      <span className="eyebrow">BUDGET & TOKEN USAGE</span>
      <div className="brandbook-budget-title">
        <strong>{money(spent)}</strong>
        <span>spent {cap ? `of ${money(cap)} run budget` : ""}</span>
      </div>
      <div className="brandbook-budget-bar" role="img" aria-label={`Spent ${money(spent)}, reserved ${money(reserved)}, available ${money(available)}`}>
        <i className="is-spent" style={{ width: `${width(spent)}%` }} />
        <i className="is-reserved" style={{ width: `${width(reserved)}%` }} />
        <i className="is-free" style={{ width: `${cap ? width(available) : 100}%` }} />
      </div>
      <div className="brandbook-budget-legend">
        <div>
          <span>
            <i className="is-spent" />
            Spent
          </span>
          <strong>{money(spent)}</strong>
          <small>
            {usage?.unreportedSteps ? "At least " : ""}
            {(usage?.usedTokens ?? 0).toLocaleString()} tokens used
          </small>
        </div>
        <div>
          <span>
            <i className="is-reserved" />
            Reserved
          </span>
          <strong>{money(reserved)}</strong>
          <small>Up to {(usage?.reservedOutputTokens ?? 0).toLocaleString()} output tokens</small>
        </div>
        <div>
          <span>
            <i className="is-free" />
            Remaining
          </span>
          <strong>{money(available)}</strong>
          <small>
            {usage?.availableOutputTokens !== null && usage?.availableOutputTokens !== undefined
              ? `~${usage.availableOutputTokens.toLocaleString()} output tokens across requests`
              : "Token estimate unavailable"}
          </small>
        </div>
      </div>
      <p>
        {(usage?.inputTokens ?? 0).toLocaleString()} input + {(usage?.outputTokens ?? 0).toLocaleString()} output tokens reported. Remaining-token estimate is
        purchasing power across future requests, not the limit of one response; future inputs also cost money.
        {usage?.unreportedSteps
          ? ` ${usage.unreportedSteps} paid ${usage.unreportedSteps === 1 ? "request has" : "requests have"} unreported token usage.`
          : ""}
      </p>
    </section>
  );
}
function FindingList({ endpoint, field, merge, onChanged }: { endpoint: string; field: string; merge: "array" | "concat"; onChanged: () => void }) {
  const { data, error, refresh } = useShared<{ findings: SavedBrandFinding[]; next: number | null; visualSources?: BrandVisualSource[] }>(
      `${endpoint}?field=${field}`,
    ),
    [extra, setExtra] = useState<{ items: SavedBrandFinding[]; next: number | null } | null>(null),
    [patches, setPatches] = useState<Record<string, SavedBrandFinding>>({}),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false);
  const all = [...(data?.findings ?? []), ...(extra?.items ?? [])].map((f) => (patches[f.id]?.version > f.version ? patches[f.id] : f)),
    next = extra ? extra.next : data?.next;
  return (
    <section className={`brandbook-finding-list ${["primaryColors", "secondaryColors", "semanticColors"].includes(field) ? "is-palette" : ""}`}>
      <p>
        {merge === "array" ? "Use the option(s) that are right. The rest are kept but ignored." : "Statements from all your files. Exclude anything wrong or outdated."}
      </p>
      {error && <p role="alert">{error}</p>}
      {merge === "concat" && (
        <Disclosure>
          <summary>Combined statements currently loaded</summary>
          <div style={{ whiteSpace: "pre-wrap" }}>
            {all
              .filter((f) => f.decision !== "reject")
              .map((f) => f.edited_value ?? f.value)
              .join("\n\n")}
          </div>
        </Disclosure>
      )}
      {!data && !error && <p role="status">Loading findings…</p>}
      {data && !all.length && <p>No findings in this field yet. You can still submit your current brandbook.</p>}
      {all.map((f) => (
        <FindingEditor
          key={`${f.id}-${f.version}`}
          finding={f}
          endpoint={endpoint}
          sources={data?.visualSources ?? []}
          onSaved={(value) => {
            setPatches((p) => ({ ...p, [value.id]: value }));
            refresh();
            onChanged();
          }}
        />
      ))}
      {next && (
        <Button
          variant="outline"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const result = await studioRequest<{ findings: SavedBrandFinding[]; next: number | null }>(`${endpoint}?field=${field}&after=${next}`);
              setExtra((previous) => ({ items: [...(previous?.items ?? []), ...result.findings], next: result.next }));
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Could not load findings.");
            } finally {
              setLoading(false);
            }
          }}
        >
          Load more findings
        </Button>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
function FindingEditor({
  finding: f,
  endpoint,
  sources,
  onSaved,
}: {
  finding: SavedBrandFinding;
  endpoint: string;
  sources: BrandVisualSource[];
  onSaved: (f: SavedBrandFinding) => void;
}) {
  const [value, setValue] = useState(f.edited_value ?? f.value),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save(decision: SavedBrandFinding["decision"]) {
    setBusy(true);
    try {
      const result = await studioRequest<{ version: number }>(endpoint, "POST", {
        action: "review",
        findingId: f.id,
        expectedVersion: f.version,
        decision,
        editedValue: value === f.value ? null : value,
      });
      onSaved({ ...f, decision, edited_value: value === f.value ? null : value, version: result.version });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={`brandbook-finding is-${f.decision}`}>
      {f.decision !== "unreviewed" && <Badge variant={f.decision === "keep" ? "blue" : "outline"}>{f.decision === "keep" ? "Used" : "Excluded"}</Badge>}
      <BrandFindingValue finding={f} endpoint={endpoint} sources={sources} />
      <small title={f.locator}>
        From {f.material?.relative_path ?? "a source file"}
        {f.evidence === "inferred" ? " · inferred" : ""}
      </small>
      <div className="data-heading-actions">
        <Button variant={f.decision === "keep" ? "default" : "outline"} disabled={busy} onClick={() => void save("keep")}>
          Use this
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void save("reject")}>
          Exclude
        </Button>
        {f.decision !== "unreviewed" && (
          <Button variant="ghost" disabled={busy} onClick={() => void save("unreviewed")}>
            Undo
          </Button>
        )}
      </div>
      <Disclosure>
        <summary>Edit wording</summary>
        <label className="brandbook-edit-label">
          Working wording
          <textarea rows={4} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <Button disabled={busy || !value.trim()} onClick={() => void save(f.decision)}>
          Save wording
        </Button>
        <p style={{ whiteSpace: "pre-wrap" }}>Original: {f.value}</p>
      </Disclosure>
      <p role="status">{message}</p>
    </article>
  );
}
