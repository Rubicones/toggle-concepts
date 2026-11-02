"use client";
import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShared } from "@/lib/shared-http";
import type { BrandCard as Card, CardFinding } from "@/packages/brand/brand-card";

/** The brand as the agents will receive it. Text values are edited in place (saved as the AD's version of that finding). */
export function BrandCard({ endpoint, busy, review: save }: { endpoint: string; busy: boolean; review: (finding: CardFinding, value: string) => Promise<void> }) {
  const { data, error, refresh } = useShared<Card>(`${endpoint}?card=1`);
  const review = async (finding: CardFinding, value: string) => { await save(finding, value); refresh(); };
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Building your brand card…</p>;
  const asset = (id: string, ground?: "dark" | "light") => `${endpoint}?asset=${id}${ground ? `&ground=${ground}` : ""}`;
  const families = data.fonts.flatMap((f) => f.files.map((file) => `@font-face{font-family:"card-${f.family}";font-weight:${file.weight};font-style:${file.style};src:url("${asset(file.id)}")}`)).join("");
  return (
    <section className="brand-card" aria-label="Your brand as the agents will see it">
      <style>{families}</style>
      <header>
        <p className="eyebrow">YOUR BRAND, AS THE AGENTS WILL SEE IT</p>
        <Editable label="Name" finding={data.name} busy={busy} review={review} heading />
        <Editable label="What it is" finding={data.description} busy={busy} review={review} />
      </header>
      <div className="brand-card-checks">
        {data.checks.map((c) => (
          <p key={c.text} className={c.ok ? "is-ok" : "is-warning"}>
            {c.ok ? <Check size={14} /> : <TriangleAlert size={14} />} {c.text}
          </p>
        ))}
      </div>
      {!!data.logos.length && (
        <div className="brand-card-section">
          <h4>Logos</h4>
          <div className="brand-card-logos">
            {data.logos.map((l) =>
              (["dark", "light"] as const).map((ground) => (
                <figure key={`${l.id}-${ground}`} className={`brand-card-ground is-${ground}`} style={{ background: ground === "dark" ? "#111" : "#fff", padding: 16 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset(l.id, l.delegatesColour ? ground : undefined)} alt={`${l.file} on a ${ground} ground`} style={{ maxHeight: 48, maxWidth: "100%" }} />
                  <figcaption style={{ color: ground === "dark" ? "#ccc" : "#333" }}>{l.file} · on {ground}</figcaption>
                </figure>
              )),
            )}
          </div>
        </div>
      )}
      {!!data.palette.length && (
        <div className="brand-card-section">
          <h4>Colours</h4>
          <div className="brand-card-palette" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {data.palette.map((p) => (
              <figure key={p.role} style={{ margin: 0 }}>
                <span style={{ display: "block", width: 72, height: 48, background: p.value, border: "1px solid #8884" }} />
                <figcaption>
                  {p.role} {p.value}
                  <br />
                  <small>{p.file}</small>
                </figcaption>
              </figure>
            ))}
          </div>
          {data.contrast.inkOnPaper !== null && <p>Text on background {data.contrast.inkOnPaper}:1{data.contrast.accentOnPaper !== null ? ` · accent on background ${data.contrast.accentOnPaper}:1` : ""}</p>}
        </div>
      )}
      {!!data.fonts.length && (
        <div className="brand-card-section">
          <h4>Typefaces (your files)</h4>
          {data.fonts.map((f) => (
            <div key={f.family}>
              {f.weights.map((w) => (
                <p key={w} style={{ fontFamily: `"card-${f.family}", sans-serif`, fontWeight: w, fontSize: 22, margin: "4px 0" }}>
                  {f.family} {w} — Every take, every version.
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
      {[
        ["Voice", data.voice],
        ["Say / don’t say", data.vocabulary],
        ["Never", data.rules],
      ].map(([label, list]) =>
        (list as CardFinding[]).length ? (
          <div key={label as string} className="brand-card-section">
            <h4>{label as string}</h4>
            {(list as CardFinding[]).map((f) => (
              <Editable key={f.findingId} finding={f} busy={busy} review={review} />
            ))}
          </div>
        ) : null,
      )}
      <div className="brand-card-section">
        <h4>Product</h4>
        <Editable finding={data.product} busy={busy} review={review} />
        {!!data.screenshots.length && <p><small>Evidence for interface mockups: {data.screenshots.map((s) => s.file).join(", ")}</small></p>}
      </div>
    </section>
  );
}

function Editable({ label, finding, busy, review, heading }: { label?: string; finding: CardFinding | null; busy: boolean; review: (finding: CardFinding, value: string) => Promise<void>; heading?: boolean }) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(finding?.value ?? "");
  if (!finding) return label ? <p><strong>{label}:</strong> <em>not found — the brand agent will propose it</em></p> : null;
  if (editing)
    return (
      <div className="brand-card-edit">
        {label && <strong>{label}</strong>}
        <textarea value={value} rows={heading ? 1 : 3} onChange={(e) => setValue(e.target.value)} />
        <Button disabled={busy || !value.trim()} onClick={() => void review(finding, value.trim()).then(() => setEditing(false))}>Save</Button>
        <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    );
  return (
    <div className="brand-card-value">
      {label && <strong>{label}: </strong>}
      {heading ? <h2 style={{ display: "inline" }}>{finding.value}</h2> : <span>{finding.value}</span>}{" "}
      <small title={finding.file}>({finding.file})</small>{" "}
      <button type="button" className="text-link" onClick={() => { setValue(finding.value); setEditing(true); }}>Edit</button>
    </div>
  );
}
