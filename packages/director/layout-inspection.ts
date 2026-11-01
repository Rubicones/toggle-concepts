/**
 * Rendering-free layout inspection for live drafts. The compiled Frame is mounted in a headless browser and its DOM
 * geometry is read for a bounded matrix of views. This module chooses the views, provides the in-page collector and
 * turns raw geometry into objective findings. It measures and reports only: it never moves, resizes or restyles
 * anything, and it does not choose a creative technique.
 */
import type {DirectionInput,Variant} from './types';
import type {LiveFrameProps,LiveOptions} from './live-preview';
import {liveFormat,liveReferenceVariant,readyLiveVariants} from './live-preview';
import type {ImageFacts} from './image-facts';

export type Box={x:number;y:number;width:number;height:number};
export type InspectionView={key:string;label:string;variantId:string;props:LiveFrameProps;ordered:boolean;shot:boolean};
export type RawText={text:string;box:Box;fontSize:number;color:string;element:number;clipped:boolean;lines:number;background:string|null;complexBackground:boolean;overImage:string|null};
export type RawImage={src:string;box:Box;naturalWidth:number;naturalHeight:number;objectFit:string;objectPosition:string;logo:boolean};
export type RawView={width:number;height:number;texts:RawText[];images:RawImage[];logos:{id:string;box:Box}[]};
export type FindingCode='COPY_MISSING'|'TEXT_CLIPPED'|'TEXT_OFF_CANVAS'|'TEXT_OVERLAP'|'TEXT_OVER_LOGO'|'TEXT_TOO_SMALL'|'TEXT_OUTSIDE_SAFE_AREA'|'LOW_CONTRAST'|'CONTRAST_OVER_PICTURE'|'LOGO_MISSING'|'PICTURE_UPSCALED'|'SUBJECT_CROPPED'|'RENDER_ERROR';
export type Finding={code:FindingCode;severity:'hard'|'soft';view:string;detail:string};
export type ViewReport={view:string;label:string;findings:Finding[];texts:number;images:number};
export type InspectionSummary={version:1;revision:string;views:number;hard:number;soft:number;reports:ViewReport[]};

const MAX_VIEWS=60,MAX_SHOTS=6;
const textLength=(input:DirectionInput,variant:Variant)=>Object.values(input.variantFacts?.[variant.id]?.sceneCopy??{}).flat().join(' ').length;
function momentOf(design:{keyFrames?:{sceneId:string;moments:{id:string}[]}[]},sceneId:string){return design.keyFrames?.find(k=>k.sceneId===sceneId)?.moments[0]?.id??'main';}
const sizeLabel=(w:number,h:number)=>{const g=(a:number,b:number):number=>b?g(b,a%b):a,d=g(w,h);return `${w/d}:${h/d}`;};

/**
 * A bounded, deterministic matrix: every ordered format and scene for the reference copy, the longest copy binding in
 * every ordered format, alternate hook narratives, and two intermediate canvases that test continuous adaptation.
 * At most six views are marked for screenshots (only used by the critic).
 */
export function inspectionViews(input:DirectionInput,options:LiveOptions,design:{keyFrames?:{sceneId:string;moments:{id:string}[]}[]}):InspectionView[]{
 const ready=readyLiveVariants(input.variants,options),reference=liveReferenceVariant(input.variants,options);if(!reference||!ready.length)return [];
 const scenes=options.scenes.length?options.scenes:[design.keyFrames?.[0]?.sceneId??''];
 const sizes=[...new Map(input.formats.map(f=>[`${f.width}x${f.height}`,{width:f.width,height:f.height,ordered:true}])).values()];
 const widest=Math.max(...sizes.map(s=>s.width/s.height)),tallest=Math.min(...sizes.map(s=>s.width/s.height));
 const extras=[{width:1080,height:Math.round(1080/Math.max(tallest,0.5625)*0.86)},{width:Math.round(1080*Math.min(widest,1.78)*0.85),height:1080}]
  .filter(s=>s.width>=200&&s.height>=200&&s.width<=2400&&s.height<=2400&&!sizes.some(x=>Math.abs(x.width/x.height-s.width/s.height)<0.08)).map(s=>({...s,ordered:false}));
 const binding=(v:Variant)=>`${v.locale}|${v.hook}|${v.cta}|${v.length}`;
 const longest=[...ready].sort((a,b)=>textLength(input,b)-textLength(input,a))[0];
 const alternates=ready.filter(v=>input.variantFacts?.[v.id]?.storyboard&&binding(v)!==binding(reference)).filter((v,i,all)=>all.findIndex(o=>o.hook===v.hook)===i);
 const views:InspectionView[]=[],seen=new Set<string>();
 const add=(variant:Variant,size:{width:number;height:number;ordered:boolean},sceneId:string)=>{
  const props:LiveFrameProps={format:liveFormat(size.width,size.height),locale:variant.locale,hook:variant.hook,cta:variant.cta,length:variant.length,width:size.width,height:size.height,sceneId,moment:momentOf(design,sceneId)};
  const key=`${binding(variant)}|${size.width}x${size.height}|${sceneId}`;if(seen.has(key)||views.length>=MAX_VIEWS)return;seen.add(key);
  views.push({key,label:`${sizeLabel(size.width,size.height)} ${size.width}×${size.height} · ${sceneId} · ${variant.locale}/${variant.hook}/${variant.cta}/${variant.length}s`,variantId:variant.id,props,ordered:size.ordered,shot:false});
 };
 for(const sceneId of scenes)for(const size of sizes)add(reference,size,sceneId);
 if(longest)for(const sceneId of scenes)for(const size of sizes)add(longest,size,sceneId);
 for(const v of alternates)for(const sceneId of scenes)add(v,sizes[0],sceneId);
 for(const size of extras)for(const sceneId of scenes)add(reference,size,sceneId);
 // Screenshots for the critic: the reference copy in every ordered format of the first scene, then the longest copy
 // in the tallest format and a second scene, up to six.
 const pick=(match:(v:InspectionView)=>boolean)=>{const view=views.find(v=>!v.shot&&match(v));if(view&&views.filter(v=>v.shot).length<MAX_SHOTS)view.shot=true;};
 for(const size of sizes)pick(v=>v.variantId===reference.id&&v.props.sceneId===scenes[0]&&v.props.width===size.width&&v.props.height===size.height);
 if(longest&&longest.id!==reference.id)pick(v=>v.variantId===longest.id&&v.props.width/v.props.height===tallest);
 if(scenes[1])pick(v=>v.variantId===reference.id&&v.props.sceneId===scenes[1]&&v.ordered);
 for(const sceneId of scenes.slice(2))pick(v=>v.variantId===reference.id&&v.props.sceneId===sceneId&&v.ordered);
 return views;
}

/**
 * Runs inside the inspection page (serialised by the browser driver): reads geometry and computed styles only.
 * Coordinates are canvas pixels; the page viewport equals the canvas, so the player scale is 1.
 */
export function collectLayout(size:{width:number;height:number}):RawView{
 const elements:Element[]=[],index=(e:Element)=>{let i=elements.indexOf(e);if(i<0){elements.push(e);i=elements.length-1;}return i;};
 const box=(r:DOMRect)=>({x:r.x,y:r.y,width:r.width,height:r.height});
 const visible=(e:Element)=>{let opacity=1;for(let p:Element|null=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden')return 0;opacity*=Number(s.opacity);}return opacity;};
 const alpha=(color:string)=>{const m=/rgba?\(([^)]+)\)/.exec(color);if(!m)return 0;const parts=m[1].split(/[ ,/]+/).filter(Boolean);return parts.length>3?Number(parts[3]):1;};
 // Pictures are served as data URLs; report the asset name so measured image facts can be matched.
 const names=new Map(Object.entries((window as unknown as {__DIRECTOR_PREVIEW__?:{assets?:Record<string,string>}}).__DIRECTOR_PREVIEW__?.assets??{}).map(([n,s])=>[s,n]));
 const source=(src:string)=>names.get(src)??(src.startsWith('data:')?'inline':src.slice(0,200));
 const imgs=Array.from(document.querySelectorAll('img')).filter(i=>visible(i)>=0.5);
 const images=imgs.map(i=>{const s=getComputedStyle(i);return {src:source(i.getAttribute('src')??''),box:box(i.getBoundingClientRect()),naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,objectFit:s.objectFit,objectPosition:s.objectPosition,logo:!!i.closest('[data-brand-logo]')||i.hasAttribute('data-brand-logo')};});
 const texts:RawText[]=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode,e=node.parentElement;if(!e||!node.textContent?.trim()||e.closest('script,style,noscript'))continue;
  if(visible(e)<0.9)continue;const range=document.createRange();range.selectNodeContents(node);const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;
  const lineTops=new Set(Array.from(range.getClientRects()).filter(c=>c.width>0).map(c=>Math.round(c.top)));
  const style=getComputedStyle(e);let fontScale=1,clipped=false,background:string|null=null,complexBackground=false;
  for(let p:Element|null=e;p&&p!==document.documentElement;p=p.parentElement){const s=getComputedStyle(p);
   if(s.transform!=='none'){const m=new DOMMatrix(s.transform);fontScale*=Math.min(Math.hypot(m.m11,m.m12),Math.hypot(m.m21,m.m22));}
   if(s.overflow!=='visible'||s.overflowX!=='visible'||s.overflowY!=='visible'){const c=p.getBoundingClientRect();if(c.width>0&&c.height>0&&(r.left<c.left-1||r.right>c.right+1||r.top<c.top-1||r.bottom>c.bottom+1))clipped=true;}
   if(!background&&!complexBackground){if(s.backgroundImage&&s.backgroundImage!=='none')complexBackground=true;else if(alpha(s.backgroundColor)>=0.95)background=s.backgroundColor;}
  }
  if(e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflowX!=='visible')clipped=true;
  const under=images.find(i=>!i.logo&&i.box.x<r.right&&i.box.x+i.box.width>r.left&&i.box.y<r.bottom&&i.box.y+i.box.height>r.top);
  texts.push({text:node.textContent.replace(/\s+/g,' ').trim(),box:box(r),fontSize:parseFloat(style.fontSize)*fontScale,color:style.color,element:index(e),clipped,lines:Math.max(1,lineTops.size),background,complexBackground,overImage:!background&&under?under.src:null});
 }
 const logos=Array.from(document.querySelectorAll('[data-brand-logo]')).filter(e=>visible(e)>=0.9).map(e=>({id:e.getAttribute('data-brand-logo')??'',box:box(e.getBoundingClientRect())}));
 return {width:size.width,height:size.height,texts,images,logos};
}

const normal=(s:string)=>s.normalize('NFKC').replace(/­/g,'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim().toLowerCase();
function rgb(color:string){const m=/rgba?\(([^)]+)\)/.exec(color);if(!m)return null;const p=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);return p.length>=3?p.slice(0,3):null;}
function luminance(c:number[]){const f=(v:number)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);}
export function contrastRatio(a:number,b:number){const [hi,lo]=a>b?[a,b]:[b,a];return (hi+0.05)/(lo+0.05);}
const overlap=(a:Box,b:Box)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
const quote=(s:string)=>`“${s.length>60?s.slice(0,57)+'…':s}”`;

/** Visible part of a picture's source as fractions [x0,y0,x1,y1] for cover/contain fits; null when unknown. */
export function visibleSourceRect(image:RawImage):[number,number,number,number]|null{
 const {naturalWidth:nw,naturalHeight:nh,box}=image;if(!nw||!nh||!box.width||!box.height)return null;
 if(image.objectFit!=='cover')return [0,0,1,1];
 const scale=Math.max(box.width/nw,box.height/nh),vw=box.width/scale/nw,vh=box.height/scale/nh;
 const pos=image.objectPosition.split(/\s+/).map(v=>v.endsWith('%')?parseFloat(v)/100:v==='left'||v==='top'?0:v==='right'||v==='bottom'?1:0.5);
 const px=pos[0]??0.5,py=pos[1]??0.5,x0=(1-vw)*px,y0=(1-vh)*py;return [x0,y0,x0+vw,y0+vh];
}

export type AnalysisContext={view:InspectionView;input:DirectionInput;minTextPx:number;safe?:{top:number;right:number;bottom:number;left:number};facts:Record<string,ImageFacts|undefined>};

/** Objective findings for one view. Hard findings are defects any design must avoid; soft ones go to the critic/AD. */
export function analyzeView(raw:RawView,ctx:AnalysisContext):Finding[]{
 const out:Finding[]=[],view=ctx.view.key,add=(code:FindingCode,severity:'hard'|'soft',detail:string)=>{if(!out.some(f=>f.code===code&&f.detail===detail))out.push({code,severity,view,detail});};
 const facts=ctx.input.variantFacts?.[ctx.view.variantId],approved=(facts?.sceneCopy?.[ctx.view.props.sceneId]??[]).filter(Boolean);
 const approvedNorm=approved.map(normal),isApproved=(t:string)=>{const n=normal(t);return n.length>0&&approvedNorm.some(a=>a.includes(n)||n.includes(a));};
 const visible=normal(raw.texts.map(t=>t.text).join(' '));
 if(!facts?.storyboard)for(const line of approved)if(!visible.includes(normal(line)))add('COPY_MISSING','hard',`Approved copy is not visible: ${quote(line)}`);
 for(const t of raw.texts){
  const approvedText=isApproved(t.text);
  const offCanvas=t.box.x<-2||t.box.y<-2||t.box.x+t.box.width>raw.width+2||t.box.y+t.box.height>raw.height+2;
  if(t.clipped&&!offCanvas)add('TEXT_CLIPPED','hard',`Text is cut by its container: ${quote(t.text)}`);
  if(offCanvas)add('TEXT_OFF_CANVAS','hard',`Text leaves the canvas: ${quote(t.text)}`);
  else if(ctx.safe&&(t.box.x<ctx.safe.left-1||t.box.y<ctx.safe.top-1||t.box.x+t.box.width>raw.width-ctx.safe.right+1||t.box.y+t.box.height>raw.height-ctx.safe.bottom+1))add('TEXT_OUTSIDE_SAFE_AREA',ctx.view.ordered?'hard':'soft',`Text enters the placement's safe margin: ${quote(t.text)}`);
  if(t.fontSize<ctx.minTextPx-0.5)add('TEXT_TOO_SMALL',approvedText?'hard':'soft',`${Math.round(t.fontSize)}px text is below the ${ctx.minTextPx}px minimum: ${quote(t.text)}`);
  const fg=rgb(t.color);
  if(fg&&t.background){const bg=rgb(t.background);if(bg){const ratio=contrastRatio(luminance(fg),luminance(bg));if(ratio<3)add('LOW_CONTRAST',approvedText?'hard':'soft',`Contrast ${ratio.toFixed(1)}:1 on a solid background: ${quote(t.text)}`);}}
  else if(fg&&t.overImage&&!t.complexBackground){
   const image=raw.images.find(i=>i.src===t.overImage),f=ctx.facts[t.overImage],rect=image&&visibleSourceRect(image);
   if(image&&f&&rect){
    // Map the text centre into the source picture and read the measured luminance of that grid cell.
    const cx=rect[0]+(t.box.x+t.box.width/2-image.box.x)/image.box.width*(rect[2]-rect[0]),cy=rect[1]+(t.box.y+t.box.height/2-image.box.y)/image.box.height*(rect[3]-rect[1]);
    const cell=Math.min(2,Math.max(0,Math.floor(cy*3)))*3+Math.min(2,Math.max(0,Math.floor(cx*3)));
    const ratio=contrastRatio(luminance(fg),Math.pow(f.luma[cell],2.2));
    if(ratio<3||f.busy[cell]>0.6)add('CONTRAST_OVER_PICTURE','soft',`Text sits directly on the picture (estimated ${ratio.toFixed(1)}:1, busy ${f.busy[cell].toFixed(2)}); check it reads: ${quote(t.text)}`);
   }
  }
  for(const logo of raw.logos)if(overlap(t.box,logo.box)>0.1*Math.min(t.box.width*t.box.height,logo.box.width*logo.box.height))add('TEXT_OVER_LOGO','hard',`Text overlaps the logo: ${quote(t.text)}`);
 }
 for(let i=0;i<raw.texts.length;i++)for(let j=i+1;j<raw.texts.length;j++){const a=raw.texts[i],b=raw.texts[j];if(a.element===b.element)continue;
  const area=overlap(a.box,b.box),smaller=Math.min(a.box.width*a.box.height,b.box.width*b.box.height);if(smaller>0&&area>0.2*smaller)add('TEXT_OVERLAP','hard',`Text overlaps other text: ${quote(a.text)} and ${quote(b.text)}`);}
 if(ctx.input.brand.logos.some(l=>l.url)&&!raw.logos.length)add('LOGO_MISSING','soft','No brand logo is visible in this view.');
 for(const image of raw.images.filter(i=>!i.logo)){
  const rect=visibleSourceRect(image);if(!rect)continue;const scale=image.box.width/((rect[2]-rect[0])*image.naturalWidth);
  if(scale>1.6)add('PICTURE_UPSCALED','soft',`A picture is enlarged ${scale.toFixed(1)}× beyond its pixels and will look soft.`);
  const f=ctx.facts[image.src];if(f){const [sx0,sy0,sx1,sy1]=f.subject,inside=Math.max(0,Math.min(sx1,rect[2])-Math.max(sx0,rect[0]))*Math.max(0,Math.min(sy1,rect[3])-Math.max(sy0,rect[1])),area=(sx1-sx0)*(sy1-sy0);if(area>0&&inside/area<0.6)add('SUBJECT_CROPPED','soft','The measured subject of a picture is mostly cropped out in this view.');}
 }
 return out;
}

export function summarizeInspection(revision:string,reports:ViewReport[]):InspectionSummary{
 const all=reports.flatMap(r=>r.findings);return {version:1,revision,views:reports.length,hard:all.filter(f=>f.severity==='hard').length,soft:all.filter(f=>f.severity==='soft').length,reports};
}

/** Compact, de-duplicated findings for a coder repair turn or the critic (bounded size). */
export function findingDigest(summary:InspectionSummary,severity:'hard'|'soft'|'all',limit=24){
 const groups=new Map<string,{finding:Finding;views:string[]}>();
 for(const r of summary.reports)for(const f of r.findings){if(severity!=='all'&&f.severity!==severity)continue;const key=`${f.code}|${f.detail}`,g=groups.get(key);if(g)g.views.push(r.label);else groups.set(key,{finding:f,views:[r.label]});}
 return [...groups.values()].sort((a,b)=>Number(b.finding.severity==='hard')-Number(a.finding.severity==='hard')||b.views.length-a.views.length).slice(0,limit).map(g=>({code:g.finding.code,severity:g.finding.severity,detail:g.finding.detail,views:g.views.slice(0,4),moreViews:Math.max(0,g.views.length-4)}));
}

/** The coder note for the free gate: exact objective defects in exact views, no technique prescribed. */
export function gateNote(summary:InspectionSummary){
 const items=findingDigest(summary,'hard',16);
 return `Automatic layout check (measured in the browser, no screenshots) found objective defects. Fix each in the views listed with the smallest coherent change to the existing component; keep the concept, options and working views. Choose any technique that fits the design.\n${items.map((f,i)=>`${i+1}. ${f.detail} — ${f.views.join('; ')}${f.moreViews?` (+${f.moreViews} more views)`:''}`).join('\n')}`;
}

/**
 * Copy that must appear somewhere across a variant's key frames (variantFacts.required: every scene line, other on-screen
 * lines and protected CTA/offer/legal). Checked on each group of views that shows one copy binding at one canvas size in
 * every displayed scene. This is the only copy check for hooks with their own storyboard, whose scene IDs differ from
 * the displayed key frames, so a per-scene check cannot apply to them. Lines already checked per scene are skipped.
 */
export function missingRequiredCopy(views:InspectionView[],raw:{key:string;raw?:RawView}[],input:DirectionInput):Finding[]{
 const scenes=new Set(views.map(v=>v.props.sceneId)),groups=new Map<string,InspectionView[]>();
 for(const v of views){const key=`${v.variantId}|${v.props.width}x${v.props.height}`;groups.set(key,[...(groups.get(key)??[]),v]);}
 const out:Finding[]=[];
 for(const group of groups.values()){
  const facts=input.variantFacts?.[group[0].variantId];if(!facts?.required?.length)continue;
  // Only a complete, fully built group proves absence: every displayed scene measured without a build error.
  const measured=group.map(v=>raw.find(r=>r.key===v.key)?.raw);
  if(new Set(group.map(v=>v.props.sceneId)).size<scenes.size||measured.some(r=>!r))continue;
  const visible=normal(measured.flatMap(r=>r!.texts.map(t=>t.text)).join(' '));
  const perScene=facts.storyboard?[]:Object.values(facts.sceneCopy).flat().map(normal);
  for(const line of facts.required){const n=normal(line);if(!n||perScene.includes(n)||visible.includes(n))continue;
   out.push({code:'COPY_MISSING',severity:'hard',view:group[0].key,detail:`Approved copy does not appear in any scene: ${quote(line)}`});}
 }
 return out;
}

/** Raw browser output → per-view reports. A view that failed to build is a hard finding. */
export function analyzeInspection(views:InspectionView[],raw:{revision:string;views:{key:string;raw?:RawView;error?:string}[]},input:DirectionInput,facts:Record<string,ImageFacts|undefined>):InspectionSummary{
 const reports:ViewReport[]=views.map(view=>{
  const result=raw.views.find(r=>r.key===view.key),format=view.ordered?input.formats.find(f=>f.width===view.props.width&&f.height===view.props.height):undefined;
  if(!result?.raw)return {view:view.key,label:view.label,findings:[{code:'RENDER_ERROR' as const,severity:'hard' as const,view:view.key,detail:`This view does not build: ${(result?.error??'no result').slice(0,200)}`}],texts:0,images:0};
  const minTextPx=format?.minTextPx??Math.max(16,Math.round(Math.min(view.props.width,view.props.height)*32/1080));
  return {view:view.key,label:view.label,findings:analyzeView(result.raw,{view,input,minTextPx,safe:format?.safe,facts}),texts:result.raw.texts.length,images:result.raw.images.length};
 });
 for(const finding of missingRequiredCopy(views,raw.views,input)){const report=reports.find(r=>r.view===finding.view);if(report&&!report.findings.some(f=>f.code===finding.code&&f.detail===finding.detail))report.findings.push(finding);}
 return summarizeInspection(raw.revision,reports);
}
