import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assembleStatic} from '../apps/local-runner/director/static-assembler';
import {lintStaticComposition} from '../packages/director/policy.local';
import {createWorkspace} from '../apps/local-runner/director/workspace';
import input from '../fixtures/director/static/input.json';
import type {DirectionInput} from '../packages/director/types';
import type {LoopState} from '../packages/director/state';
test('recorded draft-first coder writes Frame on request one and finishes without tool requests',async()=>{
 const source=await readFile('fixtures/director/static/Frame.tsx','utf8'),actions:string[]=[];let requests=0;
 const state:LoopState={turn:0,startedAt:0,transcript:[],complete:false};
 await assembleStatic({state,maxTurns:9,timeMs:600000,now:()=>1,call:async(_,mode)=>{requests++;assert.equal(mode,'files');return JSON.stringify({files:[{path:'Frame.tsx',source}]});},tool:async a=>{actions.push(a.tool);return a.tool==='finish'?{complete:true,sourceHash:'fixture'}:{passed:true};},save:async()=>{}});
 assert.equal(requests,1);assert.deepEqual(actions,['write','typecheck','bundle','finish']);assert.equal(state.complete,true);assert.deepEqual(lintStaticComposition(source),[]);
});
test('two direct repairs precede the lenient fallback; malformed output never hides valid later writes',async()=>{
 const state:LoopState={turn:0,startedAt:0,transcript:[],complete:false},modes:string[]=[];
 await assembleStatic({state,maxTurns:9,timeMs:600000,now:()=>1,call:async(_,mode)=>{modes.push(mode);return mode==='files'?'{}':'{"calls":[{"tool":"finish"}]}';},tool:async()=>({complete:true}),save:async()=>{}});
 assert.deepEqual(modes,['files','files','files','tools']);assert.equal(state.turn,4);
});
test('draft policy rejects motion and alias imports while keeping the motion-stage policy intact',()=>{
 for(const source of ["import {useCurrentFrame as f} from 'remotion';", "import * as R from 'remotion';", "import {ThreeCanvas} from '@remotion/three';", "import {gsap} from './runtime';", "import x from 'gsap';", "const x={animation:'pulse 1s'}", "import {useEffect as e} from 'react'"])assert.ok(lintStaticComposition(source).length,source);
});
test('static workspace mounts Frame with one still and no motion runtime',async()=>{
 const root=await mkdtemp(join(tmpdir(),'m09-static-'));try{const folder=await createWorkspace(root,input as DirectionInput),entry=await readFile(join(folder,'entry.tsx'),'utf8');assert.match(entry,/from '.\/Frame'/);assert.match(entry,/durationInFrames=\{1\}/);assert.ok(!entry.includes('calculateMetadata'));await assert.rejects(()=>readFile(join(folder,'runtime.ts')));}finally{await rm(root,{recursive:true,force:true});}
});
test('a revision receives its existing authored source and large revisions use tools without blind source rewrites',async()=>{
 const {staticSourceContext}=await import('../apps/local-runner/director/static-assembler'),{writeFile}=await import('node:fs/promises'),root=await mkdtemp(join(tmpdir(),'m09-revision-'));try{
 const folder=await createWorkspace(root,input as DirectionInput);await writeFile(join(folder,'Frame.tsx'),'export default function Frame(){return null;}');const context=await staticSourceContext(folder,'i');assert.equal(context.files.length,1);assert.equal(context.files[0].path,'Frame.tsx');assert.equal(context.oversized,false);
 const state:LoopState={turn:0,startedAt:0,transcript:[],complete:false};let seenSource='';await assembleStatic({state,maxTurns:9,timeMs:100,now:()=>1,filesContext:async()=>context,call:async(_,mode,files)=>{assert.equal(mode,'files');seenSource=files![0].source;return JSON.stringify({files:[{path:'Frame.tsx',source:seenSource}]});},tool:async a=>a.tool==='finish'?{complete:true}:{passed:true},save:async()=>{}});assert.match(seenSource,/export default/);
 await writeFile(join(folder,'Frame.tsx'),'x'.repeat(17000));assert.equal((await staticSourceContext(folder,'i')).oversized,true);
 const fallback:LoopState={turn:0,startedAt:0,transcript:[],complete:false};await assembleStatic({state:fallback,maxTurns:9,timeMs:100,now:()=>1,filesContext:async()=>({files:[],oversized:true}),call:async(_,mode)=>{assert.equal(mode,'tools');return '{"calls":[{"tool":"finish"}]}';},tool:async()=>({complete:true}),save:async()=>{}});assert.equal(fallback.turn,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('live fallback schema exposes source tools and never exposes image rendering',async()=>{
 const {staticToolsSchema}=await import('../packages/agents/prompts/static-coder'),{providerJsonSchema}=await import('../packages/director/provider-schema');
 const text=JSON.stringify(providerJsonSchema(staticToolsSchema.schema));assert.ok(!text.includes('renderStill')&&!text.includes('variantId')&&!text.includes('sceneId')&&!text.includes('moment'));assert.ok(!text.includes('preview')&&!text.includes('determinism'));assert.ok(text.includes('bundle')&&text.includes('finish'));
});
