/**
 * The display list: what one frame draws, in order. The canvas renderer executes it; the frame checks
 * read the element records built alongside it. Everything in px of the format canvas.
 */
import type { Box, LayerKind, Side, StandIn, VectorShape } from '../types';
import type { Mat } from './util';

export type PathSpec =
  | { k: 'rect'; x: number; y: number; w: number; h: number; r?: number | [number, number, number, number] }
  | { k: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { k: 'd'; d: string };
export type Fill =
  | { t: 'color'; c: string }
  | { t: 'linear'; x0: number; y0: number; x1: number; y1: number; stops: [number, string][] }
  | { t: 'radial'; cx: number; cy: number; r: number; stops: [number, string][] }
  | { t: 'pattern'; shape: VectorShape; color: string; bg: string; tile: number; gap: number; rot: number }
  | { t: 'texture'; part: string; frame: number; color: string; tile: number; standin: boolean };
export type Op =
  | {op:'scene';ops:Op[];m:Mat;alpha:number;clip?:PathSpec}
  | { op: 'push'; m: Mat; alpha: number; clip?: PathSpec }
  | { op: 'pop' }
  | { op: 'fill'; el: string; path: PathSpec; fill: Fill }
  | { op: 'stroke'; el: string; path: PathSpec; color: string; width: number; cap?: 'round' | 'butt'; dash?: number[]; progress?: number }
  | { op: 'media'; el: string; part: string; media: 'picture' | 'clip' | 'frames' | 'tiles' | 'svg' | 'model'; time: number; frame: number; dest: Box; standin: StandIn | null; label: string }
  | { op: 'glyphs'; el: string; font: string; weight: number; size: number; x: number; y: number; glyphs: { gid: number; x: number; y: number }[]; color: string }
  | { op: 'logo_image'; tint?:string;el: string; logo: string; box: Box }
  | { op: 'vector'; el: string; shape: VectorShape; box: Box; color: string; stroke?: number };

/** One drawn element, as the frame checks see it (boxes after every transform). */
export interface ElRec {
  id: string;
  kind: LayerKind | 'region' | 'edge_mark';
  beat: string;
  route?: string;
  z: number;
  box: Box;
  ink: Box | null;
  bleed: Side[];
  opacity: number;
  settled: boolean;
  /** text */
  text?: { runs?:{box:Box;color:string}[];scale: number; neededScale: number; fitOk: boolean; color: string; onFill: string | null; slot: string; words: number; shownWords: number; hook: boolean };
  /** media windows and regions with media: the visible part, the key part, the upscale factor */
  media?: { part: string; standin: boolean; visible: Box; key: Box | null; upscale: number; cutout: boolean; dest: Box; time: number };
  /** devices: the frame box; UI key parts; UI texts that overflow their component */
  device?: { frame: Box; keys: { id: string; box: Box }[]; overflow: { id: string; text: string; need: number; room: number }[]; strings: { id: string; text: string; source: 'string' | 'literal' | 'number'; lang: string }[] };
  /** region area geometry at rest (edge line or shape box), for L_REGION */
  region?: { kind: 'full' | 'edge' | 'shape'; side?: Side; line?: number; box?: Box; paint: 'flat' | 'gradient' | 'pattern' | 'texture' | 'media'; color?: string };
  standin?: boolean;
  route3d?: boolean;
}
