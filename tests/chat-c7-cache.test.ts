// Chat-shaped plan C7: cache discipline. Recorded CLI fixtures only (tests/fixtures/fake-claude.mjs); no model call.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {cliTextTransport,cacheLifetime} from '../apps/local-runner/local-claude/transport';
import {buildRunContext} from '../packages/agents/run-context';
import {stageOf,stageEffort} from '../packages/agents/stage-effort';
import {cacheReport,cacheLine} from '../packages/agents/local-usage';
import {screenshotForDesigner,RENDER_LONG_SIDE,newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {fakeSetup,fixture} from './local-chat-shaped.test';
import type {DirectionInput} from '../packages/director/types';

test('C7: designer conversations ask for the one-hour cache; the usage says which lifetime was written', async()=>{
 const f=fixture('critic-no-images-cached'),dir=await mkdtemp(join(tmpdir(),'c7-')),ctx=buildRunContext({briefText:'{"product":"x"}',brandPack:'BRAND PACK text'});
 const send=async(name:string,opts:Record<string,unknown>)=>{const rec=join(dir,name);await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>ctx,...opts})(f.model,f.prompt,f.cfg,f.images);return JSON.parse(await readFile(rec,'utf8')) as {env:string[];system:string;content:{text?:string}[]};};
 const designer=await send('d.json',{role:'designer',longCache:true}),critic=await send('c.json',{role:'critic',stage:'critic'});
 assert.ok(designer.env.includes('CLAUDE_CODE_PROMPT_CACHE_TTL'));assert.ok(!critic.env.includes('CLAUDE_CODE_PROMPT_CACHE_TTL'));
 assert.equal(designer.system,critic.system,'the system prefix is the same bytes for every role and effort');assert.equal(designer.content[0].text,critic.content[0].text,'and so is the brief');
 assert.equal(cacheLifetime({cache_creation:{ephemeral_1h_input_tokens:900,ephemeral_5m_input_tokens:0}}),'1h');assert.equal(cacheLifetime({cache_creation:{ephemeral_5m_input_tokens:10}}),'5m');assert.equal(cacheLifetime({input_tokens:1}),undefined);
});

test('C7: a version 4 designer keeps one effort for its whole conversation; versions 1–3 keep theirs', ()=>{
 assert.equal(stageOf('designer',{hero:true}),'design-hero');
 assert.equal(stageOf('designer',{extension:true,revising:true}),'design-create','stage E revisions do not flip the effort');
 assert.equal(stageEffort('design-hero'),stageEffort('design-create'),'by default stage H and stage E think at the same level: no cache loss between them');
 assert.equal(stageOf('designer',{revising:true}),'design-revise','earlier designers keep the revise stage');
});

test('C7: the run report: cache share per stage, misses after a wait of more than five minutes or an effort change', ()=>{
 const at=(min:number)=>new Date(Date.UTC(2026,10,13,10,min)).toISOString();
 const row=(min:number,local:Record<string,unknown>)=>({role:'visual-direction',created_at:at(min),usage:{_local:{durationMs:60000,...local}}});
 const rows=[
  row(0,{stage:'design-hero',effort:'high',sessionId:'a',cacheTtl:'1h',usage:{input_tokens:1000,cache_creation_input_tokens:40000,cache_read_input_tokens:0}}),
  row(2,{stage:'design-hero',effort:'high',sessionId:'b',conversation:{kind:'continued',resumedFrom:'a'},cacheTtl:'1h',usage:{input_tokens:1000,cache_creation_input_tokens:3000,cache_read_input_tokens:41000}}),
  row(12,{stage:'design-hero',effort:'high',sessionId:'c',conversation:{kind:'continued',resumedFrom:'b'},usage:{input_tokens:1000,cache_creation_input_tokens:44000,cache_read_input_tokens:0}}),
  row(14,{stage:'design-revise',effort:'medium',sessionId:'d',conversation:{kind:'continued',resumedFrom:'c'},usage:{input_tokens:1000,cache_creation_input_tokens:46000,cache_read_input_tokens:2000}}),
  {role:'critic',created_at:at(15),usage:{prompt_tokens:10}},
 ];
 const r=cacheReport(rows);
 assert.equal(r.missesAfterWait,1,'ten minutes after the last answer the history was written again');assert.equal(r.missesAfterEffortChange,1);assert.equal(r.oneHour,2);
 assert.deepEqual(r.stages.map(s=>[s.stage,s.calls]),[['design-hero',3],['design-revise',1]]);
 assert.match(cacheLine(r,s=>s==='design-hero'?'Hero frame':s)!,/^Read from the cache: Hero frame 31% · design-revise 4%; 1 request re-read the conversation after a wait of more than five minutes; 1 after an effort change; cache kept one hour\.$/);
 assert.equal(cacheLine(cacheReport([])),null);
});

test('C7: renders reach the designer at 1024 px on the long side; picture arrivals ride on the next message', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'c7r-')),big=join(dir,'big.png');{const c=createCanvas(2160,3840);c.getContext('2d').fillRect(0,0,10,10);await writeFile(big,c.toBuffer('image/png'));}
 const img=await loadImage(Buffer.from((await screenshotForDesigner(big,RENDER_LONG_SIDE)).split(',')[1],'base64'));assert.equal(RENDER_LONG_SIDE,1024);assert.equal(Math.max(img.width,img.height),1024);
 const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:4,materialsVersion:1,digestVersion:1};
 let release:()=>void=()=>{};const ready=new Promise<void>(r=>{release=r;});
 const tools:DesignerTools={files:async()=>[],write:async()=>{},build:async()=>({ok:true as const}),finish:async()=>({complete:true as const}),render:async()=>({summary:{version:1 as const,revision:'r',views:0,hard:0,soft:0,reports:[]} as never,shots:[]}),
  requestImage:async()=>{await ready;return {id:i.resourceIds[0],status:'ready' as const};}};
 const sent:string[]=[],answers=['Asking for the picture.\n\n```actions\n{"pictures":[{"purpose":"the shelf","prompt":"Tape reels on a shelf","aspect":"9:16"}]}\n```','Writing the frame.\n\n```tsx Frame.tsx\nexport default 1;\n```','Using it.\n\n```tsx Frame.tsx\nexport default 2;\n```'];
 await runHeroChat({input:i,state:newDesignerState(),maxTurns:3,maxPictures:1,timeMs:600000,tools,save:async()=>{},call:async message=>{sent.push(message);if(sent.length===2)release();await new Promise(r=>setTimeout(r,5));return answers[sent.length-1];}});
 assert.equal(sent.length,3,'no turn is spent waiting for the picture');assert.match(sent[2],/Here is the hero frame as it rendered[\s\S]*The picture .* has arrived: read resources\['/,'the arrival rides on the next message with the render note');
});
