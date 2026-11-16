// D3 (docs/plans/2026-11-13-skills-critic-image-owner.md): positive instructions, behind their own version and off by
// default until the owner approves. Recorded CLI answers only; no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import recovery from '../fixtures/director/static/coder-recovery.json';
import {CHANGES,positiveText,prohibitionCount,POSITIVE_DEFAULT,POSITIVE_VERSION,type TextKey} from '../packages/agents/positive-instructions';
import {SHARED_BASE,buildRunContext} from '../packages/agents/run-context';
import {defaultAgentSettings,sharedAgentInstructions} from '../packages/agents/defaults';
import {DEFAULT_MATERIAL_BUDGET} from '../packages/agents/materials';
import {STAGE_H_INSTRUCTIONS,HERO_CRITIC_INSTRUCTIONS} from '../packages/director/hero-chat';
import {liveCriticInstructionsV2} from '../packages/agents/prompts/director-critic-v1';
import {stageEMechanics} from '../packages/director/extension-chat';
import {cliTextTransport} from '../apps/local-runner/local-claude/transport';
import {fakeSetup,fixture} from './local-chat-shaped.test';
import type {DirectionInput} from '../packages/director/types';

const input=()=>{const i=structuredClone((recovery as {input:unknown}).input) as DirectionInput;i.brief={...i.brief,designerVersion:4};return i;};
const role=(r:string)=>defaultAgentSettings.find(a=>a.role===r)!.instructions.slice(sharedAgentInstructions.length+2);
const texts:Record<TextKey,string>={base:SHARED_BASE,shared:sharedAgentInstructions,strategy:role('strategy'),script:role('script'),'visual-direction':role('visual-direction'),stageH:STAGE_H_INSTRUCTIONS,stageE:stageEMechanics(input()),heroCritic:HERO_CRITIC_INSTRUCTIONS,endCritic:liveCriticInstructionsV2};
const ctx=(positive:boolean)=>buildRunContext({briefText:'{"product":"lamp"}',brandPack:'BRAND CHARACTER\nCalm.',packVersion:1,materials:{entries:[],budget:DEFAULT_MATERIAL_BUDGET},positive});

test('D3: every change replaces a prohibition that exists today, and no text grows', ()=>{
 for(const c of CHANGES){assert.ok(texts[c.text].includes(c.before),`${c.text}: "${c.before.slice(0,60)}"`);assert.ok(prohibitionCount(c.before)>0,`${c.text}: only prohibition lines change ("${c.before.slice(0,50)}")`);assert.ok(c.after.length<=c.before.length,`${c.text}: "${c.before.slice(0,40)}" does not grow`);}
 for(const [k,t] of Object.entries(texts))assert.ok(positiveText(t,[k as TextKey]).length<=t.length,k);
 // The owner's three rules, as targets.
 const after=(k:TextKey)=>positiveText(texts[k],[k]);
 for(const k of ['strategy','visual-direction'] as const){assert.match(after(k),/interface in an ad is a simplified mockup built in code from the brand's components/);assert.match(after(k),/in a visual style invented for this brand/);}
 assert.match(after('stageE'),/Every word shown is approved copy, verbatim/);
 // The approved stage H text changes only in its prohibition lines.
 const h=after('stageH');assert.equal(prohibitionCount(h),0);assert.ok(CHANGES.filter(c=>c.text==='stageH').every(c=>prohibitionCount(c.before)>0));
});

test('D3: the new lines keep the prompt rules: no examples, no colours, no names of brands, fonts or design systems', ()=>{
 for(const c of CHANGES){
  assert.doesNotMatch(c.after,/for example|e\.g\.|such as|in the style of/i,c.after);
  assert.doesNotMatch(c.after,/\b(red|blue|green|yellow|orange|purple|pink|black|white|grey|gray|gold|silver)\b|#[0-9a-f]{3,6}\b/i,c.after);
  assert.doesNotMatch(c.after,/\b(Helvetica|Arial|Inter|Roboto|Futura|Garamond|Material Design|Bootstrap|Tailwind)\b/,c.after);
 }
});

test('D3: behind its own version, off by default; frozen contexts and runs without it keep their texts byte for byte', async()=>{
 assert.equal(POSITIVE_DEFAULT,true,'the owner approved the texts on 2026-11-13');
 assert.match(readFileSync('apps/local-runner/local-claude/run-context.ts','utf8'),/positive:POSITIVE_DEFAULT/);
 const on=ctx(true),off=ctx(false);
 assert.equal(on.instructionsVersion,POSITIVE_VERSION);assert.equal(off.instructionsVersion,undefined);
 assert.ok(off.system.startsWith(SHARED_BASE),'unchanged base');assert.ok(on.system.startsWith(positiveText(SHARED_BASE,['base'])));
 assert.equal(buildRunContext({briefText:'{}',brandPack:'B',positive:true}).instructionsVersion,undefined,'only with a stored pack and materials');
 process.env.TOGGLE_HOME=await mkdtemp(join(tmpdir(),'d3-home-'));const dir=await mkdtemp(join(tmpdir(),'d3-')),f=fixture('plain-planning');
 const sent=async(c:ReturnType<typeof ctx>)=>{const rec=join(dir,`${c.instructionsVersion??'off'}.json`);await cliTextTransport(await fakeSetup('ok',{FAKE_CLAUDE_RECORD:rec}),{shared:async()=>c,role:'strategy'})(f.model,f.prompt,{...f.cfg,instructions:defaultAgentSettings.find(a=>a.role==='strategy')!.instructions});return JSON.parse(readFileSync(rec,'utf8')) as {system:string;content:{text?:string}[]};};
 const a=await sent(on),b=await sent(off),text=(r:{content:{text?:string}[]})=>r.content.map(x=>x.text??'').join('\n');
 assert.match(text(a),/Report only actions you performed\./);assert.ok(!text(a).includes('Never claim an action you did not perform.'));assert.match(text(a),/State the idea and the visual thought only\./);
 assert.match(text(b),/Never claim an action you did not perform\./,'a run without the version sends exactly what it sent');
});

test('D3: report of prohibitions per role, before and after (reports, never fails)', ()=>{
 const roles:Record<string,TextKey[]>={strategy:['base','shared','strategy'],script:['base','shared','script'],'visual direction (asset plan)':['base','shared','visual-direction'],'designer stage H':['base','stageH'],'designer stage E opening':['stageE'],'hero critic':['base','heroCritic'],'end critic':['base','endCritic']};
 const rows=Object.entries(roles).map(([name,keys])=>({role:name,before:keys.reduce((n,k)=>n+prohibitionCount(texts[k]),0),after:keys.reduce((n,k)=>n+prohibitionCount(positiveText(texts[k],[k])),0)}));
 console.log('D3 prohibitions per role (instructions only; skills are counted in D0/D1):',JSON.stringify(rows));
 console.log('D3 changes by category:',JSON.stringify(CHANGES.reduce((m,c)=>({...m,[c.category]:(m[c.category]??0)+1}),{} as Record<string,number>)));
});
