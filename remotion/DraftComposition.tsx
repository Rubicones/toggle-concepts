import {EngineComposition} from './EngineComposition';
import React,{useEffect,useState} from "react";
import {AbsoluteFill,Img,Sequence,useCurrentFrame,interpolate,delayRender,continueRender,cancelRender,staticFile} from "remotion";
import {Audio} from "@remotion/media";
import type {DraftProgram} from "../packages/contracts/drafts";
import type {SceneSpec} from "../packages/contracts/scene";
export type DraftCompositionProps={program:DraftProgram;assetUrls:Record<string,string>};
function Fonts(){const [handle]=useState(()=>delayRender("Packaged draft fonts"));useEffect(()=>{let active=true;Promise.all([false,true].map(c=>new FontFace("StudioNoto",`url("${staticFile(`fixtures/noto-${c?"cyrillic":"latin"}.woff2`)}")`,{weight:"400",unicodeRange:c?"U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116":"U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC"}).load())).then(fonts=>{if(active){fonts.forEach(f=>document.fonts.add(f));continueRender(handle);}}).catch(e=>{if(active)cancelRender(e);});return()=>{active=false;};},[handle]);return null;}
function DraftScene({scene,program,assetUrls}:{scene:SceneSpec}&DraftCompositionProps){
 const frame=useCurrentFrame(),enter=interpolate(frame,[0,Math.min(12,scene.durationFrames-1)],[0,1],{extrapolateRight:"clamp"}),shift=(1-enter)*Math.min(scene.width,scene.height)*.008;
 return <AbsoluteFill style={{background:program.colors.paper,fontFamily:"StudioNoto",fontWeight:400,overflow:"hidden"}}>
 <AbsoluteFill style={{border: `${Math.max(2,scene.width*.004)}px solid ${program.colors.ink}`,opacity:.12,pointerEvents:"none"}}/>
 {program.recipe==="split"&&<div style={{position:"absolute",left:"49%",top:"13%",width:"1px",height:"74%",background:program.colors.ink,opacity:.15}}/>}
 {program.recipe==="product"&&<div style={{position:"absolute",left:"6%",top:"35%",width:"88%",height:"51%",borderRadius:scene.width*.03,background:program.colors.ink,opacity:.06}}/>}
 {scene.layers.map(layer=>{const slot=scene.slots.find(s=>s.id===layer.slotId)!;const style:React.CSSProperties={position:"absolute",left:slot.bounds.x*scene.width,top:slot.bounds.y*scene.height,width:slot.bounds.w*scene.width,height:slot.bounds.h*scene.height};
  if(layer.kind==="text")return <div key={layer.id} style={{...style,fontSize:layer.fontSize,lineHeight:1.2,color:layer.color,whiteSpace:"pre",transform:layer.id==="legal"?undefined:`translate${program.recipe==="split"?"X":"Y"}(${shift}px)`,opacity:layer.id==="legal"?1:enter}}>{scene.copy[layer.copyKey]}</div>;
  const assetId=layer.kind==="image"?layer.assetRevisionId:layer.kind==="video"||layer.kind==="model3d"?layer.draftProxyRevisionId:null;if(!assetId)return null;
  const url=assetUrls[assetId];if(!url)throw new Error("Validated media bytes are not loaded.");return <Img key={layer.id} src={url} style={{...style,objectFit:"contain",transform:layer.id==="hero"?`translateY(${shift*.3}px)`:undefined}}/>;
 })}</AbsoluteFill>;
}
export function DraftComposition(props:DraftCompositionProps){const frame=useCurrentFrame();if(props.program.engine)return <EngineComposition program={props.program.engine} assetUrls={props.assetUrls} frameOverride={frame*props.program.engine.config.render.fps/props.program.fps}/>;return <AbsoluteFill><Fonts/>{props.program.scenes.map((scene,index)=>{const start=props.program.scenes.slice(0,index).reduce((n,s)=>n+s.durationFrames,0);return <Sequence key={scene.sceneId} from={start} durationInFrames={scene.durationFrames}><DraftScene {...props} scene={scene}/></Sequence>;})}{props.program.audio&&<Audio src={props.assetUrls[props.program.audio.assetRevisionId]} volume={props.program.audio.gain}/>}</AbsoluteFill>;}
