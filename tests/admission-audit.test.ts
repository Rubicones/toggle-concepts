// Admission audit (docs/reviews/2026-11-14-admission-audit.md): every kind of request a new shared Local run sends on
// the current defaults (v5, positive@1, stage-skills@2, planning chat, schema in text, default checks), built the way
// the runner builds it, against the database's admission rules mirrored in packages/director/admission.ts. The rules
// themselves are checked against a recorded dump of the effective SQL functions. Recorded inputs only; no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {directorAdmissionProblem,directorAllowanceFields,directorRequestSnapshot,criticAllowanceUsed,planningRequestSnapshot,planningAdmissionProblem,DIRECTOR_AGENT_ROLE,allowanceKey,PLANNING_JOB_ROLE,type FrozenAgent} from '../packages/director/admission';
import {estimateDesignerDirection,roleNames,type Estimate} from '../packages/director/money';
import {designerRequestCap} from '../packages/director/request-size';
import {DESIGNER_ROLE_V4,designerRoleLine,staticRoleInstructions} from '../packages/director/roles';
import {STAGE_H_INSTRUCTIONS,heroTask} from '../packages/director/hero-chat';
import {IDEAS_TASK,SELECTION_INSTRUCTIONS,selectionSchema,selectionContext} from '../packages/director/image-ideas';
import {REVIEW_INSTRUCTIONS,HERO_REVIEW_WHAT,END_REVIEW_WHAT,reviewSchemaV2,reviewContextText,stageReviewMaterial,checksText} from '../packages/director/critic-review';
import {designerDigestText} from '../packages/director/designer-digest';
import {readSkills} from '../packages/agents/skill-files';
import {buildStageSkills,creatorStageText} from '../packages/agents/stage-skills';
import {LOCAL_TEXT_RESERVATION_MICRO_USD} from '../packages/agents/local-usage';
import {modelStepSnapshot} from '../apps/local-runner/director/tripo-model';
import {compactStaticCriticRequest} from '../apps/local-runner/director/static-evidence';
import {recordCheckAnswers} from '../apps/local-runner/director/critic-checks';
import {modelsFor,tripoPriceMicroUsd,tripoSettings,tripoAgentModel} from '../packages/director/tripo';
import type {DirectionInput} from '../packages/director/types';

const sql=readFileSync('tests/fixtures/admission/effective-admission.sql','utf8');
const fn=(name:string)=>{const i=sql.indexOf(`-- ${name}`);assert.ok(i>=0,name);const j=sql.indexOf('\n-- ',i+4);return sql.slice(i,j<0?undefined:j);};
const run='11111111-1111-4111-8111-111111111111',cp='22222222-2222-4222-8222-222222222222',block='33333333-3333-4333-8333-333333333333',direction='44444444-4444-4444-8444-444444444444';
const pricing={inputPrice:3e-6,outputPrice:1.5e-5,cacheReadPrice:3e-7,cacheWritePrice:3.75e-6};
const models={director:{modelId:'anthropic/claude-sonnet-4.5',instructions:staticRoleInstructions.director,maxOutputTokens:32000,pricing,contextLength:200000},critic:{modelId:'anthropic/claude-sonnet-4.5',instructions:'ROLE: Demanding art director (frozen critic brief).',maxOutputTokens:16000,pricing,contextLength:200000}};
/** The block's agents as studio_run_agent_overrides holds them (the block's own model instructions), with run limits. */
const agents:Record<string,FrozenAgent>={'visual-direction':{role:'visual-direction',model_id:models.director.modelId,instructions:models.director.instructions,step_cap_micro_usd:20_000_000,max_output_tokens:32000},
 critic:{role:'critic',model_id:models.critic.modelId,instructions:models.critic.instructions,step_cap_micro_usd:5_000_000,max_output_tokens:16000}};
const v5:Estimate=estimateDesignerDirection({designer:pricing,critic:pricing},40000,2,{id:'audit'},{criticRequests:2,heroReviews:2,ideasSelection:true,requestInputCap:designerRequestCap(200000,32000)});
const input=structuredClone((recovery as {input:unknown}).input) as DirectionInput;input.brief={...input.brief,designerVersion:5,materialsVersion:1,digestVersion:1};
const staged=buildStageSkills(readSkills(),[]);
type Row={status:string;cost_micro_usd:number|null;reserve_micro_usd:number;usage:unknown;config_snapshot:Record<string,unknown>};
/** A finished Local request, as the transport reports it (cache reads and writes, completion tokens). */
const done=(snapshot:Record<string,unknown>,prompt:number,cached:number,written:number,completion:number):Row=>({status:'succeeded',cost_micro_usd:0,reserve_micro_usd:LOCAL_TEXT_RESERVATION_MICRO_USD,usage:{prompt_tokens:prompt,completion_tokens:completion,prompt_tokens_details:{cached_tokens:cached,cache_write_tokens:written},_local:{}},config_snapshot:snapshot});

/** One request of the given kind, built and admitted as the worker does; returns the problem or null. */
function request(rows:Row[],kind:{role:'designer'|'critic';prompt:string;protocol:string;schema:{name:string;schema:Record<string,unknown>}|null;context:unknown;images:number}){
 const modelRole=kind.role==='designer'?'director':'critic',config=models[modelRole],agent=agents[roleNames[modelRole]];
 const roleLine=designerRoleLine({role:kind.role,heroChat:true,prior:false,mode:'local_claude',contextMode:'shared',stageSkills:true});
 const base=directorRequestSnapshot({draft:true,blockId:block,directionId:direction,iterationId:'it',runId:run,role:kind.role,agentRole:roleNames[modelRole],designerRequestInputCap:v5.designerRequestInputCap,config,outputLimit:Math.min(config.maxOutputTokens,agent.max_output_tokens!),remainingMs:600000,roleLine,protocolInstructions:kind.protocol,context:kind.context,checkpointId:cp,stepCapMicroUsd:agent.step_cap_micro_usd,responseSchema:kind.schema});
 const mine=rows.filter(r=>r.config_snapshot.directorRole===kind.role);
 let admitted;try{admitted=directorAllowanceFields(mine as never,v5.roles[kind.role as 'critic']!,{role:kind.role,snapshot:base,prompt:kind.prompt,visionCount:kind.images,blockId:block,directionId:direction});}catch(error){return {error};}
 const problem=directorAdmissionProblem({runId:run,agentRole:roleNames[modelRole],model:config.modelId,reservation:LOCAL_TEXT_RESERVATION_MICRO_USD,snapshot:admitted.snapshot,agent,checkpointId:cp,localText:true,block:{draft:true,designerRequestInputCap:v5.designerRequestInputCap,allowance:admitted.allowance,used:admitted.used,approved:true}});
 return {problem,snapshot:admitted.snapshot};
}
const designerTurn=(message:string,images=1)=>({role:'designer' as const,prompt:message,protocol:STAGE_H_INSTRUCTIONS,schema:null,context:{contextText:designerDigestText(input,{sceneIds:false})},images});
const heroReview=()=>{const m=stageReviewMaterial(staged,'hero');return {role:'critic' as const,prompt:'Review this hero frame.',protocol:REVIEW_INSTRUCTIONS(HERO_REVIEW_WHAT),schema:reviewSchemaV2,context:{contextText:reviewContextText({territory:designerDigestText(input,{sceneIds:false}),checks:m.checks,signs:m.signs,hard:[],memory:[]})},images:1};};
const endReview=()=>{const m=stageReviewMaterial(staged,'extension');return {role:'critic' as const,prompt:'Review these rendered views of the draft.',protocol:REVIEW_INSTRUCTIONS(END_REVIEW_WHAT),schema:reviewSchemaV2,context:{contextText:reviewContextText({territory:designerDigestText(input),checks:m.checks,signs:m.signs,hard:[],memory:[]})},images:8};};
const selection=(ideas:string)=>({role:'critic' as const,prompt:'Choose one of the three ideas.',protocol:SELECTION_INSTRUCTIONS,schema:selectionSchema,context:{contextText:selectionContext(designerDigestText(input,{sceneIds:false}),ideas,checksText(stageReviewMaterial(staged,'ideas').checks))},images:0});

test('Admission audit: the mirrored rules are the database\'s (recorded dump of the effective functions)', ()=>{
 const reserve=fn('app_private.reserve_step_before_creative');
 for(const rule of ["snapshot->>'instructions' is distinct from agent->>'instructions'","agent->>'model_id' is distinct from model","snapshot->>'budgetScopeId' is distinct from budget_id","snapshot->'campaignContext'->>'checkpointId' is distinct from cp.id::text","(snapshot->>'stepCapMicroUsd')::bigint not between 1 and (agent->>'step_cap_micro_usd')::bigint","not app_private.local_text_role(target_run,agent_role) and reservation>(snapshot->>'stepCapMicroUsd')::bigint"])assert.ok(reserve.includes(rule),rule);
 const guard=fn('app_private.guard_director_allowance()');
 for(const [role,agent] of Object.entries(DIRECTOR_AGENT_ROLE))assert.ok(guard.includes(`when '${role}' then '${agent}'`),role);
 for(const rule of ["not in (32768,65536)","between 32768 and coalesce((b.snapshot->'estimates'->(new.config_snapshot->>'directorDirectionId')->>'designerRequestInputCap')::int,65536)","->'roles'->(case when role_key='model' then 'model3d' else role_key end)","role_key not in ('resources','model') and exists(","requests+1>(a->>'requests')::int","outputs+(new.config_snapshot->>'maxOutputTokens')::bigint>(a->>'outputTokens')::bigint","b.status not in ('queued','running','review')"])assert.ok(guard.includes(rule),rule);
 assert.equal(allowanceKey('model'),'model3d');assert.equal(allowanceKey('critic'),'critic');
 const begin=fn('public.studio_begin_workflow'),agent=fn('app_private.workflow_admission_agent');
 for(const rule of ["snapshot->'upstream' is distinct from refs","snapshot->'campaignContext' is distinct from j.payload->'snapshot'->'campaignContext'","snapshot->>'instructions' is distinct from j.payload->'snapshot'->>'instructions'","snapshot->>'budgetScopeId' is distinct from j.payload->'snapshot'->>'budgetScopeId'","snapshot->'brandSheetImages' is distinct from j.payload->'snapshot'->'brandSheetImages'","(snapshot->>'maxOutputTokens')::int not between 64 and (agent->>'max_output_tokens')::int"])assert.ok(begin.includes(rule),rule);
 for(const [key,role] of Object.entries(PLANNING_JOB_ROLE))assert.ok(agent.includes(`when '${key}' then '${role}'`),key);
 assert.match(fn('app_private.guard_heavy_c2()'),/new\.config_snapshot->>'directorRole'='model'/);
});

test('Admission audit: planning roles, visual direction with territory and the brand character request keep their frozen fields', ()=>{
 const model={...pricing,maxOutput:64000},agent={role:'research',model_id:'anthropic/claude-sonnet-4.5',instructions:'ROLE: research (frozen)',step_cap_micro_usd:500000,max_output_tokens:16000};
 for(const [jobKey,role] of [...Object.entries(PLANNING_JOB_ROLE),['brand-character','research']] as [string,string][]){
  const payload={instructions:agent.instructions,maxOutputTokens:12000,pricing,budgetScopeId:`budget-step-${run}-${role}`,campaignContext:{mode:'c1_working',checkpointId:cp,scope:{referenceLocale:'en'}},stepCapMicroUsd:400000,...(role==='visual-direction'?{brandSheetImages:[{section:'logo',sha256:'a'.repeat(64)}]}:{}),...(jobKey==='brand-character'?{brandCharacter:{revisionId:'rev'}}:{})};
  const refs=role==='research'?[]:[{jobId:'p1',sha256:'b'.repeat(64),output:'{"ok":true}'}];
  // What the runner adds afterwards (response schema, territory task, transport task, effort) is not compared.
  const sent={...planningRequestSnapshot(payload,refs,model,agent),responseSchema:{name:'territory'},transportTask:'TERRITORY',reasoningEffort:'high'};
  assert.equal(planningAdmissionProblem({runId:run,jobKey,role,payload,sent,refs,agent:{...agent,role},checkpointId:cp}),null,jobKey);
  // A change to a frozen field would be refused (the C/D phases add their text in the transport, never here).
  assert.match(planningAdmissionProblem({runId:run,jobKey,role,payload,sent:{...sent,instructions:agent.instructions+' positive'},refs,agent:{...agent,role},checkpointId:cp})!.detail,/instructions differs/);
 }
 const workflow=readFileSync('apps/local-runner/workflow.ts','utf8');assert.match(workflow,/const snapshot:Snapshot=\{\.\.\.planningRequestSnapshot\(job\.payload\.snapshot,upstream,model,agent\),/);
 assert.ok(!/snapshot\.(instructions|campaignContext|upstream|budgetScopeId|brandSheetImages)=/.test(workflow),'the frozen fields are never reassigned');
});

test('Admission audit: a v5 designer direction (ideas, extra ideas round, stage H, stage E, repair) and its critic requests are admitted', ()=>{
 const rows:Row[]=[],admit=(kind:Parameters<typeof request>[1],prompt:number,cached:number,written:number,completion:number)=>{const r=request(rows,kind);assert.ok(!('error' in r),String((r as {error?:{detail?:string}}).error?.detail));const {problem,snapshot}=r as {problem:unknown;snapshot:Record<string,unknown>};assert.equal(problem,null,JSON.stringify(problem));rows.push(done(snapshot,prompt,cached,written,completion));return snapshot;};
 // The ideas turn: the hero task, the ideas task and the ideas stage's principles; the role line travels beside the frozen instructions.
 const ideas=admit(designerTurn(`${heroTask(input)}\n\n${IDEAS_TASK}\n\n${creatorStageText(staged,'ideas')}`,0),60000,40000,18000,12460);
 assert.equal(ideas.instructions,models.director.instructions);assert.equal(ideas.roleInstructions,DESIGNER_ROLE_V4);assert.equal(ideas.directorRole,'designer');
 admit(selection('1. A\n2. B\n3. C'),9000,0,9000,2500);
 admit(designerTurn('None of the three ideas passed. Write three new ones.',0),70000,60000,8000,3000);
 admit(selection('1. D\n2. E\n3. F'),9000,0,9000,2500);
 // Stage H and stage E turns, at the measured output sizes of recorded designer runs (artifacts/bench, fold: 14 turns).
 const outputs=[5640,2322,1587,858,7321,935,5668,32149,10536,2635,2079,13799,4525,2128];
 for(const [i,out] of outputs.entries()){
  admit(designerTurn(i<5?'The hero frame now.':'The next scenes.'),90000+i*5000,80000+i*5000,8000,out);
  if(i===3||i===4)admit(heroReview(),20000,0,20000,9000);
 }
 admit(endReview(),45000,0,45000,10000);
 // A repair turn of the end review is a designer turn like the others.
 admit(designerTurn('The reviewer\'s notes.'),160000,150000,8000,6000);
 const critic=rows.filter(r=>r.config_snapshot.directorRole==='critic').length;assert.equal(critic,5,'2 selections + 2 hero reviews + 1 end review: the quoted 5');
 assert.equal(v5.roles.critic.requests,5);
 // A sixth critic request is refused by the allowance (as the database would); the worker skips it, never stops on it.
 const sixth=request(rows,endReview()) as {error?:unknown};assert.ok(criticAllowanceUsed(sixth.error),'refused as the critic\'s allowance');
});

test('Admission audit: critic exhaustion and text-only critic requests never stop the block', async()=>{
 const worker=readFileSync('apps/local-runner/director/worker.ts','utf8');
 assert.match(worker,/if\(propagateExecutionFailure\(error\)&&!criticAllowanceUsed\(error\)\)throw error;/,'the hero review is skipped when the critic allowance is used');
 assert.match(worker,/catch\(error\)\{if\(criticAllowanceUsed\(error\)\)return null;throw error;\}/,'the selection falls back to the first idea');
 // Before the audit the selection (no images) went to the render packer and was refused before sending.
 await assert.rejects(()=>compactStaticCriticRequest('Choose one.',{instructions:'x',maxOutputTokens:1000,pricing,requestInputCap:65536},[]),/CRITIC_RENDER_EVIDENCE_REQUIRED/);
 assert.match(worker,/const compacted=role==='critic'&&images\.length\?await compactStaticCriticRequest\(prompt,base,images\):compactDraftRequest\(/);
 assert.match(worker,/directorAdmissionProblem\(\{runId:input\.runId,agentRole:roleNames\[modelRole\]/,'every director-block text request is checked before sending');
});

test('Admission audit: the 3D model step is held to the model3d agent and the block\'s model allowance', ()=>{
 const settings={...tripoSettings({TRIPO_API_KEY:'k'})},price=tripoPriceMicroUsd(settings),c={runId:run,blockId:block,directionId:direction,iterationId:'it',resourceId:'r1',settings};
 const agent={role:'model3d',model_id:tripoAgentModel(settings.model),instructions:'ROLE: 3D (frozen)',step_cap_micro_usd:500000};
 const allowance={maxCostMicroUsd:price*2,inputTokens:0,outputTokens:0,timeMs:600000,requests:2},used={spent:0,inputs:0,outputs:0,requests:0};
 const check=(a:typeof agent,u=used)=>directorAdmissionProblem({runId:run,agentRole:'model3d',model:a.model_id,reservation:price,snapshot:modelStepSnapshot(c,a,cp),agent:a,checkpointId:cp,localText:false,roleSpent:u.spent,block:{draft:true,allowance,used:u,approved:true}});
 // The default model3d cap ($0.50) cannot pay for one model: refused by the step cap, so the quote offers none.
 assert.equal(check(agent)?.code,'STEP_CAP_REACHED');
 const env={TRIPO_API_KEY:'k'},brief={brief:{designerVersion:5,synthesisAllowed:true},resourceIds:['r1','r2']};
 assert.equal(modelsFor(brief,[agent],1,env),null,'no models quoted that the cap cannot pay for');
 assert.deepEqual(modelsFor(brief,[{...agent,step_cap_micro_usd:price*4}],1,env),{models:{count:2,perModelMicroUsd:price}});
 assert.deepEqual(modelsFor(brief,[{...agent,step_cap_micro_usd:price*4}],3,env),{models:{count:1,perModelMicroUsd:price}},'shared across the run\'s directions');
 const rich={...agent,step_cap_micro_usd:price*4};assert.equal(check(rich),null,'admitted once the cap pays for it (no request size or token rules)');
 assert.equal(check(rich,{spent:price*2,inputs:0,outputs:0,requests:2})?.code,'ROLE_ALLOWANCE_EXHAUSTED','past the approved count');
 assert.match(readFileSync('lib/server/director-start.ts','utf8'),/modelsFor\(input,agents,selectedEntries\.length\)/);
 const continuation=readFileSync('lib/server/director.ts','utf8');assert.match(continuation,/>=5\?\{ideasSelection:true\}:\{\}\),\.\.\.\(snapshot\.estimates\[directionId\]\.maxModels/,'a continuation keeps the selection and the models');
 assert.ok(readFileSync('supabase/migrations/20261114000100_director_model_steps.sql','utf8').includes("when ''model'' then ''model3d''"));
});

test('Admission audit: stored critic check answers have one row per skill and check', async()=>{
 const upserts:unknown[][]=[],chain:Record<string,unknown>={};for(const m of ['select','eq'])chain[m]=()=>chain;chain.maybeSingle=async()=>({data:{tenant_id:'t'},error:null});
 const admin={from:(table:string)=>table==='studio_critic_checks'?{upsert:async(rows:unknown[])=>{upserts.push(rows);return {error:null};}}:chain} as never;
 assert.equal(await recordCheckAnswers(admin,{runId:run,directionId:direction,stage:'hero',round:1,answers:[{skill:'reading-order',n:1,ok:false,evidence:'a'},{skill:'reading-order',n:1,ok:true,evidence:'b'},{skill:'final-check',n:2,ok:true,evidence:'c'}]}),true);
 assert.deepEqual((upserts[0] as {skill_id:string;check_no:number;ok:boolean}[]).map(r=>`${r.skill_id} ${r.check_no} ${r.ok}`),['reading-order 1 true','final-check 2 true']);
});

test('Admission audit: the recorded v5 requests (submitted to the real functions by supabase/tests/admission-requests.sql) pass the mirror', ()=>{
 const doc=JSON.parse(readFileSync('tests/fixtures/admission/v5-requests.json','utf8')) as {ids:{run:string;cp:string};instructions:Record<string,string>;estimate:Estimate;requests:{kind:string;agentRole:string;model:string;snapshot:Record<string,unknown>}[]};
 assert.deepEqual(doc.requests.map(r=>r.kind),['designer: ideas turn','critic: selection of ideas','designer: stage H turn','critic: hero review (critic@2)','designer: stage E turn','critic: end review (critic@2)']);
 for(const r of doc.requests){const role=String(r.snapshot.directorRole) as 'designer'|'critic';
  const agent={role:r.agentRole,model_id:r.model,instructions:doc.instructions[r.agentRole],step_cap_micro_usd:r.agentRole==='critic'?5_000_000:20_000_000};
  assert.equal(directorAdmissionProblem({runId:doc.ids.run,agentRole:r.agentRole,model:r.model,reservation:LOCAL_TEXT_RESERVATION_MICRO_USD,snapshot:r.snapshot,agent,checkpointId:doc.ids.cp,localText:true,block:{draft:true,designerRequestInputCap:doc.estimate.designerRequestInputCap,allowance:doc.estimate.roles[role],used:{spent:0,inputs:0,outputs:0,requests:0},approved:true}}),null,r.kind);
  if(role==='designer')assert.equal(r.snapshot.roleInstructions,DESIGNER_ROLE_V4,r.kind);}
 assert.ok(readFileSync('supabase/tests/admission-requests.sql','utf8').includes("if sqlerrm<>'CHECKPOINT_CONFIG_MISMATCH' then raise"),'the role line as instructions stays refused');
});
