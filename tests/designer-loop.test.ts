// Designer pipeline plan, point 4b: the designer's loop and inputs, with fake tools (no paid calls).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recorded from '../fixtures/director/static/input.json';
import {runDesigner,designerViews,newDesignerState,DESIGNER_REVISIONS_PER_SCENE,type DesignerTools,type PictureResult} from '../apps/local-runner/director/designer-loop';
import {designerContext} from '../packages/director/designer-context';
import {slimDirectorInput} from '../packages/director/inputs';
import type {DirectionInput} from '../packages/director/types';
import type {InspectionView} from '../packages/director/layout-inspection';

const input=()=>{const i=structuredClone(recorded) as unknown as DirectionInput;i.brief={...i.brief,designerVersion:1};return i;};
const intent='The frames show the product through something only it has, in the brand’s own system, palette and type.';
async function harness(answers:unknown[],over:Partial<DesignerTools>={},maxTurns=10,maxPictures=2){
 const folder=await mkdtemp(join(tmpdir(),'designer-')),shot=join(folder,'shot.jpg');await writeFile(shot,Buffer.from([0xff,0xd8,0xff,0xd9]));
 const files=new Map<string,string>([['Frame.tsx','export default function Frame(){return <div>A</div>;}']]),calls:{request:Parameters<Parameters<typeof runDesigner>[0]['call']>[0];images:number}[]=[],renders:InspectionView[][]=[],pictures:string[]=[];
 const tools:DesignerTools={files:async()=>[...files].map(([path,source])=>({path,source})),write:async(path,source)=>{files.set(path,source);},build:async()=>({ok:true}),
  render:async views=>{renders.push(views);return {summary:{version:1,revision:'r',views:views.length,hard:1,soft:0,reports:[{view:views[0].key,label:views[0].label,texts:1,images:0,findings:[{code:'TEXT_CLIPPED' as never,severity:'hard',view:views[0].key,detail:'The headline is clipped at the right edge.'}]}]},shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))};},
  requestImage:async p=>{pictures.push(p.purpose);return {id:`res-${pictures.length}`,status:'ready'} as PictureResult;},finish:async()=>({complete:true}),...over};
 const state=newDesignerState();let n=0;
 try{await runDesigner({input:input(),state,maxTurns,maxPictures,timeMs:600000,tools,save:async()=>{},call:async(request,images)=>{calls.push({request,images:images.length});const a=answers[Math.min(n++,answers.length-1)];return typeof a==='string'?a:JSON.stringify(a);}});}
 finally{await rm(folder,{recursive:true,force:true});}
 return {state,calls,renders,pictures,files};
}

test('write, build, render and look: the screenshots and hard findings reach the next turn',async()=>{
 const s=input().storyboard[0].id,last=input().storyboard.map(x=>({sceneId:x.id,moment:'Key frame'}));
 const {state,calls,renders,files}=await harness([
  {focus:{sceneId:s,activity:'designing',about:'opening frame'},edits:[{path:'Frame.tsx',oldText:'<div>A</div>',newText:'<div>B</div>'}],render:{sceneId:s,formats:[]}},
  {focus:{sceneId:s,activity:'finishing',about:'done'},finish:{intent,scenes:last}},
 ]);
 assert.equal(files.get('Frame.tsx'),'export default function Frame(){return <div>B</div>;}');
 assert.equal(renders.length,1);assert.equal(calls[1].images,1,'the rendered view is attached to the next turn');
 assert.match(JSON.stringify(calls[1].request.lastRender),/headline is clipped/);assert.equal(calls[1].request.scenes[0].formats[0].renders,1);
 assert.equal(state.complete,true);assert.equal(state.finish!.intent,intent);
});

test('at most three revisions per scene; a refused render says why',async()=>{
 const s=input().storyboard[0].id,turn={focus:{sceneId:s,activity:'revising',about:'again'},render:{sceneId:s,formats:[]}};
 const {renders,state}=await harness([turn],{},DESIGNER_REVISIONS_PER_SCENE+3);
 assert.equal(renders.length,DESIGNER_REVISIONS_PER_SCENE+1);assert.match(state.transcript.at(-1)!.text,/Three revisions of this scene in .* are used/);
});

test('pictures are bought in the background inside the approved count and reported when they arrive',async()=>{
 const s=input().storyboard[0].id,picture=(purpose:string)=>({purpose,scene:s,prompt:'An aluminium slab on a plinth.',aspect:'1:1'});
 let release:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;});
 const {state,calls}=await harness([
  {focus:{sceneId:s,activity:'designing',about:'pictures'},pictures:[picture('one'),picture('two'),picture('three')]},
  {focus:{sceneId:s,activity:'designing',about:'code'},files:[{path:'Frame.tsx',source:'export default ()=>null;'}]},
  {focus:{sceneId:s,activity:'designing',about:'code'},files:[{path:'Frame.tsx',source:'export default ()=>null;'}]},
 ],{requestImage:async p=>{if(p.purpose==='one'){release();}else await gate;return {id:p.purpose,status:'ready'};}},3,2);
 assert.equal(state.pictures,2);assert.match(JSON.stringify(state.transcript),/approved number of pictures is used/);
 assert.ok(calls.some(c=>c.request.toolResults.some(t=>t.text.includes('"status":"ready"'))),'arrivals are reported on a later turn');
 assert.equal(calls[1].request.budget.picturesLeft,0);
});

test('an unreadable or incomplete answer costs a turn and says what to fix; finish waits for every option',async()=>{
 const s=input().storyboard[0].id,scenes=input().storyboard.map(x=>({sceneId:x.id,moment:'Key frame'}));let finishes=0;
 const {state}=await harness(['not json',{focus:{sceneId:s,activity:'looking',about:'nothing'}},{focus:{sceneId:s,activity:'finishing',about:'done'},finish:{intent,scenes}}],{finish:async()=>++finishes<2?{complete:false,issue:'Implement the remaining options before finishing: de-DE.'}:{complete:true}},5);
 assert.match(JSON.stringify(state.transcript),/DESIGNER_EMPTY_TURN/);assert.match(JSON.stringify(state.transcript),/remaining options before finishing/);
 assert.equal(state.complete,true);assert.equal(state.turn,4);
});

test('views: the reference copy in the requested formats with screenshots, plus the longest copy without',()=>{
 const i=input(),s=i.storyboard[0].id,views=designerViews(i,s,i.formats.map(f=>f.id));
 const shots=views.filter(v=>v.shot);assert.equal(shots.length,i.formats.length);assert.ok(shots.every(v=>v.variantId===i.variants[0].id&&v.props.sceneId===s));
 assert.deepEqual(designerViews(i,s,[]).filter(v=>v.shot).map(v=>v.props.width),[i.formats.find(f=>f.id===i.variants[0].format)!.width],'default: the reference format');
});

test('the designer reads the full kit and the brand sheet note, never the slimmed summary or issued ids',()=>{
 const i=input();i.brand.rawKit={instructions:'I'.repeat(3000),boundaries:'B'.repeat(1500),rules:[{category:'type',key:'case',value:'x'.repeat(900)}]};
 i.brand.sheet=[{section:'typography',slice:0,url:'a.png',sha256:'a'.repeat(64),width:1280,height:1600}];
 const context=designerContext(i),slim=slimDirectorInput(i);
 assert.equal((context.brand.kit as {instructions:string}).instructions.length,3000);assert.ok((slim.brand.summary.instructions??'').length<=2000);
 assert.equal('compaction' in context,false);assert.equal('resourceIds' in context,false);assert.match(JSON.stringify(context.brand.sheet),/never a layout to copy/);
});
