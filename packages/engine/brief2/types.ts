/**
 * The brief as data (`ad/brief@2`, docs/BRIEF_V2.md): written by the agents upstream with a strict JSON schema
 * (lib/ad/brief2/schema.ts — generated per kit), checked by code (check.ts), turned into the pipeline's own
 * shapes (convert.ts). Every field is present; "nothing" is null or [] — the strict output formats need that.
 * Maps are arrays of { key, value } objects for the same reason. Pure types; node-importable.
 */
import type { Behaviour, LayerKind } from '../types';
import type { Source } from '../intake/brief';

export const BRIEF2_SCHEMA = 'ad/brief@2';

export interface B2Format { id: string; master: boolean; profile: string | null }
export interface B2Language { id: string; source: boolean }
/** one variant of a copy slot: lines per language (a line break = a new array item; *word* = emphasis) */
export interface B2CopyVariant { variant: string; text: { lang: string; lines: string[] }[] }
export interface B2Copy {
  slot: string;
  axis: 'hook' | 'cta' | 'items' | null;
  /** a kit style */
  style: string | null;
  /** the beat whose frame shows this text (reading time and fit are checked per beat) */
  beat: string | null;
  variants: B2CopyVariant[];
}
export interface B2Layer {
  id: string;
  kind: LayerKind | 'region';
  /** text: the copy slot, kit style, kit colour, treatment, plaque fill */
  slot: string | null; style: string | null; color: string | null; treatment: string | null; fill: string | null;
  /** media / object / ui: the element id it shows · logo / mark: the kit's */
  asset: string | null; logo: string | null; mark: string | null; ui: string | null;
  /** region: kit paint or colour, or "media" (a window that shows `asset`) */
  paint: string | null;
  area: 'full' | 'edge' | 'shape' | null;
  shape: 'rect' | 'round' | 'circle' | 'arch' | null;
  graphic: { kind: 'svg' | 'icon' | 'pattern'; graphic: string; color: string } | null;
  group: string | null;
  behaviour: Behaviour | null;
  item_bound: boolean | null;
  shadow: boolean | null;
}
/** one cue: `type` plus the fields its type takes (engine cue contract); every other field null */
export interface B2Cue {
  type: string;
  target: string | null; region: string | null;
  t: number | string | null; dur: number | null; curve: string | null; out: boolean | null;
  from_u: number[] | null; per_line: boolean | null; from: number | string | null; to: number | string | null;
  step: number | null; deg_s: number | null; amp_deg: number | null; amp_u: number | null; period: number | null;
  fps: number | null; loop: boolean | null; clip_in: number | null;
  ride: string[] | null; show: number | string | null; hide: number | string | null; transition: string | null;
  part: string | null; screen: string | null;
  count: (number | string)[] | null; fade: (number | string)[] | null; stagger: (number | string)[] | null; press: (number | string)[] | null;
}
export interface B2Beat {
  id: string;
  role: string;
  /** the sketch file name (one PNG per beat, master format) */
  sketch: string | null;
  durations: { length: number; seconds: number }[];
  what: string;
  /** motion in words, for people and as a fallback for the scenario writer */
  motion_notes: string[];
  /** back to front; null = let the scenario writer make them */
  layers: B2Layer[] | null;
  groups: { id: string; members: string[] }[];
  /** null = let the scenario writer write them from motion_notes */
  cues: B2Cue[] | null;
  never: string[];
}
export interface B2Production {
  camera: string | null; light: string | null; pose: string | null; material: string | null; colour: string | null; build: string | null;
  /** clip action, timed: from–to seconds (to null = the end) */
  action: { from: number; to: number | null; text: string }[];
  /** where the key part sits in the picture, 0–1: x0 y0 x1 y1 */
  key_part_box: number[] | null;
  cutout: boolean | null;
  frames: { count: number; fps: number; keep: string[]; vary: string[] } | null;
  texture: { variants: number; fps: number } | null;
}
export interface B2Element {
  /** the asset id: UPPER_SNAKE; layers and items name it */
  id: string;
  /** a human name; elements that differ by hook share it */
  name: string;
  beat: string | null;
  source: Source;
  what: string;
  key_part: string | null;
  must_not: string[];
  /** this element is the one shown for these hooks (others with the same name cover the rest) */
  hooks: string[] | null;
  /** item n (from 0) of the list one media / object layer shows in turn */
  item: { layer: string; index: number } | null;
  production: B2Production | null;
  /** source UI: the UI spec (lib/ad/types.ts UiSpec) as JSON text */
  ui_spec_json: string | null;
}
export interface BriefV2 {
  schema: typeof BRIEF2_SCHEMA;
  /** the scenario id, e.g. "SA02" */
  id: string;
  title: string;
  brand: string;
  kit_version: number | null;
  /** who wrote the texts: decides who is asked about them */
  texts_from: 'us' | 'client';
  idea: string;
  formats: B2Format[];
  /** seconds */
  lengths: number[];
  languages: B2Language[];
  translate: boolean;
  copy: B2Copy[];
  beats: B2Beat[];
  elements: B2Element[];
  /** UI texts by key and language (UI specs name the key) */
  ui_strings: { key: string; lang: string; text: string }[];
  /** data for UI numbers, rows and charts, as JSON text ({ key: value }) */
  data_json: string | null;
  /** product references: the uploaded file name, its role, and the kit object it shows */
  references: { file: string; role: string; object: string | null }[];
}

/** one finding about a brief: where (a JSON path into the brief), what, how bad, who can fix it */
export interface BriefIssue {
  path: string;
  message: string;
  severity: 'block' | 'note';
  /** agent: the brief's author can fix it · client: needs the client (their texts, their files) */
  to: 'agent' | 'client';
}
