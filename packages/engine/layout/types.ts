/**
 * `ad/layout@1` — the layout of one scenario (docs/PIPELINE_PLAN.md §4.4): per beat a kit composition, the
 * regions it fills, and where each on_screen item of the scenario goes (a zone of the composition), with its
 * style and colour. No pixels: lib/ad/layout/compile.ts places the boxes from the zones, the kit and the real text.
 */
import type { Side } from '../types';
import type { B2Cue } from '../brief2/types';

export const LAYOUT_SCHEMA = 'ad/layout@1';

export interface L1Region {
  /** the composition's region id */
  id: string;
  /** a kit paint or colour, one of the composition region's `paints` */
  paint: string;
  /** edge regions: the depth as a fraction of the frame, within the composition's range (null = its middle) */
  depth: number | null;
}
export interface L1Layer {
  /** the scenario's on_screen id */
  id: string;
  /** a zone of the composition (hero, text, cta, logo, or one of its named zones) */
  zone: string;
  /** text: a kit style, colour, treatment and plaque fill */
  style: string | null;
  color: string | null;
  treatment: string | null;
  fill: string | null;
  /** logo: its colour; media / object: its outline */
  shape: 'rect' | 'round' | 'circle' | 'arch' | null;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'center' | 'bottom';
  /** the region it sits on (contrast is checked against it) */
  on: string | null;
}
export interface L1Beat {
  beat: string;
  composition: string;
  regions: L1Region[];
  /** back to front; text layers in the same zone stack top to bottom in this order */
  layers: L1Layer[];
  /** region motion only (edge, edge_mark, boil): the scenario owns the rest */
  cues: B2Cue[];
  /** region ids that never move */
  never: string[];
  /** why this composition, or why the same as the beat before (rule 4.9) */
  notes: string[];
}
export interface LayoutV1 {
  schema: typeof LAYOUT_SCHEMA;
  scenario_id: string;
  beats: L1Beat[];
}
export type { Side };
