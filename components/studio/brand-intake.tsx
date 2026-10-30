"use client";
import {Disclosure} from '@/components/ui/disclosure';
import { BrandFieldWorkspace } from "./brand-field-workspace";
import { usePersistedDraft, flushCampaignSaves } from "@/lib/use-persisted-draft";
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { studioRequest, useShared, waitForStudio } from "@/lib/shared-http";
import { money } from "@/packages/contracts/shared";
import { brandFileExtensions, brandUploadForm, type BrandIntakeView, type BrandMaterial } from "@/packages/contracts/brand-intake";
import { SaveStatus } from "./save-status";
import { WorkflowMigration } from "./brief-workspace";
type Incoming = { file: File; path: string };
async function droppedFiles(items: DataTransferItemList): Promise<Incoming[]> {
  const output: Incoming[] = [];
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
export function BrandIntake({ campaignId, kitVersion = 0, onKitApplied }: { campaignId: string; kitVersion?: number; onKitApplied?: () => void }) {
  const endpoint = `/api/studio/campaigns/${campaignId}/brand-intake`,
    { data, error, refresh } = useShared<BrandIntakeView>(endpoint),
    [busy, setBusy] = useState(false),
    [hover, setHover] = useState(false),
    [message, setMessage] = useState(""),
    [selectedCap] = useState(0.03),
    [uploads, setUploads] = useState<{ path: string; state: string }[]>([]),
    files = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null);
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
  async function upload(incoming: Incoming[], manageBusy = true) {
    if (manageBusy) setBusy(true);
    setMessage("");
    let success = true;
    const ids: string[] = [];
    const progress: { path: string; state: string }[] = [];
    try {
      for (const item of incoming) {
        if (item.file.name.startsWith(".") || item.path.split("/").includes("__MACOSX")) continue;
        const current = { path: item.path, state: "Uploading" };
        progress.push(current);
        setUploads([...progress]);
        try {
          if (item.file.size > 52428800) throw new Error("Over the 50 MiB upload transport limit");
          const form = brandUploadForm(item.file, item.path, crypto.randomUUID());
          const saved = await studioRequest<{ id: string }>(endpoint, "PUT", form);
          ids.push(saved.id);
          current.state = "Saved · processing";
        } catch (e) {
          success = false;
          current.state = e instanceof Error ? e.message : "Upload failed";
        }
        setUploads([...progress]);
      }
      refresh();
      const saved = progress.filter((item) => item.state === "Saved · processing").length,
        failed = progress.length - saved;
      setMessage(
        failed
          ? `${saved} of ${progress.length} files saved. ${failed} failed; see Upload results and select those files again.`
          : saved
            ? `${saved} files saved. Local reading starts automatically; build the kit when the included sources are ready.`
            : "No files were added. Hidden system files are skipped.",
      );
    } catch (e) {
      success = false;
      setMessage(e instanceof Error ? e.message : "Could not add files.");
    } finally {
      if (manageBusy) setBusy(false);
    }
    return { success, ids };
  }
  async function analyzeSource(id: string) {
    setBusy(true);
    setMessage("Waiting for the new source to finish local reading…");
    try {
      const fields = endpoint.replace("/brand-intake", "/brand-fields");
      await waitForStudio<{ state: string; error_code: string | null }>(`${fields}?materialState=${id}`, (status) => {
        if (["failed", "unsupported"].includes(status.state)) throw new Error("The source was saved but could not be read. Check its status below.");
        return status.state === "ready";
      });
      const result = await studioRequest<{ message: string }>(fields, "POST", {
        action: "startSelected",
        requestId: crypto.randomUUID(),
        materialIds: [id],
        requestCap: Math.round(selectedCap * 1000000),
        runCap: data?.run?.cap_micro_usd ?? 300000,
      });
      setMessage(result.message);
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not analyze the source.");
    } finally {
      setBusy(false);
    }
  }
  async function addNotes(analyze: boolean) {
    setBusy(true);
    try {
      await notesDraft.save();
      const file = new File([notes], `Brand notes ${Date.now()}.txt`, { type: "text/plain" });
      const result = await upload([{ file, path: file.name }], false);
      if (result.success) {
        setNotes("");
        await notesDraft.save();
        if (analyze && result.ids[0]) await analyzeSource(result.ids[0]);
      }
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
      setMessage(result.message);
      refresh();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Brand intake failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }
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
    working = data.proposals.some((p) => ["reserved", "running"].includes(p.status)),
    latest = data.proposals.find((p) => p.proposal && p.current),
    proposal = latest?.proposal,
    recoverable = data.proposals.find((p) => p.recoverable && p.current);
  return (
    <section className="detail-panel brand-intake">
      {error && (
        <div className="notice" role="alert">
          <p>{error} Showing the last loaded brand materials.</p>
          <Button variant="outline" onClick={refresh}>
            Retry loading brand materials
          </Button>
        </div>
      )}
      <p className="eyebrow">STEP 1 OF 3</p>
      <h2>Drop your brandbook.</h2>
      <p>The whole brand folder is best: guidelines, logos, fonts, product shots. We read everything and sort it into fields for you to choose from.</p>
      <div
        className={`brand-drop-zone ${hover ? "is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setHover(true);
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          if (busy) return;
          void droppedFiles(e.dataTransfer.items)
            .then((items) => upload(items))
            .catch((e) => setMessage(e.message));
        }}
        onPaste={(e) => {
          if (e.clipboardData.files.length) {
            e.preventDefault();
            void upload(Array.from(e.clipboardData.files).map((file) => ({ file, path: file.name })));
          } else {
            const text = e.clipboardData.getData("text/plain");
            if (text) {
              e.preventDefault();
              setNotes(text.slice(0, 40000));
              setMessage(
                text.length > 40000
                  ? "Pasted the first 40,000 characters. Add the remaining text as a file."
                  : "Notes pasted below. Add them to include them in the brand pack.",
              );
            }
          }
        }}
        tabIndex={0}
        aria-label="Drop or paste brand files here"
      >
        <strong>Drop files or folders here</strong>
        <p>Images · PDFs · Word documents · notes · font files</p>
        <div className="data-heading-actions">
          <Button type="button" disabled={busy} onClick={() => files.current?.click()}>
            Choose files
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              folder.current?.setAttribute("webkitdirectory", "");
              folder.current?.click();
            }}
          >
            Choose folder
          </Button>
        </div>
        <p className="muted">Or paste with ⌘V. Up to 50 MiB per file.</p>
        <input
          ref={files}
          hidden
          type="file"
          multiple
          accept={brandFileExtensions.map((e) => "." + e).join(",")}
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name })));
            e.target.value = "";
          }}
        />
        <input
          ref={folder}
          hidden
          type="file"
          multiple
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name })));
            e.target.value = "";
          }}
        />
      </div>
      <Disclosure className="brand-notes">
        <summary>Add text instead — guidelines, story, links</summary>
        <div className="studio-form">
          <textarea
            rows={4}
            disabled={busy}
            maxLength={40000}
            value={notes}
            aria-label="Brand notes"
            onChange={(e) => setNotes(e.target.value)}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                void upload(Array.from(e.clipboardData.files).map((file) => ({ file, path: file.name })));
              }
            }}
            placeholder="Paste what you already have."
          />
          <SaveStatus {...notesDraft} retry={notesDraft.save} />
          <div className="data-heading-actions">
            <Button
              variant="outline"
              disabled={busy || !notes.trim()}
              onClick={() => void addNotes(false).catch((e) => setMessage(e instanceof Error ? e.message : "Could not save notes."))}
            >
              Add to brandbook
            </Button>
          </div>
        </div>
      </Disclosure>
      {uploads.length > 0 && (
        <Disclosure open={uploads.some((u) => u.state !== "Saved · processing")}>
          <summary>Upload results</summary>
          {uploads.map((u, i) => (
            <p key={i}>
              {u.path} · {u.state}
            </p>
          ))}
        </Disclosure>
      )}
      {data.materials.length > 0 && (
        <Disclosure className="brand-files" open={data.materials.some((m) => m.state === "failed" || m.state === "unsupported")}>
          <summary>
            <strong>{data.materials.length} files</strong> · {ready.length} of {included.length} read
            {data.materials.some((m) => m.state === "failed" || m.state === "unsupported") ? " · some need attention" : ""}
          </summary>
        {data.materials.map((m) => (
          <article className="brand-source-row" key={m.id}>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={m.included}
                disabled={busy}
                onChange={(e) => void command({ action: "include", materialId: m.id, included: e.target.checked })}
              />
              <span>
                <strong>{m.relative_path}</strong>
                <br />
                <small>
                  {m.extraction?.kind ?? m.mime} · {(m.bytes / 1024).toFixed(0)} KiB
                </small>
              </span>
            </label>
            <Badge variant={m.state === "ready" ? "blue" : "outline"}>{m.state === "ready" ? "Extracted" : m.state === "uploaded" ? "Queued" : m.state}</Badge>
            {m.error_code && <p role="alert">Couldn’t read this file ({m.error_code.replaceAll("_", " ").toLowerCase()}). Untick it to continue without it.</p>}
            {m.state === "failed" && (
              <Button variant="outline" disabled={busy} onClick={() => void command({ action: "retry", materialId: m.id })}>
                Retry file reading
              </Button>
            )}
            {m.extraction && <SourceDetails material={m} endpoint={endpoint} />}
            <div className="data-heading-actions">
              <a className="text-link" href={`${endpoint}?source=${m.id}`} download>
                Download
              </a>
            </div>
          </article>
        ))}
        </Disclosure>
      )}
      {data.materials.some((m) => m.state === "uploaded" || m.state === "processing") && (
        <Button variant="outline" disabled={busy} onClick={() => void command({ action: "resume" })}>
          Resume file reading
        </Button>
      )}
      <BrandFieldWorkspace campaignId={campaignId} sourcesReady={included.length > 0 && ready.length === included.length} onContinue={onKitApplied} />
      {recoverable && data.recoveryReady && (
        <Button variant="outline" disabled={busy || working} onClick={() => void command({ action: "revalidate", stepId: recoverable.id })}>
          Recover earlier complete response · free
        </Button>
      )}
      <p role="status">{!working && (message.startsWith("Gemini is reading") || message === "Existing brand build resumed.") ? "" : message}</p>
      {data.a1Accepted && <p className="notice">The brand for this run is approved. New files are saved for later runs.</p>}
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

function SourceDetails({ material: m, endpoint }: { material: BrandMaterial; endpoint: string }) {
  const [open, setOpen] = useState(false);
  if (!m.extraction) return null;
  return (
    <Disclosure onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>What was read{m.extraction.metadata.family ? ` · ${m.extraction.metadata.family}` : ""}</summary>
      {open && (
        <>
          <p>
            {m.extraction.images.length} actual image/page previews
            {m.extractedChars !== undefined ? ` · ${m.extractedChars.toLocaleString()} extracted characters` : ""}
          </p>
          {m.extraction.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          <SourceText key={m.extraction_sha} path={`${endpoint}?text=${m.id}`} />
          {m.extraction.images.length > 0 && (
            <a href={`${endpoint}?preview=${m.id}&page=1`} target="_blank" rel="noopener noreferrer">
              Open first visual preview
            </a>
          )}
        </>
      )}
    </Disclosure>
  );
}
function SourceText({ path }: { path: string }) {
  const { data, error } = useShared<{ text: string }>(path, { live: false });
  return error ? <p role="alert">{error}</p> : data ? <pre className="shared-output">{data.text}</pre> : <p>Loading source excerpt…</p>;
}
