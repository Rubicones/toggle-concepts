"use client";
// The three decisions an art director makes during a run, shown as things to look at rather than data to read:
// is this our brand, which story, which look to build.
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, Hammer, MessageSquareWarning, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { studioRequest, useShared } from "@/lib/shared-http";
import { applyRunBrandReview, brandAcceptanceBlockers, type BrandRule, type BrandWorkspaceRecord } from "@/packages/contracts/brand-kit";
import { planningField, planningObject } from "@/packages/director/planning";
import { evidenceText, type DirectionPresentation } from "@/packages/contracts/run-presentation";
import { BrandCard } from "./brand-card";
import { BrandSheetStrip } from "./brand-sheet";
import { PlanningOutput } from "./planning-output";
import styles from "./run-decisions.module.css";

type Command = (value: unknown) => Promise<boolean>;
type Verdict = { conceptId: string; verdict: "strong" | "revise"; problems: string };

const humanKey = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[._-]+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
const hexes = (text: string) => [...new Set((text.match(/#[0-9a-f]{6}\b/gi) ?? []).map((h) => h.toLowerCase()))];
const categoryTitle: Record<string, string> = {
  logo: "Logo",
  product: "Product",
  color: "Colour",
  typography: "Typography",
  spacing: "Spacing",
  layout: "Layout",
  motion: "Motion",
  imagery: "Imagery",
  voice: "Voice",
  sound: "Sound",
  prohibition: "Never",
};

/** Brand check: the brand as the agents will use it — logos, colours, type, voice — then one approval. */
export function BrandCheck({ campaignId, name, busy, command }: { campaignId: string; name: string; busy: boolean; command: Command }) {
  const fields = `/api/studio/campaigns/${campaignId}/brand-fields`;
  const { data, error } = useShared<BrandWorkspaceRecord>(`/api/studio/campaigns/${campaignId}/brand-kit`),
    [confirm, setConfirm] = useState(false),
    [fallback, setFallback] = useState(true),
    [fontRights, setFontRights] = useState<string | null>(null);
  const reviewer = name.trim() || "Art director";
  const rules = (data?.draft?.payload.rules ?? []).filter((r) => r.decision !== "rejected" && r.value.trim() && !/^\{|\[/.test(r.value.trim()));
  const added = rules.filter((r) => r.provenance.kind === "proposal");
  const remaining =
    data?.draft && data.c1
      ? brandAcceptanceBlockers(
          applyRunBrandReview(data.draft.payload, { reviewerName: reviewer, note: "", fontRights: fontRights ?? undefined, fallbackRuleId: fallback ? "00000000-0000-4000-8000-000000000000" : null }),
          data.c1.payload.scope.locales,
          data.c1.id,
          data.assets,
          data.materials ?? [],
        )
      : [];
  return (
    <section className={styles.decision} aria-label="Brand check">
      <header className={styles.head}>
        <p className={styles.eyebrow}>YOUR DECISION · 1 OF 3</p>
        <h3>Is this your brand?</h3>
        <p>
          This is exactly what the agents will design with: your logos, colours, typefaces and voice, taken from the brandbook. Approve it and the stories start.
          {added.length ? ` The agents filled ${added.length} gaps themselves — they are listed below.` : ""}
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      <BrandCard endpoint={fields} busy readOnly review={async () => undefined} />
      {added.length > 0 && <AddedRules rules={added} />}
      <BrandSheetStrip
        endpoint={fields}
        busy={busy}
        build={async () => {
          await studioRequest(fields, "POST", { action: "buildSheet" }).catch(() => undefined);
        }}
      />
      {rules.length > 0 && (
        <Disclosure>
          <summary>All {rules.length} brand rules, as text</summary>
          <RuleList rules={rules} />
        </Disclosure>
      )}
      <div className={styles.approve}>
        {remaining.length > 0 && (
          <div className={styles.warn} role="alert">
            <strong>Fix before approving</strong>
            {remaining.slice(0, 5).map((b, i) => (
              <p key={i}>{b}</p>
            ))}
            <Link className="text-link" href={`/campaigns/${campaignId}/brand-kit`}>
              Open the brandbook
            </Link>
          </div>
        )}
        <label className={styles.check}>
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span>This is our brand, and we may use these fonts and files.</span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} />
          <span>If a brand font can’t be loaded, previews may use a neutral stand-in.</span>
        </label>
        <Disclosure>
          <summary>Font licence note (optional)</summary>
          <textarea
            rows={2}
            maxLength={2000}
            aria-label="Font licence note"
            placeholder="Where the font licence comes from…"
            value={fontRights ?? data?.draft?.payload.fontRights ?? ""}
            onChange={(e) => setFontRights(e.target.value)}
          />
        </Disclosure>
        <div className={styles.approveRow}>
          <Button
            disabled={busy || !data || !confirm || remaining.length > 0}
            onClick={() =>
              void command({
                action: "approveBrand",
                reviewerName: reviewer,
                notes: "Reviewed the brand as the agents will use it in the run dashboard.",
                confirm: true,
                allowDraftFontFallback: fallback,
                fontRights: fontRights ?? data?.draft?.payload.fontRights ?? "",
              })
            }
          >
            <CheckCircle2 size={16} />
            Approve the brand
          </Button>
          <Link className="text-link" href={`/campaigns/${campaignId}/brand-kit`}>
            Something is wrong — fix it in the brandbook
          </Link>
        </div>
      </div>
    </section>
  );
}

/** What the agents added on top of the brandbook: colours as swatches, the rest as short statements. */
function AddedRules({ rules }: { rules: BrandRule[] }) {
  const colours = rules.filter((r) => r.category === "color" && hexes(r.value).length);
  const text = rules.filter((r) => !colours.includes(r));
  return (
    <section className={styles.added} aria-label="Added by the agents">
      <h4>
        <Sparkles size={15} /> Added by the agents
      </h4>
      <p>Your brandbook didn’t say these. The agents chose them to fit the brand; change them in the brandbook if they are wrong.</p>
      {colours.length > 0 && (
        <div className={styles.swatches}>
          {colours.map((r) => (
            <figure key={r.id}>
              <span style={{ background: hexes(r.value)[0] }} />
              <figcaption>
                <strong>{humanKey(r.key)}</strong>
                {hexes(r.value)[0]}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {text.length > 0 && <RuleList rules={text} />}
    </section>
  );
}

function RuleList({ rules }: { rules: BrandRule[] }) {
  const groups = [...new Set(rules.map((r) => r.category))];
  return (
    <div className={styles.ruleGroups}>
      {groups.map((category) => (
        <div key={category}>
          <h5>{categoryTitle[category] ?? humanKey(category)}</h5>
          <ul>
            {rules
              .filter((r) => r.category === category)
              .map((r) => (
                <li key={r.id}>
                  {hexes(r.value)[0] && <i style={{ background: hexes(r.value)[0] }} />}
                  <strong>{humanKey(r.key)}</strong>
                  <span>{r.value.length > 280 ? r.value.slice(0, 279) + "…" : r.value}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Scenario choice: three stories side by side, each chosen with one click. */
export function ScenarioChoice({
  directions,
  scenarioData,
  verdicts,
  selectedId,
  state,
  disabled,
  choose,
}: {
  directions: DirectionPresentation[];
  scenarioData: unknown;
  verdicts: Verdict[];
  selectedId: string | null;
  state: "ready" | "preparing" | "reviewing" | "migration";
  disabled: boolean;
  choose: (id: string) => void;
}) {
  const selected = directions.find((d) => d.id === selectedId);
  return (
    <section className={styles.decision} aria-label="Scenario selection">
      <header className={styles.head}>
        <p className={styles.eyebrow}>YOUR DECISION · 2 OF 3</p>
        <h3>{selected ? `Story: ${selected.title}` : "Choose the story"}</h3>
        <p>
          {selected
            ? "All three visual looks tell this story. To change it, send a change to Scenarios & story below — earlier work stays saved."
            : "Three short stories for the same product. Pick the one that sells it best; next, the agents design three different looks for it."}
        </p>
      </header>
      {state === "migration" ? (
        <p role="alert">Apply migration 20261109000100_scenario_selection.sql to enable scenario selection.</p>
      ) : state === "preparing" ? (
        <p className={styles.waiting}>
          <Clock size={15} /> The stories are being written.
        </p>
      ) : (
        <>
          {state === "reviewing" && (
            <p className={styles.waiting}>
              <Clock size={15} /> An independent reviewer is checking the stories. You can read them now and choose when the check is done.
            </p>
          )}
          <div className={styles.cards}>
            {directions.map((d, index) => {
              const verdict = verdicts.find((v) => v.conceptId === d.id);
              const end = Math.max(0, ...d.scenes.map((s) => Number(s.end)).filter(Number.isFinite)),
                seconds = Math.round(end * 10) / 10;
              return (
                <article key={d.id} className={styles.card} data-selected={d.id === selectedId || undefined} data-dim={(!!selectedId && d.id !== selectedId) || undefined}>
                  <span className={styles.badge}>Story {index + 1}</span>
                  <h4>{d.title}</h4>
                  {d.hook && <blockquote>{d.hook}</blockquote>}
                  {d.premise && <p>{d.premise}</p>}
                  {d.scenes.length > 0 && (
                    <ol className={styles.beats}>
                      {d.scenes.slice(0, 5).map((s, i) => (
                        <li key={`${s.id}:${i}`}>{s.copy || s.narration || s.visual}</li>
                      ))}
                      {d.scenes.length > 5 && <li>+{d.scenes.length - 5} more</li>}
                    </ol>
                  )}
                  <footer>
                    <small>
                      {d.scenes.length} {d.scenes.length === 1 ? "beat" : "beats"}
                      {seconds ? ` · ${seconds}s` : ""}
                      {d.cta ? ` · ends on “${d.cta}”` : ""}
                    </small>
                    {verdict && <Verdict verdict={verdict} />}
                    {!selectedId && state === "ready" && (
                      <Button disabled={disabled} onClick={() => choose(d.id)}>
                        Choose this story <ArrowRight size={14} />
                      </Button>
                    )}
                    {d.id === selectedId && (
                      <span className={styles.chosen}>
                        <CheckCircle2 size={15} /> Chosen
                      </span>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
          {scenarioData != null && (
            <Disclosure>
              <summary>Read the stories in full · scene by scene</summary>
              <PlanningOutput value={scenarioData} />
            </Disclosure>
          )}
        </>
      )}
    </section>
  );
}

function Verdict({ verdict }: { verdict: Verdict }) {
  return verdict.verdict === "strong" ? (
    <span className={styles.verdict} data-tone="good" title="Independent creative review">
      <CheckCircle2 size={13} /> Reviewer: strong
    </span>
  ) : (
    <span className={styles.verdict} data-tone="warn" title={verdict.problems}>
      <MessageSquareWarning size={13} /> Reviewer: {verdict.problems ? verdict.problems.slice(0, 90) + (verdict.problems.length > 90 ? "…" : "") : "needs work"}
    </span>
  );
}

type Treatment = { conceptId: string; name: string; facets: [string, string][]; idea: string; palette: string[]; pictures: string[]; stand: string[] };
const facetOrder: [string, string][] = [
  ["makingTechnique", "How it is made"],
  ["composition", "Composition"],
  ["paletteAndLighting", "Colour & light"],
  ["typographyTreatment", "Typography"],
  ["lensAndCamera", "Camera"],
  ["productScale", "The product in frame"],
  ["visualHierarchy", "What you see first"],
  ["motionLanguage", "In the final, it moves like"],
];
/** Treatments from the visual-direction output, in the order the drafts are built (direction 1, 2, 3). */
export function visualTreatments(value: unknown): Treatment[] {
  const list = planningField(planningObject(value), ["treatments", "visualTreatments"]);
  if (!Array.isArray(list)) return [];
  return list
    .map((row, index) => {
      const o = planningObject(row),
        text = (key: string) => evidenceText(o[key]).trim();
      return {
        conceptId: text("conceptId") || `concept-${index + 1}`,
        name: text("name") || `Look ${index + 1}`,
        idea: text("visualIdea"),
        facets: facetOrder.map(([key, label]) => [label, text(key)] as [string, string]).filter(([, v]) => v),
        palette: hexes(text("paletteAndLighting")),
        pictures: (Array.isArray(o.assetPromptBriefs) ? o.assetPromptBriefs : []).map((p) => evidenceText(p)).filter(Boolean),
        stand: (Array.isArray(o.proxyContracts) ? o.proxyContracts : []).map((p) => evidenceText(p)).filter(Boolean),
      };
    })
    .sort((a, b) => a.conceptId.localeCompare(b.conceptId));
}

/** Visual looks: three treatments of the chosen story compared facet by facet, each buildable on its own. */
export function VisualTreatments({
  treatments,
  verdicts,
  built,
  campaignId,
  canBuild,
  busy,
  build,
}: {
  treatments: Treatment[];
  verdicts: Verdict[];
  built: Set<number>;
  campaignId: string;
  canBuild: boolean;
  busy: boolean;
  build: (index: number) => void;
}) {
  const [facet, setFacet] = useState<string | null>(null);
  const { data: card } = useShared<{ palette: { value: string }[] }>(`/api/studio/campaigns/${campaignId}/brand-fields?card=1`, { live: false });
  const brandPalette = (card?.palette ?? []).map((p) => p.value).filter((v) => /^#[0-9a-f]{3,8}$/i.test(v));
  if (!treatments.length) return null;
  const facets = facetOrder.map(([, label]) => label).filter((label) => treatments.some((t) => t.facets.some(([l]) => l === label)));
  return (
    <section className={styles.decision} aria-label="Visual looks">
      <header className={styles.head}>
        <p className={styles.eyebrow}>YOUR DECISION · 3 OF 3</p>
        <h3>Pick the look to build</h3>
        <p>
          Three different ways to show the same story. Compare them side by side, then build the one you believe in — or all three. A build makes a
          near-final draft with real pictures; you see the price before anything starts.
        </p>
      </header>
      <div className={styles.compare} role="group" aria-label="Compare by">
        <span>Compare by</span>
        <button type="button" aria-pressed={facet === null} onClick={() => setFacet(null)}>
          Everything
        </button>
        {facets.map((label) => (
          <button type="button" key={label} aria-pressed={facet === label} onClick={() => setFacet(label)}>
            {label}
          </button>
        ))}
      </div>
      <div className={styles.cards}>
        {treatments.map((t, index) => {
          const verdict = verdicts.find((v) => v.conceptId === t.conceptId),
            palette = t.palette.length ? t.palette : [],
            shown = facet ? t.facets.filter(([label]) => label === facet) : t.facets;
          return (
            <article key={t.conceptId} className={styles.card} data-look>
              <div className={styles.mood} aria-hidden>
                {(palette.length ? palette : brandPalette).slice(0, 6).map((hex) => (
                  <i key={hex} style={{ background: hex }} />
                ))}
                {!palette.length && !brandPalette.length && <i className={styles.moodEmpty} />}
              </div>
              <span className={styles.badge}>Look {index + 1}</span>
              <h4>{t.name}</h4>
              {t.idea && <p className={styles.idea}>{t.idea}</p>}
              <dl className={styles.facets}>
                {shown.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {!facet && t.pictures.length > 0 && (
                <Disclosure>
                  <summary>Pictures it will make · {t.pictures.length}</summary>
                  <ul className={styles.pictures}>
                    {t.pictures.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                  {t.stand.length > 0 && (
                    <>
                      <p className={styles.note}>In the draft, stills stand in for these; the final replaces them:</p>
                      <ul className={styles.pictures}>
                        {t.stand.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </Disclosure>
              )}
              <footer>
                {verdict && <Verdict verdict={verdict} />}
                {built.has(index) ? (
                  <Button variant="outline" onClick={() => document.getElementById("draft-directions")?.scrollIntoView({ block: "start", behavior: "smooth" })}>
                    See the draft <ArrowRight size={14} />
                  </Button>
                ) : (
                  canBuild && (
                    <Button disabled={busy} onClick={() => build(index)}>
                      <Hammer size={14} /> Build this look
                    </Button>
                  )
                )}
              </footer>
            </article>
          );
        })}
      </div>
      {!palette(treatments) && brandPalette.length > 0 && <p className={styles.note}>Colour strips show your brand palette; each look uses it in its own way.</p>}
    </section>
  );
}
const palette = (treatments: Treatment[]) => treatments.some((t) => t.palette.length);
