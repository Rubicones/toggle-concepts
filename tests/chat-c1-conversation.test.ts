// Chat-shaped plan C1: the designer conversation works. The plan is decided before the request is built; the short
// payload goes only on a real continuation; a missing conversation is rebuilt in full; the stored size is the last
// call's; files count as seen only once a turn is accepted. Recorded CLI fixtures only, no live calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import recorded from '../fixtures/director/static/input.json';
import {designerPlan,continuesOwnConversation,lastCallSize,storedSize,conversationTokens,conversationLabel} from '../packages/agents/local-session';
import {runDesigner,newDesignerState,fileHashes,type DesignerTools,type DesignerCall} from '../apps/local-runner/director/designer-loop';
import {cliTextTransport,type LocalTextReceipt} from '../apps/local-runner/local-claude/transport';
import {buildRunContext} from '../packages/agents/run-context';
import {fakeSetup,fixture} from './local-chat-shaped.test';
import type {DirectionInput} from '../packages/director/types';

test('C1: only a continuation of the designer’s own conversation may send the short payload', ()=>{
 const own=designerPlan({session:{role:'designer',sessionId:'s',tokens:50000}},null);
 assert.equal(continuesOwnConversation(own),true);assert.equal(own&&!own.condensed&&own.shortPayload,true);
 assert.equal(continuesOwnConversation(designerPlan({session:{role:'designer',sessionId:'s',tokens:200000}},null)),false,'condensed: full payload');
 assert.equal(continuesOwnConversation(designerPlan({},{role:'visual-direction',sessionId:'p',tokens:40000})),false,'first turn from the planning point: full payload');
 assert.equal(continuesOwnConversation(designerPlan({},null)),false,'new conversation: full payload');
 assert.equal(conversationLabel('condensed','designer'),'Started over with the full draft: the conversation was too long');
 assert.equal(conversationLabel('restarted','designer'),'Started over with the full draft: the conversation was not found on this computer');
 assert.equal(conversationLabel('branched','designer'),'Continued the conversation');
});

const input=()=>{const i=structuredClone(recorded) as unknown as DirectionInput;i.brief={...i.brief,designerVersion:1};return i;};
function tools(frame:{source:string}):DesignerTools{return {files:async()=>[{path:'Frame.tsx',source:frame.source}],write:async(_p,source)=>{frame.source=source;},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),
 render:async()=>({summary:{version:1 as const,revision:'r',views:0,hard:0,soft:0,reports:[]},shots:[]})};}
const turn=(i:DirectionInput,source:string)=>JSON.stringify({focus:{sceneId:i.storyboard[0].id,activity:'designing',about:'x'},files:[{path:'Frame.tsx',source}]});

test('C1: a condensed or restarted turn sends every file, including the unchanged Frame.tsx; a continued turn only what changed', async()=>{
 const i=input(),frame={source:'export default 1;'},sent:Parameters<DesignerCall>[0][]=[],state=newDesignerState();
 state.session={role:'designer',sessionId:'s',tokens:1};state.filesSeen=fileHashes([{path:'Frame.tsx',source:frame.source}]);
 let continues=false;
 const run=(n:number)=>runDesigner({input:i,state,maxTurns:state.turn+n,maxPictures:0,timeMs:60000,tools:tools(frame),save:async()=>{},
  conversation:{continuing:()=>true,decide:async()=>continues,accept:async()=>{}},call:async r=>{sent.push(structuredClone(r));return turn(i,frame.source);}});
 await run(1);assert.deepEqual(sent[0].currentFiles.map(f=>f.path),['Frame.tsx'],'condensed although a session exists: full files');
 continues=true;await run(1);assert.deepEqual(sent[1].currentFiles,[],'continued: unchanged files are already in the history');
});

test('C1: a missing conversation is rebuilt once with the full payload in the same turn', async()=>{
 const i=input(),frame={source:'export default 1;'},sent:Parameters<DesignerCall>[0][]=[],state=newDesignerState();let lost=0,own=true;
 state.session={role:'designer',sessionId:'gone',tokens:1};state.filesSeen=fileHashes([{path:'Frame.tsx',source:frame.source}]);
 await runDesigner({input:i,state,maxTurns:1,maxPictures:0,timeMs:60000,tools:tools(frame),save:async()=>{},
  conversation:{continuing:()=>true,decide:async()=>own,lost:()=>{lost++;own=false;delete state.session;delete state.filesSeen;},accept:async()=>{}},
  call:async r=>{sent.push(structuredClone(r));if(sent.length===1)throw new Error('CONVERSATION_MISSING');return turn(i,frame.source);}});
 assert.equal(lost,1);assert.equal(sent.length,2);assert.equal(state.turn,1,'one turn, not two');
 assert.deepEqual(sent[0].currentFiles,[]);assert.deepEqual(sent[1].currentFiles.map(f=>f.path),['Frame.tsx'],'the retry carries the full draft');
});

test('C1: an unreadable answer is not accepted: files stay unseen and the results stay due', async()=>{
 const i=input(),frame={source:'export default 1;'},state=newDesignerState();let accepted=0;
 state.session={role:'designer',sessionId:'s',tokens:1};state.transcript.push({from:'agent',text:'earlier'},{from:'tool',text:'{"results":["build passed"]}'});
 const sent:Parameters<DesignerCall>[0][]=[];
 await runDesigner({input:i,state,maxTurns:2,maxPictures:0,timeMs:60000,tools:tools(frame),save:async()=>{},
  conversation:{continuing:()=>true,decide:async()=>true,accept:async()=>{accepted++;}},call:async r=>{sent.push(structuredClone(r));return sent.length===1?'not json':turn(i,frame.source);}});
 assert.equal(accepted,1,'only the readable answer is accepted');
 assert.ok(sent[1].toolResults.some(t=>t.text.includes('build passed')),'the results the unreadable answer saw are sent again');
 assert.ok(sent[1].toolResults.some(t=>t.text.includes('error')),'with the reason it was not applied');
 assert.ok(!state.transcript.some(t=>t.from==='agent'&&t.text==='not json'));
});

test('C1: the stored size is the last model call, not the sum over the request', async()=>{
 const ctx=buildRunContext({briefText:'Brief.',brandText:'Brand.'}),f=fixture('critic-no-images-cached');
 const r=await cliTextTransport(await fakeSetup('twocalls'),{shared:async()=>ctx})(f.model,f.prompt,f.cfg,f.images) as LocalTextReceipt;
 assert.equal(r.local!.conversationSize,10+90500+300);
 assert.equal(storedSize(r.local),90810);assert.ok(conversationTokens(r.local!.usage as never)>180000,'the summed usage stays for billing');
 assert.equal(lastCallSize([]),undefined);assert.equal(storedSize({usage:{input_tokens:5,output_tokens:5}}),10,'older rows fall back to the summed usage');
});

test('C1: a short payload is never restarted as a new conversation; a full one still is', async()=>{
 const ctx=buildRunContext({briefText:'Brief.',brandText:'Brand.'}),f=fixture('critic-no-images-cached');
 const short=await cliTextTransport(await fakeSetup('nosession'),{shared:async()=>ctx,session:async()=>({resume:'gone',fork:true,sameRole:true,shortPayload:true})})(f.model,f.prompt,f.cfg,f.images) as LocalTextReceipt;
 assert.equal(short.outcome,'failed');assert.equal(short.failure,'CONVERSATION_MISSING');assert.equal(short.cost,0);
 const full=await cliTextTransport(await fakeSetup('nosession'),{shared:async()=>ctx,session:async()=>({resume:'gone',fork:true,sameRole:true})})(f.model,f.prompt,f.cfg,f.images) as LocalTextReceipt;
 assert.equal(full.local!.conversation!.kind,'restarted');assert.equal(full.outcome,'succeeded');
});
