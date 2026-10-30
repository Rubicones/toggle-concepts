import {cameraBox} from '../../creative/motion-recipes';
/**
 * One frame of one variant → the display list and the element records (3, 10).
 * Drawing order: regions back to front (area, paint, edge mark) → layers back to front, each with its
 * group's transform, its host's (attached), the edge it rides (resting / ride lists) and its own cues.
 * Pure: the canvas renderer, the frame checks, the planner's self-check and the render all use it.
 */
import type { GlyphEngine as TextEngine } from '../text-snapshot';
import type { Beat, Box, EngineConfig, Format, Group, Layer, MediaLayer, PaintDef, PaintRef, Part, Region, Side, VariantState } from '../types';
import { ROUTES_3D } from '../types';
import type { ElRec, Fill, Op, PathSpec } from './ops';
import { evaluate, MOVING, type MotionState, type TargetState } from './motion';
import { layoutText, wordCount } from './text';
import { cropRule, fitWhole, keyPartPx } from './crop';
import { drawUi, chartOps,type UiDraw } from './ui';
import { parseSvg, rectD, ellipseD } from './svg';
import { aroundPivot, fmtOf, hexOf, ease, curveOf, IDENT, mul, translate, unitOf, xfBox, type Mat } from './util';

export interface Span { beat: string; index: number; start: number; end: number; dur: number }
export interface Frame { transition?:{type:string;progress:number;outgoing:string;incoming:string};ops: Op[]; els: ElRec[]; beat: Beat; span: Span; tl: Span[]; fmt: Format; t: number; motion: MotionState; st: VariantState }
export interface EngineCtx { cfg: EngineConfig; engine: TextEngine }

export function timeline(cfg: EngineConfig, len: string): Span[] {
  const L = cfg.lengths[len];
  if (!L) throw new Error(`no length "${len}"`);
  let t = 0;
  return L.map((b, index) => { const s = { beat: b.beat, index, start: t, end: t + b.dur, dur: b.dur }; t += b.dur; return s; });
}
export const totalOf = (tl: Span[]) => tl[tl.length - 1].end;
export function spanAt(tl: Span[], t: number): Span {
  let i = 0;
  while (i < tl.length - 1 && t >= tl[i].end - 1e-9) i++;
  return tl[i];
}
export function beatOf(cfg: EngineConfig, id: string): Beat {
  const b = cfg.beats.find((x) => x.id === id);
  if (!b) throw new Error(`no beat "${id}"`);
  return b;
}

/** The lines a slot shows for a variant (hook / CTA / item index), in the state's language. */
export function copyLines(cfg: EngineConfig, slot: string, st: VariantState, item?: number): string[] {
  const s = cfg.copy[slot];
  if (!s) throw new Error(`no copy for slot "${slot}"`);
  const axis = cfg.slot_axis[slot] ?? null;
  const v = axis === 'hook' ? st.hook : axis === 'cta' ? st.cta : axis === 'items' ? String(item ?? 0) : '*';
  // hook × items: a hook whose copy changes with the item is written per item (“H1.0”, “H1.1”, …)
  const byLang = s[v] ?? (item !== undefined ? s[`${v}.${item}`] : undefined) ?? s[`${v}.0`] ?? s['*'];
  if (!byLang) throw new Error(`slot "${slot}" has no variant "${v}"`);
  const lines = byLang[st.lang];
  if (!lines) throw new Error(`slot "${slot}" (${v}) has no ${st.lang}`);
  return lines;
}

export function resolvePaint(cfg: EngineConfig, p: PaintRef): PaintDef | { kind: 'media'; part: string; part_by_hook?: Record<string, string> } {
  if (typeof p === 'string') return cfg.kit.paints[p] ?? { kind: 'flat', color: p };
  return p;
}

/** A region's area at an edge depth (the rest depth unless an edge cue moves it). */
export function areaPath(r: Region, fmt: Format, depth: number | null): { path: PathSpec; box: Box; side?: Side; line?: number } {
  const W = fmt.w, H = fmt.h, a = r.area;
  if (a.kind === 'full') return { path: { k: 'rect', x: 0, y: 0, w: W, h: H }, box: { x: 0, y: 0, w: W, h: H } };
  if (a.kind === 'edge') {
    const e = a.per[fmt.id];
    if (!e) return { path: { k: 'rect', x: 0, y: 0, w: 0, h: 0 }, box: { x: 0, y: 0, w: 0, h: 0 } };
    const d = Math.max(0, depth ?? e.depth);
    const box = e.side === 'bottom' ? { x: 0, y: H - d, w: W, h: d } : e.side === 'top' ? { x: 0, y: 0, w: W, h: d } : e.side === 'left' ? { x: 0, y: 0, w: d, h: H } : { x: W - d, y: 0, w: d, h: H };
    const line = e.side === 'bottom' ? H - d : e.side === 'top' ? d : e.side === 'left' ? d : W - d;
    const sh = e.shape;
    if (!sh || sh.kind === 'straight' || d <= 0) return { path: { k: 'rect', ...box }, box, side: e.side, line };
    // a shaped edge: the line bows (curve) or waves; the region keeps its side
    const horiz = e.side === 'top' || e.side === 'bottom', len = horiz ? W : H, n = 48;
    const off = (s: number) => (sh.kind === 'curve' ? sh.amp * Math.sin(Math.PI * s) : sh.amp * Math.sin(2 * Math.PI * sh.count * s));
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) { const s = i / n, o = off(s); pts.push(horiz ? `${(s * len).toFixed(1)} ${(line - (e.side === 'bottom' ? o : -o)).toFixed(1)}` : `${(line - (e.side === 'right' ? o : -o)).toFixed(1)} ${(s * len).toFixed(1)}`); }
    const d2 = e.side === 'bottom' ? `M0 ${H}L${pts.join('L')}L${W} ${H}Z` : e.side === 'top' ? `M0 0L${pts.join('L')}L${W} 0Z` : e.side === 'left' ? `M0 0L${pts.join('L')}L0 ${H}Z` : `M${W} 0L${pts.join('L')}L${W} ${H}Z`;
    return { path: { k: 'd', d: d2 }, box, side: e.side, line };
  }
  const s = a.per[fmt.id];
  if (!s) return { path: { k: 'rect', x: 0, y: 0, w: 0, h: 0 }, box: { x: 0, y: 0, w: 0, h: 0 } };
  const b = s.box;
  if (s.shape === 'circle') return { path: { k: 'ellipse', cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 }, box: b };
  if (s.shape === 'arch') return { path: { k: 'd', d: rectD(b.x, b.y, b.w, b.h, [b.w / 2, b.w / 2, 0, 0]) }, box: b };
  if (s.shape === 'path' && s.d) return { path: { k: 'd', d: s.d }, box: b };
  return { path: { k: 'rect', ...b, r: s.shape === 'round' ? s.radius ?? 0 : 0 }, box: b };
}

function windowPath(l: MediaLayer, b: Box): PathSpec {
  if (l.shape === 'circle') return { k: 'ellipse', cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 };
  if (l.shape === 'arch') return { k: 'd', d: rectD(b.x, b.y, b.w, b.h, [b.w / 2, b.w / 2, 0, 0]) };
  if (l.shape === 'round') return { k: 'rect', ...b, r: l.radius ?? 0 };
  return { k: 'rect', ...b };
}

function buildBeatFrame(ctx: EngineCtx, st: VariantState, t: number, forced?:Span,filter?:{skip?:Set<string>;only?:Set<string>;boxes?:Map<string,Box>;regionDepths?:Map<string,number>}): Frame {
  const { cfg, engine } = ctx;
  const kit = cfg.kit;
  const fmt = fmtOf(cfg, st.fmt);
  const u = unitOf(fmt);
  const tl = timeline(cfg, st.len);
  const span = forced??spanAt(tl, t);
  const sourceBeat = beatOf(cfg, span.beat);
  const beat = { ...sourceBeat, layers: sourceBeat.layers.map((l) => {
    const p = l.per[fmt.id]; const override=filter?.boxes?.get(l.id);return { ...l,...(override?{per:{...l.per,[fmt.id]:{...p,box:override}}}:{}), ...(p?.color && l.kind === 'text' ? { color: p.color } : {}), ...(p?.behaviour ? { behaviour: p.behaviour } : {}) } as Layer;
  }).sort((a, b) => (a.per[fmt.id]?.z ?? sourceBeat.layers.findIndex((l) => l.id === a.id)) - (b.per[fmt.id]?.z ?? sourceBeat.layers.findIndex((l) => l.id === b.id))) };
  const safe = { x: fmt.safe.left, y: fmt.safe.top, w: fmt.w - fmt.safe.left - fmt.safe.right, h: fmt.h - fmt.safe.top - fmt.safe.bottom };
  const layers = new Map(beat.layers.map((l) => [l.id, l]));
  const groups = new Map(beat.groups.map((g) => [g.id, g]));
  const place = (l: Layer) => l.per[fmt.id];
  const itemsCount = beat.items?.list.length ?? 0;
  let M: MotionState | null = null;
  M = evaluate({
    kit, beat, fmt: fmt.id, start: span.start, end: span.end, t, u, frame: { w: fmt.w, h: fmt.h }, safe,
    restBox: (id) => { const l = layers.get(id); if (l) return place(l)?.box ?? null; const g = groups.get(id); return g?.per[fmt.id]?.box ?? null; },
    wordsOf: (id) => { const l = layers.get(id); return l && l.kind === 'text' ? wordCount(copyLines(cfg, l.slot, st, 0)) : 0; },
    linesOf: (id) => { const l = layers.get(id); if (!l || l.kind !== 'text') return 1; const n = copyLines(cfg, l.slot, st, 0).length; return place(l)?.join_lines ? 1 : n; },
    edgeRest: (rid) => { const r = beat.regions.find((x) => x.id === rid); if (!r || r.area.kind !== 'edge') return null; const e = r.area.per[fmt.id]; if (!e) return null; return { depth: e.depth, full: e.side === 'top' || e.side === 'bottom' ? fmt.h : fmt.w }; },
    itemCount: itemsCount,
    partFrames: (id) => { const l = layers.get(id); const p = l && 'part' in l ? cfg.parts[(l as MediaLayer).part] : null; return p?.files?.length ?? 1; },
  });
  const motion = M;
  const ops: Op[] = [];
  const els: ElRec[] = [];
  const stateOf = (id: string): TargetState | undefined => motion.layer.get(id) ?? motion.group.get(id);

  // ------------------------------------------------------------------ transforms
  const ownMat = (id: string, box: Box | null): { m: Mat; a: number } => {
    const s = stateOf(id);
    if (!s) return { m: IDENT, a: 1 };
    const tx = s.tx;
    let m: Mat = translate(tx.dx, tx.dy);
    if (box && (tx.scale !== 1 || tx.rot !== 0)) {
      const px = box.x + box.w / 2, py = tx.pivot === 'bottom' ? box.y + box.h : box.y + box.h / 2;
      m = mul(m, aroundPivot(px, py, tx.scale, tx.rot));
    }
    return { m, a: tx.opacity };
  };
  const rideMat = (id: string): Mat => {
    const r = stateOf(id)?.ride;
    if (!r) return IDENT;
    const reg = beat.regions.find((x) => x.id === r.region);
    const side = reg && reg.area.kind === 'edge' ? reg.area.per[fmt.id]?.side : undefined;
    if (!side) return IDENT;
    return side === 'bottom' ? translate(0, -r.delta) : side === 'top' ? translate(0, r.delta) : side === 'left' ? translate(r.delta, 0) : translate(-r.delta, 0);
  };
  const groupChain = (gid: string | undefined, depth = 0): { m: Mat; a: number } => {
    if (!gid || depth > 8) return { m: IDENT, a: 1 };
    const g: Group | undefined = groups.get(gid);
    if (!g) return { m: IDENT, a: 1 };
    const parent = groupChain(g.parent, depth + 1);
    const own = ownMat(g.id, g.per[fmt.id]?.box ?? null);
    return { m: mul(parent.m, own.m), a: parent.a * own.a };
  };
  const full = (l: Layer, depth = 0): { m: Mat; a: number } => {
    const g = groupChain(l.group);
    const host = l.host && layers.get(l.host) && depth < 8 ? full(layers.get(l.host)!, depth + 1) : { m: IDENT, a: 1 };
    const own = ownMat(l.id, place(l)?.box ?? null);
    return { m: mul(mul(mul(g.m, host.m), rideMat(l.id)), own.m), a: g.a * host.a * own.a };
  };
  const moving = (ids: string[]) => motion.windows.some((w) => ids.includes(w.target) && MOVING.includes(w.type) && t >= w.from - 1e-6 && t < w.to + 1e-6);
  const settleIds = (l: Layer): string[] => {
    const ids = [l.id];
    let g = l.group ? groups.get(l.group) : undefined, d = 0;
    while (g && d++ < 8) { ids.push(g.id); g = g.parent ? groups.get(g.parent) : undefined; }
    if (l.host) ids.push(l.host);
    if (l.rests_on) ids.push(l.rests_on);
    const r = stateOf(l.id)?.ride; if (r) ids.push(r.region);
    return ids;
  };

  // ------------------------------------------------------------------ regions
  (filter?.only?[]:beat.regions).forEach((r, zi) => {
    const depth = filter?.regionDepths?.get(r.id)??motion.edge.get(r.id) ?? null;
    const cur = areaPath(r, fmt, depth);
    const rest = areaPath(r, fmt, null);
    const rm = ownMat(r.id, rest.box);
    const paint = resolvePaint(cfg, r.paint);
    let paintKind: NonNullable<ElRec['region']>['paint'] = 'flat', flatColor: string | undefined;
    ops.push({ op: 'push', m: rm.m, alpha: rm.a });
    const texPart = paint.kind === 'media' ? cfg.parts[paint.part_by_hook?.[st.hook] ?? paint.part] : undefined;
    if (paint.kind === 'media' && texPart?.media === 'tiles') {
      // generated texture tiles (route texture): tiled over the area, changing by `boil`
      ops.push({ op: 'fill', el: r.id, path: cur.path, fill: { t: 'texture', part: texPart.id, frame: motion.boil.get(r.id) ?? 0, color: '#808080', tile: (texPart.side ?? 512) / 2, standin: texPart.status !== 'approved' } });
      els.push({ id: r.id, kind: 'region', beat: beat.id, z: zi - 1000, box: cur.box, ink: null, bleed: ['top', 'right', 'bottom', 'left'], opacity: rm.a, settled: !moving([r.id]), region: { kind: r.area.kind, side: rest.side, line: rest.line, box: rest.box, paint: 'texture' }, standin: texPart.status !== 'approved' });
    } else if (paint.kind === 'media') {
      paintKind = 'media';
      const partId = paint.part_by_hook?.[st.hook] ?? paint.part;
      const P = cfg.parts[partId];
      ops.push({ op: 'push', m: IDENT, alpha: 1, clip: cur.path });
      const med = mediaOp(r.id, P, rest.box, safe, t - span.start, motion.clipTime.get(r.id), motion.seq.get(r.id) ?? 0);
      ops.push(med.op);
      ops.push({ op: 'pop' });
      els.push({ id: r.id, kind: 'region', beat: beat.id, z: zi - 1000, box: cur.box, ink: null, bleed: ['top', 'right', 'bottom', 'left'], opacity: rm.a, settled: !moving([r.id]), media: med.rec, region: { kind: r.area.kind, side: rest.side, line: rest.line, box: rest.box, paint: 'media' }, standin: med.rec.standin });
    } else {
      const fill = paintFill(paint, rest.box, r.id, motion.boil.get(r.id) ?? 0);
      if (paint.kind === 'flat') flatColor = hexOf(kit, paint.color);
      paintKind = paint.kind;
      ops.push({ op: 'fill', el: r.id, path: cur.path, fill });
      els.push({ id: r.id, kind: 'region', beat: beat.id, z: zi - 1000, box: cur.box, ink: null, bleed: ['top', 'right', 'bottom', 'left'], opacity: rm.a, settled: !moving([r.id]), region: { kind: r.area.kind, side: rest.side, line: rest.line, box: rest.box, paint: paintKind, color: flatColor ?? (paint.kind === 'gradient' ? hexOf(kit, paint.stops[0].color) : paint.kind === 'pattern' ? hexOf(kit, paint.bg) : paint.kind === 'texture' ? hexOf(kit, paint.color) : undefined) } });
    }
    // edge mark (a tongue protruding from the edge into the region)
    const em = r.edge_mark, ep = em?.per[fmt.id];
    if (em && ep && cur.side && cur.line !== undefined && (motion.markVisible.get(r.id) ?? true) && (depth ?? 1) > 0) {
      const rad = ep.radius ?? (kit.marks[em.mark]?.radius_u ?? 0) * u;
      const b: Box = cur.side === 'bottom' ? { x: ep.at, y: cur.line, w: ep.length, h: ep.depth } : cur.side === 'top' ? { x: ep.at, y: cur.line - ep.depth, w: ep.length, h: ep.depth } : cur.side === 'left' ? { x: cur.line - ep.depth, y: ep.at, w: ep.depth, h: ep.length } : { x: cur.line, y: ep.at, w: ep.depth, h: ep.length };
      const corners: [number, number, number, number] = cur.side === 'bottom' ? [0, 0, rad, rad] : cur.side === 'top' ? [rad, rad, 0, 0] : cur.side === 'left' ? [rad, 0, 0, rad] : [0, rad, rad, 0];
      ops.push({ op: 'fill', el: `${r.id}.mark`, path: { k: 'd', d: rectD(b.x, b.y, b.w, b.h, corners) }, fill: { t: 'color', c: hexOf(kit, em.fill) } });
      els.push({ id: `${r.id}.mark`, kind: 'edge_mark', beat: beat.id, z: zi - 999, box: b, ink: b, bleed: [], opacity: rm.a, settled: !moving([r.id]) });
    }
    ops.push({ op: 'pop' });
  });

  // ------------------------------------------------------------------ layers
  beat.layers.forEach((l, zi) => {
    if(filter?.skip?.has(l.id)||filter?.only&&!filter.only.has(l.id))return;
    const p = place(l);
    if (!p || p.visible === false) return;
    const transform=full(l),a=transform.a;let m=transform.m;
    if(l.press){const phase=(t-span.start-l.press.start)/l.press.duration;const scale=phase>=0&&phase<=1?1-.035*Math.sin(Math.PI*phase):1;m=mul(m,aroundPivot(p.box.x+p.box.w/2,p.box.y+p.box.h/2,scale,0));}
    const settled = !moving(settleIds(l));
    const base: Omit<ElRec, 'box' | 'ink'> = { id: l.id, kind: l.kind, beat: beat.id, route: l.route, z: zi, bleed: p.bleed ?? [], opacity: a, settled };
    if (a <= 0.001) { els.push({ ...base, box: xfBox(m, p.box), ink: null, opacity: 0 }); return; }
    ops.push({ op: 'push', m, alpha: a });
    switch (l.kind) {
      case 'text': {
        const s = kit.styles[l.style];
        if (!s) throw new Error(`${l.id}: no style "${l.style}"`);
        const tr = kit.treatments[l.treatment ?? s.treatment] ?? { kind: 'plain' as const };
        const ts = stateOf(l.id),contrastRuns:{box:Box;color:string}[]=[];
        const drawOne = (item: number | undefined, alpha: number) => {
          const lines = copyLines(cfg, l.slot, st, item);
          const block = layoutText(engine, kit, s, lines, { box: p.box, align: p.align ?? 'left', v_anchor: p.v_anchor ?? 'top', join: p.join_lines, fmtUnitScale: u / 10.8, minScale: kit.layout.min_text_scale, color: hexOf(kit, l.color), treatment: tr, fill: l.fill }, ts?.words ?? Infinity, l.emphasis?Math.max(0,Math.min(1,(t-span.start-l.emphasis.start)/l.emphasis.duration)):ts?.draw ?? 1);
          if (alpha < 1) ops.push({ op: 'push', m: IDENT, alpha });
          block.lines.forEach((L, i) => {
            const pl = ts?.perLine?.[i];
            if (pl) ops.push({ op: 'push', m: translate(0, pl.dy), alpha: pl.alpha });
            for (const rct of block.rects.filter((x) => x.line === i || (x.line === undefined && i === 0))) if (rct.kind !== 'underline') ops.push({ op: 'fill', el: l.id, path: { k: 'rect', ...rct.box, r: rct.radius }, fill: { t: 'color', c: rct.fill } });
            if(l.kinetic?.mode==='mask'){const progress=Math.max(0,Math.min(1,(t-span.start-l.kinetic.start)/l.kinetic.duration));ops.push({op:'push',m:IDENT,alpha:1,clip:{k:'rect',x:p.box.x,y:p.box.y,w:p.box.w,h:p.box.h*progress}});}
            for (const [wordIndex,w] of L.words.entries()) {const kinetic=l.kinetic,progress=kinetic?Math.max(0,Math.min(1,(t-span.start-kinetic.start-(kinetic.mode==='word'?wordIndex/Math.max(1,L.words.length):i/Math.max(1,block.lines.length))*kinetic.duration*.5)/(kinetic.duration*.5))):1;
             if(kinetic)ops.push({op:'push',m:translate(0,(kinetic.mode!=='mask'&&!beat.never?.includes(l.id)&&(kit.motion.allowed.includes('rise')||kit.motion.allowed.includes('move'))?(1-progress)*block.size*.18:0)),alpha:kinetic.mode==='mask'?1:progress});
             const highlight=w.emph&&tr.kind==='highlight'&&tr.on?block.rects.find(r=>r.kind==='highlight'&&r.line===i&&r.box.x<w.ink.x+w.ink.w&&r.box.x+r.box.w>w.ink.x):undefined;
             const color=w.emph&&tr.kind!=='highlight'&&block.emphColor?block.emphColor:block.color,run={op:'glyphs' as const,el:l.id,font:block.font,weight:block.weight,size:block.size,x:w.x,y:L.baseline,glyphs:w.glyphs,color};ops.push(run);
             const ink=w.ink,clip=highlight?{x:Math.max(ink.x,highlight.box.x),y:Math.max(ink.y,highlight.box.y),w:Math.min(ink.x+ink.w,highlight.box.x+highlight.box.w)-Math.max(ink.x,highlight.box.x),h:Math.min(ink.y+ink.h,highlight.box.y+highlight.box.h)-Math.max(ink.y,highlight.box.y)}:undefined;
             const probe=(box:Box,c:string)=>{if(progress>.01&&(pl?.alpha??1)>.01&&box.w>.5&&box.h>.5)contrastRuns.push({box:xfBox(m,{...box,y:box.y+(pl?.dy??0)+(kinetic&&kinetic.mode!=='mask'&&(!beat.never?.includes(l.id)&&(kit.motion.allowed.includes('rise')||kit.motion.allowed.includes('move')))?(1-progress)*block.size*.18:0)}),color:c});};
             if(highlight&&tr.kind==='highlight'&&tr.on&&clip&&clip.w>0&&clip.h>0){
              const dark=hexOf(kit,tr.on);ops.push({op:'push',m:IDENT,alpha:1,clip:{k:'rect',...highlight.box}},{...run,color:dark},{op:'pop'});probe(clip,dark);
              probe({x:ink.x,y:ink.y,w:ink.w,h:clip.y-ink.y},color);probe({x:ink.x,y:clip.y+clip.h,w:ink.w,h:ink.y+ink.h-clip.y-clip.h},color);probe({x:ink.x,y:clip.y,w:clip.x-ink.x,h:clip.h},color);probe({x:clip.x+clip.w,y:clip.y,w:ink.x+ink.w-clip.x-clip.w,h:clip.h},color);
             }else probe(ink,color);
             if(kinetic)ops.push({op:'pop'});
            }
            if(l.kinetic?.mode==='mask')ops.push({op:'pop'});
            for (const rct of block.rects.filter((x) => x.line === i && x.kind === 'underline')) ops.push({ op: 'fill', el: l.id, path: { k: 'rect', ...rct.box }, fill: { t: 'color', c: rct.fill } });
            if (pl) ops.push({ op: 'pop' });
          });
          if (alpha < 1) ops.push({ op: 'pop' });
          return { block, lines };
        };
        const bound = cfg.slot_axis[l.slot] === 'items';
        const { block, lines } = drawOne(bound ? motion.items?.index ?? 0 : undefined, bound && motion.items ? 1 - motion.items.mix : 1);
        if (bound && motion.items && motion.items.mix > 0) drawOne(motion.items.next, motion.items.mix);
        const onFill = tr.kind === 'plaque' || tr.kind === 'box' || tr.kind === 'button' ? hexOf(kit, l.fill ?? tr.fill) : null;
        const shown = block.lines.reduce((n, L) => n + L.words.length, 0);
        els.push({ ...base, box: xfBox(m, block.box), ink: block.ink ? xfBox(m, block.ink) : null, opacity: shown ? a : 0, text: { runs:contrastRuns,scale: block.scale, neededScale: block.neededScale, fitOk: block.fitOk, color: block.color, onFill, slot: l.slot, words: wordCount(lines), shownWords: shown, hook: cfg.slot_axis[l.slot] === 'hook' } });
        break;
      }
      case 'logo': {
        const L = kit.logos[l.logo];
        if (!L) throw new Error(`${l.id}: no logo "${l.logo}"`);
        const shape = L.mode === 'as_drawn'||L.raster_mask ? null : parseSvg(L.svg);
        if(shape)for(const path of shape.paths){if(path.fill!==undefined)path.fill='currentColor';if(path.stroke)path.stroke='currentColor';}
        const aspect = !shape ? L.view_box : shape.view_box;
        if (!aspect || !(aspect[0] > 0 && aspect[1] > 0)) throw new Error(`${l.id}: invalid logo view_box`);
        const h = p.box.w * (aspect[1] / aspect[0]);
        const y = p.v_anchor === 'bottom' ? p.box.y + p.box.h - h : p.v_anchor === 'middle' ? p.box.y + (p.box.h - h) / 2 : p.box.y;
        const b = { x: p.box.x, y, w: p.box.w, h };
        if (!shape) ops.push({ op: 'logo_image', el: l.id, logo: l.logo, box: b,...(L.mode==='one_colour'?{tint:hexOf(kit,l.color)}:{}) });
        else ops.push({ op: 'vector', el: l.id, shape: shape!, box: b, color: hexOf(kit, l.color) });
        els.push({ ...base, box: xfBox(m, b), ink: xfBox(m, b) });
        break;
      }
      case 'mark': {
        const mk = kit.marks[l.mark];
        if (!mk) throw new Error(`${l.id}: no mark "${l.mark}"`);
        const fill = hexOf(kit, l.fill ?? mk.fills[0]);
        if (mk.shape) ops.push({ op: 'vector', el: l.id, shape: mk.shape, box: p.box, color: fill });
        else ops.push({ op: 'fill', el: l.id, path: { k: 'rect', ...p.box, r: (mk.radius_u ?? 0) * u }, fill: { t: 'color', c: fill } });
        if (mk.text) {
          const txt = typeof mk.text.fixed === 'string' ? mk.text.fixed : mk.text.fixed[st.lang] ?? Object.values(mk.text.fixed)[0];
          const tb = mk.text.box, s = kit.styles[mk.text.style];
          if (s && txt) {
            const box = { x: p.box.x + tb[0] * p.box.w, y: p.box.y + tb[1] * p.box.h, w: (tb[2] - tb[0]) * p.box.w, h: (tb[3] - tb[1]) * p.box.h };
            const block = layoutText(engine, kit, s, txt.split('\n'), { box, align: 'center', v_anchor: 'middle', fmtUnitScale: u / 10.8, minScale: kit.layout.min_text_scale, color: hexOf(kit, mk.text.color), treatment: { kind: 'plain' } });
            for (const L2 of block.lines) for (const w of L2.words) ops.push({ op: 'glyphs', el: l.id, font: block.font, weight: block.weight, size: block.size, x: w.x, y: L2.baseline, glyphs: w.glyphs, color: block.color });
          }
        }
        els.push({ ...base, box: xfBox(m, p.box), ink: xfBox(m, p.box) });
        break;
      }
      case 'graphic': {
        const gs = l.graphic;
        if (gs.kind === 'chart') {
          const d = cfg.data?.[gs.data];
          chartOps(l.id, gs.chart, p.box, (Array.isArray(d) ? d : Number(d ?? 0)) as number[] | number, gs.max ?? 100, hexOf(kit, gs.color), hexOf(kit, gs.track ?? kit.ui_kit.surface), (gs.width_u ?? (gs.chart === 'ring' ? 3 : gs.chart === 'bar' ? 4 : 1)) * u, stateOf(l.id)?.draw ?? 1, ops);
        } else {
          const kg = kit.graphics[gs.graphic] ?? cfg.graphics?.[gs.graphic];
          if (!kg) throw new Error(`${l.id}: no graphic "${gs.graphic}"`);
          if (gs.kind === 'pattern') ops.push({ op: 'fill', el: l.id, path: { k: 'rect', ...p.box }, fill: { t: 'pattern', shape: kg.shape, color: hexOf(kit, gs.color), bg: 'transparent', tile: gs.scale_u * u, gap: gs.gap_u * u, rot: 0 } });
          else ops.push({ op: 'vector', el: l.id, shape: kg.shape, box: p.box, color: hexOf(kit, gs.color), stroke: kg.kind === 'icon' ? (kg.stroke_u ?? 0.3) * u * (kg.shape.view_box[0] / p.box.w) : undefined });
        }
        els.push({ ...base, box: xfBox(m, p.box), ink: xfBox(m, p.box) });
        break;
      }
      case 'media': {
        const partId = (l.item_bound && beat.items ? beat.items.list[motion.items?.index ?? 0]?.part : undefined) ?? l.part_by_hook?.[st.hook] ?? l.part;
        const P = cfg.parts[partId];
        ops.push({ op: 'push', m: IDENT, alpha: 1, clip: windowPath(l, p.box) });
        const med = mediaOp(l.id, P, p.box, safe, t - span.start, motion.clipTime.get(l.id), motion.seq.get(l.id) ?? 0);
        ops.push(med.op);
        let insert:UiDraw|undefined;
        if(l.screen_insert){const area=l.screen_insert.area,spec=cfg.ui[l.screen_insert.ui],b=med.rec.dest;
         if(spec){const inserted=drawUi({engine,kit,cfg,lang:st.lang,el:l.id,spec,st:motion.ui.get(l.id),t},{x:b.x+area.x*b.w,y:b.y+area.y*b.h,w:area.w*b.w,h:area.h*b.h});ops.push(...inserted.ops);insert=inserted;}
        }
        ops.push({ op: 'pop' });
        // items with a crossfade: the next item fades in over the current one
        if (l.item_bound && beat.items && motion.items && motion.items.mix > 0) {
          const nextP = cfg.parts[beat.items.list[motion.items.next]?.part ?? ''];
          ops.push({ op: 'push', m: IDENT, alpha: motion.items.mix, clip: windowPath(l, p.box) });
          ops.push(mediaOp(l.id, nextP, p.box, safe, t - span.start, motion.clipTime.get(l.id), motion.seq.get(l.id) ?? 0).op);
          ops.push({ op: 'pop' });
        }
        els.push({ ...base, box: xfBox(m, p.box), ink: null, media: { ...med.rec, visible: xfBox(m, med.rec.visible), key: med.rec.key ? xfBox(m, med.rec.key) : null, dest: xfBox(m, med.rec.dest) }, standin: med.rec.standin,...(insert?{device:{frame:xfBox(m,insert.frame),keys:insert.keys.map(k=>({id:k.id,box:xfBox(m,k.box)})),overflow:insert.overflow,strings:insert.strings}}:{}), route3d: !!P && ROUTES_3D.includes(P.route) });
        break;
      }
      case 'ui': {
        const spec = cfg.ui[l.ui];
        if (!spec) { ops.push({ op: 'media', el: l.id, part: '', media: 'picture', time: 0, frame: 0, dest: p.box, standin: { kind: 'procedural', color: '#777777', label: `${l.id}: no UI spec` }, label: l.id }); els.push({ ...base, box: xfBox(m, p.box), ink: null }); break; }
        const d = drawUi({ engine, kit, cfg, lang: st.lang, el: l.id, spec, st: motion.ui.get(l.id), t }, p.box);
        ops.push(...d.ops);
        els.push({ ...base, box: xfBox(m, d.frame), ink: xfBox(m, d.frame), device: { frame: xfBox(m, d.frame), keys: d.keys.map((k) => ({ id: k.id, box: xfBox(m, k.box) })), overflow: d.overflow, strings: d.strings } });
        break;
      }
      case 'object': {
        const objPart = (l.item_bound && beat.items ? beat.items.list[motion.items?.index ?? 0]?.part : undefined) ?? l.part;
        const P = cfg.parts[objPart];
        const is3d = !!P && ROUTES_3D.includes(P.route);
        const b = P?.side ? fitWhole(p.box, P.side, P.side) : p.box;
        if (l.shadow) { ops.push({ op: 'push', m: IDENT, alpha: 0.18 }); ops.push({ op: 'fill', el: l.id, path: { k: 'ellipse', cx: b.x + b.w / 2, cy: b.y + b.h, rx: b.w * 0.42, ry: b.w * 0.06 }, fill: { t: 'color', c: '#000000' } }); ops.push({ op: 'pop' }); }
        const standin = !P || P.status !== 'approved' || is3d;
        ops.push({ op: 'media', el: l.id, part: objPart, media: P?.media ?? 'picture', time: 0, frame: 0, dest: b, standin: standin ? (P?.standin ?? { kind: 'flat3d', color: kit.object_palette[0] ?? '#999999', label: l.id }) : null, label: is3d ? `${l.id} (3D — not built yet)` : l.id });
        els.push({ ...base, box: xfBox(m, b), ink: xfBox(m, b), standin, route3d: is3d });
        break;
      }
    }
    ops.push({ op: 'pop' });
  });
  return { ops, els, beat, span, tl, fmt, t, motion, st };

  function paintFill(pd: PaintDef, box: Box, id: string, boilFrame: number): Fill {
    if (pd.kind === 'flat') return { t: 'color', c: hexOf(kit, pd.color) };
    if (pd.kind === 'gradient') {
      const stops = pd.stops.map((s) => [s.at, hexOf(kit, s.color)] as [number, string]);
      if (pd.type === 'radial') return { t: 'radial', cx: box.x + box.w / 2, cy: box.y + box.h / 2, r: Math.hypot(box.w, box.h) / 2, stops };
      const ang = ((pd.angle ?? 180) * Math.PI) / 180, cx = box.x + box.w / 2, cy = box.y + box.h / 2, L = (Math.abs(Math.sin(ang)) * box.w + Math.abs(Math.cos(ang)) * box.h) / 2;
      return { t: 'linear', x0: cx - Math.sin(ang) * L, y0: cy + Math.cos(ang) * L, x1: cx + Math.sin(ang) * L, y1: cy - Math.cos(ang) * L, stops };
    }
    if (pd.kind === 'pattern') { const g = kit.graphics[pd.graphic]; return { t: 'pattern', shape: g?.shape ?? { view_box: [1, 1], paths: [] }, color: hexOf(kit, pd.color), bg: hexOf(kit, pd.bg), tile: pd.scale_u * u, gap: pd.gap_u * u, rot: pd.rotation ?? 0 }; }
    // a kit texture paint by itself: procedural stand-in tiles in the kit colour (generated tiles come as a media paint)
    void id;
    return { t: 'texture', part: '', frame: boilFrame, color: hexOf(kit, pd.color), tile: 24 * u, standin: true };
  }
  function mediaOp(el:string,P:Part|undefined,box:Box,safeBox:Box,sinceBeat:number,clipTime:number|undefined,frame:number):{op:Op;rec:NonNullable<ElRec['media']>}{
   const result=rawMediaOp(el,P,box,safeBox,sinceBeat,clipTime,frame),baseCamera=layers.get(el)?.camera,camera=baseCamera&&P?.frame_cameras?.[frame]?{...baseCamera,type:P.frame_cameras[frame]}:baseCamera;
   if(camera&&camera.type!=='none'&&result.op.op==='media'){
    const old=result.rec.dest,dest=cameraBox(old,camera.type,ease(curveOf(kit,'inout'),Math.max(0,Math.min(1,P?.frame_cameras?.length?sinceBeat/span.dur*P.frame_cameras.length-frame:sinceBeat/span.dur))),camera.amount);result.op.dest=dest;
    const key=result.rec.key;if(key)result.rec.key={x:dest.x+(key.x-old.x)/old.w*dest.w,y:dest.y+(key.y-old.y)/old.h*dest.h,w:key.w/old.w*dest.w,h:key.h/old.h*dest.h};
    result.rec.dest=dest;result.rec.upscale*=dest.w/old.w;
   }
   return result;
  }
  function rawMediaOp(el: string, P: Part | undefined, box: Box, safeBox: Box, sinceBeat: number, clipTime: number | undefined, frame: number): { op: Op; rec: NonNullable<ElRec['media']> } {
    if (!P) {
      return { op: { op: 'media', el, part: '', media: 'picture', time: 0, frame: 0, dest: box, standin: { kind: 'procedural', color: '#777777', label: `${el}: no part` }, label: el }, rec: { part: '', standin: true, visible: box, key: null, upscale: 1, cutout: false, dest: box, time: 0 } };
    }
    const standin = P.status !== 'approved' || ROUTES_3D.includes(P.route) || (!P.file && !P.files?.length);
    if(P.width&&P.height&&P.fit){
      const scale=P.fit==='contain'?Math.min(box.w/P.width,box.h/P.height):Math.max(box.w/P.width,box.h/P.height);
      const dest={x:box.x+(box.w-P.width*scale)/2,y:box.y+(box.h-P.height*scale)/2,w:P.width*scale,h:P.height*scale};
      return {op:{op:'media',el,part:P.id,media:P.media,time:clipTime??Math.max(0,sinceBeat),frame,dest,standin:standin?P.standin:null,label:P.id},rec:{part:P.id,standin,visible:box,key:P.key_part_box?{x:dest.x+P.key_part_box[0]*dest.w,y:dest.y+P.key_part_box[1]*dest.h,w:(P.key_part_box[2]-P.key_part_box[0])*dest.w,h:(P.key_part_box[3]-P.key_part_box[1])*dest.h}:null,upscale:scale,cutout:false,dest,time:clipTime??Math.max(0,sinceBeat)}};
    }
    if (P.cutout) {
      const dest = fitWhole(box, P.side ?? box.w, P.side ?? box.w);
      return { op: { op: 'media', el, part: P.id, media: P.media, time: 0, frame, dest, standin: standin ? P.standin : null, label: P.id }, rec: { part: P.id, standin, visible: dest, key: null, upscale: P.side ? dest.w / P.side : 1, cutout: true, dest, time: 0 } };
    }
    const c = cropRule(box, safeBox);
    const anchor = layers.get(el)?.per[fmt.id]?.crop_anchor;
    if (anchor) { c.dest.x += (0.5 - anchor[0]) * c.D; c.dest.y += (0.5 - anchor[1]) * c.D; }
    const time = clipTime ?? (P.clip_in ?? 0) + Math.max(0, sinceBeat);
    return {
      op: { op: 'media', el, part: P.id, media: P.media, time, frame, dest: c.dest, standin: standin ? P.standin : null, label: P.id },
      rec: { part: P.id, standin, visible: c.visible, key: P.key_part_box ? keyPartPx(c, P.key_part_box) : null, upscale: P.side ? c.D / P.side : 1, cutout: false, dest: c.dest, time },
    };
  }
}

export { ellipseD };

/** Both beats are evaluated throughout the outgoing transition window, including checks and exports. */
export function buildFrame(ctx:EngineCtx,st:VariantState,t:number):Frame{
 const tl=timeline(ctx.cfg,st.len),span=spanAt(tl,t),index=span.index;
 const transitionFor=(i:number)=>{if(i<0||i>=tl.length-1)return undefined;return beatOf(ctx.cfg,tl[i].beat).transition_out;};
 const effective=(s:Span)=>{const prev=transitionFor(s.index-1),lead=prev&&prev.type!=='cut'?Math.min(prev.duration,tl[s.index-1].dur*.3,s.dur*.3):0;return {...s,start:s.start-lead,dur:s.dur+lead};};
 const transition=transitionFor(index),next=tl[index+1],dur=transition&&next?Math.min(transition.duration,span.dur*.3,next.dur*.3):0;
 if(!transition||transition.type==='cut'||!next||dur<=0||t<span.end-dur)return buildBeatFrame(ctx,st,t,effective(span));
 const p=Math.max(0,Math.min(1,(t-(span.end-dur))/dur)),outBeat=beatOf(ctx.cfg,span.beat),inBeat=beatOf(ctx.cfg,next.beat);
 const pairs=inBeat.layers.flatMap(incoming=>{const outgoing=outBeat.layers.find(l=>l.persistent&&l.persistent===incoming.persistent);return outgoing?[{outgoing,incoming}]:[];});
 const outSkip=new Set(pairs.map(x=>x.outgoing.id)),inSkip=new Set(pairs.map(x=>x.incoming.id));
 let outgoing=buildBeatFrame(ctx,st,t,effective(span),{skip:outSkip}),incoming=buildBeatFrame(ctx,st,t,effective(next),{skip:inSkip});
 const outDepths=new Map<string,number>(),inDepths=new Map<string,number>();
 for(const B of inBeat.regions){const A=outBeat.regions.find(r=>r.persistent&&r.persistent===B.persistent);if(!A||A.area.kind!=='edge'||B.area.kind!=='edge'||A.area.per[st.fmt]?.side!==B.area.per[st.fmt]?.side)continue;
  const from=outgoing.motion.edge.get(A.id)??A.area.per[st.fmt].depth,to=incoming.motion.edge.get(B.id)??B.area.per[st.fmt].depth,depth=from+(to-from)*p;outDepths.set(A.id,depth);inDepths.set(B.id,depth);
 }
 if(outDepths.size){outgoing=buildBeatFrame(ctx,st,t,effective(span),{skip:outSkip,regionDepths:outDepths});incoming=buildBeatFrame(ctx,st,t,effective(next),{skip:inSkip,regionDepths:inDepths});}
 const {w,h}=outgoing.fmt,kind=transition.type,dir=kind.split('-').at(-1),dx=dir==='left'?-w:dir==='right'?w:0,dy=dir==='up'?-h:dir==='down'?h:0;
 let outM:Mat=IDENT,inM:Mat=IDENT,outA=1,inA=1,clip:PathSpec|undefined;
 if(kind==='crossfade'||kind==='match'){outA=1-p;inA=p;}
 if(kind.startsWith('push-')){outM=translate(dx*p,dy*p);inM=translate(-dx*(1-p),-dy*(1-p));}
 if(kind.startsWith('slide-'))inM=translate(-dx*(1-p),-dy*(1-p));
 if(kind==='zoom-through'){outM=aroundPivot(w/2,h/2,1+p*.2,0);inM=aroundPivot(w/2,h/2,.8+p*.2,0);outA=1-p;inA=p;}
 if(kind==='wipe'){
  const edge=inBeat.regions.find(r=>r.area.kind==='edge');const spec=edge?.area.kind==='edge'?edge.area.per[st.fmt]:undefined;
  const depth=(spec?.side==='left'||spec?.side==='right'?w:h)*p;
  clip=edge&&edge.area.kind==='edge'&&spec?areaPath(edge,incoming.fmt,depth).path:{k:'rect',x:0,y:0,w:w*p,h};
 }
 const wrap=(frame:Frame,m:Mat,alpha:number,cl?:PathSpec):Op[]=>[{op:'scene',ops:frame.ops,m,alpha,...(cl?{clip:cl}:{})}];
 const transform=(frame:Frame,m:Mat,alpha:number)=>frame.els.map(e=>({...e,box:xfBox(m,e.box),ink:e.ink?xfBox(m,e.ink):null,opacity:e.opacity*alpha,settled:false,...(e.text?{text:{...e.text,runs:e.text.runs?.map(r=>({...r,box:xfBox(m,r.box)}))}}:{}),...(e.media?{media:{...e.media,visible:xfBox(m,e.media.visible),dest:xfBox(m,e.media.dest),key:e.media.key?xfBox(m,e.media.key):null}}:{}),...(e.device?{device:{...e.device,frame:xfBox(m,e.device.frame),keys:e.device.keys.map(k=>({...k,box:xfBox(m,k.box)}))}}:{})}));
 const ops=[...wrap(outgoing,outM,outA),...wrap(incoming,inM,inA,clip)],els=[...transform(outgoing,outM,outA),...transform(incoming,inM,inA)];
 if(pairs.length){
  const boxes=new Map<string,Box>();for(const {outgoing:a,incoming:b}of pairs){const A=a.per[st.fmt]?.box,B=b.per[st.fmt]?.box;if(A&&B)boxes.set(b.id,{x:A.x+(B.x-A.x)*p,y:A.y+(B.y-A.y)*p,w:A.w+(B.w-A.w)*p,h:A.h+(B.h-A.h)*p});}
  const shared=buildBeatFrame(ctx,st,t,effective(next),{only:inSkip,boxes});ops.push(...shared.ops);els.push(...shared.els);
 }
 return {...outgoing,ops,els,transition:{type:kind,progress:p,outgoing:span.beat,incoming:next.beat}};
}
