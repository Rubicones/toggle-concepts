"use client";
import { CREATIVE_FOCUS_LIMIT } from "@/packages/contracts/creative-focus";

/** The AD's creative focus: the first creative instruction for every agent. Empty means the agents choose. */
export function CreativeFocusField({ id, value, onChange, disabled }: { id: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label htmlFor={id} style={{ display: "grid", gap: 6 }}>
      <strong>Creative focus</strong>
      <small>
        Where the agents should look first: a look, a format, a feeling, what to show or avoid. Strategy, scenarios, visual direction, the draft
        director, the coder and every review follow it. Leave empty to let the agents choose.
      </small>
      <textarea
        id={id}
        rows={4}
        maxLength={CREATIVE_FOCUS_LIMIT}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <small>
        {value.length.toLocaleString("en-US")} / {CREATIVE_FOCUS_LIMIT.toLocaleString("en-US")}
      </small>
    </label>
  );
}
