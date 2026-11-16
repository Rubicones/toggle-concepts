// Builds the brand sheet (designer pipeline plan, point 1b): each section of packages/brand/brand-sheet.ts is rendered
// to PNG with headless Chromium, offline (every request except the page itself is refused), at 1280 px wide; taller
// pages are cut into slices of at most 1600 px. Images are stored content-addressed in staging/brand-sheet/<sha>.png.
import {headlessShellPath} from './director/os-sandbox';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {chromium} from '@playwright/test';
import {adminClient,checked,sharedTenant} from '../../packages/data/shared-runtime';
import {objectStore} from '../../packages/media/s3.server';
import {brandSheetHtml,brandSheetSections,SHEET_MAX_HEIGHT,SHEET_WIDTH,type BrandSheetSection} from '../../packages/brand/brand-sheet';
import {inlineSheetAssets,loadBrandSheetSource} from '../../packages/brand/brand-sheet-data';

export type SheetImage={section:BrandSheetSection;position:number;slice:number;sha256:string;objectKey:string;width:number;height:number};
const MAX_SLICES=4,PAGE_URL='http://brand-sheet.invalid/';

/**
 * The browser the studio Mac already has: CHROME_PATH, else the headless shell the live inspection uses
 * (DIRECTOR_CHROME_PATH or Remotion's download). Playwright's own download is only the last resort; the studio does not
 * install it.
 */
export function sheetBrowserPath(env:Record<string,string|undefined>=process.env,platform=process.platform,arch=process.arch,exists=existsSync){
 if(env.CHROME_PATH)return env.CHROME_PATH;
 if(env.DIRECTOR_CHROME_PATH)return env.DIRECTOR_CHROME_PATH;
 if(platform!=='darwin'&&platform!=='linux')return undefined;
 const shell=headlessShellPath({},platform,arch);
 return exists(shell)?shell:undefined;
}

/** Renders one HTML page offline and returns PNG slices of at most SHEET_MAX_HEIGHT px. */
export async function renderSheetPage(html:string,launch=()=>chromium.launch({executablePath:sheetBrowserPath(),headless:true,chromiumSandbox:false})){
 const browser=await launch();
 try{
  const page=await browser.newPage({viewport:{width:SHEET_WIDTH,height:SHEET_MAX_HEIGHT},deviceScaleFactor:1});
  await page.route('**/*',route=>route.request().url()===PAGE_URL?route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}):route.abort());
  await page.goto(PAGE_URL,{waitUntil:'load',timeout:30000});
  await page.evaluate('(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()');
  const height=Math.min(SHEET_MAX_HEIGHT*MAX_SLICES,Math.max(1,Math.ceil(await page.evaluate('document.documentElement.scrollHeight') as number)));
  await page.setViewportSize({width:SHEET_WIDTH,height});
  const slices:Buffer[]=[];
  for(let y=0;y<height;y+=SHEET_MAX_HEIGHT)slices.push(await page.screenshot({type:'png',clip:{x:0,y,width:SHEET_WIDTH,height:Math.min(SHEET_MAX_HEIGHT,height-y)}}));
  return slices.map((png,i)=>({png,width:SHEET_WIDTH,height:Math.min(SHEET_MAX_HEIGHT,height-i*SHEET_MAX_HEIGHT)}));
 }finally{await browser.close();}
}

/** C2: one page at exactly the given size (the compact brand sheet): no slicing, the same viewport every time. */
export async function renderFixedPage(html:string,size:{width:number;height:number},launch=()=>chromium.launch({executablePath:sheetBrowserPath(),headless:true,chromiumSandbox:false})){
 const browser=await launch();
 try{
  const page=await browser.newPage({viewport:size,deviceScaleFactor:1});
  await page.route('**/*',route=>route.request().url()===PAGE_URL?route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}):route.abort());
  await page.goto(PAGE_URL,{waitUntil:'load',timeout:30000});
  await page.evaluate('(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()');
  return await page.screenshot({type:'png',clip:{x:0,y:0,...size}});
 }finally{await browser.close();}
}

/** The whole sheet for one brand: every section, content-addressed. */
export async function buildBrandSheet(admin:ReturnType<typeof adminClient>,tenant:string,campaign:string,deps:{get?:(key:string)=>Promise<Buffer>;put?:(key:string,body:Buffer,mime:string)=>Promise<unknown>;render?:typeof renderSheetPage}={}){
 const store=deps.get&&deps.put?null:objectStore(),get=deps.get??(async(key:string)=>(await store!.get(key)).body),put=deps.put??((key:string,body:Buffer,mime:string)=>store!.putStaging(key,body,mime));
 const source=await loadBrandSheetSource(admin,tenant,campaign,get),assets=await inlineSheetAssets(source,get),out:SheetImage[]=[];
 for(const [position,section] of brandSheetSections.entries()){
  const slices=await (deps.render??renderSheetPage)(brandSheetHtml(section,source,assets));
  for(const [slice,s] of slices.entries()){
   const sha256=createHash('sha256').update(s.png).digest('hex'),objectKey=`staging/brand-sheet/${sha256}.png`;
   try{await put(objectKey,s.png,'image/png');}catch(error){if(!(error instanceof Error&&error.message==='Precondition'))throw error;}
   out.push({section,position,slice,sha256,objectKey,width:s.width,height:s.height});
  }
 }
 return out;
}

/** Whole build, all sections; longer means the browser hung. */
export const SHEET_BUILD_MS=150000;
export async function processBrandSheet(){
 const admin=adminClient();
 const claimed=await admin.rpc('studio_claim_brand_sheet',{target_tenant:sharedTenant});
 if(claimed.error)return false; // migration 20261103000200 not applied: nothing to build
 const job=claimed.data as {submission_id?:string;campaign_id:string;tenant_id:string;lease_token:number}|null;if(!job?.submission_id)return false;
 const beat=setInterval(()=>{void admin.rpc('studio_heartbeat_brand_sheet',{target_submission:job.submission_id,token:job.lease_token});},15000);
 let sheets:SheetImage[]|null=null,failure:string|null=null;
 // A hung browser must not hold the lease forever: the heartbeat stops with the build after SHEET_BUILD_MS.
 let timer:ReturnType<typeof setTimeout>|undefined;const started=Date.now();
 console.log(`[brand-sheet] building the sheet for campaign ${job.campaign_id}`);
 try{sheets=await Promise.race([buildBrandSheet(admin,job.tenant_id,job.campaign_id),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('BUILD_TIMED_OUT: the local browser did not finish the pages in time')),SHEET_BUILD_MS);})]);
  console.log(`[brand-sheet] ${sheets.length} page${sheets.length===1?'':'s'} built in ${Math.round((Date.now()-started)/1000)} s`);}
 catch(error){failure=(error instanceof Error?error.message:'BUILD_FAILED').slice(0,200);console.error('[brand-sheet] build failed:',failure);}
 finally{clearInterval(beat);clearTimeout(timer);}
 checked(await admin.rpc('studio_finish_brand_sheet',{target_submission:job.submission_id,token:job.lease_token,sheets:sheets??[],failure}));
 return true;
}
