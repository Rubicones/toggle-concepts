import {renderSlotId} from './slot-bindings';
import {wrapBriefCopy,fitTextWidths,fitTextCollisions} from './wrap-copy';
import {completeBrandGraphics} from './brand-graphics';
import {applyMotionRecipes} from './motion-recipes';
import {fitDevices} from './device-layout';
import type {DraftEdits} from '../contracts/draft-edits';
import type {BrandSystem,CopyBudget,CreativeIssue} from '../contracts/creative-drafts';
import type {CreativeDirection,FrameProgram,FrameResource,DirectionProgram} from '../contracts/frame-program';
import type {Placement} from './types';
import type {CampaignScope,VariantEntry} from '../contracts/campaign';
import type {TextEngine} from '../engine/engine/textengine';
import type {EngineConfig,Scenario,UiSpec,UiComponent} from '../engine/types';
import {brandToKit} from '../engine/adapter';
import {checkAll} from '../engine/engine/checks';
import {compileLayout} from '../engine/layout/compile';
import {plan} from '../engine/plan/planner';
import {campaignPlatforms,scriptToBrief3,scenesToLayout,briefScenario,selectedEdit,sourcePath,graphicRoute,storyboardStandins,type CreativePathMap} from './to-engine';
import {verifiedData} from './data-facts';
import {contrastRatio,mix} from '../engine/engine/util';
import type {DataFact} from '../contracts/creative-drafts';
import {programViews} from './program-reader';
import {autoFixLayout} from './autofix';
import {validateRenderedCopy} from './build-integrity';
import type {ProtectedCopy} from './validate';

export function uiFromPlan(ui:NonNullable<CreativeDirection['media']['elements'][number]['ui']>):UiSpec{
 // A readable product screen: label rows with their values, real progress bars, chips and buttons, numbers that count.
 const width=900,height=width/ui.aspect,pad=48,gap=Math.max(56,Math.min(120,(height-2*pad)/Math.max(1,ui.panels.length)));
 return {device:ui.device==='desktop'?'laptop':ui.device==='none'?'card':ui.device,theme:'dark',screen_w:width,screen_h:height,screens:[{id:'main',components:ui.panels.flatMap<UiComponent>((p,i)=>{
  const y=pad+i*gap,h=gap*.8,common={id:p.key,x:pad,y,w:width-2*pad,h,key:true},label=Math.max(18,Math.min(30,h*.32)),n=Number(String(p.value).replace(/[^\d.-]/g,''));
  if(p.kind==='bar')return [{...common,id:`${p.key}.label`,type:'text' as const,h:label*1.3,text:p.label,size:label,weight:500,key:false},{...common,type:'bar' as const,y:y+label*1.5,h:Math.max(8,h*.18),value:p.progress,max:1}];
  if(p.kind==='button')return [{...common,h:Math.min(h,84),type:'button' as const,text:p.label}];
  if(p.kind==='chip')return [{...common,w:Math.min(width-2*pad,40+p.label.length*label*.62),h:Math.min(h,64),type:'chip' as const,text:p.label}];
  if(p.kind==='number'&&p.value&&Number.isFinite(n))return [{...common,id:`${p.key}.label`,type:'text' as const,h:label*1.3,text:p.label,size:label,weight:500,key:false},{...common,y:y+label*1.4,h:h-label*1.4,type:'number' as const,value:n,from:0,format:/%/.test(p.value)?'percent':Number.isInteger(n)?'int':'dec1',size:Math.min(72,h*.55),weight:800}];
  if(p.kind==='line')return [{...common,type:'text' as const,text:p.label,size:label,weight:400}];
  return [{...common,id:`${p.key}.label`,type:'text' as const,w:(width-2*pad)*.55,text:p.label,size:label,weight:500,key:false},...(p.value?[{...common,type:'text' as const,x:pad+(width-2*pad)*.55,w:(width-2*pad)*.45,text:p.value,size:label,weight:700,align:'right' as const}]:[])];
 })}],data:{}};
}
/** An infographic built from one verified script number: it counts up on the brand ground, with a ring or a bar. */
export function statCard(fact:DataFact,chart:'ring'|'bar'|'none',brand:BrandSystem,value=fact.value):UiSpec{
 const role=(r:string)=>brand.palette.find(c=>(c.roles as string[]).includes(r))??brand.palette[0],field=role('field'),accent=role('accent');
 const ink=[...brand.palette].sort((a,b)=>contrastRatio(b.hex,field.hex)-contrastRatio(a.hex,field.hex))[0],figure=contrastRatio(accent.hex,field.hex)>=3?accent:ink;
 const W=600,H=chart==='bar'?400:340,numW=chart==='ring'?340:W-80,max=fact.format==='percent'?100:Math.max(Math.abs(value),Math.abs(fact.from))*1.25||1;
 const shown=`${fact.format==='percent'?Math.round(value)+'%':fact.format==='money'?'$'+value:value}`;
 const unit=fact.unit&&!['%','percent'].includes(fact.unit.toLowerCase())&&fact.format!=='money'?`${fact.unit} `:'',text=`${unit}${fact.label}`.trim();
 const numberSize=Math.round(Math.min(140,numW/Math.max(2,shown.length*.62))),labelSize=Math.round(Math.max(22,Math.min(40,numW/Math.max(8,text.length*.5))));
 const components:UiComponent[]=[
  {id:'value',type:'number',x:40,y:30,w:numW,h:numberSize*1.15,value:{data:fact.key},format:fact.format,from:fact.from,size:numberSize,weight:800,color:figure.id},
  {id:'label',type:'text',x:40,y:40+numberSize*1.15,w:numW,h:labelSize*2.6,text,size:labelSize,weight:500,color:ink.id},
 ];
 if(chart==='ring')components.push({id:'ring',type:'ring',x:W-220,y:40,w:180,h:180,value:{data:fact.key},max,color:figure.id,track:mix(field.hex,ink.hex,.15),width:20});
 if(chart==='bar')components.push({id:'bar',type:'bar',x:40,y:H-70,w:W-80,h:26,value:{data:fact.key},max,color:figure.id,track:mix(field.hex,ink.hex,.15)});
 return {device:'card',theme:'light',screen_w:W,screen_h:H,screens:[{id:'main',components}],data:{[fact.key]:value}};
}

/** Populate outlines once per actual phrase/token/style, independent of duration and frame count. */
function prewarm(config:EngineConfig,engine:TextEngine){
 const shape=(font:string,weight:number,text:string)=>{engine.missing(font,weight,text);for(const g of engine.shape(font,weight,text,1).glyphs)engine.glyphPath(font,weight,g.gid);};
 for(const beat of config.beats)for(const layer of beat.layers)if(layer.kind==='text'){
  const st=config.kit.styles[layer.style];if(!st)continue;
  for(const byLang of Object.values(config.copy[layer.slot]??{}))for(const lines of Object.values(byLang))for(const line of [...lines,lines.join(' ')]){
   const plain=line.replace(/\*([^*]+)\*/g,'$1'),text=st.case==='upper'?plain.toUpperCase():st.case==='lower'?plain.toLowerCase():st.case==='title'?plain.replace(/\b\p{L}/gu,c=>c.toUpperCase()):plain;
   shape(st.font,st.weight,text);for(const token of text.split(/(\s+)/))if(token)shape(st.font,st.weight,token);
  }
 }
 // UI text uses the kit's UI font. All numeric glyphs are frozen, without inventing data.
 const font=config.kit.ui_kit.font;
 for(const ui of Object.values(config.ui))for(const screen of ui.screens)for(const c of screen.components){
  const raw='text' in c?c.text:'';if(typeof raw==='string')for(const token of [raw,...raw.split(/(\s+)/)])if(token)shape(font,'weight' in c&&typeof c.weight==='number'?c.weight:400,token);
 }
 for(const [key,unit]of engine.snapshot().units){const [font,weight]=key.split('\u001f');for(const g of unit.glyphs)engine.glyphPath(font,Number(weight),g.gid);}
 const snapshot=engine.snapshot();snapshot.fonts.sort(([a],[b])=>a.localeCompare(b));snapshot.units.sort(([a],[b])=>a.localeCompare(b));snapshot.paths.sort(([a],[b])=>a.localeCompare(b));return snapshot;
}

/** Shared deterministic layout/planner pipeline. Only ordered bindings are checked, never invented Cartesian edits. */
export function compileDirection(direction:CreativeDirection,brand:BrandSystem,budget:CopyBudget,scope:CampaignScope,variants:VariantEntry[],engine:TextEngine,resources:FrameResource[],protectedCopy:ProtectedCopy[]=[],repair=true,overlay?:DraftEdits,approvedFacts:string[]=[]):DirectionProgram{
 if(!variants.length)throw new Error('VARIANTS_REQUIRED');
 const authoring=direction;const renderOverlay=overlay?{...overlay,layers:overlay.layers.map(l=>({...l,layer:renderSlotId(authoring,l.beat,l.layer)})),frames:overlay.frames.map(f=>({...f,layer:renderSlotId(authoring,f.beat,f.layer)}))}:undefined;
 direction=direction.skeleton?montageRenderDirection(direction):completeBrandGraphics(direction,brand);
 engine.clearGlyphCache();
 const kit=brandToKit(brand),platforms=campaignPlatforms(brand,scope),fps=platforms.render.fps,issues:CreativeIssue[]=[],pathMap:CreativePathMap={},frames:DirectionProgram['frames']={};
 const add=(code:string,path:string,message:string,owner:CreativeIssue['owner']='compositor',severity:CreativeIssue['severity']='block')=>issues.push({code,path,message,owner,severity,fix:'Repair the saved source field within the approved script and brand system.'});
 // Numbers are drawn only when quoted from approved wording; the rest stay stand-ins and are listed for the AD.
 const facts=verifiedData(direction,protectedCopy,approvedFacts),verified=new Map(facts.verified.map(f=>[f.key,f]));
 for(const f of facts.rejected)issues.push({code:'DATA_UNVERIFIED',path:`script.data`,owner:'script',severity:'warn',message:`“${f.label}: ${f.value}” is not quoted from an approved fact, so it is not drawn.`,fix:'Confirm the claim in the brief facts, or quote its approved wording in sourceRef.'});
 for(const x of storyboardStandins(direction,brand))issues.push({code:'STORYBOARD_VISUAL_STANDIN',path:`scenes.beats.${x.beat}`,owner:'compositor',severity:'warn',message:`The storyboard shows “${x.what}”, but the scene has only words; a labelled stand-in holds its place.`,fix:'Add a visual element to this beat (product, UI, infographic or picture).'});
 // The port measures at a 1080 short side; scale its result to delivery pixels only once.
 for(const profile of Object.values(platforms.profiles)){const scale=1080/Math.min(profile.w,profile.h);profile.w*=scale;profile.h*=scale;for(const side of ['top','right','bottom','left'] as const)profile.safe[side]*=scale;}
 const groups=new Map<string,{edit:ReturnType<typeof selectedEdit>;variants:VariantEntry[]}>();
 for(const v of variants){const edit=selectedEdit(direction,v,fps),key=JSON.stringify({duration:v.durationSeconds,...edit});const group=groups.get(key);if(group)group.variants.push(v);else groups.set(key,{edit,variants:[v]});}
 let scenario:Scenario|undefined;const scenarioData:Record<string,number>={};
 const states:DirectionProgram['variants']=[];
 for(const [groupIndex,{edit,variants:vs}]of [...groups.values()].entries()){
  const v=vs[0],prefix=groups.size>1?`edit${groupIndex}.`:'',len=groups.size>1?`${v.durationSeconds}~${groupIndex}`:String(v.durationSeconds);
  const source=structuredClone(direction);source.script.beats=edit.beats.map(key=>source.script.beats.find(b=>b.key===key)!);source.scenes.beats=edit.beats.map(key=>source.scenes.beats.find(b=>b.key===key)!);
  const a=scriptToBrief3(source,brand,scope,vs,verified),b=scenesToLayout(source,brand);
  Object.assign(pathMap,a.pathMap,b.pathMap);
  // A copy slot carries every locale of the same saved beat/role. It never falls back to another beat.
  for(const beat of a.brief.beats)for(const item of beat.on_screen)if(item.kind==='text'){
   const original=direction.script.copy.find(c=>c.key===item.slot&&c.beat===beat.id),slot=a.brief.copy.find(c=>c.slot===item.slot);if(!slot||!original)continue;
   const localized=direction.script.copy.filter(c=>c.beat===beat.id&&c.slot===original.slot&&edit.copyKeys.includes(c.key));
   for(const lang of scope.locales){if(slot.variants[0].text.some(t=>t.lang===lang))continue;const matches=localized.filter(c=>c.locale===lang);if(matches.length===1)slot.variants[0].text.push({lang,lines:matches[0].text.split('\n')});}
  }
  for(const lb of b.layout.beats){const comp=kit.compositions?.find(c=>c.id===lb.composition);for(const r of comp?.regions??[])if(!lb.regions.some(x=>x.id===r.id))lb.regions.push({id:r.id,paint:r.paints[0],depth:null});}
  for(const edit of overlay?.copy??[]){const c=a.brief.copy.find(c=>c.slot===edit.slot);if(!c)continue;let variant=c.variants.find(v=>v.variant===edit.variant);if(!variant){variant={variant:edit.variant,text:[]};c.variants.push(variant);}variant.text=variant.text.filter(t=>t.lang!==edit.lang);variant.text.push({lang:edit.lang,lines:edit.lines});}
  wrapBriefCopy(a.brief,b.layout,brand,engine,platforms.profiles[scope.referencePlacement].w);
  const compiled=compileLayout(b.layout,a.brief,kit,platforms,engine);
  for(const i of compiled.issues)add(/needs .*zone|overflow/.test(i.message)?'TEXT_FIT':'LAYOUT',sourcePath(b.pathMap,i.path),i.message,'compositor',i.severity==='block'?'block':'warn');
  for(const edit of renderOverlay?.frames??[]){const frame=compiled.frames[edit.beat],element=frame?.elements.find(e=>e.id===edit.layer);if(!element)continue;if(edit.box.x+edit.box.w>frame.w||edit.box.y+edit.box.h>frame.h)throw new Error('FRAME_BOX_OUTSIDE_MASTER');element.box={...edit.box};element.raw={...edit.box};frame.source='layout';}
  const sc=briefScenario(a.brief,compiled,b.layout);
  sc.variant_sets.ctas=[...new Set(vs.map(v=>v.offer))];sc.variant_sets.lengths=[len];
  for(const beat of sc.beats){
   const originalId=beat.id,newId=prefix+originalId;
   pathMap[newId]=`scenes.beats.${originalId}`;
   const index=edit.beats.indexOf(originalId);beat.durations={[len]:overlay?.durations.find(d=>d.length===String(v.durationSeconds)&&d.beat===originalId)?.seconds??edit.seconds[index]};
   for(const layer of beat.layers){pathMap[`${newId}.${layer.id}`]=`scenes.beats.${originalId}.layers.${layer.id}`;
    const saved=direction.scenes.beats.find(b=>b.key===originalId)!.layers.find(l=>l.key===layer.id);
    if(!saved)continue;
    const route=graphicRoute(saved,source,brand,verified);
    if(layer.kind==='text'&&layer.slot){const c=sc.copy[layer.slot];const slot=prefix+layer.slot;sc.copy[slot]=c;if(slot!==layer.slot)delete sc.copy[layer.slot];sc.slot_axis??={};sc.slot_axis[slot]=sc.slot_axis[layer.slot]??null;layer.slot=slot;}
    if(layer.asset){const old=layer.asset,id=prefix+old,asset=sc.assets[old],media=direction.media.elements.find(m=>m.element===saved.element);if(!asset)continue;
     // The media plan decides how a visual is drawn: a UI recreation is a live screen, whatever kind the scene named.
     if(media?.source==='ui'&&media.ui){asset.ui=uiFromPlan(media.ui);if(!media.ui.panels.length)add('UI_EMPTY',`media.elements.${media.element}.ui`,'The UI has no visible controls.','media');}
     if(route?.kind==='card'){const shown=overlay?.data[route.fact.key];asset.ui=statCard(route.fact,route.chart,brand,typeof shown==='number'?shown:route.fact.value);scenarioData[route.fact.key]=route.fact.value;
      // An infographic always arrives: it fades in and counts up unless the scene already directs it.
      if(!beat.motion.cues.some(q=>q.type==='ui'&&q.target===layer.id)){const span=index>=0?edit.seconds[index]:1,fast=brand.motion.durations.fast,slow=Math.min(brand.motion.durations.slow,Math.max(.2,span-.3));beat.motion.cues.push({type:'ui',target:layer.id,part:'*',screen:'main',transition:'fade',t:Math.min(.15,span/4),dur:slow,count:[Math.min(.15,span/4),slow],fade:[0,fast]} as unknown as Scenario['beats'][number]['motion']['cues'][number]);}}
     const resource=resources.find(r=>r.revisionId===media?.reference);
     if(resource)asset.file=resource.revisionId;
     sc.assets[id]=asset;if(id!==old)delete sc.assets[old];layer.asset=id;if(layer.ui)layer.ui=id;
    }
   }
   // A '*' UI cue animates every control of its own target screen, never other screens in the beat.
   const uiCues=beat.motion.cues.flatMap(q=>{if(q.type!=='ui'||q.part!=='*')return [q];const target=beat.layers.find(l=>l.id===q.target) as {ui?:string;asset?:string}|undefined,spec=[target?.ui,target?.asset].map(k=>k&&sc.assets[k]?.ui).find(Boolean);return spec?spec.screens[0]?.components.map(c=>({...q,part:c.id}))??[]:[];});beat.motion.cues=uiCues;
   beat.id=newId;frames[newId]={...compiled.frames[originalId],beat:newId};
  }
  if(!scenario)scenario=sc;else{scenario.beats.push(...sc.beats);Object.assign(scenario.copy,sc.copy);Object.assign(scenario.slot_axis!,sc.slot_axis);Object.assign(scenario.assets,sc.assets);scenario.variant_sets.lengths.push(len);scenario.variant_sets.hooks=[...new Set([...scenario.variant_sets.hooks,...sc.variant_sets.hooks])];scenario.variant_sets.ctas=[...new Set([...scenario.variant_sets.ctas,...sc.variant_sets.ctas])];}
  for(const v of vs)states.push({variantId:v.id,state:{fmt:v.placementId,lang:v.locale,hook:v.hook,cta:v.offer,len},fps:scope.placements.find(p=>p.id===v.placementId)!.fps,durationSeconds:v.durationSeconds});
 }
 for(const length of scenario!.variant_sets.lengths){const sum=scenario!.beats.reduce((n,b)=>n+(b.durations[length]??0),0);if(Math.abs(sum-Number(length.split('~')[0]))>1e-6)throw new Error('CUTDOWN_DURATION_IMMUTABLE');}
 if(Object.keys(scenarioData).length)scenario!.data={...scenario!.data,...scenarioData};
 if(overlay&&Object.keys(overlay.data).length)scenario!.data={...scenario!.data,...overlay.data};
 const result=plan({scenario:scenario!,frames,kit,platforms,engine,check:false}),config=result.config;
 config.meta.draft_quality=true;
 // Stand-ins say what will be there, in the brand's own colours, so the AD reads the frame without generation.
 {const role=(r:string)=>brand.palette.find(c=>(c.roles as string[]).includes(r))??brand.palette[0],field=role('field'),ink=[...brand.palette].sort((a,b)=>contrastRatio(b.hex,field.hex)-contrastRatio(a.hex,field.hex))[0];
  for(const part of Object.values(config.parts))if(part.status==='standin'&&part.standin.kind==='procedural'){const what=(scenario!.assets[part.id]?.what??part.id).replace(/\s+/g,' ').trim();part.standin={kind:'procedural',color:mix(field.hex,ink.hex,.18),label:`Stand-in · ${what.length>90?what.slice(0,87)+'…':what}`};}
  for(const beat of config.beats)for(const layer of beat.layers)if(layer.kind==='graphic'&&layer.graphic.kind==='pattern'){const g=layer.graphic as {scale_u?:number;gap_u?:number};g.scale_u??=6;g.gap_u??=3;}}
 for(const fmt of config.formats){const delivery=scope.placements.find(p=>p.id===fmt.id)!,scale=Math.min(delivery.width,delivery.height)/1080;fmt.w=delivery.width;fmt.h=delivery.height;for(const side of ['top','right','bottom','left'] as const)fmt.safe[side]*=scale;
  for(const beat of config.beats){for(const l of beat.layers){const b=l.per[fmt.id]?.box;if(b){b.x*=scale;b.y*=scale;b.w*=scale;b.h*=scale;}}for(const r of beat.regions){if(r.area.kind==='edge')r.area.per[fmt.id].depth*=scale;if(r.area.kind==='shape'){const b=r.area.per[fmt.id].box;b.x*=scale;b.y*=scale;b.w*=scale;b.h*=scale;}}}
 }
 for(const part of Object.values(config.parts)){
  const asset=scenario!.assets[part.id],resource=resources.find(r=>r.revisionId===asset?.file);
  if(resource){Object.assign(part,{status:'approved',route:'file',file:resource.revisionId,width:resource.width,height:resource.height,media:resource.kind==='video'?'clip':'picture'});
   const saved=direction.media.elements.find(m=>m.reference===resource.revisionId);
   if(saved?.shotReferences&&saved.shotReferences.length>1){part.files=saved.shotReferences;part.media='frames';}
   part.fit=saved?.fit??'contain';
   const element=direction.script.beats.flatMap(b=>b.elements).find(e=>e.key===saved?.element);
   if(element?.kind==='product'&&resource.width&&resource.height&&resource.width/resource.height>3&&part.fit==='cover'){part.fit='contain';add('MEDIA_AUTOFIT',`media.elements.${saved!.element}.fit`,'Wide product contained on its approved ground.','code','warn');}
  }
 }
 for(const beat of config.beats)for(const layer of beat.layers)if(layer.kind==='media'){
  const part=config.parts[layer.part],row=direction.media.elements.find(m=>m.reference===part?.file);
  if(row?.ui&&row.promptPack){const id=`${beat.id}_${layer.id}_insert`;config.ui[id]=uiFromPlan({...row.ui,device:'none'});layer.screen_insert={ui:id,area:row.promptPack.protectedArea};const a=row.promptPack.protectedArea;part.key_part_box=[a.x,a.y,a.x+a.w,a.y+a.h];}
 }
 // Missing bindings stop the build. Space questions (a line or column that does not fit, a shrink limit, a collision step)
 // are drawn at the planner's best effort and stay visible to the AD, who fixes them in the editor.
 const structural=/names no UI element|has no element|no frame model|not reviewed|no scenario layer|beats add up|not in the kit|not given/;
 for(const q of result.report.questions)add('PLANNER_QUESTION',sourcePath(pathMap,q.where),q.rule,/reading/.test(q.rule)?'script':'compositor',structural.test(q.rule)?'block':'warn');
 for(const beat of config.beats)for(const layer of beat.layers)if(layer.kind==='media'){const savedLayer=direction.scenes.beats.flatMap(b=>b.layers).find(l=>l.key===layer.id),media=direction.media.elements.find(m=>m.element===savedLayer?.element);if(media)beat.regions.push({id:`${layer.id}-ground`,area:{kind:'shape',per:Object.fromEntries(Object.entries(layer.per).map(([fmt,p])=>[fmt,{box:{...p.box},shape:'rect' as const}]))},paint:media.ground});}
 fitDevices(config,engine,states.map(v=>v.state));
 fitTextWidths(config,engine,states.map(v=>v.state));
 applyMotionRecipes(config,direction,brand,false,renderOverlay);
 for(const beat of config.beats){const key=beat.id.replace(/^edit\d+\./,''),source=authoring.skeleton?.beats.find(b=>b.key===key),shots=source?.visuals.filter(v=>v.montage)??[];if(shots.length<2)continue;const layer=beat.layers.find(l=>l.id===shots[0].id);if(layer?.kind!=='media'||!config.parts[layer.part].files?.length)continue;
  config.parts[layer.part].frame_cameras=shots.map(shot=>{const choice=overlay?.layers.find(l=>l.beat===key&&l.layer===shot.id)?.camera??source?.camera??authoring.scenes.beats.find(b=>b.key===key)?.layers.find(l=>l.key===shot.id)?.camera??layer.camera?.type??'none';return choice==='none'||brand.motion.allowedCues.includes(/pan|tilt/.test(choice)?'move':'scale')?choice:'none';});
 }
 fitTextCollisions(config,engine,states.map(v=>v.state));
 const checked=checkAll({cfg:config,engine},{variants:states.map(v=>v.state)});
 // A draft keeps going on space and framing findings the AD fixes in the editor: copy below the minimum scale, and text
 // crossing the backing card of a media window (that card is ours, not a brand region). Overlaps, zones and contrast still stop it.
 const soft=(f:{code:string;message:string})=>f.code==='L_TEXT_FIT'||f.code==='L_REGION'&&/-ground\b/.test(f.message);
 for(const f of checked.findings)add(f.code,sourcePath(pathMap,`${f.beat??''}${f.element?`.${f.element}`:''}`),f.message,'compositor',soft(f)?'warn':f.severity);
 const used=new Set([...direction.media.elements.flatMap(e=>e.shotReferences??[]),...brand.logos.map(l=>l.revisionId),...brand.fonts.flatMap(f=>f.files.map(file=>file.revisionId)),...direction.media.elements.map(e=>e.reference)]);
 const program:DirectionProgram={version:'frame-program@2',directionId:direction.id,title:direction.script.oneLine,config,variants:variants.map(v=>states.find(s=>s.variantId===v.id)!),issues:[],pathMap,glyphs:prewarm(config,engine),resources:resources.filter(r=>used.has(r.revisionId)),frames,resourceContracts:direction.scenes.resourceContracts};
 issues.push(...programViews(program).flatMap(p=>validateRenderedCopy(direction,p,protectedCopy)));
 program.issues=[...new Map(issues.map(i=>[`${i.code}:${i.path}:${i.message}`,i])).values()];
 if(repair){let last=program;autoFixLayout(direction,brand,d=>{last=d===direction?program:compileDirection(d,brand,budget,scope,variants,engine,resources,protectedCopy,false,overlay,approvedFacts);return programViews(last);});return last;}
 return program;
}

/** Historical API adapter. New builds call compileDirection once and persist only that shared config. */
export function compileVariant(direction:CreativeDirection,brand:BrandSystem,budget:CopyBudget,placement:Placement,variant:VariantEntry,engine:TextEngine,resources:FrameResource[],protectedCopy:ProtectedCopy[]=[]):FrameProgram{
 const scope:CampaignScope={schemaVersion:'1.0',revisionId:'compat',campaignId:direction.id,draftConceptCount:3,finalConceptCount:1,referencePlacement:placement.id,referenceLocale:variant.locale,locales:[variant.locale],hooks:[variant.hook],beatSequences:[variant.beatSequence],offers:[variant.offer],durationsSeconds:[variant.durationSeconds],placements:[placement],combinationMode:'explicit_manifest',requestedFinalVideoCount:1};
 const shared=compileDirection(direction,brand,budget,scope,[variant],engine,resources,protectedCopy);
 const view=programViews(shared)[0],edit=selectedEdit(direction,variant,placement.fps);
 // Legacy inspection tools still display their saved scene-copy metadata.
 view.scenes=edit.beats.map((key,i)=>({schemaVersion:'1.0',sceneId:`${direction.id}.${key}`,revisionId:`${direction.id}.${variant.id}.${key}`,semanticRole:direction.script.beats.find(b=>b.key===key)!.role,scriptRevisionId:direction.id,brandRevisionId:brand.revisionId,durationFrames:Math.round(edit.seconds[i]*placement.fps),fps:placement.fps,seed:0,locale:variant.locale,placementId:placement.id,width:placement.width,height:placement.height,stage:'draft',mandatoryCopyKeys:direction.script.copy.filter(c=>c.beat===key&&c.locale===variant.locale&&['cta','legal'].includes(c.slot)).map(c=>c.key),copy:Object.fromEntries(direction.script.copy.filter(c=>c.beat===key&&c.locale===variant.locale).map(c=>[c.key,c.text])),slots:[],layers:[],assets:[],resourceContracts:direction.scenes.resourceContracts,fontAssetRevisionIds:brand.fonts.flatMap(f=>f.files.map(v=>v.revisionId)),fallbackPolicy:'review-required-for-visual-change'}));
 return view;
}

/** A montage slot is one still. The display list sequences the slot files in one shared camera window. */
function montageRenderDirection(source:CreativeDirection){
 const d=structuredClone(source);
 // One visible copy run can serve a graphic caption and its immutable copy slot. Keep both authoring slots, draw once.
 for(const scene of d.scenes.beats){const sources=new Set<string>();scene.layers=scene.layers.filter(l=>{if(l.kind!=='text')return true;if(sources.has(l.source))return false;sources.add(l.source);return true;});}
 for(const b of d.skeleton!.beats){const ui=b.visuals.find(v=>v.kind==='ui');if(ui&&b.visuals.some(v=>v.kind!=='ui'&&d.media.elements.some(r=>r.element===v.id&&r.ui&&r.promptPack)))d.scenes.beats.find(scene=>scene.key===b.key)!.layers=d.scenes.beats.find(scene=>scene.key===b.key)!.layers.filter(l=>l.element!==ui.id);}
 for(const beat of d.skeleton!.beats){const shots=beat.visuals.filter(v=>v.montage);if(shots.length<2)continue;const first=d.media.elements.find(e=>e.element===shots[0].id);if(!first)continue;
  first.shotReferences=shots.map(s=>d.media.elements.find(e=>e.element===s.id)?.reference).filter((r):r is string=>!!r);
  const scene=d.scenes.beats.find(b=>b.key===beat.key)!;scene.layers=scene.layers.filter(l=>!shots.slice(1).some(v=>v.id===l.element));
 }
 return d;
}
