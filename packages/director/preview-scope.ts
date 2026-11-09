import type {DirectionInput,Format,Variant} from './types';
/** New draft snapshots alone opt in. Full ordered scope remains on C1 and brief.orderedFormats. */
export const squarePreviewOnly=(input:Pick<DirectionInput,'stage'|'brief'>)=>input.stage==='draft'&&input.brief.squarePreviewVersion===1;
export function squarePreviewScope(formats:Format[],variants:Variant[]){
 const square=formats.find(f=>f.width===f.height)??{id:'square',width:1080,height:1080,fps:30,minTextPx:32,safe:{left:54,right:54,top:54,bottom:54}};
 const bindings=new Map<string,Variant>();
 for(const variant of variants){const key=JSON.stringify([variant.locale,variant.hook,variant.cta,variant.length]);if(!bindings.has(key)||variant.format===square.id)bindings.set(key,variant);}
 return {formats:[{...square,id:'square'}],variants:[...bindings.values()].map(v=>({...v,format:'square'}))};
}
export const squarePreviewInstructions='DRAFT SCOPE: Design, build and inspect only 1:1 square key frames now. Do not generate other aspect ratios or spend turns recomposing them. Preserve every scene of this selected direction; never import another direction’s scene or copy. ADAPTATION CONTRACT: Frame.tsx must accept width and height as runtime inputs and keep layout relationships, spacing and typography derived from them. Do not bake a 1080px canvas, a fixed square transform, rasterized text or per-format files into the component. Implement the square composition now; final production will author and verify the other ordered formats. Declare previewOptions.adaptive false: adaptation is deferred, not verified. Do not claim final-format coverage.';
