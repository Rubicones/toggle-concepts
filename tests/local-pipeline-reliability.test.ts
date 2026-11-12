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
