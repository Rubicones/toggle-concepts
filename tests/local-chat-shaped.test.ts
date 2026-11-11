// Local mode, chat-shaped runs (docs/plans/2026-11-11-local-chat-shaped-runs.md). Recorded CLI results only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {localCallUsage,usageLine,usageTotals,totalsLine,roleAverages,apiEquivalentLabel} from '../packages/agents/local-usage';

const local=(u:Record<string,number>,extra:Record<string,unknown>={})=>({_local:{executedModel:'claude-sonnet-4-5',effort:'high',numTurns:1,durationMs:42000,apiEquivalentUsd:0.31,usage:u,...extra}});

test('LC0: one usage line per Local call; OpenRouter steps have none', ()=>{
 const call=localCallUsage({role:'visual-direction',usage:local({input_tokens:2000,cache_creation_input_tokens:10000,cache_read_input_tokens:140000,output_tokens:3000}),config_snapshot:{directorRole:'designer',localStage:'hero'}})!;
 assert.deepEqual([call.role,call.stage,call.effort,call.turns],['designer','hero','high',1]);
 assert.equal(usageLine(call),'in 12k · cached 140k · out 3k');
 assert.equal(localCallUsage({role:'critic',usage:{prompt_tokens:10}}),null);
 assert.equal(localCallUsage({role:'critic',usage:null}),null);
});

test('LC0: totals, the cached share and per-role averages', ()=>{
 const a=localCallUsage({role:'script',usage:local({input_tokens:1000,cache_creation_input_tokens:0,cache_read_input_tokens:9000,output_tokens:500})})!;
 const b=localCallUsage({role:'script',usage:local({input_tokens:3000,cache_creation_input_tokens:2000,cache_read_input_tokens:5000,output_tokens:1500})})!;
 const t=usageTotals([a,b]);
 assert.equal(t.cacheRead,14000);assert.equal(Math.round(t.cachedShare*100),70);assert.equal(t.apiEquivalentUsd.toFixed(2),'0.62');
 assert.match(totalsLine(t),/^2 requests · in 6k · cached 14k \(70% of input\) · out 2k$/);
 assert.match(apiEquivalentLabel(0.62),/subscription quota, not money spent/);
 assert.deepEqual(roleAverages([a,b]).map(r=>[r.role,r.calls,r.cacheRead]),[['script',2,7000]]);
});

// ---- Recorded CLI (tests/fixtures/fake-claude.mjs): no model is called. ----
import {mkdtemp,writeFile,chmod,readFile} from 'node:fs/promises';
import {readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {cliTextTransport,type LocalCliSetup,type LocalTextReceipt} from '../apps/local-runner/local-claude/transport';
import type {TextSnapshot} from '../packages/agents/text-provider';
import type {ImageInput} from '../packages/agents/prepared-request';
const FAKE=resolve('tests/fixtures/fake-claude.mjs');
export async function fakeBin(scenario:string,env:Record<string,string>={}){
 const dir=await mkdtemp(join(tmpdir(),'fake-bin-')),path=join(dir,'claude');
 await writeFile(path,`#!/bin/sh\n${Object.entries({FAKE_CLAUDE_SCENARIO:scenario,FAKE_CLAUDE_MODEL:'claude-sonnet-4-5-test',...env}).map(([k,v])=>`export ${k}='${v}'`).join('\n')}\nexec "${process.execPath}" "${FAKE}" "$@"\n`);await chmod(path,0o755);return path;
}
export const fakeSetup=async(scenario:string,env:Record<string,string>={},extra:Partial<LocalCliSetup>={}):Promise<LocalCliSetup>=>({bin:await fakeBin(scenario,env),cliVersion:'9.9.9 (Claude Code)',isolation:{safeMode:true,restricted:true,noSessionPersistence:true,disableSlashCommands:true},sonnet:'claude-sonnet-4-5-test',schemaMode:'cli',visual:true,deviceId:'d',...extra});
type Fixture={input:{name:string;model:string;prompt:string;cfg:TextSnapshot;images:ImageInput[];requestTag?:string}};
export const fixtures=readdirSync('tests/fixtures/prepared-requests').map(f=>JSON.parse(readFileSync(join('tests/fixtures/prepared-requests',f),'utf8')) as Fixture);
export const fixture=(name:string)=>fixtures.find(f=>f.input.name===name)!.input;

test('LC0: each CLI call records effort, turns, duration, tokens and the API-equivalent price', async()=>{
 const f=fixture('designer-cached-claude'),r=await cliTextTransport(await fakeSetup('ok'))(f.model,f.prompt,f.cfg,f.images) as LocalTextReceipt;
 const u=localCallUsage({role:'designer',usage:r.usage})!;
 assert.equal(u.effort,'medium');assert.equal(u.turns,1);assert.equal(u.apiEquivalentUsd,0.0012);assert.equal(u.input,120);assert.ok((u.durationMs??-1)>=0);
 void readFile;
});
