/** Small shared pieces of the engine: colours, curves, time refs, boxes, transforms. Pure. */
import type { Bezier, Box, ColorRef, EngineConfig, Kit, TimeRef } from '../types';

// ---------------------------------------------------------------------------- colour
export function hexOf(kit: Kit, c: ColorRef | undefined, dflt = '#000000'): string {
  if (!c) return dflt;
  if (c.startsWith('#') || c.startsWith('rgb')) return c;
  const k = kit.colors[c];
  if (!k) throw new Error(`colour "${c}" is not in the kit`);
  return k.hex;
}
export function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function luminance(hex: string): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export function mix(a: string, b: string, k: number): string {
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------- curves
function bezierFn(p: Bezier): (x: number) => number {
  const [x1, y1, x2, y2] = p;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1;
    if (Math.abs(sx(t) - x) > 1e-5) { t = x; for (let i = 0; i < 30; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return sy(t);
  };
}
const BUILTIN: Record<string, Bezier> = { out3: [0.215, 0.61, 0.355, 1], inout: [0.645, 0.045, 0.355, 1], back: [0.34, 1.56, 0.64, 1], linear: [0, 0, 1, 1] };
const cache = new Map<string, (x: number) => number>();
export function curveOf(kit: Kit, name: string | undefined): Bezier {
  const n = name ?? 'out3';
  return kit.motion.curves[n] ?? BUILTIN[n] ?? BUILTIN.out3;
}
export function ease(b: Bezier, x: number): number {
  const k = b.join(',');
  let f = cache.get(k);
  if (!f) { f = bezierFn(b); cache.set(k, f); }
  return f(x);
}
export const CURVE_NAMES = Object.keys(BUILTIN);

// ---------------------------------------------------------------------------- time refs
export type ParsedTime = { anchor: 'start' | 'end'; offset: number } | { anchor: 'after'; layer: string; offset: number };
export function parseTime(t: TimeRef | undefined): ParsedTime {
  if (t === undefined || t === null) return { anchor: 'start', offset: 0 };
  if (typeof t === 'number') return { anchor: 'start', offset: t };
  const s = t.trim();
  let m = /^end\s*([+-]\s*[\d.]+)?$/.exec(s);
  if (m) return { anchor: 'end', offset: m[1] ? Number(m[1].replace(/\s/g, '')) : 0 };
  m = /^after:([\w.\-]+)\s*([+-]\s*[\d.]+)?$/.exec(s);
  if (m) return { anchor: 'after', layer: m[1], offset: m[2] ? Number(m[2].replace(/\s/g, '')) : 0 };
  const n = Number(s);
  if (Number.isFinite(n)) return { anchor: 'start', offset: n };
  throw new Error(`bad time "${t}" (use seconds, "end-0.16" or "after:<layer>+0.1")`);
}

// ---------------------------------------------------------------------------- boxes and transforms
export const r2 = (v: number) => Math.round(v * 100) / 100;
export function inter(a: Box, b: Box): Box | null {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
export function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** 2D affine [a, b, c, d, e, f] as canvas setTransform */
export type Mat = [number, number, number, number, number, number];
export const IDENT: Mat = [1, 0, 0, 1, 0, 0];
export function mul(m: Mat, n: Mat): Mat {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export function aroundPivot(px: number, py: number, scale: number, rotDeg: number): Mat {
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r) * scale, s = Math.sin(r) * scale;
  return mul(translate(px, py), mul([c, s, -s, c, 0, 0], translate(-px, -py)));
}
export function apply(m: Mat, x: number, y: number): [number, number] { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
export function xfBox(m: Mat, b: Box): Box {
  const pts = [apply(m, b.x, b.y), apply(m, b.x + b.w, b.y), apply(m, b.x, b.y + b.h), apply(m, b.x + b.w, b.y + b.h)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
export const isIdent = (m: Mat) => m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

// ---------------------------------------------------------------------------- config helpers
export function fmtOf(cfg: EngineConfig, id: string) {
  const f = cfg.formats.find((x) => x.id === id);
  if (!f) throw new Error(`no format "${id}"`);
  return f;
}
export const unitOf = (f: { w: number; h: number }) => Math.min(f.w, f.h) / 100;
