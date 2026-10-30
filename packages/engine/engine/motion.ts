/**
 * The cue evaluator (7.5): every cue of a beat → the state of its targets at time t.
 * Enter cues hold their `from` state before they start (an element waits hidden for its cue);
 * leave cues (`out`) hold the rest state before and the gone state after.
 * Motion room: a travel is shortened so an element that rests inside the safe area never leaves
 * the frame or enters a platform zone on its way.
 * 3D cues (spin, sway) are out of scope: kept valid, evaluated as no motion.
 */
import type { Beat, Box, Cue, Kit } from '../types';
import { curveOf, ease, parseTime, type ParsedTime } from './util';

export interface Tx { dx: number; dy: number; scale: number; rot: number; opacity: number; pivot: 'center' | 'bottom' }
export interface TargetState { tx: Tx; words?: number; draw?: number; perLine?: { dy: number; alpha: number }[]; ride?: { region: string; delta: number } }
export interface UiState {
  scroll?:number;cursor?:{x:number;y:number};
  screen: string | null; prevScreen: string | null; screenMix: number; transition: 'slide' | 'fade' | 'cut';
  parts: Map<string, { count?: number; alpha?: number; stagger?: { t0: number; step: number; dur: number }; press?: number }>;
}
export interface ActiveWindow { target: string; type: Cue['type']; from: number; to: number }
export interface MotionState {
  layer: Map<string, TargetState>;
  group: Map<string, TargetState>;
  /** region → current edge depth, px */
  edge: Map<string, number>;
  /** region → edge travel delta since rest, px, along the edge normal (positive = region grows) */
  edgeDelta: Map<string, number>;
  markVisible: Map<string, boolean>;
  boil: Map<string, number>;
  seq: Map<string, number>;
  clipTime: Map<string, number>;
  items: { index: number; next: number; mix: number } | null;
  ui: Map<string, UiState>;
  /** every cue's window in absolute seconds (for "settled" and for the check moments) */
  windows: ActiveWindow[];
}
export interface MotionCtx {
  kit: Kit;
  beat: Beat;
  fmt: string;
  start: number; end: number;
  t: number;
  u: number;
  frame: { w: number; h: number };
  safe: Box;
  restBox: (target: string) => Box | null;
  wordsOf: (layer: string) => number;
  linesOf: (layer: string) => number;
  /** rest depth of an edge region in this format, and the frame length along its normal */
  edgeRest: (region: string) => { depth: number; full: number } | null;
  itemCount: number;
  partFrames: (layer: string) => number;
}

const ID = (): Tx => ({ dx: 0, dy: 0, scale: 1, rot: 0, opacity: 1, pivot: 'center' });
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function typeOnEnd(beat: Beat, layer: string, c: Pick<MotionCtx, 'start' | 'end' | 'wordsOf'>, depth = 0): number {
  const cue = beat.cues.find((q) => q.type === 'type_on' && q.target === layer) as Extract<Cue, { type: 'type_on' }> | undefined;
  if (!cue) throw new Error(`after:${layer} — ${layer} has no type_on cue in beat ${beat.id}`);
  return abs(beat, cue.t, c, depth + 1) + c.wordsOf(layer) * cue.step;
}
export function abs(beat: Beat, t: Parameters<typeof parseTime>[0], c: Pick<MotionCtx, 'start' | 'end' | 'wordsOf'>, depth = 0): number {
  const p: ParsedTime = parseTime(t);
  if (p.anchor === 'after') {
    if (depth > 8) throw new Error('after: anchors form a cycle');
    return typeOnEnd(beat, p.layer, c, depth) + p.offset;
  }
  return (p.anchor === 'end' ? c.end : c.start) + p.offset;
}

/** Shorten a translation so a box that rests inside `room` stays inside it while travelling. */
export function roomFor(rest: Box | null, dx: number, dy: number, room: Box): [number, number] {
  if (!rest) return [dx, dy];
  const inside = rest.x >= room.x - 0.5 && rest.y >= room.y - 0.5 && rest.x + rest.w <= room.x + room.w + 0.5 && rest.y + rest.h <= room.y + room.h + 0.5;
  if (!inside) return [dx, dy];
  const maxL = rest.x - room.x, maxR = room.x + room.w - (rest.x + rest.w), maxT = rest.y - room.y, maxB = room.y + room.h - (rest.y + rest.h);
  const nx = dx < 0 ? Math.max(dx, -maxL) : Math.min(dx, maxR);
  const ny = dy < 0 ? Math.max(dy, -maxT) : Math.min(dy, maxB);
  return [nx, ny];
}

export function evaluate(c0: MotionCtx): MotionState {
  // cues limited to other formats do not exist in this one
  const c: MotionCtx = { ...c0, beat: { ...c0.beat, cues: c0.beat.cues.filter((q) => !q.formats || q.formats.includes(c0.fmt)) } };
  const { beat, t, kit, u } = c;
  const S: MotionState = { layer: new Map(), group: new Map(), edge: new Map(), edgeDelta: new Map(), markVisible: new Map(), boil: new Map(), seq: new Map(), clipTime: new Map(), items: null, ui: new Map(), windows: [] };
  const isGroup = (id: string) => beat.groups.some((g) => g.id === id);
  const get = (id: string): TargetState => {
    const m = isGroup(id) ? S.group : S.layer;
    let s = m.get(id);
    if (!s) { s = { tx: ID() }; m.set(id, s); }
    return s;
  };
  const A = (tt: Parameters<typeof parseTime>[0]) => abs(beat, tt, c);
  const prog = (t0: number, dur: number, curve?: string) => (dur <= 0 ? (t >= t0 ? 1 : 0) : ease(curveOf(kit, curve), clamp01((t - t0) / dur)));

  // edges: sort per region by start; the last started cue sets the value
  const edgeCues = new Map<string, { t0: number; cue: Extract<Cue, { type: 'edge' }> }[]>();
  for (const q of beat.cues) if (q.type === 'edge') { const t0 = A(q.t); (edgeCues.get(q.region) ?? edgeCues.set(q.region, []).get(q.region)!).push({ t0, cue: q }); S.windows.push({ target: q.region, type: 'edge', from: t0, to: t0 + q.dur }); for (const r of q.ride ?? []) S.windows.push({ target: r, type: 'edge', from: t0, to: t0 + q.dur }); }
  for (const r of beat.regions) {
    const rest = c.edgeRest(r.id);
    if (!rest) continue;
    const val = (v: 'rest' | 'out' | 'full' | number) => (v === 'rest' ? rest.depth : v === 'out' ? 0 : v === 'full' ? rest.full : v * rest.depth);
    const list = (edgeCues.get(r.id) ?? []).sort((a, b) => a.t0 - b.t0);
    let d = rest.depth;
    if (list.length) {
      d = val(list[0].cue.from);
      for (const { t0, cue } of list) { if (t < t0) break; d = val(cue.from) + (val(cue.to) - val(cue.from)) * prog(t0, cue.dur, cue.curve); }
    }
    S.edge.set(r.id, d);
    S.edgeDelta.set(r.id, d - rest.depth);
    // riders: listed layers (the last started cue's list) and layers resting on this region
    const riders = new Set<string>(beat.layers.filter((l) => l.rests_on === r.id).map((l) => l.id));
    const cur = [...list].reverse().find((x) => t >= x.t0) ?? list[0];
    for (const id of cur?.cue.ride ?? []) riders.add(id);
    // the rider moves with the edge line; the frame builder turns the delta into x/y (it knows the side per format)
    if (riders.size && d !== rest.depth) for (const id of riders) get(id).ride = { region: r.id, delta: d - rest.depth };
  }
  // edge marks
  for (const r of beat.regions) if (r.edge_mark) S.markVisible.set(r.id, true);
  for (const q of beat.cues) if (q.type === 'edge_mark') {
    const show = q.show !== undefined ? A(q.show) : -Infinity, hide = q.hide !== undefined ? A(q.hide) : Infinity;
    S.markVisible.set(q.region, t >= show && t < hide);
    if (q.show !== undefined) S.windows.push({ target: q.region, type: 'edge_mark', from: show, to: show });
    if (q.hide !== undefined) S.windows.push({ target: q.region, type: 'edge_mark', from: hide, to: hide });
  }

  for (const q of beat.cues) {
    switch (q.type) {
      case 'fade': {
        const t0 = A(q.t), p = prog(t0, q.dur, q.curve), s = get(q.target);
        s.tx.opacity *= q.out ? 1 - p : p;
        S.windows.push({ target: q.target, type: q.type, from: t0, to: t0 + q.dur });
        break;
      }
      case 'rise': case 'drop': case 'move': {
        const t0 = A(q.t), s = get(q.target);
        let [fx, fy] = q.type === 'move' ? [q.from_u[0] * u, q.from_u[1] * u] : [0, (q.type === 'rise' ? 1 : -1) * Math.abs(q.from_u) * u];
        [fx, fy] = roomFor(c.restBox(q.target), fx, fy, c.safe);
        const perLine = q.type !== 'move' && q.per_line ? (typeof q.per_line === 'number' ? q.per_line : 0.06) : 0;
        if (perLine) {
          const n = c.linesOf(q.target);
          s.perLine = Array.from({ length: n }, (_, i) => { const p = prog(t0 + i * perLine, q.dur, q.curve); return { dy: q.out ? -fy * p : fy * (1 - p), alpha: q.out ? 1 - p : p }; });
          S.windows.push({ target: q.target, type: q.type, from: t0, to: t0 + (n - 1) * perLine + q.dur });
        } else {
          const p = prog(t0, q.dur, q.curve);
          if (q.out) { s.tx.dx -= fx * p; s.tx.dy -= fy * p; s.tx.opacity *= q.type === 'move' ? 1 : 1 - p; }
          else { s.tx.dx += fx * (1 - p); s.tx.dy += fy * (1 - p); if (q.type !== 'move') s.tx.opacity *= p; }
          S.windows.push({ target: q.target, type: q.type, from: t0, to: t0 + q.dur });
        }
        break;
      }
      case 'pop': {
        const t0 = A(q.t), s = get(q.target), from = q.from ?? 0.6;
        const p = ease(curveOf(kit, q.curve ?? 'back'), clamp01((t - t0) / q.dur));
        s.tx.scale *= t < t0 ? from : from + (1 - from) * p;
        s.tx.opacity *= t < t0 ? 0 : Math.min(1, clamp01((t - t0) / (q.dur * 0.4)));
        S.windows.push({ target: q.target, type: q.type, from: t0, to: t0 + q.dur });
        break;
      }
      case 'scale': {
        const t0 = A(q.t), s = get(q.target), p = prog(t0, q.dur, q.curve);
        s.tx.scale *= q.from + (q.to - q.from) * p;
        S.windows.push({ target: q.target, type: q.type, from: t0, to: t0 + q.dur });
        break;
      }
      case 'draw': {
        const t0 = A(q.t), s = get(q.target);
        s.draw = t < t0 ? 0 : prog(t0, q.dur, q.curve);
        S.windows.push({ target: q.target, type: q.type, from: t0, to: t0 + q.dur });
        break;
      }
      case 'type_on': {
        const t0 = A(q.t), s = get(q.target), n = c.wordsOf(q.target);
        s.words = t < t0 ? 0 : Math.min(n, Math.floor((t - t0) / q.step) + 1);
        S.windows.push({ target: q.target, type: q.type, from: t0, to: t0 + n * q.step });
        break;
      }
      case 'float': {
        const t0 = q.t !== undefined ? A(q.t) : c.start, s = get(q.target);
        let dy = q.amp_u * u * Math.sin((2 * Math.PI * (t - t0)) / q.period);
        [, dy] = roomFor(c.restBox(q.target), 0, dy, c.safe);
        if (t >= t0) s.tx.dy += dy;
        S.windows.push({ target: q.target, type: q.type, from: t0, to: c.end });
        break;
      }
      case 'rock': {
        const t0 = q.t !== undefined ? A(q.t) : c.start, s = get(q.target);
        if (t >= t0) { s.tx.rot += q.amp_deg * Math.sin((2 * Math.PI * (t - t0)) / q.period); s.tx.pivot = 'bottom'; }
        S.windows.push({ target: q.target, type: q.type, from: t0, to: c.end });
        break;
      }
      case 'boil': S.boil.set(q.region, Math.max(0, Math.floor((t - c.start) * q.fps))); break;
      case 'sequence': {
        const n = Math.max(1, c.partFrames(q.target)), i = Math.max(0, Math.floor((t - c.start) * q.fps));
        S.seq.set(q.target, q.loop ? i % n : Math.min(i, n - 1));
        break;
      }
      case 'clip': S.clipTime.set(q.target, q.clip_in + Math.max(0, t - c.start)); break;
      case 'items': {
        const t0 = q.t !== undefined ? A(q.t) : c.start, n = Math.max(1, c.itemCount);
        const k = Math.max(0, t - t0), i = Math.floor(k / q.period), within = k - i * q.period, dur = q.dur ?? 0.2;
        const mix = q.transition === 'crossfade' && within > q.period - dur ? clamp01((within - (q.period - dur)) / dur) : 0;
        // a bad period or start (NaN) shows the first item rather than breaking every frame
        S.items = Number.isFinite(i) ? { index: i % n, next: (i + 1) % n, mix } : { index: 0, next: 0, mix: 0 };
        if (Number.isFinite(i) && q.period > 0) for (let j = 1; t0 + j * q.period < c.end; j++) S.windows.push({ target: '__items', type: 'items', from: t0 + j * q.period - (q.transition === 'crossfade' ? dur : 0), to: t0 + j * q.period });
        break;
      }
      case 'ui': {
        let st = S.ui.get(q.target);
        if (!st) { st = { screen: null, prevScreen: null, screenMix: 1, transition: 'cut', parts: new Map() }; S.ui.set(q.target, st); }
        if(q.scroll){const [at,duration,from,to]=q.scroll;st.scroll=from+(to-from)*clamp01((t-A(at))/duration);S.windows.push({target:q.target,type:'ui',from:A(at),to:A(at)+duration});}
        if(q.cursor?.points.length){const k=clamp01((t-A(q.cursor.t))/q.cursor.dur)*(q.cursor.points.length-1),i=Math.min(Math.floor(k),q.cursor.points.length-1),j=Math.min(i+1,q.cursor.points.length-1),p=k-i;st.cursor={x:q.cursor.points[i][0]+(q.cursor.points[j][0]-q.cursor.points[i][0])*p,y:q.cursor.points[i][1]+(q.cursor.points[j][1]-q.cursor.points[i][1])*p};S.windows.push({target:q.target,type:'ui',from:A(q.cursor.t),to:A(q.cursor.t)+q.cursor.dur});}
        const p = st.parts.get(q.part) ?? {};
        if (q.count) { const t0 = A(q.count[0]); p.count = t < t0 ? 0 : prog(t0, q.count[1], 'out3'); S.windows.push({ target: q.target, type: 'ui', from: t0, to: t0 + q.count[1] }); }
        if (q.fade) { const t0 = A(q.fade[0]); p.alpha = t < t0 ? 0 : prog(t0, q.fade[1], 'out3'); S.windows.push({ target: q.target, type: 'ui', from: t0, to: t0 + q.fade[1] }); }
        if (q.stagger) { const t0 = A(q.stagger[0]); p.stagger = { t0, step: q.stagger[1], dur: q.stagger[2] }; S.windows.push({ target: q.target, type: 'ui', from: t0, to: t0 + q.stagger[2] + 8 * q.stagger[1] }); }
        if (q.press) { const t0 = A(q.press[0]), d = q.press[1]; const x = clamp01((t - t0) / d); p.press = t < t0 || t > t0 + d ? 0 : Math.sin(Math.PI * x); S.windows.push({ target: q.target, type: 'ui', from: t0, to: t0 + d }); }
        st.parts.set(q.part, p);
        break;
      }
      default: break; // spin, sway: 3D — out of scope
    }
  }
  // screens: per UI layer, the last started screen cue wins
  const screens = beat.cues.filter((q): q is Extract<Cue, { type: 'ui' }> => q.type === 'ui' && !!q.screen).map((q) => ({ q, t0: A(q.t ?? 0) })).sort((a, b) => a.t0 - b.t0);
  for (const { q, t0 } of screens) {
    let st = S.ui.get(q.target);
    if (!st) { st = { screen: null, prevScreen: null, screenMix: 1, transition: 'cut', parts: new Map() }; S.ui.set(q.target, st); }
    S.windows.push({ target: q.target, type: 'ui', from: t0, to: t0 + (q.dur ?? 0) });
    if (t < t0) continue;
    st.prevScreen = st.screen;
    st.screen = q.screen!;
    st.transition = q.transition ?? 'cut';
    st.screenMix = st.transition === 'cut' || !q.dur ? 1 : ease(curveOf(kit, 'inout'), clamp01((t - t0) / q.dur));
  }
  return S;
}

/** Cue types that move an element (for "never moves" and settle checks). */
export const MOVING: Cue['type'][] = ['rise', 'drop', 'move', 'pop', 'scale', 'float', 'rock', 'edge', 'spin', 'sway'];
