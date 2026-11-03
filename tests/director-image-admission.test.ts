import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import inputJson from '../fixtures/director/static/input.json';
import {resourceRequest} from '../packages/director/resources';
import type {DirectionInput,Resource} from '../packages/director/types';
import type {MaterialMemory} from '../packages/director/material-memory';

// The worker builds still requests with the design's material memory; admission must match it (STALE_DIRECTOR_RESOURCE case).
async function loadAdmission(){
 const stubs:Record<string,string>={
  'server-only':'',
  './studio':'exports.checked=r=>{if(r.error)throw r.error;return r.data;};',
  './api':'class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}};exports.ApiError=ApiError;',
 };
 const result=await build({entryPoints:[resolve('lib/server/director-image.ts')],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',logLevel:'silent',
  plugins:[{name:'stubs',setup(p){p.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'stub'}:undefined);p.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
 const loaded={exports:{} as {directorImageAdmission:(...args:unknown[])=>Promise<unknown>}};
 new Function('module','exports','require',result.outputFiles[0].text)(loaded,loaded.exports,require);
 return loaded.exports.directorImageAdmission;
}
const fakeAdmin=(rows:Record<string,unknown>)=>({from:(table:string)=>{const b={select:()=>b,eq:()=>b,single:async()=>({data:rows[table],error:null}),maybeSingle:async()=>({data:rows[table],error:null})};return b;}});

test('a still that references a screenshot the director recognised as a product passes admission',async()=>{
 const admission=await loadAdmission();
 const shot={id:'00000000-0000-4000-8000-000000000077',url:'s.png',thumbnail:'s.png',width:800,height:600,sha256:'7'.repeat(64),mime:'image/png',revisionId:'00000000-0000-4000-8000-000000000177'};
 const base=structuredClone(inputJson) as unknown as DirectionInput;
 const memory:MaterialMemory={version:1,revision:'r',materials:[{id:shot.id,role:'reference',name:'screen'} as never],rules:[],preferences:null,issues:[],observations:[],reconstruction:{allowed:true,instruction:''}};
 const input:DirectionInput={...base,assets:[...base.assets,shot],resourceIds:['a'],materialMemory:memory,brief:{...base.brief,synthesisAllowed:true}};
 const designMemory:MaterialMemory={...memory,materials:[{id:shot.id,role:'product',name:'screen'} as never]};
 const resource:Resource={id:'a',kind:'still',proxy:false,resolution:'low',purpose:'p',scene:input.storyboard[0].id,prompt:'The product screen on a desk.',aspect:'1:1',referenceAssetIds:[shot.id],mustNotContain:[]};
 const worker=resourceRequest(resource,{...input,materialMemory:designMemory},1);
 assert.match(worker.prompt,/fresh polished still/,'the worker asks for reconstruction');
 const admin=fakeAdmin({studio_director_blocks:{id:'blk',status:'running',approved_resource_ids:[],snapshot:{inputs:[input],estimates:{[input.directionId]:{perStillMicroUsd:1}}}},studio_director_work:{status:'running',state:{design:{resources:[resource],materialMemory:designMemory}}}});
 // A wrong request id is the last check: reaching it means prompt, references and derived plan matched.
 await assert.rejects(admission(admin,'t',input.runId,{blockId:'blk',directionId:input.directionId,resourceId:'a',maxCostMicroUsd:1},worker.prompt,'not-issued',{aspectRatio:'1:1',referenceAssetIds:worker.references,derivedSha256:[]},1),(e:{code?:string})=>e.code==='UNISSUED_REQUEST_ID');
});
