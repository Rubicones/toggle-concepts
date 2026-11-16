// Admission audit: writes the director-block requests of a v5 shared Local direction, built exactly as the runner
// builds them, to tests/fixtures/admission/v5-requests.json, so supabase/tests/admission-requests.sql can submit them
// to the real admission functions of a disposable database. No model and no live database are used.
import {writeFileSync} from 'node:fs';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {directorAllowanceFields,directorRequestSnapshot} from '../packages/director/admission';
import {estimateDesignerDirection,roleNames} from '../packages/director/money';
import {designerRequestCap} from '../packages/director/request-size';
import {designerRoleLine,staticRoleInstructions} from '../packages/director/roles';
import {STAGE_H_INSTRUCTIONS,heroTask} from '../packages/director/hero-chat';
import {IDEAS_TASK,SELECTION_INSTRUCTIONS,selectionSchema,selectionContext} from '../packages/director/image-ideas';
import {REVIEW_INSTRUCTIONS,HERO_REVIEW_WHAT,END_REVIEW_WHAT,reviewSchemaV2,reviewContextText,stageReviewMaterial,checksText} from '../packages/director/critic-review';
import {designerDigestText} from '../packages/director/designer-digest';
import {readSkills} from '../packages/agents/skill-files';
import {buildStageSkills,creatorStageText} from '../packages/agents/stage-skills';
import type {DirectionInput} from '../packages/director/types';
import {modelStepSnapshot} from '../apps/local-runner/director/tripo-model';
import {tripoSettings,tripoPriceMicroUsd,tripoAgentModel} from '../packages/director/tripo';

export const ADMISSION_IDS={run:'11111111-1111-4111-8111-111111111111',cp:'22222222-2222-4222-8222-222222222222',block:'33333333-3333-4333-8333-333333333333',direction:'44444444-4444-4444-8444-444444444444',iteration:'55555555-5555-4555-8555-555555555555'};
const {run,cp,block,direction,iteration}=ADMISSION_IDS;
const pricing={inputPrice:3e-6,outputPrice:1.5e-5,cacheReadPrice:3e-7,cacheWritePrice:3.75e-6};
const models={director:{modelId:'anthropic/claude-sonnet-4.5',instructions:staticRoleInstructions.director,maxOutputTokens:32000,pricing,contextLength:200000},critic:{modelId:'anthropic/claude-sonnet-4.5',instructions:'ROLE: Demanding art director (frozen critic brief).',maxOutputTokens:16000,pricing,contextLength:200000}};
const estimate=estimateDesignerDirection({designer:pricing,critic:pricing},40000,2,{id:'audit'},{criticRequests:2,heroReviews:2,ideasSelection:true,requestInputCap:designerRequestCap(200000,32000)});
const input=structuredClone((recovery as {input:unknown}).input) as DirectionInput;input.brief={...input.brief,designerVersion:5,materialsVersion:1,digestVersion:1};
const staged=buildStageSkills(readSkills(),[]),hero=stageReviewMaterial(staged,'hero'),end=stageReviewMaterial(staged,'extension');
const kinds=[
 {kind:'designer: ideas turn',role:'designer',prompt:`${heroTask(input)}\n\n${IDEAS_TASK}\n\n${creatorStageText(staged,'ideas')}`,protocol:STAGE_H_INSTRUCTIONS,schema:null,context:{contextText:designerDigestText(input,{sceneIds:false})},images:0},
 {kind:'critic: selection of ideas',role:'critic',prompt:'Choose one of the three ideas.',protocol:SELECTION_INSTRUCTIONS,schema:selectionSchema,context:{contextText:selectionContext(designerDigestText(input,{sceneIds:false}),'1. A\n2. B\n3. C',checksText(stageReviewMaterial(staged,'ideas').checks))},images:0},
 {kind:'designer: stage H turn',role:'designer',prompt:'The hero frame now.',protocol:STAGE_H_INSTRUCTIONS,schema:null,context:{contextText:designerDigestText(input,{sceneIds:false})},images:2},
 {kind:'critic: hero review (critic@2)',role:'critic',prompt:'Review this hero frame.',protocol:REVIEW_INSTRUCTIONS(HERO_REVIEW_WHAT),schema:reviewSchemaV2,context:{contextText:reviewContextText({territory:designerDigestText(input,{sceneIds:false}),checks:hero.checks,signs:hero.signs,hard:[],memory:[]})},images:1},
 {kind:'designer: stage E turn',role:'designer',prompt:'The next scenes.',protocol:STAGE_H_INSTRUCTIONS,schema:null,context:{contextText:designerDigestText(input)},images:3},
 {kind:'critic: end review (critic@2)',role:'critic',prompt:'Review these rendered views of the draft.',protocol:REVIEW_INSTRUCTIONS(END_REVIEW_WHAT),schema:reviewSchemaV2,context:{contextText:reviewContextText({territory:designerDigestText(input),checks:end.checks,signs:end.signs,hard:[],memory:[]})},images:8},
] as const;
const requests=kinds.map((k,i)=>{
 const modelRole=k.role==='designer'?'director':'critic',config=models[modelRole],agentRole=roleNames[modelRole];
 const base=directorRequestSnapshot({draft:true,blockId:block,directionId:direction,iterationId:iteration,runId:run,role:k.role,agentRole,designerRequestInputCap:estimate.designerRequestInputCap,config,outputLimit:config.maxOutputTokens,remainingMs:600000,
  roleLine:designerRoleLine({role:k.role,heroChat:true,prior:false,mode:'local_claude',contextMode:'shared',stageSkills:true}),protocolInstructions:k.protocol,context:k.context,checkpointId:cp,stepCapMicroUsd:k.role==='designer'?20_000_000:5_000_000,responseSchema:k.schema as never});
 const admitted=directorAllowanceFields([],estimate.roles[k.role]!,{role:k.role,snapshot:base,prompt:k.prompt,visionCount:k.images,blockId:block,directionId:direction});
 return {kind:k.kind,requestKey:`66666666-6666-4666-8666-${String(i+1).padStart(12,'0')}`,agentRole,model:config.modelId,prompt:k.prompt,snapshot:{...admitted.snapshot,directorCallId:`call-${i+1}`}};
});
// The 3D model step of the same block (C8 follow-up), as the Tripo ledger builds it on the run's model3d agent.
const tripo=tripoSettings({TRIPO_API_KEY:'recorded'}),model3d={model:tripoAgentModel(tripo.model),instructions:'ROLE: 3D resource producer (frozen)',price:tripoPriceMicroUsd(tripo)};
const modelStep={kind:'model3d: 3D model of a picture',requestKey:'66666666-6666-4666-8666-999999999999',agentRole:'model3d',model:model3d.model,prompt:'Image to 3D model of r1',reservation:model3d.price,
 snapshot:modelStepSnapshot({runId:run,blockId:block,directionId:direction,iterationId:iteration,resourceId:'r1',settings:tripo},{instructions:model3d.instructions,step_cap_micro_usd:model3d.price*4},cp)};
writeFileSync('tests/fixtures/admission/v5-requests.json',JSON.stringify({note:'Recorded by scripts/record-admission-requests.ts (admission audit). The v5 director-block requests as the runner builds them.',ids:ADMISSION_IDS,instructions:{'visual-direction':models.director.instructions,critic:models.critic.instructions},estimate,requests,model3d,modelStep},null,1)+'\n');
console.log(`${requests.length} requests recorded`);
