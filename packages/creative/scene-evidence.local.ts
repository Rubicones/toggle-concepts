import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createHash} from 'node:crypto';
import type {CreativeDirection,DirectionProgram} from '../contracts/frame-program';
import type {GlyphEngine} from '../engine/text-snapshot';
import {offscreenPixels} from './quality.local';
import {sceneEvidencePlan} from './scene-evidence';
export async function renderSceneEvidence(direction:CreativeDirection,program:DirectionProgram,engine:GlyphEngine,bytes:Map<string,Uint8Array>,state=program.variants[0].state){
 const render=await offscreenPixels(program,engine,bytes,state,640),strips=[];
 for(const scene of sceneEvidencePlan(direction,program,state)){
  const frames=await Promise.all(scene.times.map(t=>loadImage(render.png(t)))),strip=createCanvas(frames.reduce((n,f)=>n+f.width,0),Math.max(...frames.map(f=>f.height))),g=strip.getContext('2d');let x=0;
  for(const frame of frames){g.drawImage(frame,x,0);x+=frame.width;}
  const png=strip.toBuffer('image/png');strips.push({...scene,bytes:png,sha256:createHash('sha256').update(png).digest('hex')});
 }
 return strips;
}
