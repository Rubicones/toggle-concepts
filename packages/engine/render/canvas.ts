/**
 * The canvas renderer (browser): executes a frame's display list on a 2D canvas. The preview, the checks
 * overlay, the render and the standalone engine page all draw through here. Stand-ins are drawn visibly
 * marked (hatched, labelled); a stand-in build cannot be rendered for delivery.
 */
import type { GlyphEngine as TextEngine } from '../text-snapshot';
import type { Box, StandIn, VectorShape } from '../types';
import type { Fill, Op, PathSpec } from '../engine/ops';
import type { Frame } from '../engine/frame';
import { rectD, ellipseD } from '../engine/svg';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type MediaEl = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement;
export interface LoadedPart { el: MediaEl | null; frames?: MediaEl[]; duration?: number }
export interface DrawDeps {
  engine: TextEngine;
  createSurface?:(w:number,h:number)=>HTMLCanvasElement|OffscreenCanvas;
  logos: Map<string, CanvasImageSource>;
  /** Shared with loadEngine().missing so render failures reach existing warnings. */
  missing: string[];
  media: Map<string, LoadedPart>;
  /** stand-in sources (sketch crops) by file */
  sketches: Map<string, MediaEl>;
}
export interface DrawOpts { overlay?: 'none' | 'safe' | 'boxes'; highlight?: { box: Box; color: string }[]; background?: string }

const paths = new Map<string, Path2D>();
function pathOf(p: PathSpec): Path2D {
  if (p.k === 'd') { let x = paths.get(p.d); if (!x) { x = new Path2D(p.d); if (paths.size > 4000) paths.clear(); paths.set(p.d, x); } return x; }
  if (p.k === 'rect') return new Path2D(rectD(p.x, p.y, p.w, p.h, p.r ?? 0));
  return new Path2D(ellipseD(p.cx, p.cy, p.rx, p.ry));
}
// Role keys repeat between brands and locale subsets. Outlines belong to a
// frozen engine instance, so switching a board cannot reuse another font's gid.
const glyphCaches = new WeakMap<TextEngine, Map<string, Path2D>>();
function glyph(engine: TextEngine, font: string, weight: number, gid: number): Path2D {
  let glyphCache=glyphCaches.get(engine);if(!glyphCache){glyphCache=new Map();glyphCaches.set(engine,glyphCache);}
  const k = `${font}:${weight}:${gid}`;
  let p = glyphCache.get(k);
  if (!p) { p = new Path2D(engine.glyphPath(font, weight, gid)); glyphCache.set(k, p); }
  return p;
}
const patternCache = new Map<string, CanvasPattern | null>();
function patternFill(g: Ctx, f: Extract<Fill, { t: 'pattern' }>): CanvasPattern | null {
  const key = JSON.stringify([f.shape.paths.map((p) => p.d), f.color, f.bg, f.tile, f.gap]);
  if (patternCache.has(key)) return patternCache.get(key)!;
  const s = Math.max(2, Math.round(f.tile + f.gap));
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(s, s) : Object.assign(document.createElement('canvas'), { width: s, height: s });
  const x = c.getContext('2d') as Ctx;
  if (f.bg && f.bg !== 'transparent') { x.fillStyle = f.bg; x.fillRect(0, 0, s, s); }
  drawVector(x, f.shape, { x: f.gap / 2, y: f.gap / 2, w: f.tile, h: f.tile }, f.color);
  const pat = g.createPattern(c as CanvasImageSource, 'repeat');
  patternCache.set(key, pat);
  return pat;
}
const noiseCache = new Map<string, CanvasPattern | null>();
function noiseTile(g: Ctx, color: string, frame: number, tile: number): CanvasPattern | null {
  const key = `${color}:${frame % 4}:${Math.round(tile)}`;
  if (noiseCache.has(key)) return noiseCache.get(key)!;
  const s = Math.max(8, Math.round(tile));
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(s, s) : Object.assign(document.createElement('canvas'), { width: s, height: s });
  const x = c.getContext('2d') as Ctx;
  x.fillStyle = color; x.fillRect(0, 0, s, s);
  let seed = 1234 + (frame % 4) * 97;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < s * 1.5; i++) { x.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)'; const r = 1 + rnd() * s * 0.04; x.fillRect(rnd() * s, rnd() * s, r, r); }
  const pat = g.createPattern(c as CanvasImageSource, 'repeat');
  noiseCache.set(key, pat);
  return pat;
}

export function drawVector(g: Ctx, shape: VectorShape, box: Box, color: string, stroke?: number) {
  const [vw, vh] = shape.view_box;
  g.save();
  g.translate(box.x, box.y);
  g.scale(box.w / vw, box.h / vh);
  for (const p of shape.paths) {
    const path = pathOf({ k: 'd', d: p.d });
    const col = (c: string | undefined) => (!c || c === 'currentColor' ? color : c.startsWith('#') ? c : color);
    if (p.fill !== undefined) { g.fillStyle = col(p.fill); g.fill(path); }
    if (p.stroke) { g.strokeStyle = col(p.stroke); g.lineWidth = stroke ?? p.width ?? 1; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(path); }
  }
  g.restore();
}

function applyFill(g: Ctx, f: Fill, deps?: DrawDeps): boolean {
  if (f.t === 'color') { g.fillStyle = f.c; return true; }
  if (f.t === 'linear' || f.t === 'radial') {
    const gr = f.t === 'linear' ? g.createLinearGradient(f.x0, f.y0, f.x1, f.y1) : g.createRadialGradient(f.cx, f.cy, 0, f.cx, f.cy, f.r);
    for (const [at, c] of f.stops) gr.addColorStop(at, c);
    g.fillStyle = gr; return true;
  }
  if (f.t === 'pattern') { const p = patternFill(g, f); if (!p) return false; g.fillStyle = p; return true; }
  // texture: generated tiles (the part's frames change by `boil`), else procedural stand-in tiles
  const m = !f.standin && deps ? deps.media.get(f.part) : undefined;
  const tile = m ? (m.frames?.length ? m.frames[f.frame % m.frames.length] : m.el) : null;
  if (tile) { const p = g.createPattern(tile as CanvasImageSource, 'repeat'); if (p) { g.fillStyle = p; return true; } }
  const p = noiseTile(g, f.color, f.frame, f.tile);
  if (!p) return false;
  g.fillStyle = p; return true;
}

function polyLength(d: string): number {
  const n = d.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  let L = 0;
  for (let i = 2; i + 1 < n.length; i += 2) L += Math.hypot(n[i] - n[i - 2], n[i + 1] - n[i - 1]);
  return L;
}

function hatch(g: Ctx, b: Box, color: string, label: string) {
  g.save();
  g.fillStyle = color; g.fillRect(b.x, b.y, b.w, b.h);
  g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 6;
  for (let x = -b.h; x < b.w; x += 40) { g.beginPath(); g.moveTo(b.x + x, b.y + b.h); g.lineTo(b.x + x + b.h, b.y); g.stroke(); }
  g.restore();
  g.save();
  const fs = Math.max(16, Math.min(34, b.w / 18));
  g.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`STAND-IN · ${label}`, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.9);
  g.restore();
}

function drawStandIn(g: Ctx, s: StandIn, dest: Box, label: string, deps: DrawDeps) {
  if (s.kind === 'sketch_area' || s.kind === 'still') {
    const img = deps.sketches.get(s.file);
    if (img) {
      if (s.kind === 'still') g.drawImage(img as CanvasImageSource, dest.x, dest.y, dest.w, dest.h);
      else g.drawImage(img as CanvasImageSource, s.crop.x, s.crop.y, s.crop.w, s.crop.h, dest.x, dest.y, dest.w, dest.h);
      g.save(); g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(dest.x, dest.y, dest.w, dest.h); g.restore();
      g.save(); const fs = Math.max(14, Math.min(26, dest.w / 24)); g.font = `700 ${fs}px ui-sans-serif, system-ui`; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(`STAND-IN · ${label}`, dest.x + 24, dest.y + dest.h - 24); g.restore();
      return;
    }
    hatch(g, dest, '#6b6b6b', label);
    return;
  }
  if (s.kind === 'schematic') {
    // the picture fitted inside the window (contain, centred) on the kit ground; marked as a sketch
    g.save();
    g.beginPath(); g.rect(dest.x, dest.y, dest.w, dest.h); g.clip();
    g.fillStyle = s.bg; g.fillRect(dest.x, dest.y, dest.w, dest.h);
    const [vw, vh] = s.shape.view_box;
    const k = Math.min(dest.w / vw, dest.h / vh), w = vw * k, h = vh * k;
    drawVector(g, s.shape, { x: dest.x + (dest.w - w) / 2, y: dest.y + (dest.h - h) / 2, w, h }, s.bg);
    const fs = Math.max(12, Math.min(22, dest.w / 28));
    g.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`; g.fillStyle = 'rgba(0,0,0,.45)'; g.textBaseline = 'bottom';
    g.fillText(`SKETCH · ${s.label ?? label}`, dest.x + fs, dest.y + dest.h - fs * 0.6, dest.w - 2 * fs);
    g.restore();
    return;
  }
  hatch(g, dest, s.kind === 'procedural' || s.kind === 'flat3d' ? s.color : '#6b6b6b', 'label' in s && s.label ? s.label : label);
}

export function drawFrame(g: Ctx, f: Frame, deps: DrawDeps, opts: DrawOpts = {}) {
  const { w, h } = f.fmt;
  if (g.canvas.width !== w || g.canvas.height !== h) { g.canvas.width = w; g.canvas.height = h; }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = opts.background ?? '#000000';
  g.fillRect(0, 0, w, h);
  const stack: number[] = [];
  let alpha = 1;
  for (const op of f.ops) execute(g, op);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  if (opts.overlay === 'safe' || opts.overlay === 'boxes') drawSafe(g, f);
  if (opts.overlay === 'boxes') for (const e of f.els) {
    if (e.opacity <= 0.01 || e.kind === 'region') continue;
    const b = e.ink ?? e.box;
    g.save(); g.strokeStyle = 'rgba(80,200,255,.9)'; g.lineWidth = 2; g.setLineDash([8, 6]); g.strokeRect(b.x, b.y, b.w, b.h);
    if (e.media?.key) { g.strokeStyle = 'rgba(255,220,0,.95)'; g.setLineDash([]); g.strokeRect(e.media.key.x, e.media.key.y, e.media.key.w, e.media.key.h); }
    g.restore();
  }
  for (const hl of opts.highlight ?? []) { g.save(); g.strokeStyle = hl.color; g.lineWidth = 5; g.strokeRect(hl.box.x, hl.box.y, hl.box.w, hl.box.h); g.fillStyle = hl.color.replace(/[\d.]+\)$/, '0.15)'); g.fillRect(hl.box.x, hl.box.y, hl.box.w, hl.box.h); g.restore(); }

  function execute(gg: Ctx, op: Op) {
    switch (op.op) {
      case 'scene': {
        const surface=deps.createSurface?.(w,h)??(typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h})),context=surface.getContext('2d') as Ctx;
        const savedAlpha=alpha;alpha=1;
        for(const nested of op.ops)execute(context,nested);
        alpha=savedAlpha;gg.save();gg.globalAlpha=alpha*op.alpha;
        if(op.clip)gg.clip(pathOf(op.clip));gg.transform(...op.m);gg.drawImage(surface as CanvasImageSource,0,0);gg.restore();break;
      }
      case 'push': {
        gg.save(); stack.push(alpha);
        gg.transform(op.m[0], op.m[1], op.m[2], op.m[3], op.m[4], op.m[5]);
        alpha *= op.alpha; gg.globalAlpha = alpha;
        if (op.clip) gg.clip(pathOf(op.clip));
        break;
      }
      case 'pop': gg.restore(); alpha = stack.pop() ?? 1; gg.globalAlpha = alpha; break;
      case 'fill': if (applyFill(gg, op.fill, deps)) gg.fill(pathOf(op.path)); break;
      case 'stroke': {
        gg.save();
        gg.strokeStyle = op.color; gg.lineWidth = op.width; gg.lineCap = op.cap ?? 'butt'; gg.lineJoin = 'round';
        if (op.progress !== undefined && op.progress < 1 && op.path.k === 'd') { const L = polyLength(op.path.d); gg.setLineDash([L * Math.max(0, op.progress), L + 1]); }
        else if (op.dash) gg.setLineDash(op.dash);
        gg.stroke(pathOf(op.path));
        gg.restore();
        break;
      }
      case 'glyphs': {
        gg.save(); gg.fillStyle = op.color;
        const S = deps.engine.pathScale(op.font), k = op.size / S;
        for (const gl of op.glyphs) { gg.save(); gg.translate(op.x + gl.x, op.y + gl.y); gg.scale(k, -k); gg.fill(glyph(deps.engine, op.font, op.weight, gl.gid)); gg.restore(); }
        gg.restore();
        break;
      }
      case 'logo_image': {
        const logo = deps.logos.get(op.logo);
        if(logo&&op.tint){const W=Math.max(1,Math.ceil(op.box.w)),H=Math.max(1,Math.ceil(op.box.h)),surface=deps.createSurface?.(W,H)??(typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(W,H):Object.assign(document.createElement('canvas'),{width:W,height:H})),context=surface.getContext('2d') as Ctx;context.drawImage(logo,0,0,W,H);context.globalCompositeOperation='source-in';context.fillStyle=op.tint;context.fillRect(0,0,W,H);gg.drawImage(surface as CanvasImageSource,op.box.x,op.box.y,op.box.w,op.box.h);}
        else if (logo) gg.drawImage(logo, op.box.x, op.box.y, op.box.w, op.box.h);
        else { const warning = `logo ${op.logo}: image missing`; if (!deps.missing.includes(warning)) deps.missing.push(warning); }
        break;
      }
      case 'vector': drawVector(gg, op.shape, op.box, op.color, op.stroke); break;
      case 'media': {
        if (op.standin) { drawStandIn(gg, op.standin, op.dest, op.label, deps); break; }
        const m = deps.media.get(op.part);
        const el = op.media === 'frames' ? m?.frames?.[op.frame % Math.max(1, m.frames.length)] : m?.el;
        if (!el) { hatch(gg, op.dest, '#3a3a3a', `${op.label} (loading)`); break; }
        if (typeof HTMLVideoElement!=='undefined' && el instanceof HTMLVideoElement && (el.readyState < 2 || !el.videoWidth)) { hatch(gg, op.dest, '#3a3a3a', `${op.label} (loading)`); break; }
        gg.drawImage(el as CanvasImageSource, op.dest.x, op.dest.y, op.dest.w, op.dest.h);
        break;
      }
    }
  }
}

function drawSafe(g: Ctx, f: Frame) {
  const { w: W, h: H, safe: s } = f.fmt;
  if (!s.top && !s.right && !s.bottom && !s.left) return;
  g.save();
  g.fillStyle = 'rgba(20,24,40,.42)';
  g.fillRect(0, 0, W, s.top); g.fillRect(0, H - s.bottom, W, s.bottom);
  g.fillRect(W - s.right, s.top, s.right, H - s.top - s.bottom); g.fillRect(0, s.top, s.left, H - s.top - s.bottom);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.setLineDash([14, 10]); g.lineWidth = 3;
  g.strokeRect(s.left, s.top, W - s.left - s.right, H - s.top - s.bottom);
  g.restore();
}

/** Seek every clip the frame shows to its exact time and wait until the frame is decoded (render, checks). */
export async function seekFrame(f: Frame, deps: DrawDeps, maxWaitMs = 20000): Promise<void> {
  const jobs: Promise<void>[] = [];
  const flatten=(ops:Op[]):Op[]=>ops.flatMap(op=>op.op==='scene'?flatten(op.ops):[op]);
  for (const op of flatten(f.ops)) if (op.op === 'media' && !op.standin) {
    const el = deps.media.get(op.part)?.el;
    if (typeof HTMLVideoElement!=='undefined' && el instanceof HTMLVideoElement) jobs.push(seekTo(el, Math.max(0, Math.min(op.time, (el.duration || 1e9) - 0.02)), maxWaitMs));
  }
  await Promise.all(jobs);
}
export async function seekTo(v: HTMLVideoElement, t: number, maxWaitMs = 20000): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxWaitMs) {
    if (Math.abs(v.currentTime - t) < 0.0005 && v.readyState >= 2 && !v.seeking) return;
    if (!v.seeking) v.currentTime = t;
    await new Promise<void>((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; clearTimeout(to); v.removeEventListener('seeked', fin); v.removeEventListener('canplay', fin); res(); };
      const to = setTimeout(fin, 500);
      v.addEventListener('seeked', fin); v.addEventListener('canplay', fin);
    });
  }
  throw new Error(`seek to ${t.toFixed(3)} s did not complete in ${maxWaitMs / 1000} s`);
}
