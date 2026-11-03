"use client";
import { Box, Clapperboard, Move, Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { clientFinalNote, type FinalVersionNote } from "@/packages/director/final-notes";
import styles from "./live-draft-generator.module.css";

/** "In the final version" (designer pipeline plan, point 3): what this scene adds in the final, under the frame.
 * Nothing renders when the scene has no additions. The client wording drops technical words and prices. */
export function FinalVersionPanel({ note, audience = "ad" }: { note?: FinalVersionNote; audience?: "ad" | "client" }) {
  if (!note) return null;
  const client = audience === "client" ? clientFinalNote(note) : null;
  const rows: { icon: LucideIcon; label: string; text: string }[] = [
    ...note.pictures.map((p, i) => ({
      icon: p.kind === "3d" ? Box : Clapperboard,
      label: p.kind === "3d" ? "3D" : "Film",
      text: client ? client.pictures[i] : `Becomes ${p.text[0].toLowerCase()}${p.text.slice(1)}`,
    })),
    ...(note.motion ? [{ icon: Move, label: "Motion", text: note.motion }] : []),
    ...(note.sound ? [{ icon: Volume2, label: "Sound", text: note.sound }] : []),
  ];
  return (
    <section className={styles.final} aria-label="In the final version">
      <header className={styles.finalHead}>
        <h5>In the final version</h5>
        {audience === "ad" && <span>Planned with the design</span>}
      </header>
      <ul>
        {rows.map((row, i) => (
          <li key={i}>
            <row.icon size={15} aria-hidden />
            <span className={styles.finalLabel}>{row.label}</span>
            <span>{row.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
