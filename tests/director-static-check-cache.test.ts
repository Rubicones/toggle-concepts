import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import inputJson from '../fixtures/director/static/input.json';
import design from '../fixtures/director/static/director-response.json';
import recorded from '../fixtures/director/static/saved-preview-events.json';
import {createWorkspace} from '../apps/local-runner/director/workspace';
import {staticStillTools as staticTools,staticCheckObservation} from '../apps/local-runner/director/static-tools';
import {applyLiveControls} from '../packages/director/live-controls';
import type {DirectionInput} from '../packages/director/types';
test('checks reject stale builds and reuse failed checks for unchanged source, including after restart',async()=>{
 const root=await mkdtemp(join(tmpdir(),'m09-check-cache-')),input=inputJson as DirectionInput;let renders=0;
 try{const folder=await createWorkspace(root,input),dependencies={sandbox:async(_folder:string,operation:string)=>{if(operation==='render'){renders++;return JSON.stringify({output:folder,report:recorded.failedCheckReport,stills:[]});}return 'Recorded build succeeded.';}},tools=staticTools(folder,input,design,Date.now()+60000,undefined,dependencies);
  await tools.execute({tool:'write',path:'Frame.tsx',source:'export default function Frame(){return null;}'});
  await assert.rejects(()=>tools.execute({tool:'checks'}),/Build the current source/);assert.equal(renders,0);
  await tools.execute({tool:'bundle'});const first=await tools.execute({tool:'checks'}) as {passed:boolean};assert.equal(first.passed,false);assert.equal(renders,input.formats.length);
  assert.equal((await tools.execute({tool:'checks'}) as {reused?:boolean}).reused,true);assert.equal(renders,input.formats.length);
  const restarted=staticTools(folder,input,design,Date.now()+60000,undefined,dependencies);assert.equal((await restarted.execute({tool:'checks'}) as {reused?:boolean}).reused,true);assert.equal(renders,input.formats.length);
  await restarted.execute({tool:'write',path:'Frame.tsx',source:'export default function Frame(){return <div>Changed source</div>;}'});await assert.rejects(()=>restarted.execute({tool:'checks'}),/Build the current source/);assert.equal(renders,input.formats.length);
  await restarted.execute({tool:'bundle'});await restarted.execute({tool:'checks'});assert.equal(renders,input.formats.length*2);
  await assert.rejects(()=>restarted.execute({tool:'finish'}),/CURRENT_SOURCE_CHECKS_REQUIRED/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('a stop control is surfaced at the next still boundary without consuming allowance',()=>{
 const state={};assert.equal(applyLiveControls(state,[{id:'stop',action:'stop'}]).stopped,true);assert.equal(applyLiveControls(state,[{id:'stop',action:'stop'}]).stopped,false);assert.ok(!('wrapUp' in state));
});
test('large recorded check reports remain structured and bounded while retaining finding counts',()=>{
 const report=recorded.failedCheckReport as import('../packages/director/types').CheckReport,reports=Object.fromEntries(inputJson.formats.map(f=>[f.id,{...report,findings:Array.from({length:100},(_,i)=>({...report.findings[i%report.findings.length],frame:i}))}]));
 const result=staticCheckObservation({passed:false,reports,stills:Array.from({length:40},()=>({output:'long output folder'.repeat(100)}))},'recorded-source');
 assert.ok(Buffer.byteLength(JSON.stringify(result))<8192);assert.equal(result.stillsRendered,40);
 for(const format of inputJson.formats){assert.equal(result.reports[format.id].totalFindings,100);assert.ok(result.reports[format.id].findings.length>0);assert.equal(reports[format.id].findings.length,100);}
});
