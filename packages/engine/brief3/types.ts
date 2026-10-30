/**
 * `ad/brief@3` — the scenario (docs/PIPELINE_PLAN.md §4.3, docs/SCENARIO_RULES.md). The scenario says WHAT is
 * in each frame (`on_screen`) and how it moves (`cues`); the layout (`ad/layout@1`) says WHERE: regions, order,
 * styles, colours, boxes. `toV2()` joins it into `ad/brief@2` for the engine. Copy, elements, formats, lengths
 * and languages keep the brief@2 shapes, so their checks are reused.
 */
import type { Technique } from '../types';
import type { B2Copy, B2Cue, B2Element, B2Format, B2Language } from '../brief2/types';

export const BRIEF3_SCHEMA = 'ad/brief@3';
export const HOOK_ANGLES = ['benefit', 'situation', 'question', 'provocation'] as const;
export const BEAT_ROLES = ['single_screen', 'hook', 'problem', 'solution', 'proof', 'end'] as const;
export const ON_SCREEN_KINDS = ['text', 'logo', 'mark', 'graphic', 'media', 'object', 'ui'] as const;
export const VARIATION_AXES = ['hook', 'cta', 'item', 'market', 'format', 'length'] as const;

/** one thing in the frame; where and how big is the layout's job */
export interface B3OnScreen {
  id: string;
  kind: (typeof ON_SCREEN_KINDS)[number];
  /** text: its copy slot */
  slot: string | null;
  /** media / object / ui: the element id it shows (null for an item-bound window) */
  asset: string | null;
  /** media / object: shows the beat's items in turn */
  item_bound: boolean;
  logo: string | null;
  mark: string | null;
  /** graphic: a kit graphic */
  graphic: string | null;
}
export interface B3Beat {
  id: string;
  role: (typeof BEAT_ROLES)[number];
  /** rule 4.7: the beat in one sentence */
  one_line: string;
  /** rule 4.1: the on_screen id the eye goes to first (the hero) */
  focal: string;
  durations: { length: number; seconds: number }[];
  what: string;
  motion_notes: string[];
  on_screen: B3OnScreen[];
  /** targets are on_screen ids; region cues (edge, boil) are the layout's */
  cues: B2Cue[];
  never: string[];
}
export interface B3Copy extends B2Copy {
  /** rules 2.3 / 4.6: this text carries the offer */
  offer: boolean;
}
export interface B3Hook {
  variant: string;
  angle: (typeof HOOK_ANGLES)[number];
  /** rule 2.5: the element this hook brings as its own first frame */
  scene: string | null;
}
export interface B3Concept {
  /** rule 1.1: one sentence, an everyday moment + the offer */
  one_line: string;
  technique: Technique;
  /** rule 1.7: concepts of one batch differ in at least two of these */
  tags: { material: string; light: string; density: string; tempo: string; mood: string };
}
export interface B3Variation {
  naming_template: string;
  expected_files: number;
  asset_links: { asset: string; axis: (typeof VARIATION_AXES)[number] }[];
  fixed: string[];
  legal: { market: string; slot: string }[];
  /** UI data per market, JSON text */
  ui_data_json: string | null;
}
export type B3Signature =
  | { use: string; candidates: null; none: null }
  | { use: null; candidates: { svg: string; place: string; behaviour: string }[]; none: null }
  | { use: null; candidates: null; none: string };

export interface BriefV3 {
  schema: typeof BRIEF3_SCHEMA;
  id: string;
  title: string;
  brand: string;
  kit_version: number | null;
  texts_from: 'us' | 'client';
  idea: string;
  concept: B3Concept;
  formats: B2Format[];
  lengths: number[];
  /** rule 7.3: which beats each length contains, in order */
  lengths_beats: { length: number; beats: string[] }[];
  languages: B2Language[];
  translate: boolean;
  copy: B3Copy[];
  hooks: B3Hook[];
  beats: B3Beat[];
  elements: B2Element[];
  ui_strings: { key: string; lang: string; text: string }[];
  data_json: string | null;
  references: { file: string; role: string; object: string | null }[];
  variation: B3Variation;
  signature: B3Signature;
  /** rule 10.4: vague words turned into kit values */
  conversions: { path: string; word: string; value: string }[];
  decisions: string[];
  /** rule 10.7: every question in one list */
  questions: string[];
  /** rule 10.8: one page in plain words for the author */
  summary: string;
}
