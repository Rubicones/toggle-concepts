// D2 (docs/plans/2026-11-13-skills-critic-image-owner.md): the skill editor's checks on save and its preview. No model,
// no database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readSkills} from '../packages/agents/skill-files';
import {checkSkillDraft,skillPreview,withSavedText,draftTokens,type SkillDraft} from '../packages/agents/skill-editor';
import {buildStageSkills,creatorStageText} from '../packages/agents/stage-skills';

const skills=readSkills();
const good:SkillDraft={title:'One clear focal point',purpose:'Give each frame one place the eye lands first.',stages:['hero','critic'],
 principles:'Decide what the viewer sees first, and make it the largest, brightest or sharpest thing in the frame. Let everything else support it.',
 checks:['Is there one element the eye lands on first?','Does every other element support it?','Can the promise be read in two seconds?'],signs:'Two or more elements compete for attention at the same size and weight.'};

test('D2: a complete skill passes; examples, names, links, sizes and non-questions are refused', ()=>{
 assert.deepEqual(checkSkillDraft(good),{errors:[],warnings:[]});
 const errors=(d:Partial<SkillDraft>)=>checkSkillDraft({...good,...d}).errors.join(' | ');
 assert.match(errors({principles:'Use bold type, for example a heavy sans.'}),/without examples/);
 assert.match(errors({signs:'Looks like it was made in the style of a poster.'}),/How the reviewer spots a problem: write the principle itself, without examples/);
 assert.match(errors({principles:'Set the headline in Helvetica.'}),/no brand, font or design-system names \("Helvetica"\)/);
 assert.match(errors({principles:'Follow Material Design spacing.'}),/"Material Design"/);
 assert.match(errors({principles:'See https://x.test for more.'}),/no links/);
 assert.match(errors({principles:'word '.repeat(700)}),/should be about 600 and at most 800/);assert.match(errors({signs:'word '.repeat(400)}),/should be about 300 and at most 400/);
 assert.deepEqual(checkSkillDraft({...good,signs:'word '.repeat(270)}).warnings.map(w=>w.message),['"How the reviewer spots a problem" is about 338 tokens; about 300 reads best.'],'between the size and the ceiling: a warning');
 assert.match(errors({checks:['The logo is visible.']}),/write it as a question the reviewer answers yes or no/);
 assert.match(errors({checks:['Why is the frame good?']}),/yes or no/,'an open question is not a yes/no check');
 assert.match(errors({checks:Array.from({length:7},(_,i)=>`Is point ${i} met?`)}),/at most 6 questions/);
 assert.match(errors({principles:'',signs:''}),/Write the part for the designer, or how the reviewer spots a problem/);
 assert.match(errors({stages:['everywhere']}),/Unknown stage/);
 assert.equal(checkSkillDraft({...good,checks:[]}).errors.length,0,'no checks yet is allowed');
});

test('D2: prohibitions in the part for the designer are flagged with "write what to do instead", as a warning only', ()=>{
 const c=checkSkillDraft({...good,principles:'Never fill the frame with decoration. Put the product where the eye lands first. Avoid soft gradients.'});
 assert.equal(c.errors.length,0,'the owner may keep the lines');
 assert.deepEqual(c.warnings.map(w=>w.line),['Never fill the frame with decoration.','Avoid soft gradients.']);
 assert.ok(c.warnings.every(w=>w.message==='This tells what not to do: write what to do instead (you may keep it).'));
 assert.equal(checkSkillDraft({...good,checks:['Is it clear?']}).warnings[0].message,'Three to six questions give the reviewer enough to go on.');
});

test('D2: every current skill passes the save checks (warnings aside), so the owner can open and save it unchanged', ()=>{
 for(const s of skills){const c=checkSkillDraft({title:s.title,purpose:s.purpose,stages:s.stages,principles:s.principles,checks:s.checks,signs:s.signs});assert.deepEqual(c.errors,[],s.id);}
});

test('D2: the preview shows exactly what the chosen stage and the critic will receive; the editor\'s stages win', ()=>{
 const p=skillPreview(skills,[{skill_id:'final-check',role:'designer'}],'final-check',good,'hero');
 assert.deepEqual(p.usedIn,['hero','critic'],'the stages chosen in the editor');
 assert.match(p.creator,/^SKILLS FOR THIS STAGE \(the hero frame\)[\s\S]*SKILL final-check — One clear focal point\nDecide what the viewer sees first/);
 assert.ok(!p.creator.includes(good.signs)&&!p.creator.includes(good.checks[0]),'signs and checks never reach the designer');
 assert.match(p.critic,/SKILL final-check — One clear focal point\nChecks:\n- Is there one element the eye lands on first\?\n- Does every other element support it\?\n- Can the promise be read in two seconds\?\nSigns of failure:\nTwo or more elements compete/);
 assert.equal(p.tokens.total,draftTokens(good).total);assert.equal(p.totals.find(t=>t.stage==='hero')!.budget,4000);
 // The same text, once saved, is what new runs freeze: the stage message is built from it.
 const saved=withSavedText(skills.find(s=>s.id==='final-check')!,{...good,skill_id:'final-check',version:2});
 assert.equal(saved.stagesChosen,true);assert.equal(saved.text,good.principles);assert.equal(saved.version,'1.2');
 assert.equal(creatorStageText(buildStageSkills(skills.map(s=>s.id==='final-check'?saved:s),[]),'hero'),p.creator);
 const over=skillPreview(skills,[],'variation-engine',{...good,stages:['extension'],principles:'Keep the rule. '.repeat(480)},'extension');
 assert.ok(over.over.length&&over.check.errors.some(e=>/at most 800/.test(e)),'the stage budget and the part limit are reported before saving');
});

test('D2: saved texts live in their own table, closed to the browser; the page says when the update is needed', ()=>{
 const sql=readFileSync('supabase/migrations/20261113000600_skill_texts.sql','utf8');
 assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on public\.studio_skill_texts from public,anon,authenticated/);assert.match(sql,/jsonb_array_length\(checks\)<=6/);
 assert.match(readFileSync('components/studio/skill-editor.tsx','utf8'),/Update needed: apply migration 20261113000600_skill_texts\.sql/);
 for(const words of ['For the designer','Questions the reviewer answers','How the reviewer spots a problem','Used in stages'])assert.ok(readFileSync('components/studio/skill-editor.tsx','utf8').includes(words),words);
});
