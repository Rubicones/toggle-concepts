import {renderStaticDirection} from './static-render';
import {scrubFrames} from './scrub';
import {requireRuntimeVersion} from './runtime-version';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {lintWorkspace} from '../../../packages/director/policy.local';
import {checkRenders,sampleFrames,type Sample} from '../../../packages/director/checks.local';
import type {DirectionInput,Variant,FrameEvidence} from '../../../packages/director/types';
import {availableRenderPort} from '../render-port';
export async function bundleDirection(folder:string){await requireRuntimeVersion(folder);const issues=await lintWorkspace(folder);if(issues.length)throw new Error(issues.join('\n'));const output=await bundle({entryPoint:resolve(folder,'entry.tsx'),outDir:resolve(folder,'bundle'),publicDir:resolve(folder,'public'),webpackOverride:c=>({...c,cache:false})});
 const html=resolve(output,'index.html');const csp="default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; worker-src 'none'";await writeFile(html,(await readFile(html,'utf8')).replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${csp}">`));return output;}
/** Invoked by sandboxed child only for untrusted agent compositions. */
export async function renderDirection(folder:string,variant:Variant,options:{video?:boolean;check?:boolean;frames?:number[];scale?:number}={check:true}){
 await requireRuntimeVersion(folder);
 const started=performance.now(),input:DirectionInput=JSON.parse(await readFile(resolve(folder,'input.json'),'utf8')),format=input.formats.find(f=>f.id===variant.format);if(!format)throw new Error('UNKNOWN_FORMAT');
 if(input.stage==='draft'){if(options.video)throw new Error('DRAFT_VIDEO_FORBIDDEN');return renderStaticDirection(folder,variant,options as Parameters<typeof renderStaticDirection>[2]);}
 if(!input.variants.some(v=>JSON.stringify(v)===JSON.stringify(variant)))throw new Error('UNISSUED_VARIANT');
 const facts=input.variantFacts?.[variant.id],scenes=(facts?.storyboard??input.storyboard).map(s=>({...s,copy:facts?.sceneCopy[s.id]??s.copy}));
 const serveUrl=resolve(folder,'bundle'),output=resolve(folder,'renders',variant.id);await mkdir(output,{recursive:true});
 const browser=await openBrowser('chrome',{browserExecutable:process.env.CHROME_PATH??null,chromeMode:'headless-shell',chromiumOptions:{gl:'angle',headless:true,disableWebSecurity:false}});
 try{
  let evidence:FrameEvidence|undefined;
  const common={serveUrl,port:Number(process.env.DIRECTOR_RENDER_PORT)||await availableRenderPort(),puppeteerInstance:browser,inputProps:{format:variant.format,locale:variant.locale,hook:variant.hook,cta:variant.cta,length:variant.length},timeoutInMilliseconds:30000,onBrowserLog:(log:{text:string})=>{if(log.text.startsWith('DIRECTOR_EVIDENCE:'))evidence=JSON.parse(log.text.slice('DIRECTOR_EVIDENCE:'.length));}};
  const composition=await selectComposition({...common,id:variant.format}),durationFrames=Math.round(variant.length*format.fps),frames=options.frames??sampleFrames(scenes,format.fps,durationFrames),samples:Sample[]=[];
  if(options.video)await renderMedia({...common,composition,outputLocation:resolve(output,'preview.mp4'),codec:'h264',pixelFormat:'yuv420p',concurrency:1,scale:options.scale??1,crf:23});
  for(const frame of frames){evidence=undefined;const path=resolve(output,`${frame}.png`);await renderStill({...common,composition,frame,output:path,imageFormat:'png'});if(!evidence)throw new Error('RENDER_EVIDENCE_MISSING');samples.push({evidence,png:await readFile(path),background:new Uint8Array(),repeat:new Uint8Array()});}
  await writeFile(resolve(output,'evidence.json'),JSON.stringify(samples.map(s=>s.evidence),null,2));
  if(options.check){
   for(const s of [...samples].reverse()){
    const frame=s.evidence.frame;const bg=await renderStill({...common,inputProps:{...common.inputProps,inkless:true},composition:{...composition,props:{...composition.props,inkless:true}},frame,output:null,imageFormat:'png'});s.background=bg.buffer!;
   }
   await scrubFrames(browser,{...common,composition},composition,samples);
   const report=await checkRenders({format,variant,brand:input.brand,scenes,samples,requiredCopy:facts?.required,durationFrames,renderMs:Math.round(performance.now()-started)});
   await writeFile(resolve(output,'checks.json'),JSON.stringify(report,null,2));return {output,report};
  }
  return {output,report:null};
 }finally{await browser.close({silent:true});}
}
