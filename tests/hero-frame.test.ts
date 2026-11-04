// Design quality plan, point 3: the hero frame first, with the critic in the loop.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recorded from '../fixtures/director/static/input.json';
import {runDesigner,newDesignerState,type DesignerTools,type HeroEvent} from '../apps/local-runner/director/designer-loop';
import {heroScene,designerTurnResponseFor,usesDesigner} from '../packages/director/designer';
import {designerInstructions,designerInstructionsFor} from '../packages/agents/prompts/designer-v1';
import {criticNote,runLiveReview,newReviewState,type LiveCritique} from '../packages/director/live-review';
import {estimateDesignerDirection} from '../packages/director/money';
import {designedFormats} from '../packages/director/live-preview';
import type {DirectionInput} from '../packages/director/types';

const input=(version:number)=>{const i=structuredClone(recorded) as unknown as DirectionInput;i.brief={...i.brief,designerVersion:version};if(i.storyboard.length<2)i.storyboard=[...i.storyboard,{...i.storyboard[0],id:'scene-two'}];i.storyboard=i.storyboard.map((s,n)=>n===1?{...s,proof:'The timeline shows the takes.'}:s);return i;};
const shotFile=join(mkdtempSync(join(tmpdir(),'hero-')),'v.jpg');writeFileSync(shotFile,Buffer.from([0xff,0xd8,0xff,0xd9]));
const note=(recipient:'director'|'assembler',problem:string)=>({recipient,priority:'P1',view:'1:1',problem,fix:'Make it clear.'});
function tools(review?:DesignerTools['reviewHero']){const renders:string[]=[];return {renders,tools:{files:async()=>[],write:async()=>{},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),
 render:async(views:Parameters<DesignerTools['render']>[0])=>{renders.push(`${views[0].props.sceneId}@${views[0].label.split(' ')[0]}`);return {summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]},shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shotFile}))};},
 ...(review?{reviewHero:review}:{})} satisfies DesignerTools};}
// Version 2 turns after a render must say what they saw (point 4); these tests are about the hero, so every turn does.
const withSeen=(a:unknown)=>({...(a as object),seen:{first:'a',second:'b',third:'c',weakest:['d']}});
async function run(i:DirectionInput,answers:unknown[],t:DesignerTools,heroReviews=2,state=newDesignerState()){
 const events:HeroEvent[]=[];let n=0;
 await runDesigner({input:i,state,maxTurns:state.turn+answers.length,maxPictures:0,timeMs:60000,tools:t,heroReviews,save:async()=>{},onHero:async e=>{events.push(e);},call:async()=>JSON.stringify(Number(i.brief.designerVersion)>=2?withSeen(answers[n++]):answers[n++])});
 return {state,events};
}

test('the hero is the scene that proves the promise, in the reference format; other scenes and finishing wait for it',async()=>{
 const i=input(2),hero=heroScene(i),other=i.storyboard.find(s=>s.id!==hero)!.id,ref=i.variants[0].format;assert.equal(hero,i.storyboard[1].id,'the first scene with a proof');
 const focus={sceneId:hero,activity:'designing',about:'hero'};
 const {renders,tools:t}=tools(async()=>({accepted:false,notes:[note('director','The product is not visible.'),note('assembler','The headline is too small.')]}));
 const {state,events}=await run(i,[
  {focus,render:{sceneId:other,formats:[]}},
  {focus,settleHero:true},
  {focus,render:{sceneId:hero,formats:[]},settleHero:true},
  {focus,finish:{intent:'I'.repeat(100),scenes:i.storyboard.map(s=>({sceneId:s.id,moment:'m'}))}},
  {focus,render:{sceneId:hero,formats:[]},settleHero:true},
  {focus,settleHero:true},
  {focus,render:{sceneId:other,formats:[]}},
 ],t);
 const log=state.transcript.filter(x=>x.from==='tool').map(x=>x.text).join('\n');
 assert.match(log,/Finish the hero frame first: scene 2 in/);assert.match(log,/Render the hero frame before asking for its review/);
 assert.match(log,/The product is not visible/,'notes to the director reach the designer too');assert.match(log,/The headline is too small/);
 assert.deepEqual(renders,[`${hero}@${ref}`,`${hero}@${ref}`,`${other}@${ref}`],'the other scene renders only after the hero is accepted');
 assert.equal(state.hero!.state,'accepted');assert.equal(state.hero!.acceptedBy,'reviews-used');assert.equal(state.hero!.reviews,2);
 assert.deepEqual(events.map(e=>e.kind),['started','reviewed','reviewed','accepted']);
});

test('an accepting review settles the hero at once; without a critic the hero is accepted on settle; a restart keeps it',async()=>{
 const i=input(2),hero=heroScene(i),focus={sceneId:hero,activity:'designing',about:'hero'};
 const accepted=await run(i,[{focus,render:{sceneId:hero,formats:[]},settleHero:true}],tools(async()=>({accepted:true,notes:[]})).tools);
 assert.equal(accepted.state.hero!.acceptedBy,'critic');assert.equal(accepted.state.hero!.reviews,1);
 const none=await run(i,[{focus,render:{sceneId:hero,formats:[]},settleHero:true}],tools().tools,0);assert.equal(none.state.hero!.acceptedBy,'no-critic');
 const other=i.storyboard.find(s=>s.id!==hero)!.id,again=tools();const resumed=await run(i,[{focus,render:{sceneId:other,formats:[]}}],again.tools,2,accepted.state);
 assert.deepEqual(resumed.events,[],'no new hero start after a restart');assert.equal(again.renders.length,1,'the accepted hero survives the restart');
});

test('version 1 designer blocks run exactly as before',async()=>{
 const i=input(1),other=i.storyboard[0].id;const {renders,tools:t}=tools(async()=>{throw new Error('no review in version 1');});
 const {state,events}=await run(i,[{focus:{sceneId:other,activity:'designing',about:'x'},render:{sceneId:other,formats:[]}}],t);
 assert.equal(state.hero,undefined);assert.equal(events.length,0);assert.equal(renders.length,1);
 assert.equal(designerInstructionsFor(i),designerInstructions);assert.match(designerInstructionsFor(input(2)),/HERO FRAME/);
 assert.equal(designerTurnResponseFor(i).name,'designer_turn_v1');assert.equal(designerTurnResponseFor(input(2)).name,'designer_turn_v2');assert.match(JSON.stringify(designerTurnResponseFor(input(2)).schema),/settleHero/);
 assert.equal(usesDesigner(input(2)),true);
});

test('critic notes for both recipients reach the designer; the coder pipeline keeps director notes aside',async()=>{
 const critique:LiveCritique={accepted:false,summary:'s',notes:[note('director','Idea is weak.'),note('assembler','Type collides.')]} as LiveCritique;
 assert.match(criticNote(critique,1,'designer'),/Idea is weak[\s\S]*Type collides/);assert.doesNotMatch(criticNote(critique,1),/Idea is weak/);
 for(const owner of ['designer','coder'] as const){
  const repaired:string[]=[];const summary={version:1 as const,revision:'r',views:1,hard:0,soft:0,reports:[]};
  const record=await runLiveReview({owner,inspect:async()=>({summary,shots:[]}),repair:async n=>{repaired.push(n);return {applied:false,reason:'stop'};},criticRounds:1,state:newReviewState(),critic:async()=>JSON.stringify({...critique,notes:owner==='coder'?[note('director','Idea is weak.')]:critique.notes}),context:()=>({}),save:async()=>{},emit:async()=>{}} as Parameters<typeof runLiveReview>[0]);
  if(owner==='designer'){assert.equal(repaired.length,1);assert.match(repaired[0],/Idea is weak/);assert.equal(record!.directorNotes.length,0);}
  else{assert.equal(repaired.length,0,'a director-only note is not sent to the coder');assert.equal(record!.directorNotes.length,1);}
 }
});

test('the quote adds the hero reviews to the critic requests; formats wait for the hero in the viewer',()=>{
 const price={inputPrice:3e-6,outputPrice:15e-6},base=estimateDesignerDirection({designer:price,critic:price},1,1,{d:1},{criticRequests:2}),hero=estimateDesignerDirection({designer:price,critic:price},1,1,{d:1},{criticRequests:2,heroReviews:2});
 assert.equal(base.roles.critic.requests,2);assert.equal(base.heroReviews,undefined);assert.equal(hero.roles.critic.requests,4);assert.equal(hero.heroReviews,2);assert.ok(hero.maxCostMicroUsd>base.maxCostMicroUsd);
 assert.equal(estimateDesignerDirection({designer:price,critic:price},1,1,{d:1},{criticRequests:0,heroReviews:2}).roles.critic.requests,0,'no creative review, no hero reviews');
 const states=designedFormats([{id:'square',width:1080,height:1080},{id:'story',width:1080,height:1920}],['s1'],{'s1@square':1},[],{format:'square',accepted:false});
 assert.deepEqual(states.map(f=>f.state),['designed','waiting']);
});
