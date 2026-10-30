import {test} from 'node:test';
import assert from 'node:assert/strict';
import {latestSteps,publicStepMessage,type DirectorEvent} from '../packages/director/events';
test('append-only transitions fold without discarding prior event artifacts',()=>{
 const events:DirectorEvent[]=[{id:'1',stepId:'a',kind:'request',status:'running',at:'2026-10-28T12:00:00Z',startedAt:'2026-10-28T12:00:00Z',model:'sonnet',message:'Writing'},{id:'2',stepId:'a',kind:'request',status:'done',at:'2026-10-28T12:01:00Z',costMicroUsd:42,message:'Done'}];
 assert.equal(latestSteps(events)[0].model,'sonnet');assert.equal(latestSteps(events)[0].costMicroUsd,42);assert.equal(events.length,2);
});
test('public step messages hide engine paths and codes',()=>{assert.equal(publicStepMessage('Failed artifacts/m08/code/Frame.tsx BUNDLE_FAILED'),'Failed [technical detail] technical detail');});
