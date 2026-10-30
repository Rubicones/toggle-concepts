import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {DirectionInput,CheckReport} from '../../../packages/director/types';
import type {AssemblerAction} from '../../../packages/agents/prompts/assembler-v1';
import {writeSource,confinedPath,lintWorkspace} from '../../../packages/director/policy.local';
import {sandboxTool} from './sandbox';
import {snapshotFolder} from './snapshots';
import {brandModuleGuide} from '../../../packages/director/transcript';
/** Every write is agent-authored; the host only observes and gates publication. */
export function compositionTools(folder:string,input:DirectionInput,deadline=Date.now()+1800000){
 const tool=(operation:'bundle'|'render'|'typecheck',args:unknown)=>sandboxTool(folder,operation,args,deadline-Date.now());
 let verifiedHash:string|null=null;const reports:Record<string,CheckReport>={};
 const variant=(id:string)=>{const v=input.variants.find(v=>v.id===id);if(!v)throw new Error('UNISSUED_VARIANT');return v;};
 const render=async(id:string,options:unknown)=>{const raw=await tool('render',{variant:variant(id),options});return JSON.parse(raw.trim().split('\n').at(-1)!);};
 return {reports,async execute(action:AssemblerAction):Promise<unknown>{
  if(Date.now()>=deadline)throw new Error('ASSEMBLER_TIME_LIMIT');
  if(action.tool==='write'){verifiedHash=null;await writeSource(folder,action.path,action.source);return {written:action.path};}
  // Generated data files are large; the agent gets their API instead of paging through them.
  if(action.tool==='brand'||action.tool==='read'&&['brand.ts','input.json','./brand.ts','./input.json'].includes(action.path))return {note:'Generated, read-only data module. Use this API; do not page through it.',api:brandModuleGuide(input)};
  if(action.tool==='read')return (await readFile(await confinedPath(folder,action.path),'utf8')).slice(action.offset??0,(action.offset??0)+16384);
  if(action.tool==='listResources')return JSON.parse(await readFile(resolve(folder,'catalog.json'),'utf8'));
  if(action.tool==='lint')return {findings:await lintWorkspace(folder)};
  if(action.tool==='typecheck'||action.tool==='bundle')return tool(action.tool,{});
  if(action.tool==='renderStill'){const v=variant(action.variantId),f=input.formats.find(f=>f.id===v.format)!;if((action.frame??0)>=Math.round(v.length*f.fps))throw new Error('FRAME_OUT_OF_RANGE');return render(v.id,{frames:[action.frame??0],check:false});}
  if(action.tool==='preview')return render(action.variantId,{frames:[],video:true,check:false,scale:.5});
  if(action.tool==='determinism')return render(action.variantId,{check:true});
  if(action.tool==='checks'){
   const before=await snapshotFolder(folder,input.iterationId);await tool('typecheck',{});await tool('bundle',{});
   for(let i=0;i<input.formats.length;i+=2)await Promise.all(input.formats.slice(i,i+2).map(async format=>{const v=input.variants.find(v=>v.format===format.id);if(!v)return;const result=await render(v.id,{video:true,check:true,scale:.5});reports[v.id]=result.report;}));
   const after=await snapshotFolder(folder,input.iterationId);verifiedHash=before.hash===after.hash&&Object.values(reports).length>0&&Object.values(reports).every(r=>r.passed)?after.hash:null;
   await mkdir(resolve(folder,'.reports'),{recursive:true});await writeFile(resolve(folder,'.reports','objective-results.json'),JSON.stringify(reports,null,2));return {passed:verifiedHash!==null,reports};
  }
  const snapshot=await snapshotFolder(folder,input.iterationId);if(!verifiedHash||verifiedHash!==snapshot.hash)throw new Error('CURRENT_SOURCE_CHECKS_REQUIRED');return {complete:true,sourceHash:snapshot.hash,reports};
 }};
}
