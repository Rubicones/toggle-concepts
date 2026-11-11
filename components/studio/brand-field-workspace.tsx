"use client";
import {Disclosure} from '@/components/ui/disclosure';
import styles from "./brand-field-workspace.module.css";
import { BrandFindingValue } from "./brand-finding-value";
import type { BrandVisualSource } from "@/packages/brand/finding-presentation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Download, Pause, Play, Search, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { studioRequest, useShared } from "@/lib/shared-http";
import { money } from "@/packages/contracts/shared";
import type { BrandAnalysisView, SavedBrandFinding } from "@/packages/brand/field-extraction";
import { singleChoiceFields } from "@/packages/brand/finding-selection";
import { brandAnalysisCanContinue, brandAnalysisNotice } from "@/packages/brand/workspace-metrics";
import type { BrandMaterial } from "@/packages/contracts/brand-intake";
import { BrandFiles, type FileReading } from "./brand-files";
import fx from "./brand-files.module.css";
import { flushCampaignSaves } from "@/lib/use-persisted-draft";
import { WorkflowMigration } from "./brief-workspace";
import { BrandCard, BrandDisagreements, BrandLibraryPicker } from "./brand-card";
import { BrandSheetStrip } from "./brand-sheet";
type IntakeFiles = {
  materials: BrandMaterial[];
  addFiles: ReactNode;
  preparing: number;
  busy: boolean;
  include: (id: string, included: boolean) => void;
  intakeEndpoint: string;
};
// Fields shown in the order an art director reads a brand; any field not listed falls into “More”.
const fieldGroups: { title: string; keys: string[] }[] = [
  { title: "Name & product", keys: ["brandName", "brandDescription", "productIdentity"] },
  { title: "Logo", keys: ["wordmark", "icon", "logoUsage"] },
  { title: "Colour", keys: ["primaryColors", "secondaryColors", "semanticColors"] },
  { title: "Typography", keys: ["displayFonts", "bodyFonts", "monoFonts", "fontLicenses", "typographyRules"] },
  { title: "Voice & copy", keys: ["voice", "tone", "copyRules", "prohibitions", "localization"] },
  { title: "Imagery & motion", keys: ["imagery", "photography", "illustration", "motion", "sound"] },
  { title: "Layout & interface", keys: ["components", "layout", "spacing", "safeArea", "accessibility"] },
];
const colourFields = new Set(["primaryColors", "secondaryColors", "semanticColors"]);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function SectionHead({ n, title, detail, done, aside }: { n: number; title: string; detail?: string; done?: boolean; aside?: ReactNode }) {
  return (
    <header className={fx.sectionHead}>
      <div>
        <h3>
          <i data-done={done || undefined}>{done ? <Check size={13} /> : n}</i>
          {title}
        </h3>
        {detail && <p>{detail}</p>}
      </div>
      {aside}
    </header>
  );
}

export function BrandFieldWorkspace({ campaignId, sourcesReady, onContinue, intake }: { campaignId: string; sourcesReady: boolean; onContinue?: () => void; intake?: IntakeFiles }) {
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
  const submitRequest = useRef<string | null>(null),
    skipped = useRef("");
  async function command(value: unknown, quiet = false) {
    if (!quiet) setBusy(true);
    setMessage("");
    try {
      if (["submit", "prefill"].includes((value as { action: string }).action)) await flushCampaignSaves(campaignId);
      const result = await studioRequest<{ message: string }>(endpoint, "POST", value);
      if (!quiet) setMessage(result.message);
      refresh();
      if ((value as { action: string }).action === "submit") submitRequest.current = null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the brandbook.");
    } finally {
      if (!quiet) setBusy(false);
    }
  }
  // A file switched off while it was being read stops the reading with “source changed”. That file is no longer
  // wanted, so it is skipped automatically and the rest continues; the AD is never asked about it.
  const current = data?.analyses.find((a) => !["completed", "cancelled"].includes(a.status));
  useEffect(() => {
    if (!current || current.status !== "blocked" || current.blocker !== "BRAND_SOURCE_CHANGED") return;
    const key = `${current.id}:${data?.files.filter((f) => f.analysis_id === current.id && f.status !== "completed").length}`;
    if (skipped.current === key) return;
    skipped.current = key;
    void command({ action: "skip", analysisId: current.id }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.status, current?.blocker, data?.files]);
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
  if (data.brandSource)
    return (
      <section className={styles.workspace}>
        <header className="brandbook-heading">
          <div>
            <p className="eyebrow">BRAND FROM THE LIBRARY</p>
            <h2>{data.brandSource.brand}</h2>
            <p>
              This campaign uses the brand prepared in “{data.brandSource.name}”
              {data.submission ? ` (brandbook version ${data.submission.version_no})` : ""}. Files, findings and edits live there.
            </p>
          </div>
        </header>
        {message && <p role="status">{message}</p>}
        <div className="step-footer">
          <div className="step-footer-actions">
            <a className="text-link" href={`/campaigns/${data.brandSource.id}`}>Open that brand</a>
            <Button variant="outline" disabled={busy} onClick={() => void command({ action: "useBrand", sourceCampaignId: null })}>
              Use this campaign’s own files instead
            </Button>
            <Button disabled={busy || !data.submission} onClick={() => { onContinue?.(); router.push(`/campaigns/${campaignId}/brief`); }}>
              Continue to questionnaire
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      </section>
    );
  const active = current,
    latest = active ?? data.analyses[0],
    files = data.files.filter((f) => f.analysis_id === latest?.id),
    count = data.fields.reduce((n, f) => n + f.count, 0),
    completed = files.filter((f) => f.status === "completed").length,
    skippedFiles = files.filter((f) => f.status === "skipped").length,
    cap = chosenCap ?? (latest ? latest.request_cap_micro_usd / 1000000 : 0.03),
    filled = data.fields.filter((f) => f.count > 0).length,
    excludedTotal = data.fields.reduce((n, f) => n + (f.rejected ?? 0), 0),
    continuable = brandAnalysisCanContinue(latest),
    materials = intake?.materials ?? [],
    inUse = materials.filter((m) => m.included && m.state !== "failed" && m.state !== "unsupported");
  // What each file is and how far its reading got (the latest analysis first, then any earlier completed read).
  const roles = new Map((data.materials ?? []).map((m) => [m.id, { role: m.role, sure: m.sure }])),
    reading = new Map<string, FileReading>();
  for (const f of files) reading.set(f.material_id, f);
  for (const f of data.files) if (!reading.has(f.material_id) && f.status === "completed") reading.set(f.material_id, f);
  const unread = inUse.filter((m) => m.state === "ready" && reading.get(m.id)?.status !== "completed").length;
  const visible = data.fields.filter(
    (f) =>
      (filter === "all" || (filter === "populated" && f.count > 0) || (filter === "excluded" && (f.rejected ?? 0) > 0)) &&
      `${f.label} ${f.key}`.toLowerCase().includes(search.toLowerCase()),
  );
  const stopNotice = brandAnalysisNotice(latest, data.usage?.lastRequestOutputLimit);
  const spent = data.usage?.spentMicroUsd ?? data.run?.charged_micro_usd ?? 0,
    budget = data.run?.cap_micro_usd ?? 0;
  const startReading = () =>
    void command({ action: "start", requestId: crypto.randomUUID(), requestCap: Math.round(cap * 1000000), runCap: Math.round(runCap * 1000000) });
  const continueReading = () => void command({ action: "continue", analysisId: latest!.id, requestCap: Math.round(cap * 1000000) });
  // One status line and one action for the whole reading.
  let tone: "idle" | "busy" | "done" | "attention" = "idle",
    title = "",
    detail = "",
    action: ReactNode = null;
  const readButton = (label: string, primary = true) => (
    <Button variant={primary ? "default" : "outline"} disabled={busy || !sourcesReady || !!intake?.busy} onClick={startReading}>
      <Play size={15} /> {label}
    </Button>
  );
  if (intake?.preparing) {
    tone = "busy";
    title = `Preparing ${plural(intake.preparing, "file")}…`;
    detail = "Files are opened on the studio computer first. Reading can start as soon as they are ready.";
    action = readButton(latest ? "Read new files" : "Read my brandbook");
  } else if (latest?.status === "active") {
    tone = "busy";
    title = `Reading ${Math.min(completed + skippedFiles + 1, files.length)} of ${plural(files.length, "file")}`;
    detail = "Findings appear below as each file is read. You can leave this page; reading continues.";
    action = (
      <Button variant="outline" disabled={busy} onClick={() => void command({ action: "pause", analysisId: latest.id })}>
        <Pause size={15} /> Pause
      </Button>
    );
  } else if (latest?.status === "blocked" && latest.blocker === "BRAND_SOURCE_CHANGED") {
    tone = "busy";
    title = "Skipping a file you switched off…";
    detail = "Reading continues with the remaining files.";
  } else if (latest?.status === "unknown") {
    tone = "attention";
    title = "The last request didn’t confirm";
    detail = "It is not repeated automatically, so nothing is charged twice. Everything found so far is saved — you can continue to the questionnaire.";
  } else if (latest && ["paused", "cancelled", "budget_blocked", "blocked"].includes(latest.status)) {
    tone = "attention";
    title =
      stopNotice?.title ??
      (latest.status === "paused"
        ? "Reading paused"
        : latest.status === "cancelled"
          ? "Reading stopped"
          : latest.status === "budget_blocked"
            ? "The reading budget is used up"
            : latest.blocker === "NO_NEW_FINDINGS"
              ? "A part of a file added nothing new"
              : "A file couldn’t be read");
    detail =
      stopNotice?.detail ??
      (latest.status === "budget_blocked"
        ? "Raise the budget in Settings below, or continue to the questionnaire with what was found."
        : latest.blocker === "NO_NEW_FINDINGS"
          ? "Continue to move on to the next part."
          : latest.status === "blocked"
            ? `${humanize(latest.blocker)}. Skip it to read the rest; everything found so far is saved.`
            : "Continue from where it stopped. Everything found so far is saved.");
    action = continuable ? (
      <Button disabled={busy || !data.workspaceReady} onClick={continueReading}>
        <Play size={15} /> Continue reading
      </Button>
    ) : latest.status === "blocked" ? (
      <Button disabled={busy} onClick={() => void command({ action: "skip", analysisId: latest.id })}>
        <SkipForward size={15} /> Skip this file and continue
      </Button>
    ) : null;
  } else if (!materials.length && !latest) {
    title = "Add files to start";
    detail = "Reading starts when you press the button. It costs a few cents and you see the price as it goes.";
  } else if (latest && !unread) {
    tone = "done";
    title = `All ${plural(inUse.length, "file")} read`;
    detail = `${count.toLocaleString()} findings saved.${skippedFiles ? ` ${plural(skippedFiles, "file")} skipped.` : ""} Add more files any time; only new files are read.`;
  } else {
    title = latest ? `${plural(unread, "new file")} to read` : `Ready to read ${plural(inUse.length, "file")}`;
    detail = "Each file is read once and sorted into brand fields. Nothing is sent before you press the button.";
    action = readButton(latest ? "Read new files" : "Read my brandbook");
  }
  const progress = latest?.status === "active" || (latest && tone === "attention") ? (files.length ? Math.round(((completed + skippedFiles) / files.length) * 100) : 0) : null;
  return (
    <div className={styles.workspace}>
      {error && (
        <div className="notice" role="alert">
          <p>{error} Showing the last loaded findings.</p>
          <Button variant="outline" onClick={refresh}>
            Retry loading brand fields
          </Button>
        </div>
      )}
      <section className={fx.section} data-first>
        <SectionHead
          n={1}
          done={inUse.length > 0}
          title="Add your files"
          detail="Switch off anything outdated or unrelated; it is left out completely. File kinds are guessed — change one only if it is wrong."
          aside={materials.length ? <span className={fx.summary}><strong>{inUse.length}</strong>{materials.length - inUse.length ? `in use · ${materials.length - inUse.length} left out` : "in use"}</span> : undefined}
        />
        {intake?.addFiles}
        {!!data.brandOptions?.length && <BrandLibraryPicker options={data.brandOptions} busy={busy} choose={(id) => void command({ action: "useBrand", sourceCampaignId: id })} />}
        {intake && materials.length > 0 && (
          <BrandFiles
            materials={materials}
            roles={roles}
            reading={reading}
            intakeEndpoint={intake.intakeEndpoint}
            fieldsEndpoint={endpoint}
            busy={busy || intake.busy}
            onInclude={intake.include}
            onRole={(id, role) => void command({ action: "setRole", materialId: id, role })}
          />
        )}
      </section>
      <section className={fx.section}>
        <SectionHead n={2} done={tone === "done"} title="Read the brandbook" />
        <div className={fx.reader} data-tone={tone}>
          <div>
            <div className={fx.readerTitle}>
              <i />
              {title}
            </div>
            {detail && <p className={fx.readerDetail}>{detail}</p>}
            {progress !== null && (
              <div className={fx.readerBar}>
                <b style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
          <div className={fx.readerSide}>
            {action && <div className={fx.readerActions}>{action}</div>}
            {(spent > 0 || budget > 0) && (
              <span className={fx.cost} title={`${money(data.usage?.reservedMicroUsd ?? 0)} reserved for requests in flight`}>
                Spent {money(spent)}
                {budget ? ` of ${money(budget)}` : ""}
              </span>
            )}
          </div>
          <Disclosure className={fx.settings}>
            <summary>Settings</summary>
            <div className={fx.settingsBody}>
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
                  Reading budget, USD
                  <input type="number" min="0.01" max="10" step="0.01" value={runCap} onChange={(e) => setRunCap(Number(e.target.value))} />
                </label>
              )}
            </div>
            <p className="muted">Each request must fit the price allowance and the budget. Previous charges stay recorded.</p>
            {active && active.status !== "unknown" && (
              <Button variant="outline" disabled={busy} onClick={() => void command({ action: "cancel", analysisId: active.id })}>
                Stop remaining work
              </Button>
            )}
          </Disclosure>
        </div>
        {!data.workspaceReady ? <WorkflowMigration stage="Brandbook workspace" /> : !data.updatesReady && <WorkflowMigration stage="Brandbook updates" />}
        {message && (
          <p className="brandbook-message" role="status">
            {message}
          </p>
        )}
      </section>
      {count > 0 && (
        <section className={fx.section}>
          <SectionHead
            n={3}
            title="Check your brand"
            detail="This is what the agents receive. Edit or exclude anything wrong. Anything missing is designed by the agents."
            aside={
              <span className={fx.summary}>
                <strong>
                  {filled}/{data.fields.length}
                </strong>
                fields found{excludedTotal ? ` · ${excludedTotal} excluded` : ""}
              </span>
            }
          />
          {!!data.decisions?.length && (
            <BrandDisagreements
              decisions={data.decisions}
              fields={data.fields}
              busy={busy}
              keep={(o) => void command({ action: "review", findingId: o.findingId, expectedVersion: o.version, decision: "keep", editedValue: null })}
            />
          )}
          <BrandCard
            endpoint={endpoint}
            busy={busy}
            review={(finding, value) => command({ action: "review", findingId: finding.findingId, expectedVersion: finding.version, decision: "keep", editedValue: value })}
          />
          <div className="brandbook-field-toolbar">
            <div>
              <h3>Every field</h3>
            </div>
            <label className="brandbook-search">
              <Search size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a field…" aria-label="Search brand fields" />
            </label>
          </div>
          <div className="brandbook-filter-row" aria-label="Filter brand fields">
            {[
              ["populated", `Found (${filled})`],
              ["all", `All (${data.fields.length})`],
              ["excluded", "With exclusions"],
            ].map(([key, label]) => (
              <button type="button" aria-pressed={filter === key} key={key} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          {[...fieldGroups, { title: "More", keys: data.fields.map((f) => f.key).filter((k) => !fieldGroups.some((g) => g.keys.includes(k))) }].map((group) => {
            const list = visible.filter((f) => group.keys.includes(f.key)).sort((a, b) => group.keys.indexOf(a.key) - group.keys.indexOf(b.key));
            if (!list.length) return null;
            return (
              <div key={group.title} className="brandbook-group">
                <h4 className="brandbook-group-title">{group.title}</h4>
                <div className="brandbook-fields">
                  {list.map((field) => (
                    <Fragment key={field.key}>
                      <article className={`brandbook-field ${open === field.key ? "is-open" : ""} ${field.count ? "" : "is-empty"}`}>
                        <button
                          id={`brand-field-toggle-${field.key}`}
                          className="brandbook-field-toggle"
                          type="button"
                          aria-expanded={open === field.key}
                          aria-controls={`brand-field-${field.key}`}
                          onClick={() => setOpen(open === field.key ? null : field.key)}
                        >
                          <span>
                            <strong>{field.label}</strong>
                            <FieldPreview field={field} />
                            <span>
                              {field.count
                                ? `${plural(field.count, "finding")}${singleChoiceFields.has(field.key) && field.kept ? " · 1 chosen" : ""}${field.rejected ? ` · ${field.rejected} excluded` : ""}`
                                : "Not found · the agents will design it"}
                            </span>
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
                              Close
                            </Button>
                          </header>
                          <FindingList endpoint={endpoint} field={field.key} merge={field.merge} onChanged={refresh} />
                        </section>
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
            );
          })}
          {!visible.length && (
            <p className="brandbook-empty">
              No fields match this filter.
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
          <BrandSheetStrip endpoint={endpoint} busy={busy} build={() => command({ action: "buildSheet" })} />
        </section>
      )}
      <div className="step-footer">
        <p>
          {data.submission
            ? `Saved as version ${data.submission.version_no}. Continuing saves your latest changes.`
            : count
              ? `${(count - excludedTotal).toLocaleString()} findings in use.`
              : "Add your brand files so we can find the logo, colours and fonts."}
        </p>
        <div className="step-footer-actions">
          {data.submission && (
            <a href={`${endpoint}?submission=${data.submission.id}`} download className="text-link">
              <Download size={14} /> Download
            </a>
          )}
          <a href={`/api/studio/campaigns/${campaignId}/brand-export`} download className="text-link" title="Everything the brandbook reading produced, as one JSON file">
            <Download size={14} /> Export JSON
          </a>
          <Button disabled={busy || count === 0 || !data.workspaceReady || !data.updatesReady} onClick={() => void continueToBrief()}>
            Continue to questionnaire
            <ArrowRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
const humanize = (code: string | null) => (code ?? "Review needed").replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
/** What a field holds, before opening it: swatches for colours, the first statement otherwise. */
function FieldPreview({ field }: { field: BrandAnalysisView["fields"][number] }) {
  const values = field.preview ?? [];
  if (!values.length) return null;
  if (colourFields.has(field.key))
    return (
      <span className="brandbook-field-swatches" aria-hidden>
        {values.slice(0, 8).map((hex) => (
          <i key={hex} style={{ background: hex }} title={hex} />
        ))}
      </span>
    );
  return <span className="brandbook-field-preview">{values[0]}</span>;
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
    next = extra ? extra.next : data?.next,
    single = singleChoiceFields.has(field),
    picked = single && all.some((f) => f.decision === "keep");
  return (
    <section className={`brandbook-finding-list ${["primaryColors", "secondaryColors", "semanticColors"].includes(field) ? "is-palette" : ""}`}>
      <p>
        {single
          ? picked
            ? "Only the selected option is used."
            : "Press “Use this” on the one to use. If nothing is selected, every option found is used."
          : merge === "array"
            ? "All options found are used. Exclude the ones that don't fit."
            : "Statements from all your files. Exclude anything wrong or outdated."}
      </p>
      {error && <p role="alert">{error}</p>}
      {merge === "concat" && (
        <Disclosure>
          <summary>Combined statements that will be used</summary>
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
          single={single}
          unused={picked && f.decision === "unreviewed"}
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
  single,
  unused,
  onSaved,
}: {
  finding: SavedBrandFinding;
  endpoint: string;
  sources: BrandVisualSource[];
  single: boolean;
  unused: boolean;
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
    <article className={`brandbook-finding is-${f.decision === "keep" && !single ? "unreviewed" : f.decision}${unused ? " is-unused" : ""}`}>
      {f.decision === "reject" && <Badge variant="outline">Excluded</Badge>}
      {single && f.decision === "keep" && <Badge variant="blue">Selected</Badge>}
      {unused && <Badge variant="outline">Not used</Badge>}
      <BrandFindingValue finding={f} endpoint={endpoint} sources={sources} />
      <small title={f.locator}>
        From {f.material?.relative_path ?? "a source file"}
        {f.evidence === "inferred" ? " · inferred" : ""}
      </small>
      <div className="data-heading-actions">
        {single && f.decision !== "reject" && (
          <Button variant={f.decision === "keep" ? "default" : "outline"} disabled={busy} onClick={() => void save(f.decision === "keep" ? "unreviewed" : "keep")}>
            {f.decision === "keep" ? "Selected · undo" : "Use this"}
          </Button>
        )}
        {f.decision === "reject" ? (
          <Button variant="outline" disabled={busy} onClick={() => void save("unreviewed")}>
            Include again
          </Button>
        ) : (
          <Button variant="outline" disabled={busy} onClick={() => void save("reject")}>
            Exclude
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
