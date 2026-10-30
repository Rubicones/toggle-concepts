import {useEffect,useRef,useState} from 'react';
import {AbsoluteFill,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import type {EngineProgram} from '../packages/contracts/frame-program';
import {snapshotEngine} from '../packages/engine/text-snapshot';
import {buildFrame} from '../packages/engine/engine/frame';
import {drawFrame,seekFrame,type DrawDeps} from '../packages/engine/render/canvas';

export type EngineCompositionProps={program:EngineProgram;assetUrls:Record<string,string>;safeZones?:boolean;issues?:boolean;frameOverride?:number};
/** One canvas and one compositor for the AD board, Player and local renderer. */
export function EngineComposition({program,assetUrls,safeZones=false,issues=false,frameOverride}:EngineCompositionProps){
 const currentFrame=useCurrentFrame(),frame=frameOverride??currentFrame,canvas=useRef<HTMLCanvasElement>(null),[deps,setDeps]=useState<DrawDeps|null>(null),[error,setError]=useState<Error|null>(null),[handle]=useState(()=>delayRender('Frozen brand glyphs and verified media'));
 useEffect(()=>{let cancelled=false;
  const engine=snapshotEngine(program.glyphs),loaded:DrawDeps={engine,logos:new Map(),media:new Map(),sketches:new Map(),missing:[]};
  const loadImage=async(id:string)=>{const url=assetUrls[id];if(!url)throw new Error(`Verified media missing: ${id}`);const img=new Image();img.crossOrigin='anonymous';img.src=url;try{await img.decode();}catch{throw new Error(`Creative image could not be decoded: ${id}. Reload the preview to try again.`);}return img;};
  Promise.all([
   ...Object.entries(program.config.kit.logos).map(async([id,logo])=>{const ref=program.resources.find(r=>r.kind==='logo'&&r.objectKey===logo.file);if(!ref)throw new Error('Frozen logo resource missing');loaded.logos.set(id,await loadImage(ref.revisionId));}),
   ...Object.entries(program.config.parts).map(async([id,part])=>{if(!part.file&&part.status==='standin')return;if(!part.file)throw new Error('Produced media revision required');if(part.media==='clip'){const url=assetUrls[part.file];if(!url)throw new Error('Video source missing');const video=document.createElement('video');video.crossOrigin='anonymous';video.muted=true;video.preload='auto';await new Promise<void>((resolve,reject)=>{video.onloadeddata=()=>resolve();video.onerror=()=>reject(new Error('Video decode failed'));video.src=url;});loaded.media.set(id,{el:video});}else loaded.media.set(id,{el:await loadImage(part.file),...(part.files?.length?{frames:await Promise.all(part.files.map(loadImage))}:{})});})
  ]).then(()=>{if(!cancelled){setDeps(loaded);}}).catch(error=>{if(!cancelled)setError(error instanceof Error?error:new Error(String(error)));});
  return()=>{cancelled=true;for(const part of loaded.media.values())if(part.el instanceof HTMLVideoElement){part.el.pause();part.el.removeAttribute('src');part.el.load();}};
 },[program,assetUrls,handle]);
 useEffect(()=>{if(!deps||!canvas.current)return;let active=true;const drawHandle=delayRender('Frame media seek and canvas draw');
  const rendered=buildFrame({cfg:program.config,engine:deps.engine},program.variant,frame/program.config.render.fps);
  seekFrame(rendered,deps).then(()=>{if(active&&canvas.current){const context=canvas.current.getContext('2d');if(!context)throw new Error('Canvas2D unavailable');drawFrame(context,rendered,deps,{overlay:safeZones?'safe':'none',highlight:issues?rendered.els.filter(e=>program.issues.some(i=>i.path.endsWith(`.${e.id}`))).map(e=>({box:e.ink??e.box,color:'rgba(255,70,70,1)'})):[]});}continueRender(drawHandle);continueRender(handle);}).catch(error=>{if(active)setError(error instanceof Error?error:new Error(String(error)));});
  return()=>{active=false;continueRender(drawHandle);};
 },[deps,program,frame,safeZones,issues,handle]);
 // Throw during React rendering so the Player error boundary can show the failure.
 if(error)cancelRender(error);
 const format=program.config.formats.find(f=>f.id===program.variant.fmt)!;
 return <AbsoluteFill><canvas ref={canvas} width={format.w} height={format.h} style={{width:'100%',height:'100%'}} aria-label="Creative draft"/></AbsoluteFill>;
}
