import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer,type ServerResponse} from 'node:http';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {restoreSavedLiveSource} from '../apps/local-runner/director/saved-live-source';
import {createWorkspace} from '../apps/local-runner/director/workspace';
import {snapshotFolder} from '../apps/local-runner/director/snapshots';
import {buildLivePreview} from '../apps/local-runner/director/live-bundle';
import {writeFile} from 'node:fs/promises';
import recorded from '../fixtures/director/static/input.json';
import type {DirectionInput} from '../packages/director/types';
import type {DirectorView} from '../packages/director/view';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');

test('saved source restores once, coalesces simultaneous readers and reopens without another archive read',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'saved-live-source-'));let loads=0;
 const archive={hash:'recorded-hash',files:[{path:'Frame.tsx',source:'export default function Frame(){return null;}',sha256:sha('export default function Frame(){return null;}')}]};
 try{
  const load=async()=>{loads++;return archive;};await Promise.all([restoreSavedLiveSource(folder,archive.hash,load),restoreSavedLiveSource(folder,archive.hash,load)]);
  assert.equal(loads,1);assert.equal(await readFile(join(folder,'Frame.tsx'),'utf8'),archive.files[0].source);
  await restoreSavedLiveSource(folder,archive.hash,async()=>{throw Error('Do not fetch a restored archive again');});
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('corrupt saved source and path traversal cannot create a restored marker',async()=>{
 for(const file of [{path:'Frame.tsx',source:'corrupt',sha256:sha('original')},{path:'../Frame.tsx',source:'original',sha256:sha('original')}]){
  const folder=await mkdtemp(join(tmpdir(),'saved-live-invalid-'));
  try{await assert.rejects(()=>restoreSavedLiveSource(folder,'hash',async()=>({hash:'hash',files:[file]})),/SEALED_SOURCE_CHANGED|WORKSPACE_PATH_REJECTED/);await assert.rejects(()=>access(join(folder,'.reports','restored')));}
  finally{await rm(folder,{recursive:true,force:true});}
 }
});

test('a relocated saved Frame builds without changing its authored source or buying generation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'saved-live-relocate-'));
 try{
  const input=structuredClone(recorded) as DirectionInput;input.brand.fonts=[];input.resourceIds=['picture'];input.variants.push({...input.variants[0],id:'alternate',hook:'hook-1',cta:'alt',locale:'de-DE'});
  const original=await createWorkspace(join(root,'original'),input),source=await readFile('fixtures/director/live/Frame.tsx','utf8');await writeFile(join(original,'Frame.tsx'),source);
  const saved=await snapshotFolder(original,input.iterationId),folder=join(root,'relocated');await restoreSavedLiveSource(folder,saved.hash,async()=>saved);
  const built=await buildLivePreview(folder);assert.equal(built.options.adaptive,true);assert.deepEqual(built.options.hooks,['primary','hook-1']);assert.equal(await readFile(join(folder,'Frame.tsx'),'utf8'),source);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('saved versions expand across history, retry loading and switch controls without polling or paid actions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'saved-history-ui-')),listeners=new Set<ServerResponse>();
 const input=structuredClone(recorded) as DirectionInput;input.brand.fonts=[];input.resourceIds=['picture'];input.variants.push({...input.variants[0],id:'alternate',hook:'hook-1',cta:'alt',locale:'de-DE'});
 const folder=await createWorkspace(root,input);await writeFile(join(folder,'Frame.tsx'),await readFile('fixtures/director/live/Frame.tsx','utf8'));const info=await buildLivePreview(folder),cache=join(folder,'.reports','live',info.revision);
 const script=await readFile(join(cache,'preview.js'),'utf8'),css=await readFile(join(cache,'preview.css'),'utf8').catch(()=>'');
 const data:DirectorView={schemaReady:true,blockId:'recorded-block',status:'ready',directions:[{id:input.directionId,stage:'draft',status:'done',variants:input.variants,question:null}],iterations:Array.from({length:5},(_,i)=>({id:`saved-${i+1}`,directionId:input.directionId,number:i+1,stage:'draft',keyFrames:[],designDocument:'Recorded design',resources:[],sourceHash:'saved-hash',notes:[],summary:'Recorded saved component.',unchecked:true,chargedMicroUsd:1000,receiptPending:false,deliveries:[],selected:false}))};
 const ui=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {DirectorWorkspace} from ${JSON.stringify(resolve('components/studio/director-workspace.tsx'))};createRoot(document.getElementById('app')).render(<DirectorWorkspace campaignId="recorded-campaign" canStart={false}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outfile:join(root,'app.js'),platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'});
 const parentScript=ui.outputFiles.find(f=>f.path.endsWith('.js'))!.text,parentCss=ui.outputFiles.find(f=>f.path.endsWith('.css'))!.text;let failOnce=true,savedReads=0,paidActions=0;
 const server=createServer((req,res)=>{
  const url=new URL(req.url!,'http://localhost');if(req.method!=='GET'){paidActions++;res.statusCode=400;res.end('{}');return;}
  if(url.pathname==='/api/studio/events'){res.setHeader('Content-Type','text/event-stream');res.write('data: {"work":"recorded"}\n\n');listeners.add(res);req.on('close',()=>listeners.delete(res));return;}
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(`<html><head><style>${parentCss}</style></head><body><div id="app"></div><script>${parentScript.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);return;}
  res.setHeader('Content-Type','application/json');if(!url.pathname.endsWith('/preview')){res.end(JSON.stringify(data));return;}
  if(!url.searchParams.has('iteration')){res.end(JSON.stringify({status:'waiting'}));return;}
  if(url.searchParams.get('kind')==='bundle'){res.end(JSON.stringify({script,css}));return;}
  savedReads++;if(failOnce){failOnce=false;res.statusCode=503;res.end(JSON.stringify({message:'Recorded archive read failed. Retry this saved preview.'}));return;}
  res.end(JSON.stringify({status:'ready',revision:info.revision,assetRevision:'a'.repeat(64),options:info.options,legacy:false,assets:[],resources:{},variants:input.variants,scenes:input.storyboard.map(s=>({sceneId:s.id,moments:[{id:'hero',description:'Key frame'}]})),defaultProps:{width:1080,height:1080,format:'square',locale:'en-GB',hook:'primary',cta:'primary',length:6,sceneId:input.storyboard[0].id,moment:'hero'}}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port,browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});await page.goto(`http://127.0.0.1:${port}`);await page.getByText('Saved versions · 5',{exact:true}).click();
  const version=page.locator('article').filter({has:page.getByRole('heading',{name:'Version 5 · work in progress',exact:true})});await version.getByRole('button',{name:'Open saved preview',exact:true}).click();
  await expect(version).toHaveAttribute('data-preview-open','true');assert.equal(await version.evaluate(node=>getComputedStyle(node).gridColumnEnd),'-1');
  await expect(version.getByRole('alert')).toContainText('Recorded archive read failed');await expect(version.getByText(/The first square preview will appear/)).toHaveCount(0);
  await version.getByRole('button',{name:'Retry preview'}).click();const frame=version.frameLocator('iframe');await expect(frame.getByTestId('adaptive')).toHaveAttribute('data-width','1080');
  await version.getByRole('button',{name:'Hook 1',exact:true}).click();await expect(frame.getByTestId('adaptive')).toHaveAttribute('data-hook','hook-1');
  await version.evaluate(node=>{(node as HTMLElement).style.maxWidth='360px';});const generator=version.locator('section[aria-label="Live Frame.tsx generator"]');await expect.poll(()=>generator.evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(1);
  await page.waitForTimeout(4200);assert.equal(savedReads,2);assert.equal(paidActions,0);
  await version.getByRole('button',{name:'Close saved preview',exact:true}).click();await expect(version.locator('iframe')).toHaveCount(0);await expect(version).not.toHaveAttribute('data-preview-open','true');
 }finally{await browser.close();for(const res of listeners)res.end();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
