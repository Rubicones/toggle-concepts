import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,symlink,mkdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {lintComposition,writeSource,confinedPath} from '../packages/director/policy.local';
import {contrast,sampleFrames} from '../packages/director/checks.local';
test('composition policy rejects time, network, Node, nondeterministic animation and imports',()=>{
 for(const s of ['Math.random()','new Date()','requestAnimationFrame(tick)','fetch("/x")','setInterval(tick,1)','import fs from "node:fs"','import x from "../../private"','import x from "three/../../private"','const x={transition:"all .2s"}','useFrame(state=>state.clock.elapsedTime)'])assert.ok(lintComposition(s).length,s);
 assert.deepEqual(lintComposition('import {random,useCurrentFrame} from "remotion"; const n=random("seed")+useCurrentFrame();'),[]);
});
test('composition writes reject traversal, absolute paths, reserved files and symlink escapes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'m08-path-'));await mkdir(join(root,'owned'));await symlink(tmpdir(),join(root,'escape'));
 for(const file of ['../x.ts','/tmp/x.ts','escape/x.ts','brand.ts','entry.tsx','input.json','public/asset.json','bundle/x.ts'])await assert.rejects(()=>writeSource(root,file,'x'));
 assert.equal(await confinedPath(root,'owned/x.ts'),join(await realpath(root),'owned/x.ts'));
});
test('contrast uses relative luminance and evidence includes scene starts and final frame',()=>{
 assert.equal(contrast([0,0,0],[255,255,255]),21);assert.equal(contrast([255,255,255],[255,255,255]),1);
 const frames=sampleFrames([{id:'s',start:0,end:1,copy:[],visualNotes:'',motionNotes:'',maxStaticSeconds:.3}],30,30);assert.equal(frames[0],0);assert.equal(frames.at(-1),29);assert.ok(frames.length>=8);
});
test('render checks fail closed on absent copy and render evidence',async()=>{
 const {checkRenders}=await import('../packages/director/checks.local');
 const report=await checkRenders({format:{id:'f',width:100,height:100,fps:30,safe:{top:5,right:5,bottom:5,left:5},minTextPx:20},variant:{id:'v',format:'f',locale:'en',hook:'h',cta:'c',length:1},brand:{tokens:{},fonts:[],logos:[],rules:{allowedFonts:[],forbiddenColours:[],minimumContrast:4.5},copy:{cta:{en:'Sign up'}},facts:{},references:[]},scenes:[{id:'s',start:0,end:1,copy:['Approved'],visualNotes:'',motionNotes:'',maxStaticSeconds:.5}],samples:[],durationFrames:30,renderMs:1});
 assert.equal(report.passed,false);assert.ok(report.findings.some(f=>f.message.includes('Approved')));assert.ok(report.findings.some(f=>f.message.includes('Protected cta')));
});
