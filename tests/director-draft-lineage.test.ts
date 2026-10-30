import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {currentDraftRound} from '../packages/data/current-draft-round';
import {draftLineage,matchesDraftLineage,isCurrentDraftBlock,draftWorkProgress} from '../packages/director/draft-lineage';
import {visibleDraftControl,visibleRunControl} from '../packages/contracts/run-availability';
import type {GuidedRunControl} from '../packages/contracts/guided-run';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {digest} from '../packages/director/money';
import kite from '../fixtures/director/planning/kite.json';

const round={id:'draft-round',run_id:'current-run',origin_c1_id:'current-checkpoint',a1_id:'accepted-brand'};
const jobs=['research','strategy','variants','script','localization','asset-plan'].map(job_key=>({id:job_key,job_key,state:'succeeded',output_hash:job_key+'-hash'}));
const lineage=draftLineage(round,jobs);
const snapshot=()=>({protocol:'director@1',checkpointId:round.origin_c1_id,a1Id:round.a1_id,planning:structuredClone(lineage.planning),inputs:[{runId:round.run_id,roundId:round.id,stage:'draft',brief:{referenceReconstructionAllowed:true,draftConstructionVersion:1,resourceBindingVersion:1},materialMemory:{version:1},creativeHandoff:{version:1,owner:'draft-director'}}]});
const block=()=>({id:'saved',quote_hash:'recorded-quote',run_id:round.run_id,round_id:round.id,status:'ready',snapshot:snapshot()});

test('the current C1 run selects only its draft round, regardless of manual round ties and historical run numbers',async()=>{
 const requests:URL[]=[],rounds=[{...round,kind:'manual',round_no:1},{...round,id:'old-draft',run_id:'old-run',kind:'draft',round_no:20},{...round,kind:'draft',round_no:1}];
 const admin=createClient('http://fixture.invalid','fixture-only',{global:{fetch:async input=>{
  const url=new URL(String(input));requests.push(url);
  if(url.pathname.endsWith('/studio_c1_checkpoints'))return new Response(JSON.stringify({run_id:round.run_id}),{status:200});
  let selected=rounds;
  for(const key of ['run_id','kind'])if(url.searchParams.has(key))selected=selected.filter(row=>row[key as 'run_id'|'kind']===url.searchParams.get(key)!.slice(3));
  return new Response(JSON.stringify(selected.sort((a,b)=>b.round_no-a.round_no)[0]),{status:200});
 }},auth:{persistSession:false,autoRefreshToken:false}});
 const result=await currentDraftRound(admin,'tenant','campaign');assert.equal(result.error,null);assert.equal(result.data?.id,round.id);
 assert.equal(requests[1].searchParams.get('kind'),'eq.draft');assert.equal(requests[1].searchParams.get('run_id'),'eq.current-run');
 assert.ok(requests.every(url=>url.searchParams.get('tenant_id')==='eq.tenant'&&url.searchParams.get('campaign_id')==='eq.campaign'));
});

test('a preview built before planning was restarted in the same round is history and cannot satisfy start or tick',()=>{
 const saved=block(),newJobs=jobs.map(j=>({...j,id:'new-'+j.id})),current=draftLineage(round,[...jobs.map(j=>({...j,job_key:j.job_key+'.history.1'})),...newJobs]);
 assert.equal(isCurrentDraftBlock(saved,lineage),true);assert.equal(isCurrentDraftBlock(saved,current),false);
 assert.equal(matchesDraftLineage(saved.snapshot,current),false,'old quotes are also ineligible for approval');
 const rebuilt={...saved,id:'new-build',status:'running',snapshot:{...snapshot(),planning:current.planning}};
 assert.equal(isCurrentDraftBlock(rebuilt,current),true);assert.deepEqual([rebuilt,saved].filter(b=>isCurrentDraftBlock(b,current)).map(b=>b.id),['new-build']);
});

test('old pipeline snapshots, other runs, changed brand, altered hashes and incomplete planning cannot reuse or approve a saved preview',()=>{
 for(const mutate of [
  (s:ReturnType<typeof snapshot>)=>{s.inputs[0].brief.referenceReconstructionAllowed=false;},
  (s:ReturnType<typeof snapshot>)=>{s.inputs[0].brief.draftConstructionVersion=0;},
  (s:ReturnType<typeof snapshot>)=>{s.inputs[0].brief.resourceBindingVersion=0;},
  (s:ReturnType<typeof snapshot>)=>{s.inputs[0].materialMemory.version=0;},
  (s:ReturnType<typeof snapshot>)=>{s.inputs[0].creativeHandoff.owner='planning';},
  (s:ReturnType<typeof snapshot>)=>{s.inputs[0].runId='old-run';},
  (s:ReturnType<typeof snapshot>)=>{s.inputs[0].roundId='manual-round';},
  (s:ReturnType<typeof snapshot>)=>{s.a1Id='old-brand';},
  (s:ReturnType<typeof snapshot>)=>{s.planning[0].sha256='changed';},
  (s:ReturnType<typeof snapshot>)=>{s.planning[0]=s.planning[1];},
 ]){const s=snapshot();mutate(s);assert.equal(matchesDraftLineage(s,lineage),false);}
 for(const status of ['quoted','superseded'])assert.equal(isCurrentDraftBlock({...block(),status},lineage),false);
 assert.equal(isCurrentDraftBlock({...block(),run_id:'old-run'},lineage),false);assert.equal(isCurrentDraftBlock(block(),null),false);
 assert.equal(matchesDraftLineage(snapshot(),draftLineage(round,jobs.slice(1))),false);
 assert.equal(matchesDraftLineage(snapshot(),draftLineage(round,jobs.map(j=>j.job_key==='asset-plan'?{...j,state:'failed'}:j))),false);
 assert.equal(matchesDraftLineage(null,lineage),false);
});

test('completion requires current work for every direction; an empty or partial work set never advances to review',()=>{
 assert.equal(draftWorkProgress([],0).state,'running');assert.equal(draftWorkProgress([],1).state,'running');
 assert.equal(draftWorkProgress([{status:'done',question:null}],2).state,'running');assert.equal(draftWorkProgress([{status:'running',question:null}],1).state,'running');
 assert.equal(draftWorkProgress([{status:'done',question:null}],1).state,'complete');
 assert.deepEqual(draftWorkProgress([{status:'review',question:{question:'Check this layout'}}],1),{state:'review',questions:[{question:'Check this layout'}]});
});

test('unpublished review milestones follow the current build while pauses, client checkpoints and provider receipts retain priority',()=>{
 const control={stage:'draft_review',status:'review',blocker:null} as GuidedRunControl,round={phase:'ready_for_draft_assembly'};
 const visible=visibleDraftControl(control,round,{active:false});assert.equal(visible?.stage,'assembly');assert.equal(visible?.status,'review');assert.equal(control.stage,'draft_review');
 assert.equal(visibleDraftControl(control,round,{active:true,status:'running'})?.status,'running');
 assert.equal(visibleDraftControl(control,round,{active:true,status:'ready'}),control);
 for(const phase of ['awaiting_client_drafts','final_in_progress'])assert.equal(visibleDraftControl(control,{phase},{active:false}),control);
 for(const status of ['paused','blocked','complete'] as const){const stopped={...control,status};assert.equal(visibleDraftControl(stopped,round,{active:false}),stopped);}
 assert.equal(visibleRunControl(visible,{status:'active'},[{status:'unknown'}])?.blocker,'UNRESOLVED_PROVIDER_RECEIPT');
});

test('the real start and tick handlers ignore old ready blocks, preserve current-start idempotency and reject stale approvals without provider work',async()=>{
 const root=await mkdtemp(join(tmpdir(),'draft-lineage-'));
 try{
  // Use the production handlers with a recorded database and a catalog boundary that must never send a request.
  const stubs:Record<string,string>={
   'server-only':'',
   './drafts':"import {fixture} from 'fixture-runtime';export async function draftContext(){return fixture;}",
   './studio':'export function checked(result){if(result.error)throw new Error(result.error.message);return result.data;}',
   './api':'export class ApiError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}',
   './director':"import {trace} from 'fixture-runtime';export async function approveDirectorQuote(){trace.approvals++;}",
   '@/packages/data/run-limits':'export async function effectiveRunAgents(){return [];}',
   '@/packages/agents/catalog':"import {trace} from 'fixture-runtime';export async function modelCatalog(){trace.catalog++;throw new Error('RECORDED_QUOTE_BOUNDARY');}",
   'fixture-runtime':'export let fixture;export const trace={catalog:0,approvals:0};export function setFixture(value){fixture=value;trace.catalog=0;trace.approvals=0;}',
  };
  const result=await build({stdin:{contents:`export {directorStart,directorTick} from ${JSON.stringify(resolve('lib/server/director-start.ts'))};export {setFixture,trace} from 'fixture-runtime';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false,packages:'external',logLevel:'silent',plugins:[{name:'recorded-boundaries',setup(plugin){plugin.onResolve({filter:/.*/},args=>Object.hasOwn(stubs,args.path)&&(args.path==='fixture-runtime'||args.path==='server-only'||args.importer.endsWith('/director-start.ts'))?{path:args.path,namespace:'recorded'}:undefined);plugin.onLoad({filter:/.*/,namespace:'recorded'},args=>({contents:stubs[args.path],loader:'js'}));}}]});
  await symlink(resolve('node_modules'),join(root,'node_modules'),'dir');
  const path=join(root,'handler.cjs');await writeFile(path,result.outputFiles[0].text);
  const handlers=createRequire(import.meta.url)(path) as {setFixture:(value:unknown)=>void;trace:{catalog:number;approvals:number};directorStart:(id:string,approval?:{quoteId:string;maxCostMicroUsd:number})=>Promise<{started:boolean;block?:{id:string}}> ;directorTick:(id:string)=>Promise<{state:string;needsPrice?:boolean}>};
  let blocks:ReturnType<typeof block>[]=[];let works:{direction_id:string;status:string;question:unknown}[]=[];
  const saved={round,context:{scope:{draftConceptCount:1},planningRefs:lineage.planning},jobs:jobs.map(j=>({...j,output:JSON.stringify(j.job_key==='script'?kite.script:{recorded:true})})),run:{id:round.run_id},tenant:'tenant',admin:{
   rpc:async(name:string)=>{assert.ok(['studio_director_protocol_version','studio_draft_request_policy_version'].includes(name));return {data:name==='studio_draft_request_policy_version'?'draft-size@2':'director@1',error:null};},
   from:(table:string)=>{const query={select:()=>query,eq:()=>query,neq:()=>query,order:()=>query,then:(resolve:(result:unknown)=>unknown)=>resolve({data:table==='studio_director_blocks'?blocks:works,error:null})};assert.ok(['studio_director_blocks','studio_director_work'].includes(table));return query;},
  }};
  const sourceHash=digest({round:round.id,a1:round.a1_id,context:{scope:saved.context.scope,manifest:undefined,submittedBrief:undefined,brand:undefined},planning:saved.jobs.map(j=>({id:j.id,hash:j.output_hash,contentHash:digest(j.output)}))});
  const current={...block(),snapshot:{...snapshot(),sourceHash}};
  handlers.setFixture(saved);blocks=[current];works=[{direction_id:'direction',status:'done',question:null}];
  const reused=await handlers.directorStart('campaign');assert.equal(reused.started,false);assert.equal(reused.block?.id,'saved');assert.deepEqual(handlers.trace,{catalog:0,approvals:0});
  blocks=[{...current,snapshot:{...current.snapshot,inputs:current.snapshot.inputs.map(i=>({...i,brief:{...i.brief,referenceReconstructionAllowed:false}}))}}];
  await assert.rejects(()=>handlers.directorStart('campaign'),/RECORDED_QUOTE_BOUNDARY/);assert.equal(handlers.trace.catalog,1);assert.equal(handlers.trace.approvals,0);
  assert.deepEqual(await handlers.directorTick('campaign'),{state:'review',needsPrice:true,questions:[{question:'Review a new draft price to build from the current planning. Earlier previews remain saved.'}]});
  blocks=blocks.map(b=>({...b,status:'quoted'}));await assert.rejects(()=>handlers.directorStart('campaign',{quoteId:'recorded-quote',maxCostMicroUsd:2000000}),/approved inputs changed/);assert.equal(handlers.trace.approvals,0);
  blocks=[{...current,snapshot:{...current.snapshot,planning:lineage.planning.map(p=>({...p,id:'earlier-'+p.id}))}}];
  await assert.rejects(()=>handlers.directorStart('campaign'),/RECORDED_QUOTE_BOUNDARY/);assert.equal((await handlers.directorTick('campaign')).needsPrice,true);
  blocks=[{...current,snapshot:{...current.snapshot,inputs:current.snapshot.inputs.map(i=>({...i,directionId:'direction'}))}}];works=[];
  assert.equal((await handlers.directorTick('campaign')).state,'running');
  works=[{direction_id:'direction',status:'done',question:null}];assert.equal((await handlers.directorTick('campaign')).state,'complete');
 }finally{await rm(root,{recursive:true,force:true});}
});
