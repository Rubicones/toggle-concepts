// Runs inside the sandboxed tool child: mounts the compiled live preview in an offline headless browser, reads DOM
// geometry for each requested view and screenshots only the few views marked for the critic.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '@playwright/test';
import {liveSource} from './live-bundle';
import {livePreviewDocument} from '../../../packages/director/live-preview';
import {collectLayout,type InspectionView,type RawView} from '../../../packages/director/layout-inspection';
import {previewMaterialAllowed} from '../../../packages/director/material-memory';
import type {DirectionInput} from '../../../packages/director/types';

const mimes:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf'};
export type InspectedView={key:string;raw?:RawView;error?:string;shot?:string};

export async function inspectLivePreview(folder:string,views:InspectionView[]){
 const input:DirectionInput=JSON.parse(await readFile(resolve(folder,'input.json'),'utf8'));
 const {revision}=await liveSource(folder),cache=resolve(folder,'.reports','live',revision);
 const script=await readFile(resolve(cache,'preview.js'),'utf8'),css=await readFile(resolve(cache,'preview.css'),'utf8').catch(()=>'');
 const resourcesSource=await readFile(resolve(folder,'resources.ts'),'utf8'),resources=JSON.parse(resourcesSource.slice(resourcesSource.indexOf('>=')+2).trim().replace(/;\s*$/,''));
 const names=new Set<string>([...input.brand.fonts.map(f=>f.url),...input.brand.logos.map(l=>l.url),...input.assets.map(a=>a.url),...Object.values(resources as Record<string,{url:string}>).map(r=>r.url)].filter((n):n is string=>!!n&&previewMaterialAllowed(input.materialMemory,n)));
 const assets:Record<string,string>={};
 for(const name of names){const bytes=await readFile(resolve(folder,'public',name)).catch(()=>undefined);if(bytes)assets[name]=`data:${mimes[extname(name).toLowerCase()]??'application/octet-stream'};base64,${bytes.toString('base64')}`;}
 const out=resolve(folder,'.reports','inspect',revision);await mkdir(out,{recursive:true});
 const first=views[0];if(!first)return {revision,views:[] as InspectedView[]};
 const token='inspect'+revision.slice(0,12);
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,chromiumSandbox:false});
 const results:InspectedView[]=[];
 try{
  const page=await browser.newPage({viewport:{width:first.props.width,height:first.props.height}});
  const documentUrl='http://inspection.invalid/',html=livePreviewDocument({script,css,token,props:first.props,assets,resources});
  // The only response is the preview document itself; every other request is refused.
  await page.route('**/*',route=>route.request().url()===documentUrl?route.fulfill({status:200,contentType:'text/html',body:html}):route.abort());
  // tsx keeps function names with a helper the page does not have.
  await page.addInitScript('window.__name=(f)=>f;window.__inspect=[];window.addEventListener("message",e=>{if(e.data&&typeof e.data.type==="string"&&e.data.type.startsWith("preview-"))window.__inspect.push(e.data);});');
  await page.goto(documentUrl,{waitUntil:'load'});
  await page.waitForFunction(()=>(window as unknown as {__inspect:{type:string}[]}).__inspect.some(m=>m.type==='preview-ready'),undefined,{timeout:15000});
  let sequence=0;
  for(const view of views){
   sequence++;
   try{
    await page.setViewportSize({width:view.props.width,height:view.props.height});
    await page.evaluate(([props,seq,tok])=>{window.postMessage({type:'preview-view',token:tok,props,sequence:seq,reviewKey:''},'*');},[view.props,sequence,token] as const);
    const outcome=await page.waitForFunction(seq=>{const m=(window as unknown as {__inspect:{type:string;sequence:number;message?:string}[]}).__inspect.find(x=>x.sequence===seq&&(x.type==='preview-view-ready'||x.type==='preview-error'));return m?{type:m.type,message:m.message??''}:false;},sequence,{timeout:8000}).then(h=>h.jsonValue() as Promise<{type:string;message:string}>);
    // Let React commit, fonts settle and pictures decode before reading geometry.
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>undefined)));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    if(outcome.type==='preview-error'){results.push({key:view.key,error:outcome.message||'This view could not be built.'});continue;}
    const raw=await page.evaluate(collectLayout,{width:view.props.width,height:view.props.height});
    let shot:string|undefined;if(view.shot){shot=resolve(out,`view-${results.length}.jpg`);await page.screenshot({path:shot,type:'jpeg',quality:82});}
    results.push({key:view.key,raw,...(shot?{shot}:{})});
   }catch(error){results.push({key:view.key,error:(error instanceof Error?error.message:'Inspection failed').slice(0,300)});}
  }
 }finally{await browser.close();}
 const file=resolve(out,'raw.json');await writeFile(file,JSON.stringify({revision,views:results}));
 return {revision,file,count:results.length};
}
