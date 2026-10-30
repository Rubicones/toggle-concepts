import {renderSlotId} from './slot-bindings';
import {draftEditsSchema,type DraftEdits} from '../contracts/draft-edits';
import type {CreativeDirection,DirectionProgram,FrameResource} from '../contracts/frame-program';
import type {BrandSystem,CopyBudget} from '../contracts/creative-drafts';
import type {CampaignScope,VariantEntry} from '../contracts/campaign';
import type {TextEngine} from '../engine/engine/textengine';
import type {ProtectedCopy} from './validate';
import {brandToKit} from '../engine/adapter';
import {compileDirection} from './compile-v2';
import {selectedEdit} from './to-engine';
export type EditPolicy={protectedCopy:ProtectedCopy[];approvedFacts:string[]};
const numbers=(text:string)=>text.match(/[-+]?\d+(?:[.,]\d+)?/g)??[];
/** Pure validation shared by browser and server. The saved agent source is never mutated. */
export function validateDraftEdits(edits:DraftEdits,direction:CreativeDirection,brand:BrandSystem,variants:VariantEntry[],policy:EditPolicy){
 const e=draftEditsSchema.parse(edits),kit=brandToKit(brand),allowed=new Set(policy.approvedFacts.flatMap(numbers));
 const assert=(ok:unknown,code:string)=>{if(!ok)throw new Error(code);};
 const unique=(items:string[])=>assert(new Set(items).size===items.length,'DUPLICATE_EDIT_TARGET');
 unique(e.motion.map(m=>m.beat));
 for(const m of e.motion)assert(direction.scenes.beats.some(b=>b.key===m.beat),'MOTION_EDIT_TARGET');
 unique(e.copy.map(c=>`${c.slot}|${c.variant}|${c.lang}`));unique(e.layers.map(l=>`${l.beat}|${l.layer}`));unique(e.frames.map(l=>`${l.beat}|${l.layer}`));unique(e.regions.map(r=>`${r.beat}|${r.region}`));unique(e.durations.map(d=>`${d.length}|${d.beat}`));
 for(const c of e.copy){
  const copy=direction.script.copy.find(x=>x.key===c.slot&&x.locale===c.lang);assert(copy,'COPY_EDIT_TARGET');if(!copy)continue;
  assert(!direction.skeleton?.beats.some(b=>b.copy.some(c=>c.id===copy.key&&c.locale===copy.locale&&c.locked)),'APPROVED_COPY_IMMUTABLE');
  assert(!['cta','legal'].includes(copy.slot)&&!policy.protectedCopy.some(p=>p.locale===copy.locale&&p.text===copy.text),'PROTECTED_COPY_IMMUTABLE');
  assert(c.variant==='*'||variants.some(v=>v.locale===c.lang&&(copy.slot==='hook'?v.hook===c.variant:v.offer===c.variant)),'COPY_VARIANT_TARGET');
  assert(c.lines.some(s=>s.trim()),'EMPTY_COPY');
  const original=new Set(numbers(copy.text));assert(numbers(c.lines.join(' ')).every(n=>original.has(n)||allowed.has(n)),'UNAPPROVED_NUMERIC_FACT');
 }
 for(const l of e.layers){const beat=direction.scenes.beats.find(b=>b.key===l.beat),layer=beat?.layers.find(x=>x.key===l.layer),comp=brand.compositions.find(c=>c.id===beat?.composition);assert(layer&&comp,'LAYER_EDIT_TARGET');if(l.zone)assert(comp?.zones[l.zone],'UNKNOWN_ZONE');if(l.style)assert(kit.styles[l.style],'UNKNOWN_STYLE');if(l.color)assert(kit.colors[l.color],'UNKNOWN_COLOR');if(l.fill)assert(kit.colors[l.fill],'UNKNOWN_COLOR');if(l.treatment)assert(kit.treatments[l.treatment],'UNKNOWN_TREATMENT');}
 for(const r of e.regions){const beat=direction.scenes.beats.find(b=>b.key===r.beat),comp=brand.compositions.find(c=>c.id===beat?.composition),region=comp?.regions.find(x=>x.id===r.region);assert(region&&region.paints.includes(r.paint),'REGION_PAINT_EDIT_TARGET');}
 const master=brand.compositions.length;assert(master,'COMPOSITION_REQUIRED');
 for(const f of e.frames)assert(direction.scenes.beats.find(b=>b.key===f.beat)?.layers.some(l=>l.key===f.layer),'FRAME_EDIT_TARGET');
 for(const d of e.durations){const v=variants.find(v=>String(v.durationSeconds)===d.length);assert(v,'DURATION_EDIT_TARGET');if(v)assert(selectedEdit(direction,v,30).beats.includes(d.beat),'DURATION_BEAT_TARGET');}
 for(const value of Object.values(e.data))assert(allowed.has(String(value)),'UNAPPROVED_NUMERIC_FACT');
 return e;
}
export function compileDraftEdits(direction:CreativeDirection,brand:BrandSystem,budget:CopyBudget,scope:CampaignScope,variants:VariantEntry[],engine:TextEngine,resources:FrameResource[],edits:DraftEdits,policy:EditPolicy):DirectionProgram{
 const overlay=validateDraftEdits(edits,direction,brand,variants,policy),source=structuredClone(direction);
 for(const edit of overlay.motion)Object.assign(source.scenes.beats.find(b=>b.key===edit.beat)!,{...(edit.recipe?{recipe:edit.recipe}:{}),...(edit.transitionOut?{transitionOut:edit.transitionOut}:{})});
 for(const edit of overlay.layers){const scene=source.scenes.beats.find(b=>b.key===edit.beat)!,l=scene.layers.find(l=>l.key===renderSlotId(source,edit.beat,edit.layer))!;Object.assign(l,Object.fromEntries(Object.entries(edit).filter(([k])=>!['beat','layer','camera'].includes(k))));if(edit.camera)scene.layers.find(l=>l.key===edit.layer)!.camera=edit.camera;}
 for(const edit of overlay.regions){const b=source.scenes.beats.find(b=>b.key===edit.beat)!;const r=b.regions.find(r=>r.id===edit.region);if(r)r.paint=edit.paint;else b.regions.push({id:edit.region,area:brand.compositions.find(c=>c.id===b.composition)!.regions.find(r=>r.id===edit.region)!.area,paint:edit.paint});}
 // The compiler applies frame/copy/duration overlays before planning, on both runtimes.
 return compileDirection(source,brand,budget,scope,variants,engine,resources,policy.protectedCopy,false,overlay,policy.approvedFacts);
}
