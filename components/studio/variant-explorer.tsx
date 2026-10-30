/* eslint-disable @next/next/no-img-element -- Local creative fixtures are served without server image processing. */
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { demoScope, formatOptions } from "@/lib/demo-workspace";
import type { VariantEntry } from "@/packages/contracts/campaign";

export function CreativeStudy({ format = "9:16", locale = "en-GB", hook = "context", scene = 0, visual = "luma" }: {
  format?: string; locale?: string; hook?: string; scene?: number; visual?: "luma" | "kite";
}) {
  const russian = locale === "ru-RU";
  const headlines = visual === "kite" ? ["No catch.\nJust cashback.", "Everyday.\nUpgraded.", "More from\nthe everyday."] : russian
    ? [hook === "context" ? "Ваше место.\nВаш свет." : "Знакомьтесь,\nLuma One.", "Свет для\nважных дел.", "Больше света.\nБольше вашего."]
    : [hook === "context" ? "Your space.\nYour light." : "Meet your\nLuma One.", "For the things\nthat matter.", "Make room\nfor your ideas."];
  return <div className={`creative-study creative-${visual}`} data-format={format} data-testid="creative-study" lang={russian ? "ru" : "en"}>
    <div className="creative-study-image"><img src={`/studio/${visual === "luma" ? "luma-room" : "kite-card"}.svg`} alt={visual === "luma" ? "Illustrated Luma lamp on a desk" : "Illustrated Kite rewards card"} /><span className="creative-study-brand">{visual.toUpperCase()}</span><span className="creative-study-edition">{russian ? "ДЛЯ ВАШЕГО КАЖДОГО ДНЯ" : "MADE FOR YOUR EVERYDAY"}</span></div>
    <div className="creative-study-field"><span className="creative-study-label">{visual === "luma" ? "LUMA ONE" : "EVERYDAY REWARDS"}</span><h3>{headlines[scene % 3]}</h3><p>{visual === "kite" ? "No fees, no tiers, no limits." : russian ? "Немного больше света для ваших идей." : "A little more light for what matters."}</p><span className="creative-study-cta">{visual === "kite" ? "Get to know Kite" : russian ? "Откройте Luma One" : "Explore Luma One"}<ArrowUpRight size={15} /></span></div>
  </div>;
}

function Choices({ label, value, options, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <div className="explorer-control" role="group" aria-label={label}><p>{label}</p><div className="choice-pills">{options.map((option) => <button key={option.value} onClick={() => onChange(option.value)} aria-pressed={value === option.value}>{option.label}</button>)}</div></div>;
}

export function VariantExplorer() {
  const [locale, setLocale] = useState("en-GB");
  const [format, setFormat] = useState("vertical-9x16");
  const [hook, setHook] = useState("context");
  const [beat, setBeat] = useState("problem-demo-cta");
  const [sceneIndex, setSceneIndex] = useState(0);
  const selected = demoScope.manifest.entries.find((v) => v.locale === locale && v.placementId === format && v.hook === hook && v.beatSequence === beat);
  const displayFormat = formatOptions.find((f) => f.id === format)!.label;
  const sceneOrder = beat === "problem-demo-cta" ? [0, 1, 2] : [1, 0, 2];
  return <section className="variant-explorer" aria-label="Variant explorer">
    <div className="explorer-controls"><span className="eyebrow">THE VARIANT EXPLORER</span><h2>One concept.<br />Every possibility.</h2><p className="explorer-intro">A small study in how an idea adapts.<br /> Choose a version to make it yours.</p>
      <Choices label="Language" value={locale} onChange={setLocale} options={[{ value: "en-GB", label: "English" }, { value: "ru-RU", label: "Russian" }]} />
      <Choices label="Format" value={format} onChange={setFormat} options={formatOptions.map((f) => ({ value: f.id, label: f.label }))} />
      <Choices label="Hook" value={hook} onChange={setHook} options={[{ value: "context", label: "Your space" }, { value: "product-first", label: "Meet the product" }]} />
      <Choices label="Story structure" value={beat} onChange={(value) => { setBeat(value); setSceneIndex(0); }} options={[{ value: "problem-demo-cta", label: "Problem → Demo → CTA" }, { value: "demo-proof-cta", label: "Demo → Proof → CTA" }]} />
      <div className="explorer-control"><p>SCENE</p><div className="scene-stepper"><button aria-label="Previous scene" onClick={() => setSceneIndex((sceneIndex + 2) % 3)}><ArrowLeft size={15} /></button><span>{sceneIndex + 1} <span className="muted">of 3</span></span><button aria-label="Next scene" onClick={() => setSceneIndex((sceneIndex + 1) % 3)}><ArrowRight size={15} /></button><span className="scene-name">{(beat === "problem-demo-cta" ? ["The opening", "The product", "The invitation"] : ["The product", "The detail", "The invitation"])[sceneIndex]}</span></div></div>
      <div className="explorer-study-note"><Layers size={15} /><span>Visual study only.<br /> Not an approved draft or export.</span></div>
    </div>
    <div className="explorer-preview"><div className="explorer-preview-top"><Badge variant="outline">Luma · evening essentials</Badge><span>{displayFormat} <span className="muted">/</span> {locale === "en-GB" ? "EN" : "RU"}</span></div>
      <div className="creative-stage">{selected ? <CreativeStudy format={displayFormat} locale={locale} hook={hook} scene={sceneOrder[sceneIndex]} /> : <p>This combination is not in the ordered manifest.</p>}</div>
      <div className="explorer-preview-bottom"><span><strong>32</strong> explicitly ordered variants<span className="explorer-variant-id">{selected?.id}</span></span><Link href="/preview">Open render lab<ArrowUpRight size={15} /></Link></div>
    </div>
  </section>;
}

export function VariantReadout({ variant }: { variant: VariantEntry }) {
  const format = formatOptions.find((f) => f.id === variant.placementId)!;
  return <><div className="variant-modal-study"><CreativeStudy format={format.label} locale={variant.locale} hook={variant.hook} /></div><div className="variant-modal-meta"><span><Check size={14} />Explicitly ordered</span><span>{format.label} · {variant.locale} · {variant.durationSeconds}s</span></div><p className="muted">This is an illustrative study of the manifest entry. No final file has been generated or approved.</p></>;
}
