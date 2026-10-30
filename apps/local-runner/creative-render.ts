import {availableRenderPort} from './render-port';
// Trusted local Chromium rendering, shared by contact sheets and MP4 exports.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import type {FrameProgram} from '../../packages/contracts/frame-program';
export type ContactFrame={frame:number;blind:boolean;sha256:string;path:string};
let bundlePromise:Promise<string>|undefined;
export async function renderCreative(program:FrameProgram,assetUrls:Record<string,string>,output:string,options:{mp4?:boolean;contacts?:boolean}={contacts:true}){
 await mkdir(output,{recursive:true});
 const serveUrl=await (bundlePromise??=bundle({entryPoint:resolve('remotion/draft-entry.tsx'),publicDir:resolve('public'),outDir:resolve('artifacts/m07b/bundle'),webpackOverride:config=>({...config,cache:false})}));
 const browser=await openBrowser('chrome',{browserExecutable:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),frames:ContactFrame[]=[];
 try{
  const common={serveUrl,port:await availableRenderPort(),puppeteerInstance:browser,inputProps:{program,assetUrls}},composition=await selectComposition({...common,id:'M07Draft'});
  if(options.mp4)await renderMedia({...common,composition,outputLocation:resolve(output,'creative.mp4'),codec:'h264',pixelFormat:'yuv420p',colorSpace:'bt709',concurrency:1,crf:18});
  if(options.contacts){for(const moment of [.15,.5,.85])for(const blind of [false,true]){
   const frame=Math.min(program.durationFrames-1,Math.floor(program.durationFrames*moment)),copy=structuredClone(program);
   if(blind)for(const beat of copy.engine.config.beats)beat.layers=beat.layers.filter(l=>l.kind!=='text');
   const path=resolve(output,`frame-${frame}${blind?'-blind':''}.png`);
   await renderStill({...common,inputProps:{program:copy,assetUrls},composition,frame,output:path,imageFormat:'png',scale:Math.min(1,640/program.width)});
   frames.push({frame,blind,path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
  }}
  await writeFile(resolve(output,'contacts.json'),JSON.stringify(frames,null,2));return frames;
 }finally{await browser.close({silent:true});}
}
