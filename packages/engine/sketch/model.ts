/**
 * The measured frame model of one beat (spec 6.4 output; deviation 2). Written by the sketch reader, corrected
 * at the Frame model review gate (every save is a new version), read by the planner — only when reviewed.
 * Boxes in sketch px (the master format at 1080 px short side).
 */
import type { Box, Side } from '../types';

export type FMKind = 'text' | 'logo' | 'mark' | 'graphic' | 'window' | 'device' | 'object';
export const FM_KINDS: FMKind[] = ['text', 'logo', 'mark', 'graphic', 'window', 'device', 'object'];

export interface FMRegion {
  id: string;
  /** scenario region layer id (panel, field, …) */
  legend: string | null;
  kind: 'full' | 'edge' | 'shape';
  /** kit colour name, or 'content' (a picture / clip goes here) */
  paint: string;
  side?: Side;
  /** px from `side` to the edge line */
  depth?: number;
  box: Box;
  /** the brand edge mark (tongue) protruding from the edge into this region: `at` px along the edge from its start (left / top) */
  mark?: { name: string | null; at: number; length: number; depth: number; radius: number };
  /** shape regions: the outline (default round) */
  shape?: 'rect' | 'round' | 'circle' | 'arch';
  radius?: number;
  z: number;
  measured: boolean;
}
export interface FMText { lines: Box[]; size: number; style: string | null; treatment: string | null; color: string | null; align: 'left' | 'center' | 'right'; words?: string }
export interface FMElement {
  id: string;
  kind: FMKind;
  /** scenario layer id this element is */
  legend: string | null;
  box: Box;
  /** the box before snapping (as measured) */
  raw: Box;
  z: number;
  text?: FMText;
  logo?: string | null;
  mark?: string | null;
  bleed?: Side[];
  color?: string | null;
  /** measured by code from pixels (true) or only the vision box (false) */
  measured: boolean;
}
export interface FMNote { where: string; rule: string }
export interface FrameModel {
  schema: 'ad/frame-model@1';
  beat: string;
  sketch: string;
  format: string;
  w: number; h: number;
  version: number;
  reviewed: boolean;
  source: 'reader' | 'review' | 'layout';
  regions: FMRegion[];
  elements: FMElement[];
  decisions: FMNote[];
  questions: FMNote[];
}

/** the vision agent's answer (engine.sketch_reader) — boxes [x0, y0, x1, y1] in sketch px */
export interface VisionOut {
  regions: { id: string; kind: 'full' | 'edge' | 'shape'; paint: string; side?: Side; box: [number, number, number, number]; mark?: [number, number, number, number] | null }[];
  elements: { id: string; kind: FMKind; box: [number, number, number, number]; words?: string | null; color?: string | null; in_front_of?: string | null }[];
  notes?: string[];
}

export const toBox = (b: [number, number, number, number]): Box => ({ x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] });
/**
 * The vision model answers boxes as [x0, y0, x1, y1] normalised 0–1000 (x across, y down) — what vision models
 * return reliably whatever size the image reached them at; code scales them to sketch px. Stub fixtures are px.
 */
export function visionToPx(v: VisionOut, w: number, h: number): VisionOut {
  const sc = (b: [number, number, number, number] | null | undefined) => (b ? ([b[0] * w / 1000, b[1] * h / 1000, b[2] * w / 1000, b[3] * h / 1000].map((x) => Math.round(x * 10) / 10) as [number, number, number, number]) : b);
  return { ...v, regions: v.regions.map((r) => ({ ...r, box: sc(r.box)!, mark: sc(r.mark ?? null) ?? null })), elements: v.elements.map((e) => ({ ...e, box: sc(e.box)! })) };
}

/** A review save: validate and bump the version. Returns problems (empty = ok). */
export function reviewProblems(fm: FrameModel, layerIds: string[]): string[] {
  const p: string[] = [];
  const legends = [...fm.regions.map((r) => r.legend), ...fm.elements.map((e) => e.legend)].filter((x): x is string => !!x);
  const dup = legends.filter((l, i) => legends.indexOf(l) !== i);
  if (dup.length) p.push(`legend used twice: ${[...new Set(dup)].join(', ')}`);
  for (const l of legends) if (!layerIds.includes(l)) p.push(`legend “${l}” is not a layer of the scenario beat`);
  for (const id of layerIds) if (!legends.includes(id)) p.push(`scenario layer “${id}” has no element in the sketch`);
  for (const e of fm.elements) if (e.box.w <= 0 || e.box.h <= 0) p.push(`${e.id}: empty box`);
  return p;
}
export function nextVersion(prev: FrameModel, edited: FrameModel): FrameModel {
  return { ...structuredClone(edited), version: prev.version + 1, reviewed: true, source: 'review' };
}
