import type {BrandSystem,SceneSpecV2,DataFact} from '../contracts/creative-drafts';
import {normalizeSceneGraphic,brandIcons,brandMarks} from './normalize';
import type {CreativeDirection} from '../contracts/frame-program';
import type {CampaignScope,VariantEntry} from '../contracts/campaign';
import type {BriefV3,B3OnScreen} from '../engine/brief3/types';
import type {B2Cue} from '../engine/brief2/types';
import type {LayoutV1,L1Layer} from '../engine/layout/types';
import type {Platforms,Scenario,Cue,Technique} from '../engine/types';
import type {CompiledLayout} from '../engine/layout/compile';
import {safeArea} from '../engine/safe-area';
import {sequenceFrames} from './timeline';

/** Engine aliases always lead back to a saved authoring field, never a generated pixel box. */
export type CreativePathMap=Record<string,string>;
export function sourcePath(map:CreativePathMap,path:string):string{
 const match=Object.keys(map).sort((a,b)=>b.length-a.length).find(k=>path===k||path.startsWith(`${k}/`)||path.startsWith(`${k}.`)||path.startsWith(`${k} `));
 return match?map[match]:'scenes.beats';
}
const uniq=<T,>(a:T[])=>[...new Set(a)];
/** Layer keys repeat across beats (every scene may have an l0); the media, UI and parts they draw need one id per beat. */
export const assetId=(beat:string,layer:string)=>`${beat}_${layer}`;
type SceneLayer=SceneSpecV2['beats'][number]['layers'][number];
/** How a graphic/mark layer is drawn. Every route is drawable; unbound visuals become labelled stand-ins, never blanks. */
export type GraphicRoute={kind:'card';fact:DataFact;chart:'ring'|'bar'|'none'}|{kind:'icon'|'pattern';icon:string}|{kind:'mark';mark:string}|{kind:'standin';what:string};
export function graphicRoute(layer:SceneLayer,direction:CreativeDirection,brand:BrandSystem,verified:Map<string,DataFact>):GraphicRoute|null{
 if(!['graphic','mark','group','component'].includes(layer.kind))return null;
 const what=direction.script.beats.flatMap(b=>b.elements).find(e=>e.key===layer.element)?.what??layer.element;
 if(layer.kind==='mark')return brandMarks(brand)[layer.source]?{kind:'mark',mark:layer.source}:{kind:'standin',what};
 if(layer.kind!=='graphic')return {kind:'standin',what};
 const g=layer.graphic??normalizeSceneGraphic(undefined,what,brand,direction.script);
 if((g.type==='stat'||g.type==='chart')&&verified.has(g.data))return {kind:'card',fact:verified.get(g.data)!,chart:g.type==='chart'&&g.chart==='none'?'ring':g.chart};
 if(g.type==='icon'&&brandIcons(brand)[g.icon])return {kind:'icon',icon:g.icon};
 if(g.type==='pattern'){const icons=brandIcons(brand),pattern=Object.keys(icons).find(k=>icons[k].kind==='pattern');if(pattern)return {kind:'pattern',icon:pattern};}
 return {kind:'standin',what};
}
/** Storyboard visuals a beat would otherwise lose: a beat with only words gets a labelled stand-in in its free hero zone. */
export function storyboardStandins(direction:CreativeDirection,brand:BrandSystem){
 const out:{beat:string;id:string;what:string}[]=[];
 for(const scene of direction.scenes.beats){
  if(scene.layers.some(l=>!['text','logo'].includes(l.kind)))continue;
  const beat=direction.script.beats.find(b=>b.key===scene.key),composition=brand.compositions.find(c=>c.id===scene.composition);
  if(!beat||!composition?.zones.hero||scene.layers.some(l=>l.zone==='hero'))continue;
  const notes=(direction.script.sourceScenes??[]).filter(s=>beat.sourceSceneIds?.includes(s.sceneId)).map(s=>s.visualNotes.trim()).filter(Boolean).join(' · ');
  if(notes.length>=12)out.push({beat:scene.key,id:`sb_${scene.key}`,what:notes.slice(0,160)});
 }
 return out;
}
export function campaignPlatforms(brand:BrandSystem,scope:CampaignScope):Platforms{
 return {schema:'ad/platforms@1',version:1,profiles:Object.fromEntries(scope.placements.map(p=>[p.id,{label:p.id,w:p.width,h:p.height,safe:safeArea(brand,p),bitrate_mbps:8}])),defaults:Object.fromEntries(scope.placements.map(p=>[p.id,p.id])),render:{fps:scope.placements.find(p=>p.id===scope.referencePlacement)?.fps??30,keyframe_s:1}};
}
export function selectedEdit(d:CreativeDirection,v:VariantEntry,fps:number){
 const cut=d.script.cutdowns.find(c=>c.durationSeconds===v.durationSeconds);
 if(!cut)throw new Error('CUTDOWN_REQUIRED');
 const binding=d.script.bindings.find(b=>b.hookAxisId===v.hook&&b.offerAxisId===v.offer&&b.beatSequenceId===v.beatSequence&&b.durationSeconds===v.durationSeconds);
 if(d.script.bindings.length&&!binding)throw new Error('VARIANT_BINDING_REQUIRED');
 const hook=d.script.hooks.find(h=>h.hookAxisId===v.hook);
 const beats=binding?.beats??cut.beats.map(key=>d.script.beats.find(b=>b.key===key)?.role==='hook'&&hook?hook.beat:key);
 return {beats,seconds:sequenceFrames(d.script,{...(binding??cut),beats},fps).map(n=>n/fps),copyKeys:binding?.copyKeys??d.script.copy.filter(c=>beats.includes(c.beat)).map(c=>c.key)};
}
const emptyCue:Omit<B2Cue,'type'>={target:null,region:null,t:null,dur:null,curve:null,out:null,from_u:null,per_line:null,from:null,to:null,step:null,deg_s:null,amp_deg:null,amp_u:null,period:null,fps:null,loop:null,clip_in:null,ride:null,show:null,hide:null,transition:null,part:null,screen:null,count:null,fade:null,stagger:null,press:null};
export function sceneCue(q:SceneSpecV2['beats'][number]['cues'][number],brand:BrandSystem,seconds:number):B2Cue{
 const t=Math.min(q.at,Math.max(0,seconds-.1)),dur=Math.min(brand.motion.durations[q.duration],Math.max(.01,seconds-t));
 const c:B2Cue={...emptyCue,type:q.type,target:q.target,t,dur};
 switch(q.type){
  case 'rise':case 'drop':c.from_u=[q.amount];break;
  case 'move':c.from_u=[q.amount,0];break;
  case 'pop':c.from=.9;break;
  case 'scale':c.from=1;c.to=q.amount||1.04;break;
  case 'type_on':c.step=Math.min(.1,dur/8);c.dur=null;break;
  case 'float':c.amp_u=q.amount;c.period=q.period;break;
  case 'rock':case 'sway':c.type='rock';c.amp_deg=q.amount;c.period=q.period;break;
  case 'edge':c.target=null;c.region=q.target;c.from='out';c.to='rest';break;
  case 'edge_mark':c.target=null;c.region=q.target;c.show=t;c.t=null;c.dur=null;break;
  case 'items':c.target=null;c.period=q.period;c.transition='crossfade';break;
  case 'clip':c.clip_in=0;c.t=null;c.dur=null;break;
  case 'ui':c.part='*';c.screen='main';c.transition='fade';c.count=[t,dur];c.fade=[t,dur];break;
 }
 return c;
}
export function scriptToBrief3(direction:CreativeDirection,brand:BrandSystem,scope:CampaignScope,variants:VariantEntry[],verified:Map<string,DataFact>=new Map()){
 const standins=storyboardStandins(direction,brand);
 const pathMap:CreativePathMap={};
 const fps=campaignPlatforms(brand,scope).render.fps;
 const edits=uniq(variants.map(v=>v.durationSeconds)).map(length=>{const v=variants.find(v=>v.durationSeconds===length)!;return {length,...selectedEdit(direction,v,fps)};});
 const brief:BriefV3={schema:'ad/brief@3',id:direction.id,title:direction.script.oneLine,brand:brand.product.name,kit_version:1,texts_from:'client',idea:direction.script.oneLine,
  concept:{one_line:direction.script.oneLine,technique:direction.treatment.technique as Technique,tags:{material:direction.treatment.imagery.style,light:direction.treatment.imagery.treatment,density:'',tempo:direction.treatment.motionCharacter,mood:brand.voice.tone}},
  formats:scope.placements.map(p=>({id:p.id,profile:p.id,master:p.id===scope.referencePlacement})),lengths:edits.map(e=>e.length),lengths_beats:edits.map(e=>({length:e.length,beats:e.beats})),languages:scope.locales.map(id=>({id,source:id===scope.referenceLocale})),translate:false,
  copy:direction.script.copy.filter((c,i,a)=>a.findIndex(x=>x.key===c.key)===i).map(c=>({slot:c.key,axis:c.slot==='hook'?'hook':c.slot==='cta'?'cta':null,style:null,beat:c.beat,offer:c.slot==='cta',variants:[{variant:'*',text:direction.script.copy.filter(x=>x.key===c.key).map(x=>({lang:x.locale,lines:x.text.split('\n')}))},...c.short.filter(s=>s!==c.text).map((s,i)=>({variant:`short-${i}`,text:[{lang:c.locale,lines:s.split('\n')}]}))]})),
  hooks:direction.script.hooks.map(h=>({variant:h.hookAxisId,angle:'benefit',scene:h.beat})),
  beats:direction.script.beats.map((beat,bi)=>{const scene=direction.scenes.beats.find(b=>b.key===beat.key);pathMap[`beats.${beat.key}`]=`scenes.beats.${beat.key}`;pathMap[`brief/beats/${bi}`]=`script.beats.${beat.key}`;
   return {id:beat.key,role:beat.role==='demo'?'solution':beat.role==='cta'||beat.role==='offer'?'end':beat.role,one_line:beat.objective,focal:scene?.layers.find(l=>l.element===beat.focal)?.key??beat.focal,durations:edits.filter(e=>e.beats.includes(beat.key)).map(e=>({length:e.length,seconds:e.seconds[e.beats.indexOf(beat.key)]})),what:beat.elements.map(e=>e.what).join('; '),motion_notes:[direction.treatment.beatValues?.find(v=>v.beat===beat.key)?.motionCharacter??direction.treatment.motionCharacter],on_screen:(scene?.layers??[]).map(l=>{
    pathMap[`${beat.key}.${l.key}`]=`scenes.beats.${beat.key}.layers.${l.key}`;
    const media=direction.media.elements.find(m=>m.element===l.element),route=graphicRoute(l,direction,brand,verified);
    const kind:B3OnScreen['kind']=route?(route.kind==='card'?'ui':route.kind==='icon'||route.kind==='pattern'?'graphic':route.kind==='mark'?'mark':'media'):media?.source==='ui'&&media.ui?'ui':l.kind==='image'||l.kind==='video-proxy'||l.kind==='ui'?'media':l.kind as B3OnScreen['kind'];
    return {id:l.key,kind,slot:kind==='text'?l.source:null,asset:['media','ui','object'].includes(kind)?assetId(beat.key,l.key):null,item_bound:false,logo:kind==='logo'?(media?.reference||l.source):null,mark:route?.kind==='mark'?route.mark:null,graphic:route&&(route.kind==='icon'||route.kind==='pattern')?route.icon:null};}).concat(standins.filter(x=>x.beat===beat.key).map(x=>{pathMap[`${beat.key}.${x.id}`]=`scenes.beats.${beat.key}`;return {id:x.id,kind:'media' as const,slot:null,asset:x.id,item_bound:false,logo:null,mark:null,graphic:null};})),cues:scene?.cues.filter(c=>!['edge','edge_mark'].includes(c.type)).map(q=>sceneCue(q,brand,Math.max(...edits.filter(e=>e.beats.includes(beat.key)).map(e=>e.seconds[e.beats.indexOf(beat.key)]),1)))??[],never:scene?.never.filter(id=>scene.layers.some(l=>l.key===id))??[]};}),
  elements:[...direction.scenes.beats.flatMap(scene=>scene.layers.flatMap(l=>{const route=graphicRoute(l,direction,brand,verified);if(!['ui','image','video-proxy'].includes(l.kind)&&route?.kind!=='card'&&route?.kind!=='standin')return [];const el=direction.script.beats.find(b=>b.key===scene.key)?.elements.find(e=>e.key===l.element),media=direction.media.elements.find(m=>m.element===l.element);return [{id:assetId(scene.key,l.key),name:l.element,beat:scene.key,source:(media?.source==='ui'&&media.ui||route?.kind==='card'?'UI':route?.kind==='standin'||media?.source==='generate'||media?.source==='proxy'?'picture to generate':'file given') as import('../engine/intake/brief').Source,what:el?.what??l.element,key_part:null,must_not:brand.product.immutables,hooks:null,item:null,production:null,ui_spec_json:null}];})),
   ...standins.map(x=>({id:x.id,name:x.id,beat:x.beat,source:'picture to generate' as import('../engine/intake/brief').Source,what:x.what,key_part:null,must_not:brand.product.immutables,hooks:null,item:null,production:null,ui_spec_json:null}))],
  ui_strings:[],data_json:null,references:[],variation:{naming_template:'{scenario}_{format}_{hook}_{cta}_{lang}_{length}',expected_files:variants.length,asset_links:[],fixed:[],legal:direction.script.copy.filter(c=>c.slot==='legal').map(c=>({market:c.locale,slot:c.key})),ui_data_json:null},signature:direction.treatment.signature.mode==='use'&&direction.treatment.signature.ids[0]?{use:direction.treatment.signature.ids[0],candidates:null,none:null}:{use:null,candidates:null,none:'No approved signature selected.'},conversions:[],decisions:[],questions:direction.script.questions,summary:direction.script.oneLine};
 for(const [i,c]of brief.copy.entries())pathMap[`brief/copy/${i}`]=`script.copy.${c.slot}`;
 return {brief,pathMap};
}
export function scenesToLayout(direction:CreativeDirection,brand?:BrandSystem){
 const pathMap:CreativePathMap={},standins=brand?storyboardStandins(direction,brand):[];
 const layout:LayoutV1={schema:'ad/layout@1',scenario_id:direction.id,beats:direction.scenes.beats.map((b,bi)=>{
  pathMap[`/beats/${bi}`]=`scenes.beats.${b.key}`;
  b.layers.forEach((l,li)=>{pathMap[`/beats/${bi}/layers/${li}`]=`scenes.beats.${b.key}.layers.${l.key}`;});
  return {beat:b.key,composition:b.composition,regions:b.regions.map(r=>({id:r.id,paint:r.paint,depth:null})),layers:[...b.layers].sort((a,b)=>a.order-b.order).map((l):L1Layer=>({id:l.key,zone:l.zone,style:l.style,color:l.color,treatment:l.treatment??null,fill:l.fill??null,shape:['image','video-proxy'].includes(l.kind)?(l.shape??'rect') as 'rect'|'round'|'circle'|'arch':null,align:l.align??'left' as const,valign:l.valign??'top' as const,on:l.on??null})).concat(standins.filter(x=>x.beat===b.key).map((x):L1Layer=>({id:x.id,zone:'hero',style:null,color:null,treatment:null,fill:null,shape:'round' as const,align:'center' as const,valign:'center' as const,on:null}))),cues:[],never:b.never.filter(id=>b.regions.some(r=>r.id===id)),notes:[`Saved treatment: ${direction.treatment.technique}; ${direction.script.beats.find(s=>s.key===b.key)?.objective??b.key}`]};})};
 // Issue indices follow sorted render order.
 layout.beats.forEach((b,bi)=>b.layers.forEach((l,li)=>{pathMap[`/beats/${bi}/layers/${li}`]=l.id.startsWith('sb_')?`scenes.beats.${b.beat}`:`scenes.beats.${b.beat}.layers.${l.id}`;}));
 return {layout,pathMap};
}
export function briefScenario(brief:BriefV3,compiled:CompiledLayout,layout:LayoutV1):Scenario{
 const compactCue=(q:B2Cue):Cue=>Object.fromEntries(Object.entries(q).filter(([,v])=>v!==null)) as Cue;
 return {schema:'ad/scenario@1',scenario_id:brief.id,brand:brief.brand,title:brief.title,idea:brief.idea,master_format:brief.formats.find(f=>f.master)?.id??brief.formats[0].id,platforms:Object.fromEntries(brief.formats.map(f=>[f.id,f.profile??f.id])),variant_sets:{hooks:brief.hooks.map(h=>h.variant),ctas:uniq(brief.copy.filter(c=>c.axis==='cta').flatMap(c=>c.variants.map(v=>v.variant))).filter(v=>v!=='*'),languages:brief.languages.map(l=>l.id),formats:brief.formats.map(f=>f.id),lengths:brief.lengths.map(String)},naming:{template:brief.variation.naming_template,version:1},copy:Object.fromEntries(brief.copy.map(c=>[c.slot,Object.fromEntries(c.variants.map(v=>[v.variant,Object.fromEntries(v.text.map(t=>[t.lang,t.lines]))]))])),slot_axis:Object.fromEntries(brief.copy.map(c=>[c.slot,c.axis])),ui_strings:Object.fromEntries(uniq(brief.ui_strings.map(s=>s.key)).map(k=>[k,Object.fromEntries(brief.ui_strings.filter(s=>s.key===k).map(s=>[s.lang,s.text]))])),...(brief.data_json?{data:JSON.parse(brief.data_json)}:{}),assets:Object.fromEntries(brief.elements.map(e=>[e.id,{route:e.source==='UI'?'ui':e.source==='file given'?'file':'still',what:e.what,must_not:e.must_not}])),beats:brief.beats.map(b=>({id:b.id,role:b.role,sketch:'',durations:Object.fromEntries(b.durations.map(d=>[String(d.length),d.seconds])),layers:(compiled.layers[b.id]??[]).map(l=>Object.fromEntries(Object.entries({...l,...(l.asset?{asset:l.asset}:{} )}).filter(([,v])=>v!==null))) as unknown as Scenario['beats'][number]['layers'],motion:{plain:b.motion_notes,cues:[...b.cues,...(layout.beats.find(l=>l.beat===b.id)?.cues??[])].map(compactCue),never:uniq([...b.never,...(layout.beats.find(l=>l.beat===b.id)?.never??[])])}}))};
}
