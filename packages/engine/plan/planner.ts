import { pickLogo, logoGround } from '../kit/logos';
/**
 * Planner (spec 6.5) — code, no model call. Scenario + reviewed frame models + kit + platform profiles →
 * the layout of every format, parts, stand-ins, timings, the engine config and the plan report. Every rule
 * that changes a value is logged as a decision; whatever the rules cannot resolve is a question.
 *
 *  1 match      frame-model legends → scenario layers (the scenario wins; a missing element is a question)
 *  2 snap       done by the sketch reader (logged there); the planner copies its decisions
 *  3 groups     union box, members keep offsets
 *  4 formats    regions: share of the visible length (+ the zone on that side); landscape turns top→left,
 *               bottom→right; a tall format with a big platform zone takes a media region on that side
 *               (media may pass under a zone, text may not); edge marks keep size and their distance to the
 *               nearer end, clipped to the safe line.
 *               flow: split at the largest gap into a start and an end group; a distance to a frame edge under a
 *               zone is measured from the safe line (≤ 3u for edge-hugging elements, else the share of the
 *               visible length); a distance to a region edge stays; turned layouts centre groups anchored to the
 *               edge; horizontal: the distance to the area's side (or centred), 3u from a safe line; max width
 *               mirrors the anchor gap.
 *               collision order 7.3: gaps → margins → region edge → (elastic) → text width → question
 *  5 crops      by the engine's crop rule (checked in 9)
 *  6 timings    the brief's durations; reading rule and sums checked; violations are questions
 *  7–8 parts    one per asset; stand-in = the sketch area (a square around it)
 *  9 self-check checkAll (code only); blocking findings are questions
 * 10 config
 */
import type { Box, Beat, Cue, EngineConfig, Format, Kit, Layer, LayerPlace, Part, Platforms, Region, Scenario, ScenarioLayer, Side, TextLayer, EdgeMark, Area } from '../types';
import type { GlyphEngine as TextEngine } from '../text-snapshot';
import type { FrameModel, FMElement, FMRegion } from '../sketch/model';
import { stripEmphasis, readingWordCount } from '../engine/text';
import { checkAll, type CheckResult } from '../engine/checks';
import { parseSvg } from '../engine/svg';
import { contrastRatio } from '../engine/util';

export interface PlanNote { where: string; rule: string }
/** One job per generated part (6.5 step 7): the route's spec, where it is used, what stands in for it. */
export interface PartJob { id: string; route: Part['route']; media: Part['media']; side: number | null; what: string; key_part: string | null; key_part_box: [number, number, number, number] | null; must_not: string[]; cutout: boolean; standin: Part['standin']['kind']; beats: string[]; formats: string[]; by_hook: string[]; seconds_needed: number; spec: Record<string, unknown> }
export interface PlanReport { decisions: PlanNote[]; questions: PlanNote[]; findings: { blocking: number; warnings: number; codes: Record<string, number> }; behaviours: Record<string, string>; parts: PartJob[]; checks: { code: string; where: string; finding: string; severity: 'block' | 'warn'; variants: number }[] }
export interface PlanResult { config: EngineConfig; report: PlanReport; check: CheckResult | null }
export interface PlanInput {
  scenario: Scenario; frames: Record<string, FrameModel>; kit: Kit; platforms: Platforms; engine: TextEngine;
  /** sketch file paths as the engine will load them (beat id → path) */
  sketchFile?: (beat: string) => string;
  rules?: { gates?: Record<string, { size_min_px?: number }> };
  kitVersion?: number;
  check?: boolean;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const EDGE_SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const horizSide = (s: Side) => s === 'top' || s === 'bottom';

export function plan(inp: PlanInput): PlanResult {
  const { scenario: sc, kit, platforms, engine } = inp;
  const decisions: PlanNote[] = [], questions: PlanNote[] = [], behaviours: Record<string, string> = {};
  const note = (where: string, rule: string) => decisions.push({ where, rule });
  const ask = (where: string, rule: string) => questions.push({ where, rule });

  const selectedLogos = new Map<ScenarioLayer,ReturnType<typeof pickLogo>>();
  const flexibleLogos = Object.values(kit.logos).some(logo=>logo.mode || logo.ground || logo.role);

  // ---------------------------------------------------------------- formats
  const formats: Format[] = sc.variant_sets.formats.map((id) => {
    const prof = platforms.profiles[sc.platforms[id] ?? platforms.defaults[id]];
    return { id, profile: sc.platforms[id] ?? platforms.defaults[id], w: prof.w, h: prof.h, safe: { ...prof.safe }, bitrate_mbps: prof.bitrate_mbps, token: id.replace(':', 'x') };
  });
  const master = formats.find((f) => f.id === sc.master_format) ?? formats[0];

  // ---------------------------------------------------------------- parts
  const side = inp.rules?.gates?.['frame-check']?.size_min_px ?? 2048;
  const parts: Record<string, Part> = {};
  for (const [id, a] of Object.entries(sc.assets)) {
    if (['ui', 'graphic', 'text', 'logo', 'mark'].includes(a.route)) continue; // engine routes: no part
    const media = a.route === 'live_video' ? 'clip' : a.route === 'stop_motion' ? 'frames' : a.route === 'texture' ? 'tiles' : a.route === 'model_3d' ? 'model' : a.route === 'file' && /\.(mp4|mov|webm|m4v)$/i.test(a.file ?? '') ? 'clip' : a.route === 'file' && /\.zip$/i.test(a.file ?? '') ? 'frames' : 'picture';
    parts[id] = { id, route: a.route, status: 'standin', media, side, key_part_box: a.key_part_box, cutout: a.still?.cutout, what: a.what, standin: { kind: 'procedural', color: kit.object_palette[0] ? kit.colors[kit.object_palette[0]]?.hex ?? '#888888' : '#888888', label: id } };
    if (a.route === 'live_video') { parts[id].fps = platforms.render.fps; }
    if (!a.key_part_box && ['still', 'live_video', 'stop_motion'].includes(a.route)) { parts[id].key_part_box = [0.3, 0.3, 0.7, 0.7]; note(id, 'no key-part box yet → the key zone 0.3–0.7 of the square (the prompt writer puts the key part there)'); }
  }
  if (Object.keys(parts).length) note('parts', `generated masters are planned at ${side} px (rules: gates.frame-check.size_min_px); every part starts as a stand-in`);

  // a paint or colour the kit has: the scenario's, else what the sketch reader measured, else the kit's first sketch colour
  const isColor = (c: string | null | undefined): c is string => !!c && (c.startsWith('#') || !!kit.colors[c]);
  function colorOf(c: string | null | undefined, where: string): string {
    if (isColor(c)) return c;
    const d = kit.sketch_palette.find((x) => kit.colors[x]) ?? Object.keys(kit.colors)[0];
    note(where, `colour ${c ? `“${c}” is not in the kit` : 'not given'} → ${d}`);
    return d;
  }
  function paintOf(p: Scenario['beats'][number]['layers'][number]['paint'], measured: string | undefined, where: string): Region['paint'] {
    if (p && (typeof p !== 'string' || kit.paints[p] || isColor(p))) return p;
    if (measured && measured !== 'content' && (kit.paints[measured] || isColor(measured))) { note(where, `paint ${p ? `“${p}” is not in the kit` : 'not given'} → the sketch's ${measured}`); return measured; }
    const d = Object.keys(kit.paints)[0] ?? colorOf(null, where);
    ask(where, `the region's paint ${p ? `“${p}” is not in the kit` : 'is not given'} and the sketch shows content there → ${d}; give it a paint (or a media part) in the scenario`);
    return d;
  }

  // ---------------------------------------------------------------- beats
  const beats: Beat[] = [];
  const paletteAsked = new Set<string>();
  for (const sb of sc.beats) {
    const fm = inp.frames[sb.id];
    if (!fm) { ask(sb.id, 'no frame model for this beat'); continue; }
    if (!fm.reviewed && fm.source !== 'layout') ask(sb.id, `the frame model v${fm.version} is not reviewed — the planner reads only a reviewed version`);
    for (const d of fm.decisions) note(`${sb.id} sketch`, `${d.where}: ${d.rule}`);
    for (const q of fm.questions) {
      const pal = q.where === 'palette' ? q.rule.split(' ')[0] : null;
      if (pal && paletteAsked.has(pal)) continue;
      if (pal) paletteAsked.add(pal);
      ask(pal ? 'sketches' : `${sb.id} sketch`, `${q.where}: ${q.rule}`);
    }
    beats.push(planBeat(sb, fm));
  }

  function planBeat(sb: Scenario['beats'][number], fm: FrameModel): Beat {
    const M = { w: fm.w, h: fm.h };
    const mu = Math.min(M.w, M.h) / 100;
    const byLegend = new Map<string, FMElement | FMRegion>();
    for (const x of [...fm.regions, ...fm.elements]) if (x.legend) byLegend.set(x.legend, x);
    // 1 match
    for (const l of sb.layers) if (!byLegend.has(l.id)) ask(`${sb.id}.${l.id}`, 'the scenario layer has no element in the reviewed frame model');
    for (const x of [...fm.regions, ...fm.elements]) if (x.legend && !sb.layers.some((l) => l.id === x.legend)) ask(`${sb.id}`, `frame-model element ${x.id} is legend “${x.legend}”, which is no scenario layer`);
    for (const x of fm.elements) if (!x.legend) ask(`${sb.id}`, `frame-model element ${x.id} (${x.kind}) has no legend — it is left out`);

    const regionsOut: Region[] = [], layersOut: Layer[] = [];
    const edgeRegions = sb.layers.filter((l) => l.kind === 'region' && byLegend.get(l.id) && (byLegend.get(l.id) as FMRegion).kind === 'edge');
    // per format: the edge region placement
    type EdgeAt = { side: Side; depth: number; line: number };
    const edgeAt: Record<string, Record<string, EdgeAt>> = {};
    for (const l of sb.layers.filter((x) => x.kind === 'region')) {
      const r = byLegend.get(l.id) as FMRegion | undefined;
      if (!r) continue;
      if (r.kind === 'full') { regionsOut.push({ id: l.id, area: { kind: 'full' }, paint: paintOf(l.paint, r.paint, `${sb.id}.${l.id}`) }); continue; }
      if (r.kind === 'edge' && r.side && r.depth !== undefined) {
        const per: Record<string, { side: Side; depth: number }> = {}, mper: EdgeMark['per'] = {};
        edgeAt[l.id] = {};
        const isMedia = typeof l.paint === 'object' && l.paint !== null && 'kind' in l.paint && l.paint.kind === 'media';
        const zoneM = master.safe[r.side], lenM = (horizSide(r.side) ? M.h - master.safe.top - master.safe.bottom : M.w - master.safe.left - master.safe.right);
        const inZoneM = r.depth <= zoneM + 0.5;
        const share = inZoneM ? r.depth / (horizSide(r.side) ? M.h : M.w) : (r.depth - zoneM) / lenM;
        if (inZoneM) note(`${sb.id}.${l.id}`, `the ${r.side} edge lies inside the master's platform zone → it keeps its share ${share.toFixed(3)} of the whole frame`);
        for (const f of formats) {
          let s: Side = r.side;
          const land = f.w > f.h && M.w <= M.h, tall = f.h / f.w > M.h / M.w + 0.05;
          const rests = sb.layers.some((x) => x.behaviour === 'resting');
          if (f.id !== master.id) {
            if (land && horizSide(s) && !rests) s = s === 'top' ? 'left' : 'right';
            else if (tall && isMedia) {
              const big = EDGE_SIDES.filter((x) => horizSide(x)).find((x) => f.safe[x] / f.h >= 0.2);
              if (big && big !== s) { note(`${sb.id} ${f.id}`, `${l.id}: ${s} → ${big} (the ${big} platform zone is ${Math.round(f.safe[big] / f.h * 100)}% of the height; media may pass under it, text may not)`); s = big; }
            } else if (M.w > M.h && f.h >= f.w && !horizSide(s)) s = s === 'left' ? 'top' : 'bottom';
          }
          const len = horizSide(s) ? f.h - f.safe.top - f.safe.bottom : f.w - f.safe.left - f.safe.right;
          const depth = f.id === master.id ? r.depth : inZoneM ? r1(share * (horizSide(s) ? f.h : f.w)) : r1(share * len + f.safe[s]);
          if (f.id !== master.id && s !== r.side) note(`${sb.id} ${f.id}`, `${l.id} turns ${r.side} → ${s}; depth ${depth} px = share ${share.toFixed(3)} of the visible length + the ${s} zone`);
          per[f.id] = { side: s, depth };
          const full = horizSide(s) ? f.h : f.w;
          edgeAt[l.id][f.id] = { side: s, depth, line: s === 'top' || s === 'left' ? depth : full - depth };
          if (r.mark) {
            const edgeLenM = horizSide(r.side) ? M.w : M.h, edgeLen = horizSide(s) ? f.w : f.h;
            const s0 = horizSide(s) ? f.safe.left : f.safe.top, s1 = horizSide(s) ? f.safe.right : f.safe.bottom;
            const toStart = r.mark.at, toEnd = edgeLenM - r.mark.at - r.mark.length;
            let at = toStart <= toEnd ? toStart : edgeLen - toEnd - r.mark.length;
            const lo = s0, hi = edgeLen - s1 - r.mark.length;
            const at2 = Math.min(Math.max(at, lo), Math.max(lo, hi));
            if (Math.abs(at2 - at) > 0.5) note(`${sb.id} ${f.id}`, `${l.id} edge mark moved ${r1(at)} → ${r1(at2)} px to stay inside the safe line`);
            at = at2;
            mper[f.id] = { at: r1(at), length: r1(r.mark.length), depth: r1(r.mark.depth), radius: r.mark.radius };
          }
        }
        const reg: Region = { id: l.id, area: { kind: 'edge', per }, paint: paintOf(l.paint, r.paint, `${sb.id}.${l.id}`) };
        if (r.mark) {
          const mk = r.mark.name && kit.marks[r.mark.name] ? r.mark.name : Object.keys(kit.marks).find((k) => kit.marks[k].kind === 'tongue');
          if (mk) reg.edge_mark = { mark: mk, fill: kit.marks[mk].fills[0] ?? (typeof reg.paint === 'string' ? reg.paint : kit.sketch_palette[0]), per: mper };
        }
        regionsOut.push(reg);
        continue;
      }
      // a shape region: proportional in the visible area, size in u
      regionsOut.push({ id: l.id, area: { kind: 'shape', per: Object.fromEntries(formats.map((f) => [f.id, { box: mapBox(r.box, f, M), shape: r.shape ?? ('round' as const), radius: r.radius ?? 0 }])) }, paint: paintOf(l.paint, r.paint, `${sb.id}.${l.id}`) });
      note(`${sb.id}.${l.id}`, 'shape region: placed proportionally in the visible area (sizes kept in u)');
    }

    // ---------------------------------------------------------- layers
    const layerEls = sb.layers.filter((l) => l.kind !== 'region').map((l) => ({ l, e: byLegend.get(l.id) as FMElement | undefined })).filter((x): x is { l: ScenarioLayer; e: FMElement } => !!x.e);
    if (flexibleLogos) for (const {l,e} of layerEls) if (l.kind === 'logo') {
      const picked=pickLogo(kit,logoGround(kit,fm.regions,e.box),{logo:l.logo,...(l.color ? {color:l.color} : {})});
      selectedLogos.set(l,picked);
      if (picked.warn) note(`${sb.id}.${l.id}`,picked.warn);
    }
    // behaviours (3.5): assigned from the sketch; the scenario may override
    const beh = new Map<string, string>();
    const hostOf = new Map<string, string>(), restOf = new Map<string, string>();
    const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
    const ovl = (a: Box, b: Box) => area({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) });
    const groupIds = new Set(Object.keys(sb.groups ?? {}));
    const memberGroup = new Map<string, string>();
    for (const [g, ms] of Object.entries(sb.groups ?? {})) for (const m of ms) memberGroup.set(m, g);
    const hostCands = layerEls.filter(({ l }) => l.kind === 'media' || l.kind === 'ui' || l.kind === 'object');
    const bestHost = (id: string, b: Box) => hostCands.filter(({ l }) => l.id !== id).map(({ l, e }) => ({ id: l.id, o: ovl(b, e.box) })).filter((x) => x.o >= 0.3 * area(b)).sort((p, q) => q.o - p.o)[0]?.id;
    const nearCorner = (b: Box) => {
      const dT = b.y - master.safe.top, dB = M.h - master.safe.bottom - (b.y + b.h), dL = b.x - master.safe.left, dR = M.w - master.safe.right - (b.x + b.w);
      const v = Math.min(dT, dB) < 2 * kit.layout.margin_top_u * mu, h = Math.min(dL, dR) < 2 * kit.layout.margin_side_u * mu + mu;
      return v && h;
    };
    const crossingEdge = (b: Box) => edgeRegions.find((er) => { const at = edgeAt[er.id][master.id]; const lo = horizSide(at.side) ? b.y : b.x, len = horizSide(at.side) ? b.h : b.w; return at.line > lo + 0.1 * len && at.line < lo + 0.9 * len; })?.id;
    for (const { l, e } of layerEls) {
      let b = l.behaviour as string | undefined;
      if (!b) {
        if (memberGroup.has(l.id)) b = 'grouped'; // a group of the scenario lists it (its layer may not repeat the group)
        else if ((l.kind === 'logo' || l.kind === 'mark') && nearCorner(e.box)) b = 'fixed';
        else if (l.kind === 'text' || l.kind === 'logo') b = 'flow';
        else if (l.kind === 'mark' || l.kind === 'graphic') b = bestHost(l.id, e.box) ? 'attached' : 'flow';
        else if (l.kind === 'media' || l.kind === 'ui') b = e.bleed?.length ? 'anchored' : 'elastic';
        else if (l.kind === 'object') b = crossingEdge(e.box) ? 'resting' : bestHost(l.id, e.box) ? 'attached' : 'elastic';
        else b = 'flow';
      }
      if (b === 'grouped' && !memberGroup.has(l.id)) { note(`${sb.id}.${l.id}`, 'grouped, but no group lists it → elastic'); b = l.kind === 'text' || l.kind === 'logo' || l.kind === 'mark' ? 'flow' : 'elastic'; }
      if (b === 'attached') { const h = bestHost(l.id, e.box); if (h) hostOf.set(l.id, h); else { b = l.kind === 'object' || l.kind === 'media' || l.kind === 'ui' ? 'elastic' : 'flow'; note(`${sb.id}.${l.id}`, `attached, but it overlaps no window, card, device or object → ${b}`); } }
      if (b === 'resting') { const r = crossingEdge(e.box); if (r) restOf.set(l.id, r); else { b = 'elastic'; note(`${sb.id}.${l.id}`, 'resting, but no region edge crosses it → elastic'); } }
      beh.set(l.id, b);
      behaviours[`${sb.id}.${l.id}`] = b;
    }
    // things that overlap in the sketch stay together (a phone standing on a chair, a can on a pedestal): elastic
    // units overlapping by ≥ 15 % of the smaller one become one implicit group, so they keep their arrangement and
    // scale as one — otherwise each would be placed on its own and they would come apart
    {
      const free = layerEls.filter(({ l }) => beh.get(l.id) === 'elastic' || beh.get(l.id) === 'anchored');
      const parent = new Map(free.map(({ l }) => [l.id, l.id]));
      const root = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
      for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
        const a = free[i].e.box, b2 = free[j].e.box;
        if (ovl(a, b2) >= 0.15 * Math.min(area(a), area(b2))) parent.set(root(free[i].l.id), root(free[j].l.id));
      }
      const sets = new Map<string, string[]>();
      for (const { l } of free) { const r = root(l.id); sets.set(r, [...(sets.get(r) ?? []), l.id]); }
      for (const ms of sets.values()) {
        if (ms.length < 2) continue;
        const g = `together_${ms.join('_')}`;
        groupIds.add(g);
        for (const m of ms) { memberGroup.set(m, g); beh.set(m, 'grouped'); behaviours[`${sb.id}.${m}`] = 'grouped'; }
        note(`${sb.id}.${g}`, `${ms.join(', ')} overlap in the sketch: kept together as one group (no group in the scenario said so)`);
      }
    }
    if ([...beh.values()].includes('fixed')) note(sb.id, `fixed (corner): ${[...beh.entries()].filter(([, v]) => v === 'fixed').map(([k]) => k).join(', ')} — keep their master distance to the corner in u`);
    for (const [a, h] of hostOf) note(`${sb.id}.${a}`, `attached to ${h}: keeps its offset from ${h}'s nearest corner, scaled with it`);
    for (const [a, r] of restOf) note(`${sb.id}.${a}`, `resting on the ${r} edge: keeps its share across the edge and rides it`);

    // units: elastic / anchored layers and groups (a group is one box; members keep offsets and scale)
    type Unit = { id: string; box: Box; window: boolean; anchored: boolean; bleed: Side[]; members: { id: string; box: Box }[] };
    const units: Unit[] = [];
    for (const g of groupIds) {
      const ms = layerEls.filter(({ l }) => beh.get(l.id) === 'grouped' && memberGroup.get(l.id) === g);
      if (!ms.length) continue;
      const x0 = Math.min(...ms.map((m) => m.e.box.x)), y0 = Math.min(...ms.map((m) => m.e.box.y));
      const box = { x: x0, y: y0, w: Math.max(...ms.map((m) => m.e.box.x + m.e.box.w)) - x0, h: Math.max(...ms.map((m) => m.e.box.y + m.e.box.h)) - y0 };
      const bleed = [...new Set(ms.flatMap((m) => m.e.bleed ?? []))];
      units.push({ id: g, box, window: false, anchored: bleed.length > 0, bleed, members: ms.map((m) => ({ id: m.l.id, box: m.e.box })) });
      note(`${sb.id}.${g}`, `group of ${ms.map((m) => m.l.id).join(', ')}: one box ${bleed.length ? '(anchored: a member bleeds)' : '(elastic: keeps its size or shrinks to 70 %)'}`);
    }
    for (const { l, e } of layerEls) {
      const b = beh.get(l.id);
      if (b === 'elastic' || b === 'anchored') units.push({ id: l.id, box: e.box, window: l.kind === 'media', anchored: b === 'anchored', bleed: e.bleed ?? [], members: [{ id: l.id, box: e.box }] });
    }
    const limitOf = (u: Unit) => (u.window ? 0.6 : 0.7);
    const capOf = (u: Unit) => (u.window ? 1.5 : 1);

    // master free area = frame minus edge regions
    type EdgeAtF = Record<string, EdgeAt>;
    const freeArea = (f: { w: number; h: number }, ea: EdgeAtF): Box => {
      let a: Box = { x: 0, y: 0, w: f.w, h: f.h };
      for (const er of edgeRegions) {
        const at = ea[er.id];
        if (!at) continue;
        if (at.side === 'bottom') a = { ...a, h: Math.min(a.h, at.line - a.y) };
        if (at.side === 'top') a = { ...a, y: at.line, h: a.y + a.h - at.line };
        if (at.side === 'left') a = { ...a, x: at.line, w: a.x + a.w - at.line };
        if (at.side === 'right') a = { ...a, w: Math.min(a.w, at.line - a.x) };
      }
      return a;
    };
    const eaOf = (fid: string): EdgeAtF => Object.fromEntries(edgeRegions.filter((er) => edgeAt[er.id]?.[fid]).map((er) => [er.id, { ...edgeAt[er.id][fid] }]));
    const Am = freeArea(M, eaOf(master.id));
    // panels: text drawn ON a flat edge region (a teal lower band with the headline and the button) belongs to that
    // region, not to the free area: per format the region holds its rows (and grows to fit them); the free area is
    // what is left for windows, cards and the other rows. A media edge region is a picture, never a panel.
    const isMediaPaint = (p: unknown) => !!p && typeof p === 'object' && (p as { kind?: string }).kind === 'media';
    const panelOf = new Map<string, string>();
    for (const { l, e } of layerEls) {
      if (beh.get(l.id) !== 'flow') continue;
      const cy = e.box.y + e.box.h / 2;
      const er = edgeRegions.find((r) => { if (isMediaPaint(r.paint)) return false; const at = edgeAt[r.id][master.id]; return at.side === 'bottom' ? cy > at.line : at.side === 'top' ? cy < at.line : false; });
      if (er) panelOf.set(l.id, er.id);
    }
    type PanelM = { id: string; rows: { l: ScenarioLayer; e: FMElement }[][]; split: number; gi: number; go: number; gm: number };
    const panels: PanelM[] = [];
    for (const pid of new Set(panelOf.values())) {
      const its = layerEls.filter(({ l }) => panelOf.get(l.id) === pid).sort((a, b) => a.e.box.y - b.e.box.y || a.e.box.x - b.e.box.x);
      const prs: (typeof its)[] = [];
      for (const x of its) {
        const row = prs.find((r) => r.some((y) => { const o = Math.min(x.e.box.y + x.e.box.h, y.e.box.y + y.e.box.h) - Math.max(x.e.box.y, y.e.box.y); return o >= 0.5 * Math.min(x.e.box.h, y.e.box.h); }));
        if (row) row.push(x); else prs.push([x]);
      }
      const bx = (r: typeof its) => { const y0 = Math.min(...r.map((x) => x.e.box.y)); return { y: y0, b: Math.max(...r.map((x) => x.e.box.y + x.e.box.h)) }; };
      let sp = prs.length, best = -Infinity;
      for (let i = 1; i < prs.length; i++) { const g = bx(prs[i]).y - bx(prs[i - 1]).b; if (g > best) { best = g; sp = i; } }
      const at = edgeAt[pid][master.id], first = bx(prs[0]).y, last = bx(prs[prs.length - 1]).b;
      const gi = at.side === 'bottom' ? first - at.line : at.line - last, go = at.side === 'bottom' ? M.h - last : first;
      const gm = sp < prs.length ? bx(prs[sp]).y - bx(prs[sp - 1]).b : 0;
      panels.push({ id: pid, rows: prs, split: at.side === 'bottom' ? sp : prs.length - (prs.length - sp), gi, go, gm });
      note(`${sb.id}.${pid}`, `panel: ${its.map((x) => x.l.id).join(', ')} sit on ${pid} — the region holds them in every format (and grows to fit them)`);
    }
    const panelIds = new Set(panels.map((p) => p.id));
    const flow = layerEls.filter(({ l }) => beh.get(l.id) === 'flow' && !panelOf.has(l.id)).sort((a, b) => a.e.box.y - b.e.box.y || a.e.box.x - b.e.box.x);
    // rows: flow elements that share a band (≥ 50 % vertical overlap) are placed as one unit
    type FE = (typeof flow)[number];
    const rows: FE[][] = [];
    for (const x of flow) {
      const row = rows.find((r) => r.some((y) => { const o = Math.min(x.e.box.y + x.e.box.h, y.e.box.y + y.e.box.h) - Math.max(x.e.box.y, y.e.box.y); return o >= 0.5 * Math.min(x.e.box.h, y.e.box.h); }));
      if (row) row.push(x); else rows.push([x]);
    }
    const rb = (r: FE[]) => { const x0 = Math.min(...r.map((x) => x.e.box.x)), y0 = Math.min(...r.map((x) => x.e.box.y)); return { x: x0, y: y0, w: Math.max(...r.map((x) => x.e.box.x + x.e.box.w)) - x0, h: Math.max(...r.map((x) => x.e.box.y + x.e.box.h)) - y0 }; };
    // split at the largest gap between rows
    let split = rows.length;
    if (rows.length >= 2) {
      let best = -Infinity;
      for (let i = 1; i < rows.length; i++) { const g = rb(rows[i]).y - (rb(rows[i - 1]).y + rb(rows[i - 1]).h); if (g > best) { best = g; split = i; } }
    } else if (rows.length === 1) {
      const e = rb(rows[0]), dTop = e.y - Am.y, dBot = Am.y + Am.h - (e.y + e.h);
      split = dBot < dTop ? 0 : 1;
    }
    const startR0 = rows.slice(0, split), endR0 = rows.slice(split);
    const span = (rs: FE[][]) => ({ top: Math.min(...rs.map((r) => rb(r).y)), bot: Math.max(...rs.map((r) => rb(r).y + rb(r).h)) });
    const mTopEdge = Am.y > 0.5, mBotEdge = Am.y + Am.h < M.h - 0.5, mLeftEdge = Am.x > 0.5, mRightEdge = Am.x + Am.w < M.w - 0.5;
    const mStart = startR0.length ? span(startR0).top - Am.y : 0, mEnd = endR0.length ? Am.y + Am.h - span(endR0).bot : 0;
    const mGap = startR0.length && endR0.length ? span(endR0).top - span(startR0).bot : 0;
    // elastic units by segment: between two rows of one group (inner), above the start group (top), between the groups (mid), below the end group (bottom)
    const elastic = units.filter((u) => !u.anchored);
    const segOf = (u: Unit) => { const cy = u.box.y + u.box.h / 2; let p = -1; rows.forEach((r, i) => { if (rb(r).y + rb(r).h / 2 < cy) p = i; }); const n = p + 1; return p >= 0 && n < rows.length && (p < split) === (n < split) ? 'inner' : p === split - 1 ? 'mid' : p === -1 ? 'top' : 'bottom'; };
    const prevRow = (u: Unit) => { const cy = u.box.y + u.box.h / 2; let p = -1; rows.forEach((r, i) => { if (rb(r).y + rb(r).h / 2 < cy) p = i; }); return p; };
    const seg = { inner: elastic.filter((u) => segOf(u) === 'inner'), top: elastic.filter((u) => segOf(u) === 'top').sort((a, b) => a.box.y - b.box.y), mid: elastic.filter((u) => segOf(u) === 'mid').sort((a, b) => a.box.y - b.box.y), bottom: elastic.filter((u) => segOf(u) === 'bottom').sort((a, b) => a.box.y - b.box.y) };
    const mTopE = mTopEdge ? Am.y : master.safe.top, mBotE = mBotEdge ? Am.y + Am.h : M.h - master.safe.bottom;
    const gapsM = (us: Unit[], lo: number, hi: number) => us.map((u, i) => (i === 0 ? u.box.y - lo : u.box.y - (us[i - 1].box.y + us[i - 1].box.h))).concat(us.length ? [hi - (us[us.length - 1].box.y + us[us.length - 1].box.h)] : []).map((g) => Math.max(0, g));
    const midLoM = startR0.length ? span(startR0).bot : mTopE, midHiM = endR0.length ? span(endR0).top : mBotE;
    const gMid = gapsM(seg.mid, midLoM, midHiM), gTop = gapsM(seg.top, mTopE, startR0.length ? span(startR0).top : mBotE), gBot = gapsM(seg.bottom, endR0.length ? span(endR0).bot : mTopE, mBotE);
    // the main element (7.2 rule 3): the largest window, card, device or group
    const main = [...units].sort((a, b) => area(b.box) - area(a.box))[0];
    const mainShare = main ? main.box.h / M.h : 0;

    const per: Record<string, Record<string, LayerPlace>> = {};
    for (const { l } of layerEls) per[l.id] = {};
    const riders: Record<string, Set<string>> = {}; // format → layers anchored to an edge line
    const gapR = kit.layout.gap_region_u;
    const unitBox: Record<string, Record<string, { box: Box; k: number }>> = {};

    type FResult = { per: Record<string, LayerPlace>; notes: PlanNote[]; asks: PlanNote[]; ea: EdgeAtF; riders: Set<string>; units: Record<string, { box: Box; k: number }>; elasticFailed: boolean };
    const layoutF = (f: Format, mode: 'stack' | 'columns'): FResult => {
      const fNotes: PlanNote[] = [], fAsks: PlanNote[] = [];
      const note = (where: string, rule: string) => fNotes.push({ where, rule });
      const ask = (where: string, rule: string) => fAsks.push({ where, rule });
      const P: Record<string, LayerPlace> = {};
      const UB: Record<string, { box: Box; k: number }> = {};
      const ea = eaOf(f.id);
      const rid = new Set<string>();
      const keepsRelationP = () => edgeRegions.every((er) => { const a = edgeAt[er.id][master.id].side, b = ea[er.id]?.side; return a === b || (a === 'top' && b === 'left') || (a === 'bottom' && b === 'right'); });
      let elasticFailed = false;
      const fu = Math.min(f.w, f.h) / 100;
      const zone = f.safe;
      const isM = f.id === master.id;
      const startR = [...startR0], endR = [...endR0];
      // fixed (corner) elements: the master distance to the nearest corner; a side under a platform zone is measured
      // from the safe line (≤ 3u); a master side under a zone gives a zoneless side the kit margin
      for (const { l, e } of layerEls.filter(({ l }) => beh.get(l.id) === 'fixed')) {
        const h = l.kind === 'logo' ? logoH(l, e) : e.box.h;
        const top = e.box.y + h / 2 <= M.h / 2, left = e.box.x + e.box.w / 2 <= M.w / 2;
        const vSide: Side = top ? 'top' : 'bottom', hSide: Side = left ? 'left' : 'right';
        const dist = (s: Side, d0: number, margin: number) => {
          const mz = master.safe[s], fz = zone[s];
          const d = d0 - mz; // from the master's safe line (or the frame edge)
          if (isM) return d0;
          if (fz > 0) return fz + Math.min(d, 3 * fu);
          return mz > 0 ? margin * fu : d;
        };
        const dy = dist(vSide, top ? e.box.y : M.h - e.box.y - h, kit.layout.margin_top_u);
        // horizontally the distance stays (7.2 rule 6), at least 3u from a safe line; a master side under a zone gives a zoneless side the kit margin
        const dx0 = left ? e.box.x : M.w - e.box.x - e.box.w;
        const mzH = master.safe[hSide];
        let dx = isM ? dx0 : mzH > 0 ? (zone[hSide] > 0 ? zone[hSide] + Math.max(dx0 - mzH, 3 * fu) : kit.layout.margin_side_u * fu) : dx0;
        if (zone[hSide] > 0) dx = Math.max(dx, zone[hSide] + 3 * fu);
        const x = left ? dx : f.w - dx - e.box.w, y = top ? dy : f.h - dy - h;
        if (!isM && (Math.abs(x - e.box.x) > 0.5 || Math.abs(y - e.box.y) > 0.5)) note(`${sb.id} ${f.id}`, `${l.id}: ${r1(e.box.x)},${r1(e.box.y)} → ${r1(x)},${r1(y)} (kept from the ${vSide}-${hSide} corner; from the safe line ≤ 3u)`);
        P[l.id] = { box: { x: r1(x), y: r1(y), w: e.box.w, h: r1(h) }, v_anchor: top ? 'top' : 'bottom' };
      }
      // panels: their rows inside their region; the region grows when the rows need more than its share
      for (const pn of panels) {
        const at = ea[pn.id];
        if (!at) continue;
        const k = isM ? 1 : fu / mu;
        const hOf = (r: { l: ScenarioLayer; e: FMElement }[]) => { const y0 = Math.min(...r.map((x) => x.e.box.y)); return Math.max(...r.map((x) => x.e.box.y - y0 + heightOf(x.l, x.e))); };
        const gapIn = (rs: typeof pn.rows) => rs.slice(1).reduce((a, r, i) => a + Math.max(0, Math.min(...r.map((x) => x.e.box.y)) - Math.max(...rs[i].map((x) => x.e.box.y + x.e.box.h))) * k, 0);
        const sR = pn.rows.slice(0, pn.split), eR = pn.rows.slice(pn.split);
        const hS = sR.reduce((a, r) => a + hOf(r), 0) + gapIn(sR), hE = eR.reduce((a, r) => a + hOf(r), 0) + gapIn(eR);
        const gMid = sR.length && eR.length ? Math.min(pn.gm * k, 6 * fu) : 0;
        const masterZ = master.safe[edgeAt[pn.id][master.id].side];
        const place = (rs: typeof pn.rows, y0: number, colX: number, colW: number, vAnch: 'top' | 'bottom') => {
          let y = y0;
          rs.forEach((r, ri) => {
            const yr = Math.min(...r.map((x) => x.e.box.y));
            for (const { l, e } of r) {
              const h = heightOf(l, e), top = y + (e.box.y - yr);
              const gl = e.box.x, gr = M.w - e.box.x - e.box.w;
              const align = e.text?.align ?? (Math.abs(gl - gr) < 1.5 * mu ? 'center' : gl <= gr ? 'left' : 'right');
              const side = Math.max(isM ? gl : Math.max(Math.min(gl, gr) * k, kit.layout.margin_side_u * fu * (colW < f.w ? 0.5 : 1)), zone.left ? zone.left + 3 * fu : 0);
              const lo = colX + (align === 'right' ? Math.max(kit.layout.margin_side_u * fu, zone.left + 3 * fu) : side), hi = colX + colW - (align === 'left' ? Math.max(kit.layout.margin_side_u * fu, zone.right ? zone.right + 3 * fu : 0) : side);
              if (l.kind === 'text') {
                const need = widest(l as ScenarioLayer & { slot: string; style: string });
                const w = isM && align === 'left' ? M.w - 2 * gl : hi - lo;
                if (need * kit.layout.min_text_scale > w + 0.5) ask(`${sb.id} ${f.id} ${l.id}`, `the widest line needs ${r1(need)} px; even at the minimum scale it does not fit the ${r1(w)} px of ${pn.id}`);
                P[l.id] = { box: { x: r1(lo), y: r1(top), w: r1(w), h: r1(h) }, align, v_anchor: vAnch };
              } else {
                const w = e.box.w, x = align === 'center' ? lo + (hi - lo - w) / 2 : align === 'right' ? hi - w : lo;
                P[l.id] = { box: { x: r1(x), y: r1(top), w: r1(w), h: r1(h) }, ...(l.kind === 'mark' ? {} : { v_anchor: vAnch }) };
              }
              if (keepsRelationP()) rid.add(l.id);
            }
            y += hOf(r) + (ri < rs.length - 1 ? Math.max(0, Math.min(...rs[ri + 1].map((x) => x.e.box.y)) - Math.max(...r.map((x) => x.e.box.y + x.e.box.h))) * k : 0);
          });
        };
        if (horizSide(at.side)) {
          const gi = isM ? pn.gi : Math.max(gapR * fu, pn.gi * k);
          const go = isM ? pn.go : zone[at.side] + Math.max((pn.go - masterZ) * k, 3 * fu);
          const need = gi + hS + gMid + hE + go;
          if (!isM && at.depth < need - 0.5) {
            note(`${sb.id} ${f.id}`, `${pn.id} grows ${r1(at.depth)} → ${r1(need)} px to hold ${pn.rows.flat().map((x) => x.l.id).join(', ')}`);
            at.depth = r1(need); at.line = at.side === 'top' ? at.depth : f.h - at.depth;
          }
          if (at.depth > 0.85 * f.h) ask(`${sb.id} ${f.id}`, `${pn.id} needs ${r1(at.depth)} px of the ${f.h} px height for its text`);
          if (at.side === 'bottom') { place(sR, at.line + gi, 0, f.w, 'top'); place(eR, f.h - go - hE, 0, f.w, 'bottom'); }
          else { place(sR, go, 0, f.w, 'top'); place(eR, at.line - gi - hE, 0, f.w, 'bottom'); }
        } else {
          // the region turned into a side column (landscape): the rows as one stack, centred vertically in it
          const need = Math.min(0.6 * f.w, Math.max(...pn.rows.flat().filter((x) => x.l.kind === 'text').map((x) => widest(x.l as ScenarioLayer & { slot: string; style: string })), 0) + 2 * Math.max(kit.layout.margin_side_u * fu, zone.right + 3 * fu, zone.left + 3 * fu));
          if (at.depth < need - 0.5) { note(`${sb.id} ${f.id}`, `${pn.id} widens ${r1(at.depth)} → ${r1(need)} px to hold its text`); at.depth = r1(need); at.line = at.side === 'left' ? at.depth : f.w - at.depth; }
          const all = pn.rows, gap = Math.min(pn.gm * k, 6 * fu);
          const hAll = hS + hE + gap;
          const avail = f.h - zone.top - zone.bottom - 2 * kit.layout.margin_top_u * fu;
          if (hAll > avail + 0.5) ask(`${sb.id} ${f.id}`, `${pn.id}: its text is ${r1(hAll - avail)} px taller than the column`);
          const colX = at.side === 'left' ? 0 : f.w - at.depth, colW = at.depth;
          const y0 = zone.top + kit.layout.margin_top_u * fu + Math.max(0, (avail - hAll) / 2);
          place(sR, y0, colX, colW, 'top'); place(eR, y0 + hS + gap, colX, colW, 'top');
          void all;
        }
      }
      let A = freeArea(f, ea);
      const topEdge = A.y > 0.5, botEdge = A.y + A.h < f.h - 0.5, leftEdge = A.x > 0.5, rightEdge = A.x + A.w < f.w - 0.5;
      let topE = topEdge ? A.y : zone.top, botE = botEdge ? A.y + A.h : f.h - zone.bottom;
      // a distance to a bound: a region edge keeps the master distance (or the kit gap when it was a frame edge);
      // a frame edge under a zone is measured from the safe line (≤ 3u when the element hugs it, else the share)
      const toBound = (m0: number, isEdge: boolean, wasEdge: boolean, z: number, which: string): number => {
        if (isM) return m0;
        // a master side under a platform zone: the distance counts from its safe line; a zoneless side gets at least the kit margin
        const mz = !wasEdge ? master.safe[/start/.test(which) ? 'top' : 'bottom'] : 0;
        const m = m0 - mz;
        if (mz > 0 && z === 0) { const d = Math.max(m, kit.layout.margin_top_u * fu); note(`${sb.id} ${f.id}`, `${which}: ${r1(m)} px from the master's safe line → ${r1(d)} px from the frame edge (at least the kit margin)`); return d; }
        if (isEdge) { if (!wasEdge) note(`${sb.id} ${f.id}`, `${which}: its bound is now a region edge → the kit gap ${gapR}u`); return wasEdge ? m : gapR * fu; }
        if (wasEdge) { const d = z + Math.min(m, 3 * fu); note(`${sb.id} ${f.id}`, `${which}: its bound is now the frame edge → ${r1(d - z)} px from the ${z ? 'safe line' : 'edge'}`); return d; }
        if (z > 0 && m <= 2 * kit.layout.margin_top_u * mu) { const d = Math.min(m, 3 * fu); if (Math.abs(d - m) > 0.5) note(`${sb.id} ${f.id}`, `${which}: ${r1(m)} px to the frame edge → ${r1(d)} px from the safe line (≤ 3u)`); return z + d; }
        if (z > 0) note(`${sb.id} ${f.id}`, `${which}: ${r1(m)} px, measured from the safe line`);
        return z + m;
      };
      type Placed = { l: ScenarioLayer; e: FE['e']; top: number; h: number; row: number };
      const stackC = (rs: FE[][], y0: number, floor = Infinity) => {
        const items: Placed[] = [];
        let y = y0;
        rs.forEach((r, ri) => {
          const b = rb(r), hs = r.map(({ l, e }) => heightOf(l, e));
          const rowH = Math.max(...r.map((x, i) => x.e.box.y - b.y + hs[i]));
          r.forEach((x, i) => items.push({ l: x.l, e: x.e, top: y + (x.e.box.y - b.y), h: hs[i], row: rows.indexOf(r) }));
          y += rowH;
          if (ri < rs.length - 1) {
            let g = rb(rs[ri + 1]).y - (b.y + b.h);
            // an inner elastic unit between these rows keeps its master size: the gap stays
            if (floor !== Infinity && !seg.inner.some((u) => prevRow(u) === rows.indexOf(r))) g = Math.min(g, Math.max(floor, 0));
            y += g;
          }
        });
        return { items, h: y - y0 };
      };
      const stack = (rs: FE[][], y0: number) => stackC(rs, y0);
      const keepsRelation = () => edgeRegions.every((er) => { const a = edgeAt[er.id][master.id].side, b = ea[er.id]?.side; return a === b || (a === 'top' && b === 'left') || (a === 'bottom' && b === 'right'); });
      const turned0 = mode === 'stack' && !isM && f.w > f.h && edgeRegions.some((er) => ea[er.id] && !horizSide(ea[er.id].side) && horizSide(edgeAt[er.id][master.id].side));
      // a turned layout centres the text when every row hugs the turned edge; otherwise the stack rules place the groups
      const turned = turned0 && rows.every((r) => (mTopEdge && startR0.includes(r)) || (mBotEdge && endR0.includes(r)));
      if (turned0 && !turned) note(`${sb.id} ${f.id}`, 'the edge turned, but not every row hugs it: the groups keep their distances (stack rules)');
      let placed: Placed[] = [];
      const minTop0 = topE + (topEdge ? gapR * fu : (zone.top ? 0 : 3.5 * fu));
      let minTop = minTop0, maxBot = botE - (botEdge ? gapR * fu : (zone.bottom ? 0 : 3.5 * fu));
      const logo = layerEls.find(({ l }) => beh.get(l.id) === 'fixed' && P[l.id] && P[l.id].box.y < f.h / 2);
      // elastic fit of one segment: gaps (step 1 floors them to min(6u, gap)), then the units (step 4 to their limits)
      const fitSeg = (us: Unit[], gM: number[], lo: number, hi: number, where: string): { over: number } => {
        if (!us.length) return { over: 0 };
        const avail = hi - lo, lens = us.map((u) => u.box.h);
        const sumG = gM.reduce((a, b) => a + b, 0), sumL = lens.reduce((a, b) => a + b, 0);
        const gF = gM.map((g) => Math.min(g, 6 * fu)), sumGF = gF.reduce((a, b) => a + b, 0);
        let gaps = gM, scale = us.map(() => 1);
        if (avail >= sumG + sumL - 0.5) {
          // room to spare: windows stretch (≤ 1.5×), cards keep their size; what is left goes to the gaps
          let extra = avail - sumG - sumL;
          const win = us.map((u, i) => (u.window ? i : -1)).filter((i) => i >= 0);
          if (win.length && extra > 0.5) {
            const room = win.reduce((a, i) => a + lens[i] * (capOf(us[i]) - 1), 0), give = Math.min(extra, room);
            for (const i of win) scale[i] = 1 + (give / Math.max(room, 1e-6)) * (capOf(us[i]) - 1);
            extra -= give;
            if (give > 0.5 && !isM) note(`${sb.id} ${f.id}`, `${win.map((i) => us[i].id).join(', ')} stretch${win.length === 1 ? 'es' : ''} ${r1(give)} px into the free length (≤ 1.5×)`);
          }
          if (extra > 0.5) gaps = gM.map((g) => g + extra * (sumG > 0 ? g / sumG : 1 / gM.length));
        } else if (avail >= sumGF + sumL - 0.5) {
          const t = (avail - sumGF - sumL) / Math.max(1e-6, sumG - sumGF);
          gaps = gM.map((g, i) => gF[i] + (g - gF[i]) * t);
          if (!isM) note(`${sb.id} ${f.id}`, `collision step 1: the gaps next to ${us.map((u) => u.id).join(', ')} give ${r1(sumG + sumL - avail)} px (to 6u)`);
        } else {
          gaps = gF;
          const s = (avail - sumGF) / sumL, lim = Math.max(...us.map(limitOf));
          if (s + 1e-6 >= lim) { scale = us.map(() => s); note(`${sb.id} ${f.id}`, `collision step 4: ${us.map((u) => u.id).join(', ')} shrink${us.length === 1 ? 's' : ''} to ${(s * 100).toFixed(0)} % (limit ${Math.round(lim * 100)} %)`); }
          else { scale = us.map(limitOf); const over = sumGF + us.reduce((a, u, i) => a + lens[i] * scale[i], 0) - avail; ask(`${sb.id} ${f.id} ${where}`, `${us.map((u) => u.id).join(', ')} need ${r1(over)} px more than the free length even at their limits (collision steps 1–4)`); elasticFailed = true; }
        }
        let y = lo + gaps[0];
        us.forEach((u, i) => {
          const s = scale[i];
          const w = u.window ? u.box.w : u.box.w * s, h = u.box.h * s;
          const gl = u.box.x - Am.x, gr = Am.x + Am.w - (u.box.x + u.box.w);
          const centred = Math.abs(gl - gr) < 1.5 * mu;
          let x = centred ? A.x + (A.w - w) / 2 : gl <= gr ? A.x + gl : A.x + A.w - gr - w;
          if (!centred && !u.window && s < 1) x = gl <= gr ? x + (u.box.w - w) / 2 * 0 : x; // a shrinking card keeps its side distance
          x = Math.min(Math.max(x, Math.min(A.x, f.w - w)), Math.max(A.x, A.x + A.w - w));
          UB[u.id] = { box: { x: r1(x), y: r1(y), w: r1(w), h: r1(h) }, k: u.window ? 1 : s };
          y += h + gaps[i + 1];
        });
        return { over: 0 };
      };
      const needOf = (us: Unit[], gM: number[], level: 1 | 4) => (us.length ? gM.reduce((a, g) => a + Math.min(g, 6 * fu), 0) + us.reduce((a, u) => a + u.box.h * (level === 4 ? limitOf(u) : 1), 0) : 0);

      if (mode === 'columns') {
        // 7.2 rule 3: two columns of the same paints — text left, the main element right
        const lim = limitOf(main);
        const availH = f.h - zone.top - zone.bottom - 2 * kit.layout.margin_top_u * fu;
        let k = Math.min(1, availH / main.box.h);
        if (k < lim) { ask(`${sb.id} ${f.id}`, `two columns: ${main.id} needs ${Math.round(main.box.h * lim)} px of height at its limit, the column has ${Math.round(availH)}`); k = lim; elasticFailed = true; }
        const w = main.window ? main.box.w : main.box.w * k, h = main.window ? Math.min(main.box.h * capOf(main), availH) : main.box.h * k;
        const colW = Math.max(w + 2 * kit.layout.margin_side_u * fu, A.w * 0.4);
        const colX = A.x + A.w - colW - zone.right;
        UB[main.id] = { box: { x: r1(colX + (colW - w) / 2), y: r1(zone.top + (f.h - zone.top - zone.bottom - h) / 2), w: r1(w), h: r1(h) }, k: main.window ? 1 : k };
        note(`${sb.id} ${f.id}`, `two columns (7.2 rule 3): text left, ${main.id} right${k < 1 ? ` at ${Math.round(k * 100)} %` : ''}`);
        for (const u of units.filter((x) => x !== main && !x.anchored)) { UB[u.id] = { box: mapBox(u.box, f, M), k: 1 }; note(`${sb.id} ${f.id}`, `${u.id}: not the main element → placed proportionally`); }
        // the text column: every row as one group, gaps as in the sketch (step 1 to 6u), centred vertically, below a top corner logo
        const all = rows;
        let S = stack(all, 0);
        const lo = Math.max(minTop, logo ? P[logo.l.id].box.y + P[logo.l.id].box.h + 6 * fu : minTop), hi = maxBot;
        if (S.h > hi - lo) { S = stackC(all, 0, 6 * fu); note(`${sb.id} ${f.id}`, 'collision step 1: row gaps of the text column give way (to 6u)'); }
        if (S.h > hi - lo + 0.5) ask(`${sb.id} ${f.id}`, `the text column is ${r1(S.h - (hi - lo))} px too tall`);
        placed = stackC(all, lo + Math.max(0, (hi - lo - S.h) / 2), S.h < stack(all, 0).h ? 6 * fu : Infinity).items;
        A = { x: A.x, y: A.y, w: colX - A.x - 3 * fu, h: A.h };
      } else if (turned) {
        // turned layouts: the groups anchored to the edge are centred vertically in the text column; others keep their distances
        const edgeAnch = [...(mTopEdge ? startR : []), ...(mBotEdge ? endR : [])];
        const restS = startR.filter((r) => !edgeAnch.includes(r)), restE = endR.filter((r) => !edgeAnch.includes(r));
        if (edgeAnch.length) {
          const s = stack(edgeAnch, 0);
          const y0 = zone.top + (f.h - zone.top - zone.bottom - s.h) / 2;
          placed.push(...stack(edgeAnch, y0).items);
          note(`${sb.id} ${f.id}`, `turned layout: ${edgeAnch.flat().map((x) => x.l.id).join(', ')} centred vertically in the text column`);
        }
        if (restS.length) placed.push(...stack(restS, A.y + toBound(mStart, false, mTopEdge, zone.top, 'start group')).items);
        if (restE.length) { const s = stack(restE, 0); placed.push(...stack(restE, f.h - toBound(mEnd, false, mBotEdge, zone.bottom, 'end group') - s.h).items); }
        // the units keep their place in the free area (scaled to fit it, windows to 60 %, others 70 %)
        const VA = { x: Math.max(A.x, zone.left), y: Math.max(A.y, zone.top), w: Math.min(A.x + A.w, f.w - zone.right) - Math.max(A.x, zone.left), h: Math.min(A.y + A.h, f.h - zone.bottom) - Math.max(A.y, zone.top) };
        for (const u of elastic) {
          const kk = Math.min(1, VA.w / Am.w, VA.h / Am.h, (VA.w - 2 * kit.layout.margin_side_u * fu) / u.box.w, (VA.h - 2 * kit.layout.margin_top_u * fu) / u.box.h);
          if (kk < limitOf(u)) ask(`${sb.id} ${f.id}`, `${u.id} would shrink to ${Math.round(kk * 100)} % in the free area (limit ${Math.round(limitOf(u) * 100)} %)`);
          const w = u.box.w * kk, h = u.box.h * kk;
          const cx = VA.x + ((u.box.x + u.box.w / 2 - Am.x) / Am.w) * VA.w, cy = VA.y + ((u.box.y + u.box.h / 2 - Am.y) / Am.h) * VA.h;
          const x = Math.min(Math.max(cx - w / 2, VA.x), VA.x + VA.w - w), y = Math.min(Math.max(cy - h / 2, VA.y), VA.y + VA.h - h);
          UB[u.id] = { box: { x: r1(x), y: r1(y), w: r1(w), h: r1(h) }, k: kk };
        }
        if (elastic.length) note(`${sb.id} ${f.id}`, `turned layout: ${elastic.map((u) => u.id).join(', ')} keep their place in the free area`);
      } else {
        // a side column that becomes a stacked area (its edge turned from vertical to horizontal): the rows keep order and gaps as one group from the top
        const colToStack = !isM && (mLeftEdge || mRightEdge) && (topEdge || botEdge) && !(leftEdge || rightEdge);
        if (colToStack) { startR.splice(0, startR.length, ...rows); endR.splice(0, endR.length); note(`${sb.id} ${f.id}`, 'the side column becomes a stack: all rows as one group from the top'); }
        let sTop = startR.length ? (topEdge ? A.y + toBound(mStart, true, mTopEdge, 0, 'start group') : colToStack ? zone.top + kit.layout.margin_top_u * fu : toBound(mStart, false, mTopEdge, zone.top, 'start group')) : 0;
        // the start group never sits over the fixed corner logo: it follows it at 6u
        if (startR.length && logo && !topEdge) {
          const lb = P[logo.l.id].box, s2 = lb.y + lb.h + 6 * fu;
          if (sTop < s2) { if (!isM) note(`${sb.id} ${f.id}`, `start group below the fixed ${logo.l.id} at 6u (${r1(sTop)} → ${r1(s2)})`); sTop = Math.max(sTop, s2); }
        }
        let S = stack(startR, sTop);
        const Eh = stack(endR, 0).h;
        let eBot = endR.length ? (botEdge ? A.y + A.h - toBound(mEnd, true, mBotEdge, 0, 'end group') : f.h - toBound(mEnd, false, mBotEdge, zone.bottom, 'end group')) : 0;
        let E = stack(endR, eBot - Eh);
        // collision order (vertical); the units between the groups need their gaps (floored) and their length
        const floorGap = Math.min(6 * fu, mGap > 0 ? mGap : 6 * fu);
        let needMid = seg.mid.length ? needOf(seg.mid, gMid, 1) : S.items.length && E.items.length ? floorGap : 0;
        const sBot = () => (S.items.length ? Math.max(...S.items.map((x) => x.top + x.h)) : topE);
        const eTop = () => (E.items.length ? Math.min(...E.items.map((x) => x.top)) : botE);
        const overOf = () => Math.max(seg.mid.length || (S.items.length && E.items.length) ? needMid - (eTop() - sBot()) : 0, S.items.length ? sBot() - maxBot : 0, E.items.length ? minTop - eTop() : 0, seg.top.length && S.items.length ? needOf(seg.top, gTop, 4) - (Math.min(...S.items.map((x) => x.top)) - topE) : 0);
        let over = overOf();
        if (over > 0.5 && startR.length > 1) {
          // step 1: gaps between the rows of a group give way to 6u (never below the sketch's own gap)
          const before = S.h;
          S = stackC(startR, S.items.length ? Math.min(...S.items.map((x) => x.top)) : sTop, 6 * fu);
          if (before - S.h > 0.5) { note(`${sb.id} ${f.id}`, `collision step 1: row gaps give ${r1(before - S.h)} px (to 6u)`); over = overOf(); }
        }
        if (over > 0.5) {
          // step 2: margins give way (the end group toward its bound, then the start group toward its bound)
          if (E.items.length) { const room = Math.max(0, maxBot - eBot); const g = Math.min(over, room); if (g > 0.5) { eBot += g; E = stack(endR, eBot - Eh); note(`${sb.id} ${f.id}`, `collision step 2: the end group's margin gives ${r1(g)} px`); over = overOf(); } }
          if (over > 0.5 && S.items.length) { const room = Math.max(0, sTop - minTop); const g = Math.min(over, room); if (g > 0.5 && !(logo && !topEdge)) { S.items.forEach((x) => (x.top -= g)); sTop -= g; note(`${sb.id} ${f.id}`, `collision step 2: the start group's margin gives ${r1(g)} px`); over = overOf(); } }
          // step 3: the region edge next to the crowded side moves into the region, down to the region's floor
          if (over > 0.5) {
            const er = edgeRegions.find((x) => ea[x.id] && horizSide(ea[x.id].side) && !panelIds.has(x.id));
            if (er) {
              const at = ea[er.id], floor = kit.layout.region_floor_u * fu;
              const give = Math.min(over, Math.max(0, at.depth - floor - zone[at.side]));
              if (give > 0.5) {
                at.depth = r1(at.depth - give); at.line = at.side === 'top' ? at.depth : f.h - at.depth;
                if (at.side === 'bottom') { eBot += give; maxBot += give; botE += give; if (E.items.length) E = stack(endR, eBot - Eh); } else { minTop -= give; topE -= give; }
                note(`${sb.id} ${f.id}`, `collision step 3: the ${er.id} edge moves ${r1(give)} px into ${er.id} (its floor ${r1(floor)} px)`);
                over = overOf();
              }
            }
          }
          // step 4: the units between the groups shrink to their limits (windows 60 %, cards / devices / groups 70 %)
          if (over > 0.5 && seg.mid.length) { needMid = needOf(seg.mid, gMid, 4); over = overOf(); }
          if (over > 0.5) { ask(`${sb.id} ${f.id}`, `the text does not fit by ${r1(over)} px after the collision order (shorter copy, or a sketch for ${f.id})`); if (seg.mid.length || seg.top.length) elasticFailed = true; }
        }
        placed = [...S.items, ...E.items];
        // the units: between the groups, above the start group, below the end group, inside a group
        fitSeg(seg.mid, gMid, sBot(), eTop(), 'mid');
        if (seg.top.length) fitSeg(seg.top, gTop, topE, S.items.length ? Math.min(...S.items.map((x) => x.top)) : eTop(), 'top');
        if (seg.bottom.length) fitSeg(seg.bottom, gBot, E.items.length ? eTop() + E.h : sBot(), botE, 'bottom');
        for (const u of seg.inner) {
          const p = prevRow(u), pr = placed.filter((x) => x.row === p);
          const y = (pr.length ? Math.max(...pr.map((x) => x.top + x.h)) : sBot()) + (u.box.y - (rb(rows[p]).y + rb(rows[p]).h));
          const gl = u.box.x - Am.x, gr = Am.x + Am.w - (u.box.x + u.box.w);
          const x = Math.abs(gl - gr) < 1.5 * mu ? A.x + (A.w - u.box.w) / 2 : gl <= gr ? A.x + gl : A.x + A.w - gr - u.box.w;
          UB[u.id] = { box: { x: r1(x), y: r1(y), w: u.box.w, h: u.box.h }, k: 1 };
        }
      }
      const endG = endR.flat();
      const minS = kit.layout.min_text_scale;
      // collision step 3 across (before placing): a text column beside an edge region widens into the region, down to its floor
      const hGap0 = (m: number, wasEdge: boolean) => (isM ? m : wasEdge ? kit.layout.margin_side_u * fu : m);
      const colEdge = edgeRegions.find((er) => ea[er.id] && !horizSide(ea[er.id].side) && !panelIds.has(er.id));
      if (colEdge && mode === 'stack') {
        let deficit = 0, who = '';
        for (const p of placed) if (p.l.kind === 'text') {
          const gl = p.e.box.x - Am.x;
          const lg = leftEdge ? gapR * fu : Math.max(hGap0(gl, mLeftEdge), 3.5 * fu, zone.left ? zone.left + 3 * fu : 0);
          const rg = rightEdge ? gapR * fu : Math.max(3.5 * fu, zone.right ? zone.right + 3 * fu : 0);
          const d = widest(p.l as ScenarioLayer & { slot: string; style: string }) * minS - (A.w - lg - rg);
          if (d > deficit) { deficit = d; who = p.l.id; }
        }
        if (deficit > 0.5) {
          const at = ea[colEdge.id], floor = kit.layout.region_floor_u * fu, give = Math.min(deficit, Math.max(0, at.depth - floor - zone[at.side]));
          if (give > 0.5) {
            at.depth = r1(at.depth - give); at.line = at.side === 'left' ? at.depth : f.w - at.depth;
            A = freeArea(f, ea);
            note(`${sb.id} ${f.id}`, `collision step 3: ${colEdge.id} narrows ${r1(give)} px so ${who} fits at the minimum scale`);
          }
        }
      }
      // horizontal: per row — centred rows stay centred; others keep the distance to their side (the new bound's rule
      // when the bound changed kind); text, logo and marks keep 3u from a safe line (step 2: down to the safe line);
      // the max width mirrors the anchor gap; centred text keeps its master max width
      const rEdge = rightEdge || mode === 'columns';
      const safeL = Math.max(A.x, zone.left > 0 ? zone.left + 3 * fu : A.x), safeR = Math.min(A.x + A.w, zone.right > 0 ? f.w - zone.right - 3 * fu : A.x + A.w);
      const hardR = Math.min(A.x + A.w, f.w - zone.right);
      const hGap = (m: number, isEdge: boolean, wasEdge: boolean) => (isM ? m : isEdge ? (wasEdge ? m : gapR * fu) : wasEdge ? kit.layout.margin_side_u * fu : m);
      const byRow = new Map<number, Placed[]>();
      for (const p of placed) byRow.set(p.row, [...(byRow.get(p.row) ?? []), p]);
      for (const [ri, ps] of byRow) {
        const r = rows[ri], b = rb(r);
        const gl = b.x - Am.x, gr = Am.x + Am.w - (b.x + b.w);
        const single = ps.length === 1 ? ps[0] : null;
        const align = single?.e.text?.align ?? (Math.abs(gl - gr) < 1.5 * mu ? 'center' : gl <= gr ? 'left' : 'right');
        const centred = align === 'center';
        const L0 = A.x + hGap(gl, leftEdge, mLeftEdge), R0 = A.x + A.w - (mode === 'columns' ? 0 : hGap(gr, rightEdge, mRightEdge));
        if (single && single.l.kind === 'text') {
          const { l } = single, p = single;
          const need = widest(l as ScenarioLayer & { slot: string; style: string });
          let x: number, w: number;
          const fits = () => need * minS <= w + 0.5;
          if (centred) {
            const mW = Am.w - 2 * Math.max(0, Math.min(gl, gr) >= kit.layout.margin_side_u * mu - mu ? kit.layout.margin_side_u * mu : Math.min(gl, gr));
            const g = Math.max(kit.layout.margin_side_u * fu, zone.left || zone.right ? Math.max(zone.left, zone.right) + 3 * fu : 0);
            const lo = A.x + (leftEdge ? gapR * fu : g), hi = A.x + A.w - (rEdge ? (mode === 'columns' ? 0 : gapR * fu) : g);
            w = Math.min(hi - lo, mW); x = lo + (hi - lo - w) / 2;
            if (!fits() && (zone.left || zone.right)) { const g2 = Math.max(zone.left, zone.right); const w2 = Math.min(A.w - 2 * g2, mW); if (w2 > w) { note(`${sb.id} ${f.id}`, `collision step 2: ${l.id}'s margin to the safe line gives way (${r1(w)} → ${r1(w2)} px)`); w = w2; x = A.x + (A.w - w) / 2; } }
          } else if (align === 'right' && mode !== 'columns') {
            let R = Math.min(safeR, R0);
            x = Math.max(safeL, A.x + (leftEdge ? gapR * fu : kit.layout.margin_side_u * fu)); w = R - x;
            if (!fits() && R < hardR) { R = Math.min(hardR, R0); note(`${sb.id} ${f.id}`, `collision step 2: ${l.id} runs to the safe line`); w = R - x; }
          } else {
            x = Math.max(safeL, mode === 'columns' ? A.x + Math.max(kit.layout.margin_side_u * fu, hGap(gl, leftEdge, mLeftEdge)) : L0);
            const rg = mode === 'columns' ? 0 : rightEdge ? gapR * fu : leftEdge ? 3.5 * fu : x - A.x;
            w = Math.min(safeR, A.x + A.w - rg) - x;
            if (!fits() && safeR < A.x + A.w - rg) { const w2 = Math.min(hardR, A.x + A.w - rg) - x; if (w2 > w) { note(`${sb.id} ${f.id}`, `collision step 2: ${l.id} runs to the safe line`); w = w2; } }
          }
          if (!fits()) ask(`${sb.id} ${f.id} ${l.id}`, `the widest line needs ${r1(need)} px; even at the minimum scale ${minS} it does not fit ${r1(w)} px (collision step 6)`);
          else if (need > w + 0.5) note(`${sb.id} ${f.id}`, `${l.id} shrinks to ${(w / need).toFixed(2)} in its widest language (collision step 6)`);
          if (keepsRelation()) rid.add(l.id);
          const endAnch = endG.some((x2) => x2.l.id === l.id) && !turned && mode === 'stack';
          P[l.id] = { box: { x: r1(x), y: r1(p.top), w: r1(w), h: r1(p.h) }, align: mode === 'columns' && align === 'right' ? 'left' : align, v_anchor: endAnch ? 'bottom' : 'top' };
          continue;
        }
        // a row of marks / logos / graphics (or a single one): snapped widths, the sketch's own gaps between them
        const ms = [...ps].sort((a, c) => a.e.box.x - c.e.box.x);
        const offs: number[] = [];
        ms.forEach((m, i) => { offs.push(i === 0 ? 0 : offs[i - 1] + ms[i - 1].e.box.w + Math.max(0, m.e.raw.x - (ms[i - 1].e.raw.x + ms[i - 1].e.raw.w))); });
        const rowW = offs[offs.length - 1] + ms[ms.length - 1].e.box.w;
        const bx = centred ? A.x + (A.w - rowW) / 2 : align === 'right' && mode !== 'columns' ? Math.min(safeR, R0) - rowW : Math.max(safeL, mode === 'columns' ? A.x + kit.layout.margin_side_u * fu : L0);
        ms.forEach((m, i) => {
          if (keepsRelation()) rid.add(m.l.id);
          P[m.l.id] = { box: { x: r1(bx + offs[i]), y: r1(m.top), w: r1(m.e.box.w), h: r1(m.h) }, ...(m.l.kind === 'mark' ? {} : { v_anchor: 'top' as const }) };
        });
      }
      // anchored units (3.5): their place from the region's corner; only the bleed side leaves the frame; the other
      // edges stay in the safe area; they yield to text by shrinking toward the bleed corner, to 85 % (collision step 5)
      const Af = freeArea(f, ea);
      const texts = Object.entries(P).filter(([id]) => layerEls.find((x) => x.l.id === id)?.l.kind === 'text').map(([, p]) => p.box);
      for (const u of units.filter((x) => x.anchored)) {
        const hs: Side = u.bleed.includes('right') ? 'right' : u.bleed.includes('left') ? 'left' : u.box.x - Am.x <= Am.x + Am.w - (u.box.x + u.box.w) ? 'left' : 'right';
        const vs: Side = u.bleed.includes('bottom') ? 'bottom' : u.bleed.includes('top') ? 'top' : u.box.y - Am.y <= Am.y + Am.h - (u.box.y + u.box.h) ? 'top' : 'bottom';
        const dx = hs === 'left' ? u.box.x - Am.x : Am.x + Am.w - (u.box.x + u.box.w), dy = vs === 'top' ? u.box.y - Am.y : Am.y + Am.h - (u.box.y + u.box.h);
        let x = hs === 'left' ? Af.x + dx : Af.x + Af.w - dx - u.box.w, y = vs === 'top' ? Af.y + dy : Af.y + Af.h - dy - u.box.h;
        if (!u.bleed.includes('left')) x = Math.max(x, zone.left); if (!u.bleed.includes('right')) x = Math.min(x, f.w - zone.right - u.box.w);
        if (!u.bleed.includes('top')) y = Math.max(y, zone.top); if (!u.bleed.includes('bottom')) y = Math.min(y, f.h - zone.bottom - u.box.h);
        const cx = hs === 'left' ? x : x + u.box.w, cy = vs === 'top' ? y : y + u.box.h;
        const at = (s: number): Box => ({ x: hs === 'left' ? cx : cx - u.box.w * s, y: vs === 'top' ? cy : cy - u.box.h * s, w: u.box.w * s, h: u.box.h * s });
        let s = 1;
        const hits = (b: Box) => texts.some((t) => ovl(b, t) > 1);
        while (hits(at(s)) && s > 0.85 + 1e-6) s = Math.max(0.85, s - 0.01);
        if (s < 1 && !hits(at(s))) note(`${sb.id} ${f.id}`, `collision step 5: ${u.id} shrinks to ${Math.round(s * 100)} % toward its ${vs}-${hs} corner (it yields to text)`);
        if (hits(at(s))) ask(`${sb.id} ${f.id}`, `${u.id} lies on text even at 85 % (collision step 5)`);
        const b = at(s);
        UB[u.id] = { box: { x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h) }, k: s };
        if (!isM) note(`${sb.id} ${f.id}`, `${u.id}: anchored to the ${vs}-${hs} corner (bleeds ${u.bleed.join(', ') || 'nowhere'})`);
      }
      // units → layers (members keep their offsets and scale inside a group's box)
      for (const u of units) {
        const ub = UB[u.id];
        if (!ub) continue;
        for (const m of u.members) {
          const k = ub.k, kx = u.members.length === 1 ? ub.box.w / m.box.w : k, ky = u.members.length === 1 ? ub.box.h / m.box.h : k;
          P[m.id] = { box: { x: r1(ub.box.x + (m.box.x - u.box.x) * kx), y: r1(ub.box.y + (m.box.y - u.box.y) * ky), w: r1(m.box.w * kx), h: r1(m.box.h * ky) }, ...(u.bleed.length ? { bleed: u.bleed } : {}) };
        }
      }
      // attached: the offset from the host's nearest corner, scaled with the host
      for (const [a, h] of hostOf) {
        const e = layerEls.find((x) => x.l.id === a)!.e, hm = layerEls.find((x) => x.l.id === h)!.e.box, hf = P[h]?.box;
        if (!hf) continue;
        const k = hf.w / hm.w;
        const cxM = e.box.x + e.box.w / 2 - hm.x < hm.w / 2 ? hm.x : hm.x + hm.w, cyM = e.box.y + e.box.h / 2 - hm.y < hm.h / 2 ? hm.y : hm.y + hm.h;
        const cxF = cxM === hm.x ? hf.x : hf.x + hf.w, cyF = cyM === hm.y ? hf.y : hf.y + hf.h;
        P[a] = { box: { x: r1(cxF + (e.box.x - cxM) * k), y: r1(cyF + (e.box.y - cyM) * k), w: r1(e.box.w * k), h: r1(e.box.h * k) } };
      }
      // resting: the share across the edge; along the edge proportional in the visible length
      for (const [a, r] of restOf) {
        const e = layerEls.find((x) => x.l.id === a)!.e, atM = edgeAt[r][master.id], atF = ea[r];
        if (!atF) continue;
        const t = horizSide(atM.side) ? (atM.line - e.box.y) / e.box.h : (atM.line - e.box.x) / e.box.w;
        const pm = mapBox(e.box, f, M);
        P[a] = { box: horizSide(atF.side) ? { x: pm.x, y: r1(atF.line - t * e.box.h), w: e.box.w, h: e.box.h } : { x: r1(atF.line - t * e.box.w), y: pm.y, w: e.box.w, h: e.box.h } };
      }
      return { per: P, notes: fNotes, asks: fAsks, ea, riders: rid, units: UB, elasticFailed };
    };

    for (const f of formats) {
      const land = f.w > f.h && M.w <= M.h, square = Math.abs(f.w - f.h) < 1 && f.id !== master.id;
      const turns = edgeRegions.length > 0 && land;
      const wantCols = !!main && land && !turns && mainShare > 0.3 && f.id !== master.id;
      let res = layoutF(f, wantCols ? 'columns' : 'stack');
      if (!wantCols && square && main && !turns && res.elasticFailed) {
        // collision step 7: the square format tries two columns, kept only if it fits better
        const alt = layoutF(f, 'columns');
        const better = alt.asks.length < res.asks.length;
        (better ? alt : res).notes.push({ where: `${sb.id} ${f.id}`, rule: `collision step 7: two columns ${better ? 'fit better — kept' : `tried (${alt.asks.length} questions vs ${res.asks.length}) — the stack is kept`}` });
        if (better) res = alt;
      }
      decisions.push(...res.notes); questions.push(...res.asks);
      for (const [id, p] of Object.entries(res.per)) if (per[id]) per[id][f.id] = p;
      for (const { l, e } of layerEls) if (!per[l.id][f.id]) { per[l.id][f.id] = { box: mapBox(e.box, f, M) }; decisions.push({ where: `${sb.id} ${f.id}`, rule: `${l.id}: no rule placed it → proportional in the visible area` }); }
      // settle: whatever the rules did, nothing that does not bleed leaves the safe area — it moves back in (and a
      // non-text element too big for it shrinks); the check would only report it, this fixes it
      {
        const z = f.safe, L0 = z.left, T0 = z.top, R0 = f.w - z.right, B0 = f.h - z.bottom;
        for (const { l } of layerEls) {
          const p = per[l.id][f.id];
          if (!p || p.bleed?.length) continue;
          const b = { ...p.box };
          if (l.kind !== 'text' && (b.w > R0 - L0 || b.h > B0 - T0)) { const k = Math.min((R0 - L0) / b.w, (B0 - T0) / b.h); b.x += (b.w - b.w * k) / 2; b.y += (b.h - b.h * k) / 2; b.w *= k; b.h *= k; }
          const nx = Math.min(Math.max(b.x, L0), Math.max(L0, R0 - b.w)), ny = Math.min(Math.max(b.y, T0), Math.max(T0, B0 - b.h));
          if (Math.abs(nx - p.box.x) > 0.5 || Math.abs(ny - p.box.y) > 0.5 || Math.abs(b.w - p.box.w) > 0.5) {
            decisions.push({ where: `${sb.id} ${f.id}`, rule: `${l.id}: left the safe area at ${r1(p.box.x)},${r1(p.box.y)} → moved in to ${r1(nx)},${r1(ny)}${b.w !== p.box.w ? ` at ${Math.round((b.w / p.box.w) * 100)} %` : ''}` });
            p.box = { x: r1(nx), y: r1(ny), w: r1(b.w), h: r1(b.h) };
          }
        }
      }
      for (const [rid2, at] of Object.entries(res.ea)) {
        const old = edgeAt[rid2][f.id];
        if (old && (old.depth !== at.depth || old.line !== at.line)) { edgeAt[rid2][f.id] = at; ((regionsOut.find((x) => x.id === rid2)!.area as Extract<Area, { kind: 'edge' }>).per[f.id]).depth = at.depth; }
      }
      riders[f.id] = res.riders;
      for (const [uid, ub] of Object.entries(res.units)) (unitBox[uid] ??= {})[f.id] = ub;
    }
    // shape regions behind a unit follow it (offset from its centre and size, scaled with it); others stay proportional
    for (const reg of regionsOut.filter((r) => r.area.kind === 'shape')) {
      const fmr = byLegend.get(reg.id) as FMRegion | undefined;
      if (!fmr) continue;
      const host = units.map((u) => ({ u, o: ovl(fmr.box, u.box) })).filter((x) => x.o >= 0.5 * area(fmr.box) || x.o >= 0.5 * area(x.u.box)).sort((a, b) => b.o - a.o)[0]?.u;
      if (!host) continue;
      const pf = (reg.area as Extract<Area, { kind: 'shape' }>).per;
      for (const f of formats) {
        const ub = unitBox[host.id]?.[f.id];
        if (!ub) continue;
        const k = Math.min(ub.box.w / host.box.w, ub.box.h / host.box.h);
        const ocx = fmr.box.x + fmr.box.w / 2 - (host.box.x + host.box.w / 2), ocy = fmr.box.y + fmr.box.h / 2 - (host.box.y + host.box.h / 2);
        const w = fmr.box.w * k, h = fmr.box.h * k;
        pf[f.id] = { ...pf[f.id], box: { x: r1(ub.box.x + ub.box.w / 2 + ocx * k - w / 2), y: r1(ub.box.y + ub.box.h / 2 + ocy * k - h / 2), w: r1(w), h: r1(h) } };
      }
      note(`${sb.id}.${reg.id}`, `shape region behind ${host.id}: follows it (offset from its centre, scaled with it)`);
    }

    // a text's colour: the scenario's, unless it does not read on the paint the sketch shows behind the text and
    // the sketch's own glyph colour does (the sketch is what the ad looks like; a dark headline on a dark field is
    // a scenario slip, not a design)
    const hexOf = (c: string | null | undefined) => (c && kit.colors[c] ? kit.colors[c].hex : c && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
    const textColour = (want: string | null | undefined, e: FMElement, where: string): string => {
      const seen = e.text?.color ?? null;
      const cx = e.box.x + e.box.w / 2, cy = e.box.y + e.box.h / 2;
      const bg = [...fm.regions].sort((a, b) => b.z - a.z).find((r) => r.paint !== 'content' && cx >= r.box.x && cx < r.box.x + r.box.w && cy >= r.box.y && cy < r.box.y + r.box.h);
      const bh = hexOf(bg?.paint), wh = hexOf(want), sh = hexOf(seen);
      if (bh && wh && sh && want !== seen && contrastRatio(wh, bh) < 3 && contrastRatio(sh, bh) >= 3) {
        note(where, `colour ${want} does not read on ${bg!.paint} (contrast ${contrastRatio(wh, bh).toFixed(1)}); the sketch's ${seen} is used (${contrastRatio(sh, bh).toFixed(1)})`);
        return colorOf(seen, where);
      }
      return colorOf(want ?? seen, where);
    };

    // layers out, in scenario order
    for (const { l, e } of layerEls) {
      const base = { id: l.id, route: l.route, group: l.group, behaviour: beh.get(l.id) as Layer['behaviour'], ...(hostOf.has(l.id) ? { host: hostOf.get(l.id) } : {}), ...(restOf.has(l.id) ? { rests_on: restOf.get(l.id) } : {}), per: per[l.id] };
      if (l.kind === 'text') layersOut.push({ ...base, kind: 'text', slot: l.slot!, style: l.style!, color: textColour(l.color, e, `${sb.id}.${l.id}`), ...(l.treatment ? { treatment: l.treatment } : {}), ...(l.fill ? { fill: l.fill } : {}) } as TextLayer);
      else if (l.kind === 'logo') {
        const picked=selectedLogos.get(l);
        if (picked) layersOut.push({...base,kind:'logo',logo:picked.logo,color:picked.color ?? kit.logo_rules.colors[0] ?? '#000000'});
        else layersOut.push({ ...base, kind: 'logo', logo: l.logo ?? kit.logo_rules.default, color: l.color ?? e.color ?? kit.logo_rules.colors[0] });
      }
      else if (l.kind === 'mark') layersOut.push({ ...base, kind: 'mark', mark: l.mark ?? e.mark ?? '', ...(l.fill ? { fill: l.fill } : {}) });
      else if (l.kind === 'media') layersOut.push({ ...base, kind: 'media', part: l.asset ?? sb.items?.list[0]?.part ?? '', ...(l.shape ? { shape: l.shape } : {}), ...(l.item_bound || sb.items?.layer === l.id ? { item_bound: true } : {}) });
      else if (l.kind === 'object') layersOut.push({ ...base, kind: 'object', part: l.asset ?? sb.items?.list[0]?.part ?? '', shadow: l.shadow, ...(l.item_bound || sb.items?.layer === l.id ? { item_bound: true } : {}) });
      else if (l.kind === 'graphic' && l.graphic) layersOut.push({ ...base, kind: 'graphic', graphic: l.graphic });
      else if (l.kind === 'ui') { const uis = Object.keys(sc.assets).filter((k) => sc.assets[k].ui); const u = [l.ui, l.asset].find((x) => x && sc.assets[x]?.ui) ?? (uis.length === 1 ? uis[0] : ''); if (!u) ask(`${sb.id}.${l.id}`, `the UI layer names no UI element (${uis.join(', ') || 'none in the brief'})`); layersOut.push({ ...base, kind: 'ui', ui: u }); }
    }
    // stand-ins: the sketch area of every media paint / window
    for (const l of sb.layers) {
      const media = typeof l.paint === 'object' && l.paint && 'kind' in l.paint && l.paint.kind === 'media' ? l.paint : null;
      const ids = [...new Set([l.asset, media?.part, ...Object.values(media?.part_by_hook ?? {})].filter((x): x is string => !!x))];
      const el = byLegend.get(l.id);
      const sketch = inp.sketchFile ? inp.sketchFile(sb.id) : fm.sketch;
      // a frame model from a layout has no sketch: the stand-in stays procedural (draft mockups replace it with a schematic)
      if (sketch) for (const id of ids) if (parts[id] && el && parts[id].standin.kind === 'procedural') {
        const b = el.box, s = Math.max(b.w, b.h);
        let cx = b.x + b.w / 2 - s / 2, cy = b.y + b.h / 2 - s / 2;
        cx = Math.min(Math.max(cx, 0), Math.max(0, M.w - s)); cy = Math.min(Math.max(cy, 0), Math.max(0, M.h - s));
        parts[id].standin = { kind: 'sketch_area', file: sketch, crop: { x: r1(cx), y: r1(cy), w: r1(s), h: r1(s) } };
        note(id, `stand-in: the ${sb.id} sketch area of ${l.id} (a ${Math.round(s)} px square)`);
      }
    }

    // cues: edge rides only where the rider is anchored to the edge in that format; riders appear one frame after the swap
    const cues: Cue[] = [];
    const frame = 1 / platforms.render.fps;
    for (const c of sb.motion.cues) {
      if (c.type !== 'edge' || !c.ride?.length) { cues.push(c); continue; }
      const byFmt = new Map<string, string[]>();
      for (const f of formats) { const rs = c.ride.filter((r) => riders[f.id].has(r)); const k = rs.join('|'); byFmt.set(k, [...(byFmt.get(k) ?? []), f.id]); }
      for (const [k, fs] of byFmt) {
        const rs = k ? k.split('|') : [];
        const cc: Cue = { ...c, ...(rs.length ? { ride: rs } : {}), formats: fs };
        if (!rs.length) delete (cc as { ride?: string[] }).ride;
        if (byFmt.size === 1) delete cc.formats;
        cues.push(cc);
        if (rs.length && c.from === 'out') for (const r of rs) cues.push({ type: 'fade', target: r, t: c.t, dur: frame, curve: 'linear', ...(byFmt.size > 1 ? { formats: fs } : {}) });
      }
      const dropped = c.ride.filter((r) => !formats.some((f) => riders[f.id].has(r)));
      if (dropped.length) note(sb.id, `${dropped.join(', ')} ride the ${c.region} edge nowhere (not anchored to it in any format)`);
      if (byFmt.size > 1) note(sb.id, `the ${c.region} edge carries riders in ${[...byFmt.entries()].filter(([k]) => k).map(([, v]) => v.join(', ')).join(' / ')} only — where the text is anchored to it; riders appear one frame after the swap`);
    }
    return { id: sb.id, role: sb.role, sketch: sb.sketch, regions: regionsOut, layers: layersOut, groups: Object.entries(sb.groups ?? {}).map(([id, members]) => ({ id, members, per: groupPer(members, per) })), cues, motion_plain: sb.motion.plain, ...(sb.motion.never ? { never: sb.motion.never } : {}), ...(sb.items ? { items: sb.items } : {}) };
  }

  function groupPer(members: string[], per: Record<string, Record<string, { box: Box }>>) {
    const out: Record<string, { box: Box }> = {};
    for (const f of formats) {
      const bs = members.map((m) => per[m]?.[f.id]?.box).filter((b): b is Box => !!b);
      if (!bs.length) continue;
      const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
      out[f.id] = { box: { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 } };
    }
    return out;
  }
  function mapBox(b: Box, f: Format, M: { w: number; h: number }): Box {
    const Vm = { x: master.safe.left, y: master.safe.top, w: M.w - master.safe.left - master.safe.right, h: M.h - master.safe.top - master.safe.bottom };
    const V = { x: f.safe.left, y: f.safe.top, w: f.w - f.safe.left - f.safe.right, h: f.h - f.safe.top - f.safe.bottom };
    const k = Math.min(1, V.w / b.w, V.h / b.h);
    const cx = V.x + ((b.x + b.w / 2 - Vm.x) / Vm.w) * V.w, cy = V.y + ((b.y + b.h / 2 - Vm.y) / Vm.h) * V.h;
    return { x: r1(cx - (b.w * k) / 2), y: r1(cy - (b.h * k) / 2), w: r1(b.w * k), h: r1(b.h * k) };
  }
  function logoH(l: ScenarioLayer, e: FMElement): number {
    const logo = kit.logos[selectedLogos.get(l)?.logo ?? l.logo ?? kit.logo_rules.default];
    if (logo?.mode === 'as_drawn' && logo.view_box) return r1(e.box.w * logo.view_box[1] / logo.view_box[0]);
    const svg = logo?.svg;
    const vb = svg ? /viewBox\s*=\s*"([^"]+)"/.exec(svg)?.[1].split(/[\s,]+/).map(Number) : null;
    return vb && vb[2] > 0 ? r1(e.box.w * (vb[3] / vb[2])) : e.box.h;
  }
  function linesOf(slot: string): string[][] {
    const v = sc.copy[slot] ?? {};
    return Object.values(v).flatMap((byLang) => Object.values(byLang));
  }
  function heightOf(l: ScenarioLayer, e: FMElement): number {
    if (l.kind === 'logo') return logoH(l, e);
    if (l.kind === 'mark') return e.box.h;
    if (l.kind !== 'text' || !l.style) return e.box.h;
    const st = kit.styles[l.style];
    const n = Math.max(1, ...linesOf(l.slot!).map((x) => x.length));
    const tr = kit.treatments[l.treatment ?? st.treatment];
    const pad = tr && (tr.kind === 'box' || tr.kind === 'button') ? (tr.pad[0] + tr.pad[2]) * st.size : 0;
    return (st.line_box ?? st.pitch) * st.size + (n - 1) * st.pitch * st.size + pad;
  }
  function widest(l: { slot: string; style: string }): number {
    const st = kit.styles[l.style];
    if (!st || !engine.has(st.font)) return 0;
    let w = 0;
    const tr = kit.treatments[st.treatment];
    const pad = tr && 'pad' in tr && tr.pad.length === 4 ? ((tr.pad[1] ?? 0) + (tr.pad[3] ?? 0)) * st.size : 0;
    for (const lines of linesOf(l.slot)) for (const line of lines) {
      const t = st.case === 'upper' ? stripEmphasis(line).toUpperCase() : stripEmphasis(line);
      w = Math.max(w, engine.width(st.font, st.weight, t, st.size) + st.tracking * st.size * t.length + pad);
    }
    return w;
  }

  // ---------------------------------------------------------------- timings
  const lengths: EngineConfig['lengths'] = {};
  for (const L of sc.variant_sets.lengths) {
    lengths[L] = sc.beats.filter((b) => b.durations[L] !== undefined).map((b) => ({ beat: b.id, dur: b.durations[L] }));
    const sum = lengths[L].reduce((a, b) => a + b.dur, 0);
    // A length can identify a particular binding at the same duration (e.g. 15~1).
    const expected = Number(L.split('~')[0]);
    if (Math.abs(sum - expected) > 1e-6) ask(`${L} s`, `beats add up to ${sum} s`);
  }
  // loops (items, sequences, float, rock) fill whole periods where they must close (7.6)
  for (const b of beats) for (const q of b.cues) {
    const period = q.type === 'items' || q.type === 'float' || q.type === 'rock' ? q.period : q.type === 'sequence' && q.loop ? null : null;
    if (!period) continue;
    const t0 = 't' in q && typeof q.t === 'number' ? q.t : 0;
    for (const L of sc.variant_sets.lengths) {
      const d = lengths[L].find((x) => x.beat === b.id)?.dur;
      if (d === undefined) continue;
      const k = (d - t0) / period, frac = k - Math.floor(k);
      if (frac > 0.05 && frac < 0.95) (q.type === 'items' ? ask : note)(`${L}s ${b.id}`, `${q.type} (period ${period} s) ends at ${(frac * 100).toFixed(0)} % of a period — ${q.type === 'items' ? `the last item shows ${(frac * period).toFixed(2)} s; a period of ${((d - t0) / Math.max(1, Math.round(k))).toFixed(2)} s would close` : 'the loop does not close (a cut at the beat end)'}`);
    }
  }
  const src = sc.variant_sets.languages[0];
  for (const b of beats) {
    const texts = b.layers.filter((l): l is TextLayer => l.kind === 'text');
    for (const lang of sc.variant_sets.languages) {
      let words = 0;
      for (const t of texts) { const v = sc.copy[t.slot] ?? {}; words += Math.max(0, ...Object.values(v).map((x) => readingWordCount(x[lang] ?? []))); }
      const need = kit.reading.per_word_s * words + kit.reading.base_s;
      for (const L of sc.variant_sets.lengths) {
        const d = lengths[L].find((x) => x.beat === b.id)?.dur;
        if (d !== undefined && d + 1e-9 < need) (lang === src ? ask : note)(`${L}s ${b.id} ${lang}`, `reading time ${need.toFixed(2)} s (${words} words) > beat ${d} s${lang === src ? '' : ' (checked, not the source language)'}`);
      }
    }
  }

  // ---------------------------------------------------------------- config
  const config: EngineConfig = {
    schema: 'ad/engine-config@1',
    meta: { scenario_id: sc.scenario_id, brand: sc.brand, title: sc.title, version: sc.naming.version, kit_version: inp.kitVersion ?? kit.version, platforms_version: platforms.version, made_by: 'planner' },
    render: { ...platforms.render }, naming: sc.naming, master_format: master.id, formats, variant_sets: sc.variant_sets, kit,
    copy: sc.copy, slot_axis: sc.slot_axis ?? {}, ui_strings: sc.ui_strings ?? {},
    ui: Object.fromEntries(Object.entries(sc.assets).filter(([, a]) => a.ui).map(([id, a]) => [id, a.ui!])),
    ...(sc.data ? { data: sc.data } : {}),
    ...(sc.graphics ? { graphics: sc.graphics } : {}),
    parts, lengths, beats,
  };
  // ---------------------------------------------------------------- self-check
  let check: CheckResult | null = null;
  const codes: Record<string, number> = {};
  if (inp.check !== false) {
    check = checkAll({ cfg: config, engine });
    for (const f of check.findings) {
      codes[f.code] = (codes[f.code] ?? 0) + 1;
      if (f.severity === 'block') ask(`${f.beat ?? ''} ${f.format} ${f.element ?? ''}`.trim(), `${f.code}: ${f.message} (${f.variants.length} variants)`);
    }
  }
  void parseSvg;
  // ---------------------------------------------------------------- parts list (one job per generated part)
  const used = (pid: string) => beats.filter((b) => (b.items?.list ?? []).some((it) => it.part === pid) || b.layers.some((l) => 'part' in l && (l.part === pid || Object.values((l as { part_by_hook?: Record<string, string> }).part_by_hook ?? {}).includes(pid))) || b.regions.some((r) => typeof r.paint === 'object' && r.paint.kind === 'media' && (r.paint.part === pid || Object.values(r.paint.part_by_hook ?? {}).includes(pid))));
  const jobs: PartJob[] = Object.values(parts).map((p) => {
    const a = sc.assets[p.id];
    const bs = used(p.id);
    const hooks = Object.keys(sc.copy).length ? sc.beats.flatMap((b) => b.layers.flatMap((l) => { const m = typeof l.paint === 'object' && l.paint && 'kind' in l.paint && l.paint.kind === 'media' ? l.paint : null; return Object.entries(m?.part_by_hook ?? {}).filter(([, v]) => v === p.id).map(([h]) => h); })) : [];
    let need = 0;
    for (const L of sc.variant_sets.lengths) for (const x of lengths[L]) if (bs.some((b) => b.id === x.beat)) need = Math.max(need, x.dur);
    const spec: Record<string, unknown> = { ...(a?.still ? { still: a.still } : {}), ...(a?.live_video ? { live_video: a.live_video } : {}), ...(a?.stop_motion ? { stop_motion: a.stop_motion } : {}), ...(a?.texture ? { texture: a.texture } : {}), ...(a?.file ? { file: a.file } : {}), ...(a?.graphic_3d ? { graphic_3d: a.graphic_3d } : {}), ...(a?.model_3d ? { model_3d: a.model_3d } : {}) };
    return { id: p.id, route: p.route, media: p.media, side: p.side ?? null, what: a?.what ?? p.what ?? p.id, key_part: a?.key_part ?? null, key_part_box: p.key_part_box ?? null, must_not: a?.must_not ?? [], cutout: !!p.cutout, standin: p.standin.kind, beats: bs.map((b) => b.id), formats: formats.map((f) => f.id), by_hook: [...new Set(hooks)], seconds_needed: Math.round(need * 100) / 100, spec };
  });
  const checks = (check?.findings ?? []).map((f) => ({ code: f.code, where: `${f.beat ?? ''} ${f.format} ${f.element ?? ''}`.trim(), finding: f.message, severity: f.severity, variants: f.variants.length }));
  const clean = JSON.parse(JSON.stringify(config)) as EngineConfig;
  const seen = new Set<string>();
  const qs = questions.filter((q) => { const k = q.where.replace(/^\S+ sketch$/, 'sketch') + '|' + q.rule; if (seen.has(k)) return false; seen.add(k); return true; });
  return { config: clean, report: { decisions, questions: qs, findings: { blocking: check?.blocking ?? 0, warnings: check ? check.findings.filter((f) => f.severity === 'warn').length : 0, codes }, behaviours, parts: jobs, checks }, check };
}
