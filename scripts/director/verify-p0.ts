import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {DirectionInput,BrandKit} from '../../packages/director/types';
import {createWorkspace} from '../../apps/local-runner/director/workspace';
import {sandboxTool} from '../../apps/local-runner/director/sandbox';
async function main(){
 const build=JSON.parse(await readFile('artifacts/debug/creative-build-d0/build.json','utf8')),source=build.jobs[0].payload.creativeInputs;
 const scenes=build.jobs.find((j:{job_key:string})=>j.job_key==='creative.script.d0').output.value.sourceScenes;
 const brand:BrandKit={tokens:Object.fromEntries(source.brand.palette.map((p:{id:string;hex:string})=>[p.id,p.hex])),fonts:[{family:'Noto Sans',url:'noto.woff2'}],logos:[{id:'logo0',url:'logo.svg',clearSpacePx:24,required:true}],rules:{allowedFonts:['Noto Sans'],forbiddenColours:[],minimumContrast:4.5},copy:{hook:{'en-GB':scenes[0].onScreenCopy},version:{'en-GB':scenes[1].onScreenCopy},comment:{'en-GB':scenes[2].onScreenCopy},close:{'en-GB':scenes[3].onScreenCopy},...Object.fromEntries(source.protectedCopy.map((p:{slot:string;locale:string;text:string})=>[p.slot,{[p.locale]:p.text}]))},facts:{},references:[]};
 const formats=source.scope.placements.map((f:{id:string;width:number;height:number;fps:number})=>{const s=source.brand.limits.safeZonesByPlacement[f.id];return {...f,safe:{top:s.top*f.height,bottom:s.bottom*f.height,left:s.left*f.width,right:s.right*f.width},minTextPx:32};});
 const input:DirectionInput={protocol:'director@1',runId:'sonicdesk',roundId:'p0',directionId:'d0',iterationId:'i0',brand,brief:source.brief,assets:[],formats,variants:formats.map((f:{id:string})=>({id:f.id,format:f.id,locale:'en-GB',hook:'primary',cta:'primary',length:6})),storyboard:scenes.map((s:{sceneId:string;startTime:number;endTime:number;onScreenCopy:string;visualNotes:string})=>({id:s.sceneId,start:s.startTime,end:s.endTime,copy:[s.onScreenCopy],visualNotes:s.visualNotes,motionNotes:'Approved purposeful continuous motion',maxStaticSeconds:.5})),resourceIds:[]};
 await mkdir('fixtures/director',{recursive:true});await writeFile('fixtures/director/input.json',JSON.stringify(input,null,2));
 const folder=await createWorkspace('artifacts/m08/workspaces',input);await copyFile('fixtures/director/Sonicdesk.tsx',resolve(folder,'Composition.tsx'));
 await copyFile('public/fixtures/noto-latin.woff2',resolve(folder,'public/noto.woff2'));
 await copyFile(`artifacts/debug/creative-build-d0/files/${source.brand.logos[0].sha256}`,resolve(folder,'public/logo.svg'));
 const media: {id:string;file:string}[]=JSON.parse(await readFile('fixtures/director/media/manifest.json','utf8')).filter((m:{id:string})=>!build.assets.some((a:{id:string})=>a.id===m.id));if(media.length<3)throw new Error('THREE_RECORDED_CAMPAIGN_STILLS_REQUIRED');
 for(let i=0;i<3;i++)await copyFile(`fixtures/director/media/${media[i].file}`,resolve(folder,`public/musician-${i}.png`));
 await sandboxTool(folder,'typecheck',{});console.log('typecheck passed');await sandboxTool(folder,'bundle',{});console.log('bundle passed');
 const results:unknown[]=[];
 for(let start=0;start<input.variants.length;start+=2){
  const batch=await Promise.all(input.variants.slice(start,start+2).map(async variant=>{
   if(process.argv.some(a=>a.startsWith('--formats='))&&!process.argv.find(a=>a.startsWith('--formats='))!.slice(10).split(',').includes(variant.format))return {format:variant.format,...JSON.parse(await readFile(resolve(folder,'renders',variant.id,'checks.json'),'utf8'))};
   const result=JSON.parse((await sandboxTool(folder,'render',{variant,options:{video:!process.argv.includes('--no-video'),check:true}})).trim().split('\n').at(-1)!);console.log(JSON.stringify({format:variant.format,...result.report}));return {format:variant.format,...result.report};
  }));results.push(...batch);
 }
 await writeFile(process.argv.find(a=>a.startsWith('--report='))?.slice(9)??'docs/m08/p0-render-results.json',JSON.stringify(results,null,2));if(results.some(r=>!(r as {passed:boolean}).passed))throw new Error('P0_CHECKS_FAILED');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
