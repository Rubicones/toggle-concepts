import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assemble} from '../apps/local-runner/director/assembler';
import type {LoopState} from '../packages/director/state';
test('assembler sees tool failures and repairs its own source before finishing',async()=>{
 const replies=[{calls:[{tool:'write',path:'Composition.tsx',source:'bad'},{tool:'typecheck'}]},{calls:[{tool:'write',path:'Composition.tsx',source:'fixed'},{tool:'checks'}]},{calls:[{tool:'finish'}]}];let source='',saved=0;const state:LoopState={turn:0,startedAt:0,transcript:[],complete:false};
 await assemble({state,maxTurns:5,maxToolCalls:10,timeMs:100,now:()=>1,call:async()=>JSON.stringify(replies.shift()),tool:async a=>{if(a.tool==='write')source=a.source;if(a.tool==='typecheck'&&source==='bad')throw new Error('Recorded type error');return a.tool==='finish'?{complete:true}:{passed:source==='fixed'};},save:async()=>{saved++;}});
 assert.equal(state.complete,true);assert.equal(source,'fixed');assert.ok(state.transcript.some(t=>t.text.includes('Recorded type error')));assert.ok(saved>=5);
});
test('persistent assembler failure ends at its allowance rather than hiding errors',async()=>{
 const state:LoopState={turn:0,startedAt:0,transcript:[],complete:false};await assert.rejects(()=>assemble({state,maxTurns:2,maxToolCalls:3,timeMs:100,now:()=>1,call:async()=>'{"calls":[{"tool":"typecheck"}]}',tool:async()=>{throw new Error('bad source');},save:async()=>{}}),/ALLOWANCE/);assert.equal(state.turn,2);assert.equal(state.complete,false);
});
test('source snapshots preserve content and ignore mutable render reports',async()=>{
 const {mkdtemp,mkdir,writeFile}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{snapshotFolder}=await import('../apps/local-runner/director/snapshots');const folder=await mkdtemp(join(tmpdir(),'m08-snapshot-'));
 await writeFile(join(folder,'Composition.tsx'),'export default function Film(){return null}');const first=await snapshotFolder(folder,'app-issued-iteration');await mkdir(join(folder,'.reports'));await writeFile(join(folder,'.reports/check.json'),'{"passed":true}');assert.equal((await snapshotFolder(folder,'app-issued-iteration')).hash,first.hash);await writeFile(join(folder,'Composition.tsx'),'export default function Film(){return <div/>}');assert.notEqual((await snapshotFolder(folder,'app-issued-iteration')).hash,first.hash);assert.match(first.files[0].id,/^[0-9a-f-]{36}$/);
});
