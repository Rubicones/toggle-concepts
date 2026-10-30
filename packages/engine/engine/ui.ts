/**
 * The `ui` layer (10): a device (phone, tablet, laptop, card) with screens built from declarative
 * components, screens changing by cues, numbers counting, parts fading, rows staggering, buttons pressed.
 * Numbers are formatted by Intl with the market's locale and currency. Charts (line, bar, ring) are shared
 * with the `graphic` layer.
 */
import type { GlyphEngine as TextEngine } from '../text-snapshot';
import type { Box, EngineConfig, Kit, NumberFormat, UiComponent, UiSpec, UiValue } from '../types';
import type { Op } from './ops';
import type { UiState } from './motion';
import { rectD, ellipseD, parseSvg } from './svg';
import { hexOf, mix } from './util';

export function formatNumber(v: number, f: NumberFormat, locale: string, currency: string, sign = false): string {
  const o: Intl.NumberFormatOptions = f === 'int' ? { maximumFractionDigits: 0 } : f === 'dec1' ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : f === 'dec2' ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : f === 'money' ? { style: 'currency', currency, maximumFractionDigits: 0, minimumFractionDigits: 0 } : f === 'money2' ? { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 } : { style: 'percent', maximumFractionDigits: 1 };
  if (sign) o.signDisplay = 'exceptZero';
  return new Intl.NumberFormat(locale, o).format(f === 'percent' ? v / 100 : v);
}

export interface UiDraw { ops: Op[]; frame: Box; screen: Box; keys: { id: string; box: Box }[]; overflow: { id: string; text: string; need: number; room: number }[]; strings: { id: string; text: string; source: 'string' | 'literal' | 'number'; lang: string }[] }

interface Ctx { engine: TextEngine; kit: Kit; cfg: EngineConfig; lang: string; el: string; spec: UiSpec; st: UiState | undefined; t: number }

/** The device's frame and screen rectangles inside the layer box. */
export function deviceGeometry(device: UiSpec['device'], box: Box, screenAspect: number): { frame: Box; screen: Box; rOuter: number; rScreen: number; base?: Box } {
  if (device === 'card') return { frame: box, screen: box, rOuter: Math.min(box.w, box.h) * 0.06, rScreen: Math.min(box.w, box.h) * 0.06 };
  if (device === 'laptop') {
    const baseH = box.h * 0.07, lid = { x: box.x + box.w * 0.08, y: box.y, w: box.w * 0.84, h: box.h - baseH };
    const bz = lid.w * 0.025;
    return { frame: lid, screen: { x: lid.x + bz, y: lid.y + bz, w: lid.w - 2 * bz, h: lid.h - 2 * bz }, rOuter: lid.w * 0.02, rScreen: 0, base: { x: box.x, y: box.y + box.h - baseH, w: box.w, h: baseH } };
  }
  const bz = box.w * (device === 'phone' ? 0.035 : 0.04);
  void screenAspect;
  return { frame: box, screen: { x: box.x + bz, y: box.y + bz, w: box.w - 2 * bz, h: box.h - 2 * bz }, rOuter: box.w * (device === 'phone' ? 0.14 : 0.06), rScreen: box.w * (device === 'phone' ? 0.11 : 0.04) };
}

function value(c: Ctx, v: UiValue): number | string {
  if (typeof v === 'object' && v && 'data' in v) { const d = c.spec.data[v.data]; return typeof d === 'number' || typeof d === 'string' ? d : String(d ?? ''); }
  return v as number | string;
}
function str(c: Ctx, key: string): { text: string; source: 'string' | 'literal' } {
  const s = c.cfg.ui_strings[key];
  if (s) return { text: s[c.lang] ?? s[Object.keys(s)[0]] ?? key, source: 'string' };
  return { text: key, source: 'literal' };
}

export function drawUi(c: Ctx, box: Box): UiDraw {
  const { kit, spec } = c;
  const U = kit.ui_kit, dark = spec.theme === 'dark';
  const g = deviceGeometry(spec.device, box, spec.screen_w / spec.screen_h);
  const ops: Op[] = [];
  const keys: UiDraw['keys'] = [], overflow: UiDraw['overflow'] = [], strings: UiDraw['strings'] = [];
  const frameCol = hexOf(kit, dark ? (U.frame_dark ?? U.frame) : U.frame);
  const screenCol = hexOf(kit, dark ? (U.screen_dark ?? U.screen) : U.screen);
  if (spec.device !== 'card') ops.push({ op: 'fill', el: c.el, path: { k: 'd', d: rectD(g.frame.x, g.frame.y, g.frame.w, g.frame.h, g.rOuter) }, fill: { t: 'color', c: frameCol } });
  if (g.base) ops.push({ op: 'fill', el: c.el, path: { k: 'd', d: rectD(g.base.x, g.base.y, g.base.w, g.base.h, [0, 0, g.base.h / 2, g.base.h / 2]) }, fill: { t: 'color', c: mix(frameCol, '#000000', 0.15) } });
  // The live screen keeps its source aspect inside any planned device window.
  const k = Math.min(g.screen.w / spec.screen_w,g.screen.h / spec.screen_h);
  g.screen={x:g.screen.x+(g.screen.w-spec.screen_w*k)/2,y:g.screen.y+(g.screen.h-spec.screen_h*k)/2,w:spec.screen_w*k,h:spec.screen_h*k};
  const screenPath = { k: 'd' as const, d: rectD(g.screen.x, g.screen.y, g.screen.w, g.screen.h, g.rScreen) };
  ops.push({ op: 'fill', el: c.el, path: screenPath, fill: { t: 'color', c: screenCol } });
  // screens: current (and the previous one during a transition)
  const cur = c.st?.screen ?? spec.screens[0]?.id;
  const prev = c.st && c.st.screenMix < 1 ? c.st.prevScreen ?? spec.screens[0]?.id : null;
  const draw = (id: string | null | undefined, alpha: number, dx: number) => {
    const sc = spec.screens.find((s) => s.id === id);
    if (!sc || alpha <= 0) return;
    ops.push({ op: 'push', m: [k, 0, 0, k, g.screen.x + dx, g.screen.y-(c.st?.scroll??0)*k], alpha, clip: undefined });
    if (sc.bg) ops.push({ op: 'fill', el: c.el, path: { k: 'rect', x: 0, y: 0, w: spec.screen_w, h: spec.screen_h }, fill: { t: 'color', c: hexOf(kit, sc.bg) } });
    for (const comp of sc.components) drawComponent(c, comp, ops, (id2, b) => keys.push({ id: id2, box: { x: g.screen.x + dx + b.x * k, y: g.screen.y + (b.y-(c.st?.scroll??0)) * k, w: b.w * k, h: b.h * k } }), overflow, strings, dark);
    ops.push({ op: 'pop' });
  };
  ops.push({ op: 'push', m: [1, 0, 0, 1, 0, 0], alpha: 1, clip: screenPath });
  if (prev && c.st) {
    const m = c.st.screenMix;
    if (c.st.transition === 'slide') { draw(prev, 1, -m * g.screen.w); draw(cur, 1, (1 - m) * g.screen.w); }
    else { draw(prev, 1 - m, 0); draw(cur, m, 0); }
  } else draw(cur, 1, 0);
  if(c.st?.cursor){const {x,y}=c.st.cursor;ops.push({op:'fill',el:`${c.el}/cursor`,path:{k:'ellipse',cx:g.screen.x+x*k,cy:g.screen.y+(y-(c.st.scroll??0))*k,rx:9*k,ry:9*k},fill:{t:'color',c:hexOf(kit,U.accent)}});}
  ops.push({ op: 'pop' });
  if (spec.device === 'phone') { const w = g.screen.w * 0.3, h = g.screen.w * 0.085; ops.push({ op: 'fill', el: c.el, path: { k: 'd', d: rectD(g.screen.x + (g.screen.w - w) / 2, g.screen.y + g.screen.w * 0.03, w, h, h / 2) }, fill: { t: 'color', c: '#000000' } }); }
  return { ops, frame: g.frame, screen: g.screen, keys, overflow, strings };
}

function textOp(c: Ctx, el: string, text: string, x: number, y: number, w: number, size: number, weight: number, color: string, align: 'left' | 'center' | 'right', ops: Op[], overflow: UiDraw['overflow'], id: string): number {
  const font = c.kit.ui_kit.font;
  const sh = c.engine.shape(font, weight, text, size);
  const px = align === 'left' ? x : align === 'right' ? x + w - sh.width : x + (w - sh.width) / 2;
  if (sh.width > w + 0.5) overflow.push({ id, text, need: Math.round(sh.width), room: Math.round(w) });
  ops.push({ op: 'glyphs', el, font, weight, size, x: px, y, glyphs: sh.glyphs, color });
  return sh.width;
}

function drawComponent(c: Ctx, comp: UiComponent, ops: Op[], key: (id: string, b: Box) => void, overflow: UiDraw['overflow'], strings: UiDraw['strings'], dark: boolean) {
  const { kit } = c, U = kit.ui_kit;
  const col = (x: string | undefined, d: string) => hexOf(kit, x ?? d);
  const txt = col(undefined, U.text), muted = col(undefined, U.muted), accent = col(undefined, U.accent), surface = col(undefined, U.surface), line = col(undefined, U.line);
  const part = c.st?.parts.get(comp.id);
  const alpha = part?.alpha ?? 1;
  const press = part?.press ?? 0;
  const el = `${c.el}/${comp.id}`;
  const locale = c.kit.markets[c.lang]?.locale ?? 'en-US', currency = c.kit.markets[c.lang]?.currency ?? 'USD';
  if (comp.key) key(comp.id, comp);
  const s = 1 - 0.06 * press;
  const cx = comp.x + comp.w / 2, cy = comp.y + comp.h / 2;
  ops.push({ op: 'push', m: [s, 0, 0, s, cx - s * cx, cy - s * cy], alpha });
  const R = U.radius;
  switch (comp.type) {
    case 'text': {
      const t = str(c, comp.text); strings.push({ id: comp.id, text: t.text, source: t.source, lang: c.lang });
      textOp(c, el, t.text, comp.x, comp.y + comp.size * 0.85, comp.w, comp.size, comp.weight, col(comp.color, U.text), comp.align ?? 'left', ops, overflow, comp.id);
      break;
    }
    case 'number': {
      const v = Number(value(c, comp.value));
      const shown = comp.from !== undefined && part?.count !== undefined ? comp.from + (v - comp.from) * part.count : v;
      const t = formatNumber(shown, comp.format, locale, currency, comp.sign);
      strings.push({ id: comp.id, text: formatNumber(v, comp.format, locale, currency, comp.sign), source: 'number', lang: c.lang });
      const rolling=part?.count!==undefined&&part.count<1&&comp.from!==undefined&&['int','percent'].includes(comp.format),fraction=shown-Math.floor(shown),baseline=comp.y+comp.size*.85;
      if(rolling&&fraction>1e-6){
       ops.push({op:'push',m:[1,0,0,1,0,0],alpha:1,clip:{k:'rect',x:comp.x,y:comp.y,w:comp.w,h:comp.h}});
       textOp(c,el,formatNumber(Math.floor(shown),comp.format,locale,currency,comp.sign),comp.x,baseline-fraction*comp.size,comp.w,comp.size,comp.weight,col(comp.color,U.text),comp.align??'left',ops,overflow,comp.id);
       textOp(c,el,formatNumber(Math.ceil(shown),comp.format,locale,currency,comp.sign),comp.x,baseline+(1-fraction)*comp.size,comp.w,comp.size,comp.weight,col(comp.color,U.text),comp.align??'left',ops,overflow,comp.id);
       ops.push({op:'pop'});
      }else textOp(c, el, t, comp.x, baseline, comp.w, comp.size, comp.weight, col(comp.color, U.text), comp.align ?? 'left', ops, overflow, comp.id);
      break;
    }
    case 'field': case 'select': {
      const style = comp.style ?? U.field_style;
      const path = { k: 'd' as const, d: rectD(comp.x, comp.y, comp.w, comp.h, R) };
      if (style === 'filled') ops.push({ op: 'fill', el, path, fill: { t: 'color', c: surface } });
      else ops.push({ op: 'stroke', el, path, color: line, width: 2 });
      const lab = str(c, comp.label); strings.push({ id: `${comp.id}.label`, text: lab.text, source: lab.source, lang: c.lang });
      const ls = comp.h * 0.2, vs = comp.h * 0.32, px = comp.h * 0.25;
      const right = (comp.stepper ? comp.h * 1.6 : 0) + (comp.chevron ? comp.h * 0.5 : 0);
      textOp(c, el, lab.text, comp.x + px, comp.y + comp.h * 0.36, comp.w - 2 * px - right, ls, 500, muted, 'left', ops, overflow, `${comp.id}.label`);
      const raw = value(c, comp.value);
      const vt = typeof raw === 'number' ? formatNumber(comp.from !== undefined && part?.count !== undefined ? comp.from + (raw - comp.from) * part.count : raw, comp.format ?? 'int', locale, currency) : str(c, String(raw)).text;
      strings.push({ id: `${comp.id}.value`, text: vt, source: typeof raw === 'number' ? 'number' : 'string', lang: c.lang });
      textOp(c, el, vt, comp.x + px, comp.y + comp.h * 0.78, comp.w - 2 * px - right, vs, 700, txt, 'left', ops, overflow, `${comp.id}.value`);
      if (comp.stepper) {
        const r = comp.h * 0.3, y = comp.y + comp.h / 2, x2 = comp.x + comp.w - px - r, x1 = x2 - r * 2.4;
        for (const [x, plus] of [[x1, false], [x2, true]] as const) {
          ops.push({ op: 'stroke', el, path: { k: 'ellipse', cx: x, cy: y, rx: r, ry: r }, color: line, width: 2 });
          ops.push({ op: 'stroke', el, path: { k: 'd', d: `M${x - r * 0.45} ${y}H${x + r * 0.45}${plus ? `M${x} ${y - r * 0.45}V${y + r * 0.45}` : ''}` }, color: txt, width: 3, cap: 'round' });
        }
      }
      if (comp.chevron) { const x = comp.x + comp.w - px, y = comp.y + comp.h / 2, a = comp.h * 0.12; ops.push({ op: 'stroke', el, path: { k: 'd', d: `M${x - a} ${y - a * 1.6}L${x} ${y}L${x - a} ${y + a * 1.6}` }, color: muted, width: 3, cap: 'round' }); }
      break;
    }
    case 'segmented': {
      ops.push({ op: 'fill', el, path: { k: 'd', d: rectD(comp.x, comp.y, comp.w, comp.h, comp.h / 2) }, fill: { t: 'color', c: surface } });
      const n = comp.options.length, w = comp.w / n, pad = comp.h * 0.08;
      const from = comp.from ?? 0;
      const act = part?.count !== undefined ? from + (comp.active - from) * part.count : comp.active;
      ops.push({ op: 'fill', el, path: { k: 'd', d: rectD(comp.x + act * w + pad, comp.y + pad, w - 2 * pad, comp.h - 2 * pad, (comp.h - 2 * pad) / 2) }, fill: { t: 'color', c: accent } });
      comp.options.forEach((o, i) => { const t = str(c, o); strings.push({ id: `${comp.id}.${i}`, text: t.text, source: t.source, lang: c.lang }); textOp(c, el, t.text, comp.x + i * w + pad * 2, comp.y + comp.h * 0.64, w - pad * 4, comp.h * 0.36, 700, i === Math.round(act) ? '#ffffff' : txt, 'center', ops, overflow, `${comp.id}.${i}`); });
      break;
    }
    case 'button': case 'chip': {
      const fill = col(comp.fill, comp.type === 'button' ? U.accent : U.surface);
      ops.push({ op: 'fill', el, path: { k: 'd', d: rectD(comp.x, comp.y, comp.w, comp.h, comp.type === 'chip' ? comp.h / 2 : Math.min(R, comp.h / 2)) }, fill: { t: 'color', c: fill } });
      const t = str(c, comp.text); strings.push({ id: comp.id, text: t.text, source: t.source, lang: c.lang });
      textOp(c, el, t.text, comp.x + comp.h * 0.3, comp.y + comp.h * 0.64, comp.w - comp.h * 0.6, comp.h * (comp.type === 'chip' ? 0.42 : 0.38), 700, col(comp.color, comp.type === 'button' ? '#ffffff' : U.text), 'center', ops, overflow, comp.id);
      break;
    }
    case 'rows': {
      const rows = (c.spec.data[comp.rows] ?? []) as Record<string, unknown>[];
      rows.forEach((row, i) => {
        const y = comp.y + i * comp.row_h;
        if (y + comp.row_h > comp.y + comp.h + 0.5) return;
        let ra = 1;
        if (part?.stagger) { const { t0, step, dur } = part.stagger; ra = Math.max(0, Math.min(1, (c.t - (t0 + i * step)) / dur)); }
        ops.push({ op: 'push', m: [1, 0, 0, 1, 0, (1 - ra) * comp.row_h * 0.3], alpha: ra });
        let x = comp.x;
        for (const colm of comp.columns) {
          const v = row[colm.key];
          const t = typeof v === 'number' ? formatNumber(v, colm.format ?? 'int', locale, currency) : str(c, String(v ?? '')).text;
          strings.push({ id: `${comp.id}.${i}.${colm.key}`, text: t, source: typeof v === 'number' ? 'number' : 'string', lang: c.lang });
          textOp(c, el, t, x, y + comp.row_h * 0.62, colm.w, comp.size, colm.key === comp.columns[0].key ? 600 : 500, colm.key === comp.columns[0].key ? txt : muted, colm.align ?? 'left', ops, overflow, `${comp.id}.${i}.${colm.key}`);
          x += colm.w;
        }
        if (i < rows.length - 1) ops.push({ op: 'fill', el, path: { k: 'rect', x: comp.x, y: y + comp.row_h - 1, w: comp.w, h: 1.5 }, fill: { t: 'color', c: line } });
        ops.push({ op: 'pop' });
      });
      break;
    }
    case 'ring': case 'bar': case 'line': {
      chartOps(el, comp.type, { x: comp.x, y: comp.y, w: comp.w, h: comp.h }, comp.type === 'line' ? (c.spec.data[comp.points] as number[] ?? []) : Number(value(c, comp.value)), comp.type === 'line' ? 0 : comp.max, col(comp.color, U.accent), col(comp.type === 'line' ? undefined : comp.track, U.surface), comp.width ?? (comp.type === 'ring' ? comp.w * 0.1 : comp.h), part?.count ?? 1, ops);
      break;
    }
    case 'tabbar': {
      ops.push({ op: 'fill', el, path: { k: 'rect', x: comp.x, y: comp.y, w: comp.w, h: comp.h }, fill: { t: 'color', c: dark ? mix(surface, '#000000', 0.3) : surface } });
      const n = comp.items.length, w = comp.w / n;
      comp.items.forEach((it, i) => {
        const on = i === comp.active, cl = on ? accent : muted, s2 = comp.h * 0.36;
        const g = c.kit.graphics[it.icon];
        if (g) ops.push({ op: 'vector', el, shape: g.shape, box: { x: comp.x + i * w + (w - s2) / 2, y: comp.y + comp.h * 0.14, w: s2, h: s2 }, color: cl, stroke: g.stroke_u ?? 2 });
        const t = str(c, it.label); strings.push({ id: `${comp.id}.${i}`, text: t.text, source: t.source, lang: c.lang });
        textOp(c, el, t.text, comp.x + i * w + 4, comp.y + comp.h * 0.86, w - 8, comp.h * 0.2, on ? 700 : 500, cl, 'center', ops, overflow, `${comp.id}.${i}`);
      });
      break;
    }
    case 'logo': {
      const L = c.kit.logos[comp.logo];
      if (L?.mode === 'as_drawn') {
        const height = L.view_box ? comp.w * L.view_box[1] / L.view_box[0] : comp.h;
        ops.push({op:'logo_image',el,logo:comp.logo,box:{x:comp.x,y:comp.y,w:comp.w,h:height}});
      } else if (L) ops.push({ op: 'vector', el, shape: parseSvg(L.svg), box: { x: comp.x, y: comp.y, w: comp.w, h: comp.h }, color: col(comp.color, U.text) });
      break;
    }
    case 'icon': {
      const g2 = c.kit.graphics[comp.icon];
      if (g2) ops.push({ op: 'vector', el, shape: g2.shape, box: { x: comp.x, y: comp.y, w: comp.w, h: comp.h }, color: col(comp.color, U.text), stroke: g2.stroke_u ?? 2 });
      break;
    }
  }
  ops.push({ op: 'pop' });
}

/** Charts from data (10): line draws itself, bar fills, ring is a gauge; `progress` 0–1 animates the draw. */
export function chartOps(el: string, kind: 'line' | 'bar' | 'ring', b: Box, data: number[] | number, max: number, color: string, track: string, width: number, progress: number, ops: Op[]) {
  if (kind === 'ring') {
    const r = Math.min(b.w, b.h) / 2 - width / 2, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ops.push({ op: 'stroke', el, path: { k: 'ellipse', cx, cy, rx: r, ry: r }, color: track, width });
    const f = Math.max(0, Math.min(1, (Number(data) / (max || 1)) * progress));
    if (f > 0) { const a0 = -Math.PI / 2, a1 = a0 + f * 2 * Math.PI * 0.9999; ops.push({ op: 'stroke', el, path: { k: 'd', d: `M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}` }, color, width, cap: 'round' }); }
  } else if (kind === 'bar' && Array.isArray(data)) {
    // a bar chart from data: columns growing from the baseline, the track behind each
    const vals = data.map(Number), hi = Math.max(max || 0, ...vals, 1e-6), n = Math.max(1, vals.length), gap = Math.min(width, b.w / n / 3), bw = (b.w - gap * (n - 1)) / n;
    vals.forEach((v, i) => {
      const x = b.x + i * (bw + gap), hgt = Math.max(0, (v / hi) * b.h * Math.max(0, Math.min(1, progress)));
      ops.push({ op: 'fill', el, path: { k: 'd', d: rectD(x, b.y, bw, b.h, Math.min(bw / 2, 8)) }, fill: { t: 'color', c: track } });
      if (hgt > 0) ops.push({ op: 'fill', el, path: { k: 'd', d: rectD(x, b.y + b.h - hgt, bw, hgt, Math.min(bw / 2, 8, hgt / 2)) }, fill: { t: 'color', c: color } });
    });
  } else if (kind === 'bar') {
    ops.push({ op: 'fill', el, path: { k: 'd', d: rectD(b.x, b.y, b.w, b.h, b.h / 2) }, fill: { t: 'color', c: track } });
    const f = Math.max(0, Math.min(1, (Number(data) / (max || 1)) * progress));
    if (f > 0) ops.push({ op: 'fill', el, path: { k: 'd', d: rectD(b.x, b.y, Math.max(b.h, b.w * f), b.h, b.h / 2) }, fill: { t: 'color', c: color } });
  } else {
    const pts = (Array.isArray(data) ? data : []).map(Number);
    if (pts.length < 2) return;
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    const P = pts.map((v, i) => [b.x + (i / (pts.length - 1)) * b.w, b.y + b.h - ((v - lo) / span) * b.h] as const);
    ops.push({ op: 'stroke', el, path: { k: 'd', d: P.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') }, color, width, cap: 'round', progress });
  }
}
export { ellipseD };
