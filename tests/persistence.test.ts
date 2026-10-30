import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DraftPersistence} from '../lib/draft-persistence';
import {studioCampaignRecord,campaignCreateSchema,campaignEditSchema,campaignEditConflicts,campaignLifecycleDocument,isCampaignRemoved} from '../packages/contracts/campaign-record';
import {emptyBrandDraft,brandInputErrors} from '../packages/contracts/brand-kit';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
test('autosave serializes edits during a save and flush waits for the newest confirmed revision',async()=>{
 const gate=deferred<number>(),calls:{text:string;version:number}[]=[];let active=0,max=0;
 const store=new DraftPersistence({text:''},0,async(value,version)=>{active++;max=Math.max(max,active);calls.push({...value,version});const saved=calls.length===1?await gate.promise:version+1;active--;return saved;},()=>{},100000);
 store.set({text:'First answer'});const first=store.flush();await Promise.resolve();store.set({text:'Latest answer'});const submit=store.flush(true);assert.equal(store.getSnapshot().saving,true);assert.equal(store.getSnapshot().dirty,true);gate.resolve(1);assert.equal(await first,2);assert.equal(await submit,2);
 assert.deepEqual(calls,[{text:'First answer',version:0},{text:'Latest answer',version:1}]);assert.equal(max,1);assert.equal(store.getSnapshot().dirty,false);assert.equal(store.getSnapshot().value.text,'Latest answer');
});
test('failed and conflicted saves stay dirty, cannot claim success, and can be explicitly retried or discarded',async()=>{
 let fail=true;const store=new DraftPersistence('original',3,()=>{if(fail)throw new Error('STALE_BRIEF');return Promise.resolve(4);},()=>{},100000);store.set('local answer');await assert.rejects(store.flush(),/STALE_BRIEF/);assert.equal(store.getSnapshot().version,3);assert.equal(store.getSnapshot().dirty,true);assert.equal(store.getSnapshot().saving,false);assert.equal(store.getSnapshot().error,'STALE_BRIEF');store.adopt('other editor answer',4);assert.equal(store.getSnapshot().value,'local answer');fail=false;await store.flush();assert.equal(store.getSnapshot().version,4);assert.equal(store.getSnapshot().error,null);
 store.set('unsaved');store.discard();assert.equal(store.getSnapshot().value,'local answer');assert.equal(store.getSnapshot().dirty,false);
});
test('unchanged drafts do not write, first explicit save creates a record, and clean newer server versions can reload',async()=>{
 let writes=0;const store=new DraftPersistence({answer:''},0,async(_,v)=>{writes++;return v+1;},()=>{},100000);await store.flush();assert.equal(writes,0);await store.flush(true);await store.flush(true);assert.equal(writes,1);store.adopt({answer:'from Supabase'},2);assert.equal(store.getSnapshot().value.answer,'from Supabase');store.adopt({answer:'stale poll'},1);assert.equal(store.getSnapshot().value.answer,'from Supabase');
});
test('campaign create and lifecycle metadata are bounded, protected, and preserve answers and history references',()=>{
 const requestId=randomUUID();assert.equal(campaignCreateSchema.parse({requestId,name:' Campaign ',brand:' Brand ',goal:'All initial context'}).name,'Campaign');assert.equal(campaignCreateSchema.safeParse({requestId:'bad',name:'Campaign',brand:'Brand'}).success,false);
 assert.equal(campaignEditSchema.safeParse({document:{__studioRemovedAt:'fake'}}).success,false);assert.equal(campaignEditSchema.safeParse({document:{brief:'Saved answers',brandKit:'Saved kit'}}).success,true);
 const original={brief:'Existing answers',brandKit:'Existing kit',__studioCreationHash:'original creation receipt'},removed=campaignLifecycleDocument(original,randomUUID(),true,'2026-10-24T00:00:00.000Z');assert.equal(isCampaignRemoved({document:removed}),true);assert.equal(removed.brief,original.brief);assert.equal(removed.__studioCreationHash,original.__studioCreationHash);assert.deepEqual(campaignLifecycleDocument(removed,randomUUID(),false,''),original);assert.equal(isCampaignRemoved({document:original}),false);
});
test('incomplete brand links can persist as drafts while publication and foreign-source checks stay strict',()=>{
 const kit=emptyBrandDraft(['en-GB']),cp=randomUUID();kit.links=[{id:randomUUID(),title:'',url:'https://',excerpt:''}];assert.deepEqual(brandInputErrors(kit,cp,[],[],true),[]);assert.ok(brandInputErrors(kit,cp,[]).length);kit.sourceAssetIds=[randomUUID()];assert.ok(brandInputErrors(kit,cp,[],[],true).length);
});

test('campaign notes compare the saved field rather than overwriting a concurrent editor',()=>{
 const row={goal:'Original goal',document:{brief:'Other editor answer',brandKit:'My original kit'}};
 assert.equal(campaignEditConflicts(row,{document:{brief:'My answer'},previousDocument:{brief:'Old answer'}}),true);
 assert.equal(campaignEditConflicts(row,{document:{brandKit:'New kit'},previousDocument:{brandKit:'My original kit'}}),false);
 assert.equal(campaignEditConflicts(row,{goal:'New',previousGoal:'Outdated goal'}),true);
});

test('saved Supabase campaign timestamps load in the UI instead of hiding durable records',()=>{
 const input={id:randomUUID(),name:'Saved campaign',brand:'Brand',goal:'Initial context',created_at:'2026-10-24T12:34:56.123456+00:00'};const result=studioCampaignRecord(input);assert.equal(result.createdAt,'2026-10-24T12:34:56.123Z');assert.equal(result.id,input.id);assert.equal(result.goal,input.goal);
 assert.equal(studioCampaignRecord({...input,created_at:'2026-10-24T14:34:56+02:00'}).createdAt,'2026-10-24T12:34:56.000Z');
});
