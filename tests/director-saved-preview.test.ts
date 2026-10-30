import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import recorded from '../fixtures/director/static/saved-preview-events.json';
import {savedPreviews} from '../packages/director/saved-preview';
import {SavedDraftPreview} from '../components/studio/saved-draft-preview';
import type {DirectorEvent} from '../packages/director/events';
const events=recorded.events as DirectorEvent[];
test('recorded render history projects one latest cached image per variant scene and moment',()=>{
 assert.equal(recorded.originalRenderEventCount,202);assert.equal(recorded.originalCheckPasses,5);
 const frames=savedPreviews(events,recorded.variants,recorded.iterationId);
 assert.equal(frames.length,40);assert.equal(new Set(frames.map(f=>f.variant.format)).size,4);
 for(const frame of frames){const matching=events.filter(e=>e.stepId.includes(frame.variant.id)&&e.stepId.includes(frame.sceneId)&&e.stepId.endsWith(frame.moment));assert.equal(frame.event.at,matching.map(e=>e.at).sort().at(-1));}
 const old={...events[0],stepId:events[0].stepId.replace(recorded.iterationId,'old-iteration'),at:'2099-01-01T00:00:00Z'};
 assert.deepEqual(savedPreviews([...events,old],recorded.variants,recorded.iterationId),frames);
 assert.equal(savedPreviews([{...events[0],kind:'picture'}],recorded.variants).length,0);
});
test('stopped unsealed preview shows one saved image and no action that can start paid or render work',()=>{
 const html=renderToStaticMarkup(React.createElement(SavedDraftPreview,{events,variants:recorded.variants,iterationId:recorded.iterationId,scenes:recorded.scenes}));
 assert.match(html,/Saved preview · free/);assert.match(html,/work in progress, not checked/);assert.equal((html.match(/<img /g)??[]).length,1);assert.equal((html.match(/<select /g)??[]).length,7);assert.ok(!html.includes('<form'));const buttons=html.match(/<button[^>]*>/g)??[];assert.equal(buttons.length,7);assert.ok(buttons.every(button=>button.includes('role="combobox"')&&button.includes('type="button"')));assert.match(html,/Switching here never starts work/);
});
