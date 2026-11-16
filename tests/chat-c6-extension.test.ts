// Chat-shaped plan C6: the extension in the same conversation (designerVersion 4, stage E). Recorded answers only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {relativeCap,designerPlan,CONVERSATION_CAP,WORKING_ROOM} from '../packages/agents/local-session';
import {extensionNote,extensionPhase,stageEMechanics,sceneIdOf,variationVariants} from '../packages/director/extension-chat';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {runExtensionChat,extensionViews} from '../apps/local-runner/director/extension-chat-loop';
import {newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../packages/director/types';

const input=()=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:4,materialsVersion:1,digestVersion:1};return i;};
const say=(prose:string,source:string|null,actions?:unknown)=>`${prose}${source?`\n\n\`\`\`tsx Frame.tsx\n${source}\n\`\`\``:''}${actions?`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``:''}`;

test('C6: the cap is relative to the seed and never below it (B2)', ()=>{
 assert.equal(relativeCap(130000),130000+WORKING_ROOM);assert.equal(relativeCap(undefined),CONVERSATION_CAP,'versions 1–3: the fixed cap');
 for(const seed of [0,50000,130000,400000])assert.ok(relativeCap(seed)>=seed);
 const session={role:'designer',sessionId:'s',tokens:150000,seed:130000};
 assert.equal(designerPlan({session},null,relativeCap(session.seed))?.condensed,undefined,'a 130k seed grows to 150k without being condensed again');
 assert.equal(designerPlan({session:{...session,tokens:240000}},null,relativeCap(session.seed))?.condensed,true);
 assert.equal(designerPlan({session},null)?.condensed,true,'the old fixed cap would have condensed it at once');
});

test('C6: mechanics once, phases in order, findings grouped by rule, names mapped to ids', ()=>{
 const i=input(),m=stageEMechanics(i);
 assert.match(m,new RegExp(`Scene 1 = ${i.storyboard[0].id}`));for(const part of ['ENGINE KIT','WORDS ARE DATA','previewOptions','FORMATS.','THE ORDER.','COPY TABLE'])assert.ok(m.includes(part),part);
 assert.ok(!m.includes('copyByScene')&&!m.includes('response schema'),'chat format: no JSON-schema mechanics');
 const ref=i.variants[0].format,all=(f:string[])=>Object.fromEntries(i.storyboard.flatMap(s=>f.map(x=>[`${s.id}@${x}`,1])));
 assert.equal(extensionPhase(i,{[`${i.storyboard[0].id}@${ref}`]:2}),'scenes');assert.equal(extensionPhase(i,all([ref])),'formats');assert.equal(extensionPhase(i,all(i.formats.map(f=>f.id))),'variations');
 assert.equal(sceneIdOf('Scene 2',i),i.storyboard[1].id);assert.equal(sceneIdOf('3',i),i.storyboard[2].id);assert.equal(sceneIdOf('Scene 9',i),undefined);
 const note=extensionNote(['square en-GB','vertical en-GB','square de-DE'].map(view=>({code:'TEXT_CLIPPED',severity:'hard' as const,view,detail:'The headline is clipped.'})),2);
 assert.match(note,/Must fix — change the rule that causes each one, not each case:\n- The headline is clipped\. \(in 3 views: square en-GB; vertical en-GB; square de-DE\)/);
 const v=variationVariants(i);assert.equal(v[0].id,i.variants[0].id);assert.ok(v.length>1&&v.length<=6);assert.ok(new Set(v.map(x=>x.hook)).size>1,'one per hook');
 assert.equal(extensionViews(i,[i.storyboard[1].id],[ref],'scenes').filter(x=>x.shot).length,1,'reference copy shots; the longest copy is measured');
});

test('C6: the hero conversation continues into stage E; a condensed conversation is seeded with the full current files and continues', async()=>{
 const i=input(),dir=await mkdtemp(join(tmpdir(),'c6-')),shot=join(dir,'s.jpg');{const c=createCanvas(108,192);c.getContext('2d').fillRect(0,0,108,192);await writeFile(shot,c.toBuffer('image/jpeg',80));}
 const frame={source:''},rendered:string[][]=[];
 const tools:DesignerTools={files:async()=>frame.source?[{path:'Frame.tsx',source:frame.source}]:[],write:async(_p,s)=>{frame.source=s;},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),
  render:async views=>{rendered.push([...new Set(views.map(v=>String(v.props.sceneId)))]);return {summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))};},
  reviewHero:async()=>({accepted:true,notes:[]})};
 const sent:{message:string;images:number}[]=[],conversation={continued:true,decide:async()=>conversation.continued,accept:async()=>{}};
 const state=newDesignerState(),hero=[say('The idea: an archive.','export default 1;',{review:false}),say('Ready.','export default 2;',{review:true})];
 await runHeroChat({input:i,state,maxTurns:4,maxPictures:0,timeMs:600000,tools,heroReviews:1,save:async()=>{},conversation,call:async(message,images)=>{sent.push({message,images:images.length});return hero[sent.length-1];}});
 assert.equal(state.hero?.state,'accepted');
 const scenes=i.storyboard.map((_,n)=>`Scene ${n+1}`),answers=[
  say('Carrying the archive into the next scenes.','export default 3;',{render:{scenes:scenes.slice(1,4)},notes:'Type: one large serif-free headline; the archive object recurs.'}),
  say('The last scene.','export default 4;',{render:{scenes:[scenes[4]]}}),
  say('Square composition.','export default 5;',{render:{scenes:scenes.slice(0,4),formats:[i.formats[1].id]}}),
 ];
 const phases:string[]=[],stageE=sent.length;
 const run=(n:number)=>runExtensionChat({input:i,state,maxTurns:state.turn+n,maxPictures:0,timeMs:600000,tools,save:async()=>{},conversation,onPhase:async(_p,label)=>{phases.push(label);},call:async(message,images)=>{sent.push({message,images:images.length});return answers[sent.length-stageE-1];}});
 await run(2);
 assert.match(sent[stageE].message,/^THE HERO FRAME IS ACCEPTED\. NOW EXTENDING THE HERO TO THE OTHER SCENES\./,'the same conversation continues into stage E');assert.match(sent[stageE].message,/COPY TABLE/);
 assert.ok(!sent[stageE+1].message.includes('HOW THE DRAFT WORKS'),'the mechanics arrive once');
 assert.deepEqual(rendered.at(-2),i.storyboard.slice(1,4).map(s=>s.id),'up to three more scenes at once, by name');
 assert.deepEqual(phases,['Now extending the hero to the other scenes','Formats']);assert.match(state.heroNote!,/Now each ordered format as its own composition/);
 // The conversation was condensed: the new one is seeded with everything, including the unchanged Frame.tsx.
 conversation.continued=false;await run(1);
 const seed=sent.at(-1)!;assert.match(seed.message,/^THIS CONVERSATION CONTINUES A DRAFT IN PROGRESS/);assert.match(seed.message,/```tsx Frame\.tsx\nexport default 4;/);
 assert.match(seed.message,/YOUR NOTES\nType: one large/);assert.match(seed.message,/DONE SO FAR\nScene 1 in /);assert.match(seed.message,/HOW THE DRAFT WORKS FROM NOW ON/);
 assert.equal(seed.images,2,'the accepted hero render first, then the last render');
 assert.equal(state.renders[`${i.storyboard[0].id}@${i.formats[1].id}`],1,'and it continues the work');
});

test('C6: finishing names every scene; the draft completes', async()=>{
 const i=input(),state=newDesignerState();state.hero={sceneId:i.storyboard[0].id,format:i.variants[0].format,state:'accepted',reviews:1};state.stageEOpened=true;
 const tools:DesignerTools={files:async()=>[{path:'Frame.tsx',source:'x'}],write:async()=>{},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),render:async()=>({summary:{version:1 as const,revision:'r',views:0,hard:0,soft:0,reports:[]} as never,shots:[]})};
 const scenes=i.storyboard.map((_,n)=>({scene:`Scene ${n+1}`,moment:'The archive opens.'})),answers=[say('Done.',null,{finish:{intent:'x'.repeat(90),scenes:scenes.slice(1)}}),say('Done now.',null,{finish:{intent:'x'.repeat(90),scenes}})];let n=0;
 await runExtensionChat({input:i,state,maxTurns:3,maxPictures:0,timeMs:600000,tools,save:async()=>{},call:async()=>answers[n++]});
 assert.equal(state.complete,true);assert.equal(n,2,'a finish missing a scene is refused once');assert.deepEqual(state.finish?.scenes.map(s=>s.sceneId),i.storyboard.map(s=>s.id));
});
