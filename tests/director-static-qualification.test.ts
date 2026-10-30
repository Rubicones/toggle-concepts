import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createCanvas} from '@napi-rs/canvas';
import {createWorkspace} from '../apps/local-runner/director/workspace';
import {staticStillTools as staticTools} from '../apps/local-runner/director/static-tools';
import {writeSource,lintWorkspace,lintStaticComposition} from '../packages/director/policy.local';
import {buildResourceCatalog,type PricedResource} from '../apps/local-runner/director/resources';
import {checkRenders,type Sample} from '../packages/director/checks.local';
import {questionForFailure} from '../packages/director/questions';
import {publicStepMessage} from '../packages/director/events';
import {DirectorTimeline} from '../components/studio/director-timeline';
import inputJson from '../fixtures/director/static/input.json';
import designJson from '../fixtures/director/static/director-response.json';
import type {DirectionInput,BrandKit,Resource} from '../packages/director/types';
const input=inputJson as DirectionInput;
test('path aliases cannot read generated brand pages or overwrite immutable files; nested modules receive static policy',async()=>{
 const root=await mkdtemp(join(tmpdir(),'m09-alias-'));try{const folder=await createWorkspace(root,input),tools=staticTools(folder,input,designJson,Date.now()+60000),before=await readFile(join(folder,'brand.ts'),'utf8');
 for(const path of ['brand.ts','./brand.ts','././brand.ts']){const value=await tools.execute({tool:'read',path,offset:100000}) as {api?:string};assert.ok(value.api?.includes('Generated module'));await assert.rejects(()=>writeSource(folder,path,'overwrite'),/FILE_REJECTED/);}
 assert.equal(await readFile(join(folder,'brand.ts'),'utf8'),before);await mkdir(join(folder,'nested'));await writeFile(join(folder,'nested/runtime.ts'),'export const x=useCurrentFrame();');assert.ok((await lintWorkspace(folder)).some(f=>f.includes('static drafts')));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('static policy rejects computed motion APIs and SVG/HTML animation',()=>{for(const source of ["import * as R from 'react'; const x=R['useState']", "const x=api['useCurrentFrame']",'<svg><animate attributeName="x"/></svg>','<video src="local.mp4"/>','const s="@keyframes turn {}"'])assert.ok(lintStaticComposition(source).length,source);});
test('still proxies are reproducible low-resolution images and reuse their priced receipt',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'m09-proxy-'));try{const bytes=createCanvas(900,600).toBuffer('image/png'),sha256=createHash('sha256').update(bytes).digest('hex'),resource:Resource={id:'proxy',kind:'still',proxy:true,proxyFor:'3d',resolution:'low',scene:input.storyboard[0].id,purpose:'A still proxy',prompt:'A sculptural music object',aspect:'1:1',referenceAssetIds:[],mustNotContain:[]},cached:PricedResource[]=[];let calls=0;
 const args={folder,input:{...input,resourceIds:['proxy']},design:{...designJson,resources:[resource]},maxStills:1,perStillMicroUsd:10000,allowed:()=>true,produce:async()=>{calls++;return {revisionId:'receipt',stepId:'step',sha256,mime:'image/png',bytes,costMicroUsd:1000};},cached,save:async(r:PricedResource)=>{cached.push(r);}};
 const [proxy]=await buildResourceCatalog(args);assert.equal(proxy.width,512);assert.ok(proxy.height<=512);assert.equal(proxy.proxy,true);assert.equal(createHash('sha256').update(await readFile(join(folder,'public',proxy.url))).digest('hex'),proxy.renderSha256);await buildResourceCatalog(args);assert.equal(calls,1);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('static still checks enforce actual pixels, copy, exclusions and typography without motion/timing requirements',async()=>{
 const canvas=createCanvas(240,140),g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,240,140);const background=canvas.toBuffer('image/png');g.fillStyle='#000';g.font='24px Arial';g.fillText('APPROVED',20,45);const png=canvas.toBuffer('image/png');
 const sample:Sample={sceneId:'s',moment:'hero',png,background,repeat:new Uint8Array(),evidence:{frame:0,width:240,height:140,text:[{text:'APPROVED',x:20,y:20,width:150,height:30,fontSize:24,fontFamily:'Arial',color:'rgb(0, 0, 0)',opacity:1}],logos:[]}},brand:BrandKit={tokens:{},fonts:[],logos:[],copy:{},facts:{},references:[],rules:{allowedFonts:['Arial'],forbiddenColours:[],minimumContrast:4.5}},args={stage:'draft' as const,format:{id:'f',width:240,height:140,fps:30,safe:{left:10,right:10,top:10,bottom:10},minTextPx:20},variant:{id:'v',format:'f',locale:'en',hook:'h',cta:'c',length:6},brand,scenes:[{id:'s',start:0,end:99,copy:['APPROVED'],visualNotes:'Still',motionNotes:'Later',maxStaticSeconds:0}],samples:[sample],durationFrames:1,renderMs:1};
 const good=await checkRenders(args);assert.equal(good.passed,true);const bad=await checkRenders({...args,samples:[{...sample,evidence:{...sample.evidence,text:[{...sample.evidence.text[0],x:0,fontSize:4,fontFamily:'Forbidden'}]}}]});for(const check of ['safe-area','legibility','brand'])assert.ok(bad.findings.some(f=>f.check===check));assert.ok(!bad.findings.some(f=>['motion','timing','determinism'].includes(f.check)));
 assert.ok((await checkRenders({...args,samples:[]})).findings.some(f=>f.check==='copy'));
});
test('AD-visible timeline and stop messages exclude engine paths while technical details preserve the evidence',()=>{
 const error=Object.assign(new Error('ASSEMBLER_ALLOWANCE_EXHAUSTED'),{detail:'Failed artifacts/m08/workspaces/Frame.tsx and /Users/studio/code/file.ts TS7053.'}),question=questionForFailure(input,error,2000000);assert.doesNotMatch(question.question,/artifacts\/|\/Users\/|TS7053/);assert.match(question.technical!,/artifacts\//);
 const html=renderToStaticMarkup(React.createElement(DirectorTimeline,{events:[{id:'e',stepId:'s',kind:'critic',status:'done',at:'2026-10-28T10:00:00Z',message:error.detail,detail:{notes:[{recipient:'assembler',text:'Check apps/local-runner/failure.ts then improve hierarchy.'}],technical:error.detail}}]})),visible=html.replace(/<details><summary>Technical details[^<]*<\/summary>[\s\S]*?<\/details>/g,'').replace(/<[^>]*>/g,'');assert.doesNotMatch(visible,/artifacts\/|\/Users\/|apps\/local-runner|TS7053/);assert.match(error.detail,/artifacts\/m08/);assert.doesNotMatch(html,/artifacts\/m08/);assert.equal(publicStepMessage('YOUR BAND. YOUR TRACKS.'),'YOUR BAND. YOUR TRACKS.');
});
test('free wrap-up collects every renderable moment after a failed scene and labels the result unchecked',async()=>{
 const {wrapStaticFrames}=await import('../apps/local-runner/director/static-wrap'),folder=await mkdtemp(join(tmpdir(),'m09-wrap-'));let attempts=0,failed=0;
 try{const report=await wrapStaticFrames({design:designJson,render:async(sceneId,moment)=>{const frame=attempts++;if(frame===1)throw new Error('Recorded broken scene');return {output:folder,stills:[{sceneId,moment,frame,file:`${frame}.png`}]};},failed:async()=>{failed++;}});assert.equal(attempts,4);assert.equal(failed,1);assert.equal(report?.passed,false);assert.deepEqual(report?.sampledFrames,[0,2,3]);assert.equal(JSON.parse(await readFile(join(folder,'stills.json'),'utf8')).length,3);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('repeated intermediate images reuse immutable bytes and reject a content mismatch',async()=>{
 const {promoteEventImage}=await import('../packages/director/event-image'),bytes=Buffer.from('recorded still bytes');let stored:Buffer|undefined,attempts=0;
 const storage={promote:async(_key:string,value:Buffer)=>{attempts++;if(stored)throw new Error('Already exists');stored=value;},get:async()=>({body:stored!})};
 await promoteEventImage(storage,'media/fixture',bytes);await promoteEventImage(storage,'media/fixture',bytes);assert.equal(attempts,2);await assert.rejects(()=>promoteEventImage(storage,'media/fixture',Buffer.from('different pixels')),/Already exists/);
});
test('live coder notes preserve unsealed source but cannot replay the preceding request identity',async()=>{
 const {beginLiveRevision}=await import('../packages/director/live-controls');const state:import('../packages/director/state').WorkState={iterationId:'old',iteration:1,folder:'old-folder',design:designJson,liveRevision:'assembler',appliedControls:['note-1'],assembler:{turn:2,startedAt:42,transcript:[],complete:false}};
 beginLiveRevision(state,{blockId:'b',directionId:'d'});const first=state.iterationId;assert.notEqual(first,'old');assert.equal(state.design,designJson);assert.equal(state.pendingSource,'old-folder');assert.equal(state.assembler?.startedAt,42);assert.equal(state.iteration,1);
 beginLiveRevision(state,{blockId:'b',directionId:'d'});assert.equal(state.iterationId,first);state.appliedControls!.push('note-2');state.liveRevision='assembler';beginLiveRevision(state,{blockId:'b',directionId:'d'});assert.notEqual(state.iterationId,first);
});
