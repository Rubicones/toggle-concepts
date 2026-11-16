// Chat-shaped plan C8: real 3D in drafts (designerVersion 4). Recorded inputs only; no model or provider is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recorded from '../fixtures/director/static/input.json';
import {lintStaticComposition} from '../packages/director/policy.local';
import {createWorkspace,writeResources,storeModel} from '../apps/local-runner/director/workspace';
import {buildLivePreview} from '../apps/local-runner/director/live-bundle';
import {inspectLivePreview} from '../apps/local-runner/director/live-inspect';
import {analyzeView,type RawView,type InspectionView} from '../packages/director/layout-inspection';
import {modelOrPicture,seeded} from '../remotion/director/kit3d';
import {code3dNotes,THREE_D_MECHANICS,DEFAULT_FINAL_3D} from '../packages/director/three-d';
import {stageEMechanics} from '../packages/director/extension-chat';
import type {DirectionInput} from '../packages/director/types';

const input=(version:number):DirectionInput=>{const i=structuredClone(recorded) as DirectionInput;i.brief={...i.brief,designerVersion:version,...(version>=4?{materialsVersion:1,digestVersion:1}:{})};i.stage='draft';return i;};
const frame3d=`import React from 'react';
import {Scene3D} from './kit3d';
export default function Frame({width,height}:{width:number;height:number}){
 return <div style={{width,height,background:'#f4f1ea',position:'relative'}}>
  <Scene3D width={Math.round(width*0.8)} height={Math.round(height*0.6)} seed={7} final="turns slowly on its axis" style={{position:'absolute',left:width*0.1,top:height*0.1}} build={(THREE,{scene,camera,random})=>{
   const knot=new THREE.Mesh(new THREE.TorusKnotGeometry(1,0.35,160,24),new THREE.MeshStandardMaterial({color:'#e4572e',roughness:0.4}));knot.rotation.set(random(),random(),0);scene.add(knot);
   scene.add(new THREE.AmbientLight(0xffffff,0.6));const key=new THREE.DirectionalLight(0xffffff,2);key.position.set(3,4,5);scene.add(key);camera.position.set(0,0,6);}}/>
  <h1 style={{position:'absolute',left:60,bottom:60,margin:0,fontSize:72,color:'#101820'}}>YOUR BAND. YOUR TRACKS.</h1>
 </div>;
}`;

test('C8: version 4 drafts may import three; animation and the other 3D libraries stay out; earlier drafts are unchanged', ()=>{
 const src="import * as THREE from 'three';\nexport const geo=()=>new THREE.BoxGeometry(1,1,1);";
 assert.deepEqual(lintStaticComposition(src,'Frame.tsx',{threeD:true}),[]);
 assert.match(lintStaticComposition(src,'Frame.tsx').join(';'),/Motion libraries are unavailable/,'versions 1–3: as before');
 for(const bad of ["import {Canvas} from '@react-three/fiber';","import {ThreeCanvas} from '@remotion/three';","import {useFrame} from '@react-three/fiber';"])assert.ok(lintStaticComposition(bad,'Frame.tsx',{threeD:true}).length,bad);
 assert.match(lintStaticComposition("import * as T from 'three';const x=Math.random();",'Frame.tsx',{threeD:true}).join(';'),/random\(seed\)/,'seeded randomness only');
 assert.equal(seeded(7)(),seeded(7)(),'the kit\'s randomness is seeded');
});

test('C8: a generated model is placed with its picture as the fallback; storing it checks the file', async()=>{
 assert.equal(modelOrPicture({url:'p.jpg',ready:true}),'picture','no model yet: the picture');
 assert.equal(modelOrPicture({url:'p.jpg',modelUrl:'m.glb',ready:true}),'model');
 assert.equal(modelOrPicture({url:'p.jpg',modelUrl:'m.glb',ready:true},true),'picture','a model that cannot load gives way to its picture');
 assert.equal(modelOrPicture({url:'',ready:false}),'none');assert.equal(modelOrPicture(undefined),'none');
 const root=await mkdtemp(join(tmpdir(),'c8-model-'));
 try{
  const i={...input(4),resourceIds:['picture']},folder=await createWorkspace(root,i),entry:{id:string;url:string;model?:{url:string;sha256:string;bytes:number}}={id:'picture',url:'p.jpg'};
  await assert.rejects(()=>storeModel(folder,entry,Buffer.from('not a model at all, no')),/MODEL_NOT_GLB/);
  const glb=Buffer.concat([Buffer.from('glTF'),Buffer.alloc(16)]);await storeModel(folder,entry,glb);
  assert.match(entry.model!.url,/^[a-f0-9]{64}\.glb$/);await access(join(folder,'public',entry.model!.url));
  await writeResources(folder,i,[{...entry,model:entry.model}]);
  const v4=await readFile(join(folder,'resources.ts'),'utf8');assert.match(v4,/modelUrl\?:string/);assert.match(v4,/"modelUrl":"[a-f0-9]{64}\.glb"/);
  const old=input(3),oldFolder=await createWorkspace(join(root,'v3'),old);await writeResources(oldFolder,old,[]);
  assert.doesNotMatch(await readFile(join(oldFolder,'resources.ts'),'utf8'),/modelUrl/,'earlier drafts keep their resources module');
  await assert.rejects(()=>access(join(oldFolder,'kit3d.ts')),'no 3D kit in earlier drafts');await access(join(folder,'kit3d.ts'));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('C8: measured findings for a 3D object: it draws, it stays inside, words over it read', ()=>{
 const i=input(4),view:InspectionView={key:'v',label:'1:1',variantId:i.variants[0].id,ordered:true,shot:false,props:{format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:6,width:1080,height:1080,sceneId:'scene-1',moment:'hero'}};
 const ctx={view,input:i,minTextPx:32,safe:{top:54,right:54,bottom:54,left:54},facts:{}},box={x:100,y:100,width:800,height:600};
 const raw=(o:NonNullable<RawView['objects3d']>[number],texts:RawView['texts']=[]):RawView=>({width:1080,height:1080,images:[],logos:[],texts,objects3d:[o]});
 const codes=(r:RawView)=>analyzeView(r,ctx).filter(f=>/3D/.test(f.detail)).map(f=>[f.code,f.severity]);
 assert.deepEqual(codes(raw({box,drawn:null,luma:[]})),[['RENDER_ERROR','hard']]);
 assert.deepEqual(codes(raw({box,drawn:[0,0.2,0.6,0.8],luma:new Array(16).fill(0.2)})),[['SUBJECT_CROPPED','soft']]);
 assert.deepEqual(codes(raw({box,drawn:[0.2,0.2,0.8,0.8],luma:new Array(16).fill(0.2)})),[],'a whole object inside its canvas');
 const dark={text:'YOUR BAND.',box:{x:400,y:380,width:200,height:60},fontSize:64,color:'rgb(16, 24, 32)',element:1,clipped:false,lines:1,background:null,complexBackground:false,overImage:null};
 assert.deepEqual(codes(raw({box,drawn:[0.2,0.2,0.8,0.8],luma:new Array(16).fill(0.01)},[dark])),[['CONTRAST_OVER_PICTURE','soft']]);
});

test('C8: the draft records what the final adds; the mechanics arrive with stage E and as a catalogue entry', ()=>{
 assert.deepEqual(code3dNotes([{path:'Frame.tsx',source:frame3d}]),['In the final this object turns slowly on its axis.']);
 assert.deepEqual(code3dNotes([{path:'Frame.tsx',source:'export default ()=> <Scene3D width={1} height={1}/>;'}]),[DEFAULT_FINAL_3D]);
 assert.deepEqual(code3dNotes([{path:'Frame.tsx',source:'export default ()=> null;'}]),[]);
 assert.ok(stageEMechanics(input(4)).includes(THREE_D_MECHANICS));assert.ok(THREE_D_MECHANICS.length/4<300);
 for(const word of ['template','layout like'])assert.ok(!THREE_D_MECHANICS.toLowerCase().includes(word));
});

test('C8: a code-built scene bundles and renders the same pixels in the inspection browser, inside the frame', async t=>{
 const executable=await (async()=>{for(const p of ['/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell','/opt/pw-browsers/chromium',process.env.CHROME_PATH])if(p&&await access(p).then(()=>true,()=>false))return p;})();
 if(!executable){t.skip('No Chromium executable is available for the 3D render.');return;}
 const previous=process.env.CHROME_PATH;process.env.CHROME_PATH=executable;
 const root=await mkdtemp(join(tmpdir(),'c8-render-'));
 try{
  const i=input(4),folder=await createWorkspace(root,i);await writeFile(join(folder,'Frame.tsx'),frame3d);
  await buildLivePreview(folder);
  const old=input(3),oldFolder=await createWorkspace(join(root,'v3'),old);await writeFile(join(oldFolder,'Frame.tsx'),frame3d.replace("'./kit3d'","'three'"));
  await assert.rejects(()=>buildLivePreview(oldFolder),/Motion libraries are unavailable/,'earlier drafts still refuse 3D');
  const view:InspectionView={key:`${i.variants[0].id}|square|scene-1`,label:'1:1',variantId:i.variants[0].id,ordered:true,shot:true,props:{format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:6,width:1080,height:1080,sceneId:'scene-1',moment:'hero'}};
  const run=async()=>{const out=await inspectLivePreview(folder,[view]) as {file:string};const raw=JSON.parse(await readFile(out.file,'utf8')) as {views:{raw?:RawView;error?:string;shot?:string}[]};const v=raw.views[0];assert.ok(v.raw,v.error);return {raw:v.raw!,shot:await readFile(v.shot!)};};
  const a=await run(),b=await run();
  const o=a.raw.objects3d?.[0];assert.ok(o&&o.drawn,`the object drew pixels: ${JSON.stringify(a.raw.objects3d)}`);assert.ok(o.drawn[0]>0.01&&o.drawn[2]<0.99,'and sits inside its canvas');
  assert.ok(Buffer.compare(a.shot,b.shot)===0,'the same frame, byte for byte, on a second render');
  assert.ok(!analyzeView(a.raw,{view,input:i,minTextPx:32,safe:{top:54,right:54,bottom:54,left:54},facts:{}}).some(f=>f.code==='RENDER_ERROR'));
 }finally{process.env.CHROME_PATH=previous;await rm(root,{recursive:true,force:true});}
});
