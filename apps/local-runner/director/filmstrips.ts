import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {sampleFrames} from '../../../packages/director/checks.local';
import type {DirectionInput} from '../../../packages/director/types';
/** Actual rendered frames, never planner sketches. Thumbnails do not change the composition. */
export async function criticEvidence(folder:string,input:DirectionInput){
 const images:{url:string;label:string}[]=[],manifest:{format:string;variantId:string;frames:number[];strip:string;previews:{frame:number;path:string}[]}[]=[];
 await mkdir(resolve(folder,'.reports'),{recursive:true});
 for(const format of input.formats){const variant=input.variants.find(v=>v.format===format.id);if(!variant)continue;
  const frames=sampleFrames(input.storyboard,format.fps,Math.round(variant.length*format.fps)),thumbWidth=240,thumbHeight=Math.round(240*format.height/format.width),raw=createCanvas(thumbWidth*4,thumbHeight*Math.ceil(frames.length/4)),g=raw.getContext('2d');
  for(const [index,frame]of frames.entries()){const image=await loadImage(await readFile(resolve(folder,'renders',variant.id,`${frame}.png`)));g.drawImage(image,index%4*thumbWidth,Math.floor(index/4)*thumbHeight,thumbWidth,thumbHeight);}
  const scale=Math.min(1,2048/Math.max(raw.width,raw.height)),strip=createCanvas(Math.round(raw.width*scale),Math.round(raw.height*scale));strip.getContext('2d').drawImage(raw,0,0,strip.width,strip.height);
  const stripPath=resolve(folder,'.reports',`${format.id}-filmstrip.png`),bytes=strip.toBuffer('image/png');await writeFile(stripPath,bytes);images.push({url:`data:image/jpeg;base64,${strip.toBuffer('image/jpeg',85).toString('base64')}`,label:`${format.id}: row-major filmstrip, frames ${frames.join(', ')} at ${format.fps} fps, eight samples per scene plus final frame.`});
  const previews=[];for(const scene of input.storyboard){const frame=Math.min(Math.round(variant.length*format.fps)-1,Math.floor((scene.start+(scene.end-scene.start)*.5)*format.fps)),nearest=frames.reduce((a,b)=>Math.abs(b-frame)<Math.abs(a-frame)?b:a),path=resolve(folder,'renders',variant.id,`${nearest}.png`),source=await loadImage(await readFile(path)),s=Math.min(1,1200/Math.max(source.width,source.height)),canvas=createCanvas(Math.round(source.width*s),Math.round(source.height*s));canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);images.push({url:`data:image/jpeg;base64,${canvas.toBuffer('image/jpeg',85).toString('base64')}`,label:`${format.id}, scene ${scene.id}, rendered preview frame ${nearest}.`});previews.push({frame:nearest,path});}
  manifest.push({format:format.id,variantId:variant.id,frames,strip:stripPath,previews});
 }
 if(!manifest.length)throw new Error('CRITIC_RENDER_EVIDENCE_REQUIRED');return {images,manifest};
}
