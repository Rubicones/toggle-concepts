import type {EngineConfig,Box,VariantState} from '../engine/types';
import type {TextEngine} from '../engine/engine/textengine';
import {buildFrame,timeline} from '../engine/engine/frame';
import {inter} from '../engine/engine/util';
/** Devices yield to measured copy before copy is moved. Preserve all layers and the device aspect. */
export function fitDevices(config:EngineConfig,engine:TextEngine,variants:VariantState[]){
 const seen=new Set<string>();
 for(const state of variants)for(const span of timeline(config,state.len)){
  const key=[state.fmt,state.lang,state.hook,state.cta,span.beat].join(':');if(seen.has(key))continue;seen.add(key);
  const beat=config.beats.find(b=>b.id===span.beat)!;
  const frame=buildFrame({cfg:config,engine},state,span.start+span.dur*.5),fmt=frame.fmt;
  const safe={x:fmt.safe.left+2,y:fmt.safe.top+2,w:fmt.w-fmt.safe.left-fmt.safe.right-4,h:fmt.h-fmt.safe.top-fmt.safe.bottom-4};
  const obstacles=frame.els.filter(e=>['text','logo','mark'].includes(e.kind)&&e.opacity>.01).map(e=>e.ink??e.box);
  for(const layer of beat.layers.filter(l=>l.kind==='ui'||l.kind==='object')){
   const placed=layer.per[state.fmt];if(!placed)continue;const original=placed.box;
   const fits=(b:Box)=>b.x>=safe.x&&b.y>=safe.y&&b.x+b.w<=safe.x+safe.w&&b.y+b.h<=safe.y+safe.h&&!obstacles.some(o=>{const i=inter(b,o);return i&&i.w>0&&i.h>0;});
   if(fits(original))continue;
   let best:Box|undefined;
   for(let n=100;n>=35&&!best;n--){const k=n/100,w=original.w*k,h=original.h*k;
    const xs=[original.x,original.x+(original.w-w)/2,safe.x,safe.x+safe.w-w,...obstacles.flatMap(o=>[o.x-w-4,o.x+o.w+4])];
    const ys=[original.y,original.y+(original.h-h)/2,safe.y,safe.y+safe.h-h,...obstacles.flatMap(o=>[o.y-h-4,o.y+o.h+4])];
    const candidates=xs.flatMap(x=>ys.map(y=>({x,y,w,h}))).filter(fits).sort((a,b)=>Math.hypot(a.x-original.x,a.y-original.y)-Math.hypot(b.x-original.x,b.y-original.y));best=candidates[0];
   }
   if(best)placed.box=best;
  }
 }
}
