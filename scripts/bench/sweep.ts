// Renders what a bench run has built so far (every scene, format, language and hook) without any model call:
//   node --import tsx scripts/bench/sweep.ts <brand> <run folder>
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {brands,benchInput} from './brands';
import {designerTools,provisionalDesign} from '../../apps/local-runner/director/designer-run';
import {designerViews,screenshotForDesigner} from '../../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../../packages/director/types';

async function main(){
 const brand=brands.find(b=>b.id===process.argv[2]),out=resolve(process.argv[3]??'');if(!brand)throw new Error('brand');
 const base=benchInput(brand),input={...base,brief:{...base.brief,designerVersion:3}} as DirectionInput,folder=resolve(out,'workspace',input.runId,input.roundId,input.directionId,input.iterationId);
 const tools=designerTools({folder,input,design:provisionalDesign(input),deadline:()=>Date.now()+600000,preview:async()=>{},facts:()=>({}),save:async()=>{},buy:async()=>undefined});
 const built=await tools.build();if(!built.ok)throw new Error(`build: ${built.issue.slice(0,300)}`);
 const sweep=resolve(out,'sweep');await mkdir(sweep,{recursive:true});let hard=0;
 for(const scene of input.storyboard){const views=[...new Set(input.variants.map(v=>`${v.locale}|${v.hook}`))].flatMap(k=>{const [locale,hook]=k.split('|');return designerViews({...input,variants:input.variants.filter(v=>v.locale===locale&&v.hook===hook)},scene.id,input.formats.map(f=>f.id)).filter(v=>v.shot);});
  const r=await tools.render(views);hard+=r.summary.hard;
  for(const shot of r.shots){const jpeg=await screenshotForDesigner(shot.file,540);await writeFile(join(sweep,`${shot.key.replace(/[^\w.-]+/g,'_')}.jpg`),Buffer.from(jpeg.split(',')[1],'base64'));}}
 console.log(JSON.stringify({brand:brand.id,hard}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
