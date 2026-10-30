import test from 'node:test';
import assert from 'node:assert/strict';
import {sonicdeskFixture} from '../fixtures/creative/sonicdesk';
import {compileDirection,compileVariant} from '../packages/creative/compile-v2';
import {computeCopyBudget} from '../packages/creative/copy-budget';
import {buildFrame} from '../packages/engine/engine/frame';
import {snapshotEngine} from '../packages/engine/text-snapshot';
import {readPrograms} from '../packages/creative/program-reader';
import {resolveCreativePath} from '../packages/creative/validate';
import {directionProgramSchema} from '../packages/contracts/frame-program';

test('one shared config serves all ordered formats with replayable glyphs, source paths and bounded storage',async()=>{
 const f=await sonicdeskFixture(),budget=computeCopyBudget(f.brand,f.scope),compile=()=>compileDirection(f.directions[0],f.brand,budget,f.scope,f.variants,f.engine,f.resources),p=compile();
 directionProgramSchema.parse(p);assert.equal(p.variants.length,4);assert.equal(p.config.formats.length,4);assert.equal(p.config.meta.made_by,'planner');
 const views=readPrograms({directionPrograms:[p]}),ctx={cfg:p.config,engine:snapshotEngine(p.glyphs)};
 assert.ok(views.every(v=>v.engine.config===p.config));
 for(const v of p.variants)for(const t of [0,.25,1.9,2,3.9])assert.ok(buildFrame(ctx,v.state,t).ops.length);
 for(const issue of p.issues)assert.ok(resolveCreativePath(f.directions[0],issue.path),issue.path);
 assert.equal(JSON.stringify(compile()),JSON.stringify(p));
 assert.ok(Buffer.byteLength(JSON.stringify(p))<600_000,'Shared direction must stay below 600 KB');
});
test('historic frame@1 preview output remains readable',async()=>{
 const f=await sonicdeskFixture(),old=compileVariant(f.directions[0],f.brand,computeCopyBudget(f.brand,f.scope),f.scope.placements[0],f.variants[0],f.engine,f.resources);
 const [loaded]=readPrograms(JSON.parse(JSON.stringify({programs:[old]})));assert.equal(JSON.stringify(loaded),JSON.stringify(old));assert.ok(buildFrame({cfg:loaded.engine.config,engine:snapshotEngine(loaded.engine.glyphs)},loaded.engine.variant,.5).ops.length);
});
test('different ordered bindings at the same duration retain their timing in one config',async()=>{
 const f=await sonicdeskFixture(),d=structuredClone(f.directions[0]),variants=[f.variants[0],{...f.variants[1],hook:'h1'}];d.script.hooks.push({hookAxisId:'h1',angle:'Second hook',beat:'b0'});
 d.script.bindings=variants.map((v,i)=>({hookAxisId:v.hook,offerAxisId:v.offer,beatSequenceId:v.beatSequence,durationSeconds:4,beats:['b0','b1'],beatSeconds:i?[1,3]:[2,2],copyKeys:['c0','c1']}));
 const p=compileDirection(d,f.brand,computeCopyBudget(f.brand,f.scope),{...f.scope,hooks:['h0','h1']},variants,f.engine,f.resources);
 assert.equal(Object.keys(p.config.lengths).length,2);assert.deepEqual(p.variants.map(v=>p.config.lengths[v.state.len].map(b=>b.dur)),[[2,2],[1,3]]);
 for(const v of p.variants)assert.ok(buildFrame({cfg:p.config,engine:snapshotEngine(p.glyphs)},v.state,2.5).ops.length);
});
