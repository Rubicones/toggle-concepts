"use client";
import styles from "./brief-feel-fields.module.css";
import { useState } from "react";
import { Disclosure } from "@/components/ui/disclosure";
import { briefFeelSchema, campaignOptions, feelings, lookOptions, SUGGEST, type BriefFeel } from "@/packages/contracts/brief-feel";
import { moodPicture } from "@/packages/contracts/brief-moods";

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

/** A mood picture; until the pictures are fetched (or if one fails) a quiet placeholder keeps the card's shape. */
function Picture({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  // eslint-disable-next-line @next/next/no-img-element
  return failed ? <span className={styles.picture} aria-hidden /> : <img className={styles.picture} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/** Several answers as cards or chips; empty means Suggest. Used for feelings, leanings and "open to" lists. */
function MultiPick<T extends string>({ label, hint, options, value, max, picture, onChange, firstIsMain }: { label: string; hint?: string; options: readonly { id: T; label: string }[]; value: readonly T[]; max: number; picture?: (id: T) => string; onChange: (next: T[]) => void; firstIsMain?: boolean }) {
  const toggle = (id: T) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id].slice(0, max));
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      <div className={picture ? styles.cards : styles.chips}>
        {!picture && (
          <button type="button" aria-pressed={!value.length} className={`${styles.chip} ${styles.suggest}`} onClick={() => onChange([])}>
            Suggest
          </button>
        )}
        {options.map((o) => {
          const index = value.indexOf(o.id),
            badge = firstIsMain && index === 0 && value.length > 1 ? <span className={styles.badge}>main</span> : null;
          return (
            <button key={o.id} type="button" aria-pressed={index >= 0} disabled={index < 0 && value.length >= max} className={picture ? styles.card : styles.chip} onClick={() => toggle(o.id)}>
              {picture ? (
                <>
                  <Picture src={picture(o.id)} />
                  <span className={styles.cardLabel}>
                    {o.label}
                    {badge}
                  </span>
                </>
              ) : (
                <>
                  {o.label}
                  {badge}
                </>
              )}
            </button>
          );
        })}
      </div>
      {picture && value.length > 0 && (
        <button type="button" className={`${styles.chip} ${styles.suggest}`} style={{ justifySelf: "start" }} onClick={() => onChange([])}>
          Clear: let the team suggest
        </button>
      )}
    </div>
  );
}

const photographedWorlds = new Set(["real-life", "studio", "home", "city", "nature", "typography-led", "illustration"]),
  madeWorlds = new Set(["product-interface", "motion-graphics", "object-3d", "typography-led", "illustration", "data-diagrams", "abstract-graphic"]);

/**
 * "How it should feel": every answer is optional and defaults to Suggest. Feelings and boundaries come first; the folded
 * fine-tune gives leanings (tone) and "open to" lists (room). Agents receive them as such, never as requests, and never
 * receive the mood pictures (packages/contracts/brief-feel.ts compileFeelingBrief).
 */
/** Ad shape: how many scenes carry the idea (one key frame, a short sequence or a story). Everything is animated later. */
export function AdShapeField({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  return <ChoiceChips label="Ad shape" hint="Everything is animated later." options={campaignOptions.adShape} value={value ?? SUGGEST} onChange={onChange} />;
}

export function BriefFeelFields({ value, onChange }: { value: BriefFeel | undefined; onChange: (next: BriefFeel) => void }) {
  const feel = value ?? emptyFeel();
  const update = (patch: Partial<BriefFeel>) => onChange({ ...feel, ...patch });
  const toggleAvoid = (id: BriefFeel["avoid"][number]) => update({ avoid: feel.avoid.includes(id) ? feel.avoid.filter((a) => a !== id) : [...feel.avoid, id] });
  return (
    <div className={styles.feel}>
      <p className={styles.intro}>All optional. Anything left on Suggest, the team proposes from your brand.</p>
      <MultiPick
        label="What should people feel?"
        hint="Pick up to three; the first one is the main feeling."
        options={feelings}
        value={feel.feelings}
        max={3}
        firstIsMain
        picture={(id) => moodPicture.feeling(id, feel.medium === "digital")}
        onChange={(next) => update({ feelings: next })}
      />
      <ChoiceChips label="How far from your usual style?" options={lookOptions.stretch} value={feel.stretch} onChange={(id) => update({ stretch: id as BriefFeel["stretch"] })} />
      <ChoiceChips label="Pictures" hint="Photographed, or made without a camera." options={lookOptions.medium} value={feel.medium} onChange={(id) => update({ medium: id as BriefFeel["medium"], world: feel.world.filter((w) => (id === "live" ? photographedWorlds.has(w) : id === "digital" ? madeWorlds.has(w) : true)) })} />
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
      <Disclosure>
        <summary>Fine-tune the look (optional)</summary>
        <div className={styles.fineTune}>
          <p className={styles.intro}>These set a tone and give the team room. Nothing here is an order: leanings are a mood, and “open to” only says what you would not mind.</p>
          <MultiPick label="Light you lean towards" hint="Up to two." options={lookOptions.light} value={feel.light.filter((l) => l !== SUGGEST) as BriefFeel["light"]} max={2} picture={moodPicture.light} onChange={(next) => update({ light: next })} />
          <MultiPick
            label="Worlds you are open to"
            hint="We may use one of these, or something else entirely."
            options={lookOptions.world.filter((w) => (feel.medium === "live" ? photographedWorlds.has(w.id) : feel.medium === "digital" ? madeWorlds.has(w.id) : true))}
            value={feel.world}
            max={4}
            picture={moodPicture.world}
            onChange={(next) => update({ world: next })}
          />
          <MultiPick label="For type, you are open to" options={lookOptions.typeRole} value={feel.typeRole} max={3} onChange={(next) => update({ typeRole: next })} />
          <MultiPick label="For the product, you are open to" options={lookOptions.productRole} value={feel.productRole} max={4} onChange={(next) => update({ productRole: next })} />
          <ChoiceChips label="Energy" options={lookOptions.energy} value={feel.energy} onChange={(id) => update({ energy: id as BriefFeel["energy"] })} />
          <ChoiceChips label="Colour" options={lookOptions.colour} value={feel.colour} onChange={(id) => update({ colour: id as BriefFeel["colour"] })} />
          <ChoiceChips label="Humour" options={lookOptions.humour} value={feel.humour} onChange={(id) => update({ humour: id as BriefFeel["humour"] })} />
        </div>
      </Disclosure>
      <label className={styles.inline}>
        At the end, the viewer should… (optional)
        <input value={feel.endFeeling} maxLength={300} placeholder="e.g. feel that small spends finally count" onChange={(e) => update({ endFeeling: e.target.value })} />
      </label>
    </div>
  );
}
