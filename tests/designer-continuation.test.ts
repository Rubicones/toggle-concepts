import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import recorded from '../fixtures/director/static/input.json';
import {estimateLiveDirection,estimateDesignerDirection} from '../packages/director/money';
import {questionForFailure} from '../packages/director/questions';
import {compactDraftRequest} from '../packages/director/request-size';
import type {DirectionInput} from '../packages/director/types';
import type {BlockSnapshot} from '../packages/director/state';

const price={id:'model',inputPrice:3e-6,outputPrice:15e-6,maxOutput:16000,contextLength:1000000};

// Exercise the actual continuation service, replacing only its external dependencies.
async function continuation(admin:unknown){
 const entry=resolve('lib/server/director.ts');
 const stubs:Record<string,string>={
  './studio':'exports.studioContext=async()=>({admin,tenant:"tenant",actorId:"actor"});exports.campaignRecord=async()=>{};exports.checked=r=>{if(r.error)throw r.error;return r.data;};',
  './api':'exports.ApiError=class extends Error{constructor(status,code,message){super(message);this.code=code;}};',
  '@/packages/data/current-draft-round':'exports.currentDraftRound=async()=>({data:{id:"round"}});',
  '@/packages/director/draft-lineage':'exports.draftLineage=()=>({});exports.isCurrentDraftBlock=()=>true;',
  '@/packages/data/run-limits':'exports.effectiveRunAgents=async()=>[{role:"image",model_id:"model"}];',
  '@/packages/agents/catalog':`exports.modelCatalog=async()=>[${JSON.stringify(price)}];`,
  '@/packages/agents/image-provider':'exports.quoteImage=async()=>({reservation:50000});',
  '@/packages/contracts/image-generation':'exports.imageAspectRatios=["1:1"];',
  '@/packages/director/live-review':'exports.MAX_SELF_REVIEW_ROUNDS=2;',
 };
 const keep=new Set(['node:crypto','@/packages/director/designer','@/packages/director/money','@/packages/director/revision-notes','@/packages/director/request-size']);
 const result=await build({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false,packages:'external',logLevel:'silent',plugins:[{name:'isolate-service',setup(p){
  p.onResolve({filter:/.*/},a=>a.importer===entry&&!keep.has(a.path)?{path:a.path,namespace:'stub'}:undefined);
  p.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]??'module.exports={};',loader:'js'}));
 }}]});
 const loaded={exports:{} as {quoteDirectorRevision:(campaign:string,direction:string)=>Promise<unknown>}};
 new Function('module','exports','require','admin',result.outputFiles[0].text)(loaded,loaded.exports,require,admin);
 return loaded.exports.quoteDirectorRevision;
}

for(const [version,oldCap] of [[undefined,undefined],[1,120000],[2,undefined],[2,65536]] as const)test(`continuation preserves the pipeline and saved source for designer version ${version??'legacy'}, cap ${oldCap??'missing'}`,async()=>{
 const input=structuredClone(recorded) as unknown as DirectionInput;
 input.directionId='10000000-0000-4000-a000-000000000002';
 input.brief={...input.brief,...(version?{designerVersion:version}:{})};
 const direction=input.directionId;
 // Version 2 reproduces the broken approved quote: designer input, legacy allowances.
 const estimate=oldCap?estimateDesignerDirection({designer:price,critic:price},50000,2,{}, {requestInputCap:oldCap}):estimateLiveDirection({director:price,assembler:price,critic:price},50000,2,{});
 const prior={id:'prior',run_id:input.runId,round_id:'round',status:'review',approved_resource_ids:['saved-picture'],snapshot:{inputs:[input],estimates:{[direction]:estimate},models:Object.fromEntries(['director','assembler','critic'].map(role=>[role,{modelId:'model',pricing:price,maxOutputTokens:12000,contextLength:1000000,vision:true,liveReview:true}])),notes:{[direction]:[]}}};
 const before=structuredClone(prior),savedDesign={designDocument:'Saved design'},note={recipient:'director',body:'Keep the saved composition.'};
 let quoted:BlockSnapshot|undefined;
 const admin={from:(table:string)=>{
  const rows:Record<string,unknown[]>={studio_director_blocks:[prior],studio_director_work:[],studio_workflow_jobs:[],studio_director_notes:[note],studio_director_reviews:[],studio_director_iterations:[{id:'saved-iteration',payload:{design:savedDesign}}],studio_runs:[{id:input.runId}]};
  const data=rows[table];assert.ok(data,`unexpected table ${table}`);
  const b={select:()=>b,eq:()=>b,contains:()=>b,neq:()=>b,order:()=>b,in:()=>b,or:()=>b,limit:()=>b,single:async()=>({data:data[0]}),maybeSingle:async()=>({data:data[0]??null}),then:(ok:(r:unknown)=>unknown)=>Promise.resolve({data}).then(ok)};return b;
 },rpc:(name:string,args:{source:BlockSnapshot})=>{assert.equal(name,'studio_quote_director');quoted=args.source;return {select:async()=>({data:[{id:'new-quote'}]})};}};
 await (await continuation(admin))('campaign',direction);
 assert.ok(quoted);
 const next=quoted.estimates[direction];
 assert.equal(!!next.roles.designer,!!version);
 if(version){assert.ok(next.roles.designer!.requests>0);assert.equal(next.roles.director.requests,0);assert.equal(next.roles.assembler.requests,0);}
 if(version)assert.equal(next.designerRequestInputCap,488000,'a new quote derives the cap from the model, even when the previous quote lost it');
 if(version===2)assert.ok(next.roles.critic.requests>estimate.roles.critic.requests,'hero reviews are priced');
 if(version){
  const snapshot={instructions:'Designer',maxOutputTokens:12000,pricing:price,campaignContext:{input:{brand:{kit:'Approved rules. '.repeat(10000)}}}};
  assert.throws(()=>compactDraftRequest('{}',snapshot,[],65536,960000,{fullCap:true}),/DRAFT_REQUEST_SIZE_CAP/);
  const request=compactDraftRequest('{}',snapshot,[],next.designerRequestInputCap,960000,{fullCap:true});
  assert.ok(request.compaction.after>153280);assert.equal(request.snapshot.requestInputCap,488000);
 }
 assert.equal(quoted.seedIterationIds?.[direction],'saved-iteration');
 assert.deepEqual(quoted.inputs[0].brief.previousDesign,savedDesign);
 assert.deepEqual(quoted.approvedResourceHashes,['saved-picture']);
 assert.equal(quoted.notes?.[direction][0].text,note.body);
 assert.deepEqual(prior,before,'the existing approval and quote are immutable');
});

test('a missing allowance explains that retry cannot repair the quote',()=>{
 const question=questionForFailure(recorded as unknown as DirectionInput,new Error('DIRECTOR_ALLOWANCE_REQUIRED'),1);
 assert.match(question.question,/saved quote is missing an allowance/);
 assert.match(question.question,/Retrying cannot add it/);
 assert.equal(question.technical,'DIRECTOR_ALLOWANCE_REQUIRED');
});
