/**
 * Crop rule (7.1): a square master into any region or window.
 *   visible part = the box minus the platform zones; anchor = the square's centre at the visible part's centre;
 *   D = max(w, h, 2·ax, 2·(w−ax), 2·ay, 2·(h−ay)); key part (0–1 of the square) must lie inside the visible part
 *   (L_KEY_CROP); D ÷ the master's side ≤ 1.5 (L_UPSCALE).
 * Cut-outs are not cropped: fitted whole into their box, standing on its bottom edge (7.4).
 */
import type { Box } from '../types';
import { inter } from './util';

export interface Crop { dest: Box; visible: Box; D: number; ax: number; ay: number }

export function cropRule(box: Box, safe: Box): Crop {
  const visible = inter(box, safe) ?? box;
  const ax = visible.x + visible.w / 2 - box.x, ay = visible.y + visible.h / 2 - box.y;
  const D = Math.max(box.w, box.h, 2 * ax, 2 * (box.w - ax), 2 * ay, 2 * (box.h - ay));
  return { dest: { x: box.x + ax - D / 2, y: box.y + ay - D / 2, w: D, h: D }, visible, D, ax, ay };
}
export function keyPartPx(c: Crop, kp: [number, number, number, number]): Box {
  return { x: c.dest.x + kp[0] * c.D, y: c.dest.y + kp[1] * c.D, w: (kp[2] - kp[0]) * c.D, h: (kp[3] - kp[1]) * c.D };
}
export function inside(inner: Box, outer: Box, tol = 0.5): boolean {
  return inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
}
/** Fit a w×h picture whole into a box, standing on the box's bottom edge, centred. */
export function fitWhole(box: Box, w: number, h: number): Box {
  const k = Math.min(box.w / w, box.h / h);
  const dw = w * k, dh = h * k;
  return { x: box.x + (box.w - dw) / 2, y: box.y + box.h - dh, w: dw, h: dh };
}
/**
 * The scene's safe zone for generation (deviation 3): the part of the square every format shows — the
 * intersection of every window's visible part mapped back into square coordinates (0–1).
 */
export function sharedVisible(boxes: { box: Box; safe: Box }[]): [number, number, number, number] {
  let z: [number, number, number, number] = [0, 0, 1, 1];
  for (const { box, safe } of boxes) {
    const c = cropRule(box, safe);
    const v = c.visible;
    const q: [number, number, number, number] = [(v.x - c.dest.x) / c.D, (v.y - c.dest.y) / c.D, (v.x + v.w - c.dest.x) / c.D, (v.y + v.h - c.dest.y) / c.D];
    z = [Math.max(z[0], q[0]), Math.max(z[1], q[1]), Math.min(z[2], q[2]), Math.min(z[3], q[3])];
  }
  return z.map((v) => Math.round(v * 1000) / 1000) as [number, number, number, number];
}
