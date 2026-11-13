// Engine rebuild (designerVersion 3): the neutral kit in the draft workspace, the engine instructions, every ordered
// line in the designer's context, several scenes per render. Versions 1 and 2 are unchanged. No live calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recorded from '../fixtures/director/static/input.json';
import {runDesigner,newDesignerState,DESIGNER_REVISIONS_PER_SCENE,renderKey,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import {createWorkspace} from '../apps/local-runner/director/workspace';
import {usesEngineKit,heroFirst,designerTurnResponseFor,readDesignerTurn} from '../packages/director/designer';
import {designerInstructionsFor,designerInstructionsV3} from '../packages/agents/prompts/designer-v1';
import {designerContext,copyTable} from '../packages/director/designer-context';
import {lintStaticComposition} from '../packages/director/policy.local';
import {readPriorities} from '../packages/agents/priorities';
import type {DirectionInput} from '../packages/director/types';

const input=(version:number)=>{const i=structuredClone(recorded) as unknown as DirectionInput;i.brief={...i.brief,designerVersion:version};if(i.storyboard.length<3)i.storyboard=[...i.storyboard,...['scene-two','scene-three'].slice(0,3-i.storyboard.length).map(id=>({...i.storyboard[0],id}))];return i;};
const shotFile=join(mkdtempSync(join(tmpdir(),'engine-')),'v.jpg');writeFileSync(shotFile,Buffer.from([0xff,0xd8,0xff,0xd9]));

test('version 3 is the engine; earlier versions keep their instructions and schema',()=>{
 assert.equal(usesEngineKit(input(3)),true);assert.equal(usesEngineKit(input(2)),false);assert.equal(heroFirst(input(3)),true);
 const v3=designerInstructionsFor(input(3));
 assert.ok(v3.startsWith(designerInstructionsV3));assert.match(v3,/HERO FRAME/);assert.match(v3,/MEMORY\. notes/);assert.equal(readPriorities(v3).length,5);
 for(const rule of [/ENGINE KIT/,/fitText/,/EVERY SCENE SHOWS ITS OWN WORDS/,/never toUpperCase/,/render\.more/,/copyByScene/,/previewOptions/,/No format leaves a dead band/])assert.match(v3,rule);
 assert.doesNotMatch(v3,/for example|e\.g\.|such as/i,'no example styles for the agent to copy');assert.doesNotMatch(v3,/#[0-9a-f]{6}\b/i,'no colours');
 assert.doesNotMatch(designerInstructionsFor(input(2)),/ENGINE KIT/);
 assert.equal(designerTurnResponseFor(input(3)).name,'designer_turn_v3');assert.equal(designerTurnResponseFor(input(2)).name,'designer_turn_v2');
 assert.ok(JSON.stringify(designerTurnResponseFor(input(3)).schema).length<2400*4,'the schema stays small');
});

test('the kit is written into a version 3 draft workspace only, and frame code may import it',async()=>{
 const root=mkdtempSync(join(tmpdir(),'engine-ws-'));
 try{
  const v3=await createWorkspace(join(root,'a'),input(3)),v2=await createWorkspace(join(root,'b'),input(2));
  assert.ok(existsSync(join(v3,'kit.ts')));assert.ok(!existsSync(join(v2,'kit.ts')));
  assert.equal(readFileSync(join(v3,'kit.ts'),'utf8'),readFileSync('remotion/director/kit.ts','utf8'));
  assert.deepEqual(lintStaticComposition("import {stage,fitText,selected,useFonts} from './kit';\nexport default function Frame(){useFonts();return null;}"),[]);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('the designer reads every ordered line per scene, hook and language',()=>{
 const i=input(3),table=copyTable(i),first=i.variants[0];
 assert.deepEqual(table[i.storyboard[0].id]?.[first.hook]?.[first.locale],i.variantFacts?.[first.id]?.sceneCopy[i.storyboard[0].id]);
 for(const v of i.variants)for(const [scene,lines] of Object.entries(i.variantFacts?.[v.id]?.sceneCopy??{}))if(lines.length&&i.storyboard.some(s=>s.id===scene))assert.ok(table[scene][v.hook][v.locale]);
 assert.ok('copyByScene' in designerContext(i));assert.ok(!('copyByScene' in designerContext(input(2))));
});

test('a version 3 turn may name more scenes to render; unknown scenes are refused',()=>{
 const i=input(3),[a,b]=i.storyboard.map(s=>s.id),focus={sceneId:a,activity:'designing',about:'x'};
 assert.deepEqual(readDesignerTurn({focus,render:{sceneId:a,formats:[],more:[b]}},i).render?.more,[b]);
 assert.throws(()=>readDesignerTurn({focus,render:{sceneId:a,formats:[],more:['nope']}},i),/DESIGNER_UNKNOWN_SCENE/);
 assert.throws(()=>readDesignerTurn({focus,render:{sceneId:a,formats:[],more:[b]}},input(2)),/more|unrecognized/i,'version 2 keeps its schema');
});

function tools(){const rendered:string[][]=[];return {rendered,tools:{files:async()=>[],write:async()=>{},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),
 render:async(views:Parameters<DesignerTools['render']>[0])=>{rendered.push(views.filter(v=>v.shot).map(v=>`${v.props.sceneId}@${v.props.width}x${v.props.height}`));return {summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]},shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shotFile}))};}} satisfies DesignerTools};}
const seen={first:'a',second:'b',third:'c',weakest:['d']};

test('after the hero, one render shows several scenes; formats whose revisions are used are left out, the rest render',async()=>{
 const i=input(3),ids=i.storyboard.map(s=>s.id),hero=ids[0],ref=i.variants[0].format,other=i.formats.find(f=>f.id!==ref)!.id,focus={sceneId:hero,activity:'designing',about:'x'};
 const {rendered,tools:t}=tools(),state=newDesignerState(),answers:unknown[]=[
  {focus,render:{sceneId:hero,formats:[],more:[ids[1]]}}, // the hero is open: only the hero renders
  {focus,seen,settleHero:true},
  {focus,seen,render:{sceneId:hero,formats:[ref,other],more:[ids[1],ids[2]]}},
 ];let n=0;
 await runDesigner({input:i,state,maxTurns:answers.length,maxPictures:0,timeMs:60000,tools:t,heroReviews:0,save:async()=>{},call:async()=>JSON.stringify(answers[n++])});
 assert.equal(rendered[0].length,1,'only the hero while it is open');
 assert.deepEqual(new Set(rendered[1].map(r=>r.split('@')[0])),new Set(ids.slice(0,3)));assert.equal(rendered[1].length,6,'three scenes in two formats');
 assert.equal(state.renders[renderKey(ids[2],other)],1);assert.match(state.lastRender!.views[0].label,/^scene 1 · /);
 // The reference format of the hero has used its revisions: the other format still renders.
 state.renders[renderKey(hero,ref)]=DESIGNER_REVISIONS_PER_SCENE+1;state.complete=false;const before=rendered.length;
 const more=[{focus,seen,render:{sceneId:hero,formats:[ref,other],more:[]}}];let m=0;
 await runDesigner({input:i,state,maxTurns:state.turn+1,maxPictures:0,timeMs:60000,tools:t,heroReviews:0,save:async()=>{},call:async()=>JSON.stringify(more[m++])});
 assert.equal(rendered.length,before+1);assert.equal(rendered.at(-1)!.length,1,'only the format with revisions left');
 assert.match(state.transcript.at(-1)!.text,/partly refused/);
});
