// Designer blocks in the worker (designer pipeline plan, point 4e): the real tools behind the designer loop, the
// provisional design the preview and admission read while it works, and the finished design it leaves behind.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {sandboxTool} from './sandbox';
import {propagateExecutionFailure} from '../../../packages/director/execution-failures';
import {liveTools} from './live-tools';
import {staticSourceContext} from './static-assembler';
import {analyzeInspection,type InspectionView} from '../../../packages/director/layout-inspection';
import {pictureResource,type DesignerTurn} from '../../../packages/director/designer';
import type {DesignerTools,PictureResult} from './designer-loop';
import type {Design} from '../../../packages/director/contract';
import type {CatalogEntry,DirectionInput,Resource} from '../../../packages/director/types';

/** The design the preview, the critic and picture admission read while the designer works. */
export function provisionalDesign(input:DirectionInput):Design{
 return {designDocument:'The designer is working on this draft. Its intent, scene moments and notes for the final appear here when it finishes.',
  keyFrames:input.storyboard.map(s=>({sceneId:s.id,moments:[{id:'key-frame',description:'Key frame'}]})),resources:[],
  // Admission rebuilds each picture request with the design's material memory; it must be the one the worker uses.
  ...(input.materialMemory?{materialMemory:input.materialMemory}:{})};
}

/** The finish turn becomes the sealed design: intent, one moment per scene, and point 3's notes. */
export function finishDesign(design:Design,finish:NonNullable<DesignerTurn['finish']>){
 design.designDocument=finish.intent;
 design.keyFrames=finish.scenes.map(s=>({sceneId:s.sceneId,moments:[{id:'key-frame',description:s.moment}],...(s.motion?{motion:s.motion}:{}),...(s.sound?{sound:s.sound}:{})}));
 return design;
}

export function designerTools(args:{folder:string;input:DirectionInput;design:Design;deadline:()=>number;preview:Parameters<typeof liveTools>[3];facts:()=>Record<string,CatalogEntry['image']>;
 /** Saves the work state (the picture is recorded before admission). */save:()=>Promise<void>;
 /** Buys one recorded picture through the catalog, admission and ledger; returns its entry. */buy:(resource:Resource)=>Promise<CatalogEntry|undefined>;
 sandbox?:typeof sandboxTool}):DesignerTools{
 const {folder,input,design}=args,run=args.sandbox??sandboxTool,tools=()=>liveTools(folder,input,args.deadline(),args.preview,{sandbox:run});
 const settle=async(resource:Resource):Promise<PictureResult>=>{
  let entry:CatalogEntry|undefined;
  try{entry=await args.buy(resource);}catch(error){if(error instanceof Error)Object.assign(error,{resourceId:resource.id});throw error;}
  return entry?{id:resource.id,status:'ready',...(entry.cutout?{cutout:true}:entry.cutoutFailed?{cutout:false,detail:'The cutout failed; use the rectangle.'}:{})}:{id:resource.id,status:'failed',detail:'The picture could not be made.'};
 };
 return {
  files:async()=>(await staticSourceContext(folder,input.iterationId)).files,
  write:async(path,source)=>tools().execute({tool:'write',path,source}),
  build:async()=>{try{await tools().execute({tool:'typecheck'});await tools().execute({tool:'bundle'});return {ok:true};}catch(error){if(propagateExecutionFailure(error))throw error;return {ok:false,issue:error instanceof Error?error.message:'The source does not build.'};}},
  render:async(views:InspectionView[])=>{
   const out=JSON.parse((await run(folder,'inspect',{views},180000)).trim().split('\n').at(-1)!),raw=JSON.parse(await readFile(out.file,'utf8')) as {revision:string;views:{key:string;shot?:string}[]};
   return {summary:analyzeInspection(views,raw as Parameters<typeof analyzeInspection>[1],input,args.facts()),shots:raw.views.flatMap(v=>v.shot?[{key:v.key,file:v.shot}]:[])};
  },
  requestImage:async(picture):Promise<PictureResult>=>{
   const resource=pictureResource(picture,input,design.resources.map(r=>r.id));
   design.resources.push(resource);await args.save();
   return settle(resource);
  },
  // Pictures recorded before a restart: the catalog's cached entry is reused, an unfinished purchase is resumed under
  // the same resource id (the paid request is reused by its receipt), and the designer hears the result as usual.
  resumePictures:async reported=>design.resources.filter(r=>!reported.includes(r.id)).map(resource=>({id:resource.id,settle:()=>settle(resource)})),
  finish:async()=>{try{const r=await tools().execute({tool:'finish'}) as {complete?:boolean};return r?.complete?{complete:true}:{complete:false,issue:'The draft is not complete yet.'};}catch(error){if(propagateExecutionFailure(error))throw error;return {complete:false,issue:error instanceof Error?error.message:'The draft is not complete yet.'};}},
 };
}

/** Pictures the designer reads in its cached prefix: the brand sheet, then the supplied references. */
export async function designerPrefixImages(folder:string,input:DirectionInput,sheet:(folder:string,input:DirectionInput)=>Promise<{url:string;label:string}[]>,references:(folder:string,input:DirectionInput)=>Promise<{url:string;label:string}[]>){
 return [...(await sheet(folder,input)).map(r=>({...r,required:true})),...(await references(folder,input)).map(r=>({...r,prefix:true,required:true}))];
}
export const designerResourcesFile=(folder:string)=>resolve(folder,'resources.ts');
