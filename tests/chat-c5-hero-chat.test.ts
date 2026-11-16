// Chat-shaped plan C5: the hero frame as a chat (designerVersion 4, stage H). Recorded answers only; no model call.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {parseHeroAnswer,actionsCorrection,stageHFindings,renderNote,heroTask,heroChat,heroReviewContext,STAGE_H_INSTRUCTIONS,HERO_CRITIC_INSTRUCTIONS} from '../packages/director/hero-chat';
import {stageEMechanics} from '../packages/director/extension-chat';
import {designerDigestText,assetNames} from '../packages/director/designer-digest';
import {designerInstructionsFor} from '../packages/agents/prompts/designer-v1';
import {designerTurnResponseFor} from '../packages/director/designer';
import {stageOf,stageEffort} from '../packages/agents/stage-effort';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import type {DesignerPicture} from '../packages/director/designer';
import type {DirectionInput} from '../packages/director/types';

const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const input=(version=4)=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:version,...(version>=4?{materialsVersion:1,digestVersion:1}:{})};return i;};
const answer=(prose:string,files:string,actions?:string)=>`${prose}\n\n${files}${actions!==undefined?`\n\n\`\`\`actions\n${actions}\n\`\`\``:''}`;

test('C5: a chat answer is read as prose, whole files with paths and one actions block', ()=>{
 const a=parseHeroAnswer(answer('The idea: the session as an archive.\n\nWhy: the brand is exact.','```tsx Frame.tsx\nexport default function Frame(){return null;}\n```\n\nstyles.css:\n```css\n.a{color:red}\n```\n\n```tsx\nexport const x=1;\n```','{"render":true,"pictures":[{"purpose":"the desk","prompt":"A desk at dawn, close crop","aspect":"4:5","references":["app-icon.png"]}]}'));
 assert.match(a.prose,/^The idea: the session as an archive\.\n\nWhy: the brand is exact\./);assert.ok(!a.prose.includes('styles.css:'),'a path line is not prose');assert.match(a.prose,/export const x=1;/,'an unnamed fragment once Frame.tsx exists stays in the prose');
 assert.deepEqual(a.files.map(f=>f.path),['Frame.tsx','styles.css']);assert.equal(a.files[0].source,'export default function Frame(){return null;}\n');
 assert.equal(a.actions?.render,true);assert.equal(a.actions?.pictures?.[0].aspect,'4:5');assert.equal(a.actionsError,undefined);
 const bad=parseHeroAnswer(answer('Trying again.','```tsx Frame.tsx\nexport default 1;\n```','{"render":tru'));
 assert.equal(bad.files.length,1,'the files of a malformed answer are kept');assert.equal(bad.actions,null);assert.equal(bad.actionsError,'it is not valid JSON');
 assert.match(actionsCorrection(bad.actionsError!),/^Your actions block could not be read \(it is not valid JSON\); your files were applied\./);
 assert.match(parseHeroAnswer('```actions\n{"render":true,"dance":1}\n```').actionsError!,/Unrecognized key/);
 assert.deepEqual(parseHeroAnswer('```tsx ../../etc/x.tsx\nx\n```').files.map(f=>f.path),['Frame.tsx'],'no path outside the draft');
});

test('C5: stage H findings: only missing words, a render error, the logo and a non-brand font must be fixed', ()=>{
 const f=(code:string)=>({code,severity:'hard',view:'v',detail:code}) as never;
 const out=stageHFindings([f('COPY_MISSING'),f('TEXT_OVERLAP'),f('FONT_NOT_BRAND'),f('TEXT_TOO_SMALL'),f('LOGO_MISSING'),f('LOW_CONTRAST'),f('RENDER_ERROR'),f('TEXT_OUTSIDE_SAFE_AREA'),f('LOGO_LOW_CONTRAST')]) as {code:string;severity:string}[];
 assert.deepEqual(out.filter(x=>x.severity==='hard').map(x=>x.code),['COPY_MISSING','FONT_NOT_BRAND','LOGO_MISSING','RENDER_ERROR','LOGO_LOW_CONTRAST']);
 const note=renderNote(out as never,1);assert.match(note,/Must fix:\n- COPY_MISSING/);assert.match(note,/for you to weigh against your idea \(a deliberate choice stays/);
});

test('C5: designerVersion 4 only; stage H text is short, aesthetic-first and free of mechanics; scenes by name', ()=>{
 assert.equal(heroChat(input(3)),false);assert.equal(heroChat(input(4)),true);
 assert.equal(designerTurnResponseFor(input(3)).name,'designer_turn_v3','version 3 keeps its schema');assert.doesNotMatch(designerInstructionsFor(input(3)),/MATERIALS\. /);
 assert.ok(STAGE_H_INSTRUCTIONS.length/4<=1200,`${Math.round(STAGE_H_INSTRUCTIONS.length/4)} tokens`);
 for(const mechanic of ['previewOptions','copyByScene','selected(props','variants','hooks','locales','sceneId','schema'])assert.ok(!STAGE_H_INSTRUCTIONS.includes(mechanic),mechanic);
 assert.match(STAGE_H_INSTRUCTIONS,/stops the scroll/);assert.match(STAGE_H_INSTRUCTIONS,/Invent your own visual language/);assert.match(STAGE_H_INSTRUCTIONS,/rendered 3D object/);
 const i=input(),task=heroTask(i),digest=designerDigestText(i,{sceneIds:false});
 assert.ok(!UUID.test(task)&&!UUID.test(digest),'stage H names scenes only');assert.match(task,/^THE HERO FRAME\nMake Scene 1 of 5 as one finished frame in 1080×1920/);assert.match(task,/"LOST TRACK OF YOUR BEST TAKE\?"/);
 assert.match(stageEMechanics(i),new RegExp(`Scene 1 = ${i.storyboard[0].id}`),'stage E gives the ids its code uses');
 assert.equal(stageOf('designer',{hero:true}),'design-hero');assert.equal(stageEffort('design-hero'),'high');
 const ctx=heroReviewContext(digest,[{severity:'hard',detail:'The logo is missing.'},{severity:'soft',detail:'Text overlaps.'}]);
 assert.match(ctx,/must fix: The logo is missing\./);assert.match(ctx,/1 other observation/);assert.ok(!/I tried|seen/.test(ctx),'no designer history');
 assert.match(HERO_CRITIC_INSTRUCTIONS,/stop the scroll[\s\S]*one clear idea[\s\S]*crafted[\s\S]*must be fixed/);
});

test('C5: the hero conversation: render after every change, plain notes, a correction for a malformed block, the review, acceptance', async()=>{
 const i=input(),dir=await mkdtemp(join(tmpdir(),'c5-')),shot=join(dir,'shot.jpg');{const c=createCanvas(108,192);c.getContext('2d').fillRect(0,0,108,192);await writeFile(shot,c.toBuffer('image/jpeg',80));}
 const frame={source:''},pictures:DesignerPicture[]=[],reviews:number[]=[];
 const tools:DesignerTools={files:async()=>frame.source?[{path:'Frame.tsx',source:frame.source}]:[],write:async(_p,s)=>{frame.source=s;},build:async()=>({ok:true as const}),
  render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:1,soft:1,reports:[{view:views[0].key,findings:[{code:'TEXT_OVERLAP',severity:'hard',view:'v',detail:'The headline overlaps the picture.'},{code:'COPY_MISSING',severity:'hard',view:'v',detail:'The approved line "SIGN UP" is not on the frame.'}]}]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))}),
  requestImage:async p=>{pictures.push(p);return {id:i.resourceIds[0],status:'ready' as const};},finish:async()=>({complete:true as const}),
  reviewHero:async round=>{reviews.push(round);return round===1?{accepted:false,notes:[{recipient:'director',priority:'P1',view:'v',problem:'The archive idea is told, not shown.',fix:'One object that is the archive.'}]}:{accepted:true,notes:[]};}};
 const name=assetNames(i)[1].name,answers=[
  answer('The idea: the session as an archive you can walk through.','```tsx Frame.tsx\nexport default function Frame(){return 1;}\n```',JSON.stringify({pictures:[{purpose:'the archive',prompt:'Tape reels on shelves, low light',aspect:'9:16',references:[name]}]})),
  answer('I kept the overlap on purpose: the headline sits on the archive.','```tsx Frame.tsx\nexport default function Frame(){return 2;}\n```','{"review":tru'),
  answer('Ready for review.','','{"review":true}'),
  answer('The archive is now one object.','```tsx Frame.tsx\nexport default function Frame(){return 3;}\n```','{"review":true}'),
 ];
 const sent:{message:string;images:number}[]=[],turns:{idea:string;results:string[]}[]=[],state=newDesignerState(),heroes:string[]=[];
 await runHeroChat({input:i,state,maxTurns:8,maxPictures:2,timeMs:600000,tools,heroReviews:2,save:async()=>{},
  call:async(message,images)=>{sent.push({message,images:images.length});return answers[sent.length-1];},onTurn:async e=>{turns.push({idea:e.idea,results:e.results});},onHero:async e=>{heroes.push(e.kind);}});
 assert.match(sent[0].message,/^THE HERO FRAME/);assert.ok(!UUID.test(sent[0].message),'no scene ids in stage H');assert.equal(sent[0].images,0);
 assert.match(sent[1].message,/Here is the hero frame as it rendered \(1 view attached\)/);assert.match(sent[1].message,/Must fix:\n- The approved line "SIGN UP"/);
 assert.match(sent[1].message,/Measured, for you to weigh[\s\S]*The headline overlaps the picture\./,'an overlap is an observation in stage H');assert.equal(sent[1].images,1,'the render is attached');
 assert.match(sent[1].message,/Asked for a picture \(the archive\): it will be resources\['/);assert.equal(pictures[0].scene,i.storyboard[0].id);assert.deepEqual(pictures[0].referenceAssetIds,[i.assets[1].id],'files by name, mapped to ids');
 assert.match(sent[2].message,/Your actions block could not be read \(it is not valid JSON\); your files were applied\./,'a malformed block costs no turn of work');assert.deepEqual(turns[1].results.slice(0,1),['Saved Frame.tsx.']);
 assert.match(sent[3].message,/The reviewer's notes on your hero frame:\n- \[P1\] v: The archive idea is told, not shown\. Wanted: One object that is the archive\./);
 assert.deepEqual(reviews,[1,2]);assert.equal(state.hero?.state,'accepted');assert.equal(state.hero?.acceptedBy,'critic');assert.equal(sent.length,4);
 assert.deepEqual(heroes,['started','reviewed','reviewed','accepted']);assert.equal(turns[0].idea,'The idea: the session as an archive you can walk through.');
});
