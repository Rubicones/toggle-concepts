// Rehearsal of one version 5 direction (scripts/bench/v5-direction.ts) on the bench brand that mirrors the live run of
// 2026-11-14: one photographed object, type in code. The fake CLI answers from a script; build and render are stubbed
// (no browser in tests), everything else is the production code. No model is called.
// V5_REHEARSAL_OUT=<folder> keeps the assembled requests for reading.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {brands,benchInputV5,benchBrandPack} from '../scripts/bench/brands';
import {runV5Direction,benchRunContext,type V5Options} from '../scripts/bench/v5-direction';
import {createCanvas} from '@napi-rs/canvas';
import {fakeSetup} from './local-chat-shaped.test';
import type {DesignerTools} from '../apps/local-runner/director/designer-loop';

const brand=brands.find(b=>b.id==='ostrava')!,input=()=>benchInputV5(brand);
const say=(prose:string,source:string|null,actions?:unknown)=>`${prose}${source?`\n\n\`\`\`tsx Frame.tsx\n${source}\n\`\`\``:''}${actions?`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``:''}`;
const IDEAS='IDEA 1: One sealed archive box, photographed in soft daylight, the label facing us. Way of making: a photograph, type in code.\n\nIDEA 2: A corridor of shelves receding. Way of making: a photograph.\n\nIDEA 3: A brass tag, very close. Way of making: a photograph.';
const review=(accepted:boolean)=>JSON.stringify({rulings:[],checks:[{s:'final-check',n:1,ok:accepted,e:'The box is the dominant element.'}],notes:accepted?[]:[{s:'stopping-power',n:1,priority:'P1',view:'square',problem:'The box is small.',fix:'Let the box fill two thirds of the frame.',replaces:''}],accepted,summary:'Rehearsal.'});
/** Build and render without a browser: a small real picture stands for each rendered view. */
const stubbed=(shot:string)=>(real:DesignerTools):DesignerTools=>({...real,files:async()=>[{path:'Frame.tsx',source:'x'}],write:async()=>{},build:async()=>({ok:true as const}),requestImage:async()=>({id:'picture-1',status:'ready' as const}),finish:async()=>({complete:true as const}),
 render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:shot}))})});
async function rehearse(name:string,script:unknown[],over:Partial<V5Options>={}){
 const out=process.env.V5_REHEARSAL_OUT?resolve(process.env.V5_REHEARSAL_OUT,name):await mkdtemp(join(tmpdir(),'v5-'));await mkdir(join(out,'records'),{recursive:true});process.env.TOGGLE_HOME=join(out,'home');
 const file=join(out,'script.json');await writeFile(file,JSON.stringify(script));
 const shot=join(out,'shot.png'),canvas=createCanvas(64,64);canvas.getContext('2d').fillRect(8,8,48,48);await writeFile(shot,canvas.toBuffer('image/png'));
 const setup=await fakeSetup('script',{FAKE_CLAUDE_SCRIPT:file,FAKE_CLAUDE_RECORD_DIR:join(out,'records'),FAKE_CLAUDE_MODEL:'claude-opus-5-5'},{sonnet:'claude-sonnet-5-5',isolation:{safeMode:true,restricted:true,noSessionPersistence:false,disableSlashCommands:true}});
 const result=await runV5Direction({input:input(),folder:out,out,setup,brandPack:benchBrandPack(brand),buy:async()=>undefined,catalog:[],recordRequests:true,tools:stubbed(shot),maxTurns:10,...over});
 const records=await Promise.all((await readdir(join(out,'records'))).sort().map(async f=>JSON.parse(await readFile(join(out,'records',f),'utf8')) as {args:string[];system:string;content:{type:string;text?:string}[];resumed:string|null}));
 return {result,records,text:(i:number)=>records[i].content.map(c=>c.text??'[image]').join('\n\n')};
}
const critics=[{match:'Choose one of the three ideas',text:JSON.stringify({ideas:[{idea:1,passes:true,why:'In the territory.'},{idea:2,passes:false,why:'Not one object.'},{idea:3,passes:true,why:'Close.'}],pick:1,reason:'One box, as the direction asks.'})},{match:'Review this hero frame',text:review(true)},{match:'Review these rendered views',text:review(true)}];
const scenes=()=>input().storyboard.map((_,n)=>({scene:`Scene ${n+1}`,moment:'The box, sealed.'}));

test('v5 rehearsal: ideas, selection, build in the same conversation, hero review, stage E and the end review, in order', async()=>{
 const {result,records,text}=await rehearse('reviewed',[IDEAS,say('Building idea 1: the photograph of the box.','export default 1;',{pictures:[{purpose:'the sealed archive box',prompt:'One sealed archive box in soft daylight on warm paper white.',aspect:'1:1'}],render:true}),say('Finished.','export default 2;',{review:true}),say('The other scenes.','export default 3;',{finish:{intent:'x'.repeat(90),scenes:scenes()}}),...critics]);
 assert.deepEqual(result.calls.map(c=>`${c.role}/${c.stage}`),['designer/design-hero','critic/critic','designer/design-hero','designer/design-hero','critic/critic','designer/design-create','critic/critic'],'every stage transition');
 assert.deepEqual(result.calls.filter(c=>c.role==='designer').map(c=>c.conversation),['new','branched','branched','branched'],'one conversation: the build continues the ideas turn');
 // The models and efforts of the live run: the designer on Opus at high effort, the critic on the run's Sonnet.
 const model=(i:number)=>records[i].args[records[i].args.indexOf('--model')+1],effort=(i:number)=>records[i].args[records[i].args.indexOf('--effort')+1];
 assert.deepEqual([model(0),effort(0),model(1),effort(1)],['claude-opus-5-5','high','claude-sonnet-5-5','medium']);
 // What the designer reads first: the brand pack, its role line, the hero stage's skills, the territory whole, the task.
 const first=text(0);assert.match(records[0].system,/BRAND PACK \(the accepted brand, fixed for this run\)\nBRAND CHARACTER\nTemperament: discreet/);
 for(const part of ['ROLE: The designer of this ad.','SKILLS FOR THIS STAGE (the hero frame)','THE TERRITORY OF THIS DIRECTION (whole;','Way of making: One photograph of one real archive box','THE HERO FRAME','THREE IMAGE IDEAS','SKILLS FOR THIS STAGE (ideas and planning)'])assert.ok(first.includes(part),part);
 assert.ok(!/Signs of failure|THE CHECKS/.test(first),'no checks or signs for the designer');
 // The selection: the ideas, the ideas checks and what the direction asked for; no pictures.
 const selection=text(1);for(const part of ['THE THREE IDEAS\nIDEA 1: One sealed archive box','WHAT THE DIRECTION ASKED FOR','THE CHECKS (answer each by skill and number)\n- ad-idea 1:'])assert.ok(selection.includes(part),part);
 // The build turn continues the conversation and carries only the choice with the idea's own text.
 assert.ok(records[2].resumed,'resumed');assert.match(text(2),/THE CHOSEN IDEA: IDEA 1\. Why: One box, as the direction asks\.\n\nIDEA 1, AS YOU WROTE IT\nOne sealed archive box/);assert.ok(!text(2).includes('THE HERO FRAME\nMake Scene'),'the task is not sent twice');
 // The hero review: the hero checks, the signs, the direction's way of making.
 const hero=text(4);for(const part of ['WHAT THE DIRECTION ASKED FOR','THE CHECKS (answer each by skill and number)','SIGNS OF FAILURE','default-look 1:'])assert.ok(hero.includes(part),part);assert.ok(!hero.includes('layout-craft 1:'),'no end-of-draft checks in the hero review');
 assert.match(text(5),/THE HERO FRAME IS ACCEPTED\./);assert.ok(text(6).includes('layout-craft 1:'),'the end review has the extension checks');
 assert.equal(result.state.pictures,1,'the picture was asked for');assert.equal(result.state.hero?.acceptedBy,'critic');assert.equal(result.state.complete,true);
 assert.deepEqual(result.gaps,[]);assert.equal(result.status,'Source checks complete. Ready for your review.');
 assert.ok(result.timeline.some(l=>l==='Chosen: idea 1 — One box, as the direction asks.')&&result.timeline.some(l=>l==='The creative review accepted the current views.'));
 assert.ok(result.apiEquivalentUsd>0&&result.apiEquivalentUsd<1,'priced per request, not as a running total');
 assert.equal(benchRunContext(input(),benchBrandPack(brand)).stageSkills?.version,'stage-skills@2');
});

test('v5 rehearsal: without a working critic the draft says what was not reviewed, and never "ready"', async()=>{
 const {result}=await rehearse('unreviewed',[IDEAS,say('Building.','export default 1;',{review:true}),say('Done.',null,{finish:{intent:'x'.repeat(90),scenes:scenes()}})],{criticFails:'AGENT_MODEL_UNSUITABLE'});
 assert.equal(result.state.ideas?.unreviewed,'AGENT_MODEL_UNSUITABLE');assert.equal(result.state.hero?.acceptedBy,'review-failed');assert.equal(result.gaps.length,3);
 assert.equal(result.status,'Source checks complete. No automatic review ran; look closely yourself.');
 for(const line of ['The three ideas were NOT reviewed: the review role has no suitable model; check “Creative review” in Models & agents. The first idea is built.','The hero frame was NOT reviewed: the review role has no suitable model; check “Creative review” in Models & agents. It is accepted as it is.'])assert.ok(result.timeline.includes(line),line);
 assert.ok(result.timeline.at(-1)!.startsWith('Built, but NOT REVIEWED. '));
});

test('v5 rehearsal: the block\'s limits hold on the bench: the turn cap and the critic\'s five requests', async()=>{
 const {result}=await rehearse('limits',[IDEAS,say('Again.','export default 1;',{render:true}),...critics.slice(0,1),{match:'Review this hero frame',text:review(false)}],{maxTurns:6,endReview:false});
 assert.equal(result.state.turn,6,'stops at the approved turns');assert.equal(result.state.complete,false);assert.ok(result.calls.filter(c=>c.role==='critic').length<=5);
 assert.ok(result.timeline.includes('The designer used its approved turns or time before finishing. The draft is shown as it is; continue within a new allowance to finish it.'));
});

test('v6 rehearsal (plan E1): stage H requests hold one scene\'s meaning and one format; the rest arrives when stage E opens', async()=>{
 const base=input(),v6={...base,brief:{...base.brief,designerVersion:6}} as ReturnType<typeof input>,heroViews:boolean[][]=[];
 const shotFile=join(await mkdtemp(join(tmpdir(),'v6-shot-')),'shot.png'),canvas=createCanvas(64,64);canvas.getContext('2d').fillRect(8,8,48,48);await writeFile(shotFile,canvas.toBuffer('image/png'));
 const tools=(real:DesignerTools):DesignerTools=>{const s=stubbed(shotFile)(real);return {...s,render:async views=>{heroViews.push(views.map(v=>!!v.shot));return s.render(views);}};};
 const {result,text}=await rehearse('v6',[IDEAS,say('Building idea 1: the photograph of the box.','export default 1;',{pictures:[{purpose:'the sealed archive box',prompt:'One sealed archive box in soft daylight on warm paper white.',aspect:'1:1'}],render:true}),say('Finished.','export default 2;',{review:true}),say('The other scenes.','export default 3;',{finish:{intent:'x'.repeat(90),scenes:scenes()}}),...critics],{input:v6,tools,endReview:false});
 const designer=result.calls.map((c,i)=>({c,i})).filter(x=>x.c.role==='designer'),stageH=designer.filter(x=>x.c.stage==='design-hero').map(x=>text(x.i)),stageE=designer.filter(x=>x.c.stage==='design-create').map(x=>text(x.i));
 assert.equal(stageH.length,3);assert.ok(stageE.length>=1);
 // Stage H: no other format, no variation list, no selected(, no "Shows:" line; the task carries meaning and words.
 for(const request of stageH){
  for(const f of v6.formats.filter(x=>x.id!==v6.variants[0].format))assert.ok(!request.includes(`${f.width}×${f.height}`),`${f.id} in stage H`);
  for(const gone of ['VARIATIONS','selected(','Shows:','Hooks:','REFERENCE COPY'])assert.ok(!request.includes(gone),gone);
 }
 for(const part of ['THE HERO SCENE (Scene 1 of 3; the only scene you make now)','THE HERO FRAME\nMake Scene 1 of 3 as one finished frame in 1080×1080. ','What it must make the viewer understand: The file a partner needs today and nobody can find.','Its approved words (en-GB), exactly as written, nothing added: "The file is somewhere." / "That is not an answer."','You may ask for up to ','THE TERRITORY OF THIS DIRECTION (whole;'])assert.ok(stageH[0].includes(part),part);
 // The hero render measures the reference words only.
 assert.ok(heroViews.length>=1&&heroViews[0].every(Boolean)&&heroViews[0].length===1,'one view: the reference copy in the reference format');
 // Stage E opens with what was left out, once, in the same conversation.
 assert.ok(stageE[0].includes('THE REST OF THE AD (left out while you made the hero frame)')&&stageE[0].includes('vertical · 1080×1920')&&stageE[0].includes('VARIATIONS (all read through selected(props,…) in code)')&&stageE[0].includes('COPY TABLE'));
 assert.deepEqual(designer.map(x=>x.c.conversation),['new','branched','branched','branched'],'one conversation from the ideas to stage E');
 assert.ok(result.timeline.some(l=>l.startsWith('Hero frame started. Key frame brief: what this scene must say. The file a partner needs today')));
 assert.equal(result.state.hero?.acceptedBy,'critic');assert.equal(result.state.complete,true);
});
