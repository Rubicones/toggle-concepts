// Designer pipeline plan, point 4e: designer blocks in the worker and the quote (no paid calls).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recorded from '../fixtures/director/static/input.json';
import {designerTools,provisionalDesign,finishDesign,designerPrefixImages} from '../apps/local-runner/director/designer-run';
import {designerViews} from '../apps/local-runner/director/designer-loop';
import {directionStatus} from '../packages/director/ad-flow';
import type {DirectionInput,Resource} from '../packages/director/types';

const input=()=>{const i=structuredClone(recorded) as unknown as DirectionInput;i.brief={...i.brief,designerVersion:1,pictureRulesVersion:1,finalNotesVersion:1,imageMethodsVersion:1};i.resourceIds=['r1','r2'];return i;};

test('the provisional design lets the preview and admission work; the finish becomes the sealed design',()=>{
 const i=input();i.materialMemory={version:1} as never;const d=provisionalDesign(i);
 assert.ok(d.designDocument.length>=80);assert.deepEqual(d.keyFrames!.map(k=>k.sceneId),i.storyboard.map(s=>s.id));assert.equal(d.resources.length,0);assert.equal(d.materialMemory,i.materialMemory,'admission rebuilds requests with the same material memory');
 finishDesign(d,{intent:'I'.repeat(100),scenes:i.storyboard.map((s,n)=>({sceneId:s.id,moment:`Moment ${n+1}`,...(n===0?{motion:'It turns slowly.'}:{})}))});
 assert.equal(d.designDocument,'I'.repeat(100));assert.equal(d.keyFrames![0].moments[0].description,'Moment 1');assert.equal(d.keyFrames![0].motion,'It turns slowly.');assert.equal(d.keyFrames![0].moments[0].id,'key-frame');
});

test('designer tools: a picture is recorded in the work state before it is bought; build, render and finish map to plain results',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'designer-run-'));
 try{
  await mkdir(join(folder,'.reports'),{recursive:true});const i=input(),design=provisionalDesign(i),order:string[]=[];
  const raw=join(folder,'raw.json');
  const sandbox=(async(_f:string,operation:string,args:unknown)=>{order.push(operation);if(operation==='typecheck')throw Object.assign(new Error('TS2304: Cannot find name x'),{sourceRevision:'r'});
   if(operation==='inspect'){const views=(args as {views:{key:string;shot:boolean}[]}).views;await writeFile(raw,JSON.stringify({revision:'r',views:views.map(v=>({key:v.key,raw:{width:1080,height:1080,texts:[],images:[],logos:[]},...(v.shot?{shot:join(folder,'v.jpg')}:{})}))}));return JSON.stringify({file:raw});}
   return '{}';}) as never;
  let savedWith:string[]=[];
  const tools=designerTools({folder,input:i,design,deadline:()=>Date.now()+60000,preview:async()=>{},facts:()=>({}),sandbox,save:async()=>{savedWith=design.resources.map(r=>r.id);},
   buy:async(r:Resource)=>{assert.deepEqual(savedWith,[r.id],'saved before admission');return {id:r.id,url:'a.png',thumbnail:'',width:1,height:1,sha256:'x',mime:'image/png',revisionId:'v',cutout:{url:'c.png',sha256:'c',width:1,height:1,box:[0,0,1,1]}};}});
  const built=await tools.build();assert.equal(built.ok,false,'a build problem is a result for the designer, not a crash');
  const picture=await tools.requestImage({purpose:'Slab',scene:i.storyboard[0].id,prompt:'A slab.',aspect:'1:1',referenceAssetIds:[],mustNotContain:[],proxyFor:'3d',cutout:true});
  assert.deepEqual(picture,{id:'r1',status:'ready',cutout:true});assert.equal(design.resources[0].proxy,true);assert.equal(design.resources[0].cutout,true);
  const views=designerViews(i,i.storyboard[0].id,[]),out=await tools.render(views);
  assert.equal(out.summary.views,views.length);assert.equal(out.shots.length,views.filter(v=>v.shot).length);
  const done=await tools.finish();assert.equal(done.complete,false);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('the brand sheet and the supplied references ride in the cached prefix and are never dropped',async()=>{
 const images=await designerPrefixImages('/w',input(),async()=>[{url:'data:sheet',label:'Brand sheet'}],async()=>[{url:'data:ref',label:'Reference'}]);
 assert.ok(images.every(i=>(i as {required?:boolean}).required));assert.equal((images[1] as {prefix?:boolean}).prefix,true);
});

test('the worker, the quote and the start route carry the designer pipeline; earlier blocks keep director and coder',()=>{
 const worker=readFileSync('apps/local-runner/director/worker.ts','utf8');
 assert.match(worker,/if\(usesDesigner\(input\)&&!state\.design\)/);assert.match(worker,/studio_designer_policy_version/);
 assert.match(worker,/if\(usesDesigner\(input\)\)await designDraft\(\);else await livePipeline/);
 assert.match(worker,/repair:usesDesigner\(input\)\?designerRepair:repair/);assert.match(worker,/selfReview:usesDesigner\(input\)\?false:coderSees/);
 const start=readFileSync('lib/server/director-start.ts','utf8');assert.match(start,/\.\.\.\(designer\?\{designerVersion:2\}:\{\}\)/);assert.match(start,/estimateDesignerDirection\(\{designer:models\.director\.pricing/);
 assert.match(readFileSync('app/api/studio/campaigns/[id]/creative/route.ts','utf8'),/pipeline:z\.enum\(\['director','designer'\]\)\.optional\(\)/);
 assert.match(readFileSync('components/studio/director-workspace.tsx','utf8'),/One designer per direction \(new\)/);
 assert.equal(directionStatus({id:'d',status:'running',progress:{phase:'designer'}} as never),'The designer is working');
});
