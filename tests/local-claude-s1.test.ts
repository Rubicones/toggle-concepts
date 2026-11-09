// Local mode S1 (plan §3.1–3.2, §11): one prepared request for both transports. Golden fixtures were captured from
// submitText before the refactor, so the OpenRouter payload is proven unchanged byte for byte.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {mkdtemp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {submitText,type TextSnapshot} from '../packages/agents/text-provider';
import {CLI_TRANSFORMATIONS,openRouterBody,prepareTextRequest,projectCli,projectPrepared,projectionDifferences,toCliRequest,type ImageInput} from '../packages/agents/prepared-request';
import {readPreparedRequest,recordPreparedRequest} from '../apps/local-runner/local-claude/record';

type Fixture={input:{name:string;model:string;prompt:string;cfg:TextSnapshot;images:ImageInput[];requestTag?:string};openRouterBody:unknown};
const DIR='tests/fixtures/prepared-requests',fixtures=readdirSync(DIR).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(join(DIR,f),'utf8')) as Fixture);
const prepare=(f:Fixture)=>prepareTextRequest(f.input.model,f.input.prompt,f.input.cfg,f.input.images,{requestTag:f.input.requestTag});

test('the golden set covers system blocks, protocols, the brandbook, prior outputs and stable and changing images', ()=>{
 assert.equal(fixtures.length,5);
 assert.ok(fixtures.some(f=>f.input.cfg.protocolInstructions));
 assert.ok(fixtures.some(f=>f.input.images.some(i=>i.prefix)&&f.input.images.some(i=>!i.prefix)));
 assert.ok(fixtures.some(f=>f.input.prompt.length>16000));
 assert.ok(fixtures.some(f=>JSON.stringify(f.input.cfg.upstream??[]).length>2));
 assert.ok(fixtures.some(f=>/^anthropic\//.test(f.input.model)&&f.input.cfg.cachePrompt));
});

test('submitText sends exactly the golden OpenRouter payload', async()=>{
 const original=globalThis.fetch;
 try{for(const f of fixtures){
  let sent='';globalThis.fetch=(async(_url:string,init:{body:string})=>{sent=init.body;throw new Error('captured');}) as unknown as typeof fetch;
  await submitText(f.input.model,f.input.prompt,f.input.cfg,f.input.images,f.input.requestTag);
  assert.equal(sent,JSON.stringify(f.openRouterBody),f.input.name);
 }}finally{globalThis.fetch=original;}
});

test('the prepared request builds the same payload and records ordered attachments with byte hashes', ()=>{
 for(const f of fixtures)assert.equal(JSON.stringify(openRouterBody(prepare(f))),JSON.stringify(f.openRouterBody),f.input.name);
 const designer=prepare(fixtures.find(f=>f.input.name==='designer-cached-claude')!);
 assert.deepEqual(designer.attachments.map(a=>[a.position,a.label,a.mediaType,a.width,a.height,a.prefix]),[[0,'Brand sheet · palette','image/png',6,4,true],[1,'Brand sheet · type','image/png',4,6,true],[2,'1x1 reference, scene s1','image/jpeg',8,5,false]]);
 assert.ok(designer.attachments.every(a=>/^[0-9a-f]{64}$/.test(a.sha256)&&a.bytes>0));
 assert.deepEqual(designer.transport,{stream:true,requestTag:'step-3',cachePrompt:true,cacheSessionId:'dir-1',pricing:designer.transport.pricing});
});

test('the semantic hash covers content and parameters, not transport metadata', ()=>{
 const f=fixtures.find(x=>x.input.name==='brandbook-vision')!,base=prepare(f).semanticInputHash;
 const again=(cfg:Partial<TextSnapshot>,prompt=f.input.prompt,images=f.input.images,tag=f.input.requestTag)=>prepareTextRequest(f.input.model,prompt,{...f.input.cfg,...cfg},images,{requestTag:tag,identity:{stepId:'other',attempt:3}}).semanticInputHash;
 assert.equal(again({stream:true,timeoutMs:1,cacheSessionId:'x',pricing:{inputPrice:9,outputPrice:9}},f.input.prompt,f.input.images,'another-tag'),base,'transport metadata and identity do not count');
 // A change after character 16 000 is a different request.
 assert.ok(f.input.prompt.length>16000);
 assert.notEqual(again({},f.input.prompt.replace('TAIL-MARKER','TAIL-MARKEX')),base);
 // Same number of images, one replaced.
 const swapped=[f.input.images[0],{...f.input.images[1],url:f.input.images[0].url}];
 assert.notEqual(again({},f.input.prompt,swapped),base);
 // Order of images and labels counts.
 assert.notEqual(again({},f.input.prompt,[...f.input.images].reverse()),base);
 assert.notEqual(again({maxOutputTokens:8001}),base);assert.notEqual(again({reasoningEffort:'low'}),base);
 assert.notEqual(prepareTextRequest('google/gemini-2.5-pro',f.input.prompt,f.input.cfg,f.input.images).semanticInputHash,base,'the target model counts');
});

test('the CLI input preserves every text part, order, image, schema and limit; only listed transformations happen', ()=>{
 assert.ok(CLI_TRANSFORMATIONS.length>=8);
 for(const f of fixtures)for(const schemaMode of ['cli','plain'] as const){
  const p=prepare(f),cli=toCliRequest(p,{executionModel:'claude-sonnet-test',schemaMode});
  assert.deepEqual(projectionDifferences(projectPrepared(p),projectCli(cli,p.output.schema?.schema)),[],`${f.input.name} ${schemaMode}`);
  assert.equal(cli.model,'claude-sonnet-test');
  assert.equal(cli.parts.filter(x=>x.type==='image').length,p.attachments.length);
  if(p.output.schema)assert.equal(cli.schemaMode,schemaMode);else assert.equal(cli.schemaMode,'none');
 }
 const designer=toCliRequest(prepare(fixtures.find(f=>f.input.name==='designer-cached-claude')!),{executionModel:'m',schemaMode:'cli'});
 assert.equal(designer.systemPrompt,'You are the designer.\n\nTool protocol: return exactly the response schema.');
 assert.equal(designer.effort,'medium');
 assert.deepEqual(toCliRequest(prepare(fixtures.find(f=>f.input.name==='brandbook-vision')!),{executionModel:'m',schemaMode:'cli'}).unsupported,['reasoning-disabled']);
});

test('the projections catch a dropped part, reordered images, a changed system prompt or schema', ()=>{
 const p=prepare(fixtures.find(f=>f.input.name==='designer-cached-claude')!),expected=projectPrepared(p),cli=toCliRequest(p,{executionModel:'m',schemaMode:'cli'});
 const images=cli.parts.map((x,i)=>[x,i] as const).filter(([x])=>x.type==='image').map(([,i])=>i);
 const reordered=[...cli.parts];[reordered[images[0]],reordered[images[2]]]=[reordered[images[2]],reordered[images[0]]];
 assert.ok(projectionDifferences(expected,projectCli({...cli,parts:reordered})).some(d=>/image content differs/.test(d)));
 assert.ok(projectionDifferences(expected,projectCli({...cli,parts:cli.parts.slice(0,-1)})).length>0);
 assert.ok(projectionDifferences(expected,projectCli({...cli,systemPrompt:cli.systemPrompt+' Be brief.'})).some(d=>/system/.test(d)));
 assert.ok(projectionDifferences(expected,projectCli({...cli,jsonSchema:{type:'object'}})).includes('output schema differs'));
 assert.ok(projectionDifferences(expected,projectCli({...cli,maxOutputTokens:100})).some(d=>/output limit/.test(d)));
});

test('a recorded request is complete and comes back exactly, images stored once', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'prepared-')),p=prepare(fixtures.find(f=>f.input.name==='designer-cached-claude')!);
 const path=await recordPreparedRequest(p,dir);await recordPreparedRequest(p,dir);
 assert.deepEqual(await readPreparedRequest(path),p);
 assert.equal((await readdir(join(dir,'blobs'))).length,3);
 assert.ok(!readFileSync(path,'utf8').includes('base64,'),'image bytes are not repeated in the record');
 const long=prepare(fixtures.find(f=>f.input.name==='brandbook-vision')!),back=await readPreparedRequest(await recordPreparedRequest(long,dir));
 assert.equal(JSON.stringify(openRouterBody(back)),JSON.stringify(openRouterBody(long)),'no truncation');
});
