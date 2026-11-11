import test from 'node:test';
import assert from 'node:assert/strict';
import {brandUploadCandidates,retryableUpload,uploadBrandFiles,uploadDelay} from '../lib/brand-upload';
import {fieldPreviews} from '../packages/brand/workspace-metrics';
import {usedMaterialRole} from '../packages/brand/material-roles';

const file=(name:string,size=10)=>new File([new Uint8Array(size)],name);
const ok=(id:string)=>new Response(JSON.stringify({id}),{status:201,headers:{'Content-Type':'application/json'}});
const fail=(status:number,code:string)=>new Response(JSON.stringify({code,message:code}),{status,headers:{'Content-Type':'application/json'}});

test('hidden and macOS archive files are never uploaded',()=>{
 const items=brandUploadCandidates([{file:file('.DS_Store'),path:'Brand/.DS_Store'},{file:file('logo.svg'),path:'__MACOSX/Brand/logo.svg'},{file:file('logo.svg'),path:'Brand/logo.svg'}]);
 assert.deepEqual(items.map(i=>i.path),['Brand/logo.svg']);
});

test('only transient failures are retried',()=>{
 for(const status of [null,408,409,429,500,502,503])assert.equal(retryableUpload(status),true,String(status));
 for(const status of [400,401,403,404,413,415])assert.equal(retryableUpload(status),false,String(status));
 assert.equal(retryableUpload(409,'REQUEST_CONFLICT'),false);
 assert.equal(retryableUpload(409,'MATERIAL_LIMIT'),false);
 assert.ok(uploadDelay(10,()=>0)<=8000);
});

test('a transient failure is retried with the same request id until it is saved',async()=>{
 const seen:Record<string,string[]>={};const attempts:Record<string,number>={};
 const fetcher=async(_url:string,init:RequestInit)=>{const form=init.body as FormData,path=String(form.get('relativePath')),id=String(form.get('requestId'));(seen[path]??=[]).push(id);attempts[path]=(attempts[path]??0)+1;
  if(path==='a.png'&&attempts[path]<3)return attempts[path]===1?Promise.reject(new TypeError('network')):fail(503,'DATABASE_BUSY');return ok(`id-${path}`);};
 const items=await uploadBrandFiles('/x',[{file:file('a.png'),path:'a.png'},{file:file('b.png'),path:'b.png'}],{fetcher,wait:async()=>{}});
 assert.deepEqual(items.map(i=>[i.path,i.state,i.attempts]),[['a.png','saved',3],['b.png','saved',1]]);
 assert.equal(new Set(seen['a.png']).size,1,'every attempt reuses one request id');
});

test('a permanent failure stops at once and a persistent one after the attempt limit',async()=>{
 let calls=0;
 const fetcher=async(_url:string,init:RequestInit)=>{calls++;const path=String((init.body as FormData).get('relativePath'));return path==='bad.exe'?fail(415,'UNSUPPORTED_FORMAT'):fail(503,'DATABASE_BUSY');};
 const items=await uploadBrandFiles('/x',[{file:file('bad.exe'),path:'bad.exe'},{file:file('slow.pdf'),path:'slow.pdf'}],{fetcher,wait:async()=>{},attempts:4,concurrency:1});
 assert.deepEqual(items.map(i=>[i.state,i.attempts]),[['failed',1],['failed',4]]);
 assert.equal(calls,5);
});

test('uploads run a few at a time, never all at once',async()=>{
 let running=0,peak=0;
 const fetcher=async(_url:string,init:RequestInit)=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,2));running--;return ok(String((init.body as FormData).get('relativePath')));};
 const inputs=Array.from({length:20},(_,i)=>({file:file(`f${i}.png`),path:`f${i}.png`}));
 const items=await uploadBrandFiles('/x',inputs,{fetcher,concurrency:3});
 assert.equal(items.filter(i=>i.state==='saved').length,20);
 assert.ok(peak<=3&&peak>1,`peak ${peak}`);
});

test('field previews show chosen values first, colour codes for colours and never excluded findings',()=>{
 const previews=fieldPreviews([
  {field:'brandName',value:'Acme Labs',edited_value:null,decision:'unreviewed'},
  {field:'brandName',value:'Acme',edited_value:null,decision:'keep'},
  {field:'primaryColors',value:'Navy #102F40 and sky #B2E5F8',edited_value:null,decision:'unreviewed'},
  {field:'primaryColors',value:'Old red #FF0000',edited_value:null,decision:'reject'},
  {field:'voice',value:'Calm',edited_value:'Calm and exact',decision:'unreviewed'},
 ],new Set(['brandName']));
 assert.deepEqual(previews.get('brandName'),['Acme','Acme Labs']);
 assert.deepEqual(previews.get('primaryColors'),['#102f40','#b2e5f8']);
 assert.deepEqual(previews.get('voice'),['Calm and exact']);
});

test('a guessed file role is used for reading; only an unplaceable file has none',()=>{
 assert.equal(usedMaterialRole({role:'logo',sure:false}),'logo');
 assert.equal(usedMaterialRole({role:'unknown',sure:false}),undefined);
 assert.equal(usedMaterialRole({role:'photo',sure:true}),'photo');
});
