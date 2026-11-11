"use client";
import { useState } from "react";
import { Check, CircleAlert, Download, FileText, Image as ImageGlyph, LoaderCircle, Type } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useShared } from "@/lib/shared-http";
import type { BrandMaterial } from "@/packages/contracts/brand-intake";
import { autoMaterialRole, materialRoleLabels, materialRoles, type MaterialRole } from "@/packages/brand/material-roles";
import styles from "./brand-files.module.css";

export type FileRole = { role: MaterialRole; sure: boolean };
export type FileReading = { status: string; done: number; total: number };

// Files are shown by what they are, in the order an art director thinks about a brand.
const groups: { key: string; title: string; roles: MaterialRole[] }[] = [
  { key: "guidelines", title: "Guidelines", roles: ["brandbook", "tokens"] },
  { key: "logos", title: "Logos", roles: ["logo"] },
  { key: "fonts", title: "Fonts", roles: ["font", "licence"] },
  { key: "product", title: "Product & interface", roles: ["screenshot", "uikit"] },
  { key: "imagery", title: "Photos & references", roles: ["photo", "reference"] },
  { key: "other", title: "Other files", roles: ["unknown"] },
];
const FIRST_ROWS = 12;

const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const extension = (name: string) => name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "FILE";

/** What a file is: the AD's choice or the application's guess. A guess never asks anything; it is simply changeable. */
export function fileRole(m: BrandMaterial, roles: Map<string, FileRole>): FileRole {
  return roles.get(m.id) ?? autoMaterialRole({ filename: m.filename, relative_path: m.relative_path, mime: m.mime, extraction: m.extraction ? { kind: m.extraction.kind, metadata: m.extraction.metadata } : null });
}

type Status = { label: string; tone: "done" | "busy" | "idle" | "problem" | "off" };
function fileStatus(m: BrandMaterial, reading: FileReading | undefined): Status {
  if (!m.included) return { label: "Not used", tone: "off" };
  if (m.state === "failed" || m.state === "unsupported") return { label: "Couldn’t open", tone: "problem" };
  if (m.state !== "ready") return { label: "Preparing…", tone: "busy" };
  if (!reading) return { label: "Ready", tone: "idle" };
  if (reading.status === "completed") return { label: "Read", tone: "done" };
  if (reading.status === "skipped") return { label: "Skipped", tone: "off" };
  return { label: reading.total > 1 ? `Reading ${reading.done}/${reading.total}` : "Reading…", tone: "busy" };
}

export function BrandFiles({
  materials,
  roles,
  reading,
  intakeEndpoint,
  fieldsEndpoint,
  busy,
  onInclude,
  onRole,
}: {
  materials: BrandMaterial[];
  roles: Map<string, FileRole>;
  reading: Map<string, FileReading>;
  intakeEndpoint: string;
  fieldsEndpoint: string;
  busy: boolean;
  onInclude: (id: string, included: boolean) => void;
  onRole: (id: string, role: MaterialRole) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}),
    [opened, setOpened] = useState<BrandMaterial | null>(null);
  const used = materials.filter((m) => m.included && m.state !== "failed" && m.state !== "unsupported"),
    broken = materials.filter((m) => m.state === "failed" || m.state === "unsupported"),
    unused = materials.filter((m) => !m.included && m.state !== "failed" && m.state !== "unsupported");
  const sections = [
    ...groups.map((g) => ({ ...g, files: used.filter((m) => g.roles.includes(fileRole(m, roles).role)) })),
    { key: "broken", title: "Couldn’t open", roles: [], files: broken, note: "These files are left out so they never hold up reading. Open the original and save it as PDF, PNG or a font file to use it." },
    { key: "unused", title: "Not used", roles: [], files: unused, note: "Switched off. The agents never see these files." },
  ].filter((s) => s.files.length);
  const tile = (m: BrandMaterial) => (
    <FileTile
      key={m.id}
      material={m}
      role={fileRole(m, roles)}
      status={fileStatus(m, reading.get(m.id))}
      intakeEndpoint={intakeEndpoint}
      fieldsEndpoint={fieldsEndpoint}
      busy={busy}
      onOpen={() => setOpened(m)}
      onInclude={onInclude}
      onRole={onRole}
    />
  );
  return (
    <div className={styles.files}>
      {sections.map((s) => {
        const open = expanded[s.key] || s.files.length <= FIRST_ROWS;
        return (
          <section key={s.key} className={styles.group} aria-label={s.title}>
            <header>
              <h4>{s.title}</h4>
              <span>{s.files.length}</span>
            </header>
            {"note" in s && s.note && <p className={styles.note}>{s.note}</p>}
            <ul className={styles.grid}>{(open ? s.files : s.files.slice(0, FIRST_ROWS)).map(tile)}</ul>
            {!open && (
              <button type="button" className={styles.more} onClick={() => setExpanded((e) => ({ ...e, [s.key]: true }))}>
                Show all {s.files.length}
              </button>
            )}
          </section>
        );
      })}
      <FileDialog material={opened} intakeEndpoint={intakeEndpoint} onClose={() => setOpened(null)} />
    </div>
  );
}

function Thumb({ material: m, intakeEndpoint, fieldsEndpoint, large = false, page = 1 }: { material: BrandMaterial; intakeEndpoint: string; fieldsEndpoint: string; large?: boolean; page?: number }) {
  const image = m.extraction?.images.find((i) => i.page === page);
  if (image)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`${intakeEndpoint}?preview=${m.id}&page=${page}&v=${image.sha256.slice(0, 12)}`} alt="" loading="lazy" decoding="async" />;
  if (m.state === "ready" && m.mime === "image/svg+xml")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`${fieldsEndpoint}?asset=${m.id}`} alt="" loading="lazy" decoding="async" />;
  const font = m.state === "ready" && (m.extraction?.kind === "font" || /\.(woff2?|ttf|otf)$/i.test(m.filename));
  if (font)
    return (
      <span className={styles.specimen} style={{ fontFamily: `"file-${m.id}", sans-serif`, fontSize: large ? 64 : undefined }}>
        <style>{`@font-face{font-family:"file-${m.id}";src:url("${fieldsEndpoint}?asset=${m.id}");font-display:swap}`}</style>
        Aa
      </span>
    );
  const Icon = m.mime.startsWith("image/") ? ImageGlyph : /\.(woff2?|ttf|otf)$/i.test(m.filename) ? Type : FileText;
  return (
    <span className={styles.glyph}>
      <Icon size={large ? 36 : 22} />
      <small>{extension(m.filename)}</small>
    </span>
  );
}

function FileTile({
  material: m,
  role,
  status,
  intakeEndpoint,
  fieldsEndpoint,
  busy,
  onOpen,
  onInclude,
  onRole,
}: {
  material: BrandMaterial;
  role: FileRole;
  status: Status;
  intakeEndpoint: string;
  fieldsEndpoint: string;
  busy: boolean;
  onOpen: () => void;
  onInclude: (id: string, included: boolean) => void;
  onRole: (id: string, role: MaterialRole) => void;
}) {
  const broken = m.state === "failed" || m.state === "unsupported";
  return (
    <li className={styles.tile} data-off={!m.included || undefined} data-tone={status.tone}>
      <button type="button" className={styles.thumb} onClick={onOpen} aria-label={`Open ${m.filename}`}>
        <Thumb material={m} intakeEndpoint={intakeEndpoint} fieldsEndpoint={fieldsEndpoint} />
        <span className={styles.status}>
          {status.tone === "done" ? <Check size={12} /> : status.tone === "busy" ? <LoaderCircle size={12} className={styles.spin} /> : status.tone === "problem" ? <CircleAlert size={12} /> : null}
          {status.label}
        </span>
      </button>
      <div className={styles.body}>
        <strong title={m.relative_path}>{m.filename}</strong>
        <div className={styles.meta}>
          {broken ? (
            <span>{m.error_code ? m.error_code.replaceAll("_", " ").toLowerCase() : "unreadable"}</span>
          ) : (
            <label className={styles.role} data-guess={!role.sure || undefined} title={role.sure ? "What this file is. Change it if it is wrong." : "Our guess from the file. Change it if it is wrong; reading uses the guess meanwhile."}>
              <span className="sr-only">What {m.filename} is</span>
              <select value={role.role} disabled={busy || !m.included || m.state !== "ready"} onChange={(e) => onRole(m.id, e.target.value as MaterialRole)}>
                {role.role === "unknown" && <option value="unknown">Other file</option>}
                {materialRoles
                  .filter((r) => r !== "unknown")
                  .map((r) => (
                    <option key={r} value={r}>
                      {materialRoleLabels[r]}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <span className={styles.size}>{size(m.bytes)}</span>
        </div>
      </div>
      {!broken && (
        <label className={styles.use} title={m.included ? "Used by the agents. Switch off to leave this file out." : "Left out. Switch on to use it."}>
          <input type="checkbox" checked={m.included} disabled={busy} onChange={(e) => onInclude(m.id, e.target.checked)} />
          <span className="sr-only">Use {m.filename}</span>
        </label>
      )}
    </li>
  );
}

function FileDialog({ material: m, intakeEndpoint, onClose }: { material: BrandMaterial | null; intakeEndpoint: string; onClose: () => void }) {
  return (
    <Dialog open={!!m} onOpenChange={(open) => !open && onClose()}>
      {m && (
        <DialogContent className={styles.dialog}>
          <DialogTitle>{m.filename}</DialogTitle>
          <DialogDescription>
            {m.relative_path !== m.filename ? `${m.relative_path} · ` : ""}
            {size(m.bytes)}
            {m.extraction?.images.length ? ` · ${m.extraction.images.length} ${m.extraction.images.length === 1 ? "page" : "pages"}` : ""}
          </DialogDescription>
          {!!m.extraction?.images.length && (
            <div className={styles.pages}>
              {m.extraction.images.slice(0, 8).map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={image.page} src={`${intakeEndpoint}?preview=${m.id}&page=${image.page}&v=${image.sha256.slice(0, 12)}`} alt={`Page ${image.page}`} loading="lazy" />
              ))}
            </div>
          )}
          {m.state === "ready" && <FileText_ path={`${intakeEndpoint}?text=${m.id}`} />}
          <a className="text-link" href={`${intakeEndpoint}?source=${m.id}`} download>
            <Download size={14} /> Download original
          </a>
        </DialogContent>
      )}
    </Dialog>
  );
}

/** The text read from a file, as the agents receive it. */
function FileText_({ path }: { path: string }) {
  const { data, error } = useShared<{ text: string }>(path, { live: false });
  if (error) return null;
  if (!data) return <p className={styles.note}>Loading the text…</p>;
  if (!data.text.trim()) return null;
  return (
    <div className={styles.text}>
      <h5>Text in this file</h5>
      <pre>{data.text.slice(0, 6000)}{data.text.length > 6000 ? "\n…" : ""}</pre>
    </div>
  );
}
