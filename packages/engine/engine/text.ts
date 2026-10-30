/**
 * Text layout (7.4, 10): kit styles with case and tracking; treatments (plain, plaque, box, button,
 * highlight, underline, link) with *emphasis*; fitting to the maximum width down to the kit's minimum
 * scale (below it the block still fits, and L_TEXT_FIT is reported). Words are shaped one by one with
 * HarfBuzz, so type_on can show a word count and ink boxes are exact.
 *
 * Line model (as the reference engine): line i's box starts at top + i·pitch, has height line_box,
 * baseline at `baseline` em below the box top; the block height is (n−1)·pitch + line_box.
 */
import type { GlyphEngine as TextEngine } from '../text-snapshot';
import type { Box, Kit, KitStyle, Treatment } from '../types';
import { hexOf } from './util';

export interface Word { text: string; emph: boolean; x: number; w: number; glyphs: { gid: number; x: number; y: number }[]; ink: Box; index: number }
export interface Line { words: Word[]; x: number; top: number; baseline: number; width: number; box: Box }
export interface TreatRect { box: Box; fill: string; radius: number; kind: 'plaque' | 'box' | 'button' | 'highlight' | 'underline'; line?: number; emphasis?: boolean }
export interface TextBlock {
  font: string; weight: number; size: number; scale: number; fitOk: boolean; neededScale: number;
  color: string; emphColor: string | null;
  lines: Line[]; rects: TreatRect[];
  /** layout box (line boxes + treatment pads) and ink box (glyph outlines) */
  box: Box; ink: Box | null; words: number;
}
export interface TextOpts { box: Box; align: 'left' | 'center' | 'right'; v_anchor: 'top' | 'middle' | 'bottom'; join?: boolean; fmtUnitScale: number; minScale: number; color: string; treatment: Treatment; fill?: string }

/** "Get *paid* now" → runs; asterisks removed. */
export function parseEmphasis(line: string): { text: string; emph: boolean }[] {
  const out: { text: string; emph: boolean }[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), emph: false });
    out.push({ text: m[1], emph: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), emph: false });
  return out.length ? out : [{ text: '', emph: false }];
}
export const stripEmphasis = (s: string) => s.replace(/\*([^*]+)\*/g, '$1');
function applyCase(s: string, c: KitStyle['case']): string {
  if (c === 'upper') return s.toUpperCase();
  if (c === 'lower') return s.toLowerCase();
  if (c === 'title') return s.replace(/\b\p{L}/gu, (x) => x.toUpperCase());
  return s;
}

interface Tok { text: string; emph: boolean; space: boolean }
function tokens(line: string, c: KitStyle['case']): Tok[] {
  const out: Tok[] = [];
  for (const r of parseEmphasis(line)) for (const part of applyCase(r.text, c).split(/(\s+)/)) if (part) out.push({ text: part, emph: r.emph, space: /^\s+$/.test(part) });
  return out;
}

/** Natural width of a line at 1 px size (tracking included). */
function lineWidth1(engine: TextEngine, st: KitStyle, toks: Tok[]): number {
  let w = 0;
  for (const t of toks) w += engine.width(st.font, st.weight, t.text, 1) + st.tracking * [...t.text].length;
  return w;
}

export function treatmentPads(tr: Treatment): { l: number; r: number; t: number; b: number } {
  if (tr.kind === 'plaque' || tr.kind === 'box' || tr.kind === 'button') return { t: tr.pad[0], r: tr.pad[1], b: tr.pad[2], l: tr.pad[3] };
  return { l: 0, r: 0, t: 0, b: 0 };
}

export function layoutText(engine: TextEngine, kit: Kit, style: KitStyle, rawLines: string[], o: TextOpts, wordsShown = Infinity, drawProgress = 1): TextBlock {
  const lines0 = o.join ? [rawLines.join(' ')] : rawLines;
  const toks = lines0.map((l) => tokens(l, style.case));
  const tr = o.treatment;
  const pad = treatmentPads(tr);
  const base = style.size * o.fmtUnitScale;
  const widest1 = Math.max(0.0001, ...toks.map((t) => lineWidth1(engine, style, t) + pad.l + pad.r));
  const needed = Math.min(1, o.box.w / (widest1 * base));
  const scale = needed;
  const size = Math.round(base * scale * 100) / 100;
  const pitch = style.pitch * size, lbox = (style.line_box ?? style.pitch) * size, bl = (style.baseline ?? 0.8) * size;
  const n = toks.length;
  const blockH = (n - 1) * pitch + lbox + (tr.kind === 'box' || tr.kind === 'button' ? (pad.t + pad.b) * size : 0);
  const y0 = (o.v_anchor === 'top' ? o.box.y : o.v_anchor === 'bottom' ? o.box.y + o.box.h - blockH : o.box.y + (o.box.h - blockH) / 2) + (tr.kind === 'box' || tr.kind === 'button' ? pad.t * size : 0);
  const lines: Line[] = [];
  let wi = 0, shownLeft = wordsShown;
  for (let i = 0; i < n; i++) {
    const w1 = lineWidth1(engine, style, toks[i]) * size;
    const x = o.align === 'left' ? o.box.x + pad.l * size : o.align === 'right' ? o.box.x + o.box.w - w1 - pad.r * size : o.box.x + (o.box.w - w1) / 2;
    const top = y0 + i * pitch, baseline = top + bl;
    const words: Word[] = [];
    let pen = x;
    for (const t of toks[i]) {
      const adv = engine.width(style.font, style.weight, t.text, size) + style.tracking * size * [...t.text].length;
      if (!t.space) {
        const sh = engine.shape(style.font, style.weight, t.text, size);
        let extra = 0;
        const glyphs = sh.glyphs.map((g) => { const out = { gid: g.gid, x: g.x + extra, y: g.y }; extra += style.tracking * size; return out; });
        const visible = shownLeft > 0;
        if (visible) words.push({ text: t.text, emph: t.emph, x: pen, w: adv, glyphs, ink: { x: pen + sh.ink.x0, y: baseline + sh.ink.y0, w: sh.ink.x1 - sh.ink.x0 + extra, h: sh.ink.y1 - sh.ink.y0 }, index: wi });
        wi++; shownLeft--;
      }
      pen += adv;
    }
    lines.push({ words, x, top, baseline, width: w1, box: { x: x - pad.l * size, y: top, w: w1 + (pad.l + pad.r) * size, h: lbox } });
  }
  // treatments
  const rects: TreatRect[] = [];
  const color = tr.kind === 'plaque' || tr.kind === 'box' || tr.kind === 'button' ? hexOf(kit, tr.on) : o.color;
  let emphColor: string | null = null;
  if (tr.kind === 'plaque') {
    lines.forEach((L, i) => {
      if (!L.words.length) return;
      const shownW = L.words[L.words.length - 1].x + L.words[L.words.length - 1].w - L.x;
      rects.push({ kind: 'plaque', line: i, box: { x: L.x - pad.l * size, y: L.top + (lbox - (tr.height ?? style.line_box ?? style.pitch) * size) / 2, w: shownW + (pad.l + pad.r) * size, h: (tr.height ?? style.line_box ?? style.pitch) * size }, fill: hexOf(kit, o.fill ?? tr.fill), radius: (tr.radius ?? 0) * size });
    });
  } else if (tr.kind === 'box' || tr.kind === 'button') {
    const vis = lines.filter((L) => L.words.length);
    if (vis.length) {
      const x0 = Math.min(...lines.map((L) => L.box.x)), x1 = Math.max(...lines.map((L) => L.box.x + L.box.w));
      const top = lines[0].top - pad.t * size, bot = lines[n - 1].top + lbox + pad.b * size;
      const h = bot - top;
      rects.push({ kind: tr.kind, box: { x: x0, y: top, w: x1 - x0, h }, fill: hexOf(kit, o.fill ?? tr.fill), radius: tr.kind === 'button' && tr.radius === 'pill' ? h / 2 : (typeof tr.radius === 'number' ? tr.radius : 0) * size });
    }
  } else if (tr.kind === 'highlight' || tr.kind === 'underline') {
    // emphasis marks drawn left to right in reading order; drawProgress 0–1 of their total length
    const em = lines.flatMap((L, i) => L.words.filter((w) => w.emph).map((w) => ({ w, L, i })));
    const total = em.reduce((s, e) => s + e.w.w, 0);
    let left = total * Math.max(0, Math.min(1, drawProgress));
    for (const { w, L, i } of em) {
      if (left <= 0) break;
      const ww = Math.min(w.w, left); left -= ww;
      if (tr.kind === 'highlight') rects.push({ kind: 'highlight', emphasis: true, line: i, box: { x: w.x - tr.pad[0] * size, y: L.baseline + tr.offset * size - tr.height * size, w: ww + (ww >= w.w ? 2 : 1) * tr.pad[0] * size, h: tr.height * size }, fill: hexOf(kit, tr.fill), radius: 0 });
      else rects.push({ kind: 'underline', emphasis: true, line: i, box: { x: w.x, y: L.baseline + tr.offset * size, w: ww, h: tr.thickness * size }, fill: hexOf(kit, tr.color), radius: 0 });
    }
    // the word takes the marker's text colour once the marker is under it; before that it keeps the line's colour
    // (a word in the marker's ink on the bare field may be invisible: teal on teal)
    if (tr.kind === 'highlight' && tr.on && drawProgress >= 1 - 1e-6) emphColor = hexOf(kit, tr.on);
  } else if (tr.kind === 'link') emphColor = hexOf(kit, tr.color);
  const allWords = lines.flatMap((L) => L.words);
  const inks = allWords.filter((w) => w.ink.w > 0).map((w) => w.ink);
  const layoutBoxes = [...lines.map((L) => L.box), ...rects.map((r) => r.box)];
  const bx0 = Math.min(...layoutBoxes.map((b) => b.x)), by0 = Math.min(...layoutBoxes.map((b) => b.y));
  const bx1 = Math.max(...layoutBoxes.map((b) => b.x + b.w)), by1 = Math.max(...layoutBoxes.map((b) => b.y + b.h));
  const ink = inks.length ? { x: Math.min(...inks.map((b) => b.x)), y: Math.min(...inks.map((b) => b.y)), w: Math.max(...inks.map((b) => b.x + b.w)) - Math.min(...inks.map((b) => b.x)), h: Math.max(...inks.map((b) => b.y + b.h)) - Math.min(...inks.map((b) => b.y)) } : null;
  return { font: style.font, weight: style.weight, size, scale, neededScale: needed, fitOk: needed >= o.minScale - 1e-6, color, emphColor, lines, rects, box: { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }, ink, words: wi };
}

/** Words that type_on reveals (tokens that contain a letter or digit). */
export function wordCount(lines: string[]): number {
  return lines.map(stripEmphasis).join(' ').split(/\s+/).filter((w) => w.length > 0).length;
}
/** Words on screen for the reading rule (7.6). */
export function readingWordCount(lines: string[]): number {
  return lines.map(stripEmphasis).join(' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
