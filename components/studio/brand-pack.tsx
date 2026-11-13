"use client";
// Chat-shaped plan C2 (second part): "What every agent sees about this brand". The AD reads the brand character the
// agents receive, edits it, swaps the signature pictures and sees how many other materials agents can ask for. Every
// save is a new version; runs keep the version they started with. Codes only under "Technical details".
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { studioRequest, useShared } from "@/lib/shared-http";
import type { BrandPackView } from "@/lib/server/brand-pack";
import styles from "./brand-card.module.css";

const MAX_SIGNATURES = 6;

export function BrandPackPanel({ campaignId }: { campaignId: string }) {
  const endpoint = `/api/studio/campaigns/${campaignId}/brand-pack`;
  const isActive = useCallback((v: BrandPackView) => v.request.state === "waiting", []);
  const { data, error, refresh } = useShared<BrandPackView>(endpoint, { isActive });
  const [choosing, setChoosing] = useState<string[] | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (error && !data) return <section className="detail-panel"><p role="alert">The brand pack could not be loaded. Refresh the page to try again.</p></section>;
  if (!data || !data.accepted) return null;
  const run = async (body: unknown, done: string) => {
    setBusy(true);
    setMessage("");
    try {
      await studioRequest(endpoint, "POST", body);
      setMessage(done);
      setChoosing(null);
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  const pack = data.pack;
  return (
    <section className="detail-panel" aria-labelledby="brand-pack-title">
      <header className={styles.sheetHead}>
        <div>
          <h3 id="brand-pack-title">What every agent sees about this brand</h3>
          <p className={styles.source}>
            Every agent of a run starts from the same short brand pack: the brand character below, a compact brand sheet (logo, colours, type,
            signature pictures and interface on a few pages) and a list of the other materials it can ask for. What you marked “Use this” comes
            first; without marks, the most telling materials are chosen automatically. A run keeps the version it started with.
          </p>
        </div>
        {pack && <Badge variant="blue">Version {pack.version}</Badge>}
      </header>
      {!data.schemaReady && (
        <p className={`${styles.sheetStatus} ${styles.warn}`}>
          <span>Showing and editing the brand pack needs a database update (the brand pack update). Until it is applied, agents read the approved brand rules in short form.</span>
        </p>
      )}
      {data.request.state === "waiting" && <p className={styles.sheetStatus} role="status"><span>The brand character is being written. This usually takes a minute or two.</span></p>}
      {data.request.state === "failed" && <p className={`${styles.sheetStatus} ${styles.warn}`}><span>The brand character could not be written. Try again; agents use the approved brand rules until it exists.</span></p>}
      {data.schemaReady && !pack && data.request.state !== "waiting" && <p className={styles.sheetStatus}><span>The brand character has not been written yet. Agents use the approved brand rules in short form until it exists.</span></p>}
      {pack && (
        <>
          <CharacterEditor key={pack.version} pack={pack} busy={busy} save={(character) => run({ action: "edit", expectedVersion: pack.version, character }, `Saved as version ${pack.version + 1}.`)} />
          <h4>Compact brand sheet</h4>
          {pack.compact.length ? (
            <ol className={styles.sheetStrip}>
              {pack.compact.map((s) => (
                <li key={s.url}><span className={styles.sheetThumb}>{/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt="" loading="lazy" /><span>{s.label}</span></span></li>
              ))}
            </ol>
          ) : (
            <p className={styles.source}>Being prepared on the studio computer. Until it is ready, agents see the signature pictures instead.</p>
          )}
          {pack.sheet.length > 0 && (
            <Disclosure>
              <summary>Full brand sheet ({pack.sheet.length} pages, only for the agents that design or review pictures)</summary>
              <ol className={styles.sheetStrip}>
                {pack.sheet.map((s) => (
                  <li key={s.url}><span className={styles.sheetThumb}>{/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt="" loading="lazy" /><span>{s.label}</span></span></li>
                ))}
              </ol>
            </Disclosure>
          )}
          <h4>Signature pictures</h4>
          {pack.signatures.length ? (
            <ol className={styles.sheetStrip}>
              {pack.signatures.map((s) => (
                <li key={s.name}><span className={styles.sheetThumb}>{/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.url} alt="" loading="lazy" /><span>{s.name} <small>· {s.kind}</small></span><small>{s.why}</small></span></li>
              ))}
            </ol>
          ) : (
            <p className={styles.source}>No signature pictures. {data.pictures.length ? "Choose some below." : "The brand has no pictures; agents invent the imagery in its spirit."}</p>
          )}
          {data.pictures.length > 0 && (choosing ? (
            <fieldset disabled={busy}>
              <legend>Choose up to {MAX_SIGNATURES} pictures that carry the brand best</legend>
              <ul className={styles.sheetStrip}>
                {data.pictures.map((p) => (
                  <li key={p.name}>
                    <label className={styles.sheetThumb}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" loading="lazy" />
                      <span><input type="checkbox" checked={choosing.includes(p.name)} disabled={!choosing.includes(p.name) && choosing.length >= MAX_SIGNATURES} onChange={(e) => setChoosing(e.target.checked ? [...choosing, p.name] : choosing.filter((n) => n !== p.name))} /> {p.name}</span>
                      <small>{p.kind} · {p.line}</small>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="data-heading-actions">
                <Button onClick={() => void run({ action: "edit", expectedVersion: pack.version, signatures: choosing }, `Saved as version ${pack.version + 1}.`)}>Save as version {pack.version + 1}</Button>
                <Button variant="outline" onClick={() => setChoosing(null)}>Cancel</Button>
              </div>
            </fieldset>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => setChoosing(pack.signatures.map((s) => s.name))}>Change the signature pictures</Button>
          ))}
          <p className={styles.source}>{pack.more} more material{pack.more === 1 ? "" : "s"} available on request.</p>
        </>
      )}
      {data.schemaReady && data.request.state !== "waiting" && (
        <div className="data-heading-actions">
          <Button variant="outline" disabled={busy} onClick={() => void run({ action: "write" }, "The brand character is being written.")}>
            {pack ? "Write the character again" : "Write the brand character"}
          </Button>
          <small className={styles.source}>{data.local ? "Uses the Claude subscription on this computer." : "A paid request from this run's brand budget."}</small>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {pack && (
        <Disclosure>
          <summary>Technical details</summary>
          <p className={styles.source}>
            Brand pack v{pack.version} ({pack.origin}), about {pack.tokens.toLocaleString("en-GB")} tokens with {pack.pictures} pictures; character about {pack.characterTokens.toLocaleString("en-GB")} tokens; catalogue of {pack.materials} materials.
          </p>
          <ul className={styles.source}>
            {data.versions.map((v) => <li key={v.version}>v{v.version} · {v.origin} · {new Date(v.createdAt).toLocaleString("en-GB")}</li>)}
          </ul>
        </Disclosure>
      )}
    </section>
  );
}

/** The editable character; a new version (or another tab's save) starts it again from the stored text. */
function CharacterEditor({ pack, busy, save }: { pack: NonNullable<BrandPackView["pack"]>; busy: boolean; save: (character: string) => Promise<void> }) {
  const [text, setText] = useState(pack.character);
  return (
    <>
      <label className="brandbook-edit-label">
        The brand character (what the brand feels like, its devices, how it uses colour, type, space and pictures, what it never does)
        <textarea rows={14} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="data-heading-actions">
        <Button disabled={busy || text.trim() === pack.character.trim() || text.trim().length < 200} onClick={() => void save(text)}>
          Save as version {pack.version + 1}
        </Button>
        {text !== pack.character && (
          <Button variant="outline" disabled={busy} onClick={() => setText(pack.character)}>
            Undo changes
          </Button>
        )}
      </div>
    </>
  );
}
