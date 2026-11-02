"use client";
import styles from "./brief-feel-fields.module.css";
import { briefFeelSchema, feelings, lookOptions, SUGGEST, type BriefFeel } from "@/packages/contracts/brief-feel";

const emptyFeel = (): BriefFeel => briefFeelSchema.parse({});
type Option = { id: string; label: string; hint?: string };

/** Single choice as chips; "Suggest" (the default) leaves the decision to the team and the brand. */
function ChoiceChips({ label, hint, options, value, onChange }: { label: string; hint?: string; options: readonly Option[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      <div className={styles.chips}>
        <button type="button" role="radio" aria-checked={value === SUGGEST} className={`${styles.chip} ${styles.suggest}`} onClick={() => onChange(SUGGEST)}>
          Suggest
        </button>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} title={o.hint} className={styles.chip} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * "How it should feel": every answer is optional and defaults to Suggest. Only feelings and boundaries are asked here;
 * looks, worlds and formats are deliberately not offered as a menu, so the creative agents invent them for the brand.
 */
export function BriefFeelFields({ value, onChange }: { value: BriefFeel | undefined; onChange: (next: BriefFeel) => void }) {
  const feel = value ?? emptyFeel();
  const update = (patch: Partial<BriefFeel>) => onChange({ ...feel, ...patch });
  const toggleFeeling = (id: BriefFeel["feelings"][number]) =>
    update({ feelings: feel.feelings.includes(id) ? feel.feelings.filter((f) => f !== id) : [...feel.feelings, id].slice(0, 3) });
  const toggleAvoid = (id: BriefFeel["avoid"][number]) => update({ avoid: feel.avoid.includes(id) ? feel.avoid.filter((a) => a !== id) : [...feel.avoid, id] });
  return (
    <div className={styles.feel}>
      <p className={styles.intro}>All optional. Anything left on Suggest, the team proposes from your brand.</p>
      <div className={styles.group} role="group" aria-label="What should people feel">
        <span>What should people feel?</span>
        <small>Pick up to three; the first one is the main feeling.</small>
        <div className={styles.chips}>
          <button type="button" aria-pressed={!feel.feelings.length} className={`${styles.chip} ${styles.suggest}`} onClick={() => update({ feelings: [] })}>
            Suggest
          </button>
          {feelings.map((f) => {
            const index = feel.feelings.indexOf(f.id);
            return (
              <button key={f.id} type="button" aria-pressed={index >= 0} disabled={index < 0 && feel.feelings.length >= 3} className={styles.chip} onClick={() => toggleFeeling(f.id)}>
                {f.label}
                {index === 0 && feel.feelings.length > 1 && <span className={styles.badge}>main</span>}
              </button>
            );
          })}
        </div>
      </div>
      <ChoiceChips label="How far from your usual style?" options={lookOptions.stretch} value={feel.stretch} onChange={(id) => update({ stretch: id as BriefFeel["stretch"] })} />
      <ChoiceChips label="Pictures" hint="Photographed, or made without a camera." options={lookOptions.medium} value={feel.medium} onChange={(id) => update({ medium: id as BriefFeel["medium"] })} />
      <ChoiceChips label="People in the frame" options={lookOptions.people} value={feel.people} onChange={(id) => update({ people: id as BriefFeel["people"], ...(id === "yes" ? {} : { peopleNote: "" }) })} />
      {feel.people === "yes" && (
        <label className={styles.inline}>
          Who, briefly (optional)
          <input value={feel.peopleNote} maxLength={300} placeholder="e.g. students on their way to class" onChange={(e) => update({ peopleNote: e.target.value })} />
        </label>
      )}
      <ChoiceChips label="Words on screen" options={lookOptions.textAmount} value={feel.textAmount} onChange={(id) => update({ textAmount: id as BriefFeel["textAmount"] })} />
      <div className={styles.group} role="group" aria-label="Definitely not">
        <span>Definitely not</span>
        <div className={styles.chips}>
          {lookOptions.avoid.map((a) => (
            <button key={a.id} type="button" aria-pressed={feel.avoid.includes(a.id)} className={styles.chip} onClick={() => toggleAvoid(a.id)}>
              {a.label}
            </button>
          ))}
        </div>
        <input aria-label="Anything else to avoid" value={feel.avoidNote} maxLength={500} placeholder="Anything else to avoid (optional)" onChange={(e) => update({ avoidNote: e.target.value })} />
      </div>
      <label className={styles.inline}>
        At the end, the viewer should… (optional)
        <input value={feel.endFeeling} maxLength={300} placeholder="e.g. feel that small spends finally count" onChange={(e) => update({ endFeeling: e.target.value })} />
      </label>
    </div>
  );
}
