"use client";
import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShared } from "@/lib/shared-http";
import type { BrandCard as Card, CardFinding } from "@/packages/brand/brand-card";
import type { BrandAnalysisView } from "@/packages/brand/field-extraction";
import { materialRoleLabels, materialRoles, type MaterialRole } from "@/packages/brand/material-roles";
import styles from "./brand-card.module.css";

type Review = (finding: { findingId: string; version: number }, value: string | null) => Promise<void>;

/** The brand as the agents will receive it. Text values are edited in place (saved as the AD's version of that finding). */
export function BrandCard({ endpoint, busy, review: save, readOnly = false }: { endpoint: string; busy: boolean; review: Review; readOnly?: boolean }) {
  const { data, error, refresh } = useShared<Card>(`${endpoint}?card=1`);
  const review: Review = async (finding, value) => {
    await save(finding, value);
    refresh();
  };
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Building your brand card…</p>;
  const asset = (id: string, ground?: "dark" | "light") => `${endpoint}?asset=${id}${ground ? `&ground=${ground}` : ""}`;
  const faces = data.fonts.flatMap((f) => f.files.map((file) => `@font-face{font-family:"card-${f.family}";font-weight:${file.weight};font-style:${file.style};src:url("${asset(file.id)}")}`)).join("");
  const lists: [string, CardFinding[]][] = [
    ["Voice", data.voice],
    ["Say / don’t say", data.vocabulary],
    ["Never", data.rules],
  ];
  return (
    <section className={styles.card} aria-label="Your brand as the agents will see it">
      <style>{faces}</style>
      <header className={styles.cardHead}>
        <p className="eyebrow">YOUR BRAND, AS THE AGENTS WILL SEE IT</p>
        <Editable finding={data.name} busy={busy} review={review} readOnly={readOnly} heading empty="Name not found — the brand agent will propose it" />
        <Editable finding={data.description} busy={busy} review={review} readOnly={readOnly} empty="No description found" />
      </header>
      {!readOnly && <ul className={styles.checks} aria-label="Checks before submitting">
        {data.checks.map((c) => (
          <li key={c.text} className={`${styles.check} ${c.ok ? styles.ok : styles.warn}`}>
            {c.ok ? <Check size={15} /> : <TriangleAlert size={15} />}
            <span>{c.text}</span>
          </li>
        ))}
      </ul>}
      <div className={styles.grid}>
        <div className={styles.section}>
          <h4>Logos</h4>
          {data.logos.length ? (
            <div className={styles.logos}>
              {data.logos.flatMap((l) =>
                (["dark", "light"] as const).map((ground) => (
                  <figure key={`${l.id}-${ground}`} className={`${styles.ground} ${styles[ground]}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset(l.id, l.delegatesColour ? ground : undefined)} alt={`${l.file} on a ${ground} background`} />
                    <figcaption>{l.file}</figcaption>
                  </figure>
                )),
              )}
            </div>
          ) : (
            <p className={styles.empty}>No logo file yet.</p>
          )}
        </div>
        <div className={styles.section}>
          <h4>Colours</h4>
          {data.palette.length ? (
            <>
              <div className={styles.swatches}>
                {data.palette.map((p) => (
                  <figure key={p.role} className={styles.swatch}>
                    <span style={{ background: p.value }} />
                    <figcaption>
                      <strong>{p.role === "paper" ? "Background" : p.role === "ink" ? "Text" : "Accent"}</strong> {p.value}
                      <br />
                      <small>{p.file}</small>
                    </figcaption>
                  </figure>
                ))}
              </div>
              {data.contrast.inkOnPaper !== null && (
                <p className={styles.source}>
                  Text on background {data.contrast.inkOnPaper}:1
                  {data.contrast.accentOnPaper !== null ? ` · accent on background ${data.contrast.accentOnPaper}:1` : ""}
                </p>
              )}
            </>
          ) : (
            <p className={styles.empty}>No colour values found.</p>
          )}
        </div>
        <div className={styles.section}>
          <h4>Typefaces from your files</h4>
          {data.fonts.length ? (
            data.fonts.flatMap((f) =>
              f.weights.map((w) => (
                <p key={`${f.family}-${w}`} className={styles.specimen} style={{ fontFamily: `"card-${f.family}", sans-serif`, fontWeight: w }}>
                  <small>
                    {f.family} {w}
                  </small>
                  Every take, every version.
                </p>
              )),
            )
          ) : (
            <p className={styles.empty}>No font files yet.</p>
          )}
        </div>
        <div className={styles.section}>
          <h4>Product</h4>
          <Editable finding={data.product} busy={busy} review={review} readOnly={readOnly} empty="No product description found" />
        </div>
        {(data.interfaceFiles.length > 0 || data.components.length > 0 || data.interfaceColours.length > 0) && (
          <div className={styles.section}>
            <h4>Interface components</h4>
            <p className={styles.source}>The vocabulary for interface mockups built in code. Never brand copy, never the brand palette.</p>
            {data.interfaceFiles.length > 0 && (
              <div className={styles.logos}>
                {data.interfaceFiles.map((f) => (
                  <figure key={f.id} className={styles.ground}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset(f.id)} alt={`${f.role === "uikit" ? "UI kit" : "Screenshot"}: ${f.file}`} />
                    <figcaption>{f.file}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            {data.components.map((f) => (
              <Editable key={f.findingId} finding={f} busy={busy} review={review} readOnly={readOnly} />
            ))}
            {data.interfaceColours.length > 0 && (
              <div className={styles.swatches}>
                {data.interfaceColours.map((c) => (
                  <figure key={c.value} className={styles.swatch}>
                    <span style={{ background: c.value }} />
                    <figcaption>
                      <strong>{c.label || "Interface"}</strong> {c.value}
                      <br />
                      <small>{c.file}</small>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        )}
        {lists.map(([label, list]) =>
          list.length ? (
            <div key={label} className={styles.section}>
              <h4>{label}</h4>
              {list.map((f) => (
                <Editable key={f.findingId} finding={f} busy={busy} review={review} readOnly={readOnly} />
              ))}
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

function Editable({ finding, busy, review, heading, empty, readOnly = false }: { finding: CardFinding | null; busy: boolean; review: Review; heading?: boolean; empty?: string; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(finding?.value ?? "");
  if (!finding) return empty ? <p className={styles.empty}>{empty}</p> : null;
  if (editing)
    return (
      <div className={styles.editor}>
        <textarea value={value} rows={heading ? 1 : 3} onChange={(e) => setValue(e.target.value)} aria-label="Edit value" />
        <div>
          <Button disabled={busy || !value.trim()} onClick={() => void review(finding, value.trim()).then(() => setEditing(false))}>
            Save
          </Button>
          <Button variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  const text = heading ? <h2>{finding.value}</h2> : <span>{finding.value}</span>;
  return (
    <div className={heading ? undefined : styles.item}>
      {text}
      <span className={styles.source} title={finding.file} style={{ flex: "none" }}>
        {finding.file}
      </span>
      {!readOnly && <button
        type="button"
        className={styles.edit}
        onClick={() => {
          setValue(finding.value);
          setEditing(true);
        }}
      >
        Edit
      </button>}
    </div>
  );
}

/** “Already prepared this brand?” — reuse a brand from another campaign. */
export function BrandLibraryPicker({ options, busy, choose }: { options: NonNullable<BrandAnalysisView["brandOptions"]>; busy: boolean; choose: (id: string) => void }) {
  return (
    <div className={styles.library}>
      <p>
        Already prepared this brand in another campaign?
        <small>Use it here instead of uploading the files again. Its brandbook stays in one place.</small>
      </p>
      <select className={styles.select} disabled={busy} value="" onChange={(e) => e.target.value && choose(e.target.value)} aria-label="Use a brand from the library">
        <option value="">Use a brand from the library…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.brand} — {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Where files disagree: questions first, then automatic choices with the other values one click away. */
export function BrandDisagreements({ decisions, fields, busy, keep }: { decisions: NonNullable<BrandAnalysisView["decisions"]>; fields: BrandAnalysisView["fields"]; busy: boolean; keep: (o: { findingId: string; version: number }) => void }) {
  const questions = decisions.filter((d) => d.question).length;
  return (
    <section className={`${styles.panel} ${questions ? styles.question : ""}`} aria-label="Where your files disagree">
      <h3>{questions ? `${questions} ${questions === 1 ? "question" : "questions"} about your files` : "Where your files disagree"}</h3>
      <p>{questions ? "Your files say different things with the same authority. Pick the right one." : "The more authoritative file was used. Switch if it is wrong."}</p>
      <ul className={styles.decisions}>
        {decisions.map((d) => {
          const label = fields.find((f) => f.key === d.field)?.label ?? d.field;
          return (
            <li key={d.field} className={styles.decision}>
              <strong>{label}</strong>
              {d.question ? (
                <div className={styles.options}>
                  {d.options.map((o) => (
                    <button key={o.findingId} type="button" className={styles.chip} disabled={busy} onClick={() => keep(o)} title={o.file}>
                      {o.value.slice(0, 60)} <span className={styles.source}>· {o.file}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className={styles.chosen}>
                    <span className={styles.value}>{d.chosen.value.slice(0, 60)}</span>
                    <span className={styles.source}>from {d.chosen.file}</span>
                  </div>
                  <div className={styles.others}>
                    Other files say:
                    {d.others.slice(0, 4).map((o) => (
                      <button key={o.findingId} type="button" className={styles.chip} disabled={busy} onClick={() => keep(o)} title={`Use this instead (${o.file})`}>
                        {o.value.slice(0, 40)}
                      </button>
                    ))}
                    {d.others.length > 4 && <span>+{d.others.length - 4} more</span>}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What each file is: unsure files first, each with its role. */
export function BrandFileRoles({ materials, busy, setRole }: { materials: NonNullable<BrandAnalysisView["materials"]>; busy: boolean; setRole: (id: string, role: MaterialRole | null) => void }) {
  const unsure = materials.filter((m) => !m.sure).length;
  return (
    <section className={`${styles.panel} ${unsure ? styles.question : ""}`} aria-label="What each file is">
      <h3>{unsure ? `${unsure} ${unsure === 1 ? "file needs" : "files need"} your answer` : "What each file is"}</h3>
      <p>A file is read and trusted as its kind. A screenshot can still name the product; its texts and colours count as the interface, not as brand rules.</p>
      <ul className={styles.roles}>
        {[...materials]
          .sort((a, b) => Number(a.sure) - Number(b.sure) || a.filename.localeCompare(b.filename))
          .map((m) => (
            <li key={m.id} className={`${styles.role} ${m.sure ? "" : styles.unsure}`}>
              <span title={m.path}>
                {m.filename}
                {!m.sure && <em className={styles.badge}>Which is this?</em>}
              </span>
              <select className={styles.select} aria-label={`What ${m.filename} is`} disabled={busy} value={m.sure ? m.role : ""} onChange={(e) => setRole(m.id, (e.target.value || null) as MaterialRole | null)}>
                {!m.sure && <option value="">Choose… (guess: {materialRoleLabels[m.role].toLowerCase()})</option>}
                {materialRoles
                  .filter((r) => r !== "unknown")
                  .map((r) => (
                    <option key={r} value={r}>
                      {materialRoleLabels[r]}
                    </option>
                  ))}
              </select>
            </li>
          ))}
      </ul>
    </section>
  );
}
