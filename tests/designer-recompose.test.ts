// Designer pipeline plan, point 5: reference format first, real recompositions, a checks loop on failing combinations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import recorded from '../fixtures/director/static/input.json';
import {designerInstructions} from '../packages/agents/prompts/designer-v1';
import {designerContext} from '../packages/director/designer-context';
import {runDesigner,newDesignerState,DESIGNER_REVISIONS_PER_SCENE,renderKey} from '../apps/local-runner/director/designer-loop';
import {failingCombinations,type InspectionSummary} from '../packages/director/layout-inspection';
import {designedFormats,nearestFormat} from '../packages/director/live-preview';
import type {DirectionInput} from '../packages/director/types';

const input=()=>{const i=structuredClone(recorded) as unknown as DirectionInput;i.brief={...i.brief,designerVersion:1};return i;};

test('the protocol designs the reference format first, then recomposes each format as its own branch',()=>{
 assert.match(designerInstructions,/first in the reference format/);assert.match(designerInstructions,/explicit branch/);assert.match(designerInstructions,/never a squeezed or cropped copy/);
 assert.match(designerInstructions,/Hooks, locales, CTAs and lengths are data/);assert.match(designerInstructions,/fix that branch only/);
 assert.equal(designerContext(input()).referenceFormat,input().variants[0].format);
});

test('recomposing another format is a first design, not a revision of the reference',async()=>{
 const i=input();if(i.formats.length<2){i.formats=[...i.formats,{...i.formats[0],id:'vertical-x',width:1080,height:1920}];}
 const s=i.storyboard[0].id,other=i.formats.find(f=>f.id!==i.variants[0].format)!.id,state=newDesignerState();
 const turns=[...Array(DESIGNER_REVISIONS_PER_SCENE+1).fill({sceneId:s,formats:[]}),{sceneId:s,formats:[other]},{sceneId:s,formats:[]}];let n=0;
 await runDesigner({input:i,state,maxTurns:turns.length,maxPictures:0,timeMs:60000,save:async()=>{},
  tools:{files:async()=>[],write:async()=>{},build:async()=>({ok:true}),requestImage:async()=>({id:'',status:'refused'}),finish:async()=>({complete:true}),render:async views=>({summary:{version:1,revision:'r',views:views.length,hard:0,soft:0,reports:[]},shots:[]})},
  call:async()=>JSON.stringify({focus:{sceneId:s,activity:n<4?'designing':'recomposing',about:'x'},render:turns[n++]})});
 assert.equal(state.renders[renderKey(s,i.variants[0].format)],DESIGNER_REVISIONS_PER_SCENE+1);assert.equal(state.renders[renderKey(s,other)],1,'the new format was rendered');
 assert.match(state.transcript.at(-1)!.text,/Three revisions of this scene in/,'the reference is still capped');
});

test('the checks loop returns only failing combinations, each with its finding',()=>{
 const summary={version:1,revision:'r',views:3,hard:2,soft:1,reports:[
  {view:'a',label:'9:16 1080×1920 · s1 · kk-KZ/hook-2/primary/15s',texts:1,images:0,findings:[{code:'TEXT_OVERFLOW',severity:'hard',view:'a',detail:'The hook overflows the safe area.'}]},
  {view:'b',label:'1:1 1080×1080 · s1 · en-GB/primary/primary/15s',texts:1,images:0,findings:[{code:'LOW_CONTRAST',severity:'soft',view:'b',detail:'Low contrast.'}]},
  {view:'c',label:'16:9 1920×1080 · s2 · en-GB/primary/primary/15s',texts:1,images:0,findings:[{code:'TEXT_CLIPPED',severity:'hard',view:'c',detail:'The CTA is clipped.'}]}]} as unknown as InspectionSummary;
 assert.deepEqual(failingCombinations(summary).map(f=>f.view),['a','c']);assert.match(failingCombinations(summary)[0].label,/kk-KZ/);
 const worker=readFileSync('apps/local-runner/director/worker.ts','utf8');
 assert.match(worker,/Fix only these combinations, in their own format branch/);assert.match(worker,/owner:'designer' as const/);
});

test('format chips: designed, being designed, not designed yet, open issues; the slider snaps to the nearest format',()=>{
 const formats=[{id:'square',width:1080,height:1080},{id:'story',width:1080,height:1920},{id:'wide',width:1920,height:1080}];
 const states=designedFormats(formats,['s1','s2'],{'s1@square':2,'s2@square':1,'s1@story':1},[{views:['9:16 1080×1920 · s1 · en']}]);
 assert.deepEqual(states.map(f=>[f.id,f.label,f.state,f.findings]),[['square','1:1','designed',0],['story','9:16','designing',1],['wide','16:9','not-started',0]]);
 assert.equal(nearestFormat(states,1080,1350).id,'square','4:5 is closest to the square');assert.equal(nearestFormat(states,1080,1700).id,'story');
 const viewer=readFileSync('components/studio/live-draft-generator.tsx','utf8');assert.match(viewer,/Nearest designed format: \{nearest\}/);assert.match(viewer,/aria-label=\{`\$\{f\.label\}, \$\{status\(f\)\}`\}/);
});
