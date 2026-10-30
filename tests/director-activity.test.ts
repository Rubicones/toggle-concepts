import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {mergeDirectorEvents,type DirectorActivityPage} from '../packages/director/activity';

test('sub-millisecond request transitions keep their receipt after their running event',()=>{
 const base={stepId:'request',kind:'request' as const,message:'Recorded transition'};
 const events=mergeDirectorEvents([{...base,id:'a',at:'2026-10-30T12:00:00.123002+00:00',status:'done'}],[{...base,id:'z',at:'2026-10-30T12:00:00.123001+00:00',status:'running'}]);
 assert.deepEqual(events.map(e=>e.status),['running','done']);
});

test('activity reads page equal-time events and AD decisions without repeats, omissions or unscoped rows',async()=>{
 const root=await mkdtemp(join(tmpdir(),'director-activity-'));
 try{
  const file=join(root,'activity.mjs');
  await build({entryPoints:[resolve('lib/server/director-activity.ts')],outfile:file,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'recorded-services',setup(builder){
   builder.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
   builder.onResolve({filter:/^\.\/studio$/},()=>({path:'studio',namespace:'fixture'}));
   builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='empty'?'':`export const checked=result=>{if(result.error)throw result.error;return result.data};export const campaignRecord=()=>{throw Error('No shared database allowed')};export const studioContext=()=>{throw Error('No shared database allowed')};`,loader:'js'}));
  }}]});
  const {readDirectorActivity}=await import(pathToFileURL(file).href);
  const at='2026-10-30T12:00:00.123456+00:00',id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const events=Array.from({length:123},(_,n)=>({id:id(n+1),created_at:at,block_id:'own-block',iteration_id:'iteration',direction_id:'direction',payload:{stepId:`request-${n}`,kind:'request',status:'done',message:'Recorded receipt',costMicroUsd:1000,model:'fixture'}}));
  const decisions=Array.from({length:65},(_,n)=>({id:id(n+1),created_at:at,block_id:'own-block',direction_id:'direction',decision:'extend:assembler',question_id:'question',created_by:'ad'}));
  const foreign={...events[0],id:id(999),block_id:'other-campaign'};events.push(foreign);
  const queries:{table:string;limit?:number;columns?:string}[]=[];
  const admin={from(table:string){let rows:Record<string,unknown>[]=table==='studio_director_events'?[...events]:[...decisions];const trace={table,limit:undefined as number|undefined,columns:undefined as string|undefined};queries.push(trace);
   const query={select(columns:string){trace.columns=columns;return query;},in(key:string,values:unknown[]){rows=rows.filter(r=>values.includes(r[key]));return query;},eq(key:string,value:unknown){rows=rows.filter(r=>r[key]===value);return query;},order(){return query;},limit(value:number){trace.limit=value;return query;},or(filter:string){const before=/id.lt.([0-9a-f-]+)/.exec(filter)![1];rows=rows.filter(r=>String(r.id)<before);return query;},returns(){return Promise.resolve({data:rows.sort((a,b)=>String(b.id).localeCompare(String(a.id))).slice(0,trace.limit),error:null});}};return query;}};
  let page:DirectorActivityPage=await readDirectorActivity(admin,['own-block'],'campaign','direction');
  assert.equal(page.events.length,100);assert.ok(page.next?.events);assert.ok(page.next?.decisions);
  let all=page.events;let pages=1;
  // A newly arriving event cannot shift the cursor or duplicate an earlier row.
  events.push({...events[0],id:id(998)});
  while(page.next){page=await readDirectorActivity(admin,['own-block'],'campaign','direction',page.next);all=mergeDirectorEvents(all,page.events);assert.ok(++pages<6);}
  assert.equal(all.length,188);assert.equal(pages,3);assert.equal(all.filter(e=>e.kind==='request').length,123);assert.equal(all.filter(e=>e.kind==='control').length,65);
  assert.ok(all.every(e=>e.directionId==='direction'));assert.ok(!all.some(e=>e.id===foreign.id||e.id===id(998)));assert.ok(all.filter(e=>e.kind==='request').every(e=>e.costMicroUsd===1000&&e.model==='fixture'));
  assert.ok(queries.every(q=>q.limit===51&&q.columns!=='*'));assert.equal(queries.length,5,'exhausted decision pages are not fetched again');
 }finally{await rm(root,{recursive:true,force:true});}
});
