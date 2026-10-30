import {test} from 'node:test';
import assert from 'node:assert/strict';
import recorded from '../fixtures/creative/scenario-drift.json';
import {sonicdeskFixture} from '../fixtures/creative/sonicdesk';
import {creativeDirectionSchema} from '../packages/contracts/frame-program';
import {mediaPlanSchema,sceneSpecV2Schema} from '../packages/contracts/creative-drafts';
import {normalizeMediaRaw,normalizeScenesRaw} from '../packages/creative/normalize';
import {validateMedia,validateScenes} from '../packages/creative/validate';
import {sourceStoryboard,prepareCreativeOutput} from '../packages/creative/protocol';
import {computeCopyBudget} from '../packages/creative/copy-budget';
import {sequenceFrames,validateSequence} from '../packages/creative/timeline';
import {normalizeScriptL0} from '../packages/creative/repair';
import {compileVariant} from '../packages/creative/compile-v2';
import {validateRenderedCopy} from '../packages/creative/build-integrity';

const direction=creativeDirectionSchema.parse(recorded.direction);
const aliases=[{key:'a0',revisionId:'2c53ff69-8766-42a6-aca0-8aadbbaf447f',width:478,height:1009}];

test('recorded generic hero binding stays unresolved and keeps its 32 UI panels',async()=>{
 const f=await sonicdeskFixture(),plan=mediaPlanSchema.parse(normalizeMediaRaw(recorded.rawMedia,f.brand,direction.script,aliases));
 // The generic logo row binds a kit logo element; the generic hero UI stays unresolved for repair, with its panels.
 assert.deepEqual(plan.elements.map(e=>e.element),['e13','hero','e14']);
 assert.equal(plan.elements.find(e=>e.element==='hero')!.ui!.panels.length,32);
 assert.equal(plan.elements.some(e=>e.element==='e1'),false,'A musician montage must never acquire the first screenshot by fallback.');
 assert.ok(validateMedia(plan,direction.script,f.brand,['a0']).some(i=>i.code==='MEDIA_BINDING'));
 assert.ok(validateMedia(plan,direction.script,f.brand,['a0']).some(i=>i.code==='UNKNOWN_ELEMENT'));
});

test('recorded empty UI recreations are blocked even though the old media job succeeded',async()=>{
 const f=await sonicdeskFixture(),issues=validateMedia(direction.media,direction.script,f.brand,aliases.map(a=>a.revisionId));
 assert.equal(issues.filter(i=>i.code==='UI_EMPTY').length,2);
});

test('recorded scenes with swapped key/element fields are read as meant, not replaced by invented layers',async()=>{
 // The recorded answer put the element key in "key" and the asset alias in "element"; its own layer is kept.
 const f=await sonicdeskFixture(),scenes=sceneSpecV2Schema.parse(normalizeScenesRaw(recorded.rawScenes,f.brand,direction.script,direction.treatment));
 assert.equal(scenes.beats[1].layers[0].element,'e1');assert.equal(scenes.beats[1].layers[0].source,'a1');
 const issues=validateScenes(scenes,direction.script,f.brand).filter(i=>i.severity==='block');
 assert.deepEqual(issues.map(i=>i.code),[],JSON.stringify(issues));
});

test('all five recorded critic findings survive invalid paths; the blocking ones require repair',async()=>{
 const f=await sonicdeskFixture(),upstream=(['script','treatment','scenes','media'] as const).map(stage=>({output:JSON.stringify({version:'creative-result@1',stage,value:direction[stage]})}));
 const input={checkpointId:'c1',direction:0,directionId:direction.id,brand:f.brand,budget:computeCopyBudget(f.brand,f.scope),scope:f.scope,variants:f.variants,protectedCopy:[],assetAliases:aliases.map(a=>({...a,sha256:'a'.repeat(64),mime:'image/png',summary:'Product screenshot'}))};
 const result=prepareCreativeOutput(JSON.stringify(recorded.rawCritic),'critic',input,upstream),report=result.value as {findings:{severity:string}[]};
 assert.equal(report.findings.length,5);
 assert.equal(report.findings.filter(f=>f.severity==='block').length,2);
 // Blockers cannot become a clean review; an unplaceable warning stays in the report without stopping the build.
 assert.equal(result.issues.filter(i=>i.code==='CRITIC_PATH'&&i.severity==='block').length,2);
 assert.ok(result.issues.every(i=>/^findings\.\d+\.path$/.test(i.path)));
});

test('variant bindings cannot bypass the short cutdown limit',()=>{
 const cut=direction.script.cutdowns.find(c=>c.durationSeconds===6)!,binding=direction.script.bindings!.find(b=>b.durationSeconds===6)!;
 assert.equal(cut.beats.length,2);assert.equal(binding.beats.length,6);
 assert.ok(validateSequence(direction.script,binding,'bindings.0').some(i=>i.code==='CUTDOWN_BEAT_LIMIT'));
 assert.throws(()=>sequenceFrames(direction.script,binding,30),/INVALID_EDIT_SEQUENCE/);
});

test('the approved four-shot six-second storyboard retains its exact timing at each fps',()=>{
 const script=structuredClone(direction.script),ids=['b0','b1','b2','b5'];script.sourceScenes=recorded.scenario.timedStoryboard;
 for(const [i,id] of ids.entries())script.beats.find(b=>b.key===id)!.sourceSceneIds=[script.sourceScenes[i].sceneId];
 const edit={durationSeconds:6,beats:ids};
 assert.deepEqual(sequenceFrames(script,edit,30),[45,60,45,30]);
 assert.deepEqual(sequenceFrames(script,edit,60),[90,120,90,60]);
 assert.ok(validateSequence(script,{...edit,beatSeconds:[1.5,1.5,1.5,1.5]},'cutdowns.0').some(i=>i.code==='SCENARIO_TIMING'));
 assert.ok(validateSequence(script,{...edit,beats:['b0','b5']},'cutdowns.0').some(i=>i.code==='SCENARIO_COVERAGE'));
 const {script:normalized}=normalizeScriptL0({...script,cutdowns:[edit]}, {durationsSeconds:[6],locales:['en-GB']},{logos:[]} as never);
 assert.deepEqual(normalized.cutdowns[0].beats,ids,'Normalization must not reduce an approved original-duration storyboard to two beats.');
});

test('adapted edits require authored timing and round frame boundaries without losing duration',()=>{
 const script=structuredClone(direction.script);script.sourceScenes=recorded.scenario.timedStoryboard;const ids=['b0','b1','b2','b5'];
 for(const [i,id] of ids.entries())script.beats.find(b=>b.key===id)!.sourceSceneIds=[script.sourceScenes[i].sceneId];
 const edit={durationSeconds:9,beats:ids};
 assert.ok(validateSequence(script,edit,'cutdowns.0').some(i=>i.code==='BEAT_TIMING'));
 assert.deepEqual(sequenceFrames(script,{...edit,beatSeconds:[1.25,3.5,2.25,2]},30),[38,105,67,60]);
});

test('source storyboard is taken from the selected saved scenario',()=>{
 const upstream=[{output:JSON.stringify({deliverable:{threeDirections:[recorded.scenario,{...recorded.scenario,timedStoryboard:[]}]}})}];
 assert.deepEqual(sourceStoryboard(upstream,0),recorded.scenario.timedStoryboard);
 assert.throws(()=>sourceStoryboard(upstream,1),/SOURCE_STORYBOARD_INVALID/);
});

test('a provider cannot overwrite the app-owned storyboard',async()=>{
 const f=await sonicdeskFixture(),input={checkpointId:'c1',direction:0,directionId:direction.id,brand:f.brand,budget:computeCopyBudget(f.brand,f.scope),scope:f.scope,variants:f.variants,protectedCopy:[],assetAliases:[]};
 const upstream=[{output:JSON.stringify({deliverable:{threeDirections:[recorded.scenario]}})}];
 const result=prepareCreativeOutput(JSON.stringify({...direction.script,sourceScenes:[]}), 'script',input,upstream),script=result.value as typeof direction.script;
 assert.deepEqual(script.sourceScenes,recorded.scenario.timedStoryboard);
 // The unlinked answer is re-aligned to the app-owned storyboard for free instead of stopping the build.
 assert.ok(result.repairLog.some(l=>l.code==='STORYBOARD_ALIGNED'));
 assert.ok(!result.issues.some(i=>/^SCENARIO_/.test(i.code)),JSON.stringify(result.issues.filter(i=>/^SCENARIO_/.test(i.code))));
 for(const cut of script.cutdowns)assert.ok(cut.beats.every(k=>script.beats.find(b=>b.key===k)?.sourceSceneIds?.length));
});

test('the compositor uses unequal authored beat timing',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]);d.script.cutdowns[0].beatSeconds=[1,3];
 const program=compileVariant(d,f.brand,computeCopyBudget(f.brand,f.scope),f.scope.placements[0],f.variants[0],f.engine,f.resources);
 assert.deepEqual(program.engine.config.lengths['4'].map(b=>b.dur),[1,3]);
 assert.deepEqual(program.scenes.map(s=>s.durationFrames),[30,90]);
 assert.equal(program.durationFrames,120);
});

test('a protected offer without a visible text layer blocks the compiled edit',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]);d.script.copy.push({key:'c2',beat:'b1',slot:'body',locale:'en-GB',text:'Free first month',short:[]});
 const protectedCopy=[{locale:'en-GB',slot:'offer' as const,text:'Free first month'}],program=compileVariant(d,f.brand,computeCopyBudget(f.brand,f.scope),f.scope.placements[0],f.variants[0],f.engine,f.resources,protectedCopy);
 assert.ok(program.engine.issues.some(i=>i.code==='PROTECTED_COPY_NOT_RENDERED'&&i.severity==='block'));
 assert.ok(validateRenderedCopy(d,program,protectedCopy).some(i=>i.message.includes('Free first month')));
});
