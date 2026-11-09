import {test} from 'node:test';
import {localModelFor} from '../packages/agents/local-models';
import assert from 'node:assert/strict';
import recorded from '../fixtures/director/static/input.json';
import {readPlanningDirections,readPlanningLocalization,localizationForDirection,fillShorterCutScenes} from '../packages/director/planning';
import {approvedScenes,variantFacts} from '../packages/director/inputs';
import {squarePreviewScope,squarePreviewOnly} from '../packages/director/preview-scope';
import {constructionProgress} from '../packages/director/construction';
import {inspectionViews} from '../packages/director/layout-inspection';
import {designerViews} from '../apps/local-runner/director/designer-loop';
import type {DirectionInput} from '../packages/director/types';
const entries=[{id:'binding-one',conceptSlot:1,locale:'en-GB',hook:'primary',beatSequence:'primary',offer:'primary',durationSeconds:12,placementId:'vertical'},{id:'binding-hook',conceptSlot:1,locale:'en-GB',hook:'hook-1',beatSequence:'primary',offer:'primary',durationSeconds:12,placementId:'vertical'}];
const directions=readPlanningDirections({directions:[1,2,3].map(n=>({conceptId:`concept-${n}`,hook:{primary:`Direction ${n}`, 'hook-1':`Alternate ${n}`},storyboard:[{sceneId:'scene-1',start:0,end:2,copy:`Direction ${n}`,visualNotes:`Visual ${n}`},{sceneId:'scene-2',start:2,end:4,copy:`Proof ${n}`,visualNotes:`Proof scene ${n}`}]}))});
test('single final concept localization cannot overwrite another draft direction with reused scene IDs',()=>{
 const raw={localizedCopy:entries.flatMap(e=>[1,2].map(n=>({copySlot:`scene-${n}`,locale:e.locale,variantIds:[e.id],text:n===1?'Foreign opening':'Foreign proof'})))};
 const rows=fillShorterCutScenes(readPlanningLocalization(raw,entries,true),entries);
 assert.ok(rows.every(r=>r.direction==='concept-1'));
 const selected=directions[2],scenes=approvedScenes(selected.storyboard,'issued-3'),localized=localizationForDirection(rows,selected,directions);
 assert.equal(localized.length,0);
 const variants=entries.map(e=>({id:e.id,format:e.placementId,locale:e.locale,hook:e.hook,cta:e.offer,length:e.durationSeconds}));
 const facts=variantFacts({variants,scenes,directionIndex:2,isolatedDirection:true,sourceDirections:directions,referenceLocale:'en-GB',localization:localized,protectedCopy:{}});
 assert.deepEqual(Object.values(facts['binding-one'].sceneCopy),[['Direction 3'],['Proof 3']]);
 assert.deepEqual(Object.values(facts['binding-hook'].sceneCopy),[['Alternate 3'],['Proof 3']]);
 assert.ok(!JSON.stringify(facts).includes('Foreign'));
 assert.throws(()=>variantFacts({variants:variants.map(v=>({...v,locale:'de-DE'})),scenes,directionIndex:2,isolatedDirection:true,sourceDirections:directions,referenceLocale:'en-GB',localization:localized,protectedCopy:{}}),/APPROVED_LOCALIZED_SCENE_COPY_REQUIRED/);
});
test('direction-scoped copy is never broadcast between concept slots',()=>{
 const manifest=[entries[0],{...entries[0],id:'other',conceptSlot:2}];
 const rows=readPlanningLocalization({localizedCopy:[{copySlot:'scene-1',locale:'en-GB',variantIds:['binding-one'],text:'Only first'}]},manifest,true);
 assert.deepEqual(rows[0].variantIds,['binding-one']);assert.equal(localizationForDirection(rows,directions[1],directions).length,0);
});
test('new square scope preserves issued copy IDs, leaves the original order intact, and checks square only',()=>{
 const original=structuredClone(recorded) as DirectionInput,scope=squarePreviewScope(original.formats,original.variants),i={...original,...scope,stage:'draft' as const,brief:{draftConstructionVersion:1,squarePreviewVersion:1}};
 assert.ok(original.variants.every(v=>v.format!==undefined));assert.equal(i.formats.length,1);assert.equal(i.formats[0].width,i.formats[0].height);assert.ok(i.variants.every(v=>original.variants.some(o=>o.id===v.id)));
 const options={hooks:[...new Set(i.variants.map(v=>v.hook))],ctas:[...new Set(i.variants.map(v=>v.cta))],locales:[...new Set(i.variants.map(v=>v.locale))],lengths:[...new Set(i.variants.map(v=>v.length))],scenes:i.storyboard.map(s=>s.id),adaptive:false};
 assert.equal(constructionProgress(i,options,'square-revision',true).stage,'complete');
 const views=inspectionViews(i,options,{});assert.ok(views.length);assert.ok(views.every(v=>v.props.width===v.props.height));assert.ok(views.every(v=>v.ordered));
 assert.ok(designerViews(i,i.storyboard[0].id,[]).every(v=>v.props.width===v.props.height));
 assert.equal(squarePreviewOnly({...i,stage:'motion'}),false);
 assert.equal(constructionProgress({...i,brief:{draftConstructionVersion:1}},options,'square-revision',true).stage,'adaptation');
});

test('Opus 5.5 executes as the exact CLI Opus model, not the pinned Flash replacement',()=>{assert.equal(localModelFor('anthropic/claude-opus-5.5',{sonnet:'claude-sonnet-5-5'}).execution,'claude-opus-5-5');});

test('an explicitly direction-qualified legacy slot outranks a generic final-output binding',()=>{const rows=readPlanningLocalization({localizedCopy:[{copySlot:'onScreen_3_1',locale:'en-GB',variantIds:['binding-one'],text:'Direction three'}]},entries,true);assert.equal(rows[0].direction,'concept-3');assert.equal(localizationForDirection(rows,directions[2],directions).length,1);});
