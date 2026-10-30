import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectVariant,variantAxes} from '../packages/director/variant-selection';
import input from '../fixtures/director/static/input.json';
test('all five static viewer axes resolve only to ordered variants and retain other matching axes',()=>{
 const variants=[...input.variants,{...input.variants[0],id:'other',locale:'ru-RU'}];assert.equal(variantAxes.length,5);
 assert.equal(selectVariant(variants,variants[0],'locale','ru-RU').id,'other');assert.equal(selectVariant(variants,variants[0],'format','wide').id,'wide');assert.equal(selectVariant(variants,variants[0],'length','999').id,variants[0].id);
});
test('static draft compatibility viewer delegates to the live component without image requests',async()=>{
 const source=await readFile('components/studio/static-draft-viewer.tsx','utf8');assert.ok(!/<video|Player|playback/i.test(source));assert.match(source,/LiveDraftGenerator/);assert.ok(!source.includes("action:'render'")&&!source.includes('Download contact sheet'));
 const delivery=await readFile('apps/local-runner/director/delivery.ts','utf8');assert.match(delivery,/video:input.stage!=='draft'/);assert.match(delivery,/static-delivery@1/);
});
