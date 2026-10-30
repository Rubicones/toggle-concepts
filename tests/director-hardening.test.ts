import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compactTranscript} from '../packages/director/transcript';
import {retryableProviderFailure,providerFailure,paidText,type TextLedger,type SavedRequest} from '../packages/director/money';
import {synthesisPermitted} from '../packages/director/resources';
import {questionForFailure} from '../packages/director/questions';
import {assemble} from '../apps/local-runner/director/assembler';
import type {LoopState} from '../packages/director/state';
import type {DirectionInput} from '../packages/director/types';

test('older assembler writes are replaced by a pointer to the file on disk; recent turns stay verbatim',()=>{
 const source='x'.repeat(20000),write=JSON.stringify({calls:[{tool:'write',path:'Composition.tsx',source}]});
 const transcript:LoopState['transcript']=[{from:'agent',text:write},{from:'tool',text:'y'.repeat(5000)},...Array.from({length:6},(_,i)=>({from:'tool' as const,text:`recent ${i}`}))];
 const compact=compactTranscript(transcript);
 assert.ok(!compact[0].text.includes(source));assert.match(compact[0].text,/20000 characters written earlier/);assert.match(compact[0].text,/Composition\.tsx/);
 assert.ok(compact[1].text.length<1000);assert.deepEqual(compact.slice(2),transcript.slice(2));
 assert.ok(JSON.stringify(compact).length<JSON.stringify(transcript).length/5);
});

test('only settled provider failures are retried with a new identity; open receipts never are',()=>{
 assert.ok(retryableProviderFailure(providerFailure('PROVIDER_429','failed')));
 assert.ok(retryableProviderFailure(providerFailure('SAVED_REQUEST_FAILED','failed')));
 assert.ok(!retryableProviderFailure(providerFailure('PROVIDER_502','unknown')));
 assert.ok(!retryableProviderFailure(providerFailure('OUTPUT_TOKEN_LIMIT','failed')));
 assert.ok(!retryableProviderFailure(new Error('PROVIDER_429')));
});

test('paidText marks a failed receipt as settled and an unknown one as open',async()=>{
 const rows=new Map<string,SavedRequest>();
 const ledger:TextLedger={async find(id){return rows.get(id)??null;},async reserve(id){const row={id,status:'reserved',output:null,cost:null};rows.set(id,row);return row;},async claim(){return true;},async anchor(){},async settle(id,r){rows.set(id,{id,status:r.outcome,output:r.text,cost:r.cost,error:r.failure});}};
 const base={role:'director' as const,model:'m',prompt:'p',snapshot:{instructions:'i',maxOutputTokens:100,pricing:{inputPrice:0,outputPrice:0}},allowanceMicroUsd:1e9,ledger};
 await assert.rejects(()=>paidText({...base,identity:'a',transport:async()=>({outcome:'failed',cost:0,text:null,generation:null,usage:null,failure:'PROVIDER_429'})}),e=>(e as {outcome?:string}).outcome==='failed');
 await assert.rejects(()=>paidText({...base,identity:'a'}),e=>(e as Error).message==='SAVED_REQUEST_FAILED'&&(e as {outcome?:string}).outcome==='failed');
 await assert.rejects(()=>paidText({...base,identity:'b',transport:async()=>({outcome:'unknown',cost:null,text:null,generation:null,usage:null,failure:'PROVIDER_502'})}),e=>(e as {outcome?:string}).outcome==='unknown');
});

test('the Sonicdesk brief permits generated stills; an explicit refusal asks the AD',()=>{
 assert.ok(synthesisPermitted('Lifestyle scenes may be generated: musicians at home, rehearsal rooms, desks with instruments. Any motion or flat graphics. The product UI must not be AI-generated; use simplified mockups.'));
 assert.ok(!synthesisPermitted(''));assert.ok(!synthesisPermitted('No generated imagery.'));assert.ok(!synthesisPermitted('Нет, только наши фото'));assert.ok(synthesisPermitted('Note: stills may be generated.'));
});

test('a reply cut at the output limit is discarded and explained; the loop continues',async()=>{
 const state:LoopState={turn:0,startedAt:0,transcript:[],complete:false};let calls=0;
 await assemble({state,maxTurns:4,maxToolCalls:10,timeMs:100,now:()=>1,call:async()=>{calls++;if(calls===1)throw new Error('OUTPUT_TOKEN_LIMIT');return JSON.stringify({calls:[{tool:'finish'}]});},tool:async()=>({complete:true}),save:async()=>{}});
 assert.equal(state.complete,true);assert.equal(calls,2);assert.match(state.transcript[0].text,/OUTPUT_TOKEN_LIMIT/);
});

test('an execution stop is explained in plain words and can be resumed for free',()=>{
 const input={directionId:'d',iterationId:'i'} as DirectionInput;
 const q=questionForFailure(input,Object.assign(new Error('DIRECTOR_TOOLCHAIN_UNAVAILABLE'),{detail:'The renderer browser could not be installed.'}),5_000_000);
 assert.equal(q.reason,'execution');assert.match(q.question,/renderer is not ready/);assert.ok(q.options.some(o=>o.action==='resume'&&o.priceMicroUsd===0));assert.match(q.technical??'',/DIRECTOR_TOOLCHAIN_UNAVAILABLE/);assert.doesNotMatch(q.question,/[A-Z]{3,}_[A-Z]{3,}/);
 const budget=questionForFailure(input,new Error('ASSEMBLER_ALLOWANCE_EXHAUSTED'),5_000_000);assert.equal(budget.reason,'budget');assert.ok(budget.options.some(o=>o.action==='resume'&&o.priceMicroUsd===0));
});

test('both storyboard shapes written by the planning agent are read; a broken scene names its fields',async()=>{
 const {approvedScenes}=await import('../packages/director/inputs');
 const current=approvedScenes([{sceneId:'scene-1',startTime:0,endTime:1.5,visualNotes:'Montage',onScreenCopy:'YOUR BAND.',narration:'n'}],'d');
 const older=approvedScenes([{beatID:'1.1',startTimeSeconds:0,endTimeSeconds:'1.5',scene:'Close-up',onScreenCopy:'Hook',motionNotes:'Swipe'}],'d');
 assert.equal(current[0].end,1.5);assert.equal(current[0].visualNotes,'Montage');assert.equal(older[0].end,1.5);assert.equal(older[0].visualNotes,'Close-up');assert.equal(older[0].motionNotes,'Swipe');
 assert.equal(approvedScenes({'6s':[{start:'0:00',end:'0:02',description:'Shot'}]},'d')[0].end,2);
 assert.throws(()=>approvedScenes([{at:'beginning',visualNotes:'x'}],'d'),e=>(e as Error&{detail?:string}).detail?.includes('fields: at, visualNotes')===true);
});

test('absent optional fields hash like the stored JSON instead of stopping the price',async()=>{
 const {canonicalJson}=await import('../packages/contracts/common');
 assert.equal(canonicalJson({a:undefined,b:[undefined,1],c:{d:undefined,e:'x'}}),canonicalJson(JSON.parse(JSON.stringify({a:undefined,b:[undefined,1],c:{d:undefined,e:'x'}}))));
 assert.equal(canonicalJson({b:2,a:1}),'{"a":1,"b":2}');
});

test('the provider receives a portable schema; the app keeps validating the full contract',async()=>{
 const {providerJsonSchema}=await import('../packages/director/provider-schema');
 const {assemblerResponse}=await import('../packages/agents/prompts/assembler-v1');
 const {z}=await import('zod');
 const text=JSON.stringify(providerJsonSchema(z.toJSONSchema(assemblerResponse)));
 for(const keyword of ['"oneOf"','"maxLength"','"minLength"','"maximum"','"maxItems"','"$schema"','"const"'])assert.ok(!text.includes(keyword),keyword);
 assert.ok(text.includes('"anyOf"'));assert.ok(text.includes('"enum":["write"]'));assert.ok(text.includes('"minItems":1'));
 assert.equal(assemblerResponse.safeParse({calls:Array.from({length:7},()=>({tool:'lint'}))}).success,false);
});

test('each coding turn gets a compact context; full approved data stays in its folder',async()=>{
 const {assemblerContext}=await import('../packages/director/transcript');
 const {readFileSync}=await import('node:fs');
 const input=JSON.parse(readFileSync('fixtures/director/input.json','utf8'));
 input.brand.rawKit={materials:[{text:'x'.repeat(50000)}]};input.variantFacts={v:{required:['y'.repeat(50000)],sceneCopy:{}}};input.brief.approvedDirection={big:'z'.repeat(50000)};
 const context=JSON.stringify(assemblerContext(input,{designDocument:'Doc',resources:[]} as never,[],[]));
 assert.ok(context.length<JSON.stringify(input).length/5);assert.ok(!context.includes('xxxxx')&&!context.includes('yyyyy')&&!context.includes('zzzzz'));assert.match(context,/brand\.ts/);
});

test('the coding agent answers through one flat call shape that the app turns back into exact tools',async()=>{
 const {readAssemblerReply,assemblerProviderSchema}=await import('../packages/agents/prompts/assembler-v1');
 const reply=readAssemblerReply({calls:[{tool:'write',path:'Composition.tsx',source:'x',variantId:null},{tool:'typecheck',path:null},{tool:'renderStill',variantId:'v1',frame:12}]});
 assert.deepEqual(reply.calls,[{tool:'write',path:'Composition.tsx',source:'x'},{tool:'typecheck'},{tool:'renderStill',variantId:'v1',frame:12}]);
 assert.throws(()=>readAssemblerReply({calls:[{tool:'write',path:'a.tsx'}]}));
 assert.ok(!JSON.stringify(assemblerProviderSchema.schema).includes('oneOf')&&!JSON.stringify(assemblerProviderSchema.schema).includes('anyOf'));
});

test('an allowance stop names the role that gets one more allowance',async()=>{
 const {exhaustedRole}=await import('../packages/director/questions');
 assert.equal(exhaustedRole('ROLE_ALLOWANCE_EXHAUSTED: assembler: input 1,390,483 used'),'assembler');
 assert.equal(exhaustedRole('ROLE_ALLOWANCE_EXHAUSTED: critic: its approved working time is used up'),'critic');
 assert.equal(exhaustedRole('ASSEMBLER_ALLOWANCE_EXHAUSTED'),'assembler');assert.equal(exhaustedRole('PROVIDER_400'),null);
});

test('a malformed or extra call never discards the valid calls of the same turn',async()=>{
 const {parseAssemblerReply}=await import('../packages/agents/prompts/assembler-v1');
 const text='Here is my work:\n'+JSON.stringify({calls:[{tool:'write',path:'Composition.tsx',source:'x',variantId:'',frame:0},{tool:'renderStill',variantId:''},{tool:'typecheck',path:''},...Array.from({length:5},()=>({tool:'lint'}))]});
 const reply=parseAssemblerReply(text);
 assert.deepEqual(reply.calls.slice(0,2),[{tool:'write',path:'Composition.tsx',source:'x'},{tool:'typecheck'}]);
 assert.equal(reply.calls.length,5);assert.equal(reply.rejected.length,3);assert.match(reply.rejected[0].error,/variantId/);assert.match(reply.rejected[1].error,/at most 6/);
 assert.throws(()=>parseAssemblerReply('no json here'),/not JSON/);
});

test('the coding agent gets the brand module API instead of paging through the generated data',async()=>{
 const {brandModuleGuide}=await import('../packages/director/transcript');
 const {readFileSync}=await import('node:fs');
 const input=JSON.parse(readFileSync('fixtures/director/input.json','utf8'));input.variantFacts={[input.variants[0].id]:{sceneCopy:{[input.storyboard[0].id]:['YOUR BAND.']},required:['YOUR BAND.']}};
 const guide=brandModuleGuide(input);
 assert.match(guide,/import \{brand, copy, variantFacts, variants\} from '\.\/brand'/);assert.match(guide,/YOUR BAND\./);assert.match(guide,/data-brand-logo/);assert.ok(guide.length<20000);
});
