import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planBuildRepair} from '../packages/creative/build-repair';
import {quoteBuildRepairCommand,type CreativeIssue} from '../packages/contracts/creative-drafts';

const issue=(path:string,severity:CreativeIssue['severity']='block'):CreativeIssue=>({code:'MISSING',path,severity,owner:'compositor',message:'Missing required build content',fix:'Restore the source binding'});

test('repair starts at the earliest broken build translation step',()=>{
 const plan=planBuildRepair([issue('media.elements.e1'),issue('script.bindings.0'),issue('scenes.beats.b0')])!;
 assert.equal(plan.stage,'script');
 assert.deepEqual(plan.issues.map(i=>i.path),['bindings.0']);
 assert.deepEqual(plan.rebuild,['script','treatment','scenes','media','compile','critic']);
 assert.equal(plan.rebuild.some(stage=>['strategy','localization','asset-plan'].includes(stage)),false);
});

test('a media-only correction preserves earlier adaptation and scene work',()=>{
 const plan=planBuildRepair([issue('media.elements.e1'),issue('scenes.beats.b0','warn')])!;
 assert.equal(plan.stage,'media');
 assert.deepEqual(plan.rebuild,['media','compile','critic']);
 assert.deepEqual(plan.issues.map(i=>i.path),['elements.e1']);
});

test('warnings alone do not create a paid repair',()=>{
 assert.equal(planBuildRepair([issue('media.elements.e1','warn')]),null);
 assert.equal(planBuildRepair([]),null);
});

test('repair quote requests identify only a direction; price, job and limits are server-owned',()=>{
 assert.deepEqual(quoteBuildRepairCommand.parse({action:'quoteBuildRepair',direction:0}),{action:'quoteBuildRepair',direction:0});
 for(const value of [{action:'quoteBuildRepair',direction:3},{action:'quoteBuildRepair',direction:-1},{action:'quoteBuildRepair',direction:0,maxCostMicroUsd:0},{action:'quoteBuildRepair',direction:0,jobId:crypto.randomUUID()}])assert.equal(quoteBuildRepairCommand.safeParse(value).success,false);
});
