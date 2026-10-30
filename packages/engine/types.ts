import type {RecipeName,CameraName,TransitionName} from '../creative/motion-recipes';
/**
 * Data model of the ad pipeline (docs/SPEC.md sections 3, 4, 7, 8). Pure types — no brand, no style,
 * no layout lives in code. Units: px at a 1080 px short side, u = 1 % of the short side, seconds.
 * Files: kit (8.1), scenario (8.2), platform profiles (8.3), rules library, engine config (8.4).
 * Kept importable by `node --experimental-strip-types` (relative .ts imports, no enums).
 */

export type Side = 'top' | 'right' | 'bottom' | 'left';
export interface Box { x: number; y: number; w: number; h: number }
/** format id → value */
export type PerFormat<T> = Record<string, T>;
export type Bezier = [number, number, number, number];
/** A colour: a kit colour name, or #hex. */
export type ColorRef = string;

// ============================================================================ routes (section 4)
export type Route = 'text' | 'logo' | 'mark' | 'graphic' | 'ui' | 'graphic_3d' | 'model_3d' | 'still' | 'live_video' | 'stop_motion' | 'texture' | 'file';
/** Routes out of scope for now (no 3D): kept in the schema; the element renders as a flat stand-in and blocks delivery. */
export const ROUTES_3D: Route[] = ['graphic_3d', 'model_3d'];

// ============================================================================ brand kit (8.1)
export interface KitColor { hex: string; roles: string[] }
export interface KitFont { family: string; fallback: string; measure: string; files: { weight: number | [number, number]; file: string; unicode_range?: string }[]; coverage?: string[] }
export interface KitLogo { raster_mask?:boolean;file: string; svg: string; mode?: 'as_drawn' | 'one_colour'; ground?: 'dark' | 'light' | 'any'; role?: 'primary' | 'secondary' | 'icon'; ink?: string; view_box?: [number, number] }
/** size px at a 1080 short side; pitch = line step in em; line_box = height of one line's box in em (default = pitch); baseline = em from the line box top */
export interface KitStyle { font: string; size: number; weight: number; pitch: number; tracking: number; case: 'none' | 'upper' | 'lower' | 'title'; treatment: string; baseline?: number; line_box?: number }
export type Treatment =
  | { kind: 'plain' }
  /** a box per line; pad [top, right, bottom, left] and height in em */
  | { kind: 'plaque'; pad: [number, number, number, number]; height?: number; radius?: number; fill: ColorRef; on: ColorRef }
  /** one box per block */
  | { kind: 'box'; pad: [number, number, number, number]; radius?: number; fill: ColorRef; on: ColorRef }
  | { kind: 'button'; pad: [number, number, number, number]; radius: number | 'pill'; fill: ColorRef; on: ColorRef }
  /** a marker behind the *emphasised* words */
  | { kind: 'highlight'; fill: ColorRef; pad: [number, number]; height: number; offset: number; on?: ColorRef }
  | { kind: 'underline'; color: ColorRef; thickness: number; offset: number }
  /** emphasised words in another colour */
  | { kind: 'link'; color: ColorRef };
export interface VectorShape { view_box: [number, number]; paths: { d: string; fill?: ColorRef | 'currentColor'; stroke?: ColorRef | 'currentColor'; width?: number }[] }
export interface KitMark {
  /** 'shape': a device drawn from a vector · 'tongue': an edge mark protruding from a region edge */
  kind: 'shape' | 'tongue';
  shape?: VectorShape;
  size_u: [number, number];
  fills: ColorRef[];
  text?: { fixed: Record<string, string> | string; style: string; color: ColorRef; box: [number, number, number, number] };
  rotation?: number;
  radius_u?: number;
  placement?: string;
}
export interface KitGraphic { kind: 'svg' | 'icon' | 'pattern'; shape: VectorShape; stroke_u?: number }
export type PaintDef =
  | { kind: 'flat'; color: ColorRef }
  | { kind: 'gradient'; type: 'linear' | 'radial'; angle?: number; stops: { at: number; color: ColorRef }[] }
  | { kind: 'pattern'; graphic: string; scale_u: number; gap_u: number; color: ColorRef; bg: ColorRef; rotation?: number }
  | { kind: 'texture'; material: string; color: ColorRef; edge?: string; change_fps?: number };
// ---------------------------------------------------------------------------- kit@2 (docs/PIPELINE_PLAN.md §4.1)
/** the techniques a composition and a signature device belong to (docs/SCENARIO_RULES.md §5) */
export const TECHNIQUES = ['split', 'panel', 'window', 'object', 'transition', 'full'] as const;
export type Technique = (typeof TECHNIQUES)[number];
/** x0 y0 x1 y1 as fractions 0–1 of the master frame */
export type Zone = [number, number, number, number];
/** the numbers the scenario rules use; defaults in lib/ad/kit/resolve.ts */
export interface KitLimits { hook_words: number; hook_lines: number; cta_words: number; colors_max: number; moving_max: number; offer_by_s: number; beats_max: number }
export interface KitProduct { name: string; description: string; photos: string[]; must_not: string[] }
export interface CompositionRegion {
  id: string;
  area: 'full' | 'edge' | 'shape';
  /** edge regions only */
  side?: Side;
  /** the share of the frame the region takes (edge: its depth from the side), min–max */
  depth: [number, number];
  /** allowed kit paints or colours */
  paints: string[];
}
/** a frame structure the layout agent may choose: it picks one and fills its zones, code places the boxes */
export interface KitComposition {
  id: string;
  label: string;
  technique: Technique;
  regions: CompositionRegion[];
  zones: { hero: Zone; text: Zone; cta: Zone; logo: Zone } & Record<string, Zone>;
  /** master formats it is drawn for, e.g. "4:5" */
  formats: string[];
  notes: string;
}

export interface Kit {
  schema: 'ad/kit@1' | 'ad/kit@2';
  brand: string;
  version: number;
  colors: Record<string, KitColor>;
  sketch_palette: string[];
  object_palette: string[];
  fonts: Record<string, KitFont>;
  logos: Record<string, KitLogo>;
  logo_rules: { default: string; width_u: [number, number]; end_width_u?: number; colors: string[]; never: string[]; clear_space_u?: number };
  styles: Record<string, KitStyle>;
  treatments: Record<string, Treatment>;
  marks: Record<string, KitMark>;
  graphics: Record<string, KitGraphic>;
  paints: Record<string, PaintDef>;
  materials?: Record<string, unknown>;
  light_3d?: Record<string, unknown>;
  ui_kit: { frame: ColorRef; frame_dark?: ColorRef; screen: ColorRef; screen_dark?: ColorRef; text: ColorRef; muted: ColorRef; accent: ColorRef; positive: ColorRef; negative?: ColorRef; surface: ColorRef; line: ColorRef; field_style: 'filled' | 'outlined'; radius: number; font: string };
  layout: { margin_side_u: number; margin_top_u: number; gap_region_u: number; min_text_scale: number; region_floor_u: number };
  contrast: { flat: number; media: number; exceptions: [ColorRef, ColorRef][] };
  motion: { curves: Record<string, Bezier>; allowed: string[]; forbidden: string[]; never: string[]; character: string; /** kit@2: “quick / normal / slow” in seconds */ durations?: { fast: number; medium: number; slow: number } };
  markets: Record<string, { locale: string; currency: string }>;
  reading: { per_word_s: number; base_s: number };
  object_lock: Record<string, string>;
  object_check: Record<string, { hue_deg: [number, number]; saturation_min: number }>;
  look: Record<string, string>;
  voice: { tone: string; say: string[]; never: string[] };
  legal: { claims: string[]; mandatory: { id: string; text: Record<string, string> }[] };
  sketch_reading: { snap_u: number; question_u: number; ai?: { snap_u: number; question_u: number; color_tolerance: number } };
  // kit@2 — optional in the type so kit@1 still reads; resolveKit() fills them, validateKit() requires them for kit@2
  product?: KitProduct;
  limits?: KitLimits;
  /** approved CTAs per language (a market key) */
  cta_approved?: Record<string, string[]>;
  compositions?: KitComposition[];
  /** the approved signature device (a mark) per technique */
  signature?: Partial<Record<Technique, string>>;
}
/** a kit after resolveKit(): every kit@2 field present */
export type Kit2 = Kit & { schema: 'ad/kit@2'; product: KitProduct; limits: KitLimits; cta_approved: Record<string, string[]>; compositions: KitComposition[]; signature: Partial<Record<Technique, string>>; motion: Kit['motion'] & { durations: { fast: number; medium: number; slow: number } } };

/** A stored kit: kit@1/kit@2 (legacy) or kit@3 (brand only). ad_kits.kit holds any of them. */
export type StoredKit = Kit | BrandKit;

export const COLOR_ROLES = ['field', 'text', 'text_secondary', 'accent', 'surface', 'line', 'positive', 'negative', 'ui'] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];   // free strings from kit@2 are still accepted in KitColor.roles

export interface BrandColor extends KitColor {
  name: string;                                    // display name, e.g. "Lime"; the key stays an identifier
  group: 'core' | 'supporting' | 'product_ui';     // how the brand page groups it
  note?: string;                                   // e.g. "one per frame"
}
export interface BrandFont extends KitFont { use: string }               // "Headlines, names, numbers"
export interface BrandStyle extends KitStyle { label: string; sample?: string }  // "Headline", sample line
export interface BrandLogo {
  file: string;                     // kit path, e.g. logos/wordmark.svg
  svg: string;                      // always SVG text; raster logos are wrapped (§2.5)
  label: string;                    // "Wordmark"
  role: 'primary' | 'secondary' | 'icon';
  ground: 'dark' | 'light' | 'any'; // the ground it is made for
  color_mode: 'as_drawn' | 'one_colour';
  ink: string;                      // #RRGGBB, the dominant visible colour (contrast warnings)
  view_box: [number, number];       // width, height (aspect); from viewBox or width/height
  made_by_agent?: boolean;          // derived by the system, not supplied by the client
}
export interface BrandProduct extends KitProduct {
  kind: 'physical' | 'software' | 'service';
  screens: string[];                // kit paths of UI screens standing in for product photos (software)
}
export interface BrandKit {
  schema: 'ad/kit@3';
  brand: string;                    // identifier (same pattern as today)
  version: number;
  name: string;                     // as the brand writes it: "sonicdesk"
  essence: string;                  // 1–3 sentences: what it is and how it looks; the brand page lede
  colors: Record<string, BrandColor>;
  fonts: Record<string, BrandFont>;
  styles: Record<string, BrandStyle>;
  logos: Record<string, BrandLogo>;
  logo_rules: { never: string[]; clear_space_u?: number; min_width_u?: number };
  marks: Record<string, KitMark>;
  graphics: Record<string, KitGraphic>;
  treatments: Record<string, Treatment>;
  paints: Record<string, PaintDef>;
  product: BrandProduct;
  look: { notes: Record<string, string>; always: string[]; never: string[]; references: string[] };
  voice: { tone: string; say: string[]; never: string[]; vocabulary: { say: string; not: string }[]; lines: string[] };
  legal: Kit['legal'];
  motion: { character: string; curves: Record<string, Bezier>; allowed: string[]; forbidden: string[]; never: string[]; tempo_bpm?: number };
  /** optional brand-level extras; derived by resolveKit when absent */
  ui_kit?: Kit['ui_kit'];
  object_lock?: Kit['object_lock'];
  object_check?: Kit['object_check'];
  /** font substitutes, same JSON lines as today's look.font_substitutes (delivery rule, K6) */
  font_substitutes?: string;
  /** carried over from kit@2 by toBrandKit(); never written by intake or the editor */
  legacy?: { compositions?: KitComposition[]; signature?: Kit['signature']; cta_approved?: Kit['cta_approved']; markets?: Kit['markets'] };
}

// ============================================================================ platform profiles (8.3)
export interface Profile { label: string; w: number; h: number; safe: Record<Side, number>; bitrate_mbps: number }
export interface Platforms { schema: 'ad/platforms@1'; version: number; profiles: Record<string, Profile>; defaults: Record<string, string>; render: { fps: number; keyframe_s: number } }

// ============================================================================ time
/** seconds from the beat start (number or "0.3"), "end-0.16" (from the beat end), "after:<layer>+0.1" (after a type-on finishes) */
export type TimeRef = number | string;

// ============================================================================ cues (7.5)
/** every cue may be limited to some formats (e.g. text rides the edge only where it is anchored to it) */
export interface CueBase { formats?: string[] }
export type Cue = CueBase & (
  | { type: 'fade'; target: string; t: TimeRef; dur: number; out?: boolean; curve?: string }
  | { type: 'rise' | 'drop'; target: string; t: TimeRef; dur: number; from_u: number; per_line?: number | boolean; curve?: string; out?: boolean }
  | { type: 'move'; target: string; t: TimeRef; dur: number; from_u: [number, number]; curve?: string; out?: boolean }
  | { type: 'pop'; target: string; t: TimeRef; dur: number; from?: number; curve?: string }
  | { type: 'scale'; target: string; t: TimeRef; dur: number; from: number; to: number; curve?: string }
  | { type: 'draw'; target: string; t: TimeRef; dur: number; curve?: string }
  | { type: 'type_on'; target: string; t: TimeRef; step: number }
  | { type: 'spin'; target: string; deg_s: number }
  | { type: 'sway'; target: string; amp_deg: number; period: number }
  | { type: 'float'; target: string; amp_u: number; period: number; t?: TimeRef }
  | { type: 'rock'; target: string; amp_deg: number; period: number; t?: TimeRef }
  | { type: 'boil'; region: string; fps: number }
  | { type: 'sequence'; target: string; fps: number; loop: boolean }
  | { type: 'clip'; target: string; clip_in: number }
  /** a region edge moves: from/to are 'rest' (the format's position), 'out' (region gone through its own side), 'full' (region covers the frame) or a share 0–1 of the rest depth */
  | { type: 'edge'; region: string; from: 'rest' | 'out' | 'full' | number; to: 'rest' | 'out' | 'full' | number; t: TimeRef; dur: number; ride?: string[]; curve?: string }
  | { type: 'edge_mark'; region: string; show?: TimeRef; hide?: TimeRef }
  | { type: 'items'; period: number; transition: 'cut' | 'crossfade'; dur?: number; t?: TimeRef }
  | { type: 'ui'; target: string; part: string; scroll?:[TimeRef,number,number,number];cursor?:{points:[number,number][];t:TimeRef;dur:number}; count?: [TimeRef, number]; fade?: [TimeRef, number]; stagger?: [TimeRef, number, number]; press?: [TimeRef, number]; screen?: string; t?: TimeRef; dur?: number; transition?: 'slide' | 'fade' | 'cut' });
export type CueType = Cue['type'];

// ============================================================================ frame model (3)
export type Area =
  | { kind: 'full' }
  /** part of the frame on one side of an edge: `side` is the frame side the region hugs, `depth` px from that side to the edge line */
  | { kind: 'edge'; per: PerFormat<{ side: Side; depth: number; shape?: { kind: 'straight' } | { kind: 'curve'; amp: number } | { kind: 'wave'; amp: number; count: number } }> }
  | { kind: 'shape'; per: PerFormat<{ box: Box; shape: 'rect' | 'round' | 'circle' | 'arch' | 'path'; radius?: number; d?: string }> };
export type PaintRef = string | PaintDef | { kind: 'media'; screen_insert?:{ui:string;area:Box}; part: string; part_by_hook?: Record<string, string> };
export interface EdgeMark {
  mark: string;
  fill: ColorRef;
  /** protrudes from the region's edge INTO the region; `at` px along the edge from its start (left or top), `length` and `depth` px */
  per: PerFormat<{ at: number; length: number; depth: number; radius?: number }>;
}
export interface Region { persistent?:string;id: string; area: Area; paint: PaintRef; edge_mark?: EdgeMark }

export type LayerKind = 'text' | 'logo' | 'mark' | 'graphic' | 'media' | 'ui' | 'object';
export type Behaviour = 'flow' | 'elastic' | 'anchored' | 'attached' | 'resting' | 'grouped' | 'fixed';
export interface LayerPlace {
  color?: ColorRef; behaviour?: Behaviour; z?: number; crop_anchor?: [number, number];
  box: Box;
  visible?: boolean;
  /** sides the layer may leave the frame through */
  bleed?: Side[];
  align?: 'left' | 'center' | 'right';
  v_anchor?: 'top' | 'middle' | 'bottom';
  /** text only: lines joined into one in this format */
  join_lines?: boolean;
}
export interface LayerBase {
  id: string;
  persistent?:string;
  camera?:{type:CameraName;amount:number};
  kinetic?:{mode:'word'|'line'|'mask';start:number;duration:number};
  emphasis?:{start:number;duration:number};
  press?:{start:number;duration:number};
  kind: LayerKind;
  route?: Route;
  group?: string;
  /** attached: keeps its offset from this host layer and follows its motion */
  host?: string;
  /** resting: lies across this region's edge and rides it */
  rests_on?: string;
  behaviour?: Behaviour;
  per: PerFormat<LayerPlace>;
}
export interface TextLayer extends LayerBase { kind: 'text'; slot: string; style: string; color: ColorRef; treatment?: string; fill?: ColorRef }
export interface LogoLayer extends LayerBase { kind: 'logo'; logo: string; color: ColorRef }
export interface MarkLayer extends LayerBase { kind: 'mark'; mark: string; fill?: ColorRef; text_slot?: string }
export type GraphicSpec =
  | { kind: 'svg' | 'icon'; graphic: string; color: ColorRef }
  | { kind: 'pattern'; graphic: string; color: ColorRef; scale_u: number; gap_u: number }
  | { kind: 'chart'; chart: 'line' | 'bar' | 'ring'; data: string; color: ColorRef; track?: ColorRef; width_u?: number; max?: number; key?: boolean };
export interface GraphicLayer extends LayerBase { kind: 'graphic'; graphic: GraphicSpec }
export interface MediaLayer extends LayerBase { kind: 'media'; screen_insert?:{ui:string;area:Box}; part: string; part_by_hook?: Record<string, string>; shape?: 'rect' | 'round' | 'circle' | 'arch'; radius?: number; item_bound?: boolean }
export interface UiLayer extends LayerBase { kind: 'ui'; ui: string }
export interface ObjectLayer extends LayerBase { kind: 'object'; part: string; shadow?: boolean; item_bound?: boolean }
export type Layer = TextLayer | LogoLayer | MarkLayer | GraphicLayer | MediaLayer | UiLayer | ObjectLayer;
export interface Group { id: string; members: string[]; parent?: string; per: PerFormat<{ box: Box; pivot?: [number, number] }> }
export interface Items { list: { part?: string; copy_index: number }[]; /** the media layer that shows the items in turn */ layer?: string; /** its outline, from the brief (“shown in the arch window”) */ shape?: 'rect' | 'round' | 'circle' | 'arch' }
export interface Beat {
  id: string;
  recipe?:RecipeName;
  transition_out?:{type:TransitionName;duration:number};
  holds?:{start:number;duration:number;intentional:boolean}[];
  role: string;
  sketch?: string;
  regions: Region[];
  layers: Layer[];
  groups: Group[];
  cues: Cue[];
  items?: Items;
  motion_plain?: string[];
  /** layer ids that never move after they appear (M rules; checked) */
  never?: string[];
}

// ============================================================================ UI (10)
export type NumberFormat = 'int' | 'dec1' | 'dec2' | 'money' | 'money2' | 'percent';
export type UiValue = number | string | { data: string };
export interface UiComponentBase { id: string; x: number; y: number; w: number; h: number; key?: boolean }
export type UiComponent =
  | (UiComponentBase & { type: 'text'; text: string; size: number; weight: number; color?: ColorRef; align?: 'left' | 'center' | 'right' })
  | (UiComponentBase & { type: 'number'; value: UiValue; format: NumberFormat; from?: number; sign?: boolean; size: number; weight: number; color?: ColorRef; align?: 'left' | 'center' | 'right' })
  | (UiComponentBase & { type: 'field' | 'select'; label: string; value: UiValue; format?: NumberFormat; from?: number; style?: 'filled' | 'outlined'; stepper?: boolean; chevron?: boolean })
  /** animated switch: a `count` cue moves the highlight from `from` to `active` */
  | (UiComponentBase & { type: 'segmented'; options: string[]; active: number; from?: number })
  | (UiComponentBase & { type: 'button'; text: string; fill?: ColorRef; color?: ColorRef })
  | (UiComponentBase & { type: 'chip'; text: string; fill?: ColorRef; color?: ColorRef })
  | (UiComponentBase & { type: 'rows'; rows: string; columns: { key: string; w: number; align?: 'left' | 'right'; format?: NumberFormat }[]; row_h: number; size: number })
  | (UiComponentBase & { type: 'ring' | 'bar'; value: UiValue; max: number; color?: ColorRef; track?: ColorRef; width?: number })
  | (UiComponentBase & { type: 'line'; points: string; color?: ColorRef; width?: number })
  | (UiComponentBase & { type: 'tabbar'; items: { icon: string; label: string }[]; active: number })
  | (UiComponentBase & { type: 'logo'; logo: string; color?: ColorRef })
  | (UiComponentBase & { type: 'icon'; icon: string; color?: ColorRef });
export interface UiScreen { id: string; bg?: ColorRef; components: UiComponent[] }
export interface UiSpec {
  device: 'phone' | 'tablet' | 'laptop' | 'card';
  theme: 'light' | 'dark';
  /** design size of the screen content (it is scaled into the device's screen) */
  screen_w: number;
  screen_h: number;
  screens: UiScreen[];
  /** data by key; numbers and strings; arrays for rows and charts */
  data: Record<string, unknown>;
}

// ============================================================================ parts (generated or given)
export type StandIn =
  | { kind: 'sketch_area'; file: string; crop: Box }
  | { kind: 'procedural'; color: ColorRef; label?: string }
  /** live_video before its clip exists: the approved still (first frame), marked */
  | { kind: 'still'; file: string }
  | { kind: 'flat3d'; color: ColorRef; label?: string }
  /** draft mockups: a simple vector picture of what will be there (colours already hex), on a kit-colour ground */
  | { kind: 'schematic'; shape: VectorShape; bg: string; label?: string };
export interface Part {
  id: string;
  route: Route;
  status: 'standin' | 'approved';
  media: 'picture' | 'clip' | 'frames' | 'tiles' | 'svg' | 'model';
  file?: string;
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain';
  files?: string[];
  frame_cameras?: CameraName[];
  /** pixel size of the master (square for pictures, clips, frames) */
  side?: number;
  fps?: number;
  clip_in?: number;
  usable?: [number, number];
  duration_s?: number;
  /** 0–1 of the square: what must stay visible (L_KEY_CROP) */
  key_part_box?: [number, number, number, number];
  cutout?: boolean;
  change_fps?: number;
  standin: StandIn;
  what?: string;
}

// ============================================================================ engine config (8.4) — the engine's only input besides files
export interface Format { id: string; profile: string; w: number; h: number; safe: Record<Side, number>; bitrate_mbps: number; token: string }
export interface EngineConfig {
  schema: 'ad/engine-config@1';
  meta: { scenario_id: string; brand: string; title: string; version: number; kit_version: number; platforms_version: number; made_by: 'planner' | 'hand' | 'fixture'; notes?: string; /** test runs: the upscale limit is relaxed (3×) */ draft_quality?: boolean };
  render: { fps: number; keyframe_s: number };
  naming: { template: string; version: number };
  master_format: string;
  formats: Format[];
  variant_sets: { hooks: string[]; ctas: string[]; languages: string[]; formats: string[]; lengths: string[] };
  kit: Kit;
  /** slot → variant ('*' for none, a hook / CTA id, or an item index) → language → lines */
  copy: Record<string, Record<string, Record<string, string[]>>>;
  /** which variant axis a slot follows */
  slot_axis: Record<string, 'hook' | 'cta' | 'items' | null>;
  ui_strings: Record<string, Record<string, string>>;
  ui: Record<string, UiSpec>;
  /** data for charts on graphic layers: key → number[] or number */
  data?: Record<string, unknown>;
  /** vectors given with the ad (illustrations as SVG, route graphic), by name; the kit's come first */
  graphics?: Record<string, KitGraphic>;
  parts: Record<string, Part>;
  lengths: Record<string, { beat: string; dur: number }[]>;
  beats: Beat[];
}
export interface VariantState { fmt: string; lang: string; hook: string; cta: string; len: string }

// ============================================================================ scenario (8.2) — what the scenario writer produces; the planner turns it into the engine config
export interface ScenarioLayer {
  id: string;
  kind: 'region' | LayerKind;
  route?: Route;
  asset?: string;
  group?: string;
  behaviour?: Behaviour;
  slot?: string; style?: string; color?: ColorRef; treatment?: string; fill?: ColorRef;
  area?: Area | { kind: 'full' | 'edge' | 'shape' };
  paint?: PaintRef;
  shadow?: boolean;
  logo?: string; mark?: string; graphic?: GraphicSpec; ui?: string;
  /** a media layer: its outline, and whether it shows the beat's items in turn */
  shape?: 'rect' | 'round' | 'circle' | 'arch'; item_bound?: boolean;
}
export interface ScenarioAsset {
  route: Route;
  what: string;
  key_part?: string;
  key_part_box?: [number, number, number, number];
  must_not?: string[];
  ui?: UiSpec;
  still?: { cutout: boolean; prompt?: string };
  live_video?: { action: [number, number | 'end', string][] };
  stop_motion?: { frames: number; fps: number; keep: string[]; vary: string[] };
  texture?: { variants: number; fps: number };
  graphic_3d?: { build: { kind: string; [k: string]: unknown }; color: ColorRef; material: string; pose?: string };
  model_3d?: { pose: string; standin_shape: string };
  file?: string;
}
export interface Scenario {
  schema: 'ad/scenario@1';
  scenario_id: string;
  brand: string;
  title: string;
  idea: string;
  master_format: string;
  platforms: Record<string, string>;
  variant_sets: { hooks: string[]; ctas: string[]; languages: string[]; formats: string[]; lengths: string[] };
  naming: { template: string; version: number };
  beats: { id: string; role: string; sketch: string; durations: Record<string, number>; groups?: Record<string, string[]>; layers: ScenarioLayer[]; items?: Items; motion: { plain: string[]; cues: Cue[]; never?: string[] } }[];
  assets: Record<string, ScenarioAsset>;
  copy: Record<string, Record<string, Record<string, string[]>>>;
  slot_axis?: Record<string, 'hook' | 'cta' | 'items' | null>;
  ui_strings?: Record<string, Record<string, string>>;
  /** data for charts on graphic layers (heading 9 json "data") */
  data?: Record<string, unknown>;
  /** vectors given with the ad (an SVG file named after a graphic element) */
  graphics?: Record<string, KitGraphic>;
}

// ============================================================================ findings (9, 12)
export type Severity = 'block' | 'warn';
export interface Finding {
  code: string;
  severity: Severity;
  element: string | null;
  format: string;
  beat: string | null;
  t: number;
  message: string;
  /** variants this identical finding appears in (formats × languages × hooks × CTAs × lengths) */
  variants: VariantState[];
  box?: Box;
}
