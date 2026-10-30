import {z} from 'zod';
import {sourceFiles} from './snapshots';
import {assemble} from './assembler';
import type {LoopState} from '../../../packages/director/state';
import type {AssemblerAction} from '../../../packages/agents/prompts/assembler-v1';
import {OUTPUT_LIMIT_FEEDBACK} from '../../../packages/director/transcript';
import type {DraftConstruction} from '../../../packages/director/construction';
import type {DirectionInput} from '../../../packages/director/types';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {draftConstruction} from './construction';
import {propagateExecutionFailure} from '../../../packages/director/execution-failures';
const reply=z.object({files:z.array(z.object({path:z.string().min(1),source:z.string().min(1).max(65536)})).min(1).max(8)});
/** A source copied from a previous iteration is an input, not work on this request. */
function hasCurrentSourceWrite(state:LoopState){
 return state.transcript.some(entry=>{
  if(entry.from!=='tool')return false;
  try{const value=JSON.parse(entry.text);return value.tool==='write'&&typeof value.result?.written==='string'&&!value.result?.error;}catch{return false;}
 });
}
/** One source request, two repairs, then the existing lenient tool loop as a bounded fallback. */
export async function assembleStatic(args:{state:LoopState;maxTurns:number;timeMs:number;recoverExisting?:boolean;filesContext?:(state:LoopState)=>Promise<{files:{path:string;source:string}[];oversized:boolean;construction?:DraftConstruction}>;call:(state:LoopState,mode:'files'|'tools',files?:{path:string;source:string}[],construction?:DraftConstruction)=>Promise<string>;tool:(action:AssemblerAction)=>Promise<unknown>;save:(state:LoopState)=>Promise<void>;now?:()=>number}){
 const now=args.now??Date.now;
 // A transport, parser or toolchain fix may make already-authored source valid.
 // Check locally before another request or consulting the model's turn/output limits.
 if(args.recoverExisting&&!args.state.complete&&hasCurrentSourceWrite(args.state)&&(await args.filesContext?.(args.state))?.files.some(f=>f.path==='Frame.tsx')){
  try{for(const tool of ['typecheck','bundle','finish'] as const){const result=await args.tool({tool});args.state.transcript.push({from:'tool',text:JSON.stringify({tool,result,recovery:'existing-source'}).slice(0,8192)});if(tool==='finish'&&(result as {complete?:boolean}).complete)args.state.complete=true;}await args.save(args.state);if(args.state.complete)return args.state;}
  catch(error){if(propagateExecutionFailure(error))throw error;args.state.transcript.push({from:'tool',text:JSON.stringify({recovery:'existing-source',error:error instanceof Error?error.message:'Source needs repair'}).slice(0,4096)});await args.save(args.state);}
 }
 while(!args.state.complete&&args.state.turn<Math.min(3,args.maxTurns)&&now()-args.state.startedAt<args.timeMs){
  const context=await args.filesContext?.(args.state);if(context?.oversized)break;
  let text:string;try{text=await args.call(args.state,'files',context?.files,context?.construction);}catch(error){if(!(error instanceof Error&&error.message==='OUTPUT_TOKEN_LIMIT'))throw error;args.state.turn++;args.state.transcript.push({from:'tool',text:JSON.stringify({error:'OUTPUT_TOKEN_LIMIT',detail:OUTPUT_LIMIT_FEEDBACK})});await args.save(args.state);continue;}
  const first=args.state.turn===0;args.state.turn++;args.state.transcript.push({from:'agent',text});await args.save(args.state);
  try{const files=reply.parse(JSON.parse(text)).files;if(first&&files[0].path!=='Frame.tsx')throw new Error('Write executable Frame.tsx first; no plan or generated data reads.');
   for(const file of files){const result=await args.tool({tool:'write',...file});args.state.transcript.push({from:'tool',text:JSON.stringify({tool:'write',result})});await args.save(args.state);}
   for(const tool of ['typecheck','bundle','finish'] as const){const result=await args.tool({tool});args.state.transcript.push({from:'tool',text:JSON.stringify({tool,result}).slice(0,8192)});if(tool==='finish'&&(result as {complete?:boolean}).complete)args.state.complete=true;await args.save(args.state);}
  }catch(error){if(propagateExecutionFailure(error))throw error;args.state.transcript.push({from:'tool',text:JSON.stringify({error:error instanceof Error?error.message:'Repair the source'}).slice(0,4096)});await args.save(args.state);}
 }
 if(!args.state.complete)await assemble({...args,tool:async action=>{
  if(args.recoverExisting&&action.tool==='finish'&&!hasCurrentSourceWrite(args.state))throw new Error('Write the requested changes to Frame.tsx or its authored modules before finishing. The inherited preview does not implement this revision.');
  return args.tool(action);
 },maxToolCalls:Math.ceil(args.maxTurns/9)*24,call:async state=>args.call(state,'tools',undefined,(await args.filesContext?.(state))?.construction)});return args.state;
}

/** Revision/repair requests see the same authored source, never generated brand or input data. */
export async function staticSourceContext(folder:string,iterationId:string){
 const generated=new Set(['brand.ts','resources.ts','runtime.ts','entry.tsx','input.json','catalog.json','draft.json','toolchain.json','tsconfig.json']);
 const files=(await sourceFiles(folder,iterationId)).filter(f=>!generated.has(f.path)).map(f=>({path:f.path,source:f.source}));
 const input:DirectionInput=JSON.parse(await readFile(resolve(folder,'input.json'),'utf8'));
 return {files,oversized:Buffer.byteLength(JSON.stringify(files))>16000,construction:await draftConstruction(folder,input)};
}
