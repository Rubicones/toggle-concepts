import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultAgentSettings} from '../packages/agents/defaults';
import {staticDirectorPrompt} from '../packages/agents/prompts/director-v1';
import {liveCriticInstructions} from '../packages/agents/prompts/director-critic-v1';
import {ideaReviewPrompt} from '../packages/contracts/idea-review';

const role=(r:string)=>defaultAgentSettings.find(a=>a.role===r)!.instructions;
test('ideas are visual systems and scenarios are frame sequences, for any kind of product',()=>{
 assert.match(role('strategy'),/three different visual ideas/);assert.match(role('strategy'),/A territory is not a story/);
 assert.match(role('script'),/frame sequences inside each territory's visual system, not plots/);assert.match(role('script'),/never repeats one layout/);assert.match(role('script'),/Each frame shows what its words say/);
 for(const r of ['strategy','script','visual-direction']){const t=role(r);assert.match(t,/WHAT THE AD MUST DO/);assert.match(t,/within two seconds/);assert.match(t,/a product without a physical form is never forced into one/);assert.doesNotMatch(t,/product is the hero|hero of every frame/i);}
});
test('the director, the live critic and every idea review check the same things',()=>{
 assert.match(staticDirectorPrompt.instructions,/never repeat one layout across scenes/);assert.match(staticDirectorPrompt.instructions,/shows what its words say/);
 assert.match(liveCriticInstructions,/shows what its words say/);assert.match(liveCriticInstructions,/do not repeat one layout/);
 assert.match(ideaReviewPrompt('strategy',{}),/visual ideas, not stories/);assert.match(ideaReviewPrompt('script',{}),/works alone within two seconds/);assert.match(ideaReviewPrompt('asset-plan',{}),/brand is unmistakable/);
});
test('strategy stays at the level of ideas so its answer fits one response',()=>{
 assert.match(role('strategy'),/Stay at the level of ideas/);assert.match(role('strategy'),/No timings, sizes, per-format layouts, final copy or asset briefs/);
});
test('idea reviews send work back only for serious problems; smaller notes go to the AD',()=>{
 for(const key of ['strategy','script','asset-plan'] as const){const p=ideaReviewPrompt(key,{});assert.match(p,/Send the work back only for a serious problem/);assert.match(p,/accept and list it under problems for the AD/);assert.match(p,/revised once and continues without another review/);assert.doesNotMatch(p,/hard to please|Accept only when all three are strong/);}
});
