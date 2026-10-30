import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import recorded from '../fixtures/director/static/input.json';
import design from '../fixtures/director/static/director-response.json';
import {resourceRequest,liveResourceBindings} from '../packages/director/resources';
import {digest} from '../packages/director/money';
import {buildResourceCatalog,type PricedResource} from '../apps/local-runner/director/resources';
import {createWorkspace,writeResources} from '../apps/local-runner/director/workspace';
import {liveSource,buildLivePreview} from '../apps/local-runner/director/live-bundle';
import {loadLiveAssets,availableLiveResources,replaceLiveRecord,LIVE_ASSET_TOTAL_BYTES,type CachedLiveAsset} from '../packages/director/live-assets';
import type {DirectionInput,Resource} from '../packages/director/types';
const input=():DirectionInput=>({...structuredClone(recorded) as DirectionInput,brief:{resourceBindingVersion:1},resourceIds:['first','second'],variants:[...recorded.variants,{...recorded.variants[0],id:'alternate',hook:'hook-1',cta:'alt',locale:'de-DE'}],brand:{...structuredClone(recorded.brand),fonts:[]}});
const resource:Resource={id:'first',kind:'still',resolution:'low',proxy:false,scene:'scene-1',purpose:'A scene picture',prompt:'A sculptural music object',aspect:'1:1',referenceAssetIds:[],mustNotContain:['words','logos']};
const pixels=()=>readFile('fixtures/director/media/d5aaa8229b37b9348ff264f52e737121a9611c99a053b88fcd31cc7a44c2757e.png');
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');

test('image identity excludes bindings, copy/layout and price but changes with image inputs; legacy keys stay exact',()=>{
 const i=input(),key=resourceRequest(resource,i,1000).key;
 assert.equal(resourceRequest({...resource,id:'second',scene:'scene-2',purpose:'New purpose after a copy edit',proxy:true,proxyFor:'3d'},i,2000).key,key);
 assert.equal(resourceRequest(resource,{...i,brief:{...i.brief,cta:'Changed CTA'},brand:{...i.brand,tokens:{...i.brand.tokens,padding:123}},variants:i.variants.slice(0,1)},1).key,key);
 for(const r of [{...resource,prompt:'Different material'},{...resource,aspect:'16:9'},{...resource,mustNotContain:['people']}])assert.notEqual(resourceRequest(r,i,1000).key,key);
 const ref={...i.assets[0],id:'reference',width:100,height:100,mime:'image/png'},withRef={...i,assets:[ref]},r={...resource,referenceAssetIds:['reference']};assert.notEqual(resourceRequest(r,withRef,1000).key,resourceRequest(r,{...withRef,assets:[{...ref,sha256:'b'.repeat(64)}]},1000).key);
 assert.equal(resourceRequest(r,withRef,1000).key,resourceRequest({...r,referenceAssetIds:['same-pixels']},{...withRef,assets:[{...ref,id:'same-pixels'}]},1000).key);
 const old={...i,brief:{}};assert.equal(resourceRequest(resource,old,1000).key,digest({protocol:'director@1',directionId:old.directionId,resource,refs:[]}));assert.notEqual(resourceRequest(resource,old,1000).key,key);
});

test('changed image briefs stay pending until matching pixels arrive, and every issued binding has a placeholder',()=>{
 const i=input(),requestHash=resourceRequest(resource,i,1000).key,catalog=[{...i.assets[0],id:resource.id,requestHash}];
 const first=liveResourceBindings(i,[resource],catalog);assert.equal(first.first.ready,true);assert.equal(first.second.ready,false);assert.equal(first.second.url,'');
 assert.equal(liveResourceBindings(i,[{...resource,purpose:'Copy-only revision'}],catalog).first.ready,true);
 const changed=liveResourceBindings(i,[{...resource,prompt:'New image material'}],catalog);assert.equal(changed.first.ready,false);assert.equal(changed.first.url,'');assert.notEqual(changed.first.requestHash,first.first.requestHash);
 assert.throws(()=>liveResourceBindings(i,[{...resource,id:'foreign'}],catalog),/UNISSUED_RESOURCE_ID/);
});

test('aliases and copy/layout revisions share one paid image while current IDs and original receipts remain bound',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'independent-images-'));try{
  const i=input(),bytes=await pixels(),cached:PricedResource[]=[],receipts:boolean[]=[];let calls=0;
  const args={folder,input:i,design:{...design,resources:[resource,{...resource,id:'second',scene:'scene-2',purpose:'Another use of the same pixels'}]},maxStills:2,perStillMicroUsd:1000,allowed:()=>true,cached,produce:async()=>{calls++;return {bytes,sha256:sha(bytes),mime:'image/png',revisionId:'paid-image',stepId:'paid-step',costMicroUsd:900};},save:async(e:PricedResource,m?:{reused:boolean})=>{cached.push(e);receipts.push(!!m?.reused);}};
  const first=await buildResourceCatalog(args);assert.equal(calls,1);assert.deepEqual(first.map(e=>e.id),['first','second']);assert.deepEqual(receipts,[false,true]);assert.equal(first[0].requestHash,first[1].requestHash);assert.equal(first[1].stepId,'paid-step');assert.equal(first[1].costMicroUsd,900);
  const second=await buildResourceCatalog({...args,perStillMicroUsd:100,design:{...design,designDocument:'Changed typography only',resources:[{...resource,id:'second',purpose:'Reworded use'}]}});assert.equal(calls,1);assert.equal(second[0].id,'second');assert.equal(second[0].revisionId,'paid-image');assert.equal(second[0].costMicroUsd,900);assert.equal(second[0].sha256,first[0].sha256);
  const [changed]=await buildResourceCatalog({...args,design:{...design,resources:[{...resource,prompt:'A different photographic material'}]}});assert.equal(calls,2);assert.notEqual(changed.requestHash,first[0].requestHash);assert.equal(first[0].costMicroUsd,900);
  let reusedReceipt=false;const [retrieved]=await buildResourceCatalog({...args,cached:[],perStillMicroUsd:100,design:{...design,resources:[resource]},produce:async()=>({bytes,sha256:sha(bytes),mime:'image/png',revisionId:'paid-image',stepId:'paid-step',costMicroUsd:900,reused:true}),save:async(_entry,meta)=>{reusedReceipt=meta?.reused===true;}});assert.equal(reusedReceipt,true);assert.equal(retrieved.costMicroUsd,900);assert.equal(retrieved.stepId,first[0].stepId);assert.equal(calls,2);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('proxy bindings reuse original paid bytes, remain low resolution, and missing pixels restore without repurchasing',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'independent-proxy-'));try{
  const bytes=await pixels(),cached:PricedResource[]=[];let calls=0,restores=0;
  const args={folder,input:input(),design:{...design,resources:[resource]},maxStills:1,perStillMicroUsd:1000,allowed:()=>true,cached,produce:async()=>{calls++;return {bytes,sha256:sha(bytes),mime:'image/png',revisionId:'paid-image',stepId:'paid-step',costMicroUsd:900};},save:async(e:PricedResource)=>{cached.push(e);},loadCached:async()=>{restores++;return bytes;}};
  const [ordinary]=await buildResourceCatalog(args);await rm(join(folder,'public',ordinary.imageSource!.url));
  const [proxy]=await buildResourceCatalog({...args,design:{...design,resources:[{...resource,proxy:true,proxyFor:'video'}]}});assert.equal(calls,1);assert.equal(restores,1);assert.ok(proxy.width<=512&&proxy.height<=512);assert.equal(proxy.proxyFor,'video');assert.equal(sha(await readFile(join(folder,'public',proxy.url))),proxy.renderSha256);
  await writeFile(join(folder,'public',proxy.imageSource!.url),'corrupt');await assert.rejects(()=>buildResourceCatalog({...args,loadCached:async()=>Buffer.from('wrong receipt bytes')}),/RESOURCE_BYTES_CHANGED/);assert.equal(calls,1);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('all image inputs and permissions are admitted before any generation, and unknown receipts cannot activate bindings',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'independent-admission-'));try{
  let calls=0;const bytes=await pixels(),args={folder,input:input(),design:{...design,resources:[resource,{...resource,id:'second',aspect:'invalid'}]},maxStills:2,perStillMicroUsd:1000,allowed:()=>true,cached:[] as PricedResource[],produce:async()=>{calls++;return {bytes,sha256:sha(bytes),mime:'image/png',revisionId:'image',stepId:'step',costMicroUsd:900};},save:async()=>{}};
  await assert.rejects(()=>buildResourceCatalog(args),/IMAGE_ASPECT_UNAVAILABLE/);assert.equal(calls,0);
  await assert.rejects(()=>buildResourceCatalog({...args,design:{...design,resources:[resource,{...resource,id:'second'}]},allowed:r=>r.id!=='second'}),/RESOURCE_PERMISSION_REQUIRED/);assert.equal(calls,0);
  await assert.rejects(()=>buildResourceCatalog({...args,design:{...design,resources:[resource]},produce:async()=>({...await args.produce(),costMicroUsd:null as unknown as number})}),/RESOURCE_RECEIPT_REQUIRED/);assert.equal(calls,1);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('resource arrivals and binding changes leave the live source revision unchanged; source edits retain pixels',async()=>{
 const root=await mkdtemp(join(tmpdir(),'independent-source-'));try{
  const i=input(),folder=await createWorkspace(root,i),code=await readFile('fixtures/director/live/Frame.tsx','utf8');await writeFile(join(folder,'Frame.tsx'),code);const before=await liveSource(folder);
  const picture={id:'first',url:'recorded.png',proxy:false};await Promise.all(Array.from({length:8},()=>writeResources(folder,i,[picture])));const after=await liveSource(folder);assert.equal(before.revision,after.revision);assert.deepEqual(JSON.parse(await readFile(join(folder,'catalog.json'),'utf8')).at(-1),picture);
  await writeFile(join(folder,'Frame.tsx'),code.replace('Recorded live component fixture','Recorded source edit'));assert.notEqual((await liveSource(folder)).revision,before.revision);assert.match(await readFile(join(folder,'resources.ts'),'utf8'),/recorded.png/);
  const built=await buildLivePreview(folder);await writeResources(folder,i,[{...picture,url:'replacement.png'}]);assert.equal((await buildLivePreview(folder)).revision,built.revision);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('asset arrivals are independent, failed reads retry, duplicate content reads once and removed bindings disappear',async()=>{
 const cache=new Map<string,CachedLiveAsset>();let release!:()=>void;const slow=new Promise<CachedLiveAsset>(resolve=>release=()=>resolve({data:'data:slow',bytes:10})),changes:Record<string,string>[]=[],reads:string[]=[];
 const files=[{name:'fast.png',mime:'image/png',sha256:'fast'},{name:'alias.png',mime:'image/png',sha256:'fast'},{name:'slow.png',mime:'image/png',sha256:'slow'},{name:'missing.png',mime:'image/png',sha256:'missing'}];
 const pending=loadLiveAssets({files,cache,read:async f=>{reads.push(f.name);if(f.name==='slow.png')return slow;if(f.name==='missing.png')throw new Error('Recorded read failure');return {data:'data:fast',bytes:10};},onChange:assets=>changes.push(assets)});
 await new Promise<void>(resolve=>setImmediate(resolve));assert.ok(changes.some(v=>v['fast.png']&&!v['slow.png']));assert.equal(reads.filter(f=>f==='fast.png'||f==='alias.png').length,1);release();const first=await pending;assert.deepEqual(first.missing,['missing.png']);
 const retry=await loadLiveAssets({files,cache,read:async()=>({data:'data:retried',bytes:10})});assert.equal(retry.assets['missing.png'],'data:retried');
 const bindings={picture:{id:'picture',url:'missing.png',ready:true}};assert.equal(availableLiveResources(bindings,first.assets).picture.ready,false);assert.equal(availableLiveResources(bindings,retry.assets).picture.ready,true);
 const target:Record<string,unknown>={picture:bindings.picture},identity=target;replaceLiveRecord(target,{});assert.equal(target,identity);assert.deepEqual(target,{});
 await loadLiveAssets({files:[],cache,read:async()=>{throw new Error('No files');}});assert.equal(cache.size,0);
});

test('cached and arriving asset bytes share a hard display/cache limit',async()=>{
 const cache=new Map<string,CachedLiveAsset>(),files=Array.from({length:5},(_,n)=>({name:`${n}.png`,mime:'image/png',sha256:String(n)}));
 const loaded=await loadLiveAssets({files,cache,read:async()=>({data:'data:recorded',bytes:9*1024*1024})});assert.equal(Object.keys(loaded.assets).length,3);assert.equal(loaded.missing.length,2);assert.ok([...cache.values()].reduce((sum,c)=>sum+c.bytes,0)<=LIVE_ASSET_TOTAL_BYTES);
 const repeated=await loadLiveAssets({files,cache,read:async()=>({data:'data:recorded',bytes:9*1024*1024})});assert.equal(Object.keys(repeated.assets).length,3);
});
