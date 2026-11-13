// D0 finding: in designer version 4 the end-of-draft review's notes and the measured-findings notes never reached the
// designer (they were written only to loop.transcript). Recorded answers only; no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {criticNote} from '../packages/director/live-review';
import {reviewRepairMessage} from '../packages/director/extension-chat';
import {runExtensionChat} from '../apps/local-runner/director/extension-chat-loop';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../packages/director/types';

const input=()=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:4,materialsVersion:1,digestVersion:1};return i;};
const say=(prose:string,source:string|null,actions?:unknown)=>`${prose}${source?`\n\n\`\`\`tsx Frame.tsx\n${source}\n\`\`\``:''}${actions?`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``:''}`;
const tools=(over:Partial<DesignerTools>={}):DesignerTools=>({files:async()=>[{path:'Frame.tsx',source:'x'}],write:async()=>{},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),
 render:async()=>({summary:{version:1 as const,revision:'r',views:0,hard:0,soft:0,reports:[]} as never,shots:[]}),...over});
/** A recorded art-direction review of a finished draft. */
const critique={accepted:false,summary:'Close.',notes:[{recipient:'director' as const,priority:'P0' as const,view:'Scene 2 · vertical',problem:'The price sits under the product and is hard to read.',fix:'Give the price its own clear area.'},{recipient:'assembler' as const,priority:'P2' as const,view:'Scene 1 · square',problem:'The logo is small.',fix:'Larger logo.'}]};

test('v4 fix: the end review reaches the designer as the next message, with each note\'s priority and view', async()=>{
 const i=input(),state=newDesignerState(),scenes=i.storyboard.map((_,n)=>({scene:`Scene ${n+1}`,moment:'The archive opens.'}));
 state.hero={sceneId:i.storyboard[0].id,format:i.variants[0].format,state:'accepted',reviews:1};state.stageEOpened=true;state.renders={[`${i.storyboard[0].id}@${i.variants[0].format}`]:2};
 // What designerRepair now does for version 4: the round becomes heroNote; the draft is no longer complete; render counts stay.
 state.heroNote=reviewRepairMessage({kind:'critic',round:1,note:criticNote(critique as never,1,'designer')});state.complete=false;
 const sent:string[]=[];
 await runExtensionChat({input:i,state,maxTurns:state.turn+2,maxPictures:0,timeMs:600000,tools:tools(),save:async()=>{},call:async message=>{sent.push(message);return say('Fixed.',null,{finish:{intent:'x'.repeat(90),scenes}});}});
 assert.match(sent[0],/^THE REVIEW OF THE FINISHED DRAFT \(round 1\)\./);
 assert.match(sent[0],/1\. \[P0\] Scene 2 · vertical: The price sits under the product and is hard to read\. Wanted: Give the price its own clear area\./);
 assert.match(sent[0],/2\. \[P2\] Scene 1 · square: The logo is small\./,'the designer owns every note');
 assert.match(sent[0],/send your finish action again\.$/);assert.equal(state.complete,true,'the repair round finishes again');
 const gate=reviewRepairMessage({kind:'gate',round:2,note:'',failing:['Scene 2 · vertical: TEXT_CLIPPED','Scene 3 · wide: LOGO_MISSING']});
 assert.match(gate,/^THE CHECKS FOUND PROBLEMS AFTER THE DRAFT \(round 2\)\. Fix only these combinations[\s\S]*\n- Scene 2 · vertical: TEXT_CLIPPED\n- Scene 3 · wide: LOGO_MISSING\n/);
 const worker=readFileSync('apps/local-runner/director/worker.ts','utf8');
 assert.equal(worker.match(/if\(heroChat\(input\)\)loop\.heroNote=reviewRepairMessage/g)?.length,2,'both repair kinds route into the version 4 conversation');
 assert.match(worker,/if\(usesEngineKit\(input\)&&!heroChat\(input\)\)loop\.renders=\{\};/,'version 4 keeps its phase');
});

test('v4 fix: hero notes carry priority and view; a frame accepted because its turns ran out is not labelled "after its reviews"', async()=>{
 const i=input(),seen:{kind:string;by?:string}[]=[];
 const run=async(reviews:boolean)=>{const state=newDesignerState(),sent:string[]=[];
  await runHeroChat({input:i,state,maxTurns:2,maxPictures:0,timeMs:600000,heroReviews:2,save:async()=>{},onHero:async e=>{seen.push({kind:e.kind,by:e.by});},
   tools:tools({render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:'/dev/null'}))}),reviewHero:async()=>({accepted:false,notes:critique.notes})}),
   call:async message=>{sent.push(message);return say('Idea.','export default 1;',reviews?{review:true}:undefined);}});
  return sent;};
 seen.length=0;await run(false);assert.deepEqual(seen.filter(e=>e.kind==='accepted').map(e=>e.by),['turns-used'],'no review ran');
 seen.length=0;const sent=await run(true);assert.deepEqual(seen.filter(e=>e.kind==='accepted').map(e=>e.by),['reviews-used']);
 assert.match(sent[1],/- \[P0\] Scene 2 · vertical: The price sits under the product/);
 assert.match(readFileSync('apps/local-runner/director/worker.ts','utf8'),/event\.by==='turns-used'\?' when its turns were used, without a review'/);
});
