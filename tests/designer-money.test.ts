// Designer pipeline plan, point 4c: the designer allowance, picture count admission and the database role.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import inputJson from '../fixtures/director/static/input.json';
import {estimateDesignerDirection,estimateLiveDirection,DESIGNER_TURNS} from '../packages/director/money';
import {pictureResource} from '../packages/director/designer';
import {resourceRequest} from '../packages/director/resources';
import type {DirectionInput,Resource} from '../packages/director/types';

const price={inputPrice:3e-6,outputPrice:15e-6};
async function loadAdmission(){
 const stubs:Record<string,string>={'server-only':'','./studio':'exports.checked=r=>{if(r.error)throw r.error;return r.data;};','./api':'class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}};exports.ApiError=ApiError;'};
 const result=await build({entryPoints:[resolve('lib/server/director-image.ts')],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',logLevel:'silent',
  plugins:[{name:'stubs',setup(p){p.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'stub'}:undefined);p.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
 const loaded={exports:{} as {directorImageAdmission:(...args:unknown[])=>Promise<unknown>}};new Function('module','exports','require',result.outputFiles[0].text)(loaded,loaded.exports,require);return loaded.exports.directorImageAdmission;
}
const fakeAdmin=(rows:Record<string,unknown>)=>({from:(table:string)=>{const b={select:()=>b,eq:()=>b,single:async()=>({data:rows[table],error:null}),maybeSingle:async()=>({data:rows[table],error:null}),then:(ok:(v:unknown)=>unknown)=>Promise.resolve({data:rows[table],error:null}).then(ok)};return b;}});

test('the designer quote: one designer allowance, a count of pictures, the bounded critic; no director or coder',()=>{
 const e=estimateDesignerDirection({designer:price,critic:price},50000,4,{d:1},{criticRequests:2,brandSheetImages:3});
 assert.deepEqual({requests:e.roles.designer!.requests,input:e.roles.designer!.inputTokens,output:e.roles.designer!.outputTokens},{requests:DESIGNER_TURNS.requests,input:DESIGNER_TURNS.inputTokens,output:DESIGNER_TURNS.outputTokens});
 assert.equal(e.roles.director.requests,0);assert.equal(e.roles.assembler.requests,0);assert.equal(e.roles.resources.requests,4);assert.equal(e.roles.resources.maxCostMicroUsd,200000);
 assert.equal(e.roles.critic.requests,2);assert.ok(e.roles.critic.inputTokens>120000);
 assert.equal(e.maxCostMicroUsd,e.roles.designer!.maxCostMicroUsd+e.roles.critic.maxCostMicroUsd+200000);
 assert.equal(e.designerRequestInputCap,65536);assert.equal(estimateDesignerDirection({designer:price,critic:price},50000,4,{d:1},{requestInputCap:200000}).designerRequestInputCap,200000);
 assert.equal(estimateDesignerDirection({designer:price,critic:price},50000,0,{d:1}).roles.resources.requests,0,'no synthesis permission: no pictures');
 assert.equal(e.quoteId,estimateDesignerDirection({designer:price,critic:price},50000,4,{d:1},{criticRequests:2,brandSheetImages:3}).quoteId);
 assert.throws(()=>estimateDesignerDirection({designer:{inputPrice:NaN,outputPrice:0},critic:price},1,1,{}),/MODEL_PRICE_UNAVAILABLE/);
 const live=estimateLiveDirection({director:price,assembler:price,critic:price},50000,4,{d:1});assert.equal('designer' in live.roles,false,'earlier quotes are unchanged');assert.equal(live.designerRequestInputCap,undefined);
});

test('a requested picture becomes a resource under the next unused issued id',()=>{
 const input={resourceIds:['r1','r2','r3'],brief:{pictureRulesVersion:1,imageMethodsVersion:1}};
 const r=pictureResource({purpose:'Slab',scene:'s',prompt:'A slab.',aspect:'1:1',referenceAssetIds:[],mustNotContain:[],proxyFor:'3d',cutout:true,becomes:'a 3D render of the slab'},input,['r1']);
 assert.deepEqual({id:r.id,proxy:r.proxy,proxyFor:r.proxyFor,cutout:r.cutout,becomes:r.becomes,kind:r.kind,resolution:r.resolution},{id:'r2',proxy:true,proxyFor:'3d',cutout:true,becomes:'a 3D render of the slab',kind:'still',resolution:'low'});
 assert.equal(pictureResource({purpose:'p',scene:'s',prompt:'p',aspect:'1:1',referenceAssetIds:[],mustNotContain:[],cutout:true},{...input,brief:{}},[]).cutout,undefined);
 assert.throws(()=>pictureResource({purpose:'p',scene:'s',prompt:'p',aspect:'1:1',referenceAssetIds:[],mustNotContain:[]},input,['r1','r2','r3']),/STILL_COUNT_EXHAUSTED/);
});

for(const version of [1,2])test(`admission counts pictures for designer v${version}: a new one past the count is refused, a retry is not`,async()=>{
 const admission=await loadAdmission(),base=structuredClone(inputJson) as unknown as DirectionInput;
 const input:DirectionInput={...base,resourceIds:['a','b'],brief:{...base.brief,designerVersion:version,synthesisAllowed:false}};
 const resource:Resource={id:'b',kind:'still',proxy:false,resolution:'low',purpose:'p',scene:input.storyboard[0].id,prompt:'A slab.',aspect:'1:1',referenceAssetIds:[],mustNotContain:[]},req=resourceRequest(resource,input,1);
 const admin=(steps:string[])=>fakeAdmin({studio_director_blocks:{id:'blk',status:'running',approved_resource_ids:[],snapshot:{inputs:[input],estimates:{[input.directionId]:{perStillMicroUsd:1,maxStills:1}}}},studio_director_work:{status:'running',state:{design:{resources:[resource]}}},studio_agent_steps:steps.map(id=>({config_snapshot:{directorResourceId:id}}))});
 const call=(a:unknown)=>admission(a,'t',input.runId,{blockId:'blk',directionId:input.directionId,resourceId:'b',maxCostMicroUsd:1},req.prompt,'not-issued',{aspectRatio:'1:1',referenceAssetIds:req.references,derivedSha256:[]},1);
 await assert.rejects(call(admin(['a'])),(e:{code?:string})=>e.code==='STILL_COUNT_EXHAUSTED');
 await assert.rejects(call(admin(['b'])),(e:{code?:string})=>e.code==='UNISSUED_REQUEST_ID','a retry of the same picture passes the count and the permission');
});

test('the migration adds the designer role in place and is safe to run twice',()=>{
 const sql=readFileSync('supabase/migrations/20261103000300_designer_role.sql','utf8');
 assert.match(sql,/when ''designer'' then ''visual-direction''/);assert.match(sql,/designerRequestInputCap/);assert.match(sql,/position\(new_roles in definition\)=0/);
 assert.match(sql,/studio_extend_director/);assert.match(sql,/^begin;/m);assert.match(sql,/^commit;/m);
});
