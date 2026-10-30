import {normalizeMotionChoices,motionEnum,cameraNames} from './motion-recipes';
import type {BrandSystem,ScriptSpecV2,CreativeTreatment} from '../contracts/creative-drafts';
import {finalResourceContractSchema} from '../contracts/scene';
import {contrastRatio} from '../engine/engine/util';
import {graphicDefaults} from '../brand/graphic-vocabulary';
import {dataFormats} from '../contracts/creative-drafts';
import {numbersIn} from './data-facts';

/**
 * Free L0 normalization of the visual stages, applied to the raw model answer before strict parsing.
 * Models regularly return hex values instead of palette keys, style names instead of style keys,
 * harmless naming differences. Missing layer or media bindings remain visible to validation;
 * normalization must never replace a missing creative decision with an arbitrary asset.
 */
/** Bump when local normalization changes, so stopped local builds are rebuilt once for free. */
export const COMPILE_L0_VERSION='m07g.g5.2';
type Raw=Record<string,unknown>;
const obj=(v:unknown):Raw=>v&&typeof v==='object'&&!Array.isArray(v)?v as Raw:{};
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const str=(v:unknown,fallback=''):string=>typeof v==='string'?v:typeof v==='number'?String(v):fallback;
const num=(v:unknown,fallback:number):number=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&Number.isFinite(Number(v))?Number(v):fallback;
const lower=(v:unknown)=>str(v).trim().toLowerCase();
const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const roleWords:[RegExp,string][]=[[/field|background|bg|paper|canvas|base/,'field'],[/surface|panel|card/,'surface'],[/ink|text|fg|foreground|type|copy/,'ink'],[/accent|cta|highlight|primary|brand|lime/,'accent']];

export function paletteKey(brand:BrandSystem,value:unknown,role:string){
 const v=str(value).trim();if(brand.palette.some(c=>c.id===v))return v;
 const hex=v.match(/#?([0-9a-f]{6})\b/i)?.[1];
 if(hex){const target=rgb(`#${hex}`);const exact=brand.palette.find(c=>c.hex.slice(1).toLowerCase()===hex.toLowerCase());if(exact)return exact.id;
  return [...brand.palette].sort((a,b)=>rgb(a.hex).reduce((n,x,i)=>n+(x-target[i])**2,0)-rgb(b.hex).reduce((n,x,i)=>n+(x-target[i])**2,0))[0]?.id??v;}
 const byName=brand.palette.find(c=>c.id.toLowerCase()===v.toLowerCase());if(byName)return byName.id;
 const named=roleWords.find(([re])=>re.test(v.toLowerCase()))?.[1]??role;
 return (brand.palette.find(c=>(c.roles as string[]).includes(named))??brand.palette.find(c=>(c.roles as string[]).includes(role))??brand.palette[0])?.id??v;
}
export function styleKey(brand:BrandSystem,value:unknown,fallback='body'){
 const v=str(value).trim(),keys=Object.keys(brand.styles);if(keys.includes(v))return v;
 const l=v.toLowerCase(),guess=/sub/.test(l)?'subhead':/head|title|hook|display|hero/.test(l)?'headline':/cta|button|action/.test(l)?'cta':/legal|fine|disclaim|terms/.test(l)?'legal':/body|copy|text|caption|label|para/.test(l)?'body':fallback;
 return keys.includes(guess)?guess:keys.includes(fallback)?fallback:keys[0]??v;
}
export function compositionKey(brand:BrandSystem,value:unknown,fallback?:string){
 const v=str(value).trim();if(brand.compositions.some(c=>c.id===v))return v;
 const l=v.toLowerCase(),fuzzy=l?brand.compositions.find(c=>c.id.toLowerCase()===l||c.label.toLowerCase()===l||c.technique===l):undefined;
 return fuzzy?.id??(!v&&fallback?fallback:v);
}
const beatStyle=(role:string)=>role==='hook'?'headline':role==='cta'?'cta':'body';
/** Paints the scenes may use: palette colours plus the brand's graphic vocabulary (gradients, bands, patterns). */
// Brand systems saved before M07d have no graphic vocabulary; they read as empty, never as a crash.
export const brandIcons=(brand:BrandSystem):BrandSystem['icons']=>brand.icons??{};
export const brandMarks=(brand:BrandSystem):BrandSystem['marks']=>brand.marks??{};
export function brandPaints(brand:BrandSystem){return {...graphicDefaults(brand.palette).paints,...brand.paints};}
export function brandTreatments(brand:BrandSystem){return {...graphicDefaults(brand.palette).treatments,...brand.treatments};}
/** The hex a paint shows under text (a gradient's first stop, a pattern's ground). */
export function paintHex(brand:BrandSystem,id:string):string|undefined{
 const colour=(v:string)=>brand.palette.find(c=>c.id===v)?.hex??(/^#[0-9a-f]{6}$/i.test(v)?v:undefined);
 const direct=colour(id);if(direct)return direct;const p=brandPaints(brand)[id];if(!p)return undefined;
 return p.kind==='flat'?colour(p.color):p.kind==='gradient'?colour(p.stops[0].color):p.kind==='pattern'?colour(p.bg):colour(p.color);
}
/** Script numbers: keys d0..d7, numeric values, a known format and a quoted source. Verification happens at compile. */
export function normalizeScriptDataRaw(input:unknown):unknown{
 const raw=obj(input);if(!Array.isArray(raw.data)){return raw.data===undefined||raw.data===null?{...raw,data:[]}:input;}
 const used=new Set<string>(),items=arr(raw.data).map(obj).flatMap(d=>{
  const value=typeof d.value==='number'&&Number.isFinite(d.value)?d.value:numbersIn(str(d.value))[0],label=str(d.label).trim().slice(0,80);
  if(value===undefined||!Number.isFinite(value)||!label)return [];
  const unit=str(d.unit).trim().slice(0,16),given=lower(d.format);
  const format=(dataFormats as readonly string[]).includes(given)?given:/%|percent/.test(unit+given)?'percent':/[$€£₽¥]|usd|eur|gbp|money|price/i.test(unit+given)?'money':Number.isInteger(value)?'int':'dec1';
  return [{key:str(d.key),label,value,unit,from:num(d.from,0),format,sourceRef:(str(d.sourceRef).trim()||label).slice(0,400)}];
 });
 // Valid keys the scenes may already reference are kept; the rest get the free slots.
 const kept=items.slice(0,8).map(d=>{const ok=/^d[0-7]$/.test(d.key)&&!used.has(d.key);if(ok)used.add(d.key);return ok?d:{...d,key:''};});
 const out=kept.map(d=>{if(d.key)return d;let key='';for(let i=0;i<8;i++)if(!used.has(`d${i}`)){key=`d${i}`;break;}used.add(key);return {...d,key};});
 return {...raw,data:out};
}
const graphicWords:[RegExp,'stat'|'chart'|'icon'|'pattern'|'standin'][]=[[/stat|number|counter|count|kpi|metric|figure|percent|score|big.?num/,'stat'],[/chart|graph|ring|donut|doughnut|progress|bar|pie|gauge|meter/,'chart'],[/icon|pictogram|symbol|glyph/,'icon'],[/pattern|texture|ornament|motif/,'pattern'],[/stand.?in|placeholder|illustration|picture|image|scene|shot|visual/,'standin']];
/** A graphic layer always becomes something drawable: an infographic, a brand icon or pattern, or a labelled stand-in. */
export function normalizeSceneGraphic(value:unknown,what:string,brand:BrandSystem,script:ScriptSpecV2):{type:'stat'|'chart'|'icon'|'pattern'|'standin';chart:'ring'|'bar'|'none';data:string;icon:string}{
 const g=obj(value),words=`${lower(g.type)} ${lower(g.chart)}`,data=script.data??[];
 let type=graphicWords.find(([re])=>re.test(lower(g.type)))?.[1];
 const byKey=data.find(d=>d.key===str(g.data)),byText=data.find(d=>numbersIn(what).some(n=>Math.abs(n-d.value)<1e-9))??data.find(d=>d.label.toLowerCase().split(/\W+/).filter(w=>w.length>3).some(w=>what.toLowerCase().includes(w)));
 const fact=byKey??byText??(data.length===1&&/stat|number|counter|kpi|metric|figure|percent|chart|graph|ring|bar|progress/.test(words)?data[0]:undefined);
 if(!type)type=fact?(/chart|graph|ring|bar|progress/.test(what.toLowerCase())?'chart':'stat'):/icon/.test(what.toLowerCase())?'icon':/pattern|texture/.test(what.toLowerCase())?'pattern':'standin';
 if((type==='stat'||type==='chart')&&!fact)type='standin';
 const icons=brandIcons(brand),icon=Object.keys(icons).find(k=>k===str(g.icon))??(type==='icon'?Object.keys(icons).find(k=>icons[k].kind==='icon'):undefined);
 if(type==='icon'&&!icon)type='standin';
 if(type==='pattern'&&!Object.values(icons).some(i=>i.kind==='pattern'))type='standin';
 const chart:'ring'|'bar'|'none'=type==='chart'?(/bar/.test(words+what.toLowerCase())?'bar':'ring'):type==='stat'&&/ring|donut|progress/.test(words)?'ring':'none';
 return {type,chart,data:(type==='stat'||type==='chart')&&fact?fact.key:'',icon:type==='icon'&&icon?icon:''};
}

export function normalizeTreatmentRaw(input:unknown,brand:BrandSystem,script:ScriptSpecV2|undefined):unknown{
 if(!script)return input;
 const raw=obj(input),out:Raw={...raw,version:'treatment@1',technique:str(raw.technique,'editorial'),motionCharacter:str(raw.motionCharacter,'calm'),transitions:arr(raw.transitions).map(t=>str(t)).filter(Boolean)};
 out.compositionsByBeat=arr(raw.compositionsByBeat).map(value=>compositionKey(brand,value));
 const palette=obj(raw.palette);out.palette=Object.fromEntries(['field','surface','ink','accent'].map(role=>[role,paletteKey(brand,palette[role],role)]));
 const elements=new Map(script.beats.flatMap(b=>b.elements.map(e=>[e.key,{...e,role:b.role}] as const)));
 const roles=arr(raw.typeRoles).map(obj).filter(r=>elements.has(str(r.element))).map(r=>({element:str(r.element),style:styleKey(brand,r.style,beatStyle(elements.get(str(r.element))!.role))}));
 for(const [key,e] of elements)if(e.kind==='text'&&!roles.some(r=>r.element===key))roles.push({element:key,style:styleKey(brand,beatStyle(e.role))});
 out.typeRoles=[...new Map(roles.map(r=>[r.element,r])).values()];
 const imagery=obj(raw.imagery);out.imagery={style:str(imagery.style,'brand'),crop:['cover','contain'].includes(str(imagery.crop))?imagery.crop:'cover',treatment:str(imagery.treatment,'as supplied')};
 out.signature={mode:'none',ids:[]};
 return out;
}

const layerKind=(value:unknown,elementKind:string)=>{const l=lower(value);
 if(['text','logo','image','video-proxy','ui','graphic','mark'].includes(l))return l;
 if(/video|clip|footage/.test(l))return 'video-proxy';if(/photo|image|picture|media|product|still/.test(l))return 'image';if(/screen|ui|interface|app/.test(l))return 'ui';if(/logo|wordmark/.test(l))return 'logo';if(/text|copy|headline|cta|label/.test(l))return 'text';
 return elementKind==='text'?'text':elementKind==='logo'?'logo':elementKind==='ui'?'ui':['product','media'].includes(elementKind)?'image':'graphic';};
const zoneFor=(zones:string[],kind:string,style:string,value:unknown)=>{const v=str(value);if(zones.includes(v))return v;
 const wanted=kind==='text'?[style,'headline','copy','text','body','cta']:kind==='logo'?['logo','mark','brand']:kind==='ui'||kind==='image'||kind==='video-proxy'?['media','product','ui','hero','object','window','visual']:['graphic','background','media'];
 return wanted.map(w=>zones.find(z=>z.toLowerCase().includes(w))).find(Boolean)??zones[0]??v;};

export function normalizeScenesRaw(input:unknown,brand:BrandSystem,script:ScriptSpecV2|undefined,treatment:CreativeTreatment|undefined):unknown{
 if(!script)return input;
 const raw=obj(input),beats=arr(raw.beats).map(obj);
 const out:Raw={...raw,version:'scene@2',stage:['draft','final'].includes(str(raw.stage))?raw.stage:'draft',direction:script.direction,
  // Final-resource contracts only matter for finals; incomplete ones (nulls for unused video fields) are dropped from drafts.
  resourceContracts:arr(raw.resourceContracts).filter(c=>finalResourceContractSchema.safeParse(c).success)};
 out.beats=script.beats.map((sb,i)=>{
  // Scene beats are matched by key; a renumbered answer (b0,b1,… for script beats b0,b2,…) is matched by position.
  const keyed=new Set(script.beats.map(b=>b.key)),rb=beats.find(b=>b.key===sb.key)??(beats[i]&&!keyed.has(str(beats[i].key))?beats[i]:{}),compositionId=compositionKey(brand,rb.composition,treatment?.compositionsByBeat[i]),composition=brand.compositions.find(c=>c.id===compositionId),zones=Object.keys(composition?.zones??{});
  if(!composition)return {...rb,key:sb.key,composition:compositionId};
  const paints=brandPaints(brand),treatments=brandTreatments(brand);
  // Brand paints (gradient, band, pattern) are kept; anything else resolves to a palette colour.
  const regions=arr(rb.regions).map(obj).flatMap(r=>{const known=composition.regions.find(c=>c.id===str(r.id));if(!known)return [];const p=str(r.paint).trim();return [{id:known.id,area:known.area,paint:paints[p]||known.paints.includes(p)?p:paletteKey(brand,r.paint,'field')}];});
  // Every element of this script beat gets exactly one layer: layers are collected from wherever the answer put them,
  // text bound to this beat's copy adopts an unrepresented text element, and still-missing elements get a default layer.
  // Models sometimes swap fields: the element key in "key" and an asset or copy alias in "element". Read it the way it was meant.
  const known=new Set(script.beats.flatMap(b=>b.elements.map(e=>e.key))),fix=(l:Raw):Raw=>!known.has(str(l.element))&&known.has(str(l.key))?{...l,element:str(l.key),key:''}:l;
  const mine=new Map(sb.elements.map(e=>[e.key,e])),copyKeys=new Set(script.copy.filter(c=>c.beat===sb.key).map(c=>c.key)),own=arr(rb.layers).map(obj).map(fix);
  const candidates=[...own,...beats.filter(b=>b!==rb).flatMap(b=>arr(b.layers).map(obj).map(fix)).filter(l=>mine.has(str(l.element)))],taken=new Set<string>(),given:Raw[]=[];
  for(const l of candidates)if(mine.has(str(l.element))&&!taken.has(str(l.element))){taken.add(str(l.element));given.push(l);}
  for(const l of own)if(!mine.has(str(l.element))&&copyKeys.has(str(l.source))){const free=sb.elements.find(e=>e.kind==='text'&&!taken.has(e.key));if(free){taken.add(free.key);given.push({...l,element:free.key});}}
  const boundCopy=new Set(given.map(l=>str(l.source))),logoId=brand.logos[0]?.id??'';
  for(const e of sb.elements){if(taken.has(e.key))continue;
   const copy=e.kind==='text'?script.copy.find(c=>c.beat===sb.key&&!boundCopy.has(c.key)&&(c.slot==='cta'||c.slot==='legal'||c.slot==='hook'))??script.copy.find(c=>c.beat===sb.key&&!boundCopy.has(c.key)):undefined;
   if(e.kind==='text'&&!copy)continue;if(copy)boundCopy.add(copy.key);
   taken.add(e.key);given.push({key:`l${e.key}`,element:e.key,kind:e.kind==='product'||e.kind==='media'?'image':e.kind,zone:'',order:given.length,style:copy?.slot==='cta'?'cta':copy?.slot==='legal'?'legal':copy?.slot==='hook'?'headline':copy?'body':beatStyle(sb.role),color:'',source:copy?.key??(e.kind==='logo'?logoId:e.key),registryId:''});
  }
  const used=new Set<string>();
  const layers=given.map((l,order)=>{
   const element=str(l.element),e=sb.elements.find(e=>e.key===element),kind=layerKind(l.kind,e?.kind??''),style=styleKey(brand,l.style,beatStyle(sb.role));
   let key=str(l.key);if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(key)||used.has(key))key=`l${order}`;used.add(key);
   const source=str(l.source);
   const layer:Raw&{key:string;element:string;kind:string;zone:string;style:string;color:string;source:string}={key,element,kind,zone:zoneFor(zones,kind,style,l.zone),order:Math.round(num(l.order,order)),style,color:paletteKey(brand,l.color,kind==='text'?'ink':'accent'),source,registryId:str(l.registryId)};
   // Art direction the scene chose is kept when it names the brand's own vocabulary.
   const camera=motionEnum(l.camera,cameraNames);if(camera)layer.camera=camera;
   if(kind==='text'&&treatments[str(l.treatment)])layer.treatment=str(l.treatment);
   if(kind==='text'&&str(l.fill)&&brand.palette.some(c=>c.id===str(l.fill)))layer.fill=str(l.fill);
   if(['image','video-proxy'].includes(kind)&&['rect','round','circle','arch'].includes(lower(l.shape)))layer.shape=lower(l.shape);
   if(['left','center','right'].includes(lower(l.align)))layer.align=lower(l.align);
   if(['top','center','bottom'].includes(lower(l.valign)))layer.valign=lower(l.valign);
   if(composition.regions.some(r=>r.id===str(l.on)))layer.on=str(l.on);
   if(kind==='graphic')layer.graphic=normalizeSceneGraphic(l.graphic,e?.what??'',brand,script);
   return layer;
  });
  // A text layer bound to another beat's copy takes this beat's unbound copy instead (the element stays the same).
  {const bound=new Set(layers.filter(l=>l.kind==='text'&&copyKeys.has(l.source)).map(l=>l.source));
   for(const l of layers)if(l.kind==='text'&&!copyKeys.has(l.source)){const next=script.copy.find(c=>c.beat===sb.key&&!bound.has(c.key));if(next){l.source=next.key;bound.add(next.key);}}
   // Two text layers on the same copy: the second shows this beat's next unshown copy (one slot is drawn once per beat).
   const seen=new Set<string>();for(const l of layers)if(l.kind==='text'){if(seen.has(l.source)){const next=script.copy.find(c=>c.beat===sb.key&&!bound.has(c.key));if(next){l.source=next.key;bound.add(next.key);}}seen.add(l.source);}}
  // Zones: text shares a zone only with text (it is stacked); logo and marks each need their own area; media sits in the hero.
  const slotOf=(k:string)=>script.copy.find(c=>c.key===k)?.slot,occupied=new Map<string,string[]>();
  for(const layer of [...layers].sort((a,b)=>(a.kind==='text'?0:a.kind==='logo'?1:a.kind==='graphic'||a.kind==='mark'?3:2)-(b.kind==='text'?0:b.kind==='logo'?1:b.kind==='graphic'||b.kind==='mark'?3:2))){
   const slot=slotOf(layer.source),wanted=layer.kind==='text'?(slot==='cta'||layer.style==='cta'?'cta':slot==='legal'||layer.style==='legal'?'legal':'text'):layer.kind==='logo'?'logo':'hero';
   let zone=zones.includes(wanted)?wanted:layer.zone;
   const clash=(z:string)=>(occupied.get(z)??[]).some(k=>layer.kind==='text'?k!=='text':k==='text'||k==='logo'||((k==='graphic'||k==='mark')&&(layer.kind==='graphic'||layer.kind==='mark'||layer.kind==='logo')));
   if(clash(zone)){const free=zones.filter(z=>!['text','cta','legal'].includes(z)||layer.kind==='text').find(z=>!clash(z));if(free)zone=free;}
   layer.zone=zone;occupied.set(zone,[...(occupied.get(zone)??[]),layer.kind]);
  }
  // Text and logo colours must read against what is drawn under them.
  const hexOf=(id:string)=>paintHex(brand,id),field=(treatment&&hexOf(treatment.palette.field))??brand.palette.find(c=>(c.roles as string[]).includes('field'))?.hex??'#000000';
  const groundAt=(zone:string)=>{const z=composition.zones[zone];if(!z)return field;const cx=(z[0]+z[2])/2,cy=(z[1]+z[3])/2;let ground=field;
   for(const r of regions){const spec=composition.regions.find(c=>c.id===r.id);if(!spec)continue;const depth=(spec.depth[0]+spec.depth[1])/2,covers=spec.area==='full'||spec.side==='bottom'&&cy>=1-depth||spec.side==='top'&&cy<=depth||spec.side==='left'&&cx<=depth||spec.side==='right'&&cx>=1-depth;if(covers)ground=hexOf(r.paint)??ground;}
   return ground;};
  for(const layer of layers)if(layer.kind==='text'||layer.kind==='logo'){const ground=groundAt(layer.zone),current=hexOf(layer.color);if(!current||contrastRatio(current,ground)<4.5){const best=[...brand.palette].sort((a,b)=>contrastRatio(b.hex,ground)-contrastRatio(a.hex,ground))[0];if(best&&(!current||contrastRatio(best.hex,ground)>contrastRatio(current,ground)))layer.color=best.id;}}
  const targets=new Set([...layers.map(l=>l.key),...regions.map(r=>r.id)]),byElement=new Map(layers.map(l=>[l.element,l.key]));
  const cues=arr(rb.cues).map(obj).map(c=>{const target=targets.has(str(c.target))?str(c.target):byElement.get(str(c.target))??str(c.target),type=lower(c.type).replace(/[\s-]+/g,'_');
   return {target,type,at:Math.max(0,num(c.at,0)),duration:['fast','medium','slow'].includes(str(c.duration))?c.duration:'medium',amount:num(c.amount,1),period:Math.max(.01,num(c.period,1))};}).filter(c=>targets.has(c.target));
  // The opening frame must show the hook and the logo: no entrance animation on them in the hook beat.
  if(sb.role==='hook'){const hookCopy=new Set(script.copy.filter(c=>c.beat===sb.key&&c.slot==='hook').map(c=>c.key)),still=new Set(layers.filter(l=>l.kind==='logo'||l.kind==='text'&&hookCopy.has(l.source)).map(l=>l.key));for(let k=cues.length-1;k>=0;k--)if(still.has(cues[k].target))cues.splice(k,1);}
  const never=arr(rb.never).map(v=>str(v)).map(v=>targets.has(v)?v:byElement.get(v)).filter((v):v is string=>!!v);
  return {key:sb.key,...normalizeMotionChoices(rb),composition:composition.id,regions,layers,cues,never:[...new Set(never)]};
 });
 return out;
}

const fitRect=(value:unknown,fallback:{x:number;y:number;w:number;h:number})=>{const r=obj(value),x=Math.min(1,Math.max(0,num(r.x,fallback.x))),y=Math.min(1,Math.max(0,num(r.y,fallback.y)));const w=Math.min(1-x,Math.max(.01,num(r.w,fallback.w))),h=Math.min(1-y,Math.max(.01,num(r.h,fallback.h)));return {x,y,w:w>0?w:fallback.w,h:h>0?h:fallback.h};};
const device=(value:unknown,aspect:number)=>{const l=lower(value);if(['phone','tablet','desktop','none'].includes(l))return l;if(/phone|mobile|iphone|android|ios/.test(l))return 'phone';if(/tablet|ipad/.test(l))return 'tablet';if(/desktop|laptop|web|browser|mac|pc|monitor|screen/.test(l))return 'desktop';return aspect<.8?'phone':aspect>1.2?'desktop':'none';};
type Alias={key:string;width:number;height:number;revisionId?:string};
export function normalizeMediaRaw(input:unknown,brand:BrandSystem,script:ScriptSpecV2|undefined,assets:(string|Alias)[]):unknown{
 if(!script)return input;
 const aliases=assets.map(a=>typeof a==='string'?{key:a,width:0,height:0}:a);
 const raw=obj(input),given=arr(raw.elements).map(obj),visuals=script.beats.flatMap(b=>b.elements);
 const aliasKey=(value:unknown)=>aliases.find(a=>a.key===str(value)||'revisionId' in a&&a.revisionId===str(value))?.key??str(value);
 const elements=given.map(r=>{
  const element=str(r.element),e=visuals.find(e=>e.key===element),source=lower(r.source);
  const reference=source==='asset'?aliasKey(r.reference):str(r.reference);
  let promptPack=source==='generate'||source==='proxy'?obj(r.promptPack):null;
  if(promptPack){const prohibitions=arr(promptPack.prohibitions).map(p=>str(p)).filter(Boolean);if(!prohibitions.some(p=>/text/i.test(p)))prohibitions.push('No text or lettering');if(!prohibitions.some(p=>/logo/i.test(p)))prohibitions.push('No logos or brand marks');promptPack={...promptPack,prohibitions};}
  let ui=['ui','generate','proxy'].includes(source)&&r.ui?obj(r.ui):null;
  if(ui){const ref=aliasKey(ui.referenceRevisionId),alias=aliases.find(a=>a.key===ref),aspect=num(ui.aspect,alias?.width&&alias.height?alias.width/alias.height:9/19.5);
   ui={device:device(ui.device,aspect),aspect:aspect>0?aspect:1,referenceRevisionId:ref,panels:arr(ui.panels).map(obj).map((p,i)=>({key:/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(str(p.key))?str(p.key):`p${i}`,label:str(p.label),value:str(p.value),kind:['label','bar','line','button','number','chip'].includes(str(p.kind))?p.kind:'label',progress:Math.min(1,Math.max(0,num(p.progress,0)))}))};}
  if(promptPack)promptPack={purpose:str(promptPack.purpose,e?.what??''),references:arr(promptPack.references).map(aliasKey),compositionMap:str(promptPack.compositionMap),protectedArea:fitRect(promptPack.protectedArea,{x:.1,y:.1,w:.8,h:.8}),cropMargins:fitRect(promptPack.cropMargins,{x:.05,y:.05,w:.9,h:.9}),lighting:str(promptPack.lighting),prohibitions:promptPack.prohibitions as string[],prompt:str(promptPack.prompt,e?.what??'')};
  return {element,source,reference,...(Array.isArray(r.shots)?{shots:r.shots}:{}),...(Array.isArray(r.shotReferences)?{shotReferences:r.shotReferences}:{}),...(r.generation?{generation:r.generation}:{}),fit:['cover','contain'].includes(str(r.fit))?r.fit:e?.kind==='ui'||e?.kind==='product'?'contain':'cover',ground:paletteKey(brand,r.ground,'field'),promptPack,ui,contract:source==='proxy'?r.contract??null:null};
 });
 // Rows for elements the frozen script does not draw from media (unknown, text, graphic, or a beat merged away) are dropped,
 // duplicates keep their first row, and a kit logo element without a row gets the kit logo. Other missing visuals stay visible to validation.
 const drawable=new Set(visuals.filter(e=>e.kind!=='text'&&e.kind!=='graphic').map(e=>e.key)),seen=new Set<string>();
 // An issued element key that no longer needs media is dropped; a generic name (hero, logo) is a decision to bind, not discard.
 const issued=(k:string)=>/^e\d+$/.test(k)||visuals.some(e=>e.key===k);
 const kept=elements.filter(r=>{if(seen.has(r.element)||!drawable.has(r.element)&&issued(r.element))return false;seen.add(r.element);return true;});
 // A generic logo row binds the first logo element that has none.
 for(const r of kept)if(r.source==='logo'&&!drawable.has(r.element)){const free=visuals.find(e=>e.kind==='logo'&&!seen.has(e.key));if(free){seen.add(free.key);r.element=free.key;}}
 for(const e of visuals)if(e.kind==='logo'&&!seen.has(e.key)&&brand.logos[0])kept.push({element:e.key,source:'logo',reference:brand.logos[0].id,fit:'contain',ground:paletteKey(brand,'','field'),promptPack:null,ui:null,contract:null});
 return {...raw,version:'media@1',elements:kept};
}
