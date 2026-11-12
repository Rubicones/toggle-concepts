"use client";
import {Disclosure} from '@/components/ui/disclosure';
import { AdShapeField, BriefFeelFields } from "./brief-feel-fields";
import {Select} from '@/components/ui/select';
import {usePersistedDraft} from "@/lib/use-persisted-draft";
import {SaveStatus} from "./save-status";
import { useEffect, useRef, useState, type ReactNode } from "react";
import css from "./brief-workspace.module.css";
import { useRouter } from "next/navigation";
import type { CampaignFlow } from "@/packages/contracts/campaign-flow";
import Link from "next/link";
import { localeCode, localeName } from "@/packages/contracts/locale-names";
import { Button } from "@/components/ui/button";
import { CopyBriefButton } from "./copy-brief-button";
import { Badge } from "@/components/ui/badge";
import { studioRequest, useShared } from "@/lib/shared-http";
import { briefDraftSchema, briefPlacementOptions, briefBlockers, copyBriefAnswers, submittedBriefAnswers, emptyBrief, combinationCount, resizeCreativeSlots, explicitCombinations, rowKey, type BriefDraft, type BriefRecord } from "@/packages/contracts/brief";
import { money } from "@/packages/contracts/shared";
import type { VariantEntry } from "@/packages/contracts/campaign";

export function C1Migration(){return <WorkflowMigration stage="C1"/>;}
export function WorkflowMigration({stage}:{stage:"M07b"|"C1"|"A1"|"M06"|"M07"|"M08"|"M09"|"Brand intake"|"Intake recovery"|"Brand output allowance"|"Incremental brand fields"|"Brandbook workspace"|"Brandbook updates"|"Run dashboard"|"Run limits"|"Output recovery"|"Simple retry"|"Preview contract"|"Preview continuation"}) {
  const milestone=stage==="M07b"?"m07b":stage==="Preview continuation"?"preview-continue":stage==="Preview contract"?"preview-contract":stage==="Simple retry"?"simple-retry":stage==="Output recovery"?"output-recovery":stage==="Run limits"?"run-limits":stage==="Run dashboard"?"guided-run":stage==="C1"?"c1":stage==="A1"?"a1":stage==="M06"?"m06":stage==="M07"?"m07":stage==="M08"?"m08":stage==="M09"?"m09":stage==="Intake recovery"?"intake-recovery":stage==="Brand output allowance"?"intake-output":stage==="Incremental brand fields"?"brand-fields":stage==="Brandbook workspace"?"brandbook-workspace":stage==="Brandbook updates"?"brandbook-updates":"brand-intake";
  const subject=stage==="M07b"?"creative draft pipeline":stage==="Preview continuation"?"costed preview continuation":stage==="Preview contract"?"typed preview assembly contract":stage==="Simple retry"?"one-click preview retry":stage==="Output recovery"?"saved output recovery":stage==="Run limits"?"run limits, top-ups and stop controls":stage==="Run dashboard"?"guided campaign run":stage==="C1"?"C1 questionnaire":stage==="A1"?"Brand Kit and A1 review":stage==="M06"?"durable workflow queue":stage==="M07"?"three-direction draft compiler":stage==="M08"?"A2/C2 review and full draft replay":stage==="M09"?"provider receipt recovery":stage==="Intake recovery"?"saved Brand Kit response recovery":stage==="Brand output allowance"?"larger Brand Kit output allowance":stage==="Incremental brand fields"?"incremental Brand Kit fields":stage==="Brandbook workspace"?"brandbook submission and continuation":stage==="Brandbook updates"?"brief prefill and selected-source analysis":"brand material intake";
  const [message, setMessage] = useState("");
  const {data:status}=useShared<{sqlEditorUrl:string|null}>("/api/studio/status");
  return <section className="detail-panel"><Badge variant="outline">Database update required</Badge><h2>Enable the {subject}.</h2>
    <p>Apply only the incremental {stage} migration to the existing Supabase project. It preserves campaigns, media, runs and charges. The app does not have database schema-management credentials.</p>
    <div className="data-heading-actions"><Button onClick={async () => { try { const response = await fetch(`/api/studio/setup?milestone=${milestone}`); if (!response.ok) throw new Error(); await navigator.clipboard.writeText(await response.text()); setMessage(`${stage} SQL copied. Paste it into the project's Supabase SQL Editor and click Run once. Then refresh this page.`); } catch { setMessage(`Download the ${stage} SQL and open it in the project's Supabase SQL Editor.`); } }}>Copy {stage} migration</Button>
      <Button variant="outline" asChild><a href={`/api/studio/setup?milestone=${milestone}`} download>Download {stage} SQL</a></Button>{status?.sqlEditorUrl&&<Button variant="outline" asChild><a href={status.sqlEditorUrl} target="_blank" rel="noopener noreferrer">Open Supabase SQL Editor</a></Button>}<Link href="/settings#connections" className="text-link">Connection settings</Link></div><p role="status">{message}</p></section>;
}
const DEFAULT_IMMUTABLES = "Product name, logo, app interface and product shape stay exactly as supplied.";
const DEFAULT_SYNTHESIS = "Backgrounds, environments, abstract shapes and lighting may be generated. People, the product and its interface are never invented.";
const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/** Step 2. One page of plain questions; submitting it starts the run. */
export function BriefWorkspace({ campaignId, goal, onSubmitted, flow }: { campaignId: string; goal: string; onSubmitted: () => void; flow?: CampaignFlow | null }) {
  const { data, error, refresh } = useShared<BriefRecord>(`/api/studio/campaigns/${campaignId}/brief`);
  if (error)
    return (
      <section className="detail-panel">
        <p role="alert">{error}</p>
        <Button onClick={refresh}>Retry</Button>
      </section>
    );
  if (!data) return <p role="status">Loading questionnaire…</p>;
  if (!data.schemaReady) return <C1Migration />;
  if (data.checkpoint) return <SubmittedBrief campaignId={campaignId} record={data} flow={flow ?? null} onStarted={onSubmitted} />;
  return (
    <BriefEditor
      key={campaignId}
      campaignId={campaignId}
      initial={data.draft?.payload ?? emptyBrief(goal)}
      initialVersion={data.draft?.version ?? 0}
      prefilled={Object.keys(data.brandbookPrefill?.fields ?? {})}
      flow={flow ?? null}
      onSubmitted={() => {
        refresh();
        onSubmitted();
      }}
    />
  );
}
function SubmittedBrief({ campaignId, record, flow, onStarted }: { campaignId: string; record: BriefRecord; flow: CampaignFlow | null; onStarted: () => void }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const checkpoint = record.checkpoint!.payload;
  const submitted = submittedBriefAnswers(record.checkpoint!.brief_text);
  return (
    <section className="detail-panel">
      <div className="step-intro">
        <Badge variant="blue">Submitted</Badge>
        <h2>Questionnaire submitted.</h2>
        <p>
          {checkpoint.variantManifest.entries.length} videos · {checkpoint.scope.locales.join(", ")} · reference {checkpoint.scope.referencePlacement}. Answers are fixed for this
          run.
        </p>
      </div>
      {submitted && (
        <div className="brief-summary">
          {(
            [
              ["Product", submitted.product],
              ["Objective", submitted.objective],
              ["Audience", submitted.audience],
              ["Offer", submitted.offer],
              ["Call to action", submitted.cta],
              ["Budget", money(submitted.runCapMicroUsd)],
            ] as const
          ).map(([label, value]) => (
            <p key={label}>
              <small>{label}</small>
              {value}
            </p>
          ))}
        </div>
      )}
      <div className="data-heading-actions">
        {flow?.run.started ? (
          <Button asChild>
            <Link href={`/campaigns/${campaignId}/run`}>Open run →</Link>
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                await studioRequest(`/api/studio/campaigns/${campaignId}/run`, "POST", { action: "start" });
                onStarted();
                router.push(`/campaigns/${campaignId}/run`);
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Could not start the run.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Starting…" : "Start run →"}
          </Button>
        )}
      </div>
      <p role="status">{message}</p>
      <Disclosure>
        <summary>All {checkpoint.variantManifest.entries.length} ordered videos</summary>
        <div className="brief-manifest-wrap">
          <VariantRows rows={checkpoint.variantManifest.entries} />
        </div>
      </Disclosure>
    </section>
  );
}
function VariantRows({ rows, remove }: { rows: Omit<VariantEntry, "inputRevisionIds">[]; remove?: (id: string) => void }) {
  return (
    <table className="brief-manifest">
      <caption>{rows.length} videos</caption>
      <thead>
        <tr>
          {["Concept", "Language", "Hook", "Story", "Offer", "Seconds", "Format", ...(remove ? [""] : [])].map((h, i) => (
            <th scope="col" key={i}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.conceptSlot}</td>
            <td>{r.locale}</td>
            <td>{r.hook}</td>
            <td>{r.beatSequence}</td>
            <td>{r.offer}</td>
            <td>{r.durationSeconds}</td>
            <td>{r.placementId}</td>
            {remove && (
              <td>
                <button type="button" className="text-link" onClick={() => remove(r.id)}>
                  Remove
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
type TextKey = "product" | "benefit" | "proof" | "audienceTension" | "objective" | "audience" | "markets" | "ownerName" | "ownerEmail" | "offer" | "cta" | "destination" | "deadline" | "immutables" | "synthesis" | "rightsNotes" | "price" | "currency" | "priceSource" | "variationNotes";
const limits: Record<TextKey, number> = {
  product: 1500, benefit: 400, proof: 600, audienceTension: 600, objective: 1200, audience: 1500, markets: 500, ownerName: 160, ownerEmail: 200, offer: 1000, cta: 300, destination: 500, deadline: 20,
  immutables: 2000, synthesis: 1000, rightsNotes: 1500, price: 100, currency: 3, priceSource: 500, variationNotes: 3000,
};
/** Rows are exactly every combination of the chosen options. Existing rows keep their IDs. */
function allRows(draft: BriefDraft): BriefDraft["entries"] {
  if (!combinationCount(draft) || combinationCount(draft) > 128) return draft.entries;
  try {
    const kept = new Map(draft.entries.map((r) => [rowKey(r), r]));
    return explicitCombinations(draft, () => crypto.randomUUID()).map((r) => kept.get(rowKey(r)) ?? r);
  } catch {
    return draft.entries;
  }
}
const isAll = (draft: BriefDraft) => {
  const keys = new Set(draft.entries.map(rowKey));
  return draft.entries.length === combinationCount(draft) && allRows(draft).every((r) => keys.has(rowKey(r)));
};
function BriefEditor({
  campaignId,
  initial,
  initialVersion,
  prefilled,
  flow,
  onSubmitted,
}: {
  campaignId: string;
  initial: BriefDraft;
  initialVersion: number;
  prefilled: string[];
  flow: CampaignFlow | null;
  onSubmitted: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<"all" | "pick">(() => (initial.entries.length && !isAll(initial) ? "pick" : "all"));
  const persisted = usePersistedDraft({
    key: `/api/studio/campaigns/${campaignId}/brief`,
    initial,
    initialVersion,
    label: "Questionnaire",
    href: `/campaigns/${campaignId}/brief`,
    write: async (draft, version) => {
      const parsed = briefDraftSchema.safeParse(draft);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" "),
        );
      const result = await studioRequest<{ version: number }>(`/api/studio/campaigns/${campaignId}/brief`, "PUT", { expectedVersion: version, draft: parsed.data });
      return result.version;
    },
  });
  const { value: draft, setValue: setDraft, version } = persisted;
  const formRef = useRef<HTMLFormElement>(null),
    requestId = useRef<string | null>(null);
  // Visible, editable defaults instead of empty required fields.
  useEffect(() => {
    setDraft((old) => {
      const zoneValid = (() => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: old.timeZone }).format();
          return !!old.timeZone;
        } catch {
          return false;
        }
      })();
      const next = {
        ...old,
        immutables: old.immutables || DEFAULT_IMMUTABLES,
        synthesis: old.synthesis || DEFAULT_SYNTHESIS,
        timeZone: zoneValid ? old.timeZone : browserZone(),
      };
      const withRows = !old.entries.length ? { ...next, entries: allRows(next) } : next;
      return JSON.stringify(withRows) === JSON.stringify(old) ? old : withRows;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const blockers = briefBlockers(draft),
    possible = combinationCount(draft);
  const set = <K extends keyof BriefDraft>(key: K, value: BriefDraft[K]) =>
    setDraft((old) => {
      let next = { ...old, [key]: value };
      if (!next.locales.includes(next.referenceLocale)) next.referenceLocale = next.locales[0] ?? "";
      if (!next.placementIds.includes(next.referencePlacement) && next.placementIds[0]) next.referencePlacement = next.placementIds[0];
      if (mode === "all") next = { ...next, entries: allRows(next) };
      return next;
    });
  const fromBook = new Set(prefilled);
  const field = (key: TextKey, label: string, opts: { multiline?: boolean; type?: string; placeholder?: string; hint?: string; optional?: boolean; rows?: number } = {}) => (
    <label className={css.field}>
      <span className={css.label}>
        {label}
        {opts.optional && <em>optional</em>}
        {fromBook.has(key) && !!draft[key]?.trim() && <b title="Filled from your brandbook. Check it.">from brandbook</b>}
      </span>
      {opts.multiline ? (
        <textarea id={`brief-${key}`} rows={opts.rows ?? 2} value={draft[key] ?? ""} maxLength={limits[key]} placeholder={opts.placeholder} onChange={(e) => set(key, e.target.value)} />
      ) : (
        <input id={`brief-${key}`} type={opts.type ?? "text"} value={draft[key] ?? ""} maxLength={limits[key]} placeholder={opts.placeholder} onChange={(e) => set(key, e.target.value)} />
      )}
      {opts.hint && <small className="muted">{opts.hint}</small>}
    </label>
  );
  function addRow() {
    if (!formRef.current) return;
    try {
      const fields = new FormData(formRef.current),
        row = briefDraftSchema.shape.entries.element.parse({
          id: crypto.randomUUID(),
          conceptSlot: Number(fields.get("rowConcept")),
          locale: fields.get("rowLocale"),
          hook: fields.get("rowHook"),
          beatSequence: fields.get("rowBeats"),
          offer: fields.get("rowOffer"),
          durationSeconds: Number(fields.get("rowDuration")),
          placementId: fields.get("rowPlacement"),
        });
      if (draft.entries.some((r) => rowKey(r) === rowKey(row))) throw new Error("That combination is already in the list.");
      if (draft.entries.length >= 128) throw new Error("The current limit is 128 ordered outputs.");
      set("entries", [...draft.entries, row]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Choose a value for every option.");
    }
  }
  const rowSelect = (name: string, label: string, values: readonly (string | number)[]) => (
    <label>
      {label}
      <Select name={name}>
        {values.map((value, index) => (
          <option key={`${value}-${index}`} value={value}>
            {value}
          </option>
        ))}
      </Select>
    </label>
  );
  const bookReady = !!flow?.brandbook.submitted;
  async function start() {
    setBusy(true);
    setMessage("");
    try {
      const savedVersion = await persisted.save();
      requestId.current ??= crypto.randomUUID();
      await studioRequest(`/api/studio/campaigns/${campaignId}/brief`, "POST", { expectedVersion: savedVersion, requestId: requestId.current, confirmScope: true });
      await studioRequest(`/api/studio/campaigns/${campaignId}/run`, "POST", { action: "start" });
      onSubmitted();
      router.push(`/campaigns/${campaignId}/run`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start the run.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form noValidate ref={formRef} className="studio-form brief-editor" onSubmit={(e) => e.preventDefault()}>
      <div className="step-intro">
        <p className="eyebrow">STEP 2 OF 3 · QUESTIONNAIRE</p>
        <h2>Tell us about this campaign</h2>
        <p>
          {prefilled.length ? `${prefilled.length} answers came from your brandbook — they are marked; check them. ` : ""}Logos, fonts, colours and product images come from the
          brandbook, so nothing needs uploading here. Everything saves as you type.
        </p>
        <div className={css.introActions}>
          <SaveStatus {...persisted} retry={persisted.save} />
          <CopyBriefButton campaignId={campaignId} disabled={busy} onCopy={(source) => {
            setDraft((target) => copyBriefAnswers(source, target, () => crypto.randomUUID()));
            setMode(source.entries.length && !isAll(source) ? "pick" : "all");
          }} />
        </div>
      </div>
      {initialVersion > version && (
        <p className="notice">
          Newer answers were saved elsewhere.{" "}
          <Button type="button" variant="outline" disabled={persisted.saving} onClick={() => persisted.reset(initial, initialVersion)}>
            Load them
          </Button>
        </p>
      )}
      <Section n={1} title="The product" detail="What the ad sells and why someone should care." disabled={busy}>
        {field("product", "What are we advertising?", { multiline: true, rows: 3, placeholder: "Name it and say what it is, in a sentence or two." })}
        <div className="brief-field-grid">
          {field("benefit", "The main benefit, in one sentence", { optional: true, placeholder: "What people get from it" })}
          {field("proof", "Why should people believe it?", { multiline: true, optional: true, placeholder: "A fact, number or feature that proves it" })}
        </div>
      </Section>
      <Section n={2} title="Audience and market" detail="Who sees the ad and what stands in their way." disabled={busy}>
        <div className="brief-field-grid">
          {field("audience", "Who is it for?", { multiline: true })}
          {field("audienceTension", "What gets in their way today?", { multiline: true, optional: true, placeholder: "The problem or habit the product solves" })}
        </div>
        {field("markets", "Where will it run?", { placeholder: "UK, Germany…" })}
      </Section>
      <Section n={3} title="Goal and offer" detail="What the ad should make people do." disabled={busy}>
        {field("objective", "What should the ad achieve?", { multiline: true })}
        <div className="brief-field-grid">
          {field("offer", "Offer", { multiline: true, placeholder: "Free 14-day trial…" })}
          {field("cta", "Call to action", { placeholder: "Try it free / Start your project", hint: "Several options? Separate them with /; each ad uses one." })}
        </div>
      </Section>
      <Section n={4} title="How it should feel" detail="Pick what fits; the agents invent the visual style from it." disabled={busy}>
        <BriefFeelFields value={draft.feel} onChange={(feel) => set("feel", feel)} />
        {field("variationNotes", "Anything else for the creative team", { multiline: true, optional: true, rows: 3, placeholder: "Ideas, references in words, what to avoid…" })}
      </Section>
      <Section n={5} title="What to make" detail="Formats, languages and how many versions." disabled={busy}>
        <AdShapeField value={draft.adShape} onChange={(id) => set("adShape", id as NonNullable<typeof draft.adShape>)} />
        <p className={css.sub}>Formats</p>
        <div className="format-choice" role="group" aria-label="Formats">
          {briefPlacementOptions.map((p) => (
            <label key={p.id} data-checked={draft.placementIds.includes(p.id) || undefined}>
              <input
                type="checkbox"
                checked={draft.placementIds.includes(p.id)}
                onChange={(e) => set("placementIds", e.target.checked ? [...draft.placementIds, p.id] : draft.placementIds.filter((id) => id !== p.id))}
              />
              <i style={{ aspectRatio: `${p.width} / ${p.height}` }} />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
        <div className="brief-field-grid">
          <LanguagePicker values={draft.locales} onChange={(v) => set("locales", v)} />
          <AxisField label="Lengths, seconds" hint="e.g. 15, 6" values={draft.durationsSeconds} onChange={(v) => set("durationsSeconds", v.map(Number).filter((n) => n > 0))} />
          <label>
            Opening hooks per video
            <Select value={draft.hooks.length || 1} onChange={(e) => set("hooks", resizeCreativeSlots(draft.hooks, Number(e.target.value), "hook"))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Story versions
            <Select value={draft.beatSequences.length || 1} onChange={(e) => set("beatSequences", resizeCreativeSlots(draft.beatSequences, Number(e.target.value), "beats"))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="videos-mode" role="radiogroup" aria-label="Which videos">
          <label>
            <input
              type="radio"
              checked={mode === "all"}
              onChange={() => {
                setMode("all");
                setDraft((old) => ({ ...old, entries: allRows(old) }));
              }}
            />
            <span>
              <strong>Every combination · {possible > 128 ? "over 128" : possible} videos</strong>
              <small>All languages × formats × lengths × hooks × stories.</small>
            </span>
          </label>
          <label>
            <input type="radio" checked={mode === "pick"} onChange={() => setMode("pick")} />
            <span>
              <strong>Only specific combinations · {draft.entries.length} chosen</strong>
              <small>Pick the exact videos you need.</small>
            </span>
          </label>
        </div>
        {mode === "pick" && (
          <div className="detail-panel">
            <div className="brief-field-grid">
              {rowSelect("rowLocale", "Language", draft.locales)}
              {rowSelect("rowPlacement", "Format", draft.placementIds)}
              {rowSelect("rowDuration", "Seconds", draft.durationsSeconds)}
              {rowSelect("rowHook", "Hook", draft.hooks)}
              {rowSelect("rowBeats", "Story", draft.beatSequences)}
              {rowSelect("rowOffer", "Offer", draft.offers)}
              {rowSelect(
                "rowConcept",
                "Concept",
                Array.from({ length: draft.finalConceptCount }, (_, i) => i + 1),
              )}
            </div>
            <Button type="button" variant="outline" onClick={addRow}>
              Add this video
            </Button>
            <div className="brief-manifest-wrap">
              <VariantRows rows={draft.entries} remove={(id) => set("entries", draft.entries.filter((r) => r.id !== id))} />
            </div>
          </div>
        )}
        <Disclosure>
          <summary>More options</summary>
          <div className="brief-field-grid">
            <label>
              Final concepts to produce
              <Select value={draft.finalConceptCount} onChange={(e) => set("finalConceptCount", Number(e.target.value))}>
                {[1, 2, 3].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </Select>
            </label>
            <AxisField label="Offer variants" hint="Comma separated IDs" values={draft.offers} onChange={(v) => set("offers", v)} />
            <label>
              Preview language
              <Select value={draft.referenceLocale} onChange={(e) => set("referenceLocale", e.target.value)}>
                {draft.locales.map((v, index) => (
                  <option key={`${v}-${index}`}>{v}</option>
                ))}
              </Select>
            </label>
            <label>
              Preview format
              <Select value={draft.referencePlacement} onChange={(e) => set("referencePlacement", e.target.value as BriefDraft["referencePlacement"])}>
                {briefPlacementOptions
                  .filter((p) => draft.placementIds.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
              </Select>
            </label>
          </div>
        </Disclosure>
      </Section>
      <Section n={6} title="Rules" detail="What must stay exactly as it is, and what may be generated." disabled={busy}>
        <div className="brief-field-grid">
          {field("immutables", "What must never change", { multiline: true, rows: 3 })}
          {field("synthesis", "What AI may generate", { multiline: true, rows: 3 })}
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={draft.rights === "confirmed"}
            onChange={(e) => set("rights", e.target.checked ? "confirmed" : draft.sourceAssetIds.length ? "unknown" : "not_needed")}
          />
          <span>I may use the brand’s logos, fonts, images and other brand files in these ads.</span>
        </label>
        <Disclosure>
          <summary>Claims, prices and rights notes (optional)</summary>
          {field("rightsNotes", "Rights notes or restrictions", { multiline: true })}
          {draft.facts.map((fact, index) => (
            <div className="brief-claim" key={fact.id}>
              <label>
                Claim {index + 1}
                <input
                  maxLength={1000}
                  value={fact.claim}
                  onChange={(e) => set("facts", draft.facts.map((f) => (f.id === fact.id ? { ...f, claim: e.target.value, status: "confirmed" } : f)))}
                />
              </label>
              <label>
                Source
                <input
                  maxLength={1000}
                  value={fact.source}
                  placeholder="URL or document"
                  onChange={(e) => set("facts", draft.facts.map((f) => (f.id === fact.id ? { ...f, source: e.target.value, status: "confirmed" } : f)))}
                />
              </label>
              <Button type="button" variant="ghost" onClick={() => set("facts", draft.facts.filter((f) => f.id !== fact.id))}>
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={draft.facts.length >= 20}
            onClick={() => set("facts", [...draft.facts, { id: crypto.randomUUID(), claim: "", status: "confirmed", source: "" }])}
          >
            Add a claim the ad may make
          </Button>
          <label className="checkbox-field">
            <input type="checkbox" checked={draft.showPrice} onChange={(e) => set("showPrice", e.target.checked)} />
            <span>Show a price in the ad</span>
          </label>
          {draft.showPrice && (
            <div className="brief-field-grid">
              {field("price", "Price")}
              {field("currency", "Currency", { placeholder: "USD" })}
              {field("priceSource", "Where the price comes from")}
              <label className="checkbox-field">
                <input type="checkbox" checked={draft.priceConfirmed} onChange={(e) => set("priceConfirmed", e.target.checked)} />
                <span>The price and its conditions are confirmed.</span>
              </label>
            </div>
          )}
        </Disclosure>
      </Section>
      <div className="step-footer">
        <label className="step-budget">
          Run budget, USD
          <input
            type="number"
            min="0.01"
            max="100"
            step="0.5"
            value={draft.runCapMicroUsd / 1000000}
            onChange={(e) => set("runCapMicroUsd", Math.round(Number(e.target.value) * 1000000))}
          />
        </label>
        <div>
          {!bookReady ? (
            <p>
              Finish the brandbook first ·{" "}
              <Link className="text-link" href={`/campaigns/${campaignId}/brand-kit`}>
                Step 1
              </Link>
            </p>
          ) : blockers.length ? (
            <Disclosure className="step-blockers">
              <summary>{blockers.length === 1 ? "1 answer missing" : `${blockers.length} answers missing`}</summary>
              <ul>
                {blockers.map((b, index) => {
                  const target = blockerField(b);
                  return (
                    <li key={index}>
                      {target ? (
                        <button type="button" className="text-link" onClick={() => focusField(target)}>
                          {b}
                        </button>
                      ) : (
                        b
                      )}
                    </li>
                  );
                })}
              </ul>
            </Disclosure>
          ) : (
            <p>
              {draft.entries.length} videos · three draft directions · spending stops at {money(draft.runCapMicroUsd)}
            </p>
          )}
          {message && <p role="alert">{message}</p>}
        </div>
        <div className="step-footer-actions">
          <Button type="button" disabled={busy || !bookReady || blockers.length > 0} onClick={() => void start()}>
            {busy ? "Starting…" : "Start run →"}
          </Button>
        </div>
      </div>
    </form>
  );
}
/** Which questionnaire field a missing answer points to, so the list can take the AD straight there. */
const blockerFields: [RegExp, TextKey][] = [
  [/^Product is required/, "product"],
  [/^Objective/, "objective"],
  [/^Audience/, "audience"],
  [/^Market/, "markets"],
  [/^Offer/, "offer"],
  [/^CTA/, "cta"],
  [/^Product invariants/, "immutables"],
  [/^Synthetic-content/, "synthesis"],
];
const blockerField = (message: string) => blockerFields.find(([pattern]) => pattern.test(message))?.[1];
function focusField(key: TextKey) {
  const element = document.getElementById(`brief-${key}`);
  element?.scrollIntoView({ behavior: "smooth", block: "center" });
  element?.focus({ preventScroll: true });
}
function Section({ n, title, detail, disabled, children }: { n: number; title: string; detail: string; disabled: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={disabled} className={css.section}>
      <legend>
        <i>{n}</i>
        {title}
      </legend>
      <p className={css.detail}>{detail}</p>
      {children}
    </fieldset>
  );
}
/** Languages the studio is asked for most often. Any other language is added by its code. */
const COMMON_LOCALES = ["en-GB", "en-US", "de-DE", "fr-FR", "es-ES", "it-IT", "pt-BR", "pt-PT", "nl-NL", "pl-PL", "sv-SE", "da-DK", "nb-NO", "fi-FI", "cs-CZ", "tr-TR", "uk-UA", "ru-RU", "ar-SA", "he-IL", "hi-IN", "ja-JP", "ko-KR", "zh-CN"];
const MAX_LOCALES = 8;
/** Languages by clicking: the common ones as toggles, a rare one by its code. The order of selection is kept. */
function LanguagePicker({ values, onChange }: { values: readonly string[]; onChange: (values: string[]) => void }) {
  const [other, setOther] = useState(""), [note, setNote] = useState("");
  const full = values.length >= MAX_LOCALES;
  const toggle = (code: string) => onChange(values.includes(code) ? values.filter((v) => v !== code) : full ? [...values] : [...values, code]);
  const add = () => {
    const code = localeCode(other);
    if (!code) return setNote("Use a language code such as el-GR or vi-VN.");
    if (values.includes(code)) return setNote(`${localeName(code)} is already selected.`);
    if (full) return setNote(`Up to ${MAX_LOCALES} languages.`);
    onChange([...values, code]);
    setOther("");
    setNote("");
  };
  const extra = values.filter((v) => !COMMON_LOCALES.includes(v));
  return (
    <fieldset className="language-picker">
      <legend>Languages</legend>
      <div className="language-options" role="group" aria-label="Languages">
        {[...COMMON_LOCALES, ...extra].map((code) => {
          const on = values.includes(code);
          return (
            <button type="button" key={code} className="language-option" aria-pressed={on} disabled={!on && full} title={code} onClick={() => toggle(code)}>
              {localeName(code)}
            </button>
          );
        })}
      </div>
      <p className="muted" role="status">
        {values.length ? `Selected, in order: ${values.map(localeName).join(", ")}.` : "Choose at least one language."}
        {full ? ` Up to ${MAX_LOCALES}.` : ""}
      </p>
      <div className="language-other">
        <label>
          Another language, by code
          <input value={other} maxLength={16} placeholder="el-GR" onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        </label>
        <Button type="button" variant="outline" disabled={!other.trim()} onClick={add}>
          Add
        </Button>
      </div>
      {note && <small role="alert">{note}</small>}
    </fieldset>
  );
}
function AxisField({ label, hint, values, onChange }: { label: string; hint?: string; values: readonly (string | number)[]; onChange: (values: string[]) => void }) {
  const [raw, setRaw] = useState(values.join(", "));
  return (
    <label>
      {label}
      <input
        value={raw}
        maxLength={1200}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          );
        }}
      />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
