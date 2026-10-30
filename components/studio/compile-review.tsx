"use client";
import {Disclosure} from '@/components/ui/disclosure';
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useShared } from "@/lib/shared-http";
import type { DraftWorkspaceRecord } from "@/packages/contracts/drafts";
import { DraftPlayer } from "./draft-workspace";
import styles from "./guided-run-workspace.module.css";

type Issue = { code: string; message: string; directionId?: string; variantId?: string; slotId?: string };
/** Plain-language grouping of the local compiler's QA codes and which agent can fix them. */
const KIND: Record<string, { label: string; fix: "copy" | "media" | "plan" }> = {
  TEXT_OVERFLOW: { label: "Text does not fit the frame at a readable size", fix: "copy" },
  READING_TIME: { label: "Copy is too long to read in its beat", fix: "copy" },
  LEGAL_READING_TIME: { label: "Disclosure needs more time than the video has", fix: "copy" },
  MISSING_COPY: { label: "Hook, proof or CTA copy is missing", fix: "copy" },
  MANDATORY_COPY: { label: "Required disclosure is incomplete", fix: "copy" },
  DUPLICATE_CREATIVE: { label: "Directions open with the same hook", fix: "copy" },
  GLYPH_CAPABILITY: { label: "Characters outside the packaged font", fix: "copy" },
  CONTROL_CHARACTER: { label: "Invisible control characters in copy", fix: "copy" },
  MISSING_IMAGE: { label: "A product or logo image is missing", fix: "media" },
  AUDIO_DURATION: { label: "Audio does not cover the video", fix: "media" },
  BRAND_CONTRAST: { label: "Brand colors lack readable contrast", fix: "plan" },
};
const kind = (code: string) => KIND[code] ?? { label: code.replaceAll("_", " ").toLowerCase(), fix: "plan" as const };

/**
 * A QA-blocked local build: what failed, where, and the compiled drafts themselves
 * (playable even though they did not pass), so the art director can judge before revising.
 */
export function CompileReview({ campaignId, onRevise }: { campaignId: string; onRevise: (role: string, note: string) => void }) {
  const { data, error } = useShared<DraftWorkspaceRecord>(`/api/studio/campaigns/${campaignId}/drafts`);
  if (error) return <p role="alert">{error}</p>;
  if (!data?.plan || !data.c1) return <p role="status">Loading the local build report…</p>;
  const job = data.jobs.find((j) => j.job_key === `draft-compile-v${data.plan!.version}`);
  if (!job?.output) return <p>The local build report is not available yet. Reload in a moment.</p>;
  let issues: Issue[] = [],
    programs = 0;
  try {
    const parsed = JSON.parse(job.output);
    issues = parsed.qa?.issues ?? [];
    programs = parsed.programs?.length ?? 0;
  } catch {
    /* Shown below as an unreadable report. */
  }
  const rows = data.c1.variantManifest.entries,
    directions = data.plan.payload.directions;
  const rowLabel = (id?: string) => {
    const r = rows.find((row) => row.id === id);
    return r ? `${r.locale} · ${r.placementId} · ${r.durationSeconds}s` : "";
  };
  const dirLabel = (id?: string) => directions.find((d) => d.id === id)?.title ?? "";
  const groups = [...new Set(issues.map((i) => i.code))].map((code) => ({ code, items: issues.filter((i) => i.code === code) }));
  const affected = new Set(issues.map((i) => i.variantId).filter(Boolean)).size;
  const copyIssues = issues.filter((i) => kind(i.code).fix === "copy");
  function revise() {
    const lines = copyIssues.slice(0, 20).map((i) => `- ${kind(i.code).label}: ${[dirLabel(i.directionId), rowLabel(i.variantId), i.slotId].filter(Boolean).join(" · ")}`);
    onRevise(
      "localization",
      `The local preview build failed QA. Shorten or correct only the affected localized copy so every hook/proof/CTA fits its frame and beat at the readable minimum size; keep meaning, offer and required disclosures.\n${lines.join("\n")}${copyIssues.length > 20 ? `\n…and ${copyIssues.length - 20} more of the same kind.` : ""}`,
    );
  }
  return (
    <div className={styles.compileReview}>
      <p>
        {issues.length} issue{issues.length === 1 ? "" : "s"}
        {affected ? ` across ${affected} of ${rows.length} ordered variants` : ""}. Nothing was certified; you can still play the compiled drafts below to see
        what failed.
      </p>
      <ul className={styles.issueGroups}>
        {groups.map((g) => (
          <li key={g.code}>
            <strong>
              {kind(g.code).label} · {g.items.length}
            </strong>
            <small>{g.items[0].message}</small>
            <small>
              {g.items
                .slice(0, 4)
                .map((i) => [dirLabel(i.directionId), rowLabel(i.variantId), i.slotId].filter(Boolean).join(" · "))
                .filter(Boolean)
                .join("; ")}
              {g.items.length > 4 ? ` … +${g.items.length - 4}` : ""}
            </small>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        {copyIssues.length > 0 && <Button onClick={revise}>Prepare copy revision</Button>}
        <Button variant="outline" asChild>
          <Link href={`/campaigns/${campaignId}/drafts`}>Open Drafts</Link>
        </Button>
      </div>
      {programs > 0 ? (
        <Disclosure open>
          <summary>Play the drafts that failed QA</summary>
          <div className="shared-assets-grid">
            {directions.map((d) => (
              <DraftPlayer
                key={`${job.id}-${d.id}`}
                campaignId={campaignId}
                buildId={job.id}
                direction={{ id: d.id, title: d.title, idea: d.idea }}
                rows={rows}
                referenceLocale={data.c1!.scope.referenceLocale}
                referencePlacement={data.c1!.scope.referencePlacement}
              />
            ))}
          </div>
        </Disclosure>
      ) : (
        <p>The build stopped before any draft could be assembled, so there is nothing to play yet.</p>
      )}
    </div>
  );
}
