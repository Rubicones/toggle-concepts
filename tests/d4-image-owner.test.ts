// D4 (docs/plans/2026-11-13-skills-critic-image-owner.md, designerVersion 5): one owner for the image. Recorded answers
// only (tests/fixtures/director/v5/recorded.json); no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {agentResponseSchema,prepareAgentOutput} from '../packages/contracts/agent-output';
import {providerJsonSchema,typeArraysAsAnyOf} from '../packages/director/provider-schema';
import {schemaIssues} from '../packages/agents/schema-in-text';
import {stageDigest} from '../packages/director/digest';
import {IDEAS_TASK,SELECTION_INSTRUCTIONS,MAX_IDEA_ROUNDS,readSelection,isTerritoryOutput,selectionContext,usesImageIdeas,TERRITORY_TASK} from '../packages/director/image-ideas';
import {heroTask} from '../packages/director/hero-chat';
import {estimateDesignerDirection,IDEAS_SELECTION} from '../packages/director/money';
import {buildStageSkills,creatorStageText} from '../packages/agents/stage-skills';
import {readSkills} from '../packages/agents/skill-files';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../packages/director/types';

const rec=JSON.parse(readFileSync('tests/fixtures/director/v5/recorded.json','utf8')) as {territory:Record<string,unknown>;ideas:string;selectionPick2:string;selectionNone:string};
const input=(v:number)=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:v,materialsVersion:1,digestVersion:1};return i;};
const COMPOSITION=['composition','visualHierarchy','paletteAndLighting','lensAndCamera','productScale','typographyTreatment','motionLanguage','formatAdaptation','assetPromptBriefs','proxyContracts'];
const tools=(log:string[]):DesignerTools=>({files:async()=>[],write:async p=>{log.push(`write ${p}`);},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),
 render:async()=>({summary:{version:1 as const,revision:'r',views:0,hard:0,soft:0,reports:[]} as never,shots:[]})});
const build='The idea, built.\n\n```tsx Frame.tsx\nexport default ()=>null;\n```';

test('D4: visual direction for version 5 writes territories: no per-frame composition fields; versions 1–4 keep their schema', ()=>{
 for(const options of [{territory:true},{territory:true,concept:true,scenarioSelection:true},{territory:true,scenarioSelection:true,treatmentSequence:true,scenarioId:'concept-2'}]){
  const s=agentResponseSchema('visual-direction',undefined,options),items=(s.schema.properties.deliverable as unknown as {properties:{treatments:{items:{properties:Record<string,unknown>}}}}).properties.treatments.items.properties;
  for(const f of COMPOSITION)assert.ok(!(f in items),f);for(const f of ['visualIdea','twoSeconds','productRole','makingTechnique','success'])assert.ok(f in items,f);
  assert.ok(JSON.stringify(s.schema).length<2400&&JSON.stringify(typeArraysAsAnyOf(providerJsonSchema(s.schema))).length<2400,'schema size limit');
 }
 const v4=agentResponseSchema('visual-direction',undefined,{scenarioSelection:true,concept:true}),items4=(v4.schema.properties.deliverable as unknown as {properties:{treatments:{items:{properties:Record<string,unknown>}}}}).properties.treatments.items.properties;
 assert.ok(COMPOSITION.every(f=>f in items4),'version 4 keeps every field');assert.deepEqual(agentResponseSchema('visual-direction',undefined,{territory:false}),agentResponseSchema('visual-direction'));
 const answer=rec.territory;assert.deepEqual(schemaIssues(answer,typeArraysAsAnyOf(providerJsonSchema(agentResponseSchema('visual-direction',undefined,{territory:true,concept:true}).schema)) as Record<string,unknown>),[]);
 assert.equal(prepareAgentOutput(JSON.stringify(answer),'visual-direction',true).blocked,false);assert.ok(isTerritoryOutput(answer));
 assert.ok(!isTerritoryOutput(JSON.parse(readFileSync('fixtures/creative/live/visual-direction.json','utf8')).output),'a version 4 output is not a territory');
 const digest=stageDigest(answer);assert.match(digest,/Two seconds: That the best part/);assert.match(digest,/Product role: /);assert.match(digest,/Concept: concept-1: The song is the object you hold\./,'the C4 digest and the C9 concept follow');
 assert.ok(!/composition|layout per/i.test(TERRITORY_TASK.split('Compositions')[0]));
});

test('D4: the ideas turn precedes the first code turn; the independent choice is the next message; the same conversation builds it', async()=>{
 const i=input(5),state=newDesignerState(),sent:string[]=[],log:string[]=[],cards:string[][]=[],chosen:string[]=[];const answers=[rec.ideas,build];
 const skills=creatorStageText(buildStageSkills(readSkills(),[]),'ideas');
 await runHeroChat({input:i,state,maxTurns:3,maxPictures:0,timeMs:600000,tools:tools(log),save:async()=>{},
  ideas:{task:`${IDEAS_TASK}\n\n${skills}`,select:async text=>{assert.equal(text,rec.ideas);log.push('select');return readSelection(rec.selectionPick2);},onIdeas:async c=>{cards.push(c);},onChosen:async(pick,reason)=>{chosen.push(`${pick}: ${reason}`);}},
  call:async message=>{sent.push(message);log.push('call');return answers[sent.length-1]??build;}});
 assert.ok(sent[0].startsWith(heroTask(i)),'the first message carries the stage H task');assert.ok(sent[0].includes(IDEAS_TASK)&&sent[0].includes('SKILLS FOR THIS STAGE (ideas and planning)'));
 assert.deepEqual(log.slice(0,4),['call','select','call','write Frame.tsx'],'ideas, selection, then the first code turn');
 assert.match(sent[1],/^THE CHOSEN IDEA: IDEA 2\. Why: Idea 2 makes the product's one action the whole picture\./,'the choice enters the designer conversation');
 assert.equal(cards[0].length,3);assert.match(cards[0][1],/endless waveform snap shut/);assert.deepEqual(chosen,["2: Idea 2 makes the product's one action the whole picture. It fits the brand's restraint and reads in two seconds."]);
 assert.equal(state.ideas?.picked,2);assert.equal(state.ideas?.rounds,1);
});

test('D4: the extra ideas round runs at most once; a selection that cannot run builds the first idea', async()=>{
 const run=async(selection:()=>Promise<ReturnType<typeof readSelection>>)=>{const state=newDesignerState(),sent:string[]=[];
  await runHeroChat({input:input(5),state,maxTurns:5,maxPictures:0,timeMs:600000,tools:tools([]),save:async()=>{},ideas:{task:IDEAS_TASK,select:selection},call:async m=>{sent.push(m);return sent.length<=MAX_IDEA_ROUNDS&&!m.startsWith('THE CHOSEN')?rec.ideas:build;}});
  return {state,sent};};
 const none=await run(async()=>readSelection(rec.selectionNone));
 assert.equal(none.state.ideas?.rounds,2,'one extra round, no more');assert.match(none.sent[1],/^None of the three ideas passes the key checks:\n- Idea 1: Two ideas at once\./);
 assert.match(none.sent[2],/^THE CHOSEN IDEA: IDEA 1\. No idea passed after the extra round/);
 const failed=await run(async()=>null);assert.equal(failed.state.ideas?.rounds,1);assert.match(failed.sent[1],/^THE CHOSEN IDEA: IDEA 1\. The selection could not run/);
});

test('D4: version 4 runs are unchanged; the quote adds one selection request for version 5 only', async()=>{
 const sent:string[]=[];await runHeroChat({input:input(4),state:newDesignerState(),maxTurns:1,maxPictures:0,timeMs:600000,tools:tools([]),save:async()=>{},call:async m=>{sent.push(m);return build;}});
 assert.ok(!sent[0].includes('THREE IMAGE IDEAS'),'no ideas turn in version 4');assert.equal(usesImageIdeas(input(4)),false);assert.equal(usesImageIdeas(input(5)),true);
 const p={inputPrice:3e-6,outputPrice:1.5e-5},v4=estimateDesignerDirection({designer:p,critic:p},40000,2,{id:'x'},{criticRequests:2,heroReviews:2}),v5=estimateDesignerDirection({designer:p,critic:p},40000,2,{id:'x'},{criticRequests:2,heroReviews:2,ideasSelection:true});
 assert.equal(v5.roles.critic.requests,v4.roles.critic.requests+1);assert.equal(v5.ideasSelection,1);assert.equal(v4.ideasSelection,undefined);
 assert.deepEqual(estimateDesignerDirection({designer:p,critic:p},40000,2,{id:'x'},{criticRequests:2,heroReviews:2,ideasSelection:false}),v4,'version 4 quotes are byte for byte');
 assert.match(readFileSync('lib/server/director-start.ts','utf8'),/designerVersion:isTerritoryOutput\(visual\.output\)\?5:4/,'version 5 only when the run planned territories (opt-in)');
});

test('D4: estimated cost of the ideas turn and the selection request', ()=>{
 const tok=(s:string)=>Math.ceil(Buffer.byteLength(s,'utf8')/4),skills=creatorStageText(buildStageSkills(readSkills(),[]),'ideas');
 const ideasIn=tok(heroTask(input(5)))+tok(IDEAS_TASK)+tok(skills),ideasOut=tok(rec.ideas),selectionIn=tok(SELECTION_INSTRUCTIONS)+tok(selectionContext('x'.repeat(4000),rec.ideas,''))+10000,selectionOut=tok(rec.selectionPick2);
 console.log('D4 estimated tokens:',JSON.stringify({ideasTurn:{newInput:ideasIn,output:`${ideasOut} recorded, 600–1,000 asked`},selection:{input:selectionIn,output:selectionOut,quoted:IDEAS_SELECTION}}));
 assert.ok(selectionIn<IDEAS_SELECTION.inputTokens,'the quoted selection bound covers the request');
});
