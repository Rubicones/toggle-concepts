// Live run of 15 November (designerVersion 6): what broke, each as a test in the shape of the run's export. Made-up
// files and answers only: no brand file, no copy line and no model. The shapes kept from the export are the error code
// of the refused picture, the order of the designer's turns, the kind of the compaction events and the finish block.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import {pictureFailure,pictureFailureLine,pictureFailureNote,pictureCreditNote,pictureProviderCreditMicroUsd,picturesLeft,KEEP_THE_WAY_OF_MAKING,NO_FURTHER_PICTURE_REVIEWER,type PictureFailure} from '../packages/director/picture-failure';
import {HERO_REVIEW_INSTRUCTIONS_V3,END_REVIEW_INSTRUCTIONS_V3,NOTES_INSIDE_THE_IDEA,SUBJECT_AND_MAKING_REVIEWER,SUBJECT_AND_MAKING_STAY,lastTurnNote} from '../packages/director/quality';
import {advisoryCriticFor,buildRunContext,ADVISORY_CRITIC} from '../packages/agents/run-context';
import {fitFinish,parseChatAnswer} from '../packages/director/hero-chat';
import {extensionActionsSchema} from '../packages/director/extension-chat';
import {compactionLine} from '../packages/director/budget-policy';
import {IDEAS_TASK,IDEAS_TASK_V6,IDEAS_WITHOUT_PRODUCT_PICTURE,hasShowablePicture,ideasTaskFor} from '../packages/director/image-ideas';
import {markUsableReferences,drawableReferenceUrls} from '../packages/director/material-memory';
import type {DirectionInput} from '../packages/director/types';

const input=(version=6)=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:version,materialsVersion:1,digestVersion:1};i.resourceIds=['picture-1','picture-2','picture-3','picture-4'];return i;};
const say=(prose:string,source:string|null,actions?:unknown)=>`${prose}${source?`\n\n\`\`\`tsx Frame.tsx\n${source}\n\`\`\``:''}${actions?`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``:''}`;
const picture=(purpose:string)=>({purpose,prompt:'A made-up studio, no text.',aspect:'1:1'});
const REFUSED='CREATIVE_IMAGE_FAILED:PROVIDER_402';
/** Drives the hero chat with scripted answers; the second picture bought is refused for payment, as in the run. */
async function drive(answers:string[],o:{version?:number;refuseFrom?:number;review?:()=>unknown;maxPictures?:number}={}){
 const dir=await mkdtemp(join(tmpdir(),'live2-')),shot=join(dir,'shot.png'),c=createCanvas(32,32);await writeFile(shot,c.toBuffer('image/png'));
 const files=new Map<string,string>(),sent:string[]=[],failed:{id:string;failure:PictureFailure}[]=[],reviewed:number[]=[],state=newDesignerState();let asked=0;
 const tools:DesignerTools={files:async()=>[...files].map(([path,source])=>({path,source})),write:async(p,s)=>{files.set(p,s);},build:async()=>({ok:true as const}),
  render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[{view:views[0].key,findings:[]}]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))}),
  requestImage:async()=>{asked++;if(asked>=(o.refuseFrom??2))throw new Error(REFUSED);return {id:`picture-${asked}`,status:'ready' as const};},finish:async()=>({complete:true as const}),
  reviewHero:async round=>{reviewed.push(round);return (o.review?.()??{accepted:false,notes:[{priority:'P1',view:'square',problem:'The room is too dark to read.',fix:'The viewer reads the room at a glance.'}],checks:[],rulings:[]}) as never;}};
 await runHeroChat({input:input(o.version??6),state,maxTurns:answers.length,maxPictures:o.maxPictures??4,timeMs:600000,tools,heroReviews:2,pictureHoldMs:50,save:async()=>{},onPictureFailed:async e=>{failed.push(e);},
  call:async message=>{sent.push(message);return answers[sent.length-1]??say('Nothing more.',null,{});}}).catch(()=>undefined);
 return {sent,failed,state,asked:()=>asked,reviewed};
}

test('2a: a picture refused for payment is said in plain words, with what the owner must do, and blocks further buying', ()=>{
 const f=pictureFailure(REFUSED,'This request needs more credits than the account has.');
 assert.deepEqual({reason:f.reason,blocks:f.blocks},{reason:'the picture provider refused payment: its account has too little credit for this picture',blocks:true});
 assert.equal(pictureFailureLine(f),'A picture could not be bought: the picture provider refused payment: its account has too little credit for this picture. Add credit to the picture provider account (OpenRouter), then continue; nothing was charged for this picture.');
 // A busy provider or an unusable picture does not end buying; an unknown code is reported with the provider's words.
 assert.equal(pictureFailure('CREATIVE_IMAGE_FAILED:PROVIDER_429').blocks,false);assert.equal(pictureFailure('IMAGE_RESPONSE_INVALID').blocks,false);
 assert.equal(pictureFailure('SOMETHING_NEW','It   broke.').reason,'the picture could not be made (It broke.)');
 assert.equal(pictureFailure('STEP_CAP_REACHED').blocks,true);assert.equal(pictureFailure('CREATIVE_IMAGE_FAILED:PROVIDER_401').blocks,true);
 assert.equal(picturesLeft(4,2,true),0);assert.equal(picturesLeft(4,2,false),2);
 assert.equal(pictureFailureNote('picture-2',pictureFailure('PROVIDER_429'),2),'The picture picture-2 could not be bought: the picture provider is busy and refused this request for now. You can still get 2 more pictures.');
});

test('2a/2b: the designer is told once that no further picture can be had and to keep its way of making; nothing more is asked of the provider', async()=>{
 const run=await drive([
  say('The room.','export default ()=>resources[\'picture-1\'];',{pictures:[picture('the room')]}),
  say('A second angle.',null,{pictures:[picture('the plate alone')],render:true}),
  say('Trying again.',null,{pictures:[picture('the plate again')],render:true}),
  say('Done.',null,{render:true}),
 ]);
 assert.equal(run.failed.length,1);assert.equal(run.failed[0].id,'picture-2');assert.equal(run.failed[0].failure.blocks,true);
 const told=run.sent[2];
 assert.ok(told.includes('The picture picture-2 could not be bought: the picture provider refused payment: its account has too little credit for this picture. You can get no further picture in this draft. Keep the pictures you have and the way of making you chose. Fix in code what code can fix, and say in your answer which notes stay open because they need a picture.'),told);
 // The third request never reaches the provider, and the count is not spent on it.
 assert.equal(run.asked(),2);assert.equal(run.state.pictures,2);assert.ok(run.sent[3].includes('No picture was asked for: you can get no further picture in this draft'),run.sent[3]);
 assert.equal(run.sent.filter(m=>m.includes('could not be bought')).length,1,'said once');
 assert.deepEqual(run.state.pictureFailures?.map(f=>f.code),[REFUSED]);assert.ok(run.state.picturesBlocked);
 // Version 5 keeps its exact words.
 const v5=await drive([say('The room.','export default 1;',{pictures:[picture('the room')]}),say('More.',null,{pictures:[picture('again')],render:true}),say('Go on.',null,{render:true})],{version:5});
 assert.ok(v5.sent.some(m=>m.includes(`The picture picture-2 could not be made (${REFUSED}).`)));assert.equal(v5.failed.length,0);assert.equal(v5.state.picturesBlocked,undefined);
});

test('2b/2d: review notes arrive with the rule that the subject and the way of making stay; a turn that drops every picture is told so once', async()=>{
 const withPicture='export default ()=>resources[\'picture-1\'].url;',inCode='export default ()=>"drawn in code";';
 const run=await drive([
  say('The room.',withPicture,{pictures:[picture('the room')]}),
  say('A second picture.',null,{pictures:[picture('the plate')],render:true}),
  say('Review it.',null,{review:true}),
  say('I am changing the way of making: the room is now drawn in code.',inCode,{}),
  say('Kept.',null,{render:true}),
 ]);
 assert.deepEqual(run.reviewed,[1]);
 const notes=run.sent[3];
 assert.ok(notes.includes(SUBJECT_AND_MAKING_STAY)&&notes.includes(`You can get no further picture in this draft. ${KEEP_THE_WAY_OF_MAKING}`),notes);
 assert.deepEqual(run.state.hero?.reviewedWith,['picture-1']);
 assert.ok(run.sent[4].includes('The frame the reviewer saw drew a picture (picture-1); this code draws none. The way of making stays through a review: put the picture back and solve the notes around it, or say in one sentence why the frame cannot keep it.'),run.sent[4]);
 assert.equal(run.state.hero?.makingNoted,true);
 // The texts: the reviewer never asks for the subject or the way of making to go, and knows when no picture can be had.
 for(const text of [HERO_REVIEW_INSTRUCTIONS_V3,END_REVIEW_INSTRUCTIONS_V3])assert.ok(text.includes(SUBJECT_AND_MAKING_REVIEWER));
 assert.ok(NOTES_INSIDE_THE_IDEA.endsWith(SUBJECT_AND_MAKING_STAY)&&lastTurnNote(['x']).includes(SUBJECT_AND_MAKING_STAY));
 assert.match(NO_FURTHER_PICTURE_REVIEWER,/^NO FURTHER PICTURE\nNo further picture can be made or bought for this draft\./);
 // The owner's rules for instruction texts: no layout, no named style, brand, font or design system.
 for(const text of [SUBJECT_AND_MAKING_REVIEWER,SUBJECT_AND_MAKING_STAY,KEEP_THE_WAY_OF_MAKING,NO_FURTHER_PICTURE_REVIEWER,IDEAS_WITHOUT_PRODUCT_PICTURE])assert.doesNotMatch(text,/\b(left|right|top|bottom|centre|center|grid|column|Inter|Helvetica|Material|Toggle|Swiss|minimal)\b/i,text);
});

test('2a: the price message says beforehand when the provider account cannot pay for the pictures, and is silent when that is not known', async()=>{
 assert.equal(pictureCreditNote(null,4,68868),'');assert.equal(pictureCreditNote(1_000_000,4,68868),'');assert.equal(pictureCreditNote(50_000,0,68868),'');
 assert.equal(pictureCreditNote(80_000,4,68868),' The picture provider account has $0.08 of credit: enough for 1 picture of the 4 this draft may ask for (up to $0.28). Add credit to the provider account before approving, or the other pictures will be refused.');
 const answer=(body:unknown,ok=true)=>(async()=>({ok,json:async()=>body})) as unknown as typeof fetch;
 assert.equal(await pictureProviderCreditMicroUsd('k',answer({data:{total_credits:10,total_usage:9.95}})),50000);
 assert.equal(await pictureProviderCreditMicroUsd('k',answer({data:{}})),null);assert.equal(await pictureProviderCreditMicroUsd('k',answer({},false)),null);
 assert.equal(await pictureProviderCreditMicroUsd(undefined,answer({data:{total_credits:1,total_usage:0}})),null,'no key, no request');
 assert.equal(await pictureProviderCreditMicroUsd('k',(async()=>{throw new Error('offline');}) as unknown as typeof fetch),null);
});

test('2d/2f: version 6 freezes the advisory reviewer unless the full rounds are asked for; the context names critic@3; version 5 is unchanged', ()=>{
 assert.equal(advisoryCriticFor({STUDIO_DESIGNER_VERSION:'6'}),true);assert.equal(advisoryCriticFor({STUDIO_DESIGNER_VERSION:'6',STUDIO_CRITIC_MODE:'full'}),false);
 assert.equal(advisoryCriticFor({}),false);assert.equal(advisoryCriticFor({STUDIO_DESIGNER_VERSION:'5'}),false);assert.equal(advisoryCriticFor({STUDIO_CRITIC_MODE:'advisory'}),true);
 const ctx=(extra:object)=>buildRunContext({briefText:'{"a":1}',brandPack:'PACK',packVersion:1,materials:{entries:[],budget:{}},critic:true,imageOwner:true,...extra});
 const v6=ctx({oneMind:true,advisoryCritic:true}),v5=ctx({});
 assert.equal(v6.criticMode,ADVISORY_CRITIC);assert.equal((v6 as {reviewChecks?:string}).reviewChecks,'critic@3');assert.equal(v6.criticVersion,'critic@2');
 assert.equal(v5.criticMode,undefined);assert.equal((v5 as {reviewChecks?:string}).reviewChecks,undefined);assert.equal(v6.sha256,v5.sha256,'the flags change no request text');
});

test('2h: a finish description over its length is shortened by the app and the finish is read; the size notice says what was cut', ()=>{
 const long='The plate stands on the first stand of the rack while the light moves across its face and the stands behind it fill one by one with further plates, each carrying the same letterforms as the first plate did.';
 assert.ok(long.length>200);
 const text=say('Finished.',null,{finish:{intent:'x'.repeat(90),scenes:[{scene:'Scene 1',moment:'Short.'},{scene:'Scene 2',moment:long,motion:'m'.repeat(300),sound:'s'.repeat(250)}]}});
 const strict=parseChatAnswer(text,extensionActionsSchema),fitted=parseChatAnswer(text,extensionActionsSchema,{edits:true});
 assert.ok(strict.actionsError,'earlier versions refuse it, as the run did');assert.equal(fitted.actionsError,undefined);
 const scene=fitted.actions!.finish!.scenes[1];assert.ok(scene.moment.length<=200&&scene.moment.endsWith('…')&&long.startsWith(scene.moment.slice(0,-1)));assert.ok(scene.motion!.length<=240&&scene.sound!.length<=200);
 assert.equal(fitted.actions!.finish!.scenes[0].moment,'Short.');assert.deepEqual(fitFinish({render:true}),{render:true});
 // The export's compaction events: 28 of 36,273 units cut, said six times as "This request was compacted".
 assert.equal(compactionLine({before:36273,after:36245,cap:65536}),'This request is large (36,245 of 65,536 units allowed); nothing was left out.');
 assert.equal(compactionLine({before:90000,after:60000,cap:65536}),'This request was shortened to stay within its size limit: 30,000 of 90,000 units were left out (see the detail for what).');
});

test('3: a brand with no picture of its product or work is asked for the viewer\'s situation, the result or a made scene, never the ad itself', ()=>{
 const none=input(),withAsset={...input(),assets:[{id:'a',url:'pot.png'}]} as unknown as DirectionInput;none.assets=[];none.brand={...none.brand,references:[{id:'r',url:'mark.svg'}]};delete (none.brand as {interface?:unknown}).interface;
 assert.equal(hasShowablePicture(none),false);assert.equal(hasShowablePicture(withAsset),true);
 assert.equal(hasShowablePicture({...none,brand:markUsableReferences({...none.brand,references:[{id:'r',url:'pot.png'}]},['r'])}),true);
 assert.equal(hasShowablePicture({...none,brand:{...none.brand,interface:[{id:'s',url:'screen.png',role:'screenshot'}]}} as never),true);
 const task=ideasTaskFor(none);assert.ok(task.includes(IDEAS_WITHOUT_PRODUCT_PICTURE)&&task.length>IDEAS_TASK_V6.length);
 assert.equal(ideasTaskFor(withAsset),IDEAS_TASK_V6);assert.equal(ideasTaskFor({...none,brief:{...none.brief,designerVersion:5}}),IDEAS_TASK);
 assert.match(IDEAS_WITHOUT_PRODUCT_PICTURE,/do not make the ad itself the subject/);
 // 2c: the marks reach the frozen input, and only marked or kit-logo references are drawable.
 assert.deepEqual(drawableReferenceUrls({brand:markUsableReferences({references:[{id:'a',url:'a.png'},{id:'b',url:'b.png'},{id:'c',url:'c.svg'}],rawKit:{materials:[{id:'c',role:'logo'}]}},['a'])}),['a.png','c.svg']);
});
