/**
 * Frame checks (section 9): measured on what the engine draws, for every variant (formats × languages ×
 * hooks × CTAs × lengths), at frame 0, the start and end of every beat, the end of every cue, both sides
 * of every swap and screen change, and every 0.25 s. A beat that looks the same in two variants (same
 * format, language, duration and — only when the beat shows them — the same hook / CTA) is checked once.
 * Identical findings across variants and moments are one line. L_CLIP_3D is out of scope (no 3D).
 */
import type { Box, EngineConfig, Finding, Severity, VariantState } from '../types';
import type { ElRec } from './ops';
import { buildFrame, timeline, beatOf, type EngineCtx, type Frame, type Span } from './frame';
import { contrastRatio, hexOf, inter, unitOf } from './util';
import { inside } from './crop';
import { abs } from './motion';
import { wordCount } from './text';
import { copyLines } from './frame';

export const CODES: Record<string, { severity: Severity; finding: string }> = {
  L_FRAME: { severity: 'block', finding: 'an element leaves the frame on a side it does not bleed from' },
  L_ZONE: { severity: 'block', finding: 'text, logo, mark, a UI key part or a device’s non-bleeding edge in a platform zone' },
  L_ZONE_OBJ: { severity: 'warn', finding: 'an object or window reaches into a platform zone' },
  L_OVERLAP: { severity: 'block', finding: 'text, logo and marks overlap each other, or text lies on a device or object' },
  L_REGION: { severity: 'block', finding: 'text or logo crosses a region edge when the frame is settled' },
  L_TEXT_FIT: { severity: 'block', finding: 'text below the kit’s minimum scale' },
  L_MARGIN: { severity: 'warn', finding: 'text or logo closer than 3.5u to a frame edge or 3u to a safe line, when settled' },
  L_KEY_CROP: { severity: 'block', finding: 'a media key part is outside what the format shows (warn on stand-ins)' },
  L_KEY_HIDDEN: { severity: 'block', finding: 'a UI key part is covered by an object drawn in front of it' },
  L_UPSCALE: { severity: 'warn', finding: 'a picture or clip is enlarged more than 1.5×' },
  L_CONTRAST: { severity: 'warn', finding: 'text or logo below the kit’s contrast' },
  L_FRAME0: { severity: 'block', finding: 'frame 0 does not show the hook and the logo' },
  M_FORBIDDEN: { severity: 'block', finding: 'a cue uses a primitive the kit forbids' },
  M_LOOP_OPEN: { severity: 'warn', finding: 'a float or rock is mid-cycle when its beat ends and the element goes on: it jumps at the cut or the loop (rule 6.4)' },
};

export function allVariants(cfg: EngineConfig): VariantState[] {
  const v = cfg.variant_sets, out: VariantState[] = [];
  for (const fmt of v.formats) for (const lang of v.languages) for (const hook of v.hooks) for (const cta of v.ctas) for (const len of v.lengths) out.push({ fmt, lang, hook, cta, len });
  return out;
}

interface Raw { beat?:string;code: string; severity: Severity; element: string | null; message: string; box?: Box }
/** mean colour of a part under a box (frame px), given where the part is drawn (dest) and its clip time; null = not measured */
export interface Sampler { (part: string, time: number, box: Box, dest: Box,foreground?:string,frame?:Frame): string | null }

/** Findings of one drawn frame. */
export function checkFrame(f: Frame, cfg: EngineConfig, opts: { frame0?: boolean; sample?: Sampler } = {}): Raw[] {
  const out: Raw[] = [];let sourceBeat:string|undefined;
  const add = (code: string, element: string | null, message: string, box?: Box, severity?: Severity) => out.push({ beat:sourceBeat,code, severity: severity ?? CODES[code].severity, element, message, box });
  const { fmt } = f;
  const u = unitOf(fmt), W = fmt.w, H = fmt.h, S = fmt.safe;
  const safe = { x: S.left, y: S.top, w: W - S.left - S.right, h: H - S.top - S.bottom };
  const vis = f.els.filter((e) => e.opacity > 0.01);
  const layerEls = vis.filter((e) => e.kind !== 'region');
  const inkOf = (e: ElRec) => e.ink ?? e.box;
  const r0 = (v: number) => Math.round(v);
  const kit = cfg.kit;

  // During a push, slide, zoom-through or wipe both beats are in transit by design: frame and platform-zone geometry is
  // judged on settled frames; contrast and same-beat overlap are still checked.
  const transit = !!f.transition && !['crossfade', 'match', 'cut'].includes(f.transition.type);
  for (const e of layerEls) {sourceBeat=e.beat;if(transit)continue;
    const b = e.kind === 'text' || e.kind === 'logo' || e.kind === 'mark' ? inkOf(e) : e.box;
    // L_FRAME
    if (e.kind !== 'edge_mark') {
      const out4: [string, number][] = [['left', -b.x], ['top', -b.y], ['right', b.x + b.w - W], ['bottom', b.y + b.h - H]];
      for (const [side, over] of out4) if (over > 1 && !e.bleed.includes(side as never)) add('L_FRAME', e.id, `${e.id} leaves the frame on the ${side} by ${r0(over)} px`, b);
    }
    // L_ZONE / L_ZONE_OBJ (the part on the canvas)
    const on = inter(b, { x: 0, y: 0, w: W, h: H });
    if (on && (S.top || S.right || S.bottom || S.left)) {
      const over: [string, number][] = [['left', S.left - on.x], ['top', S.top - on.y], ['right', on.x + on.w - (W - S.right)], ['bottom', on.y + on.h - (H - S.bottom)]];
      const zoneOver = over.filter(([side, v]) => v > 1 && (S as Record<string, number>)[side] > 0);
      if (e.kind === 'text' || e.kind === 'logo' || e.kind === 'mark' || e.kind === 'edge_mark') for (const [side, v] of zoneOver) add('L_ZONE', e.id, `${e.id} is ${r0(v)} px inside the ${side} platform zone`, b);
      if (e.device) {
        const device=e.device.frame,deviceOver:[string,number][]=[['left',safe.x-device.x],['top',safe.y-device.y],['right',device.x+device.w-safe.x-safe.w],['bottom',device.y+device.h-safe.y-safe.h]];
        for (const [side, v] of deviceOver.filter(([,over])=>over>1)) if (!e.bleed.includes(side as never)) add('L_ZONE', e.id, `${e.id}: the device’s ${side} edge is ${r0(v)} px inside the platform zone`, e.device.frame);
        for (const k of e.device.keys) { const kb = inter(k.box, { x: 0, y: 0, w: W, h: H }); if (kb && !inside(kb, safe, 1)) add('L_ZONE', e.id, `${e.id}: UI key part “${k.id}” in a platform zone`, k.box); }
      }
      if (e.kind === 'object' || e.kind === 'media') for (const [side, v] of zoneOver) if (!e.bleed.includes(side as never)) add('L_ZONE_OBJ', e.id, `${e.id} reaches ${r0(v)} px into the ${side} platform zone`, b);
    }
  }
  // L_OVERLAP: text, logo, marks among themselves; text on devices and objects
  const flowEls = layerEls.filter((e) => e.kind === 'text' || e.kind === 'logo' || e.kind === 'mark' || e.kind === 'edge_mark');
  for (let i = 0; i < flowEls.length; i++) for (let j = i + 1; j < flowEls.length; j++) {
    const a = flowEls[i], b = flowEls[j];sourceBeat=a.beat;
    if(f.transition&&a.beat!==b.beat)continue;
    if (a.kind === 'edge_mark' && b.kind === 'edge_mark') continue;
    const x = inter(inkOf(a), inkOf(b));
    if (x && x.w > 1 && x.h > 1) add('L_OVERLAP', a.id, `${a.id} and ${b.id} overlap (${r0(x.w)}×${r0(x.h)} px)`, x);
  }
  for (const tx of layerEls.filter((e) => e.kind === 'text')) for (const d of layerEls.filter((e) => e.kind === 'ui' || e.kind === 'object')) {
    sourceBeat=tx.beat;if(f.transition&&tx.beat!==d.beat)continue;
    const x = inter(inkOf(tx), d.box);
    if (x && x.w > 1 && x.h > 1) add('L_OVERLAP', tx.id, `${tx.id} lies on ${d.kind === 'ui' ? 'the device' : 'the object'} ${d.id}`, x);
  }
  // L_REGION (settled): text / logo straddles a region edge
  const regions = f.els.filter((e) => e.kind === 'region' && e.region && e.region.kind !== 'full');
  for (const e of layerEls.filter((x) => (x.kind === 'text' || x.kind === 'logo') && x.settled)) {sourceBeat=e.beat;
    const b = inkOf(e);
    for (const r of regions) {
      const g = r.region!;
      if (g.kind === 'edge' && g.line !== undefined && r.box.w > 0 && r.box.h > 0) {
        const horiz = g.side === 'top' || g.side === 'bottom';
        const lo = horiz ? b.y : b.x, hi = horiz ? b.y + b.h : b.x + b.w;
        if (g.line > lo + 1 && g.line < hi - 1) add('L_REGION', e.id, `${e.id} crosses the edge of ${r.id} (${horiz ? 'y' : 'x'} = ${r0(g.line)})`, b);
      } else if (g.kind === 'shape' && g.box) {
        const x = inter(b, g.box);
        if (x && !inside(b, g.box, 1) && x.w > 1 && x.h > 1) add('L_REGION', e.id, `${e.id} crosses the outline of ${r.id}`, b);
      }
    }
  }
  // L_TEXT_FIT
  for (const e of vis.filter((x) => x.text && !x.text.fitOk)){sourceBeat=e.beat;add('L_TEXT_FIT', e.id, `${e.id} needs scale ${e.text!.neededScale.toFixed(2)} (< ${kit.layout.min_text_scale})`, e.box);}
  // L_MARGIN (settled)
  for (const e of layerEls.filter((x) => (x.kind === 'text' || x.kind === 'logo') && x.settled)) {sourceBeat=e.beat;
    const b = inkOf(e);
    const d: [string, number, number][] = [
      ['left', S.left ? b.x - S.left : b.x, S.left ? 3 * u : 3.5 * u], ['top', S.top ? b.y - S.top : b.y, S.top ? 3 * u : 3.5 * u],
      ['right', S.right ? W - S.right - (b.x + b.w) : W - (b.x + b.w), S.right ? 3 * u : 3.5 * u], ['bottom', S.bottom ? H - S.bottom - (b.y + b.h) : H - (b.y + b.h), S.bottom ? 3 * u : 3.5 * u],
    ];
    for (const [side, dist, min] of d) if (dist < min - 0.5 && dist > -1 && !e.bleed.includes(side as never)) add('L_MARGIN', e.id, `${e.id} is ${(dist / u).toFixed(1)}u from the ${side} ${(S as Record<string, number>)[side] ? 'safe line' : 'frame edge'} (min ${(min / u).toFixed(1)}u)`, b);
  }
  // L_KEY_CROP, L_UPSCALE
  for (const e of vis.filter((x) => x.media)) {sourceBeat=e.beat;
    const m = e.media!;
    if (m.key && !inside(m.key, m.visible, 1)) add('L_KEY_CROP', e.id, `${e.id}: the key part of ${m.part} is outside what ${fmt.id} shows${m.standin ? ' (stand-in)' : ''}`, m.key, m.standin ? 'warn' : 'block');
    const maxUp = cfg.meta.draft_quality ? 3 : 1.5;
    if (m.upscale > maxUp + 1e-6) add('L_UPSCALE', e.id, `${e.id}: ${m.part} enlarged ${m.upscale.toFixed(2)}× (max ${maxUp}${cfg.meta.draft_quality ? ', draft quality' : ''})`, e.box);
  }
  // L_KEY_HIDDEN
  for (const d of layerEls.filter((x) => x.device)) for (const k of d.device!.keys) for (const o of layerEls.filter((x) => x.kind === 'object' && x.z > d.z)) {
    sourceBeat=d.beat;if(f.transition&&d.beat!==o.beat)continue;
    const x = inter(k.box, o.box);
    if (x && x.w > 1 && x.h > 1) add('L_KEY_HIDDEN', d.id, `${d.id}: UI key part “${k.id}” is covered by ${o.id}`, x);
  }
  // L_CONTRAST
  const exc = kit.contrast.exceptions.map(([a, b]) => [hexOf(kit, a).toLowerCase(), hexOf(kit, b).toLowerCase()].join('|'));
  for (const e of layerEls.filter((x) => (x.kind === 'text' && x.text) || x.kind === 'logo')) {
    sourceBeat=e.beat;const probes=e.text?.runs?.length?e.text.runs:[{color:e.kind==='text'?e.text!.color:logoColor(cfg,f,e.id,e.beat),box:inkOf(e)}];
    for(const probe of probes){const fg=probe.color;if(!fg)continue;const b=probe.box;
    let bg: string | null = e.text?.onFill ?? null, overMedia = false;
    if (!bg) {
      // what is drawn right under the text's centre: the topmost element below it (regions are below every layer)
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const top = f.els.filter((x) => x.opacity > 0.01 && x.beat===e.beat && x.z < e.z && x.kind !== 'text' && x.kind !== 'logo' && inside({ x: cx, y: cy, w: 0, h: 0 }, x.box, 0)).sort((p, q) => q.z - p.z)[0];
      if (top?.kind === 'region' && top.region?.paint !== 'media') bg = top.region?.color ?? null;
      else if (top?.media && !top.media.standin && opts.sample) { bg = opts.sample(top.media.part, top.media.time, b, top.media.dest,fg,f); overMedia = true; }
    }
    if(opts.sample&&!e.text?.onFill)bg=opts.sample('',0,b,b,fg,f)??bg;
    if (!bg) continue;
    if (exc.includes([fg.toLowerCase(), bg.toLowerCase()].join('|'))) continue;
    const ratio = contrastRatio(fg, bg), min = overMedia ? kit.contrast.media : kit.contrast.flat;
    if (ratio < min - 1e-6) add('L_CONTRAST', e.id, `${e.id}: contrast ${ratio.toFixed(2)} (< ${min}) ${fg} on ${bg}${overMedia ? ' (over media)' : ''}`, b);
  }
  }
  // L_FRAME0
  if (opts.frame0) {sourceBeat=f.beat.id;
    const hookShown = vis.some((e) => e.text?.hook && e.text.shownWords > 0 && e.opacity > 0.5);
    const hasHook = f.els.some((e) => e.text?.hook);
    const logoShown = vis.some((e) => e.kind === 'logo' && e.opacity > 0.5);
    if ((hasHook && !hookShown) || !logoShown) add('L_FRAME0', null, `frame 0 shows ${[hasHook && !hookShown ? 'no hook' : null, !logoShown ? 'no logo' : null].filter(Boolean).join(' and ')}`);
  }
  return out;
}

function logoColor(cfg: EngineConfig, f: Frame, id: string,beatId=f.beat.id): string | null {
  const l = (cfg.beats.find(b=>b.id===beatId)??f.beat).layers.find((x) => x.id === id);
  if (!l || l.kind !== 'logo') return null;
  const logo = cfg.kit.logos[l.logo];
  // an as-drawn logo made for any ground carries its own background (an app icon): nothing to compare
  if (logo?.mode === 'as_drawn') return logo.ground === 'any' ? null : logo.ink ?? null;
  return hexOf(cfg.kit, l.color);
}

/** M_FORBIDDEN: static over the config (a cue is the same in every variant). */
export function cueFindings(cfg: EngineConfig): Finding[] {
  const out: Finding[] = [];
  const forb = new Set(cfg.kit.motion.forbidden), allowed = new Set(cfg.kit.motion.allowed);
  for (const b of cfg.beats) for (const q of b.cues) {
    if (forb.has(q.type) || (allowed.size && !allowed.has(q.type))) out.push({ code: 'M_FORBIDDEN', severity: 'block', element: 'target' in q ? q.target : 'region' in q ? q.region : null, format: '*', beat: b.id, t: 0, message: `beat ${b.id}: cue “${q.type}” is ${forb.has(q.type) ? 'forbidden by the kit' : 'not in the kit’s allowed list'}`, variants: [] });
  }
  return out;
}

/**
 * M_LOOP_OPEN (docs/SCENARIO_RULES.md 6.4, “loops close; nothing jumps at a loop point”): a float or rock that is
 * mid-cycle when its beat ends jumps back to rest — when the element goes on in the next beat, or, for the last
 * beat, when the ad loops back to the first. Static over every length (a cue is the same in every variant).
 */
export function loopFindings(cfg: EngineConfig): Finding[] {
  const out = new Map<string, Finding>();
  for (const len of Object.keys(cfg.lengths)) {
    const tl = timeline(cfg, len);
    tl.forEach((span, i) => {
      const beat = beatOf(cfg, span.beat), last = i === tl.length - 1;
      const next = beatOf(cfg, tl[last ? 0 : i + 1].beat);
      const c = { start: span.start, end: span.end, wordsOf: (id: string) => { const l = beat.layers.find((x) => x.id === id); return l?.kind === 'text' ? wordCount(copyLines(cfg, l.slot, { fmt: cfg.master_format, lang: cfg.variant_sets.languages[0], hook: cfg.variant_sets.hooks[0], cta: cfg.variant_sets.ctas[0], len }, 0)) : 0; } };
      for (const q of beat.cues) {
        if (q.type !== 'float' && q.type !== 'rock') continue;
        if (!next.layers.some((l) => l.id === q.target)) continue;
        let t0: number;
        try { t0 = q.t !== undefined ? abs(beat, q.t, c) : span.start; } catch { continue; }
        const run = span.end - t0;
        if (!(q.period > 0) || run <= 0) continue;
        const phase = (run / q.period) % 1;
        const amp = q.type === 'float' ? q.amp_u : q.amp_deg, off = Math.abs(Math.sin(2 * Math.PI * phase)) * amp;
        if (off <= (q.type === 'float' ? 0.25 : 1)) continue;
        const key = [q.target, beat.id, q.type].join('|');
        if (out.has(key)) continue;
        const cycles = Math.max(1, Math.round(run / q.period));
        out.set(key, { code: 'M_LOOP_OPEN', severity: 'warn', element: q.target, format: '*', beat: beat.id, t: span.end, variants: [],
          message: `beat ${beat.id} (length ${len}): ${q.type} on ${q.target} ends ${Math.round(phase * 100)}% into its cycle and jumps ${off.toFixed(1)}${q.type === 'float' ? 'u' : '°'} at the ${last ? 'loop back to the start' : `cut to ${next.id}`}; a period of ${(run / cycles).toFixed(2)} s closes it` });
      }
    });
  }
  return [...out.values()];
}

/** The moments a beat is checked at (absolute seconds). */
export function momentsOf(cfg: EngineConfig, span: Span, st: VariantState, isFirst: boolean, every = 0.25): number[] {
  const fps = cfg.render.fps, fr = 1 / fps;
  const beat = beatOf(cfg, span.beat);
  const T = new Set<number>();
  const last = span.end - fr;
  const addT = (t: number) => { if (Number.isFinite(t)) T.add(Math.round(Math.min(last, Math.max(span.start, t)) * 1e4) / 1e4); };
  if (isFirst) addT(0);
  addT(span.start); addT(last);
  if(beat.transition_out&&beat.transition_out.type!=='cut')for(const fraction of [0,.25,.5,.75,1])addT(span.end-beat.transition_out.duration+beat.transition_out.duration*fraction);
  for (let t = Math.ceil(span.start / every) * every; t < span.end - 1e-9; t += every) addT(t);
  const c = { start: span.start, end: span.end, wordsOf: (id: string) => { const l = beat.layers.find((x) => x.id === id); return l && l.kind === 'text' ? wordCount(copyLines(cfg, l.slot, st, 0)) : 0; } };
  for (const q of beat.cues.filter((x) => !x.formats || x.formats.includes(st.fmt))) {
    try {
      if ('t' in q && q.t !== undefined) {
        const t0 = abs(beat, q.t, c);
        const dur = 'dur' in q && typeof q.dur === 'number' ? q.dur : q.type === 'type_on' ? c.wordsOf(q.target) * q.step : 0;
        addT(t0 + dur);
        if (q.type === 'ui' && q.screen) { addT(t0 - fr); addT(t0 + dur); }
      }
      if (q.type === 'ui') for (const k of ['count', 'fade', 'press'] as const) { const v = q[k]; if (v) addT(abs(beat, v[0], c) + v[1]); }
      if (q.type === 'edge_mark') { if (q.show !== undefined) { addT(abs(beat, q.show, c) - fr); addT(abs(beat, q.show, c)); } if (q.hide !== undefined) { addT(abs(beat, q.hide, c) - fr); addT(abs(beat, q.hide, c)); } }
      if (q.type === 'items') { const t0 = q.t !== undefined ? abs(beat, q.t, c) : span.start; for (let t = t0 + q.period; t < span.end; t += q.period) { addT(t - (q.dur ?? 0.2) - fr); addT(t); } }
    } catch { /* a bad anchor is the planner's finding */ }
  }
  return [...T].sort((a, b) => a - b);
}

export interface CheckResult { findings: Finding[]; frames: number; variants: number; uniqueBeats: number; ms: number; standins: string[]; route3d: string[]; blocking: number; warnings: number }

export function checkAll(ctx: EngineCtx, opts: { variants?: VariantState[]; sample?: Sampler; every?: number; onProgress?: (done: number, total: number) => void } = {}): CheckResult {
  const t0 = Date.now();
  const { cfg } = ctx;
  const variants = opts.variants ?? allVariants(cfg);
  const cache = new Map<string, { t: number; raw: Raw[] }[]>();
  const merged = new Map<string, Finding>();
  let frames = 0;
  const standins = new Set<string>(), route3d = new Set<string>();
  const usesAxis = (beatId: string, axis: 'hook' | 'cta') => {
    const b = beatOf(cfg, beatId);
    return b.layers.some((l) => (l.kind === 'text' && cfg.slot_axis[l.slot] === axis) || (axis === 'hook' && l.kind === 'media' && !!l.part_by_hook)) || (axis === 'hook' && b.regions.some((r) => typeof r.paint === 'object' && 'part_by_hook' in r.paint && !!r.paint.part_by_hook));
  };
  variants.forEach((st, vi) => {
    const tl = timeline(cfg, st.len);
    tl.forEach((span, i) => {
      const key = [st.len,span.start,tl[span.index+1]?.beat??'',span.beat, st.fmt, st.lang, span.dur.toFixed(3), i === 0 ? 'first' : 'n', usesAxis(span.beat, 'hook') ? st.hook : '', usesAxis(span.beat, 'cta') ? st.cta : ''].join('|');
      let res = cache.get(key);
      if (!res) {
        res = [];
        for (const t of momentsOf(cfg, span, st, i === 0, opts.every)) {
          const f = buildFrame(ctx, st, t);
          frames++;
          for (const e of f.els) { if (e.standin) standins.add(e.media?.part ?? e.id); if (e.route3d) route3d.add(e.id); }
          res.push({ t: t - span.start, raw: checkFrame(f, cfg, { frame0: i === 0 && t === 0, sample: opts.sample }) });
        }
        cache.set(key, res);
      }
      for (const { t, raw } of res) for (const r of raw) {
        const k = [r.code, r.element ?? '', st.fmt, r.beat??span.beat, r.severity].join('|');
        let m = merged.get(k);
        if (!m) { m = { code: r.code, severity: r.severity, element: r.element, format: st.fmt, beat: r.beat??span.beat, t: span.start + t, message: r.message, variants: [], box: r.box }; merged.set(k, m); }
        if (!m.variants.some((v) => v.lang === st.lang && v.hook === st.hook && v.cta === st.cta && v.len === st.len && v.fmt === st.fmt)) m.variants.push(st);
      }
    });
    opts.onProgress?.(vi + 1, variants.length);
  });
  const findings = [...cueFindings(cfg), ...loopFindings(cfg), ...merged.values()].sort((a, b) => (a.severity === b.severity ? a.code.localeCompare(b.code) : a.severity === 'block' ? -1 : 1));
  return { findings, frames, variants: variants.length, uniqueBeats: cache.size, ms: Date.now() - t0, standins: [...standins], route3d: [...route3d], blocking: findings.filter((f) => f.severity === 'block').length, warnings: findings.filter((f) => f.severity === 'warn').length };
}
