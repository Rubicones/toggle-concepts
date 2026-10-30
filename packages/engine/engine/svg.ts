/**
 * Kit vectors: a logo / mark / icon SVG → a VectorShape (viewBox + path data). Only what kit files need:
 * path, rect, circle, ellipse, polygon, polyline, line; fill / stroke with currentColor. Pure string parsing
 * (no DOM), so it runs in the planner, the checks and the browser alike.
 */
import type { VectorShape } from '../types';

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m ? (m[2] ?? m[3]) : null;
};
const num = (tag: string, name: string, d = 0) => { const v = attr(tag, name); return v == null ? d : parseFloat(v); };

export function parseSvg(svg: string): VectorShape {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  let vb = (attr(root, 'viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((x) => !Number.isFinite(x))) vb = [0, 0, num(root, 'width', 100), num(root, 'height', 100)];
  const [ox, oy, w, h] = vb;
  const paths: VectorShape['paths'] = [];
  const style = (tag: string) => {
    const st = attr(tag, 'style') ?? '';
    const fromStyle = (k: string) => new RegExp(`${k}\\s*:\\s*([^;]+)`).exec(st)?.[1]?.trim() ?? null;
    const fill = attr(tag, 'fill') ?? fromStyle('fill');
    const stroke = attr(tag, 'stroke') ?? fromStyle('stroke');
    const width = attr(tag, 'stroke-width') ?? fromStyle('stroke-width');
    return { fill: fill === 'none' ? undefined : (fill ?? 'currentColor'), stroke: stroke && stroke !== 'none' ? stroke : undefined, width: width ? parseFloat(width) : undefined, noFill: fill === 'none' };
  };
  const push = (d: string, tag: string) => { const s = style(tag); paths.push({ d: shift(d, -ox, -oy), ...(s.noFill ? {} : { fill: s.fill }), ...(s.stroke ? { stroke: s.stroke, width: s.width ?? 1 } : {}) }); };
  for (const m of svg.matchAll(/<(path|rect|circle|ellipse|polygon|polyline|line)\b[^>]*\/?>/gi)) {
    const tag = m[0], k = m[1].toLowerCase();
    if (k === 'path') { const d = attr(tag, 'd'); if (d) push(d, tag); }
    else if (k === 'rect') { const x = num(tag, 'x'), y = num(tag, 'y'), rw = num(tag, 'width'), rh = num(tag, 'height'), rx = Math.min(num(tag, 'rx', num(tag, 'ry')), rw / 2, rh / 2); push(rectD(x, y, rw, rh, rx), tag); }
    else if (k === 'circle') { const cx = num(tag, 'cx'), cy = num(tag, 'cy'), r = num(tag, 'r'); push(ellipseD(cx, cy, r, r), tag); }
    else if (k === 'ellipse') push(ellipseD(num(tag, 'cx'), num(tag, 'cy'), num(tag, 'rx'), num(tag, 'ry')), tag);
    else if (k === 'polygon' || k === 'polyline') { const p = (attr(tag, 'points') ?? '').trim().split(/[\s,]+/).map(Number); let d = ''; for (let i = 0; i + 1 < p.length; i += 2) d += `${i ? 'L' : 'M'}${p[i]} ${p[i + 1]}`; push(d + (k === 'polygon' ? 'Z' : ''), tag); }
    else if (k === 'line') push(`M${num(tag, 'x1')} ${num(tag, 'y1')}L${num(tag, 'x2')} ${num(tag, 'y2')}`, tag);
  }
  return { view_box: [w, h], paths };
}

export function rectD(x: number, y: number, w: number, h: number, r: number | [number, number, number, number] = 0): string {
  const [tl, tr, br, bl] = typeof r === 'number' ? [r, r, r, r] : r;
  if (!tl && !tr && !br && !bl) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x + tl} ${y}H${x + w - tr}${tr ? `A${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : ''}V${y + h - br}${br ? `A${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : ''}H${x + bl}${bl ? `A${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : ''}V${y + tl}${tl ? `A${tl} ${tl} 0 0 1 ${x + tl} ${y}` : ''}Z`;
}
export function ellipseD(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}

/** Translate absolute path data (commands in capitals only are shifted; relative ones need no shift). */
export function shift(d: string, dx: number, dy: number): string {
  if (!dx && !dy) return d;
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  let out = '', cmd = '', idx = 0;
  const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  for (const t of toks) {
    if (/[a-zA-Z]/.test(t)) { cmd = t; idx = 0; out += t; continue; }
    let v = parseFloat(t);
    const C = cmd.toUpperCase(), n = arity[C] ?? 2;
    if (cmd === C && n) {
      const pos = idx % n;
      if (C === 'H') v += dx;
      else if (C === 'V') v += dy;
      else if (C === 'A') { if (pos === 5) v += dx; if (pos === 6) v += dy; }
      else v += pos % 2 === 0 ? dx : dy;
    }
    idx++;
    out += (out && !/[a-zA-Z]$/.test(out) ? ' ' : '') + +v.toFixed(3);
  }
  return out;
}
