import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {effectiveRunAgents} from '../packages/data/run-limits';
import {isPlanningJob,planningJobRoles} from '../packages/contracts/planning-job';
import {studioWriteTopic} from '../packages/data/studio-changes';
import {guidedRunCommand,runAttention} from '../packages/contracts/guided-run';
import type {AgentSetting} from '../packages/contracts/shared';

test('only issued planning key/role pairs in text draft jobs use the original planning configuration',()=>{
 for(const [job_key,role]of Object.entries(planningJobRoles))assert.equal(isPlanningJob({job_key,role,kind:'text'},'draft'),true);
 for(const job of [{job_key:'asset-plan.history.restart',role:'visual-direction',kind:'text'},{job_key:'asset-plan',role:'creative-code',kind:'text'},{job_key:'asset-plan',role:'visual-direction',kind:'compile'},{job_key:'creative.director.d0',role:'visual-direction',kind:'text'}])assert.equal(isPlanningJob(job,'draft'),false);
 assert.equal(isPlanningJob({job_key:'asset-plan',role:'visual-direction',kind:'text'},'manual'),false);
});

test('planning retains C1 model/instructions and audited current limits while the draft scope retains its own override',async()=>{
 const original:AgentSetting[]=[{role:'visual-direction',model_id:'planning-model',instructions:'Plan the visual treatment.',max_output_tokens:3200,step_cap_micro_usd:500000}],before=structuredClone(original),calls:string[]=[];
 const admin=createClient('http://127.0.0.1:9999','recorded',{global:{fetch:async input=>{const path=new URL(String(input)).pathname;calls.push(path);return Response.json(path.endsWith('studio_run_agent_limits')?[{role:'visual-direction',max_output_tokens:32768,cap_micro_usd:1000000}]:[{role:'visual-direction',model_id:'draft-model',instructions:'Design the static frames.'}]);}}});
 const run={id:'run',config_snapshot:original},planning=await effectiveRunAgents(admin,run,{directorOverrides:false});
 assert.deepEqual(planning,[{...original[0],max_output_tokens:32768,step_cap_micro_usd:1000000}]);assert.equal(calls.length,1);assert.ok(!calls.some(p=>p.endsWith('studio_run_agent_overrides')));
 const drafts=await effectiveRunAgents(admin,run);assert.equal(drafts[0].model_id,'draft-model');assert.equal(drafts[0].instructions,'Design the static frames.');assert.equal(drafts[0].step_cap_micro_usd,1000000);assert.deepEqual(original,before);
});

test('planning configuration recovery is a strict explicit command without a new cap, model or output allowance',()=>{
 const command={action:'recoverPlanningConfig',jobId:'10000000-0000-4000-a000-000000000001',requestId:'10000000-0000-4000-a000-000000000002'};
 assert.ok(guidedRunCommand.safeParse(command).success);assert.equal(guidedRunCommand.safeParse({...command,runCapMicroUsd:10000000}).success,false);assert.equal(guidedRunCommand.safeParse({...command,requestId:undefined}).success,false);
 assert.match(runAttention('CHECKPOINT_CONFIG_MISMATCH')!.title,/Planning and draft/);assert.doesNotMatch(runAttention('CHECKPOINT_CONFIG_MISMATCH')!.detail,/change box/);
});

test('planning recovery publishes the saved transition while its version probe stays quiet',()=>{
 const url=(name:string)=>new URL('https://fixture.invalid/rest/v1/rpc/'+name);
 assert.equal(studioWriteTopic(url('studio_recover_planning_config'),'POST'),'work');assert.equal(studioWriteTopic(url('studio_planning_admission_version'),'POST'),null);
});
