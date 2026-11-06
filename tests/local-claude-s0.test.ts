// Local mode S0 (docs/plans/2026-11-06-local-claude-pipeline-plan.md): the CLI adapter, the device id, the setup check
// and the capability spike, all against tests/fixtures/fake-claude.mjs. No model is ever called.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,chmod,readdir} from 'node:fs/promises';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,resolve} from 'node:path';
import {BILLING_VARIABLES,cliArgs,childEnv,streamUserMessage,runCli,type CliProfile} from '../packages/agents/claude-cli.local';
import {ensureDevice,readDevice} from '../apps/local-runner/local-claude/device';
import {diagnose,nodeSupported} from '../apps/local-runner/local-claude/doctor';
import {qualify,managedSettingsPaths,type CapabilityProfile} from '../apps/local-runner/local-claude/qualify';

const FAKE=resolve('tests/fixtures/fake-claude.mjs'),SYSTEM=join(mkdtempSync(join(tmpdir(),'local-claude-system-')),'system.txt');writeFileSync(SYSTEM,'You are a test.');
const profile=(extra:Partial<CliProfile>={}):CliProfile=>({bin:FAKE,model:'claude-sonnet-test',systemPromptFile:SYSTEM,emptyMcpConfigFile:'/tmp/mcp.json',cwd:tmpdir(),isolation:{safeMode:true,restricted:true,noSessionPersistence:true,disableSlashCommands:true},...extra});
const scratch=()=>mkdtemp(join(tmpdir(),'local-claude-test-'));
async function call(scenario:string,stdin:string,options:{timeoutMs?:number;signal?:AbortSignal;env?:Record<string,string>;argv?:string[]}={}){
 return runCli({bin:FAKE,argv:options.argv??cliArgs(profile()),cwd:tmpdir(),env:childEnv(process.env,{FAKE_CLAUDE_SCENARIO:scenario,...options.env}),stdin,timeoutMs:options.timeoutMs??20000,signal:options.signal});
}

test('the CLI arguments isolate the call and never carry the request', ()=>{
 const argv=cliArgs(profile({jsonSchema:{type:'object'},effort:'low',includePartialMessages:true}));
 for(const f of ['-p','--safe-mode','--restricted','--no-session-persistence','--disable-slash-commands','--strict-mcp-config','--include-partial-messages'])assert.ok(argv.includes(f),f);
 assert.equal(argv[argv.indexOf('--tools')+1],'');
 assert.equal(argv[argv.indexOf('--input-format')+1],'stream-json');
 assert.equal(argv[argv.indexOf('--model')+1],'claude-sonnet-test');
 assert.equal(argv[argv.indexOf('--json-schema')+1],'{"type":"object"}');
 assert.ok(!argv.includes('--bare'),'--bare would require an API key');
 assert.ok(!cliArgs(profile({isolation:{}})).includes('--safe-mode'),'unqualified flags stay off');
});

test('the child environment is an allowlist: application and billing keys never reach the CLI', ()=>{
 const env=childEnv({PATH:'/bin',HOME:'/h',CLAUDE_CONFIG_DIR:'/c',LANG:'en_US.UTF-8',HTTPS_PROXY:'http://p',OPENROUTER_API_KEY:'x',SUPABASE_SERVICE_ROLE_KEY:'x',R2_SECRET_ACCESS_KEY:'x',STUDIO_WORKER_ACCESS_TOKEN:'x',NODE_OPTIONS:'--require evil',...Object.fromEntries(BILLING_VARIABLES.map(k=>[k,'x']))});
 assert.deepEqual(Object.keys(env).sort(),['CLAUDE_CONFIG_DIR','HOME','HTTPS_PROXY','LANG','PATH']);
});

test('text and images reach the model whole and in order, through stdin', async()=>{
 const dir=await scratch(),record=join(dir,'record.json'),tail=`TAIL-${Date.now()}`,long=`${'x'.repeat(300000)} ${tail}`;
 const system=join(dir,'system.txt');await writeFile(system,'SYSTEM TEXT');
 const red=Buffer.from('red-image').toString('base64'),blue=Buffer.from('blue-image-longer').toString('base64');
 const r=await call('echo',streamUserMessage([{type:'text',text:'first'},{type:'image',mediaType:'image/png',dataBase64:red},{type:'text',text:long},{type:'image',mediaType:'image/jpeg',dataBase64:blue}]),{env:{FAKE_CLAUDE_RECORD:record},argv:cliArgs(profile({systemPromptFile:system}))});
 assert.equal(r.outcome,'succeeded');
 const seen=JSON.parse(r.text!);
 assert.deepEqual(seen.texts.map((t:string)=>t.length),[5,long.length]);assert.ok(seen.texts[1].endsWith(tail));
 assert.deepEqual(seen.images,[{mediaType:'image/png',bytes:red.length},{mediaType:'image/jpeg',bytes:blue.length}]);
 assert.equal(seen.system,'SYSTEM TEXT');
 const rec=JSON.parse(await readFile(record,'utf8'));
 assert.ok(!rec.args.some((a:string)=>a.includes(tail)),'the request is never on the command line');
 for(const k of ['OPENROUTER_API_KEY','SUPABASE_SERVICE_ROLE_KEY','R2_SECRET_ACCESS_KEY','ANTHROPIC_API_KEY'])assert.ok(!rec.env.includes(k),k);
 assert.equal(r.init?.apiKeySource,'none');assert.deepEqual(r.init?.tools,[]);
 assert.equal(r.usage?.input_tokens,120);assert.equal(r.internalAttempts,0);
});

test('schema enforcement: internal StructuredOutput attempts are counted apart from engine retries', async()=>{
 const r=await call('schema',streamUserMessage([{type:'text',text:'answer'}]));
 assert.equal(r.outcome,'succeeded');assert.deepEqual(r.structured,{answer:'ok'});assert.equal(r.internalAttempts,2);assert.equal(r.numTurns,2);
});

test('a subscription limit is reported as a limit, not as a failed answer', async()=>{
 const r=await call('limit',streamUserMessage([{type:'text',text:'answer'}]));
 assert.equal(r.outcome,'failed');assert.equal(r.limitReached,true);assert.equal(r.failure,'SUBSCRIPTION_LIMIT');
});

test('no terminal result means an unknown outcome; partial text is kept only for diagnosis', async()=>{
 const r=await call('noresult',streamUserMessage([{type:'text',text:'answer'}]));
 assert.equal(r.outcome,'unknown');assert.equal(r.failure,'CLI_NO_RESULT');assert.equal(r.text,'partial');assert.equal(r.exitCode,0);
});

test('a hanging call ends at the time limit as unknown; cancellation ends it as cancelled', async()=>{
 const started=Date.now(),timeout=await call('hang',streamUserMessage([{type:'text',text:'answer'}]),{timeoutMs:600});
 assert.equal(timeout.outcome,'unknown');assert.equal(timeout.failure,'CLI_TIMEOUT');assert.ok(Date.now()-started<5000);
 const stop=new AbortController();setTimeout(()=>stop.abort(),300);
 const cancelled=await call('hang',streamUserMessage([{type:'text',text:'answer'}]),{signal:stop.signal});
 assert.equal(cancelled.outcome,'cancelled');assert.equal(cancelled.text,null);
});

test('the init event shows tools or MCP servers when isolation leaks', async()=>{
 const r=await call('leak',streamUserMessage([{type:'text',text:'answer'}]));
 assert.deepEqual(r.init?.tools,['Bash']);assert.equal((r.init?.mcpServers??[]).length,1);
});

test('the device id is created once and kept', async()=>{
 const path=join(await scratch(),'nested','device.json');
 assert.equal(await readDevice(path),undefined);
 const a=await ensureDevice(path,'Studio.local'),b=await ensureDevice(path,'Other');
 assert.equal(a.created,true);assert.equal(b.created,false);assert.equal(b.device.id,a.device.id);assert.equal(a.device.label,'Studio.local');
 await writeFile(path,'{"id":"not-a-uuid","label":"x"}');assert.equal(await readDevice(path),undefined);
});

test('doctor names the next step and is ready only with a fresh passing profile', async()=>{
 assert.equal(nodeSupported('22.13.1'),true);assert.equal(nodeSupported('22.12.0'),false);assert.equal(nodeSupported('24.1.0'),false);
 const missing=await diagnose({bin:'/nonexistent/claude',nodeVersion:'22.22.0',env:{PATH:process.env.PATH}});
 assert.equal(missing.ready,false);assert.equal(missing.steps.find(s=>!s.ok)?.id,'cli');
 const device={id:'00000000-0000-4000-8000-000000000001',label:'Studio',createdAt:''};
 const noDevice=await diagnose({bin:FAKE,nodeVersion:'22.22.0',env:{PATH:process.env.PATH,ANTHROPIC_API_KEY:'x'}});
 assert.equal(noDevice.steps.find(s=>!s.ok)?.id,'device');assert.match(noDevice.steps.find(s=>s.id==='shell')!.detail,/ANTHROPIC_API_KEY/);
 const ready={cli:{bin:FAKE,version:'9.9.9 (Claude Code)'},device:{id:device.id,label:'Studio'},verdict:{textRoles:'ready',visualRoles:'ready',reasons:[],limitations:[]}} as unknown as CapabilityProfile;
 assert.equal((await diagnose({bin:FAKE,nodeVersion:'22.22.0',device,profile:ready})).ready,true);
 const stale={...ready,cli:{bin:FAKE,version:'9.9.8 (Claude Code)'}} as CapabilityProfile;
 const d=await diagnose({bin:FAKE,nodeVersion:'22.22.0',device,profile:stale});
 assert.equal(d.ready,false);assert.match(d.next!,/local-claude:qualify/);
});

test('qualify writes a profile; a leaking CLI blocks every role', async()=>{
 const dir=await scratch(),out=join(dir,'profile.json');
 const p=await qualify({bin:FAKE,model:'sonnet',deviceId:'d',deviceLabel:'Studio',extraUsageOff:false,out});
 const saved=JSON.parse(await readFile(out,'utf8')) as CapabilityProfile;
 assert.equal(saved.device.id,'d');assert.equal(saved.cli.version,'9.9.9 (Claude Code)');
 const status=Object.fromEntries(p.checks.map(c=>[c.id,c.status]));
 assert.equal(status.isolation,'pass');assert.equal(status['subscription-key-source'],'pass');assert.equal(status['extra-usage'],'unknown');
 // The fake always answers "OK", so the nonce and image checks fail: one stand-in reply never qualifies a role.
 assert.equal(status.text,'fail');assert.equal(p.verdict.textRoles,'blocked');assert.ok(p.verdict.limitations.some(l=>/extra usage/i.test(l)));
 assert.deepEqual(p.isolation,{safeMode:true,restricted:true,noSessionPersistence:true,disableSlashCommands:true});
 assert.equal(status['schema-cli'],'fail');assert.equal(status.cancel,'fail');
 const leaky=join(dir,'leaky-claude');await writeFile(leaky,`#!/bin/sh\nFAKE_CLAUDE_SCENARIO=leak exec "${process.execPath}" "${FAKE}" "$@"\n`);await chmod(leaky,0o755);
 const blocked=await qualify({bin:leaky,model:'sonnet',deviceId:'d',deviceLabel:'Studio',extraUsageOff:true});
 assert.equal(blocked.checks.find(c=>c.id==='isolation')?.status,'fail');assert.equal(blocked.verdict.textRoles,'blocked');assert.equal(blocked.verdict.visualRoles,'blocked');
 assert.ok(managedSettingsPaths('darwin')[0].startsWith('/Library/'));
});

// Inventory (S0): every text model call goes through one of these places, so S4 can route all of them. A new call
// site must be added here and to the Local transport, never left on OpenRouter while the UI shows Local.
const SOURCE_DIRS=['app','apps','lib','packages','components','scripts'];
async function sources(){
 const files:string[]=[];
 async function walk(dir:string){for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const p=join(dir,e.name);if(e.isDirectory()){if(!['node_modules','.next','artifacts'].includes(e.name))await walk(p);}else if(/\.(ts|tsx|mjs|js)$/.test(e.name))files.push(p);}}
 for(const d of SOURCE_DIRS)await walk(d);return files;
}
test('inventory: text model calls happen only at the known call sites', async()=>{
 const hits={provider:[] as string[],paid:[] as string[],chat:[] as string[],cli:[] as string[]};
 for(const file of await sources()){
  const s=await readFile(file,'utf8'),f=relative('.',file);
  if(/import\s+\{[^}]*\bsubmitText\b[^}]*\}\s+from\s+['"][^'"]*text-provider['"]/.test(s))hits.provider.push(f);
  if(/\bpaidText\(\{/.test(s))hits.paid.push(f);
  if(s.includes('chat/completions'))hits.chat.push(f);
  if(/from\s+['"][^'"]*claude-cli\.local['"]/.test(s))hits.cli.push(f);
 }
 assert.deepEqual(hits.provider.sort(),['apps/local-runner/brand-field-analysis.ts','apps/local-runner/workflow.ts','packages/director/money.ts']);
 assert.deepEqual(hits.paid,['apps/local-runner/director/worker.ts']);
 assert.deepEqual(hits.chat,['packages/agents/text-provider.ts']);
 assert.ok(hits.cli.every(f=>f.startsWith('apps/local-runner/')),`the CLI adapter is Node-only and local: ${hits.cli.join(', ')}`);
});
