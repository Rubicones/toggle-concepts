// Local pipeline reliability: what counts as a passing failure for the run coordinator, and how many directions the
// runner works on at once. No live calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {temporaryCoordinatorFailure,TEMPORARY_FAILURE_LIMIT} from '../apps/local-runner/guided-campaign';
import {directorParallel} from '../apps/local-runner/director/worker';

test('a slow database or a restarting studio page does not block a stage; real refusals still do', ()=>{
 assert.equal(temporaryCoordinatorFailure('DATABASE_BUSY'),true);
 assert.equal(temporaryCoordinatorFailure('LOCAL_API_UNAVAILABLE'),true);
 assert.equal(temporaryCoordinatorFailure('DIRECTOR_ADMISSION_FAILED','canceling statement due to statement timeout'),true,'the stop the owner saw on 12 November');
 assert.equal(temporaryCoordinatorFailure('RUN_COORDINATOR_FAILED','fetch failed'),true);
 assert.equal(temporaryCoordinatorFailure('DIRECTOR_ADMISSION_FAILED','ESTIMATE_EXCEEDS_RUN_LIMIT'),false);
 assert.equal(temporaryCoordinatorFailure('ASSETS_REQUIRED'),false);
 assert.ok(TEMPORARY_FAILURE_LIMIT>=5);
});

test('directions are worked on side by side on a Local device, one at a time otherwise, and the owner can set it', ()=>{
 const before=process.env.STUDIO_DIRECTOR_PARALLEL;delete process.env.STUDIO_DIRECTOR_PARALLEL;
 assert.equal(directorParallel({schema:true,setup:{} as never}),2);assert.equal(directorParallel({schema:false}),1);
 process.env.STUDIO_DIRECTOR_PARALLEL='1';assert.equal(directorParallel({schema:true,setup:{} as never}),1);
 process.env.STUDIO_DIRECTOR_PARALLEL='3';assert.equal(directorParallel({schema:false}),3);
 process.env.STUDIO_DIRECTOR_PARALLEL='9';assert.equal(directorParallel({schema:false}),1,'out of range: the default');
 if(before===undefined)delete process.env.STUDIO_DIRECTOR_PARALLEL;else process.env.STUDIO_DIRECTOR_PARALLEL=before;
});

import {cliTimeoutMs} from '../apps/local-runner/local-claude/transport';
test('a Local answer gets at least fifteen minutes: thinking and a large context are not in the answer length', ()=>{
 assert.equal(cliTimeoutMs({maxOutputTokens:8000}),900000,'visual-direction stopped at 188 s before');
 assert.equal(cliTimeoutMs({maxOutputTokens:64000}),1084000);
 assert.equal(cliTimeoutMs({maxOutputTokens:8000,timeoutMs:120000}),120000,'an explicit limit still applies');
 assert.equal(cliTimeoutMs({maxOutputTokens:8000,timeoutMs:9e9}),1800000);
 assert.equal(cliTimeoutMs({maxOutputTokens:8000,stream:true}),600000);
});

import {runCli} from '../packages/agents/claude-cli.local';
import {fakeBin} from './local-chat-shaped.test';
test('a working answer is never cut for being long; a silent, stuck process is ended', async()=>{
 const run=async(scenario:string,idleMs:number|undefined,timeoutMs:number)=>{const bin=await fakeBin(scenario);return runCli({bin,argv:[],cwd:process.cwd(),env:process.env,stdin:'{}\n',timeoutMs,...(idleMs?{idleMs}:{})});};
 const slow=await run('slowstream',300,8000);
 assert.equal(slow.outcome,'succeeded','pieces kept arriving: about a second of work with a 0.3 s silence limit');
 const stuck=await run('stall',300,8000);
 assert.equal(stuck.failure,'CLI_STALLED');assert.ok(stuck.durationMs<4000,'ended by the silence limit, long before the total limit');
 const quiet=await run('hang',300,1500);
 assert.equal(quiet.failure,'CLI_TIMEOUT','a CLI that never streamed is bounded by the total limit only');
});

import {localTemporaryStop,LOCAL_RECOVERY_LIMIT} from '../packages/director/execution-failures';
import {LOCAL_TEXT_RESERVATION_MICRO_USD} from '../packages/agents/local-usage';
test('Local drafts continue by themselves after a text request that cost nothing; paid image stops still ask', ()=>{
 for(const code of ['LOCAL_RESULT_MISSING','LOCAL_REQUEST_INTERRUPTED','LOCAL_REQUEST_LIVE','PROVIDER_RECONCILIATION_REQUIRED','SAVED_REQUEST_FAILED','CLI_TIMEOUT','CLI_STALLED'])assert.equal(localTemporaryStop(code),true,code);
 for(const code of ['CREATIVE_IMAGE_RECONCILIATION_REQUIRED:outcome unknown','CREATIVE_IMAGE_FAILED:PROVIDER_400','RESOURCE_PERMISSION_REQUIRED','PROMPT_TOO_LONG','DRAFT_REQUEST_SIZE_CAP','ESTIMATE_EXCEEDS_RUN_LIMIT'])assert.equal(localTemporaryStop(code),false,code);
 assert.ok(LOCAL_RECOVERY_LIMIT>=5&&LOCAL_RECOVERY_LIMIT<=20,'bounded');
 assert.equal(LOCAL_TEXT_RESERVATION_MICRO_USD,1,'a Local text request reserves the minimum against money caps');
});
