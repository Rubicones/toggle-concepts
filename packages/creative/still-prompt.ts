/**
 * Image models answer a plain picture description far more reliably than a JSON pack (Gemini often replies with text
 * and "STOP" to structured prompts). The pack stays the idempotency key; this is only the words sent to the model.
 */
type Rect={x:number;y:number;w:number;h:number};
type Pack={purpose?:string;shot?:string;prompt?:string;compositionMap?:string;protectedArea?:Rect;cropMargins?:Rect;screenInsert?:string;
 look?:{treatment?:string;palette?:string[];light?:string};lighting?:string;prohibitions?:string[];aspectRatio?:string};
const pct=(n:number)=>`${Math.round(n*100)}%`;
const area=(r:Rect)=>`from ${pct(r.x)} to ${pct(r.x+r.w)} across and ${pct(r.y)} to ${pct(r.y+r.h)} down`;
export function stillPromptText(packJson:string):string{
 let pack:Pack;try{pack=JSON.parse(packJson) as Pack;}catch{return packJson;}
 const scene=(pack.shot||pack.prompt||pack.purpose||'').trim();
 const lines=[
  `Create one photographic still for a video ad, ${pack.aspectRatio??'1:1'} frame.`,
  `Scene (one single frame, not a collage): ${scene}`,
  pack.purpose&&pack.purpose!==scene?`What it must show: ${pack.purpose}`:'',
  pack.compositionMap?`Composition: ${pack.compositionMap}`:'',
  pack.cropMargins?`Keep every important subject inside the area ${area(pack.cropMargins)}; the edges may be cropped by a slow camera move.`:'',
  pack.screenInsert&&pack.protectedArea?`Leave the area ${area(pack.protectedArea)} as a plain, empty, evenly lit surface (a blank screen or wall): a real product screen is placed there later.`:'',
  pack.look?.treatment?`Visual style: ${pack.look.treatment}.`:'',
  (pack.look?.light||pack.lighting)&&!/^brand lighting$/i.test((pack.look?.light||pack.lighting||'').trim())?`Light: ${pack.look?.light||pack.lighting}.`:'',
  pack.look?.palette?.length?`Colour mood guided by these brand colours: ${pack.look.palette.join(', ')}.`:'',
  'Realistic people and places, natural expressions, high detail, draft resolution is fine.',
  `Do not include: ${[...new Set([...(pack.prohibitions??[]).map(p=>p.replace(/^(no|never( render)?|do not( include| show)?|avoid)\s+/i,'').replace(/\.$/,'')),'any text, letters, numbers, logos, watermarks or app interfaces'])].join('; ')}.`,
 ];
 return lines.filter(Boolean).join('\n').slice(0,6000);
}
