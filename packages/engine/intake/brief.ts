/**
 * The brief (spec 2.2, docs/BRIEF.md): a Markdown file with fixed headings → a structured intake.
 * Tolerant: tables or bullets, "—" for absent cells, lines split by " / ". Unparseable content is kept
 * raw and becomes a question in the intake check, never a guess.
 */
import type { Route } from '../types';

export type Source = 'engine 2D' | 'engine 3D' | 'UI' | 'picture to generate' | 'clip to generate' | '3D model to generate' | 'frames to generate' | 'texture to generate' | 'file given';
export const SOURCE_ROUTE: Record<Source, Route> = {
  'engine 2D': 'graphic', 'engine 3D': 'graphic_3d', UI: 'ui', 'picture to generate': 'still', 'clip to generate': 'live_video',
  '3D model to generate': 'model_3d', 'frames to generate': 'stop_motion', 'texture to generate': 'texture', 'file given': 'file',
};
export const HEADINGS = ['Brand', 'Idea', 'Formats and platforms', 'Lengths', 'Languages', 'Copy', 'Beats', 'Elements', 'UI', 'Motion', 'Groups', 'References'];

export interface BriefSlot { slot: string; axis: 'hook' | 'cta' | 'items' | null; style: string | null; variants: Record<string, Record<string, string[]>> }
export interface BriefBeat { id: string; role: string; sketch: string; durations: Record<string, number>; what: string }
export interface BriefElement { name: string; beat: string | null; what: string; source: Source | null; sourceRaw: string; route: Route | null; key_part: string | null; must_not: string[]; by_hook: Record<string, string> | null; item: { list: string; index: number } | null }
export interface Brief {
  title: string;
  headings: number[];
  brand: string | null; kit_version: number | null;
  idea: string;
  formats: { id: string; profile: string | null; master: boolean }[];
  lengths: string[];
  languages: { id: string; source: boolean }[];
  translate: boolean;
  copy: BriefSlot[];
  beats: BriefBeat[];
  elements: BriefElement[];
  ui: { text: string; json: unknown | null };
  motion: Record<string, string[]>;
  groups: { name: string; members: string[] }[];
  references: string[];
  problems: string[];
}

const clean = (s: string) => s.replace(/`/g, '').trim();
const isDash = (s: string) => /^(—|-|–|n\/a|)$/i.test(s.trim());
function table(lines: string[]): string[][] {
  const rows = lines.filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  return rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
}
const splitLines = (s: string) => s.split(/\s+\/\s+/).map((x) => x.trim()).filter((x) => x.length);

export function parseBrief(md: string): Brief {
  const b: Brief = { title: '', headings: [], brand: null, kit_version: null, idea: '', formats: [], lengths: [], languages: [], translate: false, copy: [], beats: [], elements: [], ui: { text: '', json: null }, motion: {}, groups: [], references: [], problems: [] };
  const lines = md.replace(/\r/g, '').split('\n');
  b.title = clean(lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, '') ?? '');
  const sections = new Map<number, string[]>();
  let cur: number | null = null;
  for (const l of lines) {
    const m = /^##\s+(\d{1,2})\.?\s+(.+)$/.exec(l);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 12) { cur = n; sections.set(n, []); if (!b.headings.includes(n)) b.headings.push(n); if (clean(m[2]).toLowerCase() !== HEADINGS[n - 1].toLowerCase()) b.problems.push(`heading ${n} is “${clean(m[2])}”, expected “${HEADINGS[n - 1]}”`); continue; }
    }
    if (/^##\s/.test(l)) { cur = null; continue; }
    if (cur !== null) sections.get(cur)!.push(l);
  }
  const text = (n: number) => (sections.get(n) ?? []).join('\n').trim();
  const bullets = (n: number) => (sections.get(n) ?? []).map((l) => /^\s*[-*]\s+(.+)$/.exec(l)?.[1]).filter((x): x is string => !!x).map(clean);

  // 1 brand
  const brandLine = text(1).split('\n').map(clean).find((x) => x.length) ?? '';
  const bm = /^([A-Za-z0-9_-]+)(?:\s+v(\d+))?/.exec(brandLine);
  if (bm) { b.brand = bm[1]; b.kit_version = bm[2] ? Number(bm[2]) : null; }
  // 2 idea
  b.idea = text(2);
  // 3 formats
  for (const x of bullets(3).length ? bullets(3) : text(3).split(/[,\n]/).map(clean).filter(Boolean)) {
    const m = /^(\d+:\d+)(.*)$/.exec(x);
    if (!m) { b.problems.push(`format “${x}” is not like 9:16`); continue; }
    const rest = m[2];
    b.formats.push({ id: m[1], master: /master/i.test(rest), profile: /:\s*([a-z0-9_]+)/i.exec(rest)?.[1] ?? /→\s*([a-z0-9_]+)/i.exec(rest)?.[1] ?? null });
  }
  // 4 lengths
  b.lengths = (text(4).match(/\d+(?:\.\d+)?/g) ?? []).map(String);
  // 5 languages
  const langText = text(5);
  for (const m of langText.matchAll(/\b([A-Z]{2})\b(\s*\(source\))?/g)) if (!b.languages.some((l) => l.id === m[1])) b.languages.push({ id: m[1], source: !!m[2] });
  b.translate = /translate\s*:\s*(yes|true)/i.test(langText);
  if (b.languages.length && !b.languages.some((l) => l.source)) b.languages[0].source = true;
  // 6 copy
  {
    const L = sections.get(6) ?? [];
    let slot: BriefSlot | null = null, body: string[] = [];
    const flush = () => {
      if (!slot) return;
      const rows = table(body);
      if (rows.length >= 2) {
        const head = rows[0];
        const langCols = head.map((h, i) => ({ h: clean(h), i })).filter((c) => /^[A-Z]{2}$/.test(c.h));
        const varCol = head.findIndex((h) => /variant|hook|cta|item|#/i.test(h));
        for (const r of rows.slice(1)) {
          const v = varCol >= 0 ? clean(r[varCol]) : '*';
          slot.variants[v] = slot.variants[v] ?? {};
          for (const c of langCols) if (r[c.i] !== undefined && !isDash(r[c.i])) slot.variants[v][c.h] = splitLines(r[c.i]);
        }
      } else {
        // bullets: "- H1: EN: a / b | DE: c" or "- EN: a / b"
        for (const l of body) {
          const m = /^\s*[-*]\s+(.+)$/.exec(l); if (!m) continue;
          let rest = m[1], v = '*';
          const vm = /^([A-Z]\d+|\d+)\s*:\s*(.+)$/.exec(rest); if (vm && !/^[A-Z]{2}$/.test(vm[1])) { v = vm[1]; rest = vm[2]; }
          for (const part of rest.split('|')) { const pm = /^\s*([A-Z]{2})\s*:\s*(.+)$/.exec(part); if (pm) { slot.variants[v] = slot.variants[v] ?? {}; slot.variants[v][pm[1]] = splitLines(pm[2]); } }
        }
      }
      b.copy.push(slot);
    };
    for (const l of L) {
      const m = /^###\s+`?([\w.\-]+)`?\s*(.*)$/.exec(l);
      if (m) {
        flush();
        const opts = m[2];
        const axis = /\bhook\b/i.test(opts) ? 'hook' : /\bcta\b/i.test(opts) ? 'cta' : /\bitems?\b/i.test(opts) ? 'items' : null;
        slot = { slot: m[1], axis, style: /style\s*:\s*([\w-]+)/i.exec(opts)?.[1] ?? null, variants: {} };
        body = [];
        continue;
      }
      body.push(l);
    }
    flush();
  }
  // 7 beats
  {
    const rows = table(sections.get(7) ?? []);
    if (rows.length >= 2) {
      const head = rows[0].map((h) => clean(h).toLowerCase());
      const ci = (re: RegExp) => head.findIndex((h) => re.test(h));
      const iBeat = ci(/^beat|^id/), iRole = ci(/role/), iSketch = ci(/sketch|preview/), iWhat = ci(/what|happens|action/);
      const lenCols = head.map((h, i) => ({ h: h.replace(/\s*s$/, ''), i })).filter((c) => /^\d+(\.\d+)?$/.test(c.h));
      for (const r of rows.slice(1)) {
        const id = clean(r[iBeat] ?? '');
        if (!id) continue;
        const durations: Record<string, number> = {};
        for (const c of lenCols) if (r[c.i] !== undefined && !isDash(r[c.i])) durations[c.h] = Number(r[c.i]);
        b.beats.push({ id, role: iRole >= 0 ? clean(r[iRole]) || id : id, sketch: iSketch >= 0 ? clean(r[iSketch]) : '', durations, what: iWhat >= 0 ? clean(r[iWhat]) : '' });
      }
    } else if (text(7)) b.problems.push('beats are not a table (| beat | role | sketch | <lengths> | what happens |)');
  }
  // 8 elements
  {
    const rows = table(sections.get(8) ?? []);
    if (rows.length >= 2) {
      const head = rows[0].map((h) => clean(h).toLowerCase());
      const ci = (re: RegExp) => head.findIndex((h) => re.test(h));
      const iName = ci(/name|element/), iBeat = ci(/^beat/), iWhat = ci(/what/), iSource = ci(/source/), iKey = ci(/key/), iNot = ci(/must|not/), iVar = ci(/variant/), iItem = ci(/^item/);
      for (const r of rows.slice(1)) {
        const name = clean(r[iName] ?? '');
        if (!name) continue;
        const sourceRaw = clean(r[iSource] ?? '');
        const source = (Object.keys(SOURCE_ROUTE) as Source[]).find((s) => s.toLowerCase() === sourceRaw.toLowerCase()) ?? null;
        const vr = iVar >= 0 ? clean(r[iVar] ?? '') : '';
        const byHook = /by hook/i.test(vr) ? Object.fromEntries([...vr.matchAll(/\b(H\d+)\s*[=→:]\s*([\w-]+)/g)].map((m) => [m[1], m[2]])) : null;
        // item: “window 0” — this element is item 0 of the list the element/layer “window” cycles through
        const ir = iItem >= 0 ? clean(r[iItem] ?? '') : '';
        const im = /^([\w.-]+)\s*[#.:\s]\s*(\d+)$/.exec(ir);
        if (ir && !isDash(ir) && !im) b.problems.push(`element ${name}: item “${ir}” is not like “window 0”`);
        b.elements.push({ item: im ? { list: im[1], index: Number(im[2]) } : null, name, beat: iBeat >= 0 && !isDash(r[iBeat] ?? '') ? clean(r[iBeat]) : null, what: clean(r[iWhat] ?? ''), source, sourceRaw, route: source ? SOURCE_ROUTE[source] : null, key_part: iKey >= 0 && !isDash(r[iKey] ?? '') ? clean(r[iKey]) : null, must_not: iNot >= 0 && !isDash(r[iNot] ?? '') ? clean(r[iNot]).split(/;|,\s(?=[a-z])/).map((x) => x.trim()).filter(Boolean) : [], by_hook: byHook });
      }
    } else if (text(8)) b.problems.push('elements are not a table (| name | beat | what | source | key part | must not | variants | item |)');
  }
  // 9 UI
  { const t = text(9); const j = /```json\s*([\s\S]*?)```/.exec(t); b.ui = { text: t.replace(/```json[\s\S]*?```/, '').trim(), json: null }; if (j) { try { b.ui.json = JSON.parse(j[1]); } catch (e) { b.problems.push(`UI json: ${(e as Error).message}`); } } }
  // 10 motion
  {
    let beat: string | null = null;
    for (const l of sections.get(10) ?? []) {
      const h = /^###\s+(.+)$/.exec(l); if (h) { beat = clean(h[1]); b.motion[beat] = []; continue; }
      const m = /^\s*[-*]\s+(.+)$/.exec(l); if (m && beat) b.motion[beat].push(clean(m[1]));
    }
  }
  // 11 groups
  for (const x of bullets(11)) { const m = /^([\w.\- ]+):\s*(.+)$/.exec(x); if (m) b.groups.push({ name: m[1].trim(), members: m[2].split(',').map((s) => s.trim()).filter(Boolean) }); }
  // 12 references
  b.references = bullets(12);
  return b;
}
