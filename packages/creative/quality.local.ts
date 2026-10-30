import {fitTextCollisions} from './wrap-copy';
import type {Box,VariantState} from '../engine/types';
import type {Op} from '../engine/engine/ops';
import {contrastRatio} from '../engine/engine/util';
// Offscreen software canvas only. No browser, screenshots, network or provider calls.
import {createCanvas,loadImage,Path2D,type Canvas} from '@napi-rs/canvas';
import type {DirectionProgram,CreativeDirection} from '../contracts/frame-program';
import type {BrandSystem,CreativeIssue} from '../contracts/creative-drafts';
import type {GlyphEngine} from '../engine/text-snapshot';
import {buildFrame} from '../engine/engine/frame';
import {checkAll} from '../engine/engine/checks';
import {drawFrame,type DrawDeps} from '../engine/render/canvas';
import {slideshowScores,fidelityIssues,MIN_CHOREOGRAPHY,type QualityReport} from './quality';
import {applyMotionRecipes} from './motion-recipes';
import {mediaRuleIssues} from './media-rules';
import type {CreativeInputs} from './protocol';
import {sourcePath} from './to-engine';
/** Match the browser display list using native paths and verified local pixels. */
export async function offscreenPixels(program:DirectionProgram,engine:GlyphEngine,bytes:Map<string,Uint8Array>,state=program.variants[0].state,maxEdge=320){
 const native=globalThis as unknown as Record<string,unknown>;
 native.Path2D??=Path2D;
 native.OffscreenCanvas??=class{constructor(w:number,h:number){return createCanvas(w,h);}};
 const images=new Map<string,Awaited<ReturnType<typeof loadImage>>>();
 for(const resource of program.resources)if(resource.kind!=='font'&&bytes.has(resource.revisionId))images.set(resource.revisionId,await loadImage(Buffer.from(bytes.get(resource.revisionId)!)));
 const fmt=program.config.formats.find(f=>f.id===state.fmt)!,canvas=createCanvas(fmt.w,fmt.h),context=canvas.getContext('2d');
 // Native canvases are invisible to the JS heap, so a fresh surface per transition or tinted logo on every sampled frame
 // grows memory without bound. Surfaces are pooled by size and reused on each draw.
 const pool=new Map<string,Canvas[]>(),taken=new Map<string,number>();
 const surface=(w:number,h:number)=>{const key=`${w}x${h}`,index=taken.get(key)??0;taken.set(key,index+1);if(!pool.has(key)&&pool.size>48)pool.clear();const list=pool.get(key)??[];pool.set(key,list);
  const canvas=list[index]??(list[index]=createCanvas(w,h)),ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,w,h);return canvas as unknown as OffscreenCanvas;};
 const deps:DrawDeps={engine,logos:new Map(),media:new Map(),sketches:new Map(),missing:[],createSurface:surface};
 for(const [id,logo]of Object.entries(program.config.kit.logos)){const resource=program.resources.find(r=>r.objectKey===logo.file),image=resource&&images.get(resource.revisionId);if(image)deps.logos.set(id,image as unknown as CanvasImageSource);else if(logo.mode==='as_drawn')throw new Error(`QUALITY_LOGO_BYTES_REQUIRED:${id}`);}
 for(const [id,part]of Object.entries(program.config.parts)){if(part.status!=='approved')continue;const image=part.file&&images.get(part.file);if(!image)throw new Error(`QUALITY_MEDIA_BYTES_REQUIRED:${id}`);const frames=part.files?.map(file=>{const image=images.get(file);if(!image)throw new Error(`QUALITY_MEDIA_BYTES_REQUIRED:${file}`);return image;});deps.media.set(id,{el:image as unknown as HTMLImageElement,...(frames?{frames:frames as unknown as HTMLImageElement[]}:{})});}
 const small=createCanvas(Math.max(1,Math.round(maxEdge*fmt.w/Math.max(fmt.w,fmt.h))),Math.max(1,Math.round(maxEdge*fmt.h/Math.max(fmt.w,fmt.h)))),g=small.getContext('2d');
 let last='';
 const draw=(time:number,blind=false)=>{const key=JSON.stringify([state,time,blind]);if(last===key)return;taken.clear();const frame=buildFrame({cfg:program.config,engine},state,time),logos=new Set(frame.els.filter(e=>e.kind==='logo').map(e=>e.id));
  if(blind){const strip=(ops:Op[]):Op[]=>ops.flatMap<Op>(op=>op.op==='glyphs'||op.op==='logo_image'||op.op==='vector'&&logos.has(op.el)?[]:op.op==='scene'?[{...op,ops:strip(op.ops)}]:[op]);frame.ops=strip(frame.ops);}
  drawFrame(context as unknown as CanvasRenderingContext2D,frame,deps);g.drawImage(canvas,0,0,small.width,small.height);if(deps.missing.length)throw new Error('QUALITY_RENDER_INCOMPLETE');last=key;
 };
 const render=(time:number)=>{draw(time);return new Uint8Array(g.getImageData(0,0,small.width,small.height).data);};
 const sample=(time:number,box:Box,foreground='#ffffff')=>{draw(time,true);const colors:string[]=[],scale=1;
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){const x=Math.max(0,Math.min(fmt.w-1,Math.floor((box.x+box.w*col/3)*scale))),y=Math.max(0,Math.min(fmt.h-1,Math.floor((box.y+box.h*row/3)*scale))),w=Math.max(1,Math.min(fmt.w-x,Math.ceil(box.w*scale/3))),h=Math.max(1,Math.min(fmt.h-y,Math.ceil(box.h*scale/3))),data=context.getImageData(x,y,w,h).data,total=[0,0,0];for(let k=0;k<data.length;k+=4)for(let channel=0;channel<3;channel++)total[channel]+=data[k+channel];colors.push('#'+total.map(n=>Math.round(n/(data.length/4)).toString(16).padStart(2,'0')).join(''));}
  return colors.sort((a,b)=>contrastRatio(foreground,a)-contrastRatio(foreground,b))[0];
 };
 return Object.assign(render,{png:(time:number)=>{draw(time);return small.toBuffer('image/png');},setState:(next:VariantState)=>{state=next;},reset:()=>{last='';},sample});
}
export async function checkCreativeQuality(program:DirectionProgram,direction:CreativeDirection,input:Pick<CreativeInputs,'brand'|'assetAliases'|'brief'|'scope'>,engine:GlyphEngine,bytes:Map<string,Uint8Array>,options:{repairDefault?:boolean}={}):Promise<QualityReport>{
 const reference=program.variants.find(v=>v.state.fmt===input.scope.referencePlacement&&v.state.lang===input.scope.referenceLocale)??program.variants[0];
 // A slideshow with a slow zoom is still a slideshow: measure again with every camera move switched off.
 const score=async()=>{
  const all=await slideshowScores(program,reference.state,await offscreenPixels(program,engine,bytes,reference.state));
  const savedParts=new Map<object,import('./motion-recipes').CameraName[]>();for(const part of Object.values(program.config.parts))if(part.frame_cameras){savedParts.set(part,part.frame_cameras);part.frame_cameras=part.frame_cameras.map(()=> 'none');}
  const saved=new Map<object,unknown>();for(const beat of program.config.beats)for(const layer of beat.layers)if(layer.kind==='media'&&layer.camera){saved.set(layer,layer.camera);layer.camera={...layer.camera,type:'none'};}
  let choreo;try{choreo=await slideshowScores(program,reference.state,await offscreenPixels(program,engine,bytes,reference.state));}
  finally{for(const [layer,camera] of saved)(layer as {camera:unknown}).camera=camera;for(const [part,cameras] of savedParts)(part as {frame_cameras:unknown}).frame_cameras=cameras;}
  return all.map(s=>{const c=choreo.find(x=>x.beat===s.beat)?.score??0;return {...s,choreography:c,passed:s.passed&&c>=MIN_CHOREOGRAPHY};});
 };
 let slideshow=await score(),defaultRecipeRepair=false;
 if(options.repairDefault!==false&&slideshow.some(s=>!s.passed)){applyMotionRecipes(program.config,direction,input.brand as BrandSystem,true);defaultRecipeRepair=true;slideshow=await score();}
 const fidelity=[...fidelityIssues(direction,program,engine),...mediaRuleIssues(direction,input)],issues:CreativeIssue[]=[...fidelity];
 for(const result of slideshow)if(!result.passed)issues.push({code:'SLIDESHOW',severity:'block',owner:'ad',path:`scenes.beats.${result.beat.replace(/^edit\d+\./,'')}`,message:result.score<.9?`${result.beat}: ${Math.round(result.score*100)}% of 0.2s steps visibly change (minimum 90%).`:`${result.beat}: only the camera moves; ${Math.round((result.choreography??0)*100)}% of steps change without it (minimum ${MIN_CHOREOGRAPHY*100}%). This reads as a slideshow.`,fix:'The brand-default recipe was applied for free and still failed. The AD must choose motion that preserves reading and the approved visual.'});
 {const renderers=new Map<string,Awaited<ReturnType<typeof offscreenPixels>>>();for(const format of program.config.formats){const state=program.variants.find(v=>v.state.fmt===format.id)?.state;if(state)renderers.set(format.id,await offscreenPixels(program,engine,bytes,state));}
 const measure=()=>checkAll({cfg:program.config,engine},{variants:program.variants.map(v=>v.state),sample:(_part,_time,box,_dest,foreground,frame)=>{if(!frame)return null;const renderer=renderers.get(frame.st.fmt);if(!renderer)return null;renderer.setState(frame.st);return renderer.sample(frame.t,box,foreground);}});
 let checks=measure();
 // Text over a photo: a free legibility fix (brand colour with headroom, else a brand box behind the line), then measure again.
 if(legibleOverMedia(program.config,checks.findings)){fitTextCollisions(program.config,engine,program.variants.map(v=>v.state));for(const renderer of renderers.values())renderer.reset();checks=measure();}
 // A line on its own box may overlap a picture card's edge (a labelled image); bare text straddling it stays blocking.
 const boxed=(f:{beat:string|null;element:string|null})=>program.config.beats.some(b=>b.id===f.beat&&b.layers.some(l=>l.id===f.element&&l.kind==='text'&&['box','plaque','button'].includes(program.config.kit.treatments[l.treatment??program.config.kit.styles[l.style]?.treatment??'']?.kind??'')));
 for(const finding of checks.findings.filter(f=>(f.severity==='block'||f.code==='L_CONTRAST')&&!(f.code==='L_REGION'&&/-ground\b/.test(f.message)&&boxed(f))))issues.push({code:finding.code,severity:'block',owner:'compositor',path:sourcePath(program.pathMap,`${finding.beat}.${finding.element}`),message:finding.message,fix:'Resolve the measured geometry before offering the draft.'});}
 return {version:'creative-quality@1',slideshow,fidelity,issues,defaultRecipeRepair,passed:!issues.some(i=>i.severity==='block')&&!program.issues.some(i=>i.severity==='block')};
}

/** Mutates the program: text that measured below contrast over media switches to a brand colour with clear headroom, otherwise it gets a box in the brand colour that contrasts most. Returns whether anything changed. */
export function legibleOverMedia(cfg:DirectionProgram['config'],findings:{code:string;beat:string|null;element:string|null;message:string}[]){
 let changed=false;const colors=Object.entries(cfg.kit.colors),scene=(id:string)=>id.replace(/^edit\d+\./,'');
 for(const f of findings){
  if(f.code!=='L_CONTRAST'||!f.beat||!/over media/.test(f.message))continue;const fb=f.beat;
  const bg=f.message.match(/ on (#[0-9a-f]{6})/i)?.[1];if(!bg)continue;
  for(const beat of cfg.beats.filter(b=>scene(b.id)===scene(fb)))for(const layer of beat.layers){
   if(layer.id!==f.element||layer.kind!=='text')continue;
   const tr=cfg.kit.treatments[layer.treatment??cfg.kit.styles[layer.style]?.treatment??''];if(tr&&['box','plaque','button'].includes(tr.kind))continue;
   const best=[...colors].sort((a,b)=>contrastRatio(b[1].hex,bg)-contrastRatio(a[1].hex,bg))[0];
   if(best&&best[0]!==layer.color&&contrastRatio(best[1].hex,bg)>=cfg.kit.contrast.media+1.5){layer.color=best[0];changed=true;continue;}
   const ink=cfg.kit.colors[layer.color]?.hex;if(!ink)continue;
   const ground=[...colors].sort((a,b)=>contrastRatio(b[1].hex,ink)-contrastRatio(a[1].hex,ink))[0];if(!ground)continue;
   const name=`legibility_${layer.color}`;cfg.kit.treatments[name]??={kind:'box',pad:[.18,.32,.18,.32],radius:0,fill:ground[0],on:layer.color};
   layer.treatment=name;changed=true;
  }
 }
 return changed;
}
