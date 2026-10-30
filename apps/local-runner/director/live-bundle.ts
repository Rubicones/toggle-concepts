import {issuedScenes} from '../../../packages/director/scenes';
import {build,version as compilerVersion} from 'esbuild';
import {requireRuntimeVersion} from './runtime-version';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {sourceFiles} from './snapshots';
import {lintWorkspace,confinedPath} from '../../../packages/director/policy.local';
import {readLiveOptions} from '../../../packages/director/live-options.local';
import {digest} from '../../../packages/director/money';
import type {DirectionInput} from '../../../packages/director/types';
const generated=new Set(['brand.ts','resources.ts','entry.tsx','runtime.ts','input.json','draft.json','catalog.json','toolchain.json','tsconfig.json']);
export async function liveSource(folder:string){
 await requireRuntimeVersion(folder);
 const input:DirectionInput=JSON.parse(await readFile(resolve(folder,'input.json'),'utf8'));if(input.stage!=='draft')throw new Error('LIVE_STATIC_DRAFT_REQUIRED');
 const files=(await sourceFiles(folder,input.iterationId)).filter(f=>!generated.has(f.path));if(!files.some(f=>f.path==='Frame.tsx'))throw new Error('FRAME_NOT_WRITTEN');
 return {input,files,revision:digest({compilerVersion,bridge:await readFile(resolve('apps/local-runner/director/live-preview-entry.tsx'),'utf8'),files:files.map(f=>({path:f.path,sha256:f.sha256})),brand:input.brand,variants:input.variants,facts:input.variantFacts})};
}
/** Only the sandbox child builds agent source. No browser, capture, renderStill or variant loop. */
export async function buildLivePreview(folder:string){
 const before=await liveSource(folder),cache=resolve(folder,'.reports','live',before.revision),manifest=resolve(cache,'manifest.json');
 try{return JSON.parse(await readFile(manifest,'utf8'));}catch{/* build a new immutable revision */}
 const issues=await lintWorkspace(folder);if(issues.length)throw new Error(issues.join('; '));
 const readiness=readLiveOptions(before.files.find(f=>f.path==='Frame.tsx')!.source,before.input),root=await realpath(folder);
 const result=await build({entryPoints:[resolve('apps/local-runner/director/live-preview-entry.tsx')],bundle:true,write:false,outfile:resolve(cache,'preview.js'),format:'iife',platform:'browser',target:'es2022',minify:true,define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent',plugins:[{name:'confined-live-frame',setup(b){
  b.onResolve({filter:/^director-frame$/},()=>({path:resolve(root,'Frame.tsx')}));
  b.onResolve({filter:/^director-brand$/},()=>({path:'brand',namespace:'live-brand'}));
  b.onResolve({filter:/.*/},async args=>{
   if(!args.importer.startsWith(root+'/'))return;
   if([resolve(root,'brand'),resolve(root,'brand.ts')].includes(resolve(args.resolveDir,args.path)))return {path:'brand',namespace:'live-brand'};
   if([resolve(root,'resources'),resolve(root,'resources.ts')].includes(resolve(args.resolveDir,args.path)))return {path:'resources',namespace:'live-resources'};
   if(args.path.startsWith('.')){const name=relative(root,resolve(args.resolveDir,args.path));await confinedPath(root,name);for(const tail of ['', '.tsx','.ts','.css','.json','/index.tsx','/index.ts'])try{const file=await realpath(resolve(root,name+tail));if(!file.startsWith(root+'/'))throw new Error('WORKSPACE_PATH_REJECTED');await readFile(file);return {path:file};}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'&&(error as NodeJS.ErrnoException).code!=='EISDIR')throw error;}throw new Error('PREVIEW_IMPORT_NOT_FOUND');}
   if(!['react','react/jsx-runtime','react-dom','remotion'].some(id=>args.path===id||args.path.startsWith(id+'/'))&&!/^@remotion\/(shapes|paths|layout-utils)$/.test(args.path))throw new Error('PREVIEW_IMPORT_REJECTED');
   return b.resolve(args.path,{resolveDir:process.cwd(),kind:args.kind});
  });
  b.onLoad({filter:/.*/,namespace:'live-resources'},()=>({contents:"export const resources=window.__DIRECTOR_PREVIEW__.resources;",loader:'js'}));
  b.onLoad({filter:/.*/,namespace:'live-brand'},()=>({contents:`export const brand=${JSON.stringify(before.input.brand)};export const copy=brand.copy;export const scenes=${JSON.stringify(issuedScenes(before.input))};export const variants=${JSON.stringify(before.input.variants)};export const variantFacts=${JSON.stringify(before.input.variantFacts??{})};export const resources=window.__DIRECTOR_PREVIEW__.resources;`,loader:'js'}));
 }}]});
 if((await liveSource(folder)).revision!==before.revision)throw new Error('PREVIEW_SOURCE_CHANGING');
 await mkdir(cache,{recursive:true});let bytes=0;
 for(const file of result.outputFiles){bytes+=file.contents.length;if(bytes>4194304)throw new Error('LIVE_PREVIEW_SIZE_LIMIT');await writeFile(resolve(cache,file.path.endsWith('.css')?'preview.css':'preview.js'),file.contents);}
 const info={revision:before.revision,...readiness};await writeFile(resolve(cache,'source.json'),JSON.stringify({revision:before.revision,files:before.files}));await writeFile(manifest,JSON.stringify(info));await mkdir(dirname(resolve(folder,'.reports','live-latest.json')),{recursive:true});await writeFile(resolve(folder,'.reports','live-latest.json'),JSON.stringify(info));return info;
}
