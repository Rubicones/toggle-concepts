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
import {PICTURE_PAYMENT_REFUSED,pictureProviderCredit,pictureCreditFirstLine,pictureFailure,pictureFailureLine,pictureFailureNote,pictureCreditNote,pictureProviderCreditMicroUsd,picturesLeft,KEEP_THE_WAY_OF_MAKING,NO_FURTHER_PICTURE_REVIEWER,type PictureFailure} from '../packages/director/picture-failure';
import {IDEA_TURN_REVIEWER,IDEA_TURN_STAYS,HERO_REVIEW_INSTRUCTIONS_V3,END_REVIEW_INSTRUCTIONS_V3,NOTES_INSIDE_THE_IDEA,SUBJECT_AND_MAKING_REVIEWER,SUBJECT_AND_MAKING_STAY,lastTurnNote} from '../packages/director/quality';
import {advisoryCriticFor,buildRunContext,ADVISORY_CRITIC} from '../packages/agents/run-context';
import {fitFinish,parseChatAnswer} from '../packages/director/hero-chat';
import {extensionActionsSchema} from '../packages/director/extension-chat';
import {compactionLine} from '../packages/director/budget-policy';
import {IDEAS_TASK,IDEAS_TASK_V6,IDEAS_WITHOUT_PRODUCT_PICTURE,hasShowablePicture,ideasTaskFor} from '../packages/director/image-ideas';
import {markUsableReferences,drawableReferenceUrls} from '../packages/director/material-memory';
import {questionForFailure} from '../packages/director/questions';
import {recoveryActions,directionStatus,designerStage} from '../packages/director/ad-flow';
import {recoveredPictureLine} from '../packages/director/picture-failure';
import {readFileSync} from 'node:fs';
import {accountLines,buyTestPicture,conclusion,keyFromEnvFile,priceLines,providerMaximumUsd,readCredits,readKey,testPictureRequest} from '../packages/data/picture-provider-check';
import {imageRequest,type ImageQuote} from '../packages/agents/image-provider';
import {brandCharacterInstructions,characterPictures,DEVICES_IN_USE_LABEL,type CatalogueEntry} from '../packages/brand/brand-pack-contents';
import {heroTask,DEVICE_USE_DESIGNER} from '../packages/director/hero-chat';
import {QUALITY_CHECKS,reviewMaterialFor} from '../packages/director/quality';
import {stageEMechanics,SCENES_OWN_COMPOSITION} from '../packages/director/extension-chat';
import {frameShares} from '../packages/director/layout-inspection';
import {flatShare} from '../packages/director/plain-band';
import {brandReferenceNames,splitPictureReferences,referenceRefusal,PICTURE_REFERENCES_DESIGNER} from '../packages/director/picture-references';
import {pinBrandReference,derivedReferences} from '../apps/local-runner/director/image-methods';
import {resourceRequest} from '../packages/director/resources';
import {retryPreflight} from '../packages/creative/still-attempts';
import {schemaIssues} from '../packages/agents/schema-in-text';
import {mkdir} from 'node:fs/promises';
import type {DirectionInput,Resource} from '../packages/director/types';

const input=(version=6)=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:version,materialsVersion:1,digestVersion:1};i.resourceIds=['picture-1','picture-2','picture-3','picture-4'];return i;};
const say=(prose:string,source:string|null,actions?:unknown)=>`${prose}${source?`\n\n\`\`\`tsx Frame.tsx\n${source}\n\`\`\``:''}${actions?`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``:''}`;
const picture=(purpose:string)=>({purpose,prompt:'A made-up studio, no text.',aspect:'1:1'});
const REFUSED='CREATIVE_IMAGE_FAILED:PROVIDER_402',SAID='This request needs more credit than the account holds. Add credits, or request fewer images.';
/** Drives the hero chat with scripted answers; the second picture bought is refused for payment, as in the run. */
async function drive(answers:string[],o:{version?:number;refuseFrom?:number;review?:()=>unknown;maxPictures?:number;/** the owner's answer to a payment stop */onStop?:'decline'|'retry'}={}){
 const dir=await mkdtemp(join(tmpdir(),'live2-')),shot=join(dir,'shot.png'),c=createCanvas(32,32);await writeFile(shot,c.toBuffer('image/png'));
 const pictures:{brandRefs?:string[];referenceAssetIds:string[]}[]=[];
 const files=new Map<string,string>(),sent:string[]=[],failed:{id:string;failure:PictureFailure}[]=[],reviewed:number[]=[],state=newDesignerState();let asked=0;
 const tools:DesignerTools={files:async()=>[...files].map(([path,source])=>({path,source})),write:async(p,s)=>{files.set(p,s);},build:async()=>({ok:true as const}),
  render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[{view:views[0].key,findings:[]}]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))}),
  requestImage:async picture=>{pictures.push(picture as never);asked++;if(asked>=(o.refuseFrom??2)&&!(o.onStop==='retry'&&stops.length))throw Object.assign(new Error(REFUSED),{detail:`The image provider refused this still (PROVIDER_402); nothing was charged. Provider says: ${SAID}`});return {id:`picture-${asked}`,status:'ready' as const};},finish:async()=>({complete:true as const}),
  reviewHero:async round=>{reviewed.push(round);return (o.review?.()??{accepted:false,notes:[{priority:'P1',view:'square',problem:'The room is too dark to read.',fix:'The viewer reads the room at a glance.'}],checks:[],rulings:[]}) as never;}};
 const stops:(Error&{detail?:string})[]=[];
 for(let again=true;again;){again=false;await runHeroChat({input:input(o.version??6),state,maxTurns:answers.length,maxPictures:o.maxPictures??4,timeMs:600000,tools,heroReviews:2,pictureHoldMs:50,save:async()=>{},onPictureFailed:async e=>{failed.push(e);},
  call:async message=>{sent.push(message);return answers[sent.length-1]??say('Nothing more.',null,{});}}).catch((error:Error&{detail?:string})=>{if(error.message!==PICTURE_PAYMENT_REFUSED)return;stops.push(error);if(o.onStop&&stops.length<3){if(o.onStop==='decline')state.picturesDeclined=true;again=true;}});}
 return {sent,failed,state,asked:()=>asked,reviewed,stops,pictures};
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
 ],{onStop:'decline'});
 assert.equal(run.stops.length,1,'the direction stopped once and the owner chose to go on without pictures');
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
 ],{onStop:'decline'});
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

test('live run 3: a picture refused for payment in the hero stage stops the direction at once with a question; the owner retries or goes on without pictures', async()=>{
 const answers=[say('The room.','export default 1;',{pictures:[picture('the room')]}),say('Again.',null,{pictures:[picture('the room')],render:true}),say('Done.',null,{render:true})];
 const stopped=await drive(answers,{refuseFrom:1});
 assert.equal(stopped.stops.length,1);assert.equal(stopped.sent.length,1,'no further turn is spent');assert.equal(stopped.failed.length,1,'the loud line is still said');
 assert.equal(stopped.stops[0].detail,`designer: the picture picture-1 was refused for payment (${REFUSED}). Provider says: ${SAID}`);
 const q=questionForFailure(input(),stopped.stops[0],1000000);
 assert.equal(q.reason,'execution');assert.ok(q.question.includes(`The provider says: “${SAID}”`)&&q.question.includes('Add credit to the picture provider account (OpenRouter)'),q.question);
 assert.deepEqual(q.options.map(o=>[o.action,o.label]),[['resume','I added credit — try the picture again'],['resume-without-pictures','Continue without pictures']]);
 assert.deepEqual(recoveryActions(q).actions.map(a=>a.label),['I added credit — try the picture again','Continue without pictures'],'the labels reach the page as written');
 // "I added credit": buying is open again and the designer is told so; the next request reaches the provider.
 const retried=await drive(answers,{refuseFrom:1,onStop:'retry'});
 assert.ok(retried.sent[1].includes('The picture picture-1 was not bought: the picture provider refused payment. Pictures can be bought again now: ask for it again if the idea needs it. You can still get 3 pictures.'),retried.sent[1]);
 assert.equal(retried.asked(),2);assert.equal(retried.state.picturesBlocked,undefined);assert.equal(retried.stops.length,1);
 // "Continue without pictures": told once that none can be had; nothing more is asked of the provider.
 const declined=await drive(answers,{refuseFrom:1,onStop:'decline'});
 assert.ok(declined.sent[1].includes('You can get no further picture in this draft. Keep the pictures you have'),declined.sent[1]);assert.equal(declined.asked(),1);assert.equal(declined.stops.length,1);
});

test('live run 3: the credit check reads an ordinary key, and the price message leads with what it found', async()=>{
 const provider=(answers:Record<string,unknown>)=>(async(url:string)=>{const body=answers[url.split('/').at(-1)!];return {ok:body!==undefined,json:async()=>body};}) as unknown as typeof fetch;
 assert.deepEqual(await pictureProviderCredit('k',provider({credits:{data:{total_credits:10,total_usage:9.95}}})),{source:'account',microUsd:50000});
 // An ordinary key is refused by the account endpoint; its own endpoint gives the key's remaining limit, or none.
 assert.deepEqual(await pictureProviderCredit('k',provider({key:{data:{limit:5,limit_remaining:0.02,usage:4.98}}})),{source:'key',microUsd:20000});
 assert.deepEqual(await pictureProviderCredit('k',provider({key:{data:{limit:null,limit_remaining:null,usage:12}}})),{source:'unknown',microUsd:null});
 assert.deepEqual(await pictureProviderCredit(undefined,provider({})),{source:'unknown',microUsd:null});
 assert.match(pictureCreditFirstLine({source:'account',microUsd:50000},4,68868),/^The picture provider account has \$0\.05 of credit: enough for no picture of the 4 this draft may ask for \(up to \$0\.28\)\. Add credit .* $/);
 assert.match(pictureCreditFirstLine({source:'key',microUsd:20000},4,68868),/^This key's limit at the picture provider leaves \$0\.02 of credit/);
 assert.equal(pictureCreditFirstLine({source:'account',microUsd:5_000_000},4,68868),'');
 assert.match(pictureCreditFirstLine({source:'unknown',microUsd:null},4,68868),/^Picture credit could not be checked/);assert.match(pictureCreditFirstLine({source:'key',microUsd:5_000_000},4,68868),/^Picture credit could not be checked/);
 assert.equal(pictureCreditFirstLine({source:'unknown',microUsd:null},0,68868),'');
});

test('live run 3: the end review reads the chosen idea and may not ask for the element that carries its turn to go; the designer keeps it', ()=>{
 assert.ok(END_REVIEW_INSTRUCTIONS_V3.endsWith(IDEA_TURN_REVIEWER)&&!HERO_REVIEW_INSTRUCTIONS_V3.includes(IDEA_TURN_REVIEWER));
 assert.equal(IDEA_TURN_STAYS,'The element that carries the turn of your chosen idea stays as well: when a note asks for it to go, keep it and say that the note stays open.');
 for(const text of [IDEA_TURN_REVIEWER,IDEA_TURN_STAYS])assert.doesNotMatch(text,/\b(left|right|top|bottom|centre|center|grid|column|tag)\b/i);
});

test('the picture provider check: reads the key without showing it, says what key and account report, sends the studio\'s own request, and names the cause', async()=>{
 const key='sk-or-v1-made-up-key-for-the-test-9f3a';
 assert.equal(keyFromEnvFile(`A=1\r\nOPENROUTER_API_KEY="${key}"\r\nB=2`),key);assert.equal(keyFromEnvFile('A=1'),undefined);assert.equal(keyFromEnvFile('OPENROUTER_API_KEY='),undefined);
 const provider=(answers:Record<string,{status?:number;body:unknown}>)=>(async(url:string)=>{const a=answers[url.split('/').at(-1)!];return {ok:!!a&&(a.status??200)<300,status:a?.status??404,json:async()=>a?.body,text:async()=>JSON.stringify(a?.body??{})};}) as unknown as typeof fetch;
 const limited=provider({key:{body:{data:{limit:5,limit_remaining:0.03,usage:4.97,is_free_tier:false}}}});
 const k=await readKey(key,limited),c=await readCredits(key,limited);
 assert.deepEqual(k,{available:true,limit:5,usage:4.97,remaining:0.03,freeTier:false});assert.equal(c.available,false);
 const lines=accountLines(key,k,c);
 assert.ok(lines.every(l=>!l.includes(key)&&!l.includes('made-up')),'the key is never printed');assert.match(lines[0],/…9f3a/);
 assert.equal(lines[1],'This key: limit $5.00, $0.0300 of it left; used so far $4.97; not free tier.');assert.match(lines[2],/not available for this key/);
 const open=provider({key:{body:{data:{limit:null,limit_remaining:null,usage:1,is_free_tier:false}}},credits:{body:{data:{total_credits:20,total_usage:19.5}}}});
 assert.deepEqual(await readCredits(key,open),{available:true,total:20,used:19.5,remaining:0.5});
 // The request is the studio's own builder for a creative still: one picture, the quoted ratio and provider.
 const quote={model:'google/gemini-2.5-flash-image',provider:'google-vertex/global',aspectRatio:'1:1',reservation:68868,referenceCount:0,referenceTokens:0,outputPrice:0.00003} as unknown as ImageQuote;
 const sent=testPictureRequest(quote);assert.deepEqual(sent,imageRequest(quote,'',{mode:'creative_still'},'A plain grey pebble on a white table, soft daylight. No text.',[],'check-picture-provider'));assert.equal(sent.n,1);
 const maximum=providerMaximumUsd(0.0000025,0.00003,32768);assert.ok(Math.abs(maximum-0.98304)<1e-9);
 assert.match(priceLines(quote,maximum)[1],/reserves \$0\.0689 for one picture/);assert.match(priceLines(quote,maximum)[2],/up to about \$0\.9830/);
 const refused=await buyTestPicture(key,quote,provider({images:{status:402,body:{error:{message:'This request needs more credits.',code:402}}}}));
 assert.deepEqual(refused,{ok:false,status:402,said:'{"message":"This request needs more credits.","code":402}'});
 const bought=await buyTestPicture(key,quote,provider({images:{body:{data:[{b64_json:'AAAA'}],usage:{cost:0.0388}}}}),async()=>1024);
 assert.deepEqual(bought,{ok:true,width:1024,costUsd:0.0388});
 // The conclusion names the cause when it can.
 assert.match(conclusion({key:k,credits:c,maximumUsd:maximum,priced:true}),/^CONCLUSION: this KEY's own limit is the cause: \$0\.0300 is left/);
 assert.match(conclusion({key:await readKey(key,open),credits:await readCredits(key,open),maximumUsd:maximum,priced:true}),/^CONCLUSION: the ACCOUNT's credit is the cause: \$0\.5000 is left and one picture needs up to about \$0\.9830 free/);
 assert.match(conclusion({key:{available:false,limit:null,usage:null,remaining:null,freeTier:null},credits:c,maximumUsd:null,priced:false}),/key in the studio's settings is not accepted/);
 assert.match(conclusion({key:{...k,remaining:null,limit:null},credits:c,maximumUsd:maximum,priced:false}),/picture model is not offered/);
 assert.match(conclusion({key:{...k,remaining:null,limit:null,freeTier:true},credits:c,maximumUsd:maximum,priced:true}),/free tier/);
 assert.match(conclusion({key:{...k,remaining:null,limit:null},credits:c,maximumUsd:maximum,priced:true,test:refused}),/refused payment although/);
 assert.match(conclusion({key:k,credits:c,maximumUsd:maximum,priced:true,test:bought}),/pictures work with this key now/);
 // The launcher is written by the installer and kept in step by the setup script; it never echoes the settings file.
 const launcher=readFileSync('scripts/windows/Check-Pictures.cmd','utf8'),line=launcher.split(/\r?\n/).find(l=>l.startsWith('wsl.exe'))!;
 assert.ok(readFileSync('scripts/windows/Install-Toggle.cmd','utf8').includes(line)&&line.includes('scripts/check-picture-provider.ts')&&!/\.env/.test(line));
});

test('live run 4: devices carry their use; the signature pictures are the brand in use before its logos', ()=>{
 // New packs written under version 6 record, per device, its role, scale, repetition and what it is never used as.
 assert.ok(brandCharacterInstructions(null,{devicesInUse:true}).includes(`DEVICES: the visual devices that make it recognisable with the logo covered.\n${DEVICES_IN_USE_LABEL}\nCOLOUR, TYPE`));
 assert.ok(!brandCharacterInstructions(null).includes('DEVICES IN USE'),'earlier versions keep their request');
 assert.match(DEVICES_IN_USE_LABEL,/Where the materials do not show one of these, write "not stated"\./);
 assert.ok(heroTask(input(6)).includes(DEVICE_USE_DESIGNER)&&!heroTask(input(5)).includes(DEVICE_USE_DESIGNER));
 assert.equal(QUALITY_CHECKS.filter(c=>c.skill==='brand-character'&&c.stage==='hero').length,1);
 // The shape of the run's kit: three logos marked "Use this", many other logos, two product screens, one guidelines page.
 const e=(name:string,kind:string):CatalogueEntry=>({name,kind,line:'',size:'picture',materialId:name,picture:{objectKey:name,sha256:name,width:10,height:10}} as unknown as CatalogueEntry);
 const kit=[e('logo-a','logo (Use this)'),e('logo-b','logo (Use this)'),e('logo-c','logo (Use this)'),e('logo-d','logo'),e('screen-1','product screen'),e('screen-2','product screen'),e('book','brand guidelines')];
 assert.deepEqual(characterPictures(kit).map(x=>x.name),['screen-1','book','screen-2','logo-a','logo-b','logo-c','logo-d']);
 assert.deepEqual(characterPictures([e('p1','photo (Use this)'),e('p2','photo (Use this)'),e('p3','photo (Use this)'),e('logo-a','logo (Use this)')]).map(x=>x.name),['p1','p2','p3']);
});

test('live run 4: the frame\'s shares are measured and said as numbers; scenes get their own composition', ()=>{
 const box=(x:number,y:number,width:number,height:number)=>({x,y,width,height}),text=(fontSize:number,b:ReturnType<typeof box>)=>({text:'t',box:b,fontSize} as never),img=(b:ReturnType<typeof box>,logo=false)=>({src:'p.png',box:b,logo} as never);
 assert.equal(frameShares({width:1000,height:1000,flat:0.62,images:[img(box(300,300,400,400)),img(box(0,0,900,900),true)],texts:[text(40,box(100,100,400,50)),text(38,box(100,160,400,50)),text(16,box(100,900,800,20))]}),
  'Measured, for your judgement (no rule): the largest picture covers 16% of the frame; the largest words cover 4% of it and their letters are 4% of its height; 62% of the frame is one flat colour.');
 assert.match(frameShares({width:100,height:100,images:[],texts:[]}),/the frame has no picture; the frame has no words\.$/);
 const px=(w:number,h:number,at:(x:number,y:number)=>[number,number,number])=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=at(x,y);data.set([...c,255],(y*w+x)*4);}return {width:w,height:h,data};};
 assert.equal(flatShare(px(10,10,(x)=>x<6?[10,12,20]:[200+x*5,90,40])),0.6);assert.equal(flatShare(px(10,10,()=>[240,240,240])),1);
 // The scenes sentence opens stage E in version 6 only; the end review asks it as a check.
 assert.ok(stageEMechanics(input(6)).includes(SCENES_OWN_COMPOSITION)&&!stageEMechanics(input(5)).includes(SCENES_OWN_COMPOSITION));
 const end=reviewMaterialFor(input(6),undefined,'extension').checks.map(c=>c.question);
 assert.deepEqual(end,['Does each scene have its own composition for its own message, while the type, the colour and the marks stay one system?']);
 assert.deepEqual(reviewMaterialFor(input(5),undefined,'extension').checks,[]);
 const hero=reviewMaterialFor(input(6),undefined,'hero').checks.map(c=>c.question);
 assert.ok(hero.includes('Does every large area of the frame do work for the idea: it shows the subject, carries words, or is space the idea needs?'));
 for(const text of [DEVICES_IN_USE_LABEL,DEVICE_USE_DESIGNER,SCENES_OWN_COMPOSITION,...QUALITY_CHECKS.map(c=>c.question)])assert.doesNotMatch(text,/\b(left|right|top|bottom|centre|center|grid|column|ring|orange)\b/i,text);
});

test('live run 5: a picture may take the brand\'s own files as references; one that cannot be issued is named and not counted', async()=>{
 const i=input(),logo=i.brand.logos[0].url;
 const withKit={...i,brand:{...i.brand,references:[{id:'m1',url:'ring.png'},{id:'m2',url:'evidence.png'}],rawKit:{materials:[{id:'m1',role:'logo'}]}}} as DirectionInput;
 const names=brandReferenceNames(withKit,[{name:'ring-gloss',materialId:'m1'},{name:'shelf',materialId:'m2'}]);
 assert.deepEqual(names.filter(n=>n.url==='ring.png').map(n=>n.name),['ring.png','brand.references[0]','ring-gloss']);assert.ok(!names.some(n=>n.url==='evidence.png'),'a picture that is evidence only cannot be a reference');
 assert.deepEqual(splitPictureReferences(['ring-gloss','ring.png'],withKit,names),{assetIds:[],brandUrls:['ring.png'],problems:[]});
 assert.deepEqual(splitPictureReferences(['shelf'],withKit,names).problems,['"shelf" is not a file a picture may take as a reference']);
 assert.match(splitPictureReferences([logo,'ring.png','brand.logos[0]','a','b'],withKit,names).problems.join(' '),/"a" is not a file.*"b" is not a file/);
 assert.ok(heroTask(input(6)).includes(PICTURE_REFERENCES_DESIGNER)&&!heroTask(input(5)).includes(PICTURE_REFERENCES_DESIGNER));
 // The loop: a named brand file reaches the purchase; an unknown name is answered and costs no picture.
 const run=await drive([say('The object in a room.','export default 1;',{pictures:[{...picture('the object in a room'),references:['made-up.png']},{...picture('the object in a room'),references:[logo]}]}),say('Done.',null,{render:true})],{refuseFrom:99});
 assert.equal(run.asked(),1);assert.equal(run.state.pictures,1,'the refused request is not counted');assert.deepEqual(run.pictures[0].brandRefs,[logo]);assert.deepEqual(run.pictures[0].referenceAssetIds,[]);
 assert.ok(run.sent[1].includes(referenceRefusal('the object in a room',['"made-up.png" is not a file a picture may take as a reference'])),run.sent[1]);
 // The request: the pinned file travels as an application-made reference and is part of the request's identity.
 const folder=await mkdtemp(join(tmpdir(),'refs-'));await mkdir(join(folder,'public'));
 await writeFile(join(folder,'public','ring.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="1500"><circle cx="1500" cy="750" r="600" fill="#F28C28"/></svg>');
 const pinned=await pinBrandReference(folder,'ring.svg'),again=await pinBrandReference(folder,'ring.svg');assert.equal(pinned.sha256,again.sha256);assert.match(pinned.sha256,/^[a-f0-9]{64}$/);
 const v6=input(6),resource:Resource={id:v6.resourceIds[0],kind:'still',resolution:'low',proxy:false,purpose:'p',scene:v6.storyboard[0].id,prompt:'A room.',aspect:'1:1',referenceAssetIds:[],mustNotContain:[]};
 const plain=resourceRequest(resource,v6,50000),withRef=resourceRequest({...resource,brandRefs:[pinned]},v6,50000);
 assert.deepEqual(plain.derivedPlan,[]);assert.deepEqual(withRef.derivedPlan,[{kind:'brand',sha256:pinned.sha256}]);assert.notEqual(withRef.key,plain.key);
 assert.throws(()=>resourceRequest({...resource,brandRefs:[{url:'ring.svg'}]},v6,50000),/BRAND_REFERENCE_NOT_PINNED/);
 const puts:string[]=[],sent=await derivedReferences(folder,{...resource,brandRefs:[pinned]},async key=>{puts.push(key);});
 assert.deepEqual(sent.map(d=>[d.sha256,d.mime,d.width,d.height]),[[pinned.sha256,'image/png',1024,512]]);assert.deepEqual(puts,[`staging/director-derived/${pinned.sha256}.png`]);
});

test('live run 5: a failure before anything was sent is tried once more; a format correction names what is wrong', ()=>{
 assert.equal(retryPreflight(new Error('CREATIVE_IMAGE_FAILED:IMAGE_PREFLIGHT_FAILED')),true);assert.equal(retryPreflight(new Error('CREATIVE_IMAGE_FAILED:PROVIDER_402')),false);assert.equal(retryPreflight(new Error('CREATIVE_IMAGE_PENDING')),false);
 // The run's case: an answer that is either a question or a deliverable; the deliverable had one field missing and
 // the whole correction read "fits none of the allowed shapes", twice.
 const schema={type:'object',required:['answer'],properties:{answer:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['question'],properties:{question:{type:'string'}}},{type:'object',additionalProperties:false,required:['role','territories'],properties:{role:{type:'string',enum:['visual-direction']},territories:{type:'array',minItems:1,items:{type:'object',required:['name','making'],properties:{name:{type:'string'},making:{type:'string'}}}}}}]}}} as never;
 const issues=schemaIssues({answer:{role:'visual-direction',territories:[{name:'A'}]}},schema);
 assert.ok(issues.length>=1&&issues.every(i=>!i.includes('fits none')),issues.join(' | '));assert.ok(issues.some(i=>/territories\.0/.test(i)&&/making/.test(i)),issues.join(' | '));
 assert.deepEqual(schemaIssues({answer:null},schema),[]);assert.deepEqual(schemaIssues({answer:{question:'Which?'}},schema),[]);
 assert.deepEqual(schemaIssues({answer:7},schema),['answer.answer: fits none of the allowed shapes']);
});

test('live run 5: the draft says what state it is in, and a picture the draft went on without is a note', ()=>{
 const d=(extra:object)=>({id:'d',variants:[],question:null,...extra}) as never;
 assert.equal(directionStatus(d({status:'running',progress:{phase:'designer',turns:3,log:[],stage:'key frame'}})),'Working: key frame');
 assert.equal(directionStatus(d({status:'running',progress:{phase:'designer',turns:9,log:[],stage:'other scenes'}})),'Working: other scenes');
 assert.equal(directionStatus(d({status:'done'})),'Finished: saved for your review');
 assert.equal(directionStatus(d({status:'review',question:{question:'The picture provider refused payment for a picture of the key frame, so this direction stopped. Nothing was charged.'}})),'Stopped: The picture provider refused payment for a picture of the key frame, so this direction stopped.');
 assert.equal(designerStage({phase:'designer',designer:{hero:{state:'designing'}}}),'key frame');assert.equal(designerStage({phase:'designer',designer:{hero:{state:'accepted'}}}),'other scenes');
 assert.equal(designerStage({phase:'designer',designer:{complete:true,hero:{state:'accepted'}}}),'review');assert.equal(designerStage({phase:'critic',designer:{hero:{state:'accepted'}}}),'review');
 assert.equal(recoveredPictureLine(pictureFailure('CREATIVE_IMAGE_FAILED:IMAGE_PREFLIGHT_FAILED')),'One picture could not be made (the picture could not be made); the designer went on without it.');
});

test('bench on an export: a font file whose bytes are not its name\'s is missing; catalogue pictures of local brand files are read from them', async()=>{
 const {damagedFile,missingBrandFiles,localMaterialEntries}=await import('../scripts/bench/export-files');const {BINARY_FILE}=await import('../packages/data/run-export');const {createHash}=await import('node:crypto');
 const pub=await mkdtemp(join(tmpdir(),'pub-')),good=Buffer.from('a real font, for this test'),name=`${createHash('sha256').update(good).digest('hex')}.ttf`,bad=`${'0'.repeat(64)}.ttf`;
 await writeFile(join(pub,name),good);await writeFile(join(pub,bad),'text-mangled bytes');await writeFile(join(pub,'mark.svg'),'<svg/>');
 assert.equal(damagedFile(pub,name),false);assert.equal(damagedFile(pub,bad),true);assert.equal(damagedFile(pub,'mark.svg'),false,'only content-named files are checked');
 const i={...input(),brand:{...input().brand,fonts:[{family:'A',url:name,weight:'400'},{family:'B',url:bad,weight:'600'}],logos:[{id:'l1',url:'mark.svg',clearSpacePx:0}],references:[]}} as DirectionInput;
 assert.deepEqual(missingBrandFiles(i,pub).map(m=>m.label),['B 600']);assert.deepEqual(missingBrandFiles(i,pub,[bad]),[],'a stand-in put there on purpose counts as filled');
 const entries=localMaterialEntries([{name:'mark',materialId:'l1',picture:{objectKey:'k',sha256:'s'}},{name:'book-p1',materialId:'b1',picture:{objectKey:'k2',sha256:'s2'}},{name:'kit-colour'}] as never[],i,pub) as {name:string;file?:string;picture?:unknown}[];
 assert.deepEqual(entries.map(e=>[e.name,!!e.file,!!e.picture]),[['mark',true,false],['book-p1',false,true],['kit-colour',false,false]]);
 for(const f of ['a.woff2','b.ttf','c.otf','d.png','e.glb'])assert.ok(BINARY_FILE.test(f),f);for(const f of ['Frame.tsx','input.json','mark.svg'])assert.ok(!BINARY_FILE.test(f),f);
});

test('new run with the same brief: the new campaign gets the next free name; the earlier one is never renamed', async()=>{
 const {nextRunName}=await import('../packages/contracts/new-run');
 assert.equal(nextRunName('Autumn launch',['Autumn launch']),'Autumn launch · run 2');
 assert.equal(nextRunName('Autumn launch · run 2',['Autumn launch','autumn launch · run 2','Autumn launch · run 3']),'Autumn launch · run 4');
 assert.ok(nextRunName('x'.repeat(80),[]).length<=80,'inside the campaign name limit');
 const source=readFileSync('lib/server/new-run.ts','utf8');
 assert.ok(source.includes("rpc('studio_set_brand_source'")&&source.includes("rpc('studio_save_brief'")&&!/studio_c1_checkpoints|studio_a1_reviews|from\('[a-z_]+'\)\.update\(/.test(source),'only creation, the brand link and the brief draft: no checkpoint is touched');
});
