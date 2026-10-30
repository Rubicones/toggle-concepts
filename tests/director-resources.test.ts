import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import input from '../fixtures/director/input.json';
import {buildResourceCatalog,type PricedResource} from '../apps/local-runner/director/resources';
import type {DirectionInput,Resource} from '../packages/director/types';
import {resourceRequest,resourcePrompt} from '../packages/director/resources';
const r:Resource={id:'issued',kind:'3d-still',purpose:'A sculpture',scene:'scene-1',prompt:'A lime sculpture lit from the side.',aspect:'1:1',referenceAssetIds:[],mustNotContain:['words','logos']};
test('director resource prompts stay plain language and preserve the requested aspect',()=>{const context={...input,resourceIds:['issued']} as DirectionInput;assert.equal(resourceRequest(r,context,1000).prompt,resourcePrompt(r));assert.throws(()=>resourceRequest({...r,aspect:'17:19'},context,1000),/ASPECT/);assert.ok(!resourcePrompt(r).includes('system'));});
test('catalog materializes pixels, thumbnails, exact receipts and reuses saved stills',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'m08-resources-')),bytes=createCanvas(64,64).toBuffer('image/png'),sha256=createHash('sha256').update(bytes).digest('hex'),cached:PricedResource[]=[];let count=0;
 const args={folder,input:{...input,resourceIds:['issued']} as DirectionInput,design:{designDocument:'Recorded fixture',resources:[r]},maxStills:1,perStillMicroUsd:1000,allowed:()=>true,cached,save:async(e:PricedResource)=>{cached.push(e);},produce:async()=>{count++;return {revisionId:'existing-image',sha256,mime:'image/png',bytes,costMicroUsd:900,stepId:'recorded-step'};}};
 const result=await buildResourceCatalog(args);assert.equal(result[0].width,64);assert.equal(result[0].costMicroUsd,900);assert.ok((await readFile(join(folder,'public',result[0].thumbnail))).length);await buildResourceCatalog(args);assert.equal(count,1);
 await assert.rejects(()=>buildResourceCatalog({...args,allowed:()=>false}),/PERMISSION/);assert.equal(count,1);
});
