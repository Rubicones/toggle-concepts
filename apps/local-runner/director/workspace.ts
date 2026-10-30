import {issuedScenes} from '../../../packages/director/scenes';
import {runtimeVersions} from './runtime-version';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {atomicFile} from './atomic-file';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import type {DirectionInput} from '../../../packages/director/types';
export async function createWorkspace(root:string,input:DirectionInput){
 for(const id of [input.runId,input.roundId,input.directionId,input.iterationId])if(!/^[\w-]+$/.test(id))throw new Error('INVALID_APP_ID');
 const folder=resolve(root,input.runId,input.roundId,input.directionId,input.iterationId);await mkdir(resolve(folder,'public'),{recursive:true});
 const observe=relative(folder,resolve('remotion/director/observe')).split('\\').join('/');
 if(input.stage!=='draft')await writeFile(resolve(folder,'runtime.ts'),await readFile(resolve('remotion/director/useGsapTimeline.ts'),'utf8'));
 await writeFile(resolve(folder,'toolchain.json'),JSON.stringify(await runtimeVersions()));
 await writeFile(resolve(folder,'brand.ts'),`import {delayRender,continueRender,staticFile} from 'remotion';\nexport const brand = ${JSON.stringify(input.brand)} as const;\nexport const copy=brand.copy;\nexport const variantFacts${input.stage==='draft'?':Record<string,{sceneCopy:Record<string,string[]>;required:string[];storyboard?:{id:string;sourceSceneId?:string;start:number;end:number;copy:string[];visualNotes:string;motionNotes:string;maxStaticSeconds:number}[]}>':''}=${JSON.stringify(input.variantFacts??{})} as const;\nexport const scenes=${JSON.stringify(issuedScenes(input))} as const;\nexport const variants=${JSON.stringify(input.variants)} as const;\n${input.stage==='draft'?"export {resources} from './resources';\n":''}const handle=delayRender('brand fonts');\nPromise.all(brand.fonts.map(async f=>{const face=new FontFace(f.family,'url('+staticFile(f.url)+')',{weight:'weight' in f?String(f.weight):'400',style:'style' in f?String(f.style):'normal'});await face.load();document.fonts.add(face);})).then(()=>continueRender(handle));\n`);
 if(input.stage==='draft')await writeResources(folder,input,[]);
 await writeFile(resolve(folder,'input.json'),JSON.stringify(input));
 if(input.stage==='draft')await writeFile(resolve(folder,'entry.tsx'),`import React from 'react';
import {registerRoot,Composition} from 'remotion';
import {Observe} from ${JSON.stringify(observe.startsWith('.')?observe:'./'+observe)};
import Frame from './Frame';
const formats=${JSON.stringify(input.formats)};
const Body=(props:{width:number;height:number;format:string;locale:string;hook:string;cta:string;length:number;sceneId:string;moment:string;inkless?:boolean})=><Observe inkless={props.inkless}><Frame {...props}/></Observe>;
registerRoot(()=> <>{formats.map(f=><Composition key={f.id} id={f.id} component={Body} width={f.width} height={f.height} fps={f.fps} durationInFrames={1} defaultProps={{width:f.width,height:f.height,format:f.id,locale:${JSON.stringify(input.variants[0]?.locale??'en-GB')},hook:'primary',cta:'primary',length:6,sceneId:${JSON.stringify(input.storyboard[0]?.id??'')},moment:''}}/>)}</>);
`);
 else await writeFile(resolve(folder,'entry.tsx'),`import React from 'react';
import {registerRoot,Composition} from 'remotion';
import {Observe} from ${JSON.stringify(observe.startsWith('.')?observe:'./'+observe)};
import CompositionBody from './Composition';
const formats=${JSON.stringify(input.formats)};
const Body=(props:{format:string;locale:string;hook:string;cta:string;length:number;inkless?:boolean})=><Observe inkless={props.inkless}><CompositionBody {...props}/></Observe>;
registerRoot(()=> <>{formats.map(f=><Composition key={f.id} id={f.id} component={Body} width={f.width} height={f.height} fps={f.fps} durationInFrames={180} defaultProps={{format:f.id,locale:${JSON.stringify(input.variants[0]?.locale??'en-GB')},hook:'primary',cta:'primary',length:6}} calculateMetadata={({props})=>({durationInFrames:Math.round(props.length*f.fps)})}/>)}</>);
`);
 await writeFile(resolve(folder,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','dom.iterable','esnext'],strict:true,skipLibCheck:true,esModuleInterop:true,module:'esnext',moduleResolution:'bundler',jsx:'react-jsx',noEmit:true},include:['./**/*.tsx','./**/*.ts'],exclude:['bundle','snapshots']}));return folder;
}
export const sourceDigest=async(folder:string)=>createHash('sha256').update(await readFile(resolve(folder,JSON.parse(await readFile(resolve(folder,'input.json'),'utf8')).stage==='draft'?'Frame.tsx':'Composition.tsx'))).digest('hex');

/** The coder references issued resource IDs while images arrive independently. */
export async function writeResources(folder:string,input:DirectionInput,catalog:{id:string;url:string;proxy?:boolean;proxyFor?:string}[]){
 const resources=Object.fromEntries(input.resourceIds.map(id=>{const ready=catalog.find(r=>r.id===id);return [id,{id,url:ready?.url??'',ready:!!ready,proxy:ready?.proxy??false,proxyFor:ready?.proxyFor}];}));
 await atomicFile(resolve(folder,'resources.ts'),`export const resources:Record<string,{id:string;url:string;ready:boolean;proxy?:boolean;proxyFor?:string}>=${JSON.stringify(resources)};\n`);
 await atomicFile(resolve(folder,'catalog.json'),JSON.stringify([...input.assets,...catalog]));
}
