import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import live from '../fixtures/creative/live/brand.json';
import {sonicdeskFixture} from '../fixtures/creative/sonicdesk';
import {loadCreativeFonts} from '../packages/creative/fonts.local';
import {compileDraftEdits,validateDraftEdits} from '../packages/creative/draft-edits';
import {draftEditsSchema,emptyDraftEdits} from '../packages/contracts/draft-edits';
import {computeCopyBudget} from '../packages/creative/copy-budget';
import {buildFrame} from '../packages/engine/engine/frame';
import {selectVariant,recordEdit,undoEdit,redoEdit} from '../components/studio/creative-editor/model';

test('browser-shaped copy edit and server reload compile to identical configs without touching the agent source',async()=>{
 const f=await sonicdeskFixture(),source=JSON.stringify(f.directions[0]),edits=emptyDraftEdits(),policy={protectedCopy:[],approvedFacts:[]};edits.copy.push({slot:'c0',variant:'h0',lang:'en-GB',lines:['Hear every detail.']});
 const serverEngine=await loadCreativeFonts(f.brand,'en-GB',async key=>{const material=live.materials.find(m=>m.objectKey===key) as unknown as {fixturePath:string};return readFile(material.fixturePath);});
 const compile=(engine:typeof f.engine,e=edits)=>compileDraftEdits(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,engine,f.resources,e,policy),client=compile(f.engine),reloaded=compile(serverEngine,draftEditsSchema.parse(JSON.parse(JSON.stringify(edits))));
 assert.equal(JSON.stringify(client.config),JSON.stringify(reloaded.config));assert.deepEqual(client.config.copy.c0.h0['en-GB'],['Hear every detail.']);assert.equal(JSON.stringify(f.directions[0]),source);
 for(const v of client.variants)assert.ok(buildFrame({cfg:client.config,engine:f.engine},v.state,.5).ops.length);
});
test('protected CTA, legal and pinned text cannot be edited even for a different variant',async()=>{const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]);d.script.copy.push({key:'legal',beat:'b1',slot:'legal',locale:'en-GB',text:'Terms apply.',short:[]});for(const slot of ['c0','c1','legal']){const e=emptyDraftEdits();e.copy.push({slot,variant:'*',lang:'en-GB',lines:['Changed']});assert.throws(()=>validateDraftEdits(e,d,f.brand,f.variants,{protectedCopy:[{locale:'en-GB',slot:'offer',text:d.script.copy[0].text}],approvedFacts:[]}),/PROTECTED_COPY_IMMUTABLE/);}});
test('unapproved data, unknown targets and cutdown timing drift are refused',async()=>{const f=await sonicdeskFixture(),base=emptyDraftEdits(),compile=(e:typeof base)=>compileDraftEdits(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources,e,{protectedCopy:[],approvedFacts:['10 tracks']});assert.throws(()=>compile({...base,data:{count:99}}),/UNAPPROVED_NUMERIC_FACT/);assert.throws(()=>compile({...base,layers:[{beat:'b0',layer:'l0',zone:'invented'}]}),/UNKNOWN_ZONE/);assert.throws(()=>compile({...base,durations:[{length:'4',beat:'b0',seconds:3}]}),/CUTDOWN_DURATION_IMMUTABLE/);assert.equal(compile({...base,data:{count:10}}).config.data?.count,10);});
test('ordered format/hook selection is local and preserves config identity; undo/redo retains overlay revisions',async()=>{const f=await sonicdeskFixture(),a=emptyDraftEdits(),b={...a,copy:[{slot:'c0',variant:'*',lang:'en-GB',lines:['Hear the detail.']}]},p=compileDraftEdits(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope,f.variants,f.engine,f.resources,a,{protectedCopy:[],approvedFacts:[]}),config=p.config;const state=selectVariant(p,p.variants[0].state,'fmt','wide');assert.equal(state.fmt,'wide');assert.equal(p.config,config);const h=recordEdit({past:[],current:a,future:[]},b);assert.deepEqual(redoEdit(undoEdit(h)).current,b);assert.deepEqual(undoEdit(h).current,a);});
