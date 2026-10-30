import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyLiveControls} from '../packages/director/live-controls';
import {critiqueDecision,routeNotes} from '../packages/director/critic';
import {staticCriticInstructions} from '../packages/agents/prompts/director-critic-v1';
import type {WorkState} from '../packages/director/state';
test('live notes and wrap-up apply once without creating an allowance or replaying notes',()=>{
 const state:WorkState={notes:[]},controls=[{id:'note',action:'note' as const,recipient:'assembler' as const,body:'Improve the hierarchy'},{id:'wrap',action:'wrap-up' as const}];
 const result=applyLiveControls(state,controls);assert.equal(result.reviseDirector,false);assert.equal(result.reviseCoder,true);assert.equal(state.wrapUp,true);assert.equal(state.notes?.length,1);applyLiveControls(state,controls);assert.equal(state.notes?.length,1);
});
test('coder-only critique keeps the director reusable, while director notes require a new design',()=>{
 const notes=[{recipient:'assembler' as const,text:'Make the closing words readable.'}],decision=critiqueDecision({accepted:false,summary:'Improve hierarchy.',notes},1,{directionId:'d',iterationIds:['i']});assert.equal(decision.state,'revise');if(decision.state==='revise')assert.equal(decision.director.length,0);assert.equal(routeNotes(notes).director.length,0);
 const final=critiqueDecision({accepted:false,summary:'Still needs work.',notes},2,{directionId:'d',iterationIds:['i','j']});assert.equal(final.state,'question');assert.throws(()=>critiqueDecision({accepted:true,summary:'Okay',notes:[]},3,{directionId:'d',iterationIds:[]}),/ROUND_LIMIT/);
});
test('static critic reviews still hierarchy and adaptation and explicitly excludes motion judgement',()=>{assert.match(staticCriticInstructions,/STATIC/);assert.match(staticCriticInstructions,/Do not judge playback/);assert.match(staticCriticInstructions,/at most two|At most two/);});
