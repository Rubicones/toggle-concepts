// Designer pipeline plan, point 4d: the designer's steps in the activity timeline and the single owner of notes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recorded from '../fixtures/director/static/input.json';
import {designerTurnSummary,designerActivityLine} from '../packages/director/designer';
import {runDesigner,newDesignerState} from '../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../packages/director/types';

test('a step reads as short lines: saved, built, asked for, rendered, decided',()=>{
 assert.deepEqual(designerTurnSummary([{written:'components/Hero.tsx'},{written:'Frame.tsx'},{build:'passed'},{picture:'requested'},{picture:'requested'},{render:'s1',views:2,hard:1,soft:0}]),['Saved Hero.tsx, Frame.tsx.','Rendered 2 views: 1 objective issue to fix.','Asked for 2 pictures.']);
 assert.deepEqual(designerTurnSummary([{build:'failed',issue:'TS2304'},{picture:'refused'},{render:'refused'},{finish:'refused',issue:'x'}]),['The code does not build yet; the designer repairs it next.','No more revisions for this scene; the designer moves on.','Not finished yet: some options still need work.','The approved number of pictures is used.']);
 assert.deepEqual(designerTurnSummary([{render:'s',views:1,hard:0},{finish:'complete'}]),['Rendered 1 view: no objective issues.','The draft is finished.']);
});

test('each step reports the screenshot the designer looked at when it wrote that step',async()=>{
 const input=structuredClone(recorded) as unknown as DirectionInput,s=input.storyboard[0].id,folder=await mkdtemp(join(tmpdir(),'designer-t-')),shot=join(folder,'v.jpg');await writeFile(shot,Buffer.from([0xff,0xd8,0xff,0xd9]));
 const seen:{line:string;looked?:string}[]=[];let n=0;
 try{
  await runDesigner({input,state:newDesignerState(),maxTurns:2,maxPictures:0,timeMs:60000,save:async()=>{},
   tools:{files:async()=>[],write:async()=>{},build:async()=>({ok:true}),requestImage:async()=>({id:'',status:'refused'}),finish:async()=>({complete:false,issue:'x'}),
    render:async views=>({summary:{version:1,revision:'r',views:views.length,hard:0,soft:0,reports:[]},shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))})},
   call:async()=>JSON.stringify(n++===0?{focus:{sceneId:s,activity:'designing',about:'the opening frame'},render:{sceneId:s,formats:[]}}:{focus:{sceneId:s,activity:'looking',about:'the 9:16 view'},render:{sceneId:s,formats:[]}}),
   onTurn:async(turn,_results,looked)=>{seen.push({line:designerActivityLine(turn,id=>input.storyboard.findIndex(x=>x.id===id)+1),looked});}});
 }finally{await rm(folder,{recursive:true,force:true});}
 assert.deepEqual(seen,[{line:'Designing scene 1: the opening frame',looked:undefined},{line:'Looking at scene 1: the 9:16 view',looked:shot}]);
});

test('notes in a designer draft go to one owner; the recipient choice stays for earlier drafts',()=>{
 const source=readFileSync('components/studio/live-view-review.tsx','utf8');
 assert.match(source,/preview\.designer\?<p className="live-review-recipient">Notes for the designer/);assert.match(source,/The coder · layout and execution/);
 assert.match(readFileSync('components/studio/director-timeline.tsx','utf8'),/designer:'The designer'/);
});
