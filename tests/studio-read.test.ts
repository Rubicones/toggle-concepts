import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observeStudioRead} from '../lib/studio-read';
import {singleFlightRead} from '../packages/data/read-single-flight';
import {directorViewWork,directorViewWorkColumns} from '../packages/director/read-projections';

test('visible reads follow events, coalesce slow requests and only fall back for disconnected active work',async t=>{
 const originalDocument=globalThis.document,originalEventSource=globalThis.EventSource;
 class Document extends EventTarget {visibilityState='visible';}
 class Source {
  static instances:Source[]=[];onmessage:((event:{data:string})=>void)|null=null;onopen:(()=>void)|null=null;onerror:(()=>void)|null=null;closed=false;
  constructor(){Source.instances.push(this);}close(){this.closed=true;}
  message(revision:string){this.onmessage?.({data:JSON.stringify({work:revision})});}
 }
 const document=new Document();Object.assign(globalThis,{document,EventSource:Source});
 t.mock.timers.enable({apis:['setTimeout']});
 let reads=0,inFlight=0,maximum=0,working=false,release:(()=>void)|undefined,signal:AbortSignal|undefined;
 const flush=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
 const observer=observeStudioRead('/api/studio/campaigns/recorded/director',async current=>{
  signal=current;reads++;maximum=Math.max(maximum,++inFlight);
  if(reads===2)await new Promise<void>(resolve=>{release=resolve;});
  inFlight--;
 },{active:()=>working});
 try{
  Source.instances[0].message('initial');t.mock.timers.tick(0);await flush();assert.equal(reads,1);
  t.mock.timers.tick(600000);await flush();assert.equal(reads,1,'idle connected pages do no periodic reads');
  Source.instances[0].message('changed');observer.refresh();observer.refresh();t.mock.timers.tick(300);await flush();assert.equal(reads,2);
  Source.instances[0].message('changed-again');observer.refresh();t.mock.timers.tick(10000);assert.equal(reads,2,'manual refresh never restarts an in-flight read');
  release!();await flush();t.mock.timers.tick(0);await flush();assert.equal(reads,3);assert.equal(maximum,1);
  document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));observer.refresh();t.mock.timers.tick(600000);await flush();assert.equal(reads,3);assert.ok(Source.instances[0].closed);
  document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));Source.instances[1].message('hidden-change');t.mock.timers.tick(300);await flush();assert.equal(reads,4);
  Source.instances[1].onerror?.();t.mock.timers.tick(600000);await flush();assert.equal(reads,4,'disconnection while awaiting AD review is not polling');
  working=true;observer.refresh();t.mock.timers.tick(300);await flush();assert.equal(reads,5);
  t.mock.timers.tick(30000);await flush();assert.equal(reads,6,'disconnected active work has a slow fallback');
  working=false;t.mock.timers.tick(600000);await flush();assert.equal(reads,6,'ending work disables the already armed fallback');
  working=true;Source.instances[1].message('reconnected');t.mock.timers.tick(300);await flush();assert.equal(reads,7);
  t.mock.timers.tick(600000);await flush();assert.equal(reads,7,'healthy SSE replaces the fallback, even during work');
 }finally{observer.close();assert.ok(signal?.aborted);t.mock.timers.reset();Object.assign(globalThis,{document:originalDocument,EventSource:originalEventSource});}
});

test('concurrent server reads share a scoped flight, but neither failures nor results become a stale cache',async()=>{
 let reads=0,release!:()=>void;
 const first=singleFlightRead('tenant/actor/campaign',async()=>{reads++;await new Promise<void>(resolve=>{release=resolve;});return 'first';});
 const second=singleFlightRead('tenant/actor/campaign',async()=>{throw Error('Duplicate read');});
 await Promise.resolve();assert.equal(reads,1);release();assert.deepEqual(await Promise.all([first,second]),['first','first']);
 assert.equal(await singleFlightRead('tenant/actor/campaign',async()=>++reads),2);
 await assert.rejects(singleFlightRead('tenant/other/campaign',async()=>{throw Error('Recorded failure');}),/Recorded failure/);
 assert.equal(await singleFlightRead('tenant/other/campaign',async()=>'recovered'),'recovered');
});

test('progress projection excludes production files and coder transcripts while preserving recovery guards',()=>{
 for(const field of ['state,','state->catalog','state->previousDesign','state->pendingSource','state->assembler->transcript'])assert.ok(!directorViewWorkColumns.includes(field));
 const row=directorViewWork({block_id:'block',assemblerTurn:0,workingClockVersion:2,phase:'assembler',selectedIterationId:'saved',activeCall:{role:'assembler',startedAt:100},events:[{at:100,text:'Started'}]});
 assert.equal(row.state.assembler?.turn,0);assert.equal(row.state.selectedIterationId,'saved');assert.deepEqual(row.state.activeCall,{role:'assembler',startedAt:100});assert.equal(row.state.workingClockVersion,2);
});
