// Fixes after the live run of 2026-11-14 (docs/reviews/2026-11-14-live-run-fixes.md). Each test is built from that
// run's export: its numbers and codes as an anonymised fixture, its behaviour replayed with recorded answers. No
// model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {localModelFor} from '../packages/agents/local-models';
import {localCallUsage,usageTotals,tokenPricedUsd} from '../packages/agents/local-usage';
import {readJsonAnswer,jsonProblem,repairText} from '../packages/agents/schema-in-text';
import {leanCampaignContext,LEAN_CONTEXT_VERSION} from '../packages/agents/planning-chat';
import {buildRunContext} from '../packages/agents/run-context';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {chosenMessage,ideaText,selectionContext,wayOfMakingNote} from '../packages/director/image-ideas';
import {reviewGaps,unreviewedStatus,reviewReason} from '../packages/director/review-gaps';
import {readLiveOptions} from '../packages/director/live-options.local';
import {heroTask} from '../packages/director/hero-chat';
import {territoryOf,territoryText,designerDigestText} from '../packages/director/designer-digest';
import {ideaReviewLines} from '../packages/contracts/idea-review';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {newDesignerState,plainBuildIssue,buildStuck,BUILD_ISSUE_HELP,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../packages/director/types';

type Step={n:number;role:string;status:string;error:string|null;targetModel:string;local?:{executedModel:string;numTurns:number;conversation:{kind:string}|null;apiEquivalentUsd:number;usage:Record<string,unknown>};pricing?:Record<string,number>};
const run=JSON.parse(readFileSync('tests/fixtures/live-run-2026-11-14.json','utf8')) as {criticModel:string;shownUsd:number;steps:Step[];designerToolNotes:string[];hero:{state:string;reviews:number};designerTurns:number;pictures:number;maxStills:number;campaignContextChars:Record<string,number>;visualDirection:{answerChars:number}};
const input=(version=5)=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:version,materialsVersion:1,digestVersion:1};return i;};
const say=(prose:string,source:string|null,actions?:unknown)=>`${prose}${source?`\n\n\`\`\`tsx Frame.tsx\n${source}\n\`\`\``:''}${actions?`\n\n\`\`\`actions\n${JSON.stringify(actions)}\n\`\`\``:''}`;
const tools=(over:Partial<DesignerTools>={}):DesignerTools=>({files:async()=>[{path:'Frame.tsx',source:'x'}],write:async()=>{},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),
 render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:'/dev/null'}))}),...over});
const IDEAS='Rough thoughts first.\n\nIDEA 1: One photographed wall switch whose track runs out of the frame. Way of making: a photograph.\n\nIDEA 2: A wall of small switches drawn in code.\n\nIDEA 3: A hand on a dimmer, rendered in 3D.';

test('A: a review role whose model has no Local mapping runs on the run\'s Sonnet; every critic request of the run failed on this', ()=>{
 const critics=run.steps.filter(s=>s.role==='critic');assert.equal(critics.length,5,'three planning reviews, the selection and the end review');
 assert.ok(critics.every(s=>s.status==='failed'&&s.error==='LOCAL_MODEL_MAPPING_REQUIRED'&&s.targetModel===run.criticModel));
 assert.deepEqual(localModelFor(run.criticModel,{sonnet:'claude-sonnet-5-5'}),{target:run.criticModel,execution:'claude-sonnet-5-5',rule:'other-text-to-sonnet',version:'local-models@1'});
 assert.throws(()=>localModelFor('google/gemini-2.5-flash-image',{sonnet:'claude-sonnet-5-5'}),/LOCAL_MODEL_MAPPING_REQUIRED/,'a picture model is never a text role');
});

test('B: what was not reviewed is said in plain words on the draft; the run\'s state gives three lines, a reviewed run none', ()=>{
 const gaps=reviewGaps({expects:{ideas:true,hero:true,end:true},ideas:{picked:1,unreviewed:'LOCAL_MODEL_MAPPING_REQUIRED'},hero:run.hero,end:{criticRounds:0,skipped:'LOCAL_MODEL_MAPPING_REQUIRED'}});
 assert.equal(gaps.length,3);assert.match(gaps[0],/The choice between the three ideas was not reviewed \(the review role's model cannot run in Local mode/);
 assert.equal(gaps[1],'The hero frame was never finished or reviewed.');assert.match(gaps[2],/^The finished draft was not reviewed/);
 assert.match(unreviewedStatus(gaps),/^Built, but NOT REVIEWED\. /);assert.equal(unreviewedStatus([]),'');
 assert.deepEqual(reviewGaps({expects:{ideas:true,hero:true,end:true},ideas:{picked:2},hero:{state:'accepted',acceptedBy:'critic',reviews:2},end:{criticRounds:1}}),[]);
 assert.match(reviewGaps({expects:{ideas:false,hero:true,end:true},hero:{state:'accepted',acceptedBy:'review-failed',reviews:1,reviewError:'AGENT_MODEL_UNSUITABLE'},end:{criticRounds:1}})[0],/no suitable model/);
 assert.match(reviewGaps({expects:{ideas:false,hero:true,end:false},hero:{state:'accepted',acceptedBy:'no-critic',reviews:0}})[0],/approved without a creative review/);
 assert.match(reviewReason('SOMETHING_ELSE'),/it stopped with SOMETHING_ELSE/);
 const panel=readFileSync('components/studio/live-draft-generator.tsx','utf8');assert.match(panel,/preview\.reviewGaps\?\.length\?"Source checks complete\. No automatic review ran; look closely yourself\."/);assert.match(panel,/<strong>Built, but not reviewed\.<\/strong>/);
 const worker=readFileSync('apps/local-runner/director/worker.ts','utf8');assert.match(worker,/design\.reviewGaps=gaps;await events\.emit\(`review:gaps:/);assert.match(worker,/The hero frame was NOT reviewed: /);assert.match(worker,/The three ideas were NOT reviewed: /);
 const lines=ideaReviewLines({version:2,gates:{strategy:{status:'skipped',reason:'x'}}});assert.match(lines[0]?.status??'',/NOT REVIEWED/,'planning reviews too');
});

test('C: the ideas turn and the build are one conversation, and the chosen idea\'s text is quoted in any case', async()=>{
 const i=input(),state=newDesignerState(),sent:string[]=[],conversation:string[]=[];let stored=false;
 await runHeroChat({input:i,state,maxTurns:3,maxPictures:4,timeMs:600000,heroReviews:0,save:async()=>{},tools:tools(),
  conversation:{decide:async()=>{conversation.push(stored?'continue':'new');return stored;},accept:async()=>{stored=true;conversation.push('accept');}},
  ideas:{task:'THREE IDEAS',select:async()=>({pick:1,reason:'It is the territory.',notes:[]})},
  call:async message=>{sent.push(message);return sent.length===1?IDEAS:say('Building idea 1.','export default 1;',{review:true});}});
 assert.deepEqual(conversation.slice(0,4),['new','accept','continue','accept'],'the ideas turn is saved; the build continues it (the live run started a second new conversation)');
 assert.match(sent[1],/^THE CHOSEN IDEA: IDEA 1\. Why: It is the territory\.\n\nIDEA 1, AS YOU WROTE IT\nOne photographed wall switch whose track runs out of the frame\. Way of making: a photograph\./);
 assert.ok(!sent[1].includes('A wall of small switches'),'only the chosen idea');assert.ok(!sent[1].startsWith('THE HERO FRAME'),'a continued conversation is not sent the task again');
 assert.equal(ideaText(IDEAS,2),'A wall of small switches drawn in code.');assert.equal(ideaText('no markers at all',2),'no markers at all','unreadable sections: the whole answer');
 assert.match(chosenMessage(1,'The selection could not run, so the first idea is built.','fallback',IDEAS),/IDEA 1, AS YOU WROTE IT\nOne photographed/);
 assert.match(chosenMessage(1,'r','reviewer',IDEAS),/If you change the way of making, say so and why in your first sentence\.$/);
 // A selection that cannot run: recorded with its reason.
 const s2=newDesignerState();await runHeroChat({input:i,state:s2,maxTurns:2,maxPictures:0,timeMs:600000,heroReviews:0,save:async()=>{},tools:tools(),ideas:{task:'T',select:async()=>{throw new Error('LOCAL_MODEL_MAPPING_REQUIRED');}},call:async(m:string)=>/THREE|^THE HERO FRAME[\s\S]*\nT$/.test(m)&&!m.startsWith('THE CHOSEN')?IDEAS:say('Build.','export default 1;',{review:true})});
 assert.equal(s2.ideas?.picked,1);assert.equal(s2.ideas?.unreviewed,'LOCAL_MODEL_MAPPING_REQUIRED');
});

test('D: previewOptions never stops a chat designer, and every build error names what to change', ()=>{
 assert.equal(run.designerToolNotes.slice(0,11).filter(c=>c.startsWith('PREVIEW_OPTIONS_')||c==='UNISSUED_PREVIEW_OPTION').length,11,'eleven turns of the live run were spent on previewOptions');
 const i=input(5),v=i.variants[0],frame=(options:string)=>`export const previewOptions=${options};\nexport default function Frame(){return null;}`;
 for(const broken of ['{hooks:["primary"]}','{hooks:pick(),ctas:[],locales:[],lengths:[],scenes:[],adaptive:false}','{hooks:["invented"],ctas:["x"],locales:["xx"],lengths:[99],scenes:["nope"],adaptive:false}']){
  const read=readLiveOptions(frame(broken),i);assert.equal(read.legacy,false);assert.ok(read.fallback,'the app\'s own list was used');
  assert.deepEqual(read.options.scenes,i.storyboard.map(s=>s.id));assert.ok(read.options.hooks.includes(v.hook)&&read.options.locales.includes(v.locale));}
 assert.throws(()=>readLiveOptions(frame('{hooks:["primary"]}'),input(3)),/PREVIEW_OPTIONS_FIELDS_REQUIRED/,'earlier pipelines keep the strict reader');
 assert.match(heroTask(i),/Do not write a previewOptions export for this frame: the app lists the variations itself\./);
 for(const code of new Set(run.designerToolNotes.filter(c=>/^[A-Z_]+$/.test(c)))){const plain=plainBuildIssue(code);assert.ok(plain.length>80&&!plain.startsWith(code),`${code}: says what to write`);}
 assert.match(plainBuildIssue('PREVIEW_OPTIONS_FIELDS_REQUIRED'),/export const previewOptions=\{hooks:\[…\],ctas:\[…\],locales:\[…\],lengths:\[…\],scenes:\[…\],adaptive:false\}/);
 assert.match(plainBuildIssue('SOME_UNKNOWN_CODE'),/has no further detail\. Check the last change/);assert.equal(plainBuildIssue("Frame.tsx(3,1): TS2304 Cannot find name 'x'."),"Frame.tsx(3,1): TS2304 Cannot find name 'x'.",'a compiler message already names the place');
 for(const [code,help] of Object.entries(BUILD_ISSUE_HELP))assert.ok(help.length>40&&!/technical detail/i.test(help),code);
});

test('E: the same build error three times stops with a question; stage E never opens on a hero that never rendered', async()=>{
 const state:{buildStuck?:{code:string;count:number}}={};
 assert.equal(buildStuck(state,'PREVIEW_OPTIONS_FIELDS_REQUIRED'),null);assert.equal(buildStuck(state,'PREVIEW_OPTIONS_FIELDS_REQUIRED'),null);assert.match(buildStuck(state,'PREVIEW_OPTIONS_FIELDS_REQUIRED')!,/previewOptions is missing fields/);
 assert.equal(state.buildStuck,undefined,'a retry gets three more attempts');assert.equal(buildStuck(state,'A_FIRST_ERROR'),null);assert.equal(buildStuck(state,'ANOTHER_ERROR_X'),null);assert.equal((state as {buildStuck?:{count:number}}).buildStuck?.count,1,'a different error starts again');assert.equal(buildStuck(state,null),null);
 const i=input(4),stuck=newDesignerState(),calls:string[]=[];
 await assert.rejects(runHeroChat({input:i,state:stuck,maxTurns:12,maxPictures:0,timeMs:600000,heroReviews:0,save:async()=>{},tools:tools({build:async()=>({ok:false as const,issue:'SOME_REPEATED_ERROR'})}),call:async m=>{calls.push(m);return say('Again.','export default 1;');}}),
  (e:Error&{detail?:string})=>e.message==='DESIGNER_BUILD_STUCK'&&/three times in a row/.test(e.detail??''));
 assert.equal(calls.length,3,'three turns, not twelve');
 // Different errors each turn until the turns are used: no render ever, so no stage E.
 let n=0;const never=newDesignerState();
 await assert.rejects(runHeroChat({input:i,state:never,maxTurns:4,maxPictures:0,timeMs:600000,heroReviews:0,save:async()=>{},tools:tools({build:async()=>({ok:false as const,issue:`ERROR_NUMBER_${'ABCDEFGH'[n++]}`})}),call:async()=>say('Try.','export default 1;')}),/HERO_FRAME_NOT_RENDERED/);
 assert.equal(never.hero?.state,'designing');assert.equal(never.heroExtraTurns,4,'a retry has turns to work with');
 const worker=readFileSync('apps/local-runner/director/worker.ts','utf8');assert.match(worker,/HERO_TURN_SHARE\)\+\(loop\.heroExtraTurns\?\?0\)/);
 // A rendered hero never sent for review is reviewed once at the cap, so the critic saw what stage E builds on.
 const seen:string[]=[],unasked=newDesignerState();let reviews=0;
 await runHeroChat({input:i,state:unasked,maxTurns:2,maxPictures:0,timeMs:600000,heroReviews:2,save:async()=>{},onHero:async e=>{seen.push(`${e.kind}:${e.by??''}`);},tools:tools({reviewHero:async()=>{reviews++;return {accepted:false,notes:[{recipient:'director' as const,priority:'P1' as const,view:'square',problem:'The frame is drawn in code.',fix:'Use the photograph the direction asks for.'}]};}}),call:async()=>say('Idea.','export default 1;')});
 assert.equal(reviews,1);assert.deepEqual(seen.filter(s=>s.startsWith('accepted')),['accepted:reviews-used']);assert.match(unasked.heroNote??'',/The reviewer's notes on your hero frame[\s\S]*Use the photograph/);
});

test('F: an answer that only lacks its last closing brace is completed, not rerun; a repair message names the problem', ()=>{
 // The shape of the rejected visual direction answer: about 9,000 characters, one closing brace short.
 const answer={requestMaterials:[],answer:{schemaVersion:'1.0',role:'visual-direction',status:'draft',summary:'s'.repeat(300),deliverable:{concept:'c'.repeat(1500),treatments:[{conceptId:'concept-1',name:'n',visualIdea:'v'.repeat(900),twoSeconds:'t'.repeat(400),productRole:'p'.repeat(300),makingTechnique:'m'.repeat(600),success:'x'.repeat(300)}]},inputRefs:[],assumptions:['a'.repeat(2000)],blockingQuestions:[],warnings:[],handoff:{nextRole:null,requiredInputs:[],checks:['k'.repeat(2500),'ok"]}} inside a string stays text']}}};
 const whole=JSON.stringify(answer),cut=whole.slice(0,-1);assert.ok(Math.abs(cut.length-run.visualDirection.answerChars)<600);
 assert.throws(()=>JSON.parse(cut));
 assert.equal(jsonProblem(cut),'the JSON is not closed: 1 closing bracket missing at the end (})');
 assert.deepEqual(readJsonAnswer(cut),{value:answer,completed:true});assert.deepEqual(readJsonAnswer(whole),{value:answer});
 assert.deepEqual(readJsonAnswer(whole.slice(0,-4)),{value:answer,completed:true},'several closers');
 assert.deepEqual(readJsonAnswer(whole.slice(0,4000)),{error:'INCOMPLETE_JSON'},'a cut inside the content is never guessed');assert.equal(jsonProblem(whole.slice(0,4000)),'the JSON stops inside a text value: it was cut off');
 assert.match(repairText([`answer: ${jsonProblem(cut)}`]),/- answer: the JSON is not closed: 1 closing bracket missing at the end \(\}\)/);
 const transport=readFileSync('apps/local-runner/local-claude/transport.ts','utf8');assert.match(transport,/for\(let turn=0;turn<2&&'issues' in c&&r\.init\?\.sessionId;turn\+\+\)/,'two repair turns in the same conversation before the workflow reruns anything');
 const failed=run.steps.filter(s=>s.role==='visual-direction'&&s.error==='INVALID_OUTPUT_SCHEMA');assert.equal(failed.length,2);
});

test('G: each request is priced from its own tokens; the CLI\'s figure is the conversation\'s running total', ()=>{
 const rows=run.steps.filter(s=>s.local).map(s=>({role:s.role,usage:{_local:s.local},config_snapshot:{pricing:s.pricing}}));
 const cli=run.steps.reduce((n,s)=>n+(s.local?.apiEquivalentUsd??0),0);assert.ok(Math.abs(cli-run.shownUsd)<0.01,'what the studio showed: the sum of running totals');
 const designers=run.steps.filter(s=>s.role==='designer'&&s.local).map(s=>s.local!.apiEquivalentUsd);assert.ok(designers.slice(2).every((v,k,a)=>k===0||v>a[k-1]),'the designer\'s figures only grow');
 const calls=rows.map(r=>localCallUsage(r)!),total=usageTotals(calls).apiEquivalentUsd;
 assert.ok(total>5&&total<8,`about a quarter of what was shown: ${total.toFixed(2)}`);assert.ok(total<run.shownUsd/3.5);
 // The last designer turn: 144k read from the cache, 2k written, 642 out.
 const last=run.steps.filter(s=>s.role==='designer').at(-1)!,own=localCallUsage({role:'designer',usage:{_local:last.local},config_snapshot:{pricing:last.pricing}})!.apiEquivalentUsd!;
 assert.ok(Math.abs(last.local!.apiEquivalentUsd-2.9243792)<1e-6);assert.ok(own>0.04&&own<0.07,`its own price: ${own}`);
 assert.ok(Math.abs(tokenPricedUsd({input_tokens:0,cache_creation_input_tokens:1000,cache_read_input_tokens:10000,output_tokens:100,cache_creation:{ephemeral_1h_input_tokens:1000}},{inputPrice:4e-6,outputPrice:2e-5,cacheReadPrice:2e-7})!-(0.008+0.002+0.002))<1e-9,'a one-hour cache write costs twice the input price');
 // A conversation's first single-call request keeps the CLI's own figure.
 const first=run.steps.find(s=>s.role==='research')!;assert.equal(localCallUsage({role:'research',usage:{_local:first.local},config_snapshot:{pricing:first.pricing}})!.apiEquivalentUsd,first.local!.apiEquivalentUsd);
 // The visual direction's two failed attempts: about a quarter of the real cost.
 const vd=rows.filter(r=>r.role==='visual-direction').map(r=>localCallUsage(r)!.apiEquivalentUsd!);assert.ok((vd[0]+vd[1])/total>0.2&&(vd[0]+vd[1])/total<0.3);
});

test('H: cold planning roles are not sent the brief again, and research is not sent the variation table', ()=>{
 const chars=run.campaignContextChars;assert.ok(chars.submittedBrief>17000&&chars.variantManifest>17000&&chars.acceptedBrandKit>50000);
 const context=Object.fromEntries(Object.entries(chars).map(([k,n])=>[k,'x'.repeat(n)])),size=(v:unknown)=>JSON.stringify(v).length;
 const research=leanCampaignContext(context,'research') as Record<string,string>,variants=leanCampaignContext(context,'variants') as Record<string,string>;
 assert.match(research.submittedBrief,/The brief is in the run context above/);assert.match(research.variantManifest,/Not sent to this role/);assert.equal(variants.variantManifest,context.variantManifest,'variants audits the table');
 assert.equal(research.scope,context.scope);assert.equal(research.checkpointId,context.checkpointId);
 assert.ok(size(context)-size(research)>35000&&size(context)-size(variants)>17000);assert.equal(size(context),size(context),'the frozen context itself is not changed');assert.equal(context.submittedBrief.length,chars.submittedBrief);
 assert.deepEqual(leanCampaignContext({checkpointId:'c',hero:{scene:1}},'critic'),{checkpointId:'c',hero:{scene:1}},'a director-block request is untouched');
 const ctx=buildRunContext({briefText:'{}',brandPack:'B',packVersion:1,commonSkills:[],materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},planningChat:true,leanContext:true});assert.equal(ctx.leanContext,LEAN_CONTEXT_VERSION);
 assert.equal(buildRunContext({briefText:'{}',brandPack:'B',packVersion:1,commonSkills:[],materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},planningChat:true}).leanContext,undefined,'contexts frozen earlier keep their requests');
 const transport=readFileSync('apps/local-runner/local-claude/transport.ts','utf8');assert.match(transport,/lean=packed\?\.leanContext&&packed\.holds\.brief&&!planningChat&&unpacked\.campaignContext!==undefined/);
});

test('I: the direction\'s way of making reaches the designer whole and the reviewers, who are told to flag a departure', ()=>{
 const i=input(5),making='Generated photographic stills supply the scene only: the wall switch in daylight. '+'Type and logo are set in code. '.repeat(20);
 i.creativeHandoff={...(i.creativeHandoff??{}),visual:{selected:[{path:'treatments[0]',evidence:{name:'Switch',visualIdea:'One real switch.',twoSeconds:'It is on.',productRole:'The switch is the product.',makingTechnique:making,success:'Recognised with the logo covered.'}}]}} as never;
 assert.equal(territoryOf(i)?.makingTechnique,making.replace(/\s+/g,' ').trim(),'whole, not cut at 300 characters');assert.ok(making.length>600);
 const digest=designerDigestText(i,{sceneIds:false});assert.match(digest,/THE TERRITORY OF THIS DIRECTION \(whole; keep to its way of making, or say why you change it\)\nVisual idea: One real switch\./);assert.ok(digest.includes(making.trim().slice(-60)));
 assert.ok(!designerDigestText(input(4),{sceneIds:false}).includes('THE TERRITORY OF THIS DIRECTION'),'version 4 digests are unchanged');
 const note=wayOfMakingNote(territoryText(i));assert.match(note,/^WHAT THE DIRECTION ASKED FOR\n[\s\S]*Way of making: Generated photographic stills[\s\S]*a photograph asked for, the frame drawn in code[\s\S]*P1 note\.$/);
 assert.match(selectionContext('T',IDEAS,'CHECKS',territoryText(i)),/THE TERRITORY OF THIS DIRECTION\nT\n\nWHAT THE DIRECTION ASKED FOR\n/);assert.equal(selectionContext('T','I','C'),'THE TERRITORY OF THIS DIRECTION\nT\n\nTHE THREE IDEAS\nI\n\nC');
 const worker=readFileSync('apps/local-runner/director/worker.ts','utf8');assert.equal(worker.match(/work:wayOfMakingNote\(territoryText\(input\)\)/g)?.length,2,'hero review and end review');
 assert.equal(run.pictures,0);assert.equal(run.maxStills,4,'no picture was asked for although four were allowed');
});
