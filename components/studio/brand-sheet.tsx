"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useShared } from "@/lib/shared-http";
import type { BrandSheetView } from "@/lib/server/brand-sheet";
import styles from "./brand-card.module.css";

type Page = { section: string; label: string; sha256: string; width: number; height: number; part: string };

/** "What the agents see": the brand sheet, exactly as the agents that design the ads receive it. */
const waited = (since?: string) => (since ? Date.now() - Date.parse(since) : 0);

export function BrandSheetStrip({ endpoint, busy, build }: { endpoint: string; busy: boolean; build: () => Promise<void> }) {
  const isActive = useCallback((v: BrandSheetView) => v.state === "queued" || v.state === "building", []);
  const { data, error, refresh } = useShared<BrandSheetView>(`${endpoint}?sheets=1`, { isActive });
  const [open, setOpen] = useState<number | null>(null);
  const pages: Page[] = (data?.sections ?? []).flatMap((s) =>
    s.images.map((img, i) => ({ section: s.section, label: s.label, ...img, part: s.images.length > 1 ? `${i + 1} of ${s.images.length}` : "" })),
  );
  const image = (sha: string) => `${endpoint}?sheetImage=${sha}`;
  const rebuild = async () => {
    await build();
    refresh();
  };
  const building = data?.state === "queued" || data?.state === "building";

  let status: { text: string; tone?: "warn"; action?: string } | null = null;
  if (error) status = { text: "The brand sheet could not be loaded. Refresh the page to try again.", tone: "warn" };
  else if (!data) status = { text: "Loading the brand sheet…" };
  else if (!data.schemaReady) status = { text: "Showing the brand sheet needs a database update. Apply the brand sheet update in Settings.", tone: "warn" };
  else if (!data.submitted) status = { text: "Submit the brandbook to build the pages the agents will see." };
  else if (data.state === "queued" && waited(data.requestedAt) > 60000) status = { text: "Waiting for the studio computer to pick this up. Check that the local worker (worker:dev) is running on the studio Mac; the build starts as soon as it is.", tone: "warn" };
  else if (building) status = { text: `${pages.length ? "Building a new version of the brand sheet… The pages below are the previous version." : "Building the brand sheet… It takes about a minute."}${(data.attempt ?? 1) > 1 ? ` Attempt ${data.attempt} of 3.` : ""}` };
  else if (data.state === "failed") status = { text: `The brand sheet could not be built${data.error ? ` (${plainError(data.error)})` : ""}. Try again; if it fails twice, check that the local studio app is running.`, tone: "warn", action: "Try again" };
  else if (data.state === "none") status = { text: "The brand sheet has not been built yet.", action: "Build the sheet" };
  else if (data.stale) status = { text: "These pages come from an earlier version of the brandbook. Rebuild to show the latest files and decisions.", tone: "warn", action: "Rebuild" };

  return (
    <section className={styles.sheet} aria-labelledby="brand-sheet-title" aria-busy={building || undefined}>
      <header className={styles.sheetHead}>
        <div>
          <h3 id="brand-sheet-title">What the agents see</h3>
          <p className={styles.source}>The agents that design your ads — the visual direction and the reviewer — receive exactly these pages, made from your own files.</p>
        </div>
        {data?.state === "ready" && !data.stale && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void rebuild()}>
            <RefreshCw size={14} aria-hidden /> Rebuild
          </Button>
        )}
      </header>
      {status && (
        <p className={`${styles.sheetStatus} ${status.tone === "warn" ? styles.warn : ""}`} role={building ? "status" : undefined} aria-live="polite">
          {status.tone === "warn" && <TriangleAlert size={15} aria-hidden />}
          <span>{status.text}</span>
          {status.action && (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void rebuild()}>
              {status.action}
            </Button>
          )}
        </p>
      )}
      {pages.length > 0 && (
        <ol className={styles.sheetStrip}>
          {pages.map((p, i) => (
            <li key={p.sha256}>
              <button type="button" className={styles.sheetThumb} onClick={() => setOpen(i)} aria-label={`Open ${p.label}${p.part ? `, page ${p.part}` : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image(p.sha256)} alt="" loading="lazy" width={p.width} height={p.height} />
                <span>
                  {p.label}
                  {p.part && <small> · {p.part}</small>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <SheetViewer pages={pages} index={open} setIndex={setOpen} image={image} />
    </section>
  );
}

function SheetViewer({ pages, index, setIndex, image }: { pages: Page[]; index: number | null; setIndex: (i: number | null) => void; image: (sha: string) => string }) {
  const page = index === null ? null : pages[index];
  const go = useCallback((step: number) => setIndex(index === null ? null : (index + step + pages.length) % pages.length), [index, pages.length, setIndex]);
  useEffect(() => {
    if (index === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, go]);
  return (
    <Dialog open={!!page} onOpenChange={(o) => !o && setIndex(null)}>
      <DialogContent className={styles.sheetViewer}>
        {page && (
          <>
            <DialogTitle>
              {page.label}
              {page.part && <small> · page {page.part}</small>}
            </DialogTitle>
            <DialogDescription>
              Page {index! + 1} of {pages.length}. Use the arrow keys to move between pages.
            </DialogDescription>
            <div className={styles.sheetViewerImage}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image(page.sha256)} alt={`${page.label} brand sheet page`} width={page.width} height={page.height} />
            </div>
            {pages.length > 1 && (
              <div className={styles.sheetViewerNav}>
                <Button type="button" variant="outline" size="sm" onClick={() => go(-1)}>
                  <ChevronLeft size={16} aria-hidden /> Previous
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => go(1)}>
                  Next <ChevronRight size={16} aria-hidden />
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Build failures from the runner in words an art director can act on. */
function plainError(code: string) {
  if (/timed? ?out|TIMED_OUT/i.test(code)) return "it took too long";
  if (/chrom|browser|executable/i.test(code)) return "the local browser could not start";
  if (/Precondition|storage|S3|bucket/i.test(code)) return "the pages could not be saved";
  return "an unexpected error";
}
