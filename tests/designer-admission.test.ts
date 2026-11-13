// Live bug (CHECKPOINT_CONFIG_MISMATCH on the first designer request of a new shared Local run): the database admits a
// director-block request only with its agent's frozen instructions, and D1 replaced the designer's instructions in the
// snapshot with its own role line. Recorded CLI only; no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readSkills,splitSkills} from '../packages/agents/skill-files';
import {buildStageSkills} from '../packages/agents/stage-skills';
import {buildRunContext} from '../packages/agents/run-context';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {POSITIVE_DEFAULT} from '../packages/agents/positive-instructions';
import {textRequestQuote} from '../packages/agents/text-quote';
import {cliTextTransport} from '../apps/local-runner/local-claude/transport';
import {DESIGNER_ROLE_V4,designerRoleLine,frozenAdmissionProblem,staticRoleInstructions} from '../packages/director/roles';
import {fakeSetup,fixture} from './local-chat-shaped.test';

const skills=readSkills(),{common,byRole}=splitSkills(skills,[]);
/** A run context frozen like a new version 5 shared Local run (apps/local-runner/local-claude/run-context.ts). */
const v5=buildRunContext({briefText:'{"product":"lamp"}',brandPack:'BRAND CHARACTER\nCalm.',packVersion:1,commonSkills:common,roleSkills:byRole,materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},planningChat:true,schemaInText:true,stageSkills:buildStageSkills(skills,[]),positive:POSITIVE_DEFAULT,imageOwner:true,critic:true});
/** The block's frozen visual-direction agent (studio_run_agent_overrides holds the block's director instructions). */
const agent={role:'visual-direction',instructions:staticRoleInstructions.director,step_cap_micro_usd:5_000_000,model_id:'anthropic/claude-sonnet-4.5',max_output_tokens:32000};
const designerArgs={role:'designer',heroChat:true,prior:false,mode:'local_claude',contextMode:'shared',stageSkills:!!v5.stageSkills};

test('Designer admission: the database rule is mirrored, and the old designer snapshot breaks it', ()=>{
 // The rule itself, in the latest definition of the admission function.
 const sql=readFileSync('supabase/migrations/20261029005500_planning_admission_scope.sql','utf8');
 assert.ok(sql.includes("snapshot->>'instructions' is distinct from agent->>'instructions'")&&/raise exception 'CHECKPOINT_CONFIG_MISMATCH'/.test(sql));
 const sqlBlock=readFileSync('supabase/migrations/20261028004500_director_role_models.sql','utf8');assert.ok(sqlBlock.includes("insert into public.studio_run_agent_overrides(run_id,role,model_id,instructions,block_id,created_by) values(b.run_id,pair.role_name,m->>'modelId',m->>'instructions'"),'the block freezes the director instructions');
 // Before the fix: the designer's snapshot carried the role line as its instructions (the live failure).
 assert.match(frozenAdmissionProblem({instructions:DESIGNER_ROLE_V4,stepCapMicroUsd:agent.step_cap_micro_usd},agent)!,/instructions differ from the frozen visual-direction agent/);
 // After: the frozen instructions stay; the role line travels beside them.
 const line=designerRoleLine(designerArgs);assert.equal(line,DESIGNER_ROLE_V4);
 assert.equal(frozenAdmissionProblem({instructions:agent.instructions,roleInstructions:line,stepCapMicroUsd:agent.step_cap_micro_usd} as never,agent),null);
 assert.match(frozenAdmissionProblem({instructions:agent.instructions,stepCapMicroUsd:agent.step_cap_micro_usd+1},agent)!,/step cap/);
 for(const change of [{role:'critic'},{heroChat:false},{prior:true},{mode:'openrouter'},{contextMode:'fresh'},{stageSkills:false}])assert.equal(designerRoleLine({...designerArgs,...change}),undefined,JSON.stringify(change));
 const worker=readFileSync('apps/local-runner/director/worker.ts','utf8');
 assert.ok(!/instructions:DESIGNER_ROLE_V4/.test(worker),'the worker never puts the role line in the admitted instructions');
 assert.match(worker,/instructions:config\.instructions,\.\.\.\(roleLine\?\{roleInstructions:roleLine\}:\{\}\)/);assert.match(worker,/frozenAdmissionProblem\(cfg,agent\)/);
});

test('Designer admission: the Local request sends exactly what D1 sent (the role line), and is quoted on it', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'adm-home-'));const dir=await mkdtemp(join(tmpdir(),'adm-')),f=fixture('plain-planning');
 const send=async(cfg:typeof f.cfg,name:string)=>{const rec=join(dir,name);await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>v5,role:'designer',stage:'design-hero'})(f.model,f.prompt,cfg);const {args,cwd:_cwd,...sent}=JSON.parse(readFileSync(rec,'utf8')) as {args:string[];cwd:string};void _cwd;return JSON.stringify({...sent,args:args.map(x=>x.replace(/toggle-cli-[^/]+/,'tmp'))});};
 const before=await send({...f.cfg,instructions:DESIGNER_ROLE_V4},'before.json'),now=await send({...f.cfg,instructions:agent.instructions,roleInstructions:DESIGNER_ROLE_V4},'now.json');
 assert.equal(now,before,'byte-identical CLI request');assert.ok(now.includes('The designer of this ad'));assert.ok(!now.includes(agent.instructions.slice(0,60)),'the frozen director brief is not sent');
 assert.equal(textRequestQuote(f.prompt,{...f.cfg,instructions:agent.instructions,roleInstructions:DESIGNER_ROLE_V4}).inputTokenBound,textRequestQuote(f.prompt,{...f.cfg,instructions:DESIGNER_ROLE_V4}).inputTokenBound,'sized on what is sent');
});
