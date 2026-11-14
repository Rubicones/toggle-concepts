// Run export (scripts/export-run.ts): redaction, the request breakdown and the file layout. No database is used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {redactText,redactValue,neverExported,requestComposition,requestsCsv,slimRunContext,workspaceFileWanted,safeName,EXPORT_LAYOUT} from '../packages/data/run-export';

test('Export: keys, tokens, signed links and picture bytes never leave; counts and rules named "tokens" stay', ()=>{
 const jwt='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
 const secrets=['sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345','sk-or-v1-0123456789abcdef0123456789abcdef','sb_secret_abcdefghijklmnopqrstuv','ghp_abcdefghijklmnopqrstuvwxyz0123456789','tsk_abcdefghijklmnopqrstuvwxyz',jwt,'AKIAABCDEFGHIJKLMNOP'];
 const text=redactText(`OPENROUTER_API_KEY=${secrets[1]}\nSUPABASE_SERVICE_ROLE_KEY=${jwt}\nAuthorization: Bearer ${secrets[0]}\nurl https://x.supabase.co/storage/v1/object/sign/a.png?token=${jwt}&download=1\n${secrets.join(' ')}\npassword: hunter2hunter2hunter2\n-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----`);
 for(const s of [...secrets,'hunter2hunter2hunter2','\nabc\n'])assert.ok(!text.includes(s),s.slice(0,12));
 assert.ok(text.includes('download=1')&&text.includes('OPENROUTER_API_KEY=[redacted]'));
 const picture=`data:image/png;base64,${'A'.repeat(4000)}`,out=redactValue({usage:{prompt_tokens:41000,completion_tokens:8000},maxOutputTokens:32000,inputTokens:960000,lease_token:7,brandTokens:{colour:'#111111'},note:'about 600 to 1,000 tokens; brand.tokens (the accepted rules as strings)',
  apiKey:'whatever-value',nested:{access_token:'t-123456',image:picture,headers:{Authorization:'Bearer abcdefghijklmnopqrstuvwx'}}});
 assert.deepEqual(out.usage,{prompt_tokens:41000,completion_tokens:8000});assert.equal(out.maxOutputTokens,32000);assert.equal(out.inputTokens,960000);assert.equal(out.lease_token,7);assert.deepEqual(out.brandTokens,{colour:'#111111'});
 assert.equal(out.note,'about 600 to 1,000 tokens; brand.tokens (the accepted rules as strings)');
 assert.equal(out.apiKey,'[redacted]');assert.equal(out.nested.access_token,'[redacted]');assert.equal(out.nested.headers.Authorization,'[redacted]');
 assert.match(out.nested.image,/^\[image image\/png, 3000 bytes, sha256 [0-9a-f]{16}\]$/);
 for(const name of ['.env','.env.local','C:\\toggle\\.env.local','a/b/.env.m02.local','key.pem','device.json','x/node_modules/y.ts','.git/config','.credentials.json'])assert.ok(neverExported(name),name);
 for(const name of ['Frame.tsx','draft.json','public/r1.png','environment.ts'])assert.ok(!neverExported(name),name);
 assert.ok(workspaceFileWanted('Frame.tsx',9000)&&workspaceFileWanted('renders/hero.png',900000)&&!workspaceFileWanted('out/film.mp4',10)&&!workspaceFileWanted('.env.local',10)&&!workspaceFileWanted('big.png',7_000_000));
});

test('Export: each request is broken down by the size of its parts, with what the model reported', ()=>{
 const step={id:'11111111-aaaa',role:'research',status:'succeeded',model_id:'m',prompt:'p'.repeat(400),output:'o',created_at:'2026-11-14T10:00:00Z',
  usage:{prompt_tokens:41000,completion_tokens:3000,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:41000},_local:{stage:'supporting',numTurns:1,conversation:{kind:'new'},sessionId:'sess-12345678',skills:['ad-idea'],apiEquivalentUsd:0.9}},
  config_snapshot:{instructions:'i'.repeat(8000),transportTask:'t'.repeat(1200),campaignContext:{checkpointId:'c',variantManifest:{entries:Array.from({length:40},(_,i)=>({id:`variant-${i}`,locale:'en'}))},submittedBrief:{q:'b'.repeat(3000)}},upstream:[{jobId:'j',output:'u'.repeat(16000)}],brandVisionImages:[1,2,3]}};
 const c=requestComposition(step);
 assert.deepEqual(Object.keys(c.parts).slice(0,3),['upstream[0]','instructions','campaignContext.submittedBrief'],'largest first');assert.equal(c.parts['brandVisionImages (count)'],3);
 assert.deepEqual(c.usage,{input:41000,cached:0,cacheWrite:41000,output:3000});assert.equal(c.local.stage,'supporting');assert.equal(c.local.turns,1);assert.equal(c.local.sessionId,'sess-12345678');
 const csv=requestsCsv([c]).split('\n');assert.match(csv[0],/^at,role,directorRole,status,error,stage,conversation,turns,input,cached,cacheWrite,output/);assert.match(csv[1],/research,,succeeded,,supporting,new,1,41000,0,41000,3000,0\.9,/);
 const ctx=slimRunContext({version:1,sha256:'x',tokens:7000,system:'SYSTEM',brief:'BRIEF',imageOwner:'image-owner@1',instructionsVersion:'positive@1',planningChat:'planning-chat@1',criticVersion:'critic@2',stageSkills:{version:'stage-skills@2',stages:{}},images:[{kind:'compact',width:10,height:10,dataBase64:'A'.repeat(9000)}]})!;
 assert.deepEqual(ctx.flags,{version:1,sha256:'x',tokens:7000,planningChat:'planning-chat@1',instructionsVersion:'positive@1',imageOwner:'image-owner@1',criticVersion:'critic@2'});assert.equal(ctx.system,'SYSTEM');
 assert.equal((ctx.images as {dataBase64:string}[])[0].dataBase64,'[6750 bytes]');assert.equal(slimRunContext(null),null);
});

test('Export: the layout is documented, names are safe, and the launcher is installed and kept in step', ()=>{
 for(const file of ['README.txt','summary/overview.json','summary/requests.csv','database/<table>.json','steps/<n>-<role>-<id>.json','device/run-context.json','device/sessions/<session>.jsonl','designer/<direction>/state.json','designer/<direction>/workspace/…'])assert.ok(file in EXPORT_LAYOUT,file);
 assert.equal(safeName('critic: hero/review?'),'critic-hero-review');
 const script=readFileSync('scripts/export-run.ts','utf8');
 assert.ok(!/\.(insert|update|upsert|delete)\(|\.rpc\(/.test(script),'read-only: selects only');assert.ok(!/readFile[^\n]*\.env/.test(script),'never reads .env');
 const launcher=readFileSync('scripts/windows/Export-Last-Run.cmd','utf8'),installer=readFileSync('scripts/windows/Install-Toggle.cmd','utf8');
 assert.match(launcher,/node --import tsx scripts\/export-run\.ts %\* --out \/mnt\/c\/toggle\/exports/);
 const line=launcher.split(/\r?\n/).find(l=>l.startsWith('wsl.exe'))!;assert.ok(installer.includes(line),'the installer writes the same launcher');assert.ok(installer.includes("'Export-Last-Run.cmd'"));
 assert.match(readFileSync('scripts/linux/setup.sh','utf8'),/for f in Install-Toggle\.cmd Update-Database\.cmd Export-Last-Run\.cmd; do/);
});
