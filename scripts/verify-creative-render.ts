import {availableRenderPort} from '../apps/local-runner/render-port';
// Automated render verification only. Visual acceptance belongs to the owner.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {sonicdeskFixture} from '../fixtures/creative/sonicdesk';
import {compileVariant} from '../packages/creative/compile-v2';
import {computeCopyBudget} from '../packages/creative/copy-budget';
async function main(){
 const f=await sonicdeskFixture(),variant=f.variants[0],program=compileVariant(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope.placements[0],variant,f.engine,f.resources),out=resolve('artifacts/m07b/qualification');await mkdir(out,{recursive:true});
 const serveUrl=await bundle({entryPoint:resolve('remotion/draft-entry.tsx'),publicDir:resolve('public'),outDir:resolve(out,'bundle'),webpackOverride:config=>({...config,cache:false})}),browser=await openBrowser('chrome',{browserExecutable:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{const common={serveUrl,port:await availableRenderPort(),puppeteerInstance:browser,inputProps:{program,assetUrls:f.assetUrls}},composition=await selectComposition({...common,id:'M07Draft'});assert.equal(composition.durationInFrames,120);
  for(const [frame,name] of [[3,'repeat-a'],[9,'out-of-order'],[3,'repeat-b']] as const)await renderStill({...common,composition,frame,output:resolve(out,`${name}.png`),imageFormat:'png'});
  const digest=async(name:string)=>createHash('sha256').update(await readFile(resolve(out,`${name}.png`))).digest('hex');assert.equal(await digest('repeat-a'),await digest('repeat-b'));assert.notEqual(await digest('repeat-a'),await digest('out-of-order'));
  await renderMedia({...common,composition,codec:'h264',pixelFormat:'yuv420p',outputLocation:resolve(out,'creative.mp4'),concurrency:1});
  await writeFile(resolve(out,'report.json'),JSON.stringify({automated:'passed',frames:120,width:360,height:640,repeatFrameHash:await digest('repeat-a'),compositor:'EngineComposition',visualAcceptance:'pending owner review'},null,2));console.log(`Creative renderer verification passed: ${out}`);
 }finally{await browser.close({silent:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
