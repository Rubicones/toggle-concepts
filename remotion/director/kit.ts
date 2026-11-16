// Engine kit: neutral mechanics for a draft's Frame.tsx. It measures and computes; it never decides how a frame looks.
// No layouts, components, colours, spacing or type choices live here: everything visible is the designer's.
// Copied into each draft workspace as ./kit (read-only), next to ./brand (designerVersion 3).
import {createElement, useEffect, useState, type ReactNode} from 'react';
import {continueRender, delayRender} from 'remotion';

/* ---------- the frame ---------- */

export type Shape = 'square' | 'portrait' | 'tall' | 'wide';
export type Stage = {
  W: number; H: number;
  /** One hundredth of the shorter side: express sizes as multiples of it and the design scales as one object. */
  u: number;
  shape: Shape;
  /** A value per shape; `base` answers for every shape not named. */
  pick: <T>(byShape: Partial<Record<Shape, T>> & {base: T}) => T;
  /** Linear interpolation by the frame's proportion: 0 at a 9:16 frame, 1 at a 16:9 frame. */
  byRatio: (atTall: number, atWide: number) => number;
};
export function stage(width: number, height: number): Stage {
  const r = width / height, shape: Shape = r > 1.2 ? 'wide' : r > 0.9 ? 'square' : r > 0.7 ? 'portrait' : 'tall';
  const t = Math.min(1, Math.max(0, (r - 9 / 16) / (16 / 9 - 9 / 16)));
  return {W: width, H: height, u: Math.min(width, height) / 100, shape, pick: by => (shape in by ? by[shape]! : by.base), byRatio: (a, b) => a + (b - a) * t};
}

/* ---------- text ---------- */

export type TypeSpec = {family: string; weight?: number | string; italic?: boolean; /** letter spacing in em */ tracking?: number; uppercase?: boolean; /** BCP 47 tag: capitals follow the language's rules. */ locale?: string};
export type Measure = (text: string, type: TypeSpec, size: number) => number;

let canvas: CanvasRenderingContext2D | null | undefined;
/** Width of one line in px, measured with the real font (after the brand fonts have loaded). */
export const measure: Measure = (text, type, size) => {
  if (canvas === undefined) canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  const shown = type.uppercase ? text.toLocaleUpperCase(type.locale) : text;
  if (!canvas) return shown.length * size * 0.55;
  canvas.font = `${type.italic ? 'italic ' : ''}${type.weight ?? 400} ${size}px "${type.family}"`;
  return canvas.measureText(shown).width + (type.tracking ?? 0) * size * shown.length;
};

const SHORT = 3; // a line should not end on a word this short (articles, prepositions) when another break exists
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
/** Every way to split words into exactly n lines, scored: even widths, no lonely short last word, no dangling short word. */
function bestBreak(list: string[], n: number, width: (line: string) => number): string[] {
  if (n <= 1 || list.length <= 1) return [list.join(' ')];
  let best: string[] | undefined, bestScore = Infinity;
  const walk = (start: number, left: number, lines: string[]) => {
    if (left === 1) {
      const all = [...lines, list.slice(start).join(' ')], ws = all.map(width), widest = Math.max(...ws);
      let score = ws.reduce((s, w) => s + (widest - w) ** 2, 0) / (widest * widest || 1);
      all.forEach((line, i) => {
        const parts = words(line), last = parts[parts.length - 1] ?? '';
        if (i < all.length - 1 && last.replace(/[^\p{L}\p{N}]/gu, '').length <= SHORT && parts.length > 1) score += 0.6;
        if (i === all.length - 1 && parts.length === 1 && line.length <= 5 && all.length > 1) score += 0.8;
      });
      if (score < bestScore) { bestScore = score; best = all; }
      return;
    }
    for (let end = start + 1; end <= list.length - (left - 1); end++) walk(end, left - 1, [...lines, list.slice(start, end).join(' ')]);
  };
  walk(0, n, []);
  return best ?? [list.join(' ')];
}

export type Fit = {
  /** The font size that fits, in px. */ size: number;
  lines: string[];
  /** Measured width of each line at `size`: use it for per-line shapes that hug the words. */ widths: number[];
  width: number; height: number;
  /** False when even the smallest allowed size does not fit: change the composition, never clip. */ fits: boolean;
};
/**
 * Fit words into a box. A string is broken into lines by sense (never inside a word); an array keeps its lines as
 * given. The size is the largest between `max` and `min` at which every line fits the width (and the block fits the
 * height, when given). Text decides its own size inside the limits you set.
 */
export function fitText(
  text: string | readonly string[],
  box: {width: number; height?: number; maxLines?: number},
  type: TypeSpec & {max: number; min: number; lineHeight?: number},
  measureWith: Measure = measure,
): Fit {
  const leading = type.lineHeight ?? 1.1, fixed = typeof text === 'string' ? null : [...text];
  const list = fixed ? [] : words(text as string), maxLines = fixed ? fixed.length : Math.max(1, Math.min(box.maxLines ?? 3, list.length || 1));
  const at = (size: number, lines: string[]) => { const widths = lines.map(l => measureWith(l, type, size)); return {size, lines, widths, width: Math.max(0, ...widths), height: lines.length * size * leading}; };
  const ok = (f: {width: number; height: number}) => f.width <= box.width + 0.5 && (box.height === undefined || f.height <= box.height + 0.5);
  let fallback: Fit | undefined;
  // Fewer lines at a larger size first; more lines only when they allow a larger size than fewer lines did.
  let best: Fit | undefined;
  for (let n = fixed ? maxLines : 1; n <= maxLines; n++) {
    const lines = fixed ?? bestBreak(list, n, l => measureWith(l, type, type.max));
    const probe = at(type.max, lines), scale = Math.min(1, box.width / (probe.width || 1), box.height === undefined ? 1 : box.height / (probe.height || 1));
    const size = Math.max(type.min, Math.floor(type.max * scale * 2) / 2), f = at(size, lines), fit: Fit = {...f, fits: ok(f)};
    if (fit.fits && (!best || fit.size > best.size * 1.08)) best = fit;
    if (!fallback || f.width < fallback.width) fallback = fit;
    if (best && best.size >= type.max) break;
  }
  return best ?? fallback!;
}

/* ---------- the selected variation ---------- */

type VariantLike = {id: string; format: string; locale: string; hook: string; cta: string; length: number};
type FactsLike = Record<string, {sceneCopy: Record<string, readonly string[]>} | undefined>;
/**
 * The approved words of the selected variation: `lines(sceneId)` for a scene, and the variation itself. Words are
 * data: read them here by the props, never type them into the layout.
 */
export function selected(
  props: {format: string; locale: string; hook: string; cta: string; length: number},
  data: {variants: readonly VariantLike[]; variantFacts: FactsLike},
) {
  const same = (v: VariantLike, keys: (keyof VariantLike)[]) => keys.every(k => String(v[k]) === String(props[k as keyof typeof props]));
  // The exact combination, else the same words in another format, else the closest ordered combination.
  const variant = data.variants.find(v => same(v, ['format', 'locale', 'hook', 'cta', 'length']))
    ?? data.variants.find(v => same(v, ['locale', 'hook', 'cta', 'length']))
    ?? data.variants.find(v => same(v, ['locale', 'hook']))
    ?? data.variants.find(v => same(v, ['locale']))
    ?? data.variants[0];
  const facts = variant ? data.variantFacts[variant.id] : undefined;
  return {variant, lines: (sceneId: string): string[] => [...(facts?.sceneCopy[sceneId] ?? [])]};
}

/* ---------- colour ---------- */

const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (hex: string) => { const h = hex.replace('#', ''), f = h.length === 3 ? h.split('').map(c => c + c).join('') : h; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)); };
/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string) { const l = (hex: string) => { const [r, g, bl] = rgb(hex).map(channel); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; }; const x = l(a), y = l(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/** Of the candidates, the colour that reads best on a ground. */
export function readableOn(ground: string, candidates: readonly string[]) { return [...candidates].sort((a, b) => contrast(b, ground) - contrast(a, ground))[0]; }

/* ---------- fonts ---------- */

/**
 * Re-renders once the brand fonts are loaded, so measurements use the real font; the render waits for it.
 * Call it once at the top of Frame.
 */
export function useFonts() {
  const [ready, setReady] = useState(typeof document === 'undefined' || document.fonts.status === 'loaded');
  const [handle] = useState(() => (ready ? null : delayRender('kit fonts')));
  useEffect(() => {
    let live = true;
    document.fonts.ready.then(() => { if (live) setReady(true); if (handle !== null) continueRender(handle); });
    return () => { live = false; };
  }, [handle]);
  return ready;
}

/* ---------- content on a measured surface ---------- */

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point];
export type Box = {left: number; top: number; width: number; height: number};

/**
 * Where a picture's whole rectangle lies, in frame px, when it is shown in `area` the way CSS object-fit and
 * object-position show it (`position` in fractions, [0.5, 0.5] is the middle). With 'cover' the box is larger than the
 * area and partly outside it. This is the `box` that surface corners are fractions of.
 */
export function pictureBox(picture: {width: number; height: number}, area: Box, fit: 'cover' | 'contain' | 'fill' = 'cover', position: Point = [0.5, 0.5]): Box {
  if (fit === 'fill') return {...area};
  const sx = area.width / picture.width, sy = area.height / picture.height, s = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  const width = picture.width * s, height = picture.height * s;
  return {left: area.left + (area.width - width) * position[0], top: area.top + (area.height - height) * position[1], width, height};
}

/**
 * The projective transform that carries the rectangle 0,0 – width,height onto a quadrilateral given in px as top-left,
 * top-right, bottom-right, bottom-left. Returned as the 16 numbers of a CSS matrix3d (column by column), for an
 * element whose transform-origin is its top-left corner.
 */
export function homography(width: number, height: number, quad: Quad): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-12, g = (sx * dy2 - dx2 * sy) / den, h = (dx1 * sy - sx * dy1) / den;
  // Unit square to quad (Heckbert), then the rectangle's own size divided out.
  const a = (x1 - x0 + g * x1) / width, b = (x3 - x0 + h * x3) / height, d = (y1 - y0 + g * y1) / width, e = (y3 - y0 + h * y3) / height;
  return [a, d, 0, g / width, b, e, 0, h / height, 0, 0, 1, 0, x0, y0, 0, 1];
}

/**
 * Sets content on a plain face measured in a picture (resources[id].image.surfaces): the children are laid out in
 * their own `width`×`height` px and carried onto the face's four corners, in its perspective. `corners` are the
 * surface's corners (fractions of the picture); `box` is where the whole picture lies in frame px (see pictureBox).
 * `blend: 'multiply'` (the default) lets the photographed face's own light and shading show through the content;
 * 'normal' covers it. `mirror` flips the content sideways first, for a face seen in a mirror or glass. Place it in
 * the same positioned parent as the picture, after it; what the content is and how it looks is the designer's.
 */
export function OnSurface(props: {corners: Quad; box: Box; width: number; height: number; blend?: 'multiply' | 'normal'; mirror?: boolean | 'down'; opacity?: number; children?: ReactNode}) {
  const {corners, box, width, height, blend = 'multiply', mirror = false, opacity = 1, children} = props;
  const px = corners.map(([x, y]): Point => [box.left + x * box.width, box.top + y * box.height]) as Quad;
  // 'down': a reflection below the face (a floor, a tabletop) is the content turned top to bottom.
  const quad: Quad = mirror === 'down' ? [px[3], px[2], px[1], px[0]] : mirror ? [px[1], px[0], px[3], px[2]] : px;
  return createElement('div', {
    'data-on-surface': mirror === 'down' ? 'mirror-down' : mirror ? 'mirror' : 'direct',
    style: {position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden', transformOrigin: '0 0', transform: `matrix3d(${homography(width, height, quad).map(v => +v.toFixed(10)).join(',')})`, mixBlendMode: blend, opacity},
  }, children);
}
