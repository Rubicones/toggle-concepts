import {test} from 'node:test';
import assert from 'node:assert/strict';
import recorded from '../fixtures/director/static/localization-scenes.json';
import {approvedScenes,variantFacts} from '../packages/director/inputs';
const scenes=approvedScenes(recorded.storyboard,'recorded-direction');
const args={variants:recorded.variants,scenes,directionIndex:0,referenceLocale:recorded.referenceLocale,localization:recorded.localization,protectedCopy:{}};
test('recorded onScreenCopy source aliases bind every scene in all 81 ordered variants without translation',()=>{
 const facts=variantFacts(args);assert.equal(Object.keys(facts).length,81);assert.equal(new Set(recorded.variants.map(v=>v.locale)).size,3);
 for(const variant of recorded.variants)for(const scene of scenes){assert.notEqual(scene.id,scene.sourceSceneId);const row=recorded.localization.find(r=>r.locale===variant.locale&&r.variantIds.includes(variant.id)&&r.copySlot===`onScreenCopy_${scene.sourceSceneId}`);assert.ok(row);assert.deepEqual(facts[variant.id].sceneCopy[scene.id],[row.text]);}
});
test('explicit IDs and suffix slots retain exact bindings and conflicting source aliases fail closed',()=>{
 const base={variants:[recorded.variants[0]],scenes:[scenes[0]],directionIndex:0,referenceLocale:'en-GB',protectedCopy:{}};
 const row={copySlot:`${scenes[0].sourceSceneId}_onScreen`,locale:recorded.variants[0].locale,text:'Approved hook.',variantIds:[recorded.variants[0].id]};
 assert.deepEqual(variantFacts({...base,localization:[row]})[recorded.variants[0].id].sceneCopy[scenes[0].id],['Approved hook.']);
 const explicit={...row,copySlot:'onScreen',sceneId:scenes[0].id};assert.deepEqual(variantFacts({...base,localization:[explicit]})[recorded.variants[0].id].sceneCopy[scenes[0].id],['Approved hook.']);
 assert.throws(()=>variantFacts({...base,localization:[row,{...explicit,text:'Conflicting hook.'}]}),/AMBIGUOUS_LOCALIZED_SCENE_COPY/);
});
test('narration and unrelated scene suffixes cannot stand in for missing localized display copy',()=>{
 const variant=recorded.variants.find(v=>v.locale==='de-DE')!,base={...args,variants:[variant]};
 const missing=recorded.localization.filter(r=>!(r.locale==='de-DE'&&r.variantIds.includes(variant.id)&&r.copySlot===`onScreenCopy_${scenes[0].sourceSceneId}`));
 assert.throws(()=>variantFacts({...base,localization:missing}),error=>error instanceof Error&&error.message==='APPROVED_LOCALIZED_SCENE_COPY_REQUIRED'&&String((error as Error&{detail?:string}).detail).includes('Scene 1, de-DE'));
 assert.throws(()=>variantFacts({...base,localization:[{copySlot:`onScreenCopy_${scenes[0].sourceSceneId}-extra`,text:'Other scene.',locale:'de-DE',variantIds:[variant.id]}]}),/APPROVED_LOCALIZED_SCENE_COPY_REQUIRED/);
});
