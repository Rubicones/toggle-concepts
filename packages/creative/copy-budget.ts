import {safeArea} from '../engine/safe-area';
import type {CampaignScope} from '../contracts/campaign';
import type {BrandSystem,CopyBudget} from '../contracts/creative-drafts';
export const cutdownRoles=(seconds:number)=>seconds<8?['hook','cta'] as const:['hook','demo','proof','cta'] as const;
/** Before writing, allow the tightest composition/placement, plus time to enter and settle. */
export function computeCopyBudget(brand:BrandSystem,scope:CampaignScope):CopyBudget{
 const entries:CopyBudget['entries']=[];
 for(const durationSeconds of scope.durationsSeconds){const roles=cutdownRoles(durationSeconds),beatSeconds=durationSeconds/roles.length;
  for(const locale of scope.locales)for(const placement of scope.placements)for(const beatRole of ['hook','demo','proof','offer','cta'] as const){
   const style=brand.styles[beatRole==='hook'?'headline':beatRole==='cta'?'cta':'body'],font=brand.fonts.find(f=>f.role===style.font),shortSide=Math.min(placement.width,placement.height),minFontPx=Math.max(shortSide*style.sizeU[0]/100,brand.limits.minTextPxByPlacement[placement.id]??16),maxLines=beatRole==='cta'?1:2;
   const safe=safeArea(brand,placement);
   const zoneName=beatRole==='cta'?'cta':'text',width=Math.min(...brand.compositions.filter(c=>c.formats.includes(placement.id)||c.formats.some(id=>{const [w,h]=id.split(':').map(Number);return w>0&&h>0&&Math.abs(w/h-placement.width/placement.height)<.01;})).map(c=>((c.zones[zoneName]?.[2]??.9)-(c.zones[zoneName]?.[0]??.1))*(placement.width-safe.left-safe.right)));
   const readingSeconds=Math.max(0,beatSeconds-brand.motion.durations.fast),byTime=Math.floor(readingSeconds*brand.limits.readingCps),byWidth=Math.floor(width/(minFontPx*(font?.averageAdvanceByScript[/^(ru|uk|bg|sr|mk|be)(-|$)/i.test(locale)?'cyrillic':'latin']??font?.averageAdvance??.52)))*maxLines;
   entries.push({beatRole,durationSeconds,placementId:placement.id,locale,maxChars:Math.max(0,Math.min(byTime,byWidth)),maxLines,minFontPx,readingSeconds});
  }
 }
 // Use the tightest placement for every variant group, so writing and compilation agree.
 for(const entry of entries){const group=entries.filter(e=>e.beatRole===entry.beatRole&&e.durationSeconds===entry.durationSeconds&&e.locale===entry.locale);entry.maxChars=Math.min(...group.map(e=>e.maxChars));}
 return {version:'budget@1',entries};
}
export function budgetFor(budget:CopyBudget,role:CopyBudget['entries'][number]['beatRole'],locale:string,duration:number,placement?:string){
 return budget.entries.filter(b=>b.beatRole===role&&b.locale===locale&&b.durationSeconds===duration&&(!placement||b.placementId===placement)).sort((a,b)=>a.maxChars-b.maxChars)[0];
}
