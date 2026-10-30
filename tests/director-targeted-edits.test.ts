import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applySourceEdits} from '../packages/director/source-edits';
import {assembleStatic} from '../apps/local-runner/director/static-assembler';
import {revisionRecipient,coderOnlyRevision} from '../packages/director/revision-notes';
import {assemblerContext} from '../packages/director/transcript';
import {staticCoderInstructions,staticFilesSchema} from '../packages/agents/prompts/static-coder';
import type {LoopState,RoutedNote} from '../packages/director/state';
import type {DirectionInput} from '../packages/director/types';
import type {Design} from '../packages/director/contract';
import input from '../fixtures/director/static/input.json';
import design from '../fixtures/director/static/director-response.json';

const frame="export default function Frame({width,height,sceneId}) { const fit=sceneId==='scene-1'&&width>height?'cover':'contain'; return <img style={{objectFit:fit,color:'orange'}}/>; }";
const styles='.headline { color:orange; }';

test('exact edits preserve unrelated code, scenes and files byte for byte',()=>{
 const files=[{path:'Frame.tsx',source:frame},{path:'styles.css',source:styles}],before=structuredClone(files);
 const result=applySourceEdits(files,[{path:'Frame.tsx',oldText:"width>height?'cover'",newText:"width>height?'contain'"}]);
 assert.deepEqual(result,[{path:'Frame.tsx',source:frame.replace("width>height?'cover'","width>height?'contain'")}]);assert.deepEqual(files,before);
 assert.throws(()=>applySourceEdits(files,[{path:'Frame.tsx',oldText:"'contain'",newText:"'cover'"},{path:'Frame.tsx',oldText:"'cover'",newText:"'fill'"}]),/EDIT_ANCHOR_NOT_UNIQUE/);
 assert.throws(()=>applySourceEdits(files,[{path:'Frame.tsx',oldText:'missing',newText:'replacement'}]),/EDIT_ANCHOR_NOT_UNIQUE/);
 assert.throws(()=>applySourceEdits(files,[{path:'brand.ts',oldText:'orange',newText:'red'}]),/EDIT_FILE_NOT_FOUND/);
 assert.throws(()=>applySourceEdits(files,[{path:'styles.css',oldText:styles,newText:styles}]),/EDIT_NO_CHANGE/);
});

test('a CSS-only coder correction does not rewrite Frame or restart square construction',async()=>{
 const files=new Map([['Frame.tsx',frame],['styles.css',styles]]),writes:string[]=[],state:LoopState={turn:0,startedAt:0,complete:false,transcript:[]};let requests=0;
 await assembleStatic({state,recoverExisting:true,maxTurns:3,timeMs:100,now:()=>1,filesContext:async()=>({files:[...files].map(([path,source])=>({path,source})),oversized:false,construction:{stage:'square',currentChecked:false,remaining:[],focus:'Resolve square first'}}),call:async(_,mode,currentFiles,construction)=>{
  requests++;assert.equal(mode,'files');assert.equal(currentFiles?.find(f=>f.path==='Frame.tsx')?.source,frame);assert.match(construction!.focus,/Do not restart/);
  return JSON.stringify({files:[],edits:[{path:'styles.css',oldText:'color:orange',newText:'color:red'}]});
 },tool:async action=>{if(action.tool==='write'){writes.push(action.path);files.set(action.path,action.source);return {written:action.path};}return action.tool==='finish'?{complete:true}:{passed:true};},save:async()=>{}});
 assert.equal(requests,1);assert.equal(state.complete,true);assert.deepEqual(writes,['styles.css']);assert.equal(files.get('Frame.tsx'),frame);assert.equal(files.get('styles.css'),styles.replace('orange','red'));
});

test('a stale edit cannot overwrite source changed while the coder answered',async()=>{
 let source=frame,requests=0;const writes:string[]=[],state:LoopState={turn:0,startedAt:0,complete:false,transcript:[]};
 await assembleStatic({state,maxTurns:3,timeMs:100,now:()=>1,filesContext:async()=>({files:[{path:'Frame.tsx',source}],oversized:false}),call:async loop=>{
  requests++;if(requests===1)source=frame.replace("color:'orange'","color:'blue'");else assert.match(loop.transcript.at(-1)!.text,/EDIT_SOURCE_CHANGED/);
  return JSON.stringify({files:[],edits:[{path:'Frame.tsx',oldText:"width>height?'cover'",newText:"width>height?'contain'"}]});
 },tool:async action=>{if(action.tool==='write'){writes.push(action.source);source=action.source;return {written:action.path};}return action.tool==='finish'?{complete:true}:{passed:true};},save:async()=>{}});
 assert.equal(requests,2);assert.equal(writes.length,1);assert.ok(source.includes("color:'blue'"));assert.ok(source.includes("width>height?'contain'"));
});

test('invalid anchors do not partially apply sibling edits and the bounded repair sees unchanged source',async()=>{
 let source=frame,requests=0;const state:LoopState={turn:0,startedAt:0,complete:false,transcript:[]};let writes=0;
 await assembleStatic({state,maxTurns:3,timeMs:100,now:()=>1,filesContext:async()=>({files:[{path:'Frame.tsx',source}],oversized:false}),call:async loop=>{
  requests++;if(requests===2){assert.equal(source,frame);assert.match(loop.transcript.at(-1)!.text,/EDIT_ANCHOR_NOT_UNIQUE/);}
  return JSON.stringify({files:[],edits:[{path:'Frame.tsx',oldText:"width>height?'cover'",newText:"width>height?'contain'"},...(requests===1?[{path:'Frame.tsx',oldText:'not in source',newText:'changed'}]:[])]});
 },tool:async action=>{if(action.tool==='write'){writes++;source=action.source;return {written:action.path};}return action.tool==='finish'?{complete:true}:{passed:true};},save:async()=>{}});
 assert.equal(requests,2);assert.equal(writes,1);assert.equal(source,frame.replace("width>height?'cover'","width>height?'contain'"));
});

test('a new coder note keeps its recipient despite historical director notes',()=>{
 const history:RoutedNote[]=[{recipient:'director',text:'Earlier staging direction.'},{recipient:'assembler',text:'Fix only the wide scene.'}];
 const recipient=revisionRecipient('assembler','director',history);assert.equal(recipient,'assembler');assert.equal(coderOnlyRevision({revisionRecipient:recipient},history),true);
 assert.equal(coderOnlyRevision({revisionRecipient:'director'},[{recipient:'assembler',text:'Old coding feedback.'}]),false);
 assert.equal(coderOnlyRevision({},[{recipient:'assembler',text:'Legacy coder-only revision.'}]),true);
});

test('new request guidance allows focused edits while preserving existing source and issued scope',()=>{
 const context=assemblerContext(input as DirectionInput,design as Design,[],[{recipient:'assembler',text:'Keep the terminal visible at 16:9.'}]);
 assert.match(context.files,/CSS\/helper-only correction need not rewrite Frame/);assert.match(context.revisionGuidance!,/Earlier notes.*context/);assert.match(staticCoderInstructions,/If currentFiles already contains Frame.tsx/);
 const schema=staticFilesSchema.schema as {properties:{files:{minItems:number};edits:{items:{required:string[]}}}};
 assert.equal(schema.properties.files.minItems,0);assert.deepEqual(schema.properties.edits.items.required,['path','oldText','newText']);
});
