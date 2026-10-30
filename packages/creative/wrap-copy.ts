import type {BriefV3} from '../engine/brief3/types';
import type {LayoutV1} from '../engine/layout/types';
import type {BrandSystem} from '../contracts/creative-drafts';
import type {TextEngine} from '../engine/engine/textengine';
/** Reflow at word boundaries before measuring the stack; approved words and their source records stay intact. */
export function wrapBriefCopy(brief:BriefV3,layout:LayoutV1,brand:BrandSystem,engine:TextEngine,masterWidth:number){
 for(const beat of brief.beats){const scene=layout.beats.find(b=>b.beat===beat.id),composition=brand.compositions.find(c=>c.id===scene?.composition);if(!scene||!composition)continue;
  for(const item of beat.on_screen){if(item.kind!=='text'||!item.slot)continue;const layer=scene.layers.find(l=>l.id===item.id),zone=layer&&composition.zones[layer.zone],copy=brief.copy.find(c=>c.slot===item.slot),style=brand.styles[(layer?.style??'body') as keyof BrandSystem['styles']];if(!zone||!copy||!style)continue;
   const width=(zone[2]-zone[0])*masterWidth*.88,size=style.sizeU[1]*10.8;
   const measure=(text:string)=>engine.shape(style.font,style.weight,text.replace(/\*/g,''),size).width;
   for(const variant of copy.variants)for(const text of variant.text){text.lines=text.lines.flatMap(line=>{const tokens=line.match(/\*[^*]+\*|\S+/g)??[],lines:string[]=[];let current='';for(const token of tokens){const next=current?`${current} ${token}`:token;if(current&&measure(next)>width){lines.push(current);current=token;}else current=next;}if(current)lines.push(current);return lines.length?lines:[line];});}
  }
 }
}

import type {EngineConfig,VariantState} from '../engine/types';
import {buildFrame,timeline} from '../engine/engine/frame';
import {inside} from '../engine/engine/crop';
import {inter} from '../engine/engine/util';
/** Give an undersized text box available width before asking for different copy. Never move its anchor into a device. */
export function fitTextWidths(config:EngineConfig,engine:TextEngine,variants:VariantState[]){
 const seen=new Set<string>();
 for(const state of variants)for(const span of timeline(config,state.len)){
  const key=[span.beat,state.fmt,state.lang,state.hook,state.cta].join(':');if(seen.has(key))continue;seen.add(key);
  const frame=buildFrame({cfg:config,engine},state,span.start+span.dur*.5),beat=config.beats.find(b=>b.id===span.beat)!,fmt=frame.fmt,safe={x:fmt.safe.left,y:fmt.safe.top,w:fmt.w-fmt.safe.left-fmt.safe.right,h:fmt.h-fmt.safe.top-fmt.safe.bottom};
  for(const element of frame.els.filter(e=>e.text&&!e.text.fitOk)){
   const layer=beat.layers.find(l=>l.id===element.id);if(!layer||layer.kind!=='text')continue;const placed=layer.per[state.fmt],box=placed?.box;if(!box)continue;
   const width=box.w*config.kit.layout.min_text_scale/element.text!.neededScale*1.02;
   const candidate={...box,w:width,x:placed.align==='right'?box.x+box.w-width:placed.align==='center'?box.x+(box.w-width)/2:box.x};
   const blockers=frame.els.filter(e=>e.id!==element.id&&e.opacity>.01&&['text','logo','mark','ui','object'].includes(e.kind));
   if(inside(candidate,safe,0)&&!blockers.some(e=>{const overlap=inter(candidate,e.ink??e.box);return overlap&&overlap.w>1&&overlap.h>1;}))placed.box=candidate;
  }
 }
}

import {checkAll} from '../engine/engine/checks';
/** Resolve measured text-to-text collisions without changing approved words or dropping a layer. */
export function fitTextCollisions(config:EngineConfig,engine:import('../engine/text-snapshot').GlyphEngine,variants:VariantState[]){
 for(let pass=0;pass<4;pass++){
  const findings=checkAll({cfg:config,engine},{variants}).findings.filter(f=>f.code==='L_OVERLAP');let changed=false;
  for(const f of findings){if(!f.beat||!f.element)continue;const beat=config.beats.find(b=>b.id===f.beat),state=f.variants[0];if(!beat||!state)continue;
   const frame=buildFrame({cfg:config,engine},state,f.t),a=frame.els.find(e=>e.id===f.element),otherId=f.message.match(/ and (\S+) overlap/)?.[1],b=frame.els.find(e=>e.id===otherId);
   if(!a?.text||!b?.text)continue;
   const chosen=beat.layers.find(l=>l.id===a.id&&l.kind==='text'&&l.style==='cta')?a:beat.layers.find(l=>l.id===b.id&&l.kind==='text'&&l.style==='cta')?b:a.box.y>b.box.y?a:b;
   const layer=beat.layers.find(l=>l.id===chosen.id);if(!layer||layer.kind!=='text')continue;const placed=layer.per[state.fmt],box=placed.box,ink=chosen.ink??chosen.box,safe={x:frame.fmt.safe.left,y:frame.fmt.safe.top,w:frame.fmt.w-frame.fmt.safe.left-frame.fmt.safe.right,h:frame.fmt.h-frame.fmt.safe.top-frame.fmt.safe.bottom},distance=(f.box?.h??12)+8;
   for(const dy of [distance,-distance]){const candidate={...box,y:box.y+dy},movedInk={...ink,y:ink.y+dy};if(!inside(movedInk,safe,0))continue;
    if(frame.els.some(e=>e.id!==chosen.id&&e.opacity>.01&&['text','logo','ui','object','mark'].includes(e.kind)&&inter(movedInk,e.ink??e.box)))continue;
    placed.box=candidate;changed=true;break;
   }
  }
  if(!changed)break;
 }
}
