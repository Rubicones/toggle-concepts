/**
 * layout@1 + scenario (brief@3) + kit → per beat a FrameModel in the master format (source 'layout') and the
 * brief@2 layers of the beat. Code places every box: a zone of the kit composition × the master frame, text
 * measured on the real phrases (the widest variant of each language, the kit style, its treatment pads), logos
 * and marks at the kit's sizes, windows filling their zone, regions from the composition. The planner then reads
 * these frame models exactly as it reads reviewed sketches. Issues carry paths into the layout.
 */
import type { Box, Kit, KitComposition, KitStyle, Platforms, Side, Zone } from '../types';
import { contrastRatio, hexOf } from '../engine/util';
import type { GlyphEngine as TextEngine } from '../text-snapshot';
import { stripEmphasis } from '../engine/text';
import { parseSvg } from '../engine/svg';
import type { FMElement, FMKind, FMRegion, FrameModel } from '../sketch/model';
import type { B2Layer, BriefIssue } from '../brief2/types';
import type { BriefV3, B3OnScreen } from '../brief3/types';
import type { LayoutV1 } from './types';

export interface CompiledLayout {
  frames: Record<string, FrameModel>;
  /** the brief@2 layers of each beat, back to front: regions, then the on_screen items with the layout's fields */
  layers: Record<string, B2Layer[]>;
  issues: BriefIssue[];
  master: { id: string; w: number; h: number };
}

const KIND: Record<B3OnScreen['kind'], FMKind> = { text: 'text', logo: 'logo', mark: 'mark', graphic: 'graphic', media: 'window', object: 'object', ui: 'device' };
const PLAQUES = new Set(['button', 'plaque', 'box']);
const r1 = (v: number) => Math.round(v * 10) / 10;
const NULL_LAYER: Omit<B2Layer, 'id' | 'kind'> = { slot: null, style: null, color: null, treatment: null, fill: null, asset: null, logo: null, mark: null, ui: null, paint: null, area: null, shape: null, graphic: null, group: null, behaviour: null, item_bound: null, shadow: null };

/** the master frame: the first format of the scenario, at 1080 px on the short side */
export function masterFrame(b: BriefV3, platforms: Platforms): { id: string; w: number; h: number } {
  const id = b.formats.find((f) => f.master)?.id ?? b.formats[0]?.id ?? '4:5';
  const format = b.formats.find((f) => f.id === id);
  const profile = platforms.profiles[format?.profile ?? platforms.defaults[id]];
  const [a, c] = profile ? [profile.w, profile.h] : id.split(':').map(Number);
  if (!(a > 0 && c > 0)) throw new Error(`Unknown master format: ${id}`);
  const short = 1080;
  return a <= c ? { id, w: short, h: Math.round((short * c) / a) } : { id, w: Math.round((short * a) / c), h: short };
}

export function compileLayout(layout: LayoutV1, b: BriefV3, kit: Kit, platforms: Platforms, engine?: TextEngine): CompiledLayout {
  const issues: BriefIssue[] = [];
  const add = (path: string, message: string, severity: BriefIssue['severity'] = 'block') => issues.push({ path, message, severity, to: 'agent' });
  const M = masterFrame(b, platforms);
  const u = Math.min(M.w, M.h) / 100;
  const frames: CompiledLayout['frames'] = {}, layers: CompiledLayout['layers'] = {};
  const src = b.languages.find((l) => l.source)?.id ?? b.languages[0]?.id;
  const minScale = kit.layout.min_text_scale;

  if (layout.scenario_id !== b.id) add('/scenario_id', `the layout is for ${layout.scenario_id}, the scenario is ${b.id}`);
  for (const bt of b.beats) if (!layout.beats.some((x) => x.beat === bt.id)) add('/beats', `beat “${bt.id}” has no layout`);

  layout.beats.forEach((lb, bi) => {
    const p = `/beats/${bi}`;
    const sb = b.beats.find((x) => x.id === lb.beat);
    if (!sb) { add(`${p}/beat`, `“${lb.beat}” is not a beat of the scenario`); return; }
    const comp: KitComposition | undefined = kit.compositions?.find((c) => c.id === lb.composition);
    if (!comp) { add(`${p}/composition`, `“${lb.composition}” is not a composition of the kit`); return; }
    if (!comp.formats.includes(M.id)) add(`${p}/composition`, `“${comp.id}” is drawn for ${comp.formats.join(', ')}, the master is ${M.id}`, 'note');
    const zoneBox = (name: string): Box | null => { const z: Zone | undefined = comp.zones[name]; return z ? { x: z[0] * M.w, y: z[1] * M.h, w: (z[2] - z[0]) * M.w, h: (z[3] - z[1]) * M.h } : null; };

    // ------------------------------------------------------------------ regions
    const regions: FMRegion[] = [];
    const regionLayers: B2Layer[] = [];
    comp.regions.forEach((cr, ci) => {
      const lr = lb.regions.find((x) => x.id === cr.id);
      if (!lr) { add(`${p}/regions`, `region “${cr.id}” of “${comp.id}” has no paint`); return; }
      if (!cr.paints.includes(lr.paint)) add(`${p}/regions/${lb.regions.indexOf(lr)}/paint`, `“${lr.paint}” is not allowed in region “${cr.id}” (${cr.paints.join(', ')})`);
      const colour = paintColour(kit, lr.paint);
      let box: Box = { x: 0, y: 0, w: M.w, h: M.h }, depth: number | undefined;
      if (cr.area === 'edge' && cr.side) {
        const frac = lr.depth ?? (cr.depth[0] + cr.depth[1]) / 2;
        if (lr.depth !== null && (frac < cr.depth[0] - 1e-9 || frac > cr.depth[1] + 1e-9)) add(`${p}/regions/${lb.regions.indexOf(lr)}/depth`, `depth ${frac} is outside ${cr.depth[0]}–${cr.depth[1]} of “${cr.id}”`);
        const along: Record<Side, number> = { top: M.h, bottom: M.h, left: M.w, right: M.w };
        depth = r1(frac * along[cr.side]);
        box = edgeBox(cr.side, depth, M);
      }
      regions.push({ id: cr.id, legend: cr.id, kind: cr.area, paint: colour ?? lr.paint, ...(cr.side ? { side: cr.side } : {}), ...(depth !== undefined ? { depth } : {}), box, z: ci, measured: true });
      regionLayers.push({ ...NULL_LAYER, id: cr.id, kind: 'region', paint: lr.paint, area: cr.area });
    });
    lb.regions.forEach((lr, i) => { if (!comp.regions.some((c) => c.id === lr.id)) add(`${p}/regions/${i}/id`, `“${lr.id}” is not a region of “${comp.id}”`); });

    // ------------------------------------------------------------------ elements
    const placed = new Set<string>();
    const elements: FMElement[] = [];
    const itemLayers: B2Layer[] = [];
    const stackY = new Map<string, number>(); // text stacked in one zone: the next top
    lb.layers.forEach((l, li) => {
      const lp = `${p}/layers/${li}`;
      const o = sb.on_screen.find((x) => x.id === l.id);
      if (!o) { add(`${lp}/id`, `“${l.id}” is not on screen in beat “${sb.id}” — the layout places the scenario's items, it adds none`); return; }
      if (placed.has(l.id)) { add(`${lp}/id`, `“${l.id}” is placed twice`); return; }
      placed.add(l.id);
      const zb = zoneBox(l.zone);
      if (!zb) { add(`${lp}/zone`, `“${l.zone}” is not a zone of “${comp.id}” (${Object.keys(comp.zones).join(', ')})`); return; }
      let box: Box = { ...zb };
      const el: FMElement = { id: l.id, kind: KIND[o.kind], legend: l.id, box, raw: box, z: regions.length + li, measured: true };
      if (o.kind === 'text') {
        const copy = b.copy.find((c) => c.slot === o.slot);
        let st = l.style ? kit.styles[l.style] : undefined;
        if (!st) { add(`${lp}/style`, 'a text needs a kit style'); return; }
        if (!l.color) add(`${lp}/color`, 'a text needs a kit colour');
        // rule 2.6 by code: a style too big for its zone steps down to the largest style of the same font that fits
        const fitOf = (s: KitStyle): number => {
          const sz = s.size, lhh = sz * (s.line_box ?? s.pitch), trr = kit.treatments[l.treatment ?? s.treatment];
          const pd = trr && PLAQUES.has(trr.kind) && 'pad' in trr && Array.isArray(trr.pad) && trr.pad.length === 4 ? trr.pad.map((x) => x * sz) : [0, 0, 0, 0];
          let k = 1;
          // every language: the planner holds each of them to the minimum scale
          for (const v of copy?.variants ?? []) for (const lang of b.languages.map((x) => x.id)) {
            const lines = (v.text.find((x) => x.lang === lang)?.lines ?? []).map((x) => { const s2 = stripEmphasis(x); return s.case === 'upper' ? s2.toUpperCase() : s.case === 'lower' ? s2.toLowerCase() : s2; });
            if (!lines.length) continue;
            const w = Math.max(...lines.map((x) => (engine?.has(s.font) ? engine.width(s.font, s.weight, x, sz) : x.length * sz * 0.55))) + pd[1] + pd[3];
            k = Math.min(k, zb.w / w, zb.h / (lines.length * lhh + pd[0] + pd[2]));
          }
          return k;
        };
        if (fitOf(st) < minScale) {
          const from = l.style!, alt = Object.entries(kit.styles).filter(([n, s]) => n !== from && s.font === st!.font && s.size < st!.size).sort((x, y) => y[1].size - x[1].size).find(([, s]) => fitOf(s) >= minScale);
          if (alt) { l.style = alt[0]; st = alt[1]; add(`${lp}/style`, `“${from}” does not fit zone “${l.zone}” — set in “${alt[0]}” (rule 2.6, by code)`, 'note'); }
        }
        const size = st.size, lh = size * (st.line_box ?? st.pitch);
        const tr = kit.treatments[l.treatment ?? st.treatment];
        const pad = tr && PLAQUES.has(tr.kind) && 'pad' in tr && Array.isArray(tr.pad) && tr.pad.length === 4 ? tr.pad.map((x) => x * size) : [0, 0, 0, 0];
        // the widest variant in each language decides the block; the source language must fit, the others may scale
        let worst = { w: 0, n: 0, lang: src, scale: 1 };
        for (const lang of b.languages.map((x) => x.id)) {
          for (const v of copy?.variants ?? []) {
            const lines = (v.text.find((t) => t.lang === lang)?.lines ?? []).map((x) => { const s = stripEmphasis(x); return st.case === 'upper' ? s.toUpperCase() : st.case === 'lower' ? s.toLowerCase() : s; });
            if (!lines.length) continue;
            const w = Math.max(...lines.map((x) => (engine?.has(st.font) ? engine.width(st.font, st.weight, x, size) : x.length * size * 0.55))) + pad[1] + pad[3];
            const h = lines.length * lh + pad[0] + pad[2];
            const scale = Math.min(1, zb.w / w, zb.h / h);
            if (lang === src && (w > worst.w || lines.length > worst.n)) worst = { w: Math.max(w, worst.w), n: Math.max(lines.length, worst.n), lang, scale: Math.min(scale, worst.scale) };
            if (scale < 1 - 1e-6) add(lp, `${v.variant} ${lang} needs ${Math.round(w)}×${Math.round(h)} px, zone “${l.zone}” is ${Math.round(zb.w)}×${Math.round(zb.h)} — it ${scale < minScale ? `would scale to ${Math.round(scale * 100)}%, below the kit's minimum ${Math.round(minScale * 100)}% (rule 2.6)` : `scales to ${Math.round(scale * 100)}%`}`, scale < minScale ? 'block' : 'note');
          }
        }
        const bw = Math.min(worst.w, zb.w), bh = Math.min(worst.n * lh + pad[0] + pad[2], zb.h);
        const top = stackY.get(l.zone) ?? zb.y;
        const x = l.align === 'center' ? zb.x + (zb.w - bw) / 2 : l.align === 'right' ? zb.x + zb.w - bw : zb.x;
        const y = l.valign === 'center' && !stackY.has(l.zone) ? zb.y + (zb.h - bh) / 2 : l.valign === 'bottom' && !stackY.has(l.zone) ? zb.y + zb.h - bh : top;
        box = { x: r1(x), y: r1(y), w: r1(bw), h: r1(bh) };
        { const over = box.y + box.h - (zb.y + zb.h); if (over > 1) add(lp, `the texts stacked in zone “${l.zone}” overflow it by ${Math.round(over)} px`, over > u ? 'block' : 'note'); }
        stackY.set(l.zone, box.y + box.h + (kit.layout.gap_region_u / 2) * u);
        const lineBoxes = Array.from({ length: worst.n }, (_, i) => ({ x: box.x + pad[3], y: r1(box.y + pad[0] + i * lh), w: r1(bw - pad[1] - pad[3]), h: r1(lh) }));
        // rule 2.4 by code: a text colour without contrast on what is behind it (its plaque, else the region) → the kit colour with the most
        if (l.color && (kit.colors[l.color] || /^#[0-9a-f]{6}$/i.test(l.color))) {
          const plate = tr && PLAQUES.has(tr.kind) && 'fill' in tr ? (tr as { fill?: string }).fill : undefined;
          const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
          const under = [...regions].sort((a, c) => c.z - a.z).find((r) => cx >= r.box.x && cx <= r.box.x + r.box.w && cy >= r.box.y && cy <= r.box.y + r.box.h);
          const behind = plate ?? under?.paint;
          const hex = (ref: string) => { try { return hexOf(kit, ref); } catch { return null; } };
          const bg = behind ? hex(behind) : null, fg = hex(l.color!);
          if (bg && fg && contrastRatio(fg, bg) < kit.contrast.flat) {
            const best = Object.keys(kit.colors).map((c) => ({ c, r: contrastRatio(kit.colors[c].hex, bg), text: kit.colors[c].roles.includes('text') })).sort((a, c) => Number(c.r >= kit.contrast.flat && c.text) - Number(a.r >= kit.contrast.flat && a.text) || c.r - a.r)[0];
            if (best && best.r >= kit.contrast.flat) { add(`${lp}/color`, `“${l.color}” has no contrast on ${behind} — set in “${best.c}” (rule 2.4, by code)`, 'note'); l.color = best.c; }
          }
        }
        el.text = { lines: lineBoxes, size, style: l.style, treatment: l.treatment ?? st.treatment, color: l.color, align: l.align };
        el.color = l.color;
      } else if (o.kind === 'logo') {
        const logo = kit.logos[o.logo ?? kit.logo_rules.default];
        let aspect = 0.3;
        try { const vb = logo?.mode === 'as_drawn' ? logo.view_box! : parseSvg(logo?.svg ?? '').view_box; aspect = vb[1] / vb[0]; } catch { add(lp, 'the logo SVG cannot be read', 'note'); }
        const w = Math.min(zb.w, kit.logo_rules.width_u[1] * u), h = w * aspect;
        box = { x: r1(l.align === 'right' ? zb.x + zb.w - w : l.align === 'center' ? zb.x + (zb.w - w) / 2 : zb.x), y: r1(l.valign === 'bottom' ? zb.y + zb.h - h : l.valign === 'center' ? zb.y + (zb.h - h) / 2 : zb.y), w: r1(w), h: r1(h) };
        if (w < kit.logo_rules.width_u[0] * u - 1) add(`${lp}/zone`, `the logo zone allows ${Math.round(w / u)}u, the kit's minimum logo width is ${kit.logo_rules.width_u[0]}u`);
        el.logo = o.logo; el.color = l.color;
        if (l.color && !kit.logo_rules.colors.includes(l.color)) add(`${lp}/color`, `the logo comes in ${kit.logo_rules.colors.join(', ')}`);
      } else if (o.kind === 'mark') {
        const mk = o.mark ? kit.marks[o.mark] : undefined;
        const [mw, mh] = mk?.size_u ?? [10, 10];
        const w = mw * u, h = mh * u;
        box = { x: r1(zb.x + (zb.w - w) / 2), y: r1(zb.y + (zb.h - h) / 2), w: r1(w), h: r1(h) };
        el.mark = o.mark;
      }
      el.box = box; el.raw = box;
      // rule 4.4: nothing touches a frame edge; text, logo and marks keep the kit margins
      if (['text', 'logo', 'mark'].includes(o.kind)) {
        const ms = kit.layout.margin_side_u * u, mt = kit.layout.margin_top_u * u;
        const gaps = { left: box.x, right: M.w - box.x - box.w, top: box.y, bottom: M.h - box.y - box.h };
        const touch = Object.entries(gaps).filter(([, g]) => g < u).map(([s]) => s);
        const inside = Object.entries(gaps).filter(([s, g]) => g < (s === 'left' || s === 'right' ? ms : mt) - 1).map(([s]) => s);
        if (touch.length) add(`${lp}/zone`, `rule 4.4: ${l.id} touches the frame edge (${touch.join(', ')})`);
        else if (inside.length) add(`${lp}/zone`, `rule 4.4: ${l.id} is inside the kit margin (${inside.join(', ')})`, 'note');
      }
      elements.push(el);
      itemLayers.push({
        ...NULL_LAYER, id: l.id, kind: o.kind,
        slot: o.slot, style: l.style, color: l.color, treatment: l.treatment, fill: l.fill,
        asset: o.asset, logo: o.logo, mark: o.mark, ui: o.kind === 'ui' ? o.asset : null,
        graphic: o.graphic ? { kind: kit.graphics[o.graphic]?.kind ?? 'svg', graphic: o.graphic, color: l.color ?? Object.keys(kit.colors)[0] } : null,
        shape: l.shape, item_bound: o.item_bound || null,
      });
    });
    for (const o of sb.on_screen) if (!placed.has(o.id)) add(`${p}/layers`, `“${o.id}” of the scenario is not placed`);
    // rule 4.1: the hero of the beat sits in the composition's hero zone
    const focal = lb.layers.find((x) => x.id === sb.focal);
    // A headline or CTA may be the focal item in its own copy zone.
    const focalItem = sb.on_screen.find((o) => o.id === sb.focal);
    if (focal && focal.zone !== 'hero' && !(focalItem?.kind === 'text' && ['text', 'cta'].includes(focal.zone))) add(`${p}/layers/${lb.layers.indexOf(focal)}/zone`, `rule 4.1: the hero “${sb.focal}” is in zone “${focal.zone}”, not in the hero zone`);
    // rule 4.9: consecutive beats change composition, or say why
    if (bi > 0 && layout.beats[bi - 1].composition === lb.composition && !lb.notes.length) add(`${p}/composition`, 'rule 4.9: the same composition as the beat before — change it or say why in notes');

    frames[sb.id] = { schema: 'ad/frame-model@1', beat: sb.id, sketch: '', format: M.id, w: M.w, h: M.h, version: 1, reviewed: false, source: 'layout', regions, elements, decisions: [], questions: [] };
    layers[sb.id] = [...regionLayers, ...itemLayers];
  });
  // rule 4.2: few colours in the graphics (regions and graphic layers), the product aside
  const used = new Set<string>();
  for (const ls of Object.values(layers)) for (const l of ls) { if (l.kind === 'region' && l.paint) { const c = paintColour(kit, l.paint); if (c) used.add(c); } if (l.kind === 'graphic' && l.graphic) used.add(l.graphic.color); }
  const max = kit.limits?.colors_max ?? 2;
  if (used.size > max) add('/beats', `rule 4.2: the graphics use ${used.size} colours (${[...used].join(', ')}); the kit allows ${max}`);
  return { frames, layers, issues, master: M };
}

function edgeBox(side: Side, depth: number, M: { w: number; h: number }): Box {
  if (side === 'top') return { x: 0, y: 0, w: M.w, h: depth };
  if (side === 'bottom') return { x: 0, y: M.h - depth, w: M.w, h: depth };
  if (side === 'left') return { x: 0, y: 0, w: depth, h: M.h };
  return { x: M.w - depth, y: 0, w: depth, h: M.h };
}
/** a kit paint → its colour name (first stop / background of a pattern), a colour name → itself */
export function paintColour(kit: Kit, paint: string): string | null {
  if (kit.colors[paint]) return paint;
  const d = kit.paints[paint];
  if (!d) return null;
  if ('color' in d && d.kind !== 'pattern') return d.color;
  if (d.kind === 'gradient') return d.stops[0]?.color ?? null;
  if (d.kind === 'pattern') return d.bg;
  return null;
}
