// critic@3 (designerVersion 6 only): the review an average frame fails. Strict yes/no, six more hero checks and one
// ideas check inside the skill editor's limits, fixes that name no arrangement, the chosen idea kept through the
// review, a selection reason without building advice, and one last turn when the review ends with points open.
// Version 5 reads critic@2 exactly as before. Made-up answers; no model.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {readSkills} from '../packages/agents/skill-files';
import {buildStageSkills,stageTokens,SKILL_STAGES,STAGE_SKILL_LIMIT} from '../packages/agents/stage-skills';
import {checkSkillDraft,SKILL_PART_LIMITS} from '../packages/agents/skill-editor';
import {stageReviewMaterial,settleHeroReview,REVIEW_INSTRUCTIONS,HERO_REVIEW_WHAT,type ReviewRound} from '../packages/director/critic-review';
import {SELECTION_INSTRUCTIONS} from '../packages/director/image-ideas';
import {QUALITY_CHECKS,QUALITY_VERSION,heroHasCallToAction,reviewMaterialFor,strictRound,reasonOnly,chosenIdeaNote,usesQuality,HERO_REVIEW_INSTRUCTIONS_V3,SELECTION_INSTRUCTIONS_V3,NOTES_INSIDE_THE_IDEA,lastTurnNote} from '../packages/director/quality';
import {heroBrief} from '../packages/director/hero-chat';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../packages/director/types';

const input=(version:number)=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:version,materialsVersion:1,digestVersion:1};return i;};
const skills=readSkills(),staged=buildStageSkills(skills,[]);

test('critic@3: the added checks are yes/no questions inside the skill editor\'s limits, and the stage budgets are unchanged', ()=>{
 assert.equal(QUALITY_VERSION,'critic@3');assert.equal(usesQuality(input(5)),false);assert.equal(usesQuality(input(6)),true);
 for(const skill of new Set(QUALITY_CHECKS.map(c=>c.skill))){
  const file=skills.find(s=>s.id===skill)!,added=QUALITY_CHECKS.filter(c=>c.skill===skill).map(c=>`[${c.stage}] ${c.question}`);
  const check=checkSkillDraft({title:file.title,purpose:file.purpose,stages:file.stages,principles:file.principles,checks:[...file.checks,...added],signs:file.signs});
  assert.deepEqual(check.errors,[],skill);assert.ok(file.checks.length+added.length<=SKILL_PART_LIMITS.checks,`${skill}: at most six checks`);
 }
 assert.equal(QUALITY_CHECKS.filter(c=>c.stage==='hero').length,13);assert.equal(QUALITY_CHECKS.filter(c=>c.stage==='ideas').length,3);
 // The instruction texts keep the owner's rules too: no examples, links or names.
 for(const text of [HERO_REVIEW_INSTRUCTIONS_V3,SELECTION_INSTRUCTIONS_V3,NOTES_INSIDE_THE_IDEA,lastTurnNote(['x'])])assert.deepEqual(checkSkillDraft({title:'t',purpose:'p',stages:['critic'],principles:text,checks:[],signs:''}).errors.filter(e=>!/tokens/.test(e)),[]);
 // Principles are untouched, so every stage is where it was, inside its budget.
 for(const stage of SKILL_STAGES)assert.ok(stageTokens(staged.stages[stage])<=STAGE_SKILL_LIMIT,stage);
});

test('critic@3: version 5 reads the same checks as before; version 6 adds its checks after each skill\'s own', ()=>{
 for(const stage of ['hero','ideas','extension'] as const)assert.deepEqual(reviewMaterialFor(input(5),staged,stage,{chosenIdea:true}),stageReviewMaterial(staged,stage));
 {const end=reviewMaterialFor(input(6),staged,'extension'),before=stageReviewMaterial(staged,'extension');assert.equal(end.checks.length,before.checks.length+1,'the end review gets one check: each scene its own composition');assert.deepEqual(end.checks.filter(c=>!/each scene have its own composition/.test(c.question)),before.checks);assert.deepEqual(end.signs,before.signs);assert.deepEqual(reviewMaterialFor(input(5),staged,'extension'),before,'version 5: the end review is not changed');}
 // A hero scene whose words hold the call to action is asked every check.
 const withCta=(()=>{const i=input(6);i.brief={...i.brief,cta:heroBrief(i).lines[0]};return i;})();assert.equal(heroHasCallToAction(withCta),true);assert.equal(heroHasCallToAction(input(6)),false);
 const before=stageReviewMaterial(staged,'hero').checks,after=reviewMaterialFor(withCta,staged,'hero',{chosenIdea:true}).checks;
 assert.equal(after.length,before.length+13);assert.equal(reviewMaterialFor(withCta,staged,'hero').checks.length,before.length+12,'without a chosen idea its check is left out');
 // Without a call to action in the hero's words, the two checks about one are not asked (a check that cannot apply
 // would always be a no); the others keep their numbers.
 const without=reviewMaterialFor(input(6),staged,'hero',{chosenIdea:true}).checks;assert.equal(without.length,after.length-2);assert.ok(!without.some(c=>/call to action/i.test(c.question)));
 assert.deepEqual(without.filter(c=>c.skill==='type-as-voice').map(c=>c.n),[1,2,3,4,6]);assert.deepEqual(without.filter(c=>c.skill==='reading-order').map(c=>c.n),[1,2,4]);
 // Earlier checks keep their numbers; the new ones continue each skill's numbering.
 for(const c of before)assert.deepEqual(after.find(x=>x.skill===c.skill&&x.n===c.n),c);
 const composition=after.filter(c=>c.skill==='frame-composition');assert.deepEqual(composition.map(c=>c.n),[1,2,3,4,5]);
 assert.equal(composition[3].question,'Do all parts of the frame share one direction of light, one perspective and one scale?');
 assert.deepEqual(new Set(after.map(c=>`${c.skill} ${c.n}`)).size,after.length,'no number twice');
 const ideas=reviewMaterialFor(input(6),staged,'ideas').checks;assert.equal(ideas.length,stageReviewMaterial(staged,'ideas').checks.length+3);
 assert.equal(ideas.find(c=>c.skill==='one-idea'&&c.n===3)?.question,'Can the idea be made from what the brand really has: its supplied files, pictures that can be generated, and code?');
});

const round=(over:Partial<ReviewRound>={}):ReviewRound=>({round:1,accepted:true,rulings:[],notes:[],answers:[{skill:'ad-idea',n:1,ok:true,evidence:'A stranger reads a creative service for ad testing.'}],...over});
test('critic@3: a hedged yes is a no, and a frame the reviewer would not present is not accepted', ()=>{
 const hedged=strictRound(round({answers:[{skill:'ad-idea',n:1,ok:true,evidence:'The headline reads as ad testing; a creative service is implied.'},{skill:'default-look',n:4,ok:true,evidence:'The tiles carry believable bars, though the pills are abstract.'},{skill:'type-as-voice',n:5,ok:true,evidence:'There is no call to action here, so the check is not applicable and passes.'},{skill:'final-check',n:2,ok:true,evidence:'The headline block is the dominant element.'}]}));
 assert.deepEqual(hedged.answers.map(a=>a.ok),[false,false,false,true]);assert.equal(hedged.accepted,false);
 assert.deepEqual(hedged.notes.map(n=>[n.skill,n.check,n.priority]),[['ad-idea',1,'P1'],['default-look',4,'P1'],['type-as-voice',5,'P1']]);
 assert.match(hedged.notes[0].problem,/^The reviewer could not confirm this check without a reservation: The headline reads as ad testing/);
 assert.deepEqual(strictRound(round()),round(),'a plain yes stays');
 // Settling: every check yes but accepted false does not end the review in version 6; in version 5 it did.
 const answer=JSON.stringify({rulings:[],checks:[{s:'ad-idea',n:1,ok:true,e:'A stranger reads a creative service.'}],notes:[],accepted:false,summary:'Every check passes; I would not present it.'});
 assert.equal(settleHeroReview(answer,1,[],0)?.result.stop,'all-pass');assert.equal(settleHeroReview(answer,1,[],0,2,strictRound)?.result.stop,undefined);
 assert.equal(settleHeroReview(answer.replace('"accepted":false','"accepted":true'),1,[],0,2,strictRound)?.result.stop,'all-pass');
});

test('critic@3: the instructions ask for it, and the selection\'s reason carries no advice on building', ()=>{
 for(const part of ['the answer is no','you would present this frame to the client as it is','a fix names no position, no added element, no arrangement and no other idea','what must become true for the viewer'])assert.ok(HERO_REVIEW_INSTRUCTIONS_V3.includes(part),part);
 assert.ok(SELECTION_INSTRUCTIONS_V3.startsWith(SELECTION_INSTRUCTIONS)&&SELECTION_INSTRUCTIONS_V3.includes('It gives no advice on how to build it'));
 assert.ok(!REVIEW_INSTRUCTIONS(HERO_REVIEW_WHAT).includes('present this frame'),'critic@2 is as it was');
 assert.equal(reasonOnly('Idea 1 is the only one that keeps the single real object. It turns the line into one object at the wrong scale. Route to the director: keep the track believable, and make sure the headline holds its size inside the margins.'),'Idea 1 is the only one that keeps the single real object. It turns the line into one object at the wrong scale.');
 assert.equal(reasonOnly('Keep it.'),'Keep it.','never empty');
 assert.equal(chosenIdeaNote({picked:2,texts:['IDEA 1: A box.\n\nIDEA 2: A corridor of shelves.\n\nIDEA 3: A tag.']}),'THE CHOSEN IDEA (as the designer wrote it; the frame is reviewed as this idea)\nA corridor of shelves.');
 assert.equal(chosenIdeaNote(undefined),'');
});

const say=(prose:string,source:string|null,actions?:unknown)=>`${prose}${source?`\n\n\`\`\`tsx Frame.tsx\n${source}\n\`\`\``:''}${actions?`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``:''}`;
async function drive(version:number,answers:string[],reviews:NonNullable<Awaited<ReturnType<NonNullable<DesignerTools['reviewHero']>>>>[],maxTurns=answers.length,builds:boolean[]=[]){
 const dir=await mkdtemp(join(tmpdir(),'q6-')),shot=join(dir,'shot.png'),c=createCanvas(32,32);c.getContext('2d').fillRect(4,4,24,24);await writeFile(shot,c.toBuffer('image/png'));
 const files=new Map<string,string>(),sent:string[]=[],turns:string[][]=[],state=newDesignerState();let asked=0,built=0;
 const tools:DesignerTools={files:async()=>[...files].map(([path,source])=>({path,source})),write:async(p,s)=>{files.set(p,s);},build:async()=>builds[built++]===false?{ok:false as const,issue:'Frame.tsx: an error'}:{ok:true as const},
  render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))}),
  requestImage:async()=>({id:'p',status:'ready' as const}),finish:async()=>({complete:true as const}),reviewHero:async()=>reviews[asked++]};
 await runHeroChat({input:input(version),state,maxTurns,maxPictures:0,timeMs:600000,tools,heroReviews:2,save:async()=>{},call:async message=>{sent.push(message);return answers[sent.length-1]??say('Nothing more.',null,{});},onTurn:async e=>{turns.push(e.results);}});
 return {sent,turns,state,asked:()=>asked};
}
const note={recipient:'director',priority:'P2',view:'hero',problem:'final-check, check 4: The mark is small in a large calm band.',fix:'The mark must read as part of the composition.'};
test('critic@3: a review that ends with points open gives one last turn, with no further review; version 5 ends at once', async()=>{
 const accepted={accepted:true,notes:[note],checks:[],rulings:[],stop:'all-pass' as const,open:[]};
 const answers=[say('The idea.','export default 1;',{review:true}),say('The mark now sits on the headline\'s axis.','export default 2;',{review:true}),say('More.','export default 3;')];
 const v6=await drive(6,answers,[accepted]);
 assert.equal(v6.sent.length,2,'exactly one more turn');assert.equal(v6.asked(),1,'no further review, though the last turn asked for one');
 assert.match(v6.sent[1],/THE REVIEW IS FINISHED\. The hero frame is accepted after this turn; there is no further review\. This is one last turn for what stays open:\n- final-check, check 4: The mark is small in a large calm band\. Wanted: The mark must read as part of the composition\.\nEach note names a problem; the answer is yours\. Solve it inside the chosen idea, which stays\./);
 assert.deepEqual(v6.turns[0].at(-1),'Review finished: 1 point for one last turn.');assert.deepEqual(v6.turns[1].slice(-1),['The hero frame is accepted.']);
 assert.equal(v6.state.hero?.state,'accepted');assert.equal(v6.state.hero?.acceptedBy,'critic');assert.equal(v6.state.hero?.lastTurn,undefined);
 // No points open: accepted at once, as before.
 const clean=await drive(6,answers,[{accepted:true,notes:[],checks:[],rulings:[],stop:'all-pass' as const,open:[]}]);assert.equal(clean.sent.length,1);assert.equal(clean.state.hero?.acceptedBy,'critic');
 // No turn left: accepted at once, the points listed as before.
 const capped=await drive(6,answers,[accepted],1);assert.equal(capped.sent.length,1);assert.equal(capped.state.hero?.state,'accepted');
 // A last turn whose code does not build gets one repair turn, then the frame is accepted whatever it is.
 const broken=await drive(6,[answers[0],answers[1],say('Repaired.','export default 4;'),say('More.','export default 5;')],[accepted],4,[true,false,false]);
 assert.equal(broken.sent.length,3);assert.match(broken.sent[2],/This was the last turn and the code does not build: repair only that/);assert.equal(broken.state.hero?.state,'accepted');
 // Version 5: the review's stop accepts the frame at once.
 const v5=await drive(5,answers,[accepted]);assert.equal(v5.sent.length,1);assert.deepEqual(v5.turns[0].at(-1),'Review finished: all checks passed.');
});
test('critic@3: notes come with the rule to solve them inside the chosen idea; version 5 keeps its sentence', async()=>{
 const open={accepted:false,notes:[{...note,priority:'P1'}],checks:[],rulings:[]};
 const v6=await drive(6,[say('The idea.','export default 1;',{review:true}),say('Fixed.','export default 2;')],[open]);
 assert.match(v6.sent[1],/The reviewer's notes on your hero frame:\n- \[P1\] hero: .*\nEach note names a problem; the answer is yours\. Solve it inside the chosen idea, which stays\. When a note cannot be solved inside the idea, say so and why, and leave the idea as it is\. The frame's main subject and its way of making stay: answer no note by removing the subject or by making the frame another way\.(?: You can get no further picture in this draft\. [^\n]*?)? Then ask for the review again\./);
 const v5=await drive(5,[say('The idea.','export default 1;',{review:true}),say('Fixed.','export default 2;')],[open]);
 assert.match(v5.sent[1],/Apply what you agree with, then ask for the review again\./);assert.ok(!v5.sent[1].includes('inside the chosen idea'));
});

test('brand devices and the advisory mode: the texts keep the owner\'s rules, and the mode is frozen only when asked for', async()=>{
 const {BRAND_DEVICES_REVIEWER,END_REVIEW_INSTRUCTIONS_V3}=await import('../packages/director/quality');const {BRAND_DEVICES_DESIGNER,heroTask}=await import('../packages/director/hero-chat');
 const {buildRunContext,ADVISORY_CRITIC}=await import('../packages/agents/run-context');const {DEFAULT_MATERIAL_BUDGET}=await import('../packages/agents/materials');
 for(const text of [BRAND_DEVICES_DESIGNER,BRAND_DEVICES_REVIEWER])assert.deepEqual(checkSkillDraft({title:'t',purpose:'p',stages:['critic'],principles:text,checks:[],signs:''}).errors,[]);
 assert.ok(HERO_REVIEW_INSTRUCTIONS_V3.includes(BRAND_DEVICES_REVIEWER)&&SELECTION_INSTRUCTIONS_V3.includes(BRAND_DEVICES_REVIEWER)&&END_REVIEW_INSTRUCTIONS_V3.includes(BRAND_DEVICES_REVIEWER));
 assert.ok(END_REVIEW_INSTRUCTIONS_V3.startsWith(REVIEW_INSTRUCTIONS('These are the finished scenes and formats of the draft: judge whether the idea holds in every view, then craft.')));
 assert.ok(heroTask(input(6)).includes(BRAND_DEVICES_DESIGNER)&&!heroTask(input(5)).includes('OWN DEVICES'));
 const ctx=(over:Record<string,unknown>)=>buildRunContext({briefText:'{}',brandPack:'BRAND CHARACTER\nCalm.',packVersion:1,materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},planningChat:true,schemaInText:true,critic:true,...over});
 assert.equal(ctx({advisoryCritic:true}).criticMode,ADVISORY_CRITIC);assert.equal(ctx({}).criticMode,undefined);assert.equal(ctx({advisoryCritic:true}).sha256,ctx({}).sha256,'the prefix is the same');
});

test('version 6: the ideas differ in kind; the kit\'s other marks reach the designer as drawable, once each', async()=>{
 const {IDEAS_TASK,IDEAS_TASK_V6,IDEAS_RANGE,IDEAS_SUBJECT,IDEAS_WIDE,ideasTaskFor}=await import('../packages/director/image-ideas');const {referenceFactLines}=await import('../apps/local-runner/director/logo-facts');const {mkdir}=await import('node:fs/promises');
 assert.equal(ideasTaskFor(input(5)),IDEAS_TASK);assert.equal(ideasTaskFor(input(6)),IDEAS_TASK_V6);assert.ok(IDEAS_TASK_V6.includes(`2. Push each one to be bolder and more distinct from the others. ${IDEAS_RANGE} ${IDEAS_SUBJECT}`)&&IDEAS_TASK_V6.includes(IDEAS_WIDE));
 assert.deepEqual(checkSkillDraft({title:'t',purpose:'p',stages:['ideas'],principles:IDEAS_RANGE,checks:[],signs:''}).errors,[]);
 // A brand whose kit holds a shaded version of its mark beside the flat logos: it is listed once, with its url.
 const folder=await mkdtemp(join(tmpdir(),'marks-'));await mkdir(join(folder,'public'));
 const shaded=(()=>{const c=createCanvas(280,100),x=c.getContext('2d');for(let i=0;i<7;i++){x.fillStyle=`rgb(${250-i*22},${130-i*12},${20+i*6})`;x.fillRect(20+i*34,20,34,60);}return c.toBuffer('image/png');})();
 const flat=(()=>{const c=createCanvas(280,100),x=c.getContext('2d');x.fillStyle='#0C2B3F';x.fillRect(20,20,240,60);return c.toBuffer('image/png');})();
 await writeFile(join(folder,'public','ring.png'),shaded);await writeFile(join(folder,'public','lockup.png'),flat);await writeFile(join(folder,'public','lockup2.png'),flat);await writeFile(join(folder,'public','main.png'),flat);
 const brand={brand:{logos:[{id:'l0',url:'main.png',clearSpacePx:0}],references:[{id:'r1',url:'ring.png'},{id:'r2',url:'lockup.png'},{id:'r3',url:'lockup2.png'},{id:'r4',url:'main.png'}],rawKit:{materials:[{id:'r1',role:'logo'},{id:'r2',role:'logo'},{id:'r3',role:'logo'}]}}} as never;
 const lines=await referenceFactLines(folder,brand,[{name:'mark-gloss',kind:'logo',materialId:'r1'},{name:'lockup-navy',kind:'logo',materialId:'r2'},{name:'lockup-navy-2',kind:'logo',materialId:'r3'},{name:'main',kind:'logo',materialId:'r4'}]);
 assert.equal(lines.length,2,'the same drawing in a second file and the logo already in code are not repeated');
 assert.match(lines[0],/^mark-gloss · a mark of the brand · drawing #[0-9A-F]{6} \((mid|light|dark)\), \d colours \(shaded, not flat\) · transparent ground · 2\.8:1 wide · reads on .* · url 'ring\.png' · use it$/);
 assert.match(lines[1],/^lockup-navy · a mark of the brand · drawing #0C2B3F \(dark\) · transparent ground · 2\.8:1 wide · reads on light grounds · url 'lockup\.png' · use it$/);
});
