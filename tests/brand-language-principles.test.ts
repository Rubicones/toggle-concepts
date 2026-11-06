import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultAgentSettings} from '../packages/agents/defaults';
import {craftStandards,studioRules} from '../packages/agents/creative-method';
import {staticDirectorPrompt} from '../packages/agents/prompts/director-v1';
import {staticCoderInstructions} from '../packages/agents/prompts/static-coder';
import {liveCriticInstructions} from '../packages/agents/prompts/director-critic-v1';
import {planningTransportTask} from '../packages/contracts/localization';

test('principles ask for clear hierarchy, not an empty frame',()=>{
 assert.match(craftStandards,/clear hierarchy: the headline reads in two seconds and the detail rewards a longer look/);
 assert.match(craftStandards,/nothing belongs that is neither the brand's nor the idea's; an empty frame is not a finished one/);
 const all=[craftStandards,staticDirectorPrompt.instructions,liveCriticInstructions,planningTransportTask('script'),...defaultAgentSettings.map(a=>a.instructions)].join('\n');
 assert.doesNotMatch(all,/one focal point|one thing to see|decorative without a reason/);
 assert.match(liveCriticInstructions,/a clear hierarchy: the headline reads in two seconds/);
});

test('every creative planning role applies the studio rules for generated pictures',()=>{
 assert.match(studioRules,/Text and logos are never part of a generated picture/);assert.match(studioRules,/one camera angle per scene across all formats/);
 for(const role of ['script','visual-direction'])assert.ok(defaultAgentSettings.find(a=>a.role===role)!.instructions.includes(studioRules),role);
 // Design quality plan, point 1a: picture policy is production, so the strategy no longer carries it.
 assert.ok(!defaultAgentSettings.find(a=>a.role==='strategy')!.instructions.includes(studioRules));
});

test('the director and the coder build from the brand own components and colours',()=>{
 const d=staticDirectorPrompt.instructions;
 assert.match(d,/product\.components, product\.interfaceColors and brand\.interface with the scenario's productData/);assert.match(d,/vocabulary, not a template/);
 assert.match(d,/engraved or printed type/);assert.match(d,/one camera angle per scene across formats/);
 assert.match(staticCoderInstructions,/the kit's product\.components and product\.interfaceColors/);
});
