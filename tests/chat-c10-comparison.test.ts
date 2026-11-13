// Chat-shaped plan C10: the tooling for the owner's measured comparison. Recorded usage rows and recorded CLI answers
// only (tests/fixtures/fake-claude.mjs); no model is called and no database is needed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {comparisonView,sideOf,drawChatFirst,canReveal,frameLabel,runFrames,runReport,pictureType,BRIEF_KINDS,type StoredComparison} from '../packages/agents/comparison';
import {buildRunContext} from '../packages/agents/run-context';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {agentResponseSchema} from '../packages/contracts/agent-output';
import {cliTextTransport,type LocalTextReceipt} from '../apps/local-runner/local-claude/transport';
import {fakeSetup,fixture} from './local-chat-shaped.test';

const comparison=(revealed:boolean,verdicts:(null|'A'|'B'|'same')[]):StoredComparison=>({id:'c',run_id:'r',brief_kind:'product',title:'Lamp',chat_tokens:42000,created_at:'2026-11-13T10:00:00Z',revealed_at:revealed?'2026-11-13T11:00:00Z':null,
 pairs:verdicts.map((v,i)=>({id:`p${i}`,position:i+1,label:i?`Scene ${i+1}`:'Hero frame',chat_first:i%2===0,verdict:v,note:v?'why':null,judged_at:v?'2026-11-13T10:30:00Z':null}))});

test('C10: the pairs stay blind until every pair is judged and the owner reveals them', ()=>{
 const blind=comparisonView(comparison(false,['A',null]));
 assert.ok(!/chat_first|"A":"|"B":"|winner|pipeline|"chat"/.test(JSON.stringify(blind)),'nothing on the page says which is which');
 assert.equal(blind.canReveal,false);assert.equal(comparisonView(comparison(false,['A','same'])).canReveal,true);assert.equal(canReveal([]),false);
 const shown=comparisonView(comparison(true,['A','B','same']));
 assert.deepEqual(shown.pairs.map(p=>[p.A,p.B,p.winner]),[['chat','pipeline','chat'],['pipeline','chat','chat'],['chat','pipeline','same']],'the second pair drew the pipeline as A');
 assert.deepEqual(shown.score,{pipeline:0,chat:2,same:1});assert.equal(shown.canReveal,false,'revealed once');
 assert.equal(sideOf(false,'A'),'pipeline');assert.equal(sideOf(false,'B'),'chat');
 assert.equal(drawChatFirst(()=>0.2),true);assert.equal(drawChatFirst(()=>0.7),false,'the order is drawn, then stored');
 assert.deepEqual(BRIEF_KINDS.map(b=>b.id),['restrained','product','interface']);
});

test('C10: a run\'s frames are its hero and its scenes, latest picture each, per direction', ()=>{
 const e=(id:string,dir:string,step:string,at:string)=>({id,directionId:dir,stepId:step,at});
 const frames=runFrames([e('1','d1','it1:designer:1:hero:started:0','2026-11-13T10:00:00Z'),e('2','d1','it1:designer:1:hero:accepted:1','2026-11-13T10:05:00Z'),
  e('3','d1','it1:wrap:v1:scene-2:hero','2026-11-13T10:06:00Z'),e('4','d1','it1:coder:3:renderStill:x:y','2026-11-13T10:07:00Z'),e('5','d2','it2:designer:1:hero:accepted:0','2026-11-13T10:08:00Z'),e('6','d1','it1:wrap:v1:scene-10:hero','2026-11-13T10:09:00Z')]);
 assert.deepEqual(frames.map(f=>[f.eventId,f.label]),[['2','Direction 1 · Hero frame'],['3','Direction 1 · Scene 2'],['6','Direction 1 · Scene 10'],['5','Direction 2 · Hero frame']]);
 assert.equal(frameLabel('x:coder:1:renderStill:a:b'),null);assert.deepEqual(frameLabel('i:wrap:v:scene-3:end')?.label,'Scene 3 (end)');
});

test('C10: the run in numbers: per stage and in total, the cache line, and the share of text answers that needed a repair', ()=>{
 const row=(role:string,stage:string,at:string,u:{input:number;read:number;write:number;output:number;usd:number;ms:number;turns?:number},extra:Record<string,unknown>={},status='succeeded')=>({role,status,created_at:at,config_snapshot:{},
  usage:{_local:{stage,effort:'high',numTurns:u.turns??1,durationMs:u.ms,apiEquivalentUsd:u.usd,usage:{input_tokens:u.input,cache_read_input_tokens:u.read,cache_creation_input_tokens:u.write,output_tokens:u.output},...extra}}});
 const rows=[row('strategy','plan-create','2026-11-13T10:00:00Z',{input:1000,read:5000,write:6000,output:2500,usd:0.12,ms:60000},{answerFormat:'text'}),
  row('script','plan-create','2026-11-13T10:02:00Z',{input:800,read:11000,write:7000,output:4400,usd:0.15,ms:90000,turns:2},{answerFormat:'text',schemaCheck:{repaired:true,issues:['x']}}),
  row('visual-direction','plan-create','2026-11-13T10:05:00Z',{input:900,read:18000,write:12000,output:5000,usd:0.2,ms:120000},{answerFormat:'text',schemaCheck:{repaired:true,issues:['y']}},'failed'),
  row('designer','design-hero','2026-11-13T10:10:00Z',{input:2000,read:30000,write:20000,output:8000,usd:0.5,ms:300000}),
  {role:'research',status:'succeeded',created_at:'2026-11-13T09:58:00Z',usage:{cost:1}}];
 const r=runReport(rows,s=>s==='plan-create'?'Planning':s==='design-hero'?'Hero frame':s);
 assert.deepEqual(r.stages.map(s=>[s.label,s.totals.calls,s.turns]),[['Planning',3,4],['Hero frame',1,1]]);
 assert.equal(r.total.totals.calls,4);assert.equal(r.total.totals.output,19900);assert.equal(r.total.wallMs,Date.parse('2026-11-13T10:15:00Z')-Date.parse('2026-11-13T10:00:00Z'));
 assert.equal(r.stages[0].timeMs,270000,'time per stage: its requests');assert.ok(Math.abs(r.total.totals.apiEquivalentUsd-0.97)<1e-9);
 assert.deepEqual(r.repair,{answers:3,repaired:2,notFitting:1,share:2/3});assert.match(r.cacheLine!,/^Read from the cache: Planning \d+% · Hero frame \d+%/);
 assert.deepEqual(runReport([]).repair,{answers:0,repaired:0,notFitting:0,share:null});
});

test('C10: a text-format planning answer is marked in its usage record, so the repair rate can be counted', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'c10-home-'));
 const f=fixture('plain-planning'),answer={schemaVersion:'1.0',role:'research',status:'blocked',summary:'s'};
 const ctx=buildRunContext({briefText:'{}',brandPack:'BRAND',packVersion:1,materials:{entries:[],budget:{...DEFAULT_MATERIAL_BUDGET,research:{count:0,tokens:0}}},planningChat:true,schemaInText:true});
 const loose={type:'object',properties:{schemaVersion:{type:'string'},role:{type:'string'},status:{type:'string'},summary:{type:'string'}},required:['schemaVersion','role','status','summary'],additionalProperties:true};
 const r=await cliTextTransport(await fakeSetup('text',{FAKE_CLAUDE_ANSWER:JSON.stringify(answer)}),{shared:async()=>ctx,role:'research',runId:'run-c10'})(f.model,f.prompt,{...f.cfg,outputFormat:'json_schema',responseSchema:{name:'loose',schema:loose}}) as LocalTextReceipt;
 assert.equal(r.outcome,'succeeded',r.failure??'');assert.equal(r.local?.answerFormat,'text');
 const old=await cliTextTransport(await fakeSetup('structured',{FAKE_CLAUDE_STRUCTURED:JSON.stringify(answer)}),{shared:async()=>buildRunContext({briefText:'{}',brandPack:'BRAND'}),role:'research',runId:'run-c10'})(f.model,f.prompt,{...f.cfg,outputFormat:'json_schema',responseSchema:agentResponseSchema('research')}) as LocalTextReceipt;
 assert.equal(old.local?.answerFormat,undefined,'earlier contexts: no mark');
});

test('C10: the chat picture is checked by its bytes; the table is closed to the browser; the page says plainly when an update is needed', ()=>{
 assert.deepEqual(pictureType(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0])),{mime:'image/png',ext:'png'});
 assert.deepEqual(pictureType(Buffer.from([0xff,0xd8,0xff,0xe0])),{mime:'image/jpeg',ext:'jpg'});
 assert.deepEqual(pictureType(Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP')])),{mime:'image/webp',ext:'webp'});
 assert.equal(pictureType(Buffer.from('<svg/>')),null);
 const sql=readFileSync('supabase/migrations/20261113000400_chat_comparisons.sql','utf8');
 for(const t of ['studio_chat_comparisons','studio_chat_comparison_pairs'])assert.match(sql,new RegExp(`alter table public\\.${t} enable row level security`));
 assert.match(sql,/revoke all on public\.studio_chat_comparisons,public\.studio_chat_comparison_pairs from public,anon,authenticated/);assert.match(sql,/COMPARISON_PAIR_FROZEN/);
 assert.ok(readFileSync('supabase/tests/chat-comparisons.sql','utf8').includes('COMPARISON_PAIR_FROZEN'));
 const page=readFileSync('components/studio/chat-comparison.tsx','utf8'),server=readFileSync('lib/server/chat-comparison.ts','utf8');
 assert.match(page,/Update needed: apply migration <code>20261113000400_chat_comparisons\.sql<\/code>/);assert.match(server,/schemaReady:false/);
 for(const words of ['сдержанный','продуктовый','цифровой интерфейс','первую попытку','Shared Local','версии 4','A и B'])assert.ok(page.includes(words),words);
});
