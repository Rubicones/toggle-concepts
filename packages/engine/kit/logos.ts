import type { Box, Kit, KitLogo } from '../types';
import { contrastRatio, hexOf, luminance } from '../engine/util';
/** Explicit layout choices win; otherwise match role and the ground behind the logo. */
export function pickLogo(kit: Kit, ground: string, want: {logo?:string;role?:KitLogo['role'];color?:string} = {}): {logo:string;color:string|null;warn:string|null} {
  const keys=Object.keys(kit.logos), role=want.role ?? 'primary', groundKind=luminance(ground)<0.5 ? 'dark':'light';
  const candidates=keys.filter(k=>(kit.logos[k].role ?? 'primary')===role);
  const logo = want.logo !== undefined ? want.logo : candidates.find(k=>kit.logos[k].ground===groundKind) ?? candidates.find(k=>(kit.logos[k].ground ?? 'any')==='any') ?? candidates.find(k=>kit.logos[k].mode !== 'as_drawn') ?? keys[0] ?? '';
  const chosen=kit.logos[logo];
  if (!chosen) return {logo,color:null,warn:'No logo is available'};
  if (chosen.mode==='as_drawn') return {logo,color:null,warn:chosen.ink && contrastRatio(chosen.ink,ground)<3 ? `${logo}: as-drawn logo has low contrast on ${ground}` : null};
  const color=want.color ?? kit.logo_rules.colors.find(c=>contrastRatio(hexOf(kit,c),ground)>=kit.contrast.flat) ?? (contrastRatio('#FFFFFF',ground)>=contrastRatio('#000000',ground) ? '#FFFFFF':'#000000');
  return {logo,color,warn:null};
}

/** Region paint at the logo zone's centre, shared by layout compilation and planning. */
export function logoGround(kit: Kit, regions: {box:Box;z:number;paint:string;kind:string}[], box:Box): string {
  const cx=box.x+box.w/2, cy=box.y+box.h/2;
  const region=[...regions].sort((a,b)=>b.z-a.z).find(r=>r.paint!=='content' && cx>=r.box.x && cx<r.box.x+r.box.w && cy>=r.box.y && cy<r.box.y+r.box.h) ?? regions.find(r=>r.kind==='full');
  const paint=region ? kit.paints[region.paint] : undefined;
  const color=paint?.kind==='flat' || paint?.kind==='pattern' || paint?.kind==='texture' ? paint.color : paint?.kind==='gradient' ? paint.stops[0]?.color : region?.paint;
  const fallback=Object.values(kit.colors).find(c=>c.roles.includes('field'))?.hex ?? '#000000';
  return color && (kit.colors[color] || /^#[0-9a-f]{6}$/i.test(color)) ? hexOf(kit,color) : fallback;
}
