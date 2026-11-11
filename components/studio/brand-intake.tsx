"use client";
import { Disclosure } from "@/components/ui/disclosure";
import { BrandFieldWorkspace } from "./brand-field-workspace";
import { usePersistedDraft, flushCampaignSaves } from "@/lib/use-persisted-draft";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { FolderPlus, Plus, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { studioRequest, useShared } from "@/lib/shared-http";
import { money } from "@/packages/contracts/shared";
import { brandFileExtensions, type BrandIntakeView } from "@/packages/contracts/brand-intake";
import { uploadBrandFiles, type BrandUploadInput, type BrandUploadItem } from "@/lib/brand-upload";
import { SaveStatus } from "./save-status";
import { WorkflowMigration } from "./brief-workspace";
import styles from "./brand-files.module.css";

async function droppedFiles(items: DataTransferItemList): Promise<BrandUploadInput[]> {
  const output: BrandUploadInput[] = [];
  async function visit(entry: FileSystemEntry, path = ""): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((yes, no) => (entry as FileSystemFileEntry).file(yes, no));
      output.push({ file, path: path + file.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const entries = await new Promise<FileSystemEntry[]>((yes, no) => reader.readEntries(yes, no));
        if (!entries.length) break;
        for (const item of entries) await visit(item, path + entry.name + "/");
      }
    }
  }
  const captured = Array.from(items).map((item) => ({ entry: item.webkitGetAsEntry?.(), file: item.getAsFile() }));
  for (const item of captured) {
    if (item.entry) await visit(item.entry);
    else if (item.file) output.push({ file: item.file, path: item.file.name });
  }
  return output;
}
const picked = (list: FileList | null) => Array.from(list ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name }));

/** Step 1: add the brand files, read them, check the brand. Everything that can happen on its own does. */
export function BrandIntake({ campaignId, kitVersion = 0, onKitApplied }: { campaignId: string; kitVersion?: number; onKitApplied?: () => void }) {
  const endpoint = `/api/studio/campaigns/${campaignId}/brand-intake`,
    { data, error, refresh } = useShared<BrandIntakeView>(endpoint),
    [busy, setBusy] = useState(false),
    [hover, setHover] = useState(false),
    [message, setMessage] = useState(""),
    [writing, setWriting] = useState(false),
    [uploads, setUploads] = useState<BrandUploadItem[]>([]),
    [uploading, setUploading] = useState(false),
    [retryable, setRetryable] = useState<BrandUploadInput[]>([]),
    files = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null),
    // Files the page has already handled on its own: one automatic re-read, then left out instead of blocking.
    autoRetry = useRef(new Map<string, "sent" | "seen">()),
    autoExcluded = useRef(new Set<string>());
  const notesDraft = usePersistedDraft({
      key: `${endpoint}:notes`,
      initial: data?.notesDraft ?? "",
      initialVersion: data?.campaignVersion ?? 0,
      label: "Brand intake notes",
      href: `/campaigns/${campaignId}/brand-kit`,
      write: async (value, _version, previous) => {
        const saved = await studioRequest<{ version: number }>(`/api/studio/campaigns/${campaignId}`, "PATCH", {
          document: { brandIntakeNotes: value },
          previousDocument: { brandIntakeNotes: previous },
        });
        return saved.version;
      },
    }),
    notes = notesDraft.value,
    setNotes = notesDraft.setValue;
  async function upload(incoming: BrandUploadInput[]) {
    if (!incoming.length) return [];
    setUploading(true);
    setMessage("");
    setRetryable([]);
    try {
      const items = await uploadBrandFiles(endpoint, incoming, { onChange: setUploads });
      refresh();
      const failed = items.filter((item) => item.state === "failed"),
        saved = items.length - failed.length;
      setRetryable(incoming.filter((input) => failed.some((f) => f.path === input.path)));
      setMessage(
        !items.length
          ? "No files were added. Hidden system files are skipped."
          : failed.length
            ? `${saved} of ${items.length} files added.`
            : `${saved} ${saved === 1 ? "file" : "files"} added. They are prepared on the studio computer, then you can read them.`,
      );
      if (!failed.length) setUploads([]);
      return items;
    } finally {
      setUploading(false);
    }
  }
  async function addNotes() {
    setBusy(true);
    try {
      await notesDraft.save();
      const file = new File([notes], `Brand notes ${Date.now()}.txt`, { type: "text/plain" });
      const items = await upload([{ file, path: file.name }]);
      if (items.every((item) => item.state === "saved")) {
        setNotes("");
        setWriting(false);
        await notesDraft.save();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save the text.");
    } finally {
      setBusy(false);
    }
  }
  async function command(payload: unknown) {
    setBusy(true);
    setMessage("");
    try {
      let command = payload as Record<string, unknown>;
      if (command.action === "apply") {
        const versions = await flushCampaignSaves(campaignId),
          key = `/api/studio/campaigns/${campaignId}/${command.target === "brief" ? "brief" : "brand-kit"}`;
        command = { ...command, expectedVersion: versions[key] ?? command.expectedVersion };
      }
      const result = await studioRequest<{ message: string }>(endpoint, "POST", command);
      if (!["include", "retry", "resume"].includes(String(command.action))) setMessage(result.message);
      refresh();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Brand intake failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  /** Background housekeeping: no message, no busy state. */
  async function quietly(payload: Record<string, unknown>) {
    try {
      await studioRequest(endpoint, "POST", payload);
      return true;
    } catch {
      return false;
    } finally {
      refresh();
    }
  }
  // A file that fails to open is re-read once; if it fails again (or its format cannot be read) it is left out, so
  // reading the rest of the brandbook is never blocked by it. The AD can switch it back on.
  const materialStates = data?.materials.map((m) => `${m.id}:${m.state}:${m.included}`).join(",") ?? "";
  useEffect(() => {
    for (const m of data?.materials ?? []) {
      if (!m.included || autoExcluded.current.has(m.id)) continue;
      const retry = autoRetry.current.get(m.id);
      if (m.state === "failed" && !retry) {
        autoRetry.current.set(m.id, "sent");
        void quietly({ action: "retry", materialId: m.id }).then((ok) => {
          if (!ok) autoRetry.current.set(m.id, "seen");
        });
      } else if (retry === "sent" && m.state !== "failed") autoRetry.current.set(m.id, "seen");
      else if (m.state === "unsupported" || (m.state === "failed" && retry === "seen")) {
        autoExcluded.current.add(m.id);
        void quietly({ action: "include", materialId: m.id, included: false });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialStates]);
  if (error && !data)
    return (
      <section className="detail-panel">
        <p role="alert">{error}</p>
        <Button variant="outline" onClick={refresh}>
          Retry loading brand materials
        </Button>
      </section>
    );
  if (!data)
    return (
      <section className="detail-panel">
        <p>Loading your brand materials…</p>
      </section>
    );
  if (!data.schemaReady) return <WorkflowMigration stage="Brand intake" />;
  const included = data.materials.filter((m) => m.included),
    ready = included.filter((m) => m.state === "ready"),
    preparing = included.filter((m) => m.state === "uploaded" || m.state === "processing").length,
    working = data.proposals.some((p) => ["reserved", "running"].includes(p.status)),
    latest = data.proposals.find((p) => p.proposal && p.current),
    proposal = latest?.proposal,
    recoverable = data.proposals.find((p) => p.recoverable && p.current);
  const dropFiles = (list: DataTransferItemList) => {
    if (uploading) return;
    void droppedFiles(list)
      .then((items) => upload(items))
      .catch((e) => setMessage(e instanceof Error ? e.message : "Could not read the dropped files."));
  };
  const addFiles = (
    <AddFiles
      empty={!data.materials.length}
      uploading={uploading}
      busy={busy}
      uploads={uploads}
      message={message}
      retryable={retryable.length}
      writing={writing}
      notes={notes}
      notesStatus={<SaveStatus {...notesDraft} retry={notesDraft.save} />}
      setNotes={setNotes}
      setWriting={setWriting}
      chooseFiles={() => files.current?.click()}
      chooseFolder={() => {
        folder.current?.setAttribute("webkitdirectory", "");
        folder.current?.click();
      }}
      retry={() => void upload(retryable)}
      addNotes={() => void addNotes()}
      pasteFiles={(list) => void upload(list)}
      stuck={preparing > 0 && !uploading}
      resume={() => void command({ action: "resume" })}
    />
  );
  return (
    <section
      className={`detail-panel brand-intake ${styles.intake}`}
      data-dragging={hover || undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setHover(false);
        dropFiles(e.dataTransfer.items);
      }}
    >
      {error && (
        <div className="notice" role="alert">
          <p>{error} Showing the last loaded brand materials.</p>
          <Button variant="outline" onClick={refresh}>
            Retry loading brand materials
          </Button>
        </div>
      )}
      <div className={styles.stepHead}>
        <p className="eyebrow">STEP 1 OF 3 · BRAND</p>
        <h2>Your brand</h2>
        <p>Drop the brand folder — guidelines, logos, fonts, product shots. We sort the files, read them and show the brand back to you.</p>
      </div>
      {data.a1Accepted && <p className="notice">The brand for this run is approved. New files are saved for later runs.</p>}
      <input
        ref={files}
        hidden
        type="file"
        multiple
        accept={brandFileExtensions.map((e) => "." + e).join(",")}
        onChange={(e) => {
          void upload(picked(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={folder}
        hidden
        type="file"
        multiple
        onChange={(e) => {
          void upload(picked(e.target.files));
          e.target.value = "";
        }}
      />
      <BrandFieldWorkspace
        campaignId={campaignId}
        sourcesReady={ready.length > 0 && ready.length === included.length}
        onContinue={onKitApplied}
        intake={{
          materials: data.materials,
          addFiles,
          preparing,
          busy: busy || uploading,
          include: (id, value) => void command({ action: "include", materialId: id, included: value }),
          intakeEndpoint: endpoint,
        }}
      />
      {recoverable && data.recoveryReady && (
        <Button variant="outline" disabled={busy || working} onClick={() => void command({ action: "revalidate", stepId: recoverable.id })}>
          Recover earlier complete response · free
        </Button>
      )}
      {data.proposals.length > 0 && (
        <Disclosure className="brand-legacy">
          <summary>Earlier whole-kit builds ({data.proposals.length})</summary>
          {proposal && latest && (
            <section className="brand-intake-result">
              <Badge variant="blue">Sourced proposal · ready for your review</Badge>
              <p>{proposal.summary}</p>
              <p>
                {proposal.kit.rules.length} sourced rules · {proposal.sourceCoverage.length} sources · {proposal.questions.length} open questions
                {latest.recovered ? " · recovered locally from saved output" : ""}
              </p>
              <Disclosure open>
                <summary>Creative direction & boundaries</summary>
                <p>{proposal.kit.instructions}</p>
                <h4>Boundaries</h4>
                <p>{proposal.kit.boundaries}</p>
                <h4>Font use & rights to verify</h4>
                <p>{proposal.kit.fontRights}</p>
              </Disclosure>
              {proposal.kit.conflicts.length > 0 && (
                <Disclosure open>
                  <summary>Conflicts to resolve ({proposal.kit.conflicts.length})</summary>
                  <ul>
                    {proposal.kit.conflicts.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </Disclosure>
              )}
              <h3>Brand rules</h3>
              <div className="brand-token-grid">
                {proposal.kit.rules.map((r, i) => (
                  <article key={i}>
                    <span className="eyebrow">
                      {r.category}.{r.key}
                    </span>
                    {r.category === "color" && /^#[a-fA-F0-9]{6,8}$/.test(r.value) && <span className="brand-swatch" style={{ backgroundColor: r.value }} />}
                    <p>{r.value}</p>
                    <Badge variant="outline">{r.status}</Badge>
                    <Disclosure>
                      <summary>Source & rationale</summary>
                      <p>
                        {r.provenance.kind === "proposal"
                          ? "No supplied evidence · agent proposal"
                          : data.materials.find((m) => m.id === r.provenance.sourceId)?.relative_path}{" "}
                        · {r.provenance.locator}
                      </p>
                      <p>{r.reason}</p>
                    </Disclosure>
                  </article>
                ))}
              </div>
              <Disclosure>
                <summary>What was read ({proposal.sourceCoverage.length} sources)</summary>
                {proposal.sourceCoverage.map((source) => (
                  <article key={source.id}>
                    <strong>{data.materials.find((m) => m.id === source.id)?.relative_path}</strong>
                    <p>{source.whatWasRead}</p>
                  </article>
                ))}
              </Disclosure>
              <h3>Already found in your materials</h3>
              {proposal.briefSuggestions.map((s) => (
                <div className="brand-suggestion" key={s.field}>
                  <strong>{s.field.replace(/([A-Z])/g, " $1")}</strong>
                  <Badge variant="outline">{s.status}</Badge>
                  <p>{s.value}</p>
                  <small>
                    {s.reason} · {s.sourceIds.map((id) => data.materials.find((m) => m.id === id)?.filename).join(", ")}
                  </small>
                </div>
              ))}
              <div className="data-heading-actions">
                <Button
                  variant="outline"
                  disabled={busy || data.hasC1 || !proposal.briefSuggestions.length}
                  onClick={() => void command({ action: "apply", target: "brief", stepId: latest.id, expectedVersion: data.briefVersion })}
                >
                  Fill unanswered brief fields
                </Button>
                <Button
                  disabled={busy || !data.hasC1 || data.a1Accepted}
                  onClick={async () => {
                    if (await command({ action: "apply", target: "kit", stepId: latest.id, expectedVersion: kitVersion })) onKitApplied?.();
                  }}
                >
                  Use this kit for A1 review
                </Button>
                <Link className="text-link" href={`/campaigns/${campaignId}/brief`}>
                  Review the brief
                </Link>
              </div>
              <p className="muted">
                Existing brief answers stay intact. Suggestions do not confirm claims, rights, scope or approvals.{" "}
                {!data.hasC1 ? "Your proposed kit stays saved here; submit C1 before A1 review." : ""}
              </p>
              {proposal.questions.length > 0 && (
                <>
                  <h3>Only the questions still missing</h3>
                  <ul>
                    {proposal.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          <Disclosure>
            <summary>Attempts</summary>
            {data.proposals.map((p) => (
              <article key={p.id}>
                <p>
                  {p.status} · {p.cost_micro_usd === null ? "Cost unresolved" : money(p.cost_micro_usd)}
                  {p.current ? "" : " · earlier source pack"}
                  {p.error_code ? ` · ${p.error_code}` : ""}
                  {p.recovered ? " · recovered locally for review" : ""}
                </p>
                {p.recoverable && p.current && data.recoveryReady && (
                  <Button variant="outline" disabled={busy || working} onClick={() => void command({ action: "revalidate", stepId: p.id })}>
                    Recover this saved response · free
                  </Button>
                )}
                {p.status === "succeeded" && !p.proposal && <p>The response did not produce a complete sourced kit for this pack. No kit was manufactured.</p>}
                {p.diagnostic && (
                  <div className="notice" role="status">
                    <strong>{p.diagnostic.code.replaceAll("_", " ")}</strong>
                    <p>{p.diagnostic.message}</p>
                    {p.diagnostic.issues.length > 0 && (
                      <ul>
                        {p.diagnostic.issues.map((issue, i) => (
                          <li key={i}>{issue}</li>
                        ))}
                      </ul>
                    )}
                    <p>Any provider charge above is retained. Another build is a separate paid request.</p>
                  </div>
                )}
                {p.output && (
                  <Disclosure>
                    <summary>Actual output</summary>
                    <pre className="shared-output">{p.output}</pre>
                  </Disclosure>
                )}
              </article>
            ))}
          </Disclosure>
        </Disclosure>
      )}
    </section>
  );
}


type AddFilesProps = {
  empty: boolean;
  uploading: boolean;
  busy: boolean;
  uploads: BrandUploadItem[];
  message: string;
  retryable: number;
  writing: boolean;
  notes: string;
  notesStatus: ReactNode;
  setNotes: (value: string) => void;
  setWriting: (value: boolean) => void;
  chooseFiles: () => void;
  chooseFolder: () => void;
  retry: () => void;
  addNotes: () => void;
  pasteFiles: (files: BrandUploadInput[]) => void;
  stuck: boolean;
  resume: () => void;
};
/** The drop area: large while the brand is empty, a single bar afterwards. Files can be dropped anywhere on the step. */
function AddFiles(p: AddFilesProps) {
  const done = p.uploads.filter((u) => u.state === "saved").length,
    failed = p.uploads.filter((u) => u.state === "failed"),
    retrying = p.uploads.filter((u) => u.state === "retrying").length,
    total = p.uploads.length;
  const actions = (
    <div className={styles.addActions}>
      <Button type="button" variant={p.empty ? "default" : "outline"} disabled={p.uploading} onClick={p.chooseFiles}>
        <Plus size={15} /> Add files
      </Button>
      <Button type="button" variant="outline" disabled={p.uploading} onClick={p.chooseFolder}>
        <FolderPlus size={15} /> Add a folder
      </Button>
      <Button type="button" variant="ghost" disabled={p.busy} onClick={() => p.setWriting(!p.writing)}>
        <Type size={15} /> Write or paste text
      </Button>
    </div>
  );
  return (
    <div className={styles.add}>
      <div
        className={p.empty ? styles.dropBig : styles.dropBar}
        tabIndex={0}
        aria-label="Drop or paste brand files here"
        onPaste={(e) => {
          if (e.clipboardData.files.length) {
            e.preventDefault();
            p.pasteFiles(Array.from(e.clipboardData.files).map((file) => ({ file, path: file.name })));
          } else {
            const text = e.clipboardData.getData("text/plain");
            if (text) {
              e.preventDefault();
              p.setNotes(text.slice(0, 40000));
              p.setWriting(true);
            }
          }
        }}
      >
        <div>
          <strong>{p.empty ? "Drop your brand folder here" : "Drop more files anywhere on this page"}</strong>
          <span>Guidelines (PDF, Word, text) · logos · fonts · product shots · design tokens. Up to 50 MB per file.</span>
        </div>
        {actions}
      </div>
      {p.writing && (
        <div className={styles.notes}>
          <textarea
            rows={5}
            disabled={p.busy}
            maxLength={40000}
            value={p.notes}
            aria-label="Brand text"
            autoFocus
            onChange={(e) => p.setNotes(e.target.value)}
            placeholder="Paste guidelines, the brand story, product facts or links. It is read like any other file."
          />
          <div className={styles.notesFoot}>
            {p.notesStatus}
            <Button type="button" variant="ghost" onClick={() => p.setWriting(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={p.busy || !p.notes.trim()} onClick={p.addNotes}>
              Add to the brand
            </Button>
          </div>
        </div>
      )}
      {total > 0 && p.uploading && (
        <div className={styles.progress} role="status">
          <span>
            Adding {Math.min(done + failed.length + 1, total)} of {total} files…{retrying ? ` ${retrying} retrying automatically.` : ""}
          </span>
          <i>
            <b style={{ width: `${Math.round(((done + failed.length) / total) * 100)}%` }} />
          </i>
        </div>
      )}
      {!p.uploading && failed.length > 0 && (
        <div className={`notice ${styles.failed}`} role="alert">
          <p>
            <strong>
              {failed.length} {failed.length === 1 ? "file was" : "files were"} not added
            </strong>{" "}
            after several automatic attempts.
          </p>
          <ul>
            {failed.slice(0, 6).map((f) => (
              <li key={f.path}>
                {f.path} — {f.error}
              </li>
            ))}
            {failed.length > 6 && <li>and {failed.length - 6} more</li>}
          </ul>
          {p.retryable > 0 && (
            <Button type="button" variant="outline" onClick={p.retry}>
              Try these again
            </Button>
          )}
        </div>
      )}
      {!p.uploading && p.message && !failed.length && <p className={styles.added} role="status">{p.message}</p>}
      {p.stuck && (
        <p className={styles.added}>
          Some files are still being prepared on the studio computer.{" "}
          <button type="button" className="text-link" onClick={p.resume} disabled={p.busy}>
            Restart preparing
          </button>
        </p>
      )}
    </div>
  );
}
