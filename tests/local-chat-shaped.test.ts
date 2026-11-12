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

test('LC1: lean calls — replaced prompt, no tools, one fixed folder, a turn limit when qualified', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lc1-')),work=join(dir,'work'),r1=join(dir,'r1.json'),r2=join(dir,'r2.json'),f=fixture('critic-no-images-cached');
 await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:r1},{workDir:work,turnLimit:true}))(f.model,f.prompt,f.cfg,f.images);
 await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:r2},{workDir:work,turnLimit:true}))(f.model,f.prompt,f.cfg,f.images);
 const a=JSON.parse(await readFile(r1,'utf8')),b=JSON.parse(await readFile(r2,'utf8'));
 assert.equal(a.cwd,work);assert.equal(b.cwd,work,'the same folder for every call');
 assert.deepEqual([a.system,a.content],[b.system,b.content],'identical calls send identical bytes (a cacheable prefix)');
 assert.ok(a.args.includes('--system-prompt-file')&&!a.args.some((x:string)=>/append-system-prompt/.test(x)),'the default prompt is replaced, never appended to');
 assert.equal(a.args[a.args.indexOf('--tools')+1],'');assert.ok(a.args.includes('--strict-mcp-config'));
 assert.equal(a.args[a.args.indexOf('--max-turns')+1],'1');
 const s=join(dir,'s.json');await cliTextTransport(await fakeSetup('schema',{FAKE_CLAUDE_RECORD:s},{workDir:work,turnLimit:true}))(fixture('director-cached-flash').model,fixture('director-cached-flash').prompt,fixture('director-cached-flash').cfg,fixture('director-cached-flash').images);
 const sa=JSON.parse(await readFile(s,'utf8'));assert.equal(sa.args[sa.args.indexOf('--max-turns')+1],'4','structured output may take a few attempts');
 const n=join(dir,'n.json');await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:n},{workDir:work}))(f.model,f.prompt,f.cfg,f.images);
 assert.ok(!JSON.parse(await readFile(n,'utf8')).args.includes('--max-turns'),'no flag when the device did not qualify it');
});

import {buildRunContext,stableContextJson,sharedLayout,sharedLayoutDifferences,roleHeading} from '../packages/agents/run-context';
import {prepareTextRequest,toCliRequest} from '../packages/agents/prepared-request';
const BRIEF=JSON.stringify({schemaVersion:'1.0',revisionId:'7d1e3f0a-1111-4222-8333-944455556666',campaignId:'8d1e3f0a-1111-4222-8333-944455556666',submittedAt:'2026-11-11T10:00:00Z',campaignName:'Spring',questionnaire:{goal:'Sign-ups',audience:'Runners'},sources:[{id:'x',sha256:'ab',filename:'deck.pdf'}]});
const BRAND=JSON.stringify({kit:{palette:['#112233'],voice:'Calm'},originC1Id:'9d1e3f0a-1111-4222-8333-944455556666',createdAt:'2026-11-11T11:00:00Z'});

test('LC2: the run context is deterministic and carries no ids, timestamps, hashes or paths', ()=>{
 const a=buildRunContext({briefText:BRIEF,brandText:BRAND}),b=buildRunContext({briefText:BRIEF,brandText:BRAND});
 assert.equal(a.sha256,b.sha256);assert.equal(a.system+a.brief,b.system+b.brief);
 const all=a.system+a.brief;
 assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(all),'no ids');
 assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(all),'no timestamps');
 assert.ok(!/sha256|"ab"|\/home\/|\/Users\//.test(all),'no hashes or paths');
 assert.match(all,/"goal": "Sign-ups"/);assert.match(all,/"voice": "Calm"/);assert.match(all,/deck\.pdf/);
 assert.deepEqual(a.holds,{brief:true,brand:true,skills:[]});
 assert.equal(stableContextJson({b:1,a:{z:2,y:'2026-01-01T00:00:00Z'}}),'{\n "a": {\n  "z": 2\n },\n "b": 1\n}');
});

test('LC2: in a shared run every role starts with byte-identical bytes; role instructions and input follow', async()=>{
 const ctx=buildRunContext({briefText:BRIEF,brandText:BRAND}),dir=await mkdtemp(join(tmpdir(),'lc2-'));
 const designer=fixture('designer-cached-claude'),critic=fixture('critic-no-images-cached');
 const prefixImages=designer.images.filter(i=>i.prefix);
 const r1=join(dir,'designer.json'),r2=join(dir,'critic.json');
 await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:r1}),{shared:async()=>ctx})(designer.model,designer.prompt,designer.cfg,designer.images);
 await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:r2}),{shared:async()=>ctx})(critic.model,critic.prompt,critic.cfg,prefixImages);
 const a=JSON.parse(await readFile(r1,'utf8')),b=JSON.parse(await readFile(r2,'utf8'));
 assert.equal(a.system,ctx.system);assert.equal(b.system,ctx.system,'one system prompt for every role');
 const upToRole=(content:{type:string;text?:string}[])=>content.slice(0,content.findIndex(c=>c.type==='text'&&c.text!.startsWith('YOUR ROLE\n')));
 assert.deepEqual(upToRole(a.content),upToRole(b.content),'images and brief identical across roles');
 assert.equal(upToRole(a.content).length,prefixImages.length*2+1);
 assert.equal(a.content[prefixImages.length*2+1].text,roleHeading(`${designer.cfg.instructions}\n\n${designer.cfg.protocolInstructions}`),'the role instructions come right after the shared part');
});

test('LC2: the shared layout loses, adds or moves nothing; fresh runs keep their layout', ()=>{
 const ctx=buildRunContext({briefText:BRIEF,brandText:BRAND}),f=fixture('designer-cached-claude'),p=prepareTextRequest(f.model,f.prompt,f.cfg,f.images);
 const cli=toCliRequest(p,{executionModel:'m',schemaMode:'cli'}),shared=sharedLayout(cli,p,ctx);
 assert.deepEqual(sharedLayoutDifferences(shared,cli,p,ctx),[]);
 assert.equal(shared.parts.length,cli.parts.length+2);
 assert.ok(sharedLayoutDifferences({...shared,parts:shared.parts.slice(0,-1)},cli,p,ctx).length>0);
 assert.ok(sharedLayoutDifferences({...shared,systemPrompt:cli.systemPrompt},cli,p,ctx).length>0);
});

test('LC2: a run context is frozen once; later builds never replace it', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'lc2-home-'));
 const {freezeRunContext,readRunContext}=await import('../apps/local-runner/local-claude/run-context');
 const first=buildRunContext({briefText:BRIEF,brandText:BRAND}),second=buildRunContext({briefText:BRIEF,brandText:null});
 await freezeRunContext('run-1',first);const kept=await freezeRunContext('run-1',second);
 assert.equal(kept.sha256,first.sha256);assert.equal((await readRunContext('run-1'))!.sha256,first.sha256);
});

import {planningPlan,designerPlan,conversationTokens,CONVERSATION_CAP} from '../packages/agents/local-session';
import {continuingLayout} from '../packages/agents/run-context';
import {sinceLastTurn,changedFiles,fileHashes,shortIssue,RENDER_LONG_SIDE} from '../apps/local-runner/director/designer-loop';

test('LC3: the planning chain branches from the stored point of the previous stage; the critic never joins it', ()=>{
 const strategy={role:'strategy',sessionId:'s-strategy',tokens:30000,at:'1'},research={role:'research',sessionId:'s-research',tokens:5000,at:'2'};
 assert.deepEqual(planningPlan('script',[strategy,research]),{resume:'s-strategy',fork:true,sameRole:false},'branch from the chain parent, not an independent role');
 assert.equal(planningPlan('critic',[strategy]),null,'the critic is a separate call');
 assert.equal(planningPlan('strategy',[research]),null,'no chain parent: a new conversation');
 // A retry finds the same point: a failed attempt is a separate branch and never part of the history.
 assert.deepEqual(planningPlan('script',[strategy]),planningPlan('script',[strategy]));
 assert.deepEqual(planningPlan('asset-plan',[{...strategy,tokens:CONVERSATION_CAP+1}]),{condensed:true},'above the cap: condensed');
 assert.equal(conversationTokens({input_tokens:1,cache_creation_input_tokens:2,cache_read_input_tokens:3,output_tokens:4}),10);
});

test('LC4: a direction branches from the approved planning point, then continues from its last accepted turn', ()=>{
 const point={role:'asset-plan',sessionId:'s-plan',tokens:40000};
 assert.deepEqual(designerPlan({},point),{resume:'s-plan',fork:true,sameRole:false});
 assert.deepEqual(designerPlan({session:{role:'designer',sessionId:'s-d3',tokens:60000}},point),{resume:'s-d3',fork:true,sameRole:true});
 assert.deepEqual(designerPlan({session:{role:'designer',sessionId:'s-d9',tokens:CONVERSATION_CAP+1}},point),{condensed:true});
 assert.equal(designerPlan({},null),null);
});

test('LC3/LC4: a continued request resumes and branches the stored conversation and sends only what it lacks', async()=>{
 const ctx=buildRunContext({briefText:BRIEF,brandText:BRAND}),dir=await mkdtemp(join(tmpdir(),'lc3-')),work=join(dir,'work'),f=fixture('designer-cached-claude');
 const rec=join(dir,'cont.json');
 const r=await cliTextTransport(await fakeSetup('echo',{FAKE_CLAUDE_RECORD:rec},{workDir:work}),{shared:async()=>ctx,session:async()=>({resume:'s-d3',fork:true,sameRole:true})})(f.model,f.prompt,f.cfg,f.images) as LocalTextReceipt;
 const a=JSON.parse(await readFile(rec,'utf8'));
 assert.equal(a.args[a.args.indexOf('--resume')+1],'s-d3');assert.ok(a.args.includes('--fork-session'));
 assert.ok(!a.args.includes('--no-session-persistence'),'conversations are stored');
 const texts=a.content.filter((c:{type:string})=>c.type==='text').map((c:{text:string})=>c.text);
 assert.ok(texts[0].startsWith('TASK:\n'),'same role: only the task');assert.ok(!texts.some((t:string)=>t.startsWith('BRIEF')||t.startsWith('YOUR ROLE')),'no brief or role text again');
 assert.equal(a.content.filter((c:{type:string})=>c.type==='image').length,f.images.filter(i=>!i.prefix).length,'only the new render images');
 assert.equal(a.system,ctx.system);
 assert.deepEqual(r.local!.conversation,{kind:'branched',resumedFrom:'s-d3'});assert.match(r.local!.sessionId!,/^s-d3>f/,'a branch gets its own id');
 // Another role continuing: its instructions and input, without the shared images and brief already in the history.
 const p=prepareTextRequest(f.model,f.prompt,f.cfg,f.images),cli=toCliRequest(p,{executionModel:'m',schemaMode:'cli'});
 const other=continuingLayout(cli,p,ctx,{resume:'s',fork:true,sameRole:false});
 assert.ok((other.parts[0] as {text:string}).text.startsWith('YOUR ROLE\n'));assert.equal(other.parts.length,cli.parts.length-4+1);
});

test('LC3: the critic request holds no creator history; a missing stored conversation starts again with the shared context', async()=>{
 const ctx=buildRunContext({briefText:BRIEF,brandText:BRAND}),dir=await mkdtemp(join(tmpdir(),'lc3b-')),f=fixture('critic-no-images-cached');
 const rec=join(dir,'critic.json');
 await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>ctx})(f.model,f.prompt,f.cfg,f.images);
 const c=JSON.parse(await readFile(rec,'utf8'));assert.ok(!c.args.includes('--resume'),'a separate call');assert.ok(c.content.some((x:{text?:string})=>x.text?.startsWith('YOUR ROLE')));
 const restart=await cliTextTransport(await fakeSetup('nosession'),{shared:async()=>ctx,session:async()=>({resume:'gone',fork:true,sameRole:true})})(f.model,f.prompt,f.cfg,f.images) as LocalTextReceipt;
 assert.equal(restart.local!.conversation!.kind,'restarted');assert.equal(restart.outcome,'succeeded');
});

test('LC4: append-only turns send new results and changed files only; renders and build errors are small', ()=>{
 const t=[{from:'tool' as const,text:'a'},{from:'agent' as const,text:'turn 1'},{from:'tool' as const,text:'written'},{from:'tool' as const,text:'rendered'}];
 assert.deepEqual(sinceLastTurn(t).map(x=>x.text),['written','rendered']);
 const files=[{path:'Frame.tsx',source:'A'},{path:'resources.ts',source:'R1'}],seen=fileHashes(files);
 assert.deepEqual(changedFiles(files,seen),[]);assert.deepEqual(changedFiles([files[0],{path:'resources.ts',source:'R2'}],seen).map(f=>f.path),['resources.ts']);
 assert.equal(changedFiles(files).length,2,'a new conversation gets every file');
 assert.equal(RENDER_LONG_SIDE,1024);
 const issue=Array.from({length:40},(_,i)=>`line ${i}`).join('\n');assert.equal(shortIssue(issue).split('\n').length,12);
});

import {readSkills,parseSkill,splitSkills,SKILL_ROLES,SKILL_TOKEN_LIMIT,ROLE_SKILLS_TOKEN_LIMIT,skillRoleOf} from '../packages/agents/skill-files';
test('LC5: skills are short principles: no examples, styles or names, within the size limits', ()=>{
 const skills=readSkills();assert.ok(skills.length>=1);
 for(const s of skills){
  assert.doesNotMatch(s.text,/for example|e\.g\.|such as|like this|in the style of|\binspired by\b/i,`${s.id}: principles only, no examples`);
  assert.doesNotMatch(s.text,/https?:|®|™|\b(Helvetica|Arial|Inter|Roboto|Futura|Garamond|Material|Bootstrap|Tailwind)\b/i,`${s.id}: no font, brand or design-system names`);
  assert.ok(s.tokens<=SKILL_TOKEN_LIMIT,`${s.id} within ${SKILL_TOKEN_LIMIT} tokens`);assert.ok(s.purpose&&s.title&&s.version);
 }
 assert.ok(skills.reduce((n,s)=>n+s.tokens,0)<=ROLE_SKILLS_TOKEN_LIMIT,'all skills together fit one role');
 assert.throws(()=>parseSkill('no frontmatter'),/SKILL_FRONTMATTER_REQUIRED/);
 assert.equal(skillRoleOf('director'),'visual-direction');assert.equal(skillRoleOf('designer'),'designer');
});

test('LC5: common skills join the shared prefix; role skills follow the role instructions; the prefix stays identical', async()=>{
 const skills=readSkills(),[a,b]=skills;
 const attachments=[...SKILL_ROLES.map(role=>({skill_id:a.id,role})),{skill_id:b.id,role:'designer'}];
 const {common,byRole}=splitSkills(skills,attachments);
 assert.deepEqual(common.map(s=>s.id),[a.id]);assert.deepEqual(byRole.designer.map(s=>s.id),[b.id]);assert.equal(byRole.critic,undefined);
 const ctx=buildRunContext({briefText:BRIEF,brandText:BRAND,commonSkills:common,roleSkills:byRole}),plain=buildRunContext({briefText:BRIEF,brandText:BRAND,commonSkills:common});
 assert.ok(ctx.system.includes(a.text)&&!ctx.system.includes(b.text));assert.equal(ctx.sha256,plain.sha256,'role skills never change the shared prefix');
 const dir=await mkdtemp(join(tmpdir(),'lc5-')),designer=fixture('designer-cached-claude'),critic=fixture('critic-no-images-cached'),prefixImages=designer.images.filter(i=>i.prefix);
 const r1=join(dir,'d.json'),r2=join(dir,'c.json');
 const d=await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:r1}),{shared:async()=>ctx,role:'designer'})(designer.model,designer.prompt,designer.cfg,designer.images);
 await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:r2}),{shared:async()=>ctx,role:'critic'})(critic.model,critic.prompt,critic.cfg,prefixImages);
 const x=JSON.parse(await readFile(r1,'utf8')),y=JSON.parse(await readFile(r2,'utf8'));
 assert.equal(x.system,y.system);
 const upToRole=(content:{type:string;text?:string}[])=>content.slice(0,content.findIndex(c=>c.type==='text'&&c.text!.startsWith('YOUR ROLE\n')));
 assert.deepEqual(upToRole(x.content),upToRole(y.content),'the cached prefix is identical with and without role skills');
 const roleText=(content:{type:string;text?:string}[])=>content.find(c=>c.type==='text'&&c.text!.startsWith('YOUR ROLE\n'))!.text!;
 assert.ok(roleText(x.content).includes(`ROLE SKILLS\nSKILL ${b.id}`));assert.ok(!roleText(y.content).includes('ROLE SKILLS'));
 assert.deepEqual((d.usage as {_local:{skills:string[]}})._local.skills,[a.id,b.id],'the skills used are recorded');
});

test('LC5: a frozen run keeps its skills when attachments change later', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'lc5-home-'));
 const {freezeRunContext}=await import('../apps/local-runner/local-claude/run-context');
 const skills=readSkills(),before=splitSkills(skills,SKILL_ROLES.map(role=>({skill_id:skills[0].id,role}))),after=splitSkills(skills,[]);
 const frozen=await freezeRunContext('run-5',buildRunContext({briefText:BRIEF,brandText:BRAND,commonSkills:before.common}));
 const kept=await freezeRunContext('run-5',buildRunContext({briefText:BRIEF,brandText:BRAND,commonSkills:after.common}));
 assert.deepEqual(kept.holds.skills,[skills[0].id]);assert.equal(kept.sha256,frozen.sha256);
});

import {stageOf,stageEffort,DEFAULT_STAGE_EFFORT,STAGES} from '../packages/agents/stage-effort';
test('LC6: effort per stage — high where the idea is invented, medium for repairs, revisions, the critic and support', ()=>{
 assert.equal(stageOf('strategy'),'planning-create');assert.equal(stageOf('visual-direction'),'planning-create');
 assert.equal(stageOf('research'),'supporting');assert.equal(stageOf('localization'),'supporting');
 assert.equal(stageOf('designer'),'design-create');assert.equal(stageOf('designer',{revising:true}),'design-revise');
 assert.equal(stageOf('assembler',{repair:true}),'code-repair');assert.equal(stageOf('critic'),'critic');
 assert.equal(DEFAULT_STAGE_EFFORT['design-create'],'high');assert.equal(DEFAULT_STAGE_EFFORT['planning-create'],'high');
 for(const s of ['design-revise','code-repair','critic','supporting'] as const)assert.equal(DEFAULT_STAGE_EFFORT[s],'medium');
 assert.equal(stageEffort('critic',{critic:'low'}),'low','the owner can change a stage');assert.equal(stageEffort('critic',{critic:'bogus'}),'medium');
 assert.equal(STAGES.length,new Set(STAGES.map(s=>s.id)).size);
});

test('LC6: a shared request uses its stage effort from the frozen context; fresh runs keep the role effort', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lc6-')),f=fixture('designer-cached-claude'),cfg={...f.cfg,reasoningEffort:'high' as const};
 const ctx=buildRunContext({briefText:BRIEF,brandText:BRAND,stageEffort:{'design-revise':'low'}});
 const argvOf=async(name:string,opts:Parameters<typeof cliTextTransport>[1])=>{const rec=join(dir,`${name}.json`);const r=await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),opts)(f.model,f.prompt,cfg,f.images);return {argv:JSON.parse(await readFile(rec,'utf8')).args as string[],r};};
 const effortIn=(argv:string[])=>argv[argv.indexOf('--effort')+1];
 const revise=await argvOf('revise',{shared:async()=>ctx,role:'designer',stage:'design-revise'});
 assert.equal(effortIn(revise.argv),'low');assert.equal((revise.r.usage as {_local:{stage:string;effort:string}})._local.stage,'design-revise');
 assert.equal((revise.r.usage as {_local:{effort:string}})._local.effort,'low','the effort used is recorded');
 assert.equal(effortIn((await argvOf('create',{shared:async()=>ctx,role:'designer',stage:'design-create'})).argv),'high');
 assert.equal(effortIn((await argvOf('fresh',{role:'designer',stage:'design-revise'})).argv),'high','no run context: the role effort stays');
});
