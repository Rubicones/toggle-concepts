import {test} from 'node:test';
import assert from 'node:assert/strict';
import inputJson from '../fixtures/director/static/input.json';
import complete from '../fixtures/director/static/director-response.json';
import {designDirection} from '../apps/local-runner/director/design';
import {recoverSavedDesign} from '../packages/director/saved-design';
import {checkDesignResource,resourceRequest} from '../packages/director/resources';
import type {WorkState} from '../packages/director/state';
import type {DirectionInput,Resource} from '../packages/director/types';

// A new block (image methods on) whose director asks for a sketch-guided still: hashes are pinned only after acceptance.
const input={...structuredClone(inputJson) as unknown as DirectionInput,resourceIds:['a','b']};
input.brief={...input.brief,imageMethodsVersion:1,resourceBindingVersion:1};
const sketched:Resource={id:'a',kind:'still',proxy:false,resolution:'low',purpose:'p',scene:input.storyboard[0].id,prompt:'A hand holding a matte card above a counter.',aspect:'1:1',referenceAssetIds:[],mustNotContain:[],sketch:{shapes:[{role:'subject',box:[0.3,0.3,0.7,0.8],tone:'mid'}]}};
const answer=JSON.stringify({...complete,resources:[sketched]});

test('a design whose still uses a sketch is accepted before the sketch is pinned (it was rejected on every attempt)',async()=>{
 assert.throws(()=>resourceRequest(sketched,input,1),/IMAGE_METHOD_SKETCH_REQUIRED/,'a request still needs the pinned sketch');
 assert.match(checkDesignResource(sketched,input,1).prompt,/ONLY a blurred blocking sketch/);
 const state:WorkState={directorFeedback:[]};let calls=0;
 await designDirection({input,state,approvedRequests:2,perStillMicroUsd:1,call:async()=>{calls++;return {text:answer};},ready:async()=>{},save:async()=>{}});
 assert.equal(calls,1);assert.equal(state.design!.resources[0].sketch!.sha256,undefined,'the worker pins it next');
 // Edit and extend sources are pinned later too; the design check still validates everything the model wrote.
 assert.doesNotThrow(()=>checkDesignResource({...sketched,sketch:undefined,aspect:'9:16',extend:{from:'b'}},input,1));
 assert.throws(()=>checkDesignResource({...sketched,id:'zz'},input,1),/UNISSUED_RESOURCE_ID/);
});

test('answers saved by the earlier rejections are recovered without a new paid request',async()=>{
 const state:WorkState={directorFeedback:[JSON.stringify({savedOutput:answer,error:'IMAGE_METHOD_SKETCH_REQUIRED'})]};
 assert.ok(recoverSavedDesign(input,state,1));
 let calls=0;await designDirection({input,state,approvedRequests:2,perStillMicroUsd:1,call:async()=>{calls++;return {text:answer};},ready:async()=>{},save:async()=>{}});
 assert.equal(calls,0);assert.ok(state.design);
});

test('an optional sketch that does not fit is dropped instead of rejecting the whole paid answer (IMAGE_METHOD_REFERENCES case)',async()=>{
 const {readDesign}=await import('../packages/director/contract');
 const assets=[1,2,3].map(n=>({id:`00000000-0000-4000-8000-00000000000${n}`,url:`r${n}.png`,thumbnail:`r${n}.png`,width:1024,height:1024,sha256:String(n).repeat(64),mime:'image/png',revisionId:`00000000-0000-4000-8000-00000000010${n}`}));
 const withRefs={...input,assets:[...input.assets,...assets]} as typeof input,refs=assets.map(a=>a.id);
 const heavy={...sketched,referenceAssetIds:refs};
 const design=readDesign({...complete,resources:[heavy]},withRefs);
 assert.equal(design.resources[0].sketch,undefined,'the sketch goes');assert.deepEqual(design.resources[0].referenceAssetIds,refs,'identity references stay');
 const badBox=readDesign({...complete,resources:[{...sketched,sketch:{shapes:[{role:'subject',box:[0.8,0.2,0.1,0.9],tone:'mid'}]}}]},withRefs);
 assert.equal(badBox.resources[0].sketch,undefined);
 // A saved answer rejected for this reason is now recovered for free.
 const state:WorkState={directorFeedback:[JSON.stringify({savedOutput:JSON.stringify({...complete,resources:[heavy]}),error:'IMAGE_METHOD_REFERENCES: a sketch leaves room for at most two other references.'})]};
 let calls=0;await designDirection({input:withRefs,state,approvedRequests:2,perStillMicroUsd:1,call:async()=>{calls++;return {text:answer};},ready:async()=>{},save:async()=>{}});
 assert.equal(calls,0);assert.ok(state.design);assert.equal(state.design!.resources[0].sketch,undefined);
});
