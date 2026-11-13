// D5 (docs/plans/2026-11-13-skills-critic-image-owner.md): the critic with shared checks, memory and bounded rounds;
// and the D4 follow-up (version 5 by default; the designer forks its direction's conversation when that is cheap).
// Recorded answers and the fake CLI only; no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {stageReviewMaterial,reviewContextText,memoryText,reviewSchemaV2,settleHeroReview,withAllRulings,readReview,reviewStop,REVIEW_INSTRUCTIONS,HERO_REVIEW_WHAT,CRITIC_BASE,type ReviewRound} from '../packages/director/critic-review';
import {SELECTION_INSTRUCTIONS} from '../packages/director/image-ideas';
import {providerJsonSchema,typeArraysAsAnyOf} from '../packages/director/provider-schema';
import {buildStageSkills,type StageSkills} from '../packages/agents/stage-skills';
import {readSkills,parseSkill} from '../packages/agents/skill-files';
import {forkFromDirection,DIRECTION_CACHE_MS} from '../packages/agents/local-session';
import {buildRunContext} from '../packages/agents/run-context';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {runHeroChat} from '../apps/local-runner/director/hero-chat-loop';
import {newDesignerState,type DesignerTools} from '../apps/local-runner/director/designer-loop';
import {cliTextTransport,type LocalTextReceipt} from '../apps/local-runner/local-claude/transport';
import {fakeSetup,fixture} from './local-chat-shaped.test';
import type {DirectionInput} from '../packages/director/types';

const reading=parseSkill('---\nid: reading-order\ntitle: Reading order\nstages: hero,extension\n---\n## Principles\nLead the eye.\n\n## Checks\n- Does the headline read first?\n- Is the offer read second?\n\n## Signs for the reviewer\nTwo things shout at once.\n');
const staged:StageSkills=buildStageSkills([...readSkills().filter(s=>s.id!=='reading-order'),reading],[]);
const answer=(o:Record<string,unknown>)=>JSON.stringify({rulings:[],checks:[],notes:[],accepted:false,summary:'s',...o});
const round1=answer({checks:[{s:'reading-order',n:1,ok:false,e:'The price shouts first.'},{s:'reading-order',n:2,ok:true,e:'Offer second.'}],notes:[{s:'reading-order',n:1,priority:'P1',view:'square',problem:'The price leads.',fix:'Make the headline the largest element.',replaces:''},{s:'reading-order',n:2,priority:'P2',view:'square',problem:'Tight.',fix:'Give the offer more room.',replaces:''}]});

test('D5: the checks are the stage\'s own (hero apart from the end review); earlier notes travel as text with a ruling each', ()=>{
 const hero=stageReviewMaterial(staged,'hero');assert.deepEqual(hero.checks.filter(c=>c.skill==='reading-order').map(c=>`${c.skill} ${c.n}`),['reading-order 1','reading-order 2']);assert.ok(hero.signs.some(s=>s.startsWith('default-look: ')),'the critic stage\'s signs');
 assert.deepEqual(stageReviewMaterial(buildStageSkills([reading],[{skill_id:'reading-order',role:'designer'}]),'extension').checks.length,2);
 const first=settleHeroReview(round1,1,[],0)!;assert.equal(first.result.stop,undefined);assert.equal(first.round.notes[0].id,'R1N1');
 const ctx=reviewContextText({territory:'The hook you can hold.',checks:hero.checks,signs:hero.signs,hard:[],memory:[first.round]});
 assert.match(ctx,/YOUR EARLIER REVIEW OF THIS FRAME \(text only; rule on each earlier note first: fixed, open or worse\)\nRound 1\. Checks: reading-order 1 no, reading-order 2 yes\.\nNotes:\n- R1N1 \[reading-order, check 1\] P1 square: The price leads\. Change: Make the headline the largest element\./);
 // A round that rules on only one earlier note: the other gets "open".
 const r=withAllRulings(readReview(answer({rulings:[{note:'R1N1',ruling:'fixed'}],checks:[{s:'reading-order',n:1,ok:true,e:'Headline first.'}]}),2)!,[first.round]);
 assert.deepEqual(r.rulings,[{note:'R1N1',ruling:'fixed'},{note:'R1N2',ruling:'open'}]);
 assert.equal(memoryText([]),'');assert.ok(REVIEW_INSTRUCTIONS(HERO_REVIEW_WHAT).startsWith(CRITIC_BASE));assert.ok(SELECTION_INSTRUCTIONS.startsWith(CRITIC_BASE),'5e: the selection is the same request shape');
 const s=reviewSchemaV2.schema;assert.ok(JSON.stringify(s).length<2400&&JSON.stringify(typeArraysAsAnyOf(providerJsonSchema(s))).length<2400,'compact check answers');
});

test('D5: the stop rules: all checks pass, no progress, two rounds; open points go to stage E as notes', ()=>{
 const pass=settleHeroReview(answer({checks:[{s:'reading-order',n:1,ok:true,e:'a'},{s:'reading-order',n:2,ok:true,e:'b'}],accepted:true}),1,[],0)!;assert.equal(pass.result.stop,'all-pass');assert.deepEqual(pass.result.open,[]);
 assert.equal(settleHeroReview(answer({checks:[{s:'reading-order',n:1,ok:true,e:'a'}],accepted:true}),1,[],1)!.result.stop,undefined,'an open hard finding keeps the review going');
 const first=settleHeroReview(round1,1,[],0)!.round,none=settleHeroReview(answer({rulings:[{note:'R1N1',ruling:'open'},{note:'R1N2',ruling:'worse'}],checks:[{s:'reading-order',n:1,ok:false,e:'Still the price.'}]}),2,[first],0)!;
 assert.equal(none.result.stop,'no-progress');assert.deepEqual(none.result.open,['reading-order, check 1 (still open): Make the headline the largest element.','reading-order, check 2 (worse): Give the offer more room.']);
 const last=settleHeroReview(answer({rulings:[{note:'R1N1',ruling:'fixed'}],checks:[{s:'reading-order',n:2,ok:false,e:'Offer lost.'}],notes:[{s:'reading-order',n:2,priority:'P1',view:'tall',problem:'Offer lost.',fix:'Bring the offer up.',replaces:''}]}),2,[first],0)!;
 assert.equal(last.result.stop,'rounds');assert.ok(last.result.open!.includes('reading-order, check 2: Bring the offer up.'));
 assert.equal(reviewStop({round:1,answers:[],notes:[],rulings:[],accepted:false},{hardOpen:0}),null,'no checks written: the critic\'s own acceptance decides');
});

const input=(v:number)=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:v,materialsVersion:1,digestVersion:1};return i;};
const build=(word:string)=>`${word}\n\n\`\`\`tsx Frame.tsx\nexport default ()=>null;\n\`\`\`\n\n\`\`\`actions\n{"render":true,"review":true}\n\`\`\``;
test('D5: in the hero chat the critic gets its memory and never the designer\'s words; a stop by rule hands open points to stage E', async()=>{
 const memory:ReviewRound[]=[],seen:string[]=[],events:{kind:string;by?:string;stop?:string}[]=[],answers=[round1,answer({rulings:[{note:'R1N1',ruling:'open'},{note:'R1N2',ruling:'open'}],checks:[{s:'reading-order',n:1,ok:false,e:'Same.'}]})];
 const tools:DesignerTools={files:async()=>[],write:async()=>{},build:async()=>({ok:true as const}),requestImage:async()=>({id:'',status:'refused' as const}),finish:async()=>({complete:true as const}),
  render:async views=>({summary:{version:1 as const,revision:'r',views:views.length,hard:0,soft:0,reports:[]} as never,shots:views.filter(v=>v.shot).map(v=>({key:v.key,file:'/dev/null'}))}),
  reviewHero:async(round,shots,findings)=>{seen.push(JSON.stringify({round,shots,findings}));const s=settleHeroReview(answers[round-1],round,memory,0)!;memory.push(s.round);return s.result;}};
 const state=newDesignerState();
 await runHeroChat({input:input(4),state,maxTurns:4,maxPictures:0,timeMs:600000,heroReviews:2,tools,save:async()=>{},onHero:async e=>{events.push({kind:e.kind,by:e.by,stop:(e as {review?:{stop?:string}}).review?.stop});},call:async()=>build('SECRET-DESIGNER-REASONING')});
 assert.ok(seen.every(s=>!s.includes('SECRET-DESIGNER-REASONING')),'no designer history in any critic request');
 assert.deepEqual(events.filter(e=>e.kind!=='started').map(e=>[e.kind,e.by??e.stop??null]),[['reviewed',null],['reviewed','no-progress'],['accepted','no-progress']]);
 assert.match(state.heroNote!,/OPEN POINTS FROM THE HERO REVIEW \(carry them through the other scenes; there is no further hero round\):\n- reading-order, check 1 \(still open\)/,'carried into stage E as notes, not a new round');
 assert.ok(readFileSync('apps/local-runner/director/worker.ts','utf8').includes("[...(shots[0]?[{url:await screenshotForDesigner(shots[0].file,RENDER_LONG_SIDE),label:'The hero frame now, at full size'}]:[])"),'the current render at 1,024 px; earlier rounds only as text');
});

test('D4 follow-up: version 5 by default; the designer forks its direction\'s conversation only when it is cheap', async()=>{
 assert.match(readFileSync('apps/local-runner/local-claude/run-context.ts','utf8'),/imageOwner:process\.env\.STUDIO_DESIGNER_VERSION!=='4'/,'version 5 unless STUDIO_DESIGNER_VERSION=4');
 const base={pointTokens:12000,ageMs:10*60000,sameShape:true,prefixTokens:9000,digestTokens:2500,turns:12};
 assert.equal(forkFromDirection(base),true,'small and fresh: fork');
 assert.equal(forkFromDirection({...base,pointTokens:40000}),false,'large: the digest seed is cheaper');
 assert.equal(forkFromDirection({...base,ageMs:DIRECTION_CACHE_MS+1}),false,'outside the cache window');
 assert.equal(forkFromDirection({...base,sameShape:false}),false,'a per-role tool or system change breaks the prefix cache');
 // Through the fake CLI: a fork resumes and branches; a missing conversation starts again with the full request once.
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'d5-home-'));const dir=await mkdtemp(join(tmpdir(),'d5-')),rec=join(dir,'r.json'),f=fixture('plain-planning');
 const ctx=buildRunContext({briefText:'{}',brandPack:'BRAND',packVersion:1,materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},schemaInText:true});
 const forked=await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>ctx,role:'designer',stage:'design-hero',session:async()=>({resume:'vd-session',fork:true,sameRole:false})})(f.model,f.prompt,f.cfg) as LocalTextReceipt;
 const args=(JSON.parse(readFileSync(rec,'utf8')) as {args:string[]}).args;assert.equal(args[args.indexOf('--resume')+1],'vd-session');assert.ok(args.includes('--fork-session'));assert.equal(forked.local?.conversation?.kind,'branched');
 const missing=await cliTextTransport(await fakeSetup('nosession',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>ctx,role:'designer',stage:'design-hero',session:async()=>({resume:'gone',fork:true,sameRole:false})})(f.model,f.prompt,f.cfg) as LocalTextReceipt;
 assert.equal(missing.local?.conversation?.kind,'restarted','falls back to the full request (the digest seed) once');assert.ok(!(JSON.parse(readFileSync(rec,'utf8')) as {args:string[]}).args.includes('--resume'));
 const worker=readFileSync('apps/local-runner/director/worker.ts','utf8');
 assert.match(worker,/if\(!point\|\|!usesImageIdeas\(input\)\)return point;/,'version 4 keeps its planning branch rule');
 assert.ok(worker.includes("Continuing from its direction's conversation.")&&worker.includes("Started from its direction's summary."));
});
