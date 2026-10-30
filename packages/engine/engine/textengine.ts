/**
 * Text metrics and glyph outlines from the font file — one source of truth.
 *
 * HarfBuzz (harfbuzzjs, WASM; the shaper Chrome uses) shapes every line from the guide's
 * TTF. The SAME module measures in the validator, in the agents' fit_text / measure_text
 * tools and in the renderer, which draws the glyph outlines it returns instead of calling
 * canvas fillText. So a width measured on the server is the width drawn in Chrome and in
 * Safari, and font loading in the page is no longer a failure point.
 *
 * Pure TS + WebAssembly (available in Node and browsers). Font bytes are passed in by the
 * caller (Storage download on the server, fetch in the browser).
 */
type HB = typeof import('harfbuzzjs');

/** Positions are computed at upem × PREC so variable-font advances keep sub-unit precision. */
const PREC = 64;

export interface FontData { key: string; data: ArrayBuffer | Uint8Array }
export interface Glyph { gid: number; x: number; y: number }
export interface Ink { x0: number; y0: number; x1: number; y1: number }
export interface Shaped {
  /** advance width at the requested size, px */
  width: number;
  /** glyph origins relative to the pen origin (baseline, y down), px */
  glyphs: Glyph[];
  /** ink box relative to the pen origin (y down: y0 < 0 above the baseline), px */
  ink: Ink;
  size: number;
}

interface FontEntry { face: InstanceType<HB['Face']>; upem: number; fonts: Map<number, InstanceType<HB['Font']>> }
interface UnitShape { adv: number; glyphs: { gid: number; x: number; y: number }[]; ink: Ink }

let hbPromise: Promise<HB> | null = null;
function loadHb(): Promise<HB> {
  if (!hbPromise) {
    const specifier = typeof window === 'undefined' ? 'harfbuzzjs' : '/vendor/harfbuzz/index.mjs';
    hbPromise = import(/* webpackIgnore: true */ specifier) as Promise<HB>;
  }
  return hbPromise;
}

export class TextEngine {
  private hb: HB;
  private fonts: Map<string, FontEntry>;
  private subsets = new Map<string, FontEntry[]>();
  private constructor(hb: HB, fonts: Map<string, FontEntry>) { this.hb = hb; this.fonts = fonts; }
  private unitCache = new Map<string, UnitShape>();
  private pathCache = new Map<string, string>();

  static async create(fonts: FontData[]): Promise<TextEngine> {
    const hb = await loadHb();
    const map = new Map<string, FontEntry>(),subsets=new Map<string,FontEntry[]>();
    for (const f of fonts) {
      const bytes = f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data);
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const face = new hb.Face(new hb.Blob(buf));
      const entry={face,upem:face.upem,fonts:new Map<number,InstanceType<HB['Font']>>()};
      if(!map.has(f.key))map.set(f.key,entry);
      else if(map.get(f.key)!.upem!==entry.upem)throw new Error('FONT_SUBSET_UNITS_MISMATCH');
      const list=subsets.get(f.key)??[];list.push(entry);subsets.set(f.key,list);
    }
    const engine=new TextEngine(hb,map);engine.subsets=subsets;return engine;
  }

  snapshot():import('../text-snapshot').GlyphSnapshot { return {fonts:[...this.fonts].map(([key,value])=>[key,value.upem]),units:[...this.unitCache],paths:[...this.pathCache]}; }

  has(key: string): boolean { return this.fonts.has(key); }
  /** characters of `text` the font has no glyph for (.notdef) */
  missing(key: string, weight: number, text: string): string[] {
    const out: string[] = [];
    for (const ch of new Set([...text.replace(/\s/g, '')])) if (this.unit(key, weight, ch).glyphs.some((g) => g.gid === 0)) out.push(ch);
    return out;
  }

  private font(key: string, weight: number, subset=0) {
    const e = this.subsets.get(key)?.[subset]??this.fonts.get(key);
    if (!e) throw new Error(`font "${key}" is not loaded`);
    let f = e.fonts.get(weight);
    if (!f) {
      f = new this.hb.Font(e.face);
      f.setScale(e.upem * PREC, e.upem * PREC);
      const axes = e.face.getAxisInfos();
      if (axes && 'wght' in axes) f.setVariations([new this.hb.Variation('wght', weight)]);
      e.fonts.set(weight, f);
    }
    return { f, e };
  }

  /** Shape at 1 px (cached); scale linearly to any size. */
  private unit(key: string, weight: number, text: string): UnitShape {
    const ck = `${key}\u001f${weight}\u001f${text}`;
    const hit = this.unitCache.get(ck);
    if (hit) return hit;
    const fonts=(this.subsets.get(key)??[]).map((_,i)=>this.font(key,weight,i));
    if(!fonts.length)throw new Error(`font "${key}" is not loaded`);
    const runs:{subset:number;text:string}[]=[];
    for(const char of text){const found=fonts.findIndex(({f})=>!!f.nominalGlyph(char.codePointAt(0)!)),subset=found<0?0:found,last=runs.at(-1);if(last?.subset===subset)last.text+=char;else runs.push({subset,text:char});}
    let pen=0;const glyphs:UnitShape['glyphs']=[],ink:Ink={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};
    for(const run of runs){const {f,e}=fonts[run.subset],k=1/(e.upem*PREC),buf=new this.hb.Buffer();buf.addText(run.text);buf.guessSegmentProperties();this.hb.shape(f,buf);const infos=buf.getGlyphInfos(),positions=buf.getGlyphPositions();
      for(let i=0;i<infos.length;i++){const original=infos[i].codepoint,gid=original===0?0:run.subset*1048576+original,gx=pen+positions[i].xOffset*k,gy=-positions[i].yOffset*k;glyphs.push({gid,x:gx,y:gy});const ext=f.glyphExtents(original);
       if(ext&&ext.width!==0){ink.x0=Math.min(ink.x0,gx+ext.xBearing*k);ink.x1=Math.max(ink.x1,gx+(ext.xBearing+ext.width)*k);ink.y0=Math.min(ink.y0,gy-ext.yBearing*k);ink.y1=Math.max(ink.y1,gy-(ext.yBearing+ext.height)*k);}pen+=positions[i].xAdvance*k;
      }
    }
    if(!Number.isFinite(ink.x0))Object.assign(ink,{x0:0,y0:0,x1:0,y1:0});
    const u={adv:pen,glyphs,ink};
    this.unitCache.set(ck, u);
    return u;
  }

  /** Start a deterministic export snapshot without retaining unrelated previous drafts. */
  clearGlyphCache() { this.unitCache.clear(); this.pathCache.clear(); }

  shape(key: string, weight: number, text: string, size: number): Shaped {
    const u = this.unit(key, weight, text);
    return {
      width: u.adv * size,
      glyphs: u.glyphs.map((g) => ({ gid: g.gid, x: g.x * size, y: g.y * size })),
      ink: { x0: u.ink.x0 * size, y0: u.ink.y0 * size, x1: u.ink.x1 * size, y1: u.ink.y1 * size },
      size,
    };
  }

  width(key: string, weight: number, text: string, size: number): number {
    return this.unit(key, weight, text).adv * size;
  }

  /** SVG path of a glyph in font units × PREC, y up. Draw with scale(size/pathScale, −size/pathScale). */
  glyphPath(key: string, weight: number, gid: number): string {
    const ck = `${key}\u001f${weight}\u001f${gid}`;
    let p = this.pathCache.get(ck);
    if (p === undefined) { p = this.font(key, weight, Math.floor(gid/1048576)).f.glyphToPath(gid%1048576); this.pathCache.set(ck, p); }
    return p;
  }
  pathScale(key: string): number {
    const e = this.fonts.get(key);
    if (!e) throw new Error(`font "${key}" is not loaded`);
    return e.upem * PREC;
  }
}

/** Words for reading time (tools/plan_config.py words()): tokens that contain a letter or digit ("·" is not a word). */
export function readingWords(lines: string[]): number {
  return lines.join(' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}
/** Words for a word-by-word reveal (the reference engine's wordsIn): every space-separated token, "·" included. */
export function revealWords(lines: string[]): number {
  return lines.join(' ').split(' ').length;
}
