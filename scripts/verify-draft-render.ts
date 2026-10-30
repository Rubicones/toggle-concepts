// Renderer qualification only; no application pages, provider calls or hosted records.
import assert from "node:assert/strict";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {bundle} from "@remotion/bundler";
import {openBrowser,selectComposition,renderStill} from "@remotion/renderer";
import {compilerFixture} from "../fixtures/drafts";
import {prepareDrafts,finishDrafts,draftHash} from "../packages/creative/compiler";
import {measureDraftText} from "../packages/creative/measure.local";
for(const key of Object.keys(process.env))if(!["PATH","HOME","TMPDIR","LANG","CHROME_PATH","SystemRoot","NODE_ENV"].includes(key))delete process.env[key];
async function main(){
 const fixture=compilerFixture(),output=resolve("artifacts/m07/qualification");mkdirSync(output,{recursive:true});
 const bytes=readFileSync("artifacts/m00/repeat-a.png"),hash=createHash("sha256").update(bytes).digest("hex");for(const source of fixture.context.assets){source.sha256=hash;source.bytes=bytes.length;}
 const prepared=prepareDrafts(fixture.plan,fixture.context),measurement=await measureDraftText(prepared.tasks),compiled=finishDrafts(prepared.compilation,measurement.fits,measurement.engine);assert.equal(compiled.qa.passed,true);
 const serveUrl=await bundle({entryPoint:resolve("remotion/draft-entry.tsx"),publicDir:resolve("public"),outDir:resolve(output,"bundle")});
 const browser=await openBrowser("chrome",{browserExecutable:process.env.CHROME_PATH??"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 const hashes:string[]=[];
 try{
  for(const direction of fixture.plan.directions){const program=compiled.programs.find(p=>p.directionId===direction.id&&p.locale==="ru-RU"&&p.placementId==="vertical-9x16")!;
   const assetUrls=Object.fromEntries(fixture.context.assets.map(a=>[a.id,`data:image/png;base64,${bytes.toString("base64")}`])),inputProps={program,assetUrls},common={serveUrl,puppeteerInstance:browser,inputProps,port:3112};const composition=await selectComposition({...common,id:"M07Draft"});
   assert.equal(composition.width,1080);assert.equal(composition.height,1920);assert.equal(composition.durationInFrames,450);
   for(const frame of [15,165,315]){const file=resolve(output,`${direction.recipe}-${frame}.png`);await renderStill({...common,composition,frame,output:file,imageFormat:"png",scale:.5});const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=width,height','-of','json',file],{encoding:'utf8'});assert.equal(probe.status,0);const stream=JSON.parse(probe.stdout).streams[0];assert.equal(stream.width,540);assert.equal(stream.height,960);if(frame===15)hashes.push(createHash('sha256').update(readFileSync(file)).digest('hex'));}
  }
  assert.equal(new Set(hashes).size,3,"The actual rendered recipes must differ");
  writeFileSync(resolve(output,"report.json"),JSON.stringify({status:"passed",compiledBindings:compiled.programs.length,orderedVariants:compiled.qa.orderedVariants,measuredTextBlocks:compiled.qa.fits.length,compilerHash:draftHash(compiled),frames:9,frameSize:[540,960],measurementEngine:measurement.engine,source:"Isolated qualification fixture only; not a campaign or approved creative"},null,2));
  console.log(`PASS: ${compiled.programs.length} measured bindings, nine real 540×960 renderer frames across three distinct directions/three timed beats. ${output}. No app interface tests, paid calls or hosted records.`);
 }finally{await browser.close({silent:true});}
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Draft renderer qualification failed");process.exitCode=1;});
