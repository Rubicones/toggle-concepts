export {liveTools as staticTools} from './live-tools';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import type {DirectionInput,CheckReport} from '../../../packages/director/types';
import type {Design} from '../../../packages/director/contract';
import type {AssemblerAction} from '../../../packages/agents/prompts/assembler-v1';
import {confinedPath,writeSource,lintStaticComposition} from '../../../packages/director/policy.local';
import {brandModuleGuide} from '../../../packages/director/transcript';
import {snapshotFolder} from './snapshots';
import {sandboxTool} from './sandbox';
/** Full findings stay on disk and in work state; observations must remain valid, small JSON. */
export function staticCheckObservation(result:{passed:boolean;reports:Record<string,CheckReport>;stills:unknown[]},sourceHash:string,reused=false){
 return {passed:result.passed,sourceHash,reused,stillsRendered:result.stills.length,reportFile:'.reports/objective-results.json',reports:Object.fromEntries(Object.entries(result.reports).map(([id,report])=>[id,{passed:report.passed,totalFindings:report.findings.length,findings:report.findings.filter((f,i,all)=>all.findIndex(other=>other.check===f.check&&other.message===f.message)===i).slice(0,6).map(f=>({...f,message:f.message.slice(0,180)}))}]))};
}
export function staticStillTools(folder:string,input:DirectionInput,design:Design,deadline:number,onStill?:Parameters<typeof sandboxTool>[4],dependencies:{sandbox?:typeof sandboxTool}={}){
 const reports:Record<string,CheckReport>={};let verifiedHash:string|null=null;
 const tool=async(operation:'typecheck'|'bundle'|'render',args:unknown)=>{if(Date.now()>deadline)throw new Error('ASSEMBLER_TIME_LIMIT');return (dependencies.sandbox??sandboxTool)(folder,operation,args,deadline-Date.now(),onStill);};
 const built=async(hash:string)=>{if(await readFile(resolve(folder,'.reports','bundle-source-hash'),'utf8').catch(()=>'')!==hash)throw new Error('Build the current source with bundle before rendering or checking it. The previous build is out of date.');};
 const variant=(id:string)=>{const v=input.variants.find(v=>v.id===id);if(!v)throw new Error('UNISSUED_VARIANT');return v;};
 const render=async(id:string,options:unknown)=>JSON.parse((await tool('render',{variant:variant(id),options})).trim().split('\n').at(-1)!);
 return {reports,async execute(action:AssemblerAction):Promise<unknown>{
  if(action.tool==='write'){const issues=lintStaticComposition(action.source,action.path);if(issues.length)throw new Error(issues.join('; '));verifiedHash=null;await writeSource(folder,action.path,action.source);return {written:action.path,bytes:Buffer.byteLength(action.source)};}
  if(action.tool==='read'){const target=await confinedPath(folder,action.path),path=relative(await realpath(folder),target).split('\\').join('/');if(['brand.ts','input.json','entry.tsx','draft.json','catalog.json','toolchain.json'].includes(path))return {api:brandModuleGuide(input),note:'Generated data is not paged through.'};return (await readFile(target,'utf8')).slice(action.offset??0,(action.offset??0)+4096);}
  if(action.tool==='brand')return {api:brandModuleGuide(input)};
  if(action.tool==='listResources'){const rows=JSON.parse(await readFile(resolve(folder,'catalog.json'),'utf8')) as {id:string;url:string;width:number;height:number;proxy?:boolean}[];const ordered=[...rows].sort((a,b)=>Number(design.resources.some(r=>r.id===b.id))-Number(design.resources.some(r=>r.id===a.id)));return {resources:ordered.slice(0,20).map(r=>({id:r.id,url:r.url,width:r.width,height:r.height,proxy:r.proxy})),total:rows.length};}
  if(action.tool==='typecheck')return (await tool(action.tool,{})).slice(-4096);
  if(action.tool==='bundle'){const before=await snapshotFolder(folder,input.iterationId),result=await tool('bundle',{}),after=await snapshotFolder(folder,input.iterationId);if(before.hash!==after.hash)throw new Error('The source changed during the build. Build it again.');await mkdir(resolve(folder,'.reports'),{recursive:true});await writeFile(resolve(folder,'.reports','bundle-source-hash'),after.hash);return result.slice(-4096);}
  if(action.tool==='renderStill'){if(!action.sceneId||!action.moment)throw new Error('Supply variantId, sceneId and moment. Drafts do not use frame numbers.');await built((await snapshotFolder(folder,input.iterationId)).hash);return render(action.variantId,{sceneId:action.sceneId,moment:action.moment,check:false});}
  if(action.tool==='checks'){
   const before=await snapshotFolder(folder,input.iterationId),stills=[];
   await built(before.hash);
   const cached=JSON.parse(await readFile(resolve(folder,'.reports','objective-cache.json'),'utf8').catch(()=>'null')) as {hash:string;result:{passed:boolean;reports:Record<string,CheckReport>;stills:unknown[]}}|null;
   if(cached?.hash===before.hash){Object.assign(reports,cached.result.reports);verifiedHash=cached.result.passed?before.hash:null;return staticCheckObservation(cached.result,before.hash,true);}
   for(const format of input.formats){const v=input.variants.find(v=>v.format===format.id);if(!v)throw new Error('FORMAT_VARIANT_REQUIRED');const result=await render(v.id,{check:true});reports[v.id]=result.report;stills.push(...result.stills.map((s:Record<string,unknown>)=>({...s,output:result.output,variantId:v.id})));}
   const after=await snapshotFolder(folder,input.iterationId);verifiedHash=before.hash===after.hash&&Object.values(reports).every(r=>r.passed)?after.hash:null;await mkdir(resolve(folder,'.reports'),{recursive:true});await writeFile(resolve(folder,'.reports','objective-results.json'),JSON.stringify(reports));const result={passed:!!verifiedHash,reports,stills};if(before.hash===after.hash)await writeFile(resolve(folder,'.reports','objective-cache.json'),JSON.stringify({hash:after.hash,result}));return staticCheckObservation(result,after.hash);
  }
  if(action.tool==='finish'){const source=await snapshotFolder(folder,input.iterationId);if(!verifiedHash||verifiedHash!==source.hash)throw new Error('CURRENT_SOURCE_CHECKS_REQUIRED');return {complete:true,sourceHash:source.hash};}
  throw new Error('MOTION_TOOL_UNAVAILABLE_IN_DRAFTS');
 }};
}
