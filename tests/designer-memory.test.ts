// Design quality plan, point 4: designer notes as working memory, and look, name, then fix.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recorded from '../fixtures/director/static/input.json';
import {runDesigner,newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import {seenLines,designerTurnSummary,designerTurnResponseFor,heroScene} from '../packages/director/designer';
import {designerInstructionsFor} from '../packages/agents/prompts/designer-v1';
import {providerJsonSchema} from '../packages/director/provider-schema';
import type {DirectionInput} from '../packages/director/types';

const shot=join(mkdtempSync(join(tmpdir(),'memory-')),'v.jpg');writeFileSync(shot,Buffer.from([0xff,0xd8,0xff,0xd9]));
const input=(version:number)=>{const i=structuredClone(recorded) as unknown as DirectionInput;i.brief={...i.brief,designerVersion:version};return i;};
const seen={first:'The headline',second:'The product timeline',third:'The CTA',weakest:['The timeline is too small to read.','The CTA sits on a busy area.']};
function harness(){const writes:string[]=[];const tools:DesignerTools={files:async()=>[],write:async p=>{writes.push(p);},build:async()=>({ok:true}),requestImage:async()=>({id:'',status:'refused'}),finish:async()=>({complete:false,issue:'not yet'}),
 render:async views=>({summary:{version:1,revision:'r',views:views.length,hard:1,soft:0,reports:[]},shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))})};return {writes,tools};}

test('notes survive beyond the 12-result window and a restart; they are sent at the top of every request',async()=>{
 const i=input(2),s=heroScene(i),requests:{notes?:string;toolResults:unknown[]}[]=[];const {tools}=harness();
 const notes='Type: one family, two weights. Rejected: a full-bleed photo. Remains: the CTA.',turns:Record<string,unknown>[]=[{focus:{sceneId:s,activity:'designing',about:'plan'},notes},...Array.from({length:14},()=>({focus:{sceneId:s,activity:'designing',about:'code'},files:[{path:'Frame.tsx',source:'export default ()=>null;'}]}))];
 const state=newDesignerState();let n=0;
 await runDesigner({input:i,state,maxTurns:turns.length,maxPictures:0,timeMs:60000,tools,save:async()=>{},call:async request=>{requests.push(request);return JSON.stringify(turns[n++]);}});
 assert.equal(requests.at(-1)!.notes,notes);assert.ok(!JSON.stringify(requests.at(-1)!.toolResults).includes('Rejected: a full-bleed'),'outside the 12-result window');
 const after:{notes?:string}[]=[];
 await runDesigner({input:i,state,maxTurns:state.turn+1,maxPictures:0,timeMs:60000,tools,save:async()=>{},call:async request=>{after.push(request);return JSON.stringify({focus:{sceneId:s,activity:'designing',about:'x'},notes:'Updated.'});}});
 assert.equal(after[0].notes,notes,'a restart keeps the notes');assert.equal(state.notes,'Updated.','the designer rewrites them whole');
});

test('after a render the designer must say what it saw before anything is applied',async()=>{
 const i=input(2),s=heroScene(i),{writes,tools}=harness(),steps:{results:unknown[];looked?:string}[]=[];
 const turns=[{focus:{sceneId:s,activity:'designing',about:'hero'},render:{sceneId:s,formats:[]}},{focus:{sceneId:s,activity:'revising',about:'bigger timeline'},files:[{path:'Frame.tsx',source:'a'}]},{focus:{sceneId:s,activity:'revising',about:'bigger timeline'},seen,files:[{path:'Frame.tsx',source:'b'}]}];
 const requests:{lookFirst?:boolean}[]=[],images:number[]=[];let n=0;
 await runDesigner({input:i,state:newDesignerState(),maxTurns:3,maxPictures:0,timeMs:60000,tools,save:async()=>{},onTurn:async(_t,results,looked)=>{steps.push({results,looked});},call:async(request,img)=>{requests.push(request);images.push(img.length);return JSON.stringify(turns[n++]);}});
 assert.deepEqual(writes,['Frame.tsx'],'only the turn with seen was applied');
 assert.deepEqual(steps[1].results,[{refused:'seen'}]);assert.equal(steps[1].looked,shot);
 assert.equal(requests[1].lookFirst,true);assert.equal(images[2],1,'the render stays attached for the retry');
 assert.deepEqual(designerTurnSummary([{refused:'seen'}]),['Not applied: the designer must first say what it saw in the render.']);
 assert.deepEqual(seenLines(seen),['Read first: The headline','Read second: The product timeline','Read third: The CTA','Weakest point: The timeline is too small to read.','Also weak: The CTA sits on a busy area.']);
});

test('version 1 designers have no notes and no seen requirement; the v2 schema stays portable',async()=>{
 const i=input(1),s=i.storyboard[0].id,{writes,tools}=harness(),requests:Record<string,unknown>[]=[];let n=0;
 const turns=[{focus:{sceneId:s,activity:'designing',about:'x'},render:{sceneId:s,formats:[]}},{focus:{sceneId:s,activity:'revising',about:'x'},files:[{path:'Frame.tsx',source:'a'}]}];
 await runDesigner({input:i,state:newDesignerState(),maxTurns:2,maxPictures:0,timeMs:60000,tools,save:async()=>{},call:async request=>{requests.push(request as Record<string,unknown>);return JSON.stringify(turns[n++]);}});
 assert.deepEqual(writes,['Frame.tsx']);assert.equal('notes' in requests[1],false);
 const v2=JSON.stringify(providerJsonSchema(designerTurnResponseFor(input(2)).schema));assert.match(v2,/"notes"/);assert.match(v2,/"seen"/);assert.ok(v2.length<5000,`designer v2 schema ${v2.length}`);
 assert.match(designerInstructionsFor(input(2)),/MEMORY\. notes is your own record/);assert.match(designerInstructionsFor(input(2)),/LOOK, NAME, FIX/);assert.doesNotMatch(designerInstructionsFor(input(1)),/MEMORY/);
});

test('the AD sees what the designer saw in the timeline and its notes in the working log',()=>{
 assert.match(readFileSync('components/studio/director-timeline.tsx','utf8'),/aria-label="What the designer saw"/);
 assert.match(readFileSync('components/studio/director-workspace.tsx','utf8'),/Designer&apos;s notes/);
 assert.match(readFileSync('lib/server/director.ts','utf8'),/designerNotes:state\.designer\.notes/);
});
