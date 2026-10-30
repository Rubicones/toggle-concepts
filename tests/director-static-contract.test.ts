import {test} from 'node:test';
import assert from 'node:assert/strict';
import input from '../fixtures/director/static/input.json';
import design from '../fixtures/director/static/director-response.json';
import oldDesign from '../fixtures/director/director-response.json';
import oldInput from '../fixtures/director/input.json';
import {readDesign} from '../packages/director/contract';
import {slimDirectorInput} from '../packages/director/inputs';
import {resourceRequest} from '../packages/director/resources';
import type {DirectionInput} from '../packages/director/types';
const context={...input,resourceIds:['static-resource']} as DirectionInput;
test('static designs cover each scene with unique moments, while motion contracts stay readable',()=>{
 assert.equal(readDesign(design,context).keyFrames?.length,input.storyboard.length);assert.ok(readDesign(oldDesign,oldInput as DirectionInput));
 assert.throws(()=>readDesign({...design,keyFrames:design.keyFrames.slice(1)},context),/SCENE_KEY_FRAMES/);
 assert.throws(()=>readDesign({...design,keyFrames:[...design.keyFrames,design.keyFrames[0]]},context),/SCENE_KEY_FRAMES/);
});
test('video and 3d needs require labelled low-resolution still proxies',()=>{
 const resource={id:context.resourceIds[0],kind:'still',proxy:true,proxyFor:'video',resolution:'low',purpose:'Video proxy',scene:context.storyboard[0].id,prompt:'Band at a mixing desk',aspect:'1:1',referenceAssetIds:[],mustNotContain:[]};
 const accepted=readDesign({...design,resources:[resource]},context);assert.equal(resourceRequest(accepted.resources[0],context,20000).resolution,'draft');
 for(const change of [{kind:'video'},{kind:'3d-still'},{proxy:false},{resolution:'high'}])assert.throws(()=>readDesign({...design,resources:[{...resource,...change}]},context));
});
test('slim director input carries reference copy and compact axes, never full raw sources or other locale copy',()=>{
 const large=structuredClone(context);large.brand.rawKit={materials:[{text:'SECRET'.repeat(100000)}]};large.brand.copy.hidden={zz:'OTHER_COPY'};
 const slim=JSON.stringify(slimDirectorInput(large));assert.ok(!slim.includes('SECRET'));assert.ok(!slim.includes('OTHER_COPY'));assert.ok(slim.length<20000);
});
