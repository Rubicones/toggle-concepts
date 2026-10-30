import type { KitComposition } from '../types';
/** Neutral descendants of SOLA's window-over-band; paints are caller-owned kit references. */
export function templateCompositions(paints: string[]): KitComposition[] {
  const [surface = '#FFFFFF', text = '#000000'] = paints;
  const formats = ['4:5', '9:16', '1:1', '16:9'];
  return [
    { id: 'intake_window', label: 'Product window above a text band', technique: 'window', regions: [{ id: 'ground', area: 'full', depth: [1, 1], paints: [surface] }, { id: 'band', area: 'edge', side: 'bottom', depth: [0.36, 0.44], paints: [text] }], zones: { hero: [0.21, 0.136, 0.786, 0.551], text: [0.08, 0.625, 0.921, 0.8], cta: [0.08, 0.86, 0.8, 0.94], logo: [0.08, 0.06, 0.4, 0.12] }, formats, notes: 'Default proposal: product window, hook and CTA on the band. Confirm with the art director.' },
    { id: 'intake_split', label: 'Stacked split between product and words', technique: 'split', regions: [{ id: 'ground', area: 'full', depth: [1, 1], paints: [surface] }, { id: 'panel', area: 'edge', side: 'bottom', depth: [0.46, 0.5], paints: [text] }], zones: { hero: [0.1, 0.16, 0.9, 0.46], text: [0.1, 0.56, 0.9, 0.78], cta: [0.1, 0.84, 0.8, 0.94], logo: [0.08, 0.06, 0.4, 0.12] }, formats, notes: 'Default proposal: product above, words below in a stacked split. Confirm with the art director.' },
    { id: 'intake_panel', label: 'Product above a broad information panel', technique: 'panel', regions: [{ id: 'ground', area: 'full', depth: [1, 1], paints: [surface] }, { id: 'panel', area: 'edge', side: 'bottom', depth: [0.4, 0.46], paints: [text] }], zones: { hero: [0.15, 0.16, 0.85, 0.49], text: [0.1, 0.59, 0.9, 0.77], cta: [0.1, 0.84, 0.8, 0.94], logo: [0.08, 0.07, 0.4, 0.14] }, formats, notes: 'Default proposal: broad panel for the hook and CTA. Confirm with the art director.' },
  ];
}

import type { BrandColor, KitColor } from '../types';
import { contrastRatio, luminance, rgb } from '../engine/util';
export function roleColors(colors: Record<string, KitColor & Partial<Pick<BrandColor,'group'>>>) {
  const keys = Object.keys(colors), core = keys.filter(k=>colors[k].group === 'core'), pool = core.length ? core : keys;
  const role = (r:string) => keys.find(k=>colors[k].roles.includes(r));
  const field = role('field') ?? [...pool].sort((a,b)=>luminance(colors[a].hex)-luminance(colors[b].hex))[0] ?? '#000000';
  const fieldHex = colors[field]?.hex ?? field;
  const saturation = (key:string) => { const c=rgb(colors[key].hex);return (Math.max(...c)-Math.min(...c))/Math.max(1,Math.max(...c)); };
  const text = role('text') ?? [...keys].sort((a,b)=>contrastRatio(colors[b].hex,fieldHex)-contrastRatio(colors[a].hex,fieldHex))[0] ?? '#FFFFFF';
  const accent = role('accent') ?? [...pool].sort((a,b)=>saturation(b)-saturation(a))[0] ?? text;
  return {field,text,accent,surface:role('surface') ?? field,text_secondary:role('text_secondary') ?? text,line:role('line') ?? text,positive:role('positive') ?? accent,negative:role('negative') ?? accent};
}
export function libraryCompositions(colors: Record<string, KitColor & Partial<Pick<BrandColor,'group'>>>): KitComposition[] {
  const roles = roleColors(colors), formats = ['4:5','9:16','1:1','16:9'];
  const compositions: KitComposition[] = [
    ...templateCompositions(['@field','@surface']).map(c=>({...c,regions:c.regions.map(r=>r.area==='full' ? r : {...r,paints:['@surface','@text']})})),
    {id:'intake_full',label:'Full-bleed hero with a text scrim',technique:'full',regions:[{id:'ground',area:'full',depth:[1,1],paints:['@field']},{id:'scrim',area:'edge',side:'bottom',depth:[0.36,0.46],paints:['@surface']}],zones:{hero:[0,0,1,1],text:[0.08,0.64,0.92,0.8],cta:[0.08,0.85,0.8,0.94],logo:[0.08,0.06,0.4,0.13]},formats,notes:'Full-bleed hero; readable text and CTA on a scrim.'},
    {id:'intake_object',label:'Centred product on the brand ground',technique:'object',regions:[{id:'ground',area:'full',depth:[1,1],paints:['@field','@surface']}],zones:{hero:[0.22,0.2,0.78,0.65],text:[0.08,0.72,0.92,0.82],cta:[0.08,0.87,0.8,0.95],logo:[0.08,0.06,0.4,0.13]},formats,notes:'One centred product with words below.'},
    {id:'intake_panel_top',label:'Information panel above the product',technique:'panel',regions:[{id:'ground',area:'full',depth:[1,1],paints:['@field']},{id:'panel',area:'edge',side:'top',depth:[0.36,0.44],paints:['@surface','@accent']}],zones:{hero:[0.18,0.5,0.82,0.92],text:[0.08,0.17,0.92,0.29],cta:[0.08,0.33,0.8,0.4],logo:[0.08,0.05,0.4,0.12]},formats,notes:'Hook and CTA in a top panel; product below.'},
  ];
  return compositions.map(c=>({...c,regions:c.regions.map(r=>({...r,paints:r.paints.map(p=>p.startsWith('@') ? roles[p.slice(1) as keyof typeof roles] : p)}))}));
}
