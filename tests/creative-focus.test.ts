import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creativeFocusBlock,normalizeCreativeFocus,CREATIVE_FOCUS_LIMIT,CREATIVE_FOCUS_ROLES} from '../packages/contracts/creative-focus';
import {guidedRunCommand} from '../packages/contracts/guided-run';
import {ideaReviewPrompt} from '../packages/contracts/idea-review';

test('an empty focus adds nothing; a focus is the AD direction and never outranks approved facts',()=>{
 assert.equal(creativeFocusBlock(''),'');assert.equal(creativeFocusBlock('   \n'),'');assert.equal(creativeFocusBlock(undefined),'');
 const block=creativeFocusBlock('  Split screen with a phone mockup.  ');
 assert.match(block,/^AD CREATIVE FOCUS/);assert.match(block,/"""Split screen with a phone mockup\."""/);
 assert.match(block,/never replace it with a different direction/);assert.match(block,/never overrides approved facts, copy, brand rules or permissions/);
 assert.equal(normalizeCreativeFocus('x'.repeat(CREATIVE_FOCUS_LIMIT+50)).length,CREATIVE_FOCUS_LIMIT);
 assert.deepEqual([...CREATIVE_FOCUS_ROLES],['strategy','script','visual-direction']);
});

test('the run accepts a focus at start and as its own command, within the limit',()=>{
 assert.ok(guidedRunCommand.safeParse({action:'start'}).success,'starting without a focus still works');
 assert.ok(guidedRunCommand.safeParse({action:'start',creativeFocus:'Knitted objects.'}).success);
 assert.ok(guidedRunCommand.safeParse({action:'focus',creativeFocus:''}).success,'clearing is allowed');
 assert.equal(guidedRunCommand.safeParse({action:'focus',creativeFocus:'x'.repeat(2001)}).success,false);
});

test('each idea review checks the focus first and stays within the step limit',()=>{
 const focus='y'.repeat(2000);
 for(const key of ['strategy','script','asset-plan'] as const){const p=ideaReviewPrompt(key,{},focus);assert.match(p,/AD CREATIVE FOCUS/);assert.match(p,/First check that every direction carries out this focus/);assert.ok(p.length<=15500);}
 assert.doesNotMatch(ideaReviewPrompt('strategy',{}),/AD CREATIVE FOCUS/);
});
