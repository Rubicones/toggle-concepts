"use client";
import {Disclosure} from '@/components/ui/disclosure';
import {Select} from '@/components/ui/select';
import {CreativeReadiness} from './creative-readiness';
import { ProviderFailure } from "./provider-failure";
import { BrandIntake } from "./brand-intake";
import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { studioRequest, useShared } from "@/lib/shared-http";
import { usePersistedDraft } from "@/lib/use-persisted-draft";
import { SaveStatus } from "./save-status";
import { money } from "@/packages/contracts/shared";
import {
  brandCategories,
  brandDraftSchema,
  brandAcceptanceBlockers,
  brandTokens,
  emptyBrandDraft,
  newBrandRule,
  requiredBrandRules,
  type BrandDraft,
  type BrandRule,
  type BrandWorkspaceRecord,
  type BrandRevision,
} from "@/packages/contracts/brand-kit";
import { WorkflowMigration } from "./brief-workspace";

function TokenPreview({ draft }: { draft: BrandDraft }) {
  return (
    <div className="brand-token-grid">
      {Object.entries(brandTokens(draft)).flatMap(([category, values]) =>
        Object.entries(values).map(([key, token]) => (
          <article key={`${category}.${key}`}>
            <span className="eyebrow">
              {category}.{key}
            </span>
            {category === "color" && /^#[a-fA-F0-9]{6,8}$/.test(token.value) && <span className="brand-swatch" style={{ backgroundColor: token.value }} />}
            <p>{token.value}</p>
            <small>Origin: {token.originStatus} · campaign rule</small>
          </article>
        )),
      )}
    </div>
  );
}
export function BrandWorkspace({ campaignId, onChanged }: { campaignId: string; onChanged: () => void }) {
  const { data, error, refresh } = useShared<BrandWorkspaceRecord>(`/api/studio/campaigns/${campaignId}/brand-kit`);
  if (!data)
    return error ? (
      <section className="detail-panel">
        <p role="alert">{error}</p>
        <Button onClick={refresh}>Retry loading Brand Kit</Button>
      </section>
    ) : (
      <p role="status">Loading Brand Kit…</p>
    );
  return (
    <>
      {error && (
        <section className="notice" role="alert">
          <p>{error} Showing the last loaded Brand Kit.</p>
          <Button variant="outline" onClick={refresh}>
            Retry loading Brand Kit
          </Button>
        </section>
      )}
      <BrandWorkspaceContent campaignId={campaignId} onChanged={onChanged} data={data} refresh={refresh} />
    </>
  );
}
function BrandWorkspaceContent({
  campaignId,
  onChanged,
  data,
  refresh,
}: {
  campaignId: string;
  onChanged: () => void;
  data: BrandWorkspaceRecord;
  refresh: () => void;
}) {
  if (!data.schemaReady) return <WorkflowMigration stage={data.c1SchemaReady ? "A1" : "C1"} />;
  const accepted = data.c1 ? data.reviews.find((r) => r.decision === "accepted" && r.round_no === (data.draft?.round_no ?? 1)) : undefined,
    acceptedRevision = data.revisions.find((r) => r.id === accepted?.brand_revision_id);
  const changed = () => {
    refresh();
    onChanged();
  };
  // Step 1 is only: drop files, choose in each field, continue. Rule-level A1 tools stay available below.
  return (
    <>
      {data.creativeReadiness&&<CreativeReadiness value={data.creativeReadiness} onGraphicChange={data.draft?async graphics=>{const draft=structuredClone(data.draft!.payload),key='graphicVocabulary',existing=draft.rules.find(r=>r.category==='layout'&&r.key===key),rule={...newBrandRule('layout',key,existing?.id??crypto.randomUUID()),value:JSON.stringify(graphics),status:'provided' as const,decision:'accepted' as const,sourceVerified:true,provenance:{kind:'ad_instruction' as const,sourceId:null,locator:'AD graphic defaults editor'},reason:'Graphic defaults selected by the art director.'};draft.rules=[...draft.rules.filter(r=>r.id!==existing?.id),rule];await studioRequest(`/api/studio/campaigns/${campaignId}/brand-kit`,'PUT',{expectedVersion:data.draft!.version,draft:brandDraftSchema.parse(draft)});changed();}:undefined}/>}
      {data.draftReplay && (
        <section className="notice">
          <strong>Client feedback · round {data.draftReplay.roundNo}.</strong> {data.draftReplay.feedback?.comments} Update your choices, then continue.
        </section>
      )}
      <BrandIntake campaignId={campaignId} kitVersion={data.draft?.version ?? 0} onKitApplied={changed} />
      {data.c1 && (
        <Disclosure className="brand-advanced">
          <summary>Advanced · campaign brand rules{accepted ? " (approved)" : ""} and history</summary>
          {accepted && acceptedRevision ? (
            <section className="detail-panel">
              <Badge variant="blue">Approved for this run</Badge>
              <p>
                Revision {acceptedRevision.revision_no} · {accepted.payload.reviewerName} · {new Date(accepted.created_at).toLocaleString("en-GB")}
              </p>
              <TokenPreview draft={acceptedRevision.payload.kit} />
            </section>
          ) : (
            <BrandEditor key={`${campaignId}-${data.draft?.round_no ?? 1}-${data.draft?.payload.intakeStepId ?? "manual"}`} campaignId={campaignId} data={data} onChanged={changed} />
          )}
          <BrandHistory data={data} />
        </Disclosure>
      )}
    </>
  );
}
function BrandHistory({ data }: { data: BrandWorkspaceRecord }) {
  return (
    <section className="detail-panel">
      <h2>Immutable kit revisions & A1 decisions</h2>
      {!data.revisions.length && <p>No published Brand Kit revision yet.</p>}
      {data.revisions.map((revision) => (
        <article className="saved-notes" key={revision.id}>
          <h3>
            Revision {revision.revision_no} · {revision.payload.blockers.length} acceptance blockers
          </h3>
          <code>SHA-256 {revision.sha256}</code>
          {data.reviews
            .filter((r) => r.brand_revision_id === revision.id)
            .map((r) => (
              <p key={r.id}>
                <Badge variant="blue">{r.decision === "accepted" ? "A1 accepted" : "A1 changes requested"}</Badge> {r.payload.reviewerName} ·{" "}
                {r.payload.comments}
              </p>
            ))}
          <Disclosure>
            <summary>Revision, sources and tokens</summary>
            <TokenPreview draft={revision.payload.kit} />
            <pre className="shared-output">{JSON.stringify(revision.payload, null, 2)}</pre>
          </Disclosure>
        </article>
      ))}
    </section>
  );
}
function BrandEditor({ campaignId, data, onChanged }: { campaignId: string; data: BrandWorkspaceRecord; onChanged: () => void }) {
  const c1 = data.c1!;
  const persisted = usePersistedDraft<BrandDraft>({
    key: `/api/studio/campaigns/${campaignId}/brand-kit`,
    initial: data.draft?.payload ?? emptyBrandDraft(c1.payload.scope.locales),
    initialVersion: data.draft?.version ?? 0,
    label: "Brand Kit",
    href: `/campaigns/${campaignId}/brand-kit`,
    write: async (draft, version) => {
      const parsed = brandDraftSchema.safeParse(draft);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" "),
        );
      const result = await studioRequest<{ version: number }>(`/api/studio/campaigns/${campaignId}/brand-kit`, "PUT", {
        expectedVersion: version,
        draft: parsed.data,
      });
      return result.version;
    },
  });
  const { value: draft, setValue: setDraft, version, dirty } = persisted;
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [correction, setCorrection] = useState("");
  const pendingProposal = useRef<{ signature: string; id: string } | null>(null),
    pendingPublish = useRef<{ version: number; id: string } | null>(null);
  const blockers = brandAcceptanceBlockers(draft, c1.payload.scope.locales, c1.id, data.assets, data.materials ?? []),
    latest = data.revisions[0];
  const set = <K extends keyof BrandDraft>(key: K, value: BrandDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const updateRule = (id: string, patch: Partial<BrandRule>) =>
    set(
      "rules",
      draft.rules.map((r) =>
        r.id === id
          ? { ...r, ...patch, ...(["value", "category", "key", "status", "provenance"].some((k) => k in patch) ? { sourceVerified: false } : {}) }
          : r,
      ),
    );
  const save = persisted.save;
  const ensureSaved = save;
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The Brand Kit action failed.");
    } finally {
      setBusy(false);
    }
  }
  const sourceBook = data.submittedBrandbook,
    bookLoaded = !!sourceBook && draft.brandbookImports?.some((ref) => ref.submissionId === sourceBook.id);
  const missing = requiredBrandRules.filter(([category, key]) => !draft.rules.some((r) => r.category === category && r.key === key));
  return (
    <>
      <form
        noValidate
        className="studio-form brief-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await save();
            setMessage("Brand Kit draft saved to Supabase.");
          });
        }}
      >
        <section className="detail-panel">
          {data.draft && data.draft.version > version && (
            <p className="notice">
              A newer kit draft was saved.{" "}
              <Button
                type="button"
                variant="outline"
                disabled={persisted.saving}
                onClick={() => {
                  persisted.reset(data.draft!.payload, data.draft!.version);
                }}
              >
                Load saved kit
              </Button>{" "}
              This replaces unsaved edits.
            </p>
          )}
          <SaveStatus {...persisted} retry={save} />
          <Badge variant="blue">Brand Kit · A1 workspace</Badge>
          <h2>Set the rules. Keep the authorship.</h2>
          <Link className="text-link" href={`/campaigns/${campaignId}/brief`}>
            Review frozen C1 scope and constraints
          </Link>
          <p>
            Sources, AD instructions and campaign extensions stay explicit. Save incomplete work; publish an exact revision before the art director records A1.
          </p>
          <p className="muted">
            C1 {c1.id} · saved draft {version || "—"}
            {dirty ? " · unsaved edits" : ""}. A1 is an AD review within the existing client stages.
          </p>
          <Button type="submit" disabled={busy}>
            Save Brand Kit draft
          </Button>
          <p role="status">{message}</p>
        </section>
        {sourceBook && (
          <section className="detail-panel">
            <Badge variant="blue">Submitted brandbook · v{sourceBook.version_no}</Badge>
            <h3>Your saved findings, ready for A1.</h3>
            <p>
              {sourceBook.summary.findings} findings remain in the source book. Load them into the working kit without another AI analysis. Existing authored
              values stay intact; imported rules still need review.
            </p>
            <Button
              type="button"
              disabled={busy || bookLoaded}
              onClick={() =>
                void act(async () => {
                  const current = await ensureSaved();
                  const result = await studioRequest<{ draft: BrandDraft; version: number; message: string }>(
                    `/api/studio/campaigns/${campaignId}/brand-kit`,
                    "POST",
                    { action: "importBrandbook", expectedVersion: current, submissionId: sourceBook.id },
                  );
                  persisted.reset(result.draft, result.version);
                  setMessage(result.message);
                })
              }
            >
              {bookLoaded ? "Brandbook loaded" : "Load submitted brandbook · free"}
            </Button>
          </section>
        )}
        <fieldset disabled={busy}>
          <legend>1. AD direction & source material</legend>
          <label>
            Brand-extension mode
            <Select value={draft.mode} onChange={(e) => set("mode", e.target.value as BrandDraft["mode"])}>
              <option value="ad_led">AD-led extension</option>
              <option value="hybrid">Hybrid — AD boundaries, agent proposals</option>
              <option value="agent_led">Controlled agent freedom</option>
            </Select>
          </label>
          <label>
            Art director instructions
            <textarea rows={6} maxLength={8000} value={draft.instructions} onChange={(e) => set("instructions", e.target.value)} />
          </label>
          <label>
            Immutable rules and experimentation boundaries
            <textarea rows={4} maxLength={3000} value={draft.boundaries} onChange={(e) => set("boundaries", e.target.value)} />
          </label>
          <h3>Validated media sources</h3>
          <p>
            The brand pack above reads documents, font metadata and image/page previews. Here you can also attach existing validated campaign media or supply a
            precise source excerpt.
          </p>
          {data.assets.map((a) => (
            <label className="checkbox-field" key={a.id}>
              <input
                type="checkbox"
                checked={draft.sourceAssetIds.includes(a.id)}
                onChange={(e) => set("sourceAssetIds", e.target.checked ? [...draft.sourceAssetIds, a.id] : draft.sourceAssetIds.filter((id) => id !== a.id))}
              />
              <span>
                {a.filename} · SHA-256 {a.sha256.slice(0, 12)}…
              </span>
            </label>
          ))}
          {draft.links.map((link) => (
            <section className="detail-panel" key={link.id}>
              <label>
                Source title
                <input
                  value={link.title}
                  maxLength={160}
                  onChange={(e) =>
                    set(
                      "links",
                      draft.links.map((l) => (l.id === link.id ? { ...l, title: e.target.value } : l)),
                    )
                  }
                />
              </label>
              <label>
                Source URL
                <input
                  value={link.url}
                  maxLength={1000}
                  onChange={(e) =>
                    set(
                      "links",
                      draft.links.map((l) => (l.id === link.id ? { ...l, url: e.target.value } : l)),
                    )
                  }
                />
              </label>
              <label>
                Exact excerpt supplied by the AD
                <textarea
                  rows={4}
                  maxLength={6000}
                  value={link.excerpt}
                  onChange={(e) =>
                    set(
                      "links",
                      draft.links.map((l) => (l.id === link.id ? { ...l, excerpt: e.target.value } : l)),
                    )
                  }
                />
              </label>
              <p className="muted">An empty excerpt is an unfetched reference. No page-reading claim is made.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  set(
                    "links",
                    draft.links.filter((l) => l.id !== link.id),
                  )
                }
              >
                Remove source link
              </Button>
            </section>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={draft.links.length >= 12}
            onClick={() => set("links", [...draft.links, { id: crypto.randomUUID(), title: "", url: "", excerpt: "" }])}
          >
            Add source link & excerpt
          </Button>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>2. Build or correct with Gemini</legend>
          {data.budget && (
            <p>
              Run {data.budget.status} · cap {money(data.budget.cap_micro_usd)} · charged {money(data.budget.charged_micro_usd)} · reserved{" "}
              {money(data.budget.reserved_micro_usd)}. Role caps also accumulate across proposals and corrections.
            </p>
          )}
          <p>
            Uses the brand-kit model frozen at C1 and the same cumulative run/role caps. Only the explicit button submits a paid request. This advanced
            correction uses the saved kit and source summaries. Use the brand-pack build above for full document and visual analysis.
          </p>
          <label>
            Correction or focus
            <textarea
              rows={3}
              maxLength={5000}
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="Build the complete kit, or explain which rules need correction."
            />
          </label>
          <Button
            type="button"
            disabled={data.budget?.status !== "active"}
            onClick={() =>
              void act(async () => {
                const v = await ensureSaved(),
                  prompt = correction.trim() || "Build a complete campaign Brand Kit from the AD inputs and frozen C1.";
                const signature = JSON.stringify({ v, prompt });
                if (pendingProposal.current?.signature !== signature) pendingProposal.current = { signature, id: crypto.randomUUID() };
                await studioRequest(`/api/studio/runs/${c1.run_id}/steps`, "POST", {
                  role: "brand-kit",
                  prompt,
                  requestId: pendingProposal.current.id,
                  brandDraftVersion: v,
                });
                pendingProposal.current = null;
                setMessage("Proposal request recorded. Review its output below; import is explicit and never approves A1.");
              })
            }
          >
            Request Gemini proposal / correction
          </Button>
          {data.steps
            .filter((s) => s.config_snapshot.brandDraftVersion)
            .map((step) => (
              <article className="detail-panel" key={step.id}>
                <h3>Brand Kit proposal · {step.status}</h3>
                <p>
                  Input draft {step.config_snapshot.brandDraftVersion} · {step.cost_micro_usd === null ? "Cost unresolved" : money(step.cost_micro_usd)}
                </p>
                {step.error_code && <ProviderFailure code={step.error_code} output={step.output} usage={step.usage} />}
                {step.output && (
                  <Disclosure>
                    <summary>Actual model output</summary>
                    <pre className="shared-output">{step.output}</pre>
                  </Disclosure>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={persisted.saving || dirty || step.status !== "succeeded" || step.config_snapshot.brandDraftVersion !== version}
                  onClick={() =>
                    void act(async () => {
                      const result = await studioRequest<{ version: number; draft: BrandDraft }>(`/api/studio/campaigns/${campaignId}/brand-kit`, "POST", {
                        action: "import",
                        expectedVersion: version,
                        stepId: step.id,
                      });
                      persisted.reset(result.draft, result.version);
                      setMessage("Proposal replaced the draft rule list. Every rule is unreviewed; font/source confirmations remain for the AD.");
                    })
                  }
                >
                  Replace draft rules with this unreviewed proposal
                </Button>
              </article>
            ))}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>3. Rules, provenance & campaign tokens</legend>
          <p>
            Accept or reject each rule for this campaign. Accepting a proposed extension does not relabel it as an official brand guideline. Source status
            remains in the immutable record.
          </p>
          <div className="data-heading-actions">
            <Button
              type="button"
              variant="outline"
              disabled={!draft.rules.length}
              onClick={() =>
                set(
                  "rules",
                  draft.rules.map((r) => ({ ...r, decision: "accepted", sourceVerified: true })),
                )
              }
            >
              I reviewed these rules and their cited sources · accept for this campaign
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!missing.length || draft.rules.length + missing.length > 40}
              onClick={() => set("rules", [...draft.rules, ...missing.map(([category, key]) => newBrandRule(category, key, crypto.randomUUID()))])}
            >
              Add missing required rule fields
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={draft.rules.length >= 40}
              onClick={() => set("rules", [...draft.rules, newBrandRule("layout", `custom${draft.rules.length + 1}`, crypto.randomUUID())])}
            >
              Add custom rule
            </Button>
          </div>
          {draft.rules.map((rule) => (
            <section className="detail-panel" key={rule.id}>
              <div className="brief-field-grid">
                <label>
                  Category
                  <Select value={rule.category} onChange={(e) => updateRule(rule.id, { category: e.target.value as BrandRule["category"] })}>
                    {brandCategories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </label>
                <label>
                  Stable token key
                  <input value={rule.key} maxLength={80} onChange={(e) => updateRule(rule.id, { key: e.target.value })} />
                </label>
              </div>
              {data.brandbookChoices?.[rule.id]?.length && rule.brandbookSource ? (
                <label>
                  Choose a saved candidate
                  <Select
                    value=""
                    onChange={(e) => {
                      const choice = data.brandbookChoices?.[rule.id]?.[Number(e.target.value)];
                      if (choice)
                        updateRule(rule.id, {
                          value: choice.value,
                          status: choice.status,
                          decision: "unreviewed",
                          sourceVerified: false,
                          provenance: { kind: "material", sourceId: choice.materialId, locator: choice.locator },
                          brandbookSource: { submissionId: rule.brandbookSource!.submissionId, findingIds: [choice.findingId] },
                        });
                    }}
                  >
                    <option value="">Choose from the submitted brandbook…</option>
                    {data.brandbookChoices[rule.id].map((choice, index) => (
                      <option key={`${choice.findingId}-${index}`} value={index}>
                        {choice.label}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              {rule.category === "color" && /^#[a-fA-F0-9]{6,8}$/.test(rule.value) && <span className="brand-swatch" style={{ backgroundColor: rule.value }} />}
              <label>
                Rule / token value
                <textarea rows={2} value={rule.value} maxLength={2000} onChange={(e) => updateRule(rule.id, { value: e.target.value })} />
              </label>
              <div className="brief-field-grid">
                <label>
                  Origin evidence status
                  <Select value={rule.status} onChange={(e) => updateRule(rule.id, { status: e.target.value as BrandRule["status"], sourceVerified: false })}>
                    {["confirmed", "provided", "inferred", "proposed", "unknown"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </label>
                <label>
                  Campaign decision
                  <Select value={rule.decision} onChange={(e) => updateRule(rule.id, { decision: e.target.value as BrandRule["decision"] })}>
                    <option value="unreviewed">Unreviewed</option>
                    <option value="accepted">Accept for this campaign</option>
                    <option value="rejected">Reject / exclude</option>
                  </Select>
                </label>
                <label>
                  Source
                  <Select
                    value={
                      ["ad_instruction", "proposal"].includes(rule.provenance.kind)
                        ? rule.provenance.kind
                        : `${rule.provenance.kind}:${rule.provenance.sourceId}`
                    }
                    onChange={(e) => {
                      const [kind, sourceId] = e.target.value.split(":");
                      updateRule(rule.id, {
                        sourceVerified: false,
                        provenance: { ...rule.provenance, kind: kind as BrandRule["provenance"]["kind"], sourceId: sourceId ?? null },
                      });
                    }}
                  >
                    <option value="proposal">Unsourced agent proposal · needs AD decision</option>
                    <option value="ad_instruction">AD instruction / authored extension</option>
                    <option value={`c1:${c1.id}`}>Frozen C1 brief</option>
                    {data.assets
                      .filter((a) => draft.sourceAssetIds.includes(a.id))
                      .map((a) => (
                        <option key={a.id} value={`asset:${a.id}`}>
                          {a.filename}
                        </option>
                      ))}
                    {data.materials
                      ?.filter((m) => (draft.sourceMaterialIds ?? []).includes(m.id))
                      .map((m) => (
                        <option key={m.id} value={`material:${m.id}`}>
                          {m.filename} · processed brand source
                        </option>
                      ))}
                    {draft.links.map((l) => (
                      <option key={l.id} value={`link:${l.id}`}>
                        {l.title || "Untitled source link"}
                      </option>
                    ))}
                  </Select>
                </label>
                <label>
                  Exact source location / instruction reference
                  <input
                    maxLength={1000}
                    value={rule.provenance.locator}
                    onChange={(e) => updateRule(rule.id, { provenance: { ...rule.provenance, locator: e.target.value }, sourceVerified: false })}
                  />
                </label>
              </div>
              <label>
                Decision rationale
                <textarea maxLength={1000} rows={2} value={rule.reason} onChange={(e) => updateRule(rule.id, { reason: e.target.value })} />
              </label>
              <label className="checkbox-field">
                <input type="checkbox" checked={rule.sourceVerified} onChange={(e) => updateRule(rule.id, { sourceVerified: e.target.checked })} />
                <span>I checked the supplied source for this rule. This is an AD attestation.</span>
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  set(
                    "rules",
                    draft.rules.filter((r) => r.id !== rule.id),
                  )
                }
              >
                Remove rule
              </Button>
            </section>
          ))}
          <h3>Campaign tokens preview</h3>
          <TokenPreview draft={draft} />
        </fieldset>
        <fieldset disabled={busy}>
          <legend>4. Fonts, locales & conflicts</legend>
          <label>
            Font rights, allowed families and permitted substitutions
            <textarea rows={4} maxLength={2000} value={draft.fontRights} onChange={(e) => set("fontRights", e.target.value)} />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={draft.fontRightsConfirmed} onChange={(e) => set("fontRightsConfirmed", e.target.checked)} />
            <span>I checked font rights for the planned campaign use.</span>
          </label>
          {draft.localeChecks.map((check) => (
            <div key={check.locale}>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={check.verified}
                  onChange={(e) =>
                    set(
                      "localeChecks",
                      draft.localeChecks.map((c) => (c.locale === check.locale ? { ...c, verified: e.target.checked } : c)),
                    )
                  }
                />
                <span>AD checked typography/glyph coverage for {check.locale}</span>
              </label>
              <label>
                Check notes and exact font/version
                <input
                  maxLength={1000}
                  value={check.note}
                  onChange={(e) =>
                    set(
                      "localeChecks",
                      draft.localeChecks.map((c) => (c.locale === check.locale ? { ...c, note: e.target.value } : c)),
                    )
                  }
                />
              </label>
            </div>
          ))}
          <p className="muted">
            These are human attestations. Uploaded font metadata reports character coverage; it does not confirm licensing or final typography fit.
          </p>
          {draft.conflicts.map((conflict) => (
            <section className="detail-panel" key={conflict.id}>
              <label>
                Conflict
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={conflict.text}
                  onChange={(e) =>
                    set(
                      "conflicts",
                      draft.conflicts.map((c) => (c.id === conflict.id ? { ...c, text: e.target.value } : c)),
                    )
                  }
                />
              </label>
              <label>
                Resolution and decision owner
                <textarea
                  rows={2}
                  maxLength={1500}
                  value={conflict.resolution}
                  onChange={(e) =>
                    set(
                      "conflicts",
                      draft.conflicts.map((c) => (c.id === conflict.id ? { ...c, resolution: e.target.value } : c)),
                    )
                  }
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={conflict.resolved}
                  onChange={(e) =>
                    set(
                      "conflicts",
                      draft.conflicts.map((c) => (c.id === conflict.id ? { ...c, resolved: e.target.checked } : c)),
                    )
                  }
                />
                <span>Resolved by the AD</span>
              </label>
            </section>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={draft.conflicts.length >= 20}
            onClick={() => set("conflicts", [...draft.conflicts, { id: crypto.randomUUID(), text: "", resolved: false, resolution: "" }])}
          >
            Record a conflict
          </Button>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>5. Publish an exact revision for A1</legend>
          {blockers.length ? (
            <>
              <p>The draft can be published for a change-request review, but A1 acceptance remains blocked:</p>
              <ul>
                {blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Required rules and AD attestations are complete. A1 still requires the explicit review below.</p>
          )}
          <Button
            type="button"
            onClick={() =>
              void act(async () => {
                const v = await ensureSaved();
                if (pendingPublish.current?.version !== v) pendingPublish.current = { version: v, id: crypto.randomUUID() };
                await studioRequest(`/api/studio/campaigns/${campaignId}/brand-kit`, "POST", {
                  action: "publish",
                  expectedVersion: v,
                  requestId: pendingPublish.current.id,
                });
                pendingPublish.current = null;
                setMessage("Immutable Brand Kit revision published. Review that exact revision for A1.");
              })
            }
          >
            Save & publish Brand Kit revision
          </Button>
          <p role="status">{message}</p>
        </fieldset>
      </form>
      {latest && (
        <A1ReviewForm
          key={latest.id}
          revision={latest}
          campaignId={campaignId}
          disabled={busy || persisted.saving || dirty || latest.source_draft_version !== version || data.reviews.some((r) => r.brand_revision_id === latest.id)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
function A1ReviewForm({
  revision,
  campaignId,
  disabled,
  onChanged,
}: {
  revision: BrandRevision;
  campaignId: string;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [reviewerName, setReviewerName] = useState(""),
    [comments, setComments] = useState(""),
    [attestations, setAttestations] = useState({ rules: false, fonts: false, c1Constraints: false }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef<{ signature: string; id: string } | null>(null);
  async function review(decision: "accepted" | "changes_requested") {
    setBusy(true);
    try {
      const values = { decision, reviewerName, comments, attestations },
        signature = JSON.stringify(values);
      if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
      await studioRequest(`/api/studio/campaigns/${campaignId}/brand-kit`, "POST", {
        action: "review",
        revisionId: revision.id,
        requestId: pending.current.id,
        ...values,
      });
      pending.current = null;
      setMessage(decision === "accepted" ? "A1 accepted the exact revision." : "A1 requested changes. Correct the draft and publish a new revision.");
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detail-panel">
      <Badge variant="blue">Art director review · A1</Badge>
      <h2>Review revision {revision.revision_no}.</h2>
      <p>SHA-256 {revision.sha256}</p>
      <TokenPreview draft={revision.payload.kit} />
      <p className="muted">Review applies to this published revision. Unsaved edits, a newer draft or an existing decision disable it.</p>
      <form className="studio-form" onSubmit={(e) => e.preventDefault()}>
        <fieldset disabled={disabled || busy}>
          <label>
            Acting art director
            <input maxLength={160} value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} />
          </label>
          <label>
            Review notes / requested corrections
            <textarea rows={4} maxLength={4000} value={comments} onChange={(e) => setComments(e.target.value)} />
          </label>
          {(
            [
              ["rules", "I reviewed the complete kit, evidence, proposed extensions and conflict resolutions."],
              ["fonts", "I checked font rights and typography coverage for every C1 locale."],
              ["c1Constraints", "This kit preserves the submitted C1 product, claim, rights and scope constraints."],
            ] as const
          ).map(([key, label]) => (
            <label className="checkbox-field" key={key}>
              <input type="checkbox" checked={attestations[key]} onChange={(e) => setAttestations((old) => ({ ...old, [key]: e.target.checked }))} />
              <span>{label}</span>
            </label>
          ))}
          <div className="data-heading-actions">
            <Button type="button" variant="outline" disabled={!reviewerName.trim() || !comments.trim()} onClick={() => void review("changes_requested")}>
              Request changes at A1
            </Button>
            <Button
              type="button"
              disabled={!reviewerName.trim() || !comments.trim() || revision.payload.blockers.length > 0 || !Object.values(attestations).every(Boolean)}
              onClick={() => void review("accepted")}
            >
              Accept exact revision at A1
            </Button>
          </div>
        </fieldset>
      </form>
      <p role="status">{message}</p>
    </section>
  );
}
