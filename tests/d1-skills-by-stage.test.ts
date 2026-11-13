// D1 (docs/plans/2026-11-13-skills-critic-image-owner.md): skills as stage material. Recorded inputs and recorded CLI
// answers only; no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {readSkills,splitSkills,parseSkill,NO_ROLE} from '../packages/agents/skill-files';
import {buildStageSkills,stageBudgetProblems,stageMessage,creatorStageText,criticStageText,requestStage,stageSkillIds,STAGE_SKILL_LIMIT,SKILL_STAGES,type StageSkills} from '../packages/agents/stage-skills';
import {buildRunContext,sharedLayout,continuingLayout} from '../packages/agents/run-context';
import {prepareTextRequest,toCliRequest} from '../packages/agents/prepared-request';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {cliTextTransport,type LocalTextReceipt} from '../apps/local-runner/local-claude/transport';
import {runExtensionChat} from '../apps/local-runner/director/extension-chat-loop';
import {newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import {DESIGNER_ROLE_V4} from '../packages/director/roles';
import {fakeSetup,fixture} from './local-chat-shaped.test';
import type {DirectionInput} from '../packages/director/types';

/** The skill texts before D1, kept as a fixture (not read from git history). */
const preD1=JSON.parse(readFileSync('tests/fixtures/skills/pre-d1.json','utf8')) as {texts:Record<string,string>};
const skills=readSkills(),staged=buildStageSkills(skills,[]),signs=skills.find(s=>s.id==='default-look')!.signs;
const ctx=(stageSkills?:StageSkills)=>{const {common,byRole}=splitSkills(skills,[]);return buildRunContext({briefText:'{"product":"lamp"}',brandPack:'BRAND CHARACTER\nCalm.',packVersion:1,commonSkills:common,roleSkills:byRole,materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},...(stageSkills?{stageSkills}:{})});};

test('D1: the 14 skills are converted mechanically: their text is the principles, nothing is lost, no checks yet', ()=>{
 assert.equal(skills.length,14);
 for(const s of skills){
  const before=preD1.texts[s.id];assert.ok(before,`${s.id}: a pre-D1 text`);
  assert.equal(s.text,before,`${s.id}: the text earlier layouts read is unchanged`);assert.deepEqual(s.checks,[],`${s.id}: no checks yet`);
  assert.equal(s.id==='default-look'?s.signs:s.principles,before);
 }
 const d=skills.find(s=>s.id==='default-look')!;assert.equal(d.principles,'');assert.deepEqual(d.stages,['critic'],'the failure looks are the reviewer\'s signs');
 for(const id of ['variation-engine','layout-craft','motion-intent'])assert.ok(!skills.find(s=>s.id===id)!.stages.includes('hero'),`${id}: not in the hero frame`);
 assert.deepEqual(skills.find(s=>s.id==='ad-idea')!.stages,['ideas','visual-direction','hero','extension','critic'],'stages follow today\'s roles');
});

test('D1: each stage gets only its own skills\' principles; the critic gets checks and signs; signs never reach a creator', ()=>{
 const hero=creatorStageText(staged,'hero'),ext=creatorStageText(staged,'extension'),critic=criticStageText(staged);
 assert.match(hero,/^SKILLS FOR THIS STAGE \(the hero frame\)\n\nSKILL ad-idea — /);for(const id of ['variation-engine','layout-craft','motion-intent','default-look'])assert.ok(!hero.includes(`SKILL ${id} `),id);
 assert.ok(ext.includes('SKILL variation-engine — ')&&ext.includes('SKILL layout-craft — '));
 assert.match(critic,/^WHAT TO CHECK[\s\S]*SKILL default-look — Refuse the default look\nSigns of failure:\n/);assert.ok(!critic.includes(skills.find(s=>s.id==='ad-idea')!.principles.slice(0,60)),'no principles for the critic');
 for(const role of ['research','strategy','script','visual-direction','designer','creative-code','image'])for(const effort of [undefined,'design-hero','design-create']){
  const m=stageMessage(staged,role,effort);assert.ok(!m.includes(signs.slice(0,80))&&!m.includes('Signs of failure'),`${role}/${effort}: no signs`);
 }
 assert.equal(requestStage('designer','design-hero'),'hero');assert.equal(requestStage('designer','design-create'),'extension');assert.equal(requestStage('script'),'ideas');assert.equal(requestStage('critic'),'critic');
 assert.deepEqual(stageSkillIds(staged,'critic'),['default-look'],'only skills with checks or signs add to the critic');
 // The owner's saved attachments win; a skill detached from every role serves no stage.
 const saved=buildStageSkills(skills,[{skill_id:'variation-engine',role:'critic'},{skill_id:'one-idea',role:NO_ROLE}]);
 assert.ok(saved.stages.critic!.some(s=>s.id==='variation-engine')&&!saved.stages.extension!.some(s=>s.id==='variation-engine'));assert.ok(SKILL_STAGES.every(x=>!saved.stages[x]?.some(s=>s.id==='one-idea')));
});

test('D1: no skill in the shared system text; the prefix is byte-identical across roles; frozen contexts keep theirs', ()=>{
 const c=ctx(staged),old=ctx(),f=fixture('plain-planning'),layout=(role:string,effort?:string)=>{const p=prepareTextRequest(f.model,f.prompt,f.cfg);return sharedLayout(toCliRequest(p,{executionModel:'sonnet',schemaMode:'cli'}),p,c,role,stageMessage(c.stageSkills!,role,effort));};
 assert.ok(!c.system.includes('SKILL '),'skills left the system text');assert.ok(old.system.includes('SKILL ad-idea'),'a context frozen before D1 keeps them');assert.equal(c.roleSkills,undefined);
 const a=layout('research'),b=layout('critic'),d=layout('designer','design-hero');
 assert.equal(a.systemPrompt,b.systemPrompt);assert.equal(a.systemPrompt,d.systemPrompt);
 const lead=(x:typeof a)=>JSON.stringify(x.parts.slice(0,x.parts.findIndex(p=>p.type==='text'&&p.text.startsWith('YOUR ROLE'))));assert.equal(lead(a),lead(b));assert.equal(lead(a),lead(d));
 const heading=d.parts.findIndex(p=>p.type==='text'&&p.text.startsWith('YOUR ROLE'));assert.match((d.parts[heading+1] as {text:string}).text,/^SKILLS FOR THIS STAGE \(the hero frame\)/,'the stage message follows the role heading');
 assert.ok(!(d.parts[heading] as {text:string}).text.includes('ROLE SKILLS'));
 // A continued conversation of the same role sends no stage message again (it is in the cached history).
 const p=prepareTextRequest(f.model,f.prompt,f.cfg),cli=toCliRequest(p,{executionModel:'sonnet',schemaMode:'cli'});
 assert.ok(!JSON.stringify(continuingLayout(cli,p,c,{resume:'s',fork:true,sameRole:true},'designer','SKILLS FOR THIS STAGE x').parts).includes('SKILLS FOR THIS STAGE'));
 assert.ok(JSON.stringify(continuingLayout(cli,p,c,{resume:'s',fork:true,sameRole:false},'designer','SKILLS FOR THIS STAGE x').parts).includes('SKILLS FOR THIS STAGE'));
 assert.equal(buildRunContext({briefText:'{}',brandPack:'B',stageSkills:staged}).stageSkills,undefined,'only with a stored pack and materials');
});

test('D1: a stage over its budget is refused; the defaults fit', ()=>{
 assert.deepEqual(stageBudgetProblems(staged),[]);
 const big=parseSkill(`---\nid: big-one\ntitle: Big\nstages: hero\n---\n## Principles\n${'word '.repeat(STAGE_SKILL_LIMIT*2)}\n`);
 const over=buildStageSkills([...skills,big],[]);assert.match(stageBudgetProblems(over)[0],/the hero frame come to about \d+ tokens/);
 assert.throws(()=>ctx(over),/STAGE_SKILLS_OVER_BUDGET/);
});

test('D1: a recorded creator request carries its stage\'s principles only; stage E gets its skills once, with the mechanics', async()=>{
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'d1-home-'));const dir=await mkdtemp(join(tmpdir(),'d1-')),rec=join(dir,'r.json'),f=fixture('plain-planning');
 const r=await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>ctx(staged),role:'designer',stage:'design-hero'})(f.model,f.prompt,f.cfg) as LocalTextReceipt;
 const sent=JSON.parse(readFileSync(rec,'utf8')) as {system:string;content:{text?:string}[]},all=sent.content.map(c=>c.text??'').join('\n');
 assert.ok(!sent.system.includes('SKILL '));assert.ok(all.includes('SKILLS FOR THIS STAGE (the hero frame)'));assert.ok(!all.includes(signs.slice(0,80)),'no signs in a creator request');
 assert.ok(!all.includes('SKILL variation-engine'));assert.deepEqual(r.local?.skills,stageSkillIds(staged,'designer','design-hero'),'the usage line lists this stage\'s skills');
 const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:4,materialsVersion:1,digestVersion:1};
 const state=newDesignerState();state.hero={sceneId:i.storyboard[0].id,format:i.variants[0].format,state:'accepted',reviews:1};
 const tools:DesignerTools={files:async()=>[{path:'Frame.tsx',source:'x'}],write:async()=>{},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),render:async()=>({summary:{version:1 as const,revision:'r',views:0,hard:0,soft:0,reports:[]} as never,shots:[]})};
 const messages:string[]=[];await runExtensionChat({input:i,state,maxTurns:2,maxPictures:0,timeMs:600000,tools,save:async()=>{},skills:creatorStageText(staged,'extension'),call:async m=>{messages.push(m);return 'Working.';}});
 assert.match(messages[0],/THE HERO FRAME IS ACCEPTED[\s\S]*SKILLS FOR THIS STAGE \(every scene, format and variation\)/);assert.ok(!messages[1].includes('SKILLS FOR THIS STAGE'),'sent once');
 assert.ok(!/motion choreography/.test(DESIGNER_ROLE_V4),'the version 4 designer\'s own role line');
});
