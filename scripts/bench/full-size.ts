// Renders a finished bench run's frames at full size and measures every picture placement, for a craft audit. The
// bench's own sweep keeps 540 px thumbnails; execution defects (soft pictures, halos, seams, small type) show only at
// the size a viewer gets. No model: the run's final Frame.tsx is built and rendered by the pipeline's renderer.
//   node --import tsx scripts/bench/full-size.ts <run folder> <out folder> [--locale=en-GB] [--hook=primary]
import {mkdir,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {buildLivePreview} from '../../apps/local-runner/director/live-bundle';
import {inspectLivePreview} from '../../apps/local-runner/director/live-inspect';
import {analyzeView,type InspectionView,type RawView} from '../../packages/director/layout-inspection';
import {liveFormat} from '../../packages/director/live-preview';
import type {DirectionInput} from '../../packages/director/types';

const arg=(name:string,fallback:string)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=')[1]??fallback;
async function workspaceOf(run:string):Promise<string>{
 const walk=async(dir:string,depth:number):Promise<string|undefined>=>{if(existsSync(join(dir,'input.json'))&&existsSync(join(dir,'Frame.tsx')))return dir;if(depth>5)return undefined;
  for(const e of await readdir(dir,{withFileTypes:true}))if(e.isDirectory()&&!['public','bundle','.tmp','.reports','snapshots','renders'].includes(e.name)){const found=await walk(join(dir,e.name),depth+1);if(found)return found;}return undefined;};
 const found=await walk(join(run,'workspace'),0);if(!found)throw new Error(`No workspace with a Frame.tsx under ${run}`);return found;
}
async function main(){
 const run=resolve(process.argv[2]??''),out=resolve(process.argv[3]??join(run,'full')),folder=await workspaceOf(run);await mkdir(out,{recursive:true});
 const input=JSON.parse(await readFile(join(folder,'input.json'),'utf8')) as DirectionInput,locale=arg('locale',input.variants[0]?.locale??'en-GB'),hook=arg('hook',input.variants[0]?.hook??'primary');
 await buildLivePreview(folder);
 const report:unknown[]=[];
 for(const format of input.formats){
  const variant=input.variants.find(v=>v.locale===locale&&v.hook===hook&&v.format===format.id)??input.variants.find(v=>v.locale===locale&&v.hook===hook)??input.variants[0];
  const views:InspectionView[]=input.storyboard.map(scene=>({key:`${variant.id}|${format.id}|${scene.id}`,label:`${format.id} ${format.width}×${format.height}`,variantId:variant.id,ordered:true,shot:true,props:{format:liveFormat(format.width,format.height),locale:variant.locale,hook:variant.hook,cta:variant.cta,length:variant.length,width:format.width,height:format.height,sceneId:scene.id,moment:'key-frame'}}));
  const result=await inspectLivePreview(folder,views) as {file:string},raw=JSON.parse(await readFile(result.file,'utf8')) as {views:{key:string;raw?:RawView;error?:string;shot?:string}[]};
  for(const [i,view] of views.entries()){const v=raw.views.find(x=>x.key===view.key),scene=input.storyboard[i],name=`${format.id}_scene-${i+1}`;
   if(v?.shot)await copyFile(v.shot,join(out,`${name}.jpg`));
   const findings=v?.raw?analyzeView(v.raw,{view,input,minTextPx:format.minTextPx,safe:format.safe,facts:{}}):[];
   report.push({frame:name,width:format.width,height:format.height,scene:scene.id,error:v?.error,
    pictures:(v?.raw?.images??[]).map(p=>({src:p.src,logo:p.logo,box:[Math.round(p.box.x),Math.round(p.box.y),Math.round(p.box.width),Math.round(p.box.height)],natural:[p.naturalWidth,p.naturalHeight],objectFit:p.objectFit,
     // How many screen pixels one picture pixel covers: cover fills the box with the larger scale, contain with the smaller.
     scale:p.naturalWidth&&p.naturalHeight?Math.round((p.objectFit==='contain'?Math.min:Math.max)(p.box.width/p.naturalWidth,p.box.height/p.naturalHeight)*100)/100:null})),
    texts:(v?.raw?.texts??[]).map(t=>({text:t.text.slice(0,60),size:Math.round(t.fontSize),box:[Math.round(t.box.x),Math.round(t.box.y),Math.round(t.box.width),Math.round(t.box.height)]})),
    logos:(v?.raw?.logos??[]).map(l=>[Math.round(l.box.x),Math.round(l.box.y),Math.round(l.box.width),Math.round(l.box.height)]),
    findings:findings.map(f=>`${f.severity} ${f.code}: ${f.detail.slice(0,140)}`)});
  }
 }
 await writeFile(join(out,'placements.json'),JSON.stringify(report,null,1));console.log(JSON.stringify({out,frames:report.length}));
}
main().catch(error=>{console.error(error instanceof Error?error.stack:error);process.exitCode=1;});
