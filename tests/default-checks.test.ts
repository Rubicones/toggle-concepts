// Default Checks and Signs (docs/reviews/2026-11-13-default-checks.md): every skill ships its own reviewer questions.
// Pure functions over the skill files; no model is called.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSkills,estimateTokens} from '../packages/agents/skill-files';
import {buildStageSkills,checkTag,checksForStage,creatorStageText,criticStageText,stageChecksText,stageMessage,SKILL_STAGES,STAGE_SKILL_BUDGET,CHECK_STAGES} from '../packages/agents/stage-skills';
import {checkSkillDraft,withSavedText,SKILL_PART_LIMITS,SKILL_PART_CEILINGS} from '../packages/agents/skill-editor';
import {stageReviewMaterial,checksText} from '../packages/director/critic-review';

const skills=readSkills(),staged=buildStageSkills(skills,[]);
const questions=(id:string,stage:'ideas'|'hero'|'extension')=>stageReviewMaterial(staged,stage).checks.filter(c=>c.skill===id).map(c=>c.question);

test('Default checks: all 14 skills pass the D2 save checks; three to five yes/no checks and two to four signs each', ()=>{
 assert.equal(skills.length,14);
 for(const s of skills){
  const c=checkSkillDraft({title:s.title,purpose:s.purpose,stages:s.stages,principles:s.principles,checks:s.checks,signs:s.signs});
  assert.deepEqual(c.errors,[],s.id);assert.deepEqual(c.warnings.filter(w=>/check|stage/i.test(w.message)),[],`${s.id}: every check reaches a reviewer`);
  assert.ok(s.checks.length>=3&&s.checks.length<=5&&s.checks.length<=SKILL_PART_LIMITS.checks,`${s.id}: 3-5 checks`);
  for(const line of s.checks){const t=checkTag(line);assert.ok(!t.stages||t.stages.every(x=>(CHECK_STAGES as readonly string[]).includes(x)&&s.stages.includes(x)),`${s.id}: "${line}" is tagged for its own stages`);assert.match(t.question,/^(Is|Are|Does|Do|Can)\b[^?]*\?$/,`${s.id}: one yes/no question`);}
  if(s.id==='default-look')continue;// its signs are the pre-D1 text, unchanged
  const lines=s.signs.split('\n').filter(Boolean);assert.ok(lines.length>=2&&lines.length<=4,`${s.id}: 2-4 lines of signs`);
  assert.ok(estimateTokens(s.signs)<=SKILL_PART_LIMITS.signs&&estimateTokens(s.signs)<SKILL_PART_CEILINGS.signs,`${s.id}: signs within the D2 size`);
 }
 const draft=(checks:string[],stages=['hero'])=>checkSkillDraft({title:'T',purpose:'P',stages,principles:'Lead the eye.',checks,signs:''});
 assert.deepEqual(draft(['[hero] Is the headline first?','Is the offer second?','[hero,extension] Is the mark clear?']).errors,[]);
 assert.match(draft(['[pictures] Is it sharp?']).errors[0],/stage tag names ideas, hero or extension/);assert.match(draft(['[hero] Make it bigger.']).errors[0],/yes or no/);
 assert.match(draft(['[ideas] Is the idea one sentence?']).warnings.map(w=>w.message).join(),/not used in/);
 // Ideas checks are answerable from the three ideas as text: only the skills of the ideas stage carry them.
 for(const s of skills)for(const line of s.checks)if(checkTag(line).stages?.includes('ideas'))assert.ok(s.stages.includes('ideas')&&/\bidea\b/.test(line),`${s.id}: "${line}" reads the idea`);
});

test('Default checks: hero and end-of-draft reviews get their own checks; the ideas stage only the tagged ones', ()=>{
 const hero=stageReviewMaterial(staged,'hero'),end=stageReviewMaterial(staged,'extension'),ideas=stageReviewMaterial(staged,'ideas');
 assert.deepEqual([...new Set(ideas.checks.map(c=>c.skill))],['ad-idea','brand-character','one-idea']);
 assert.ok(ideas.checks.every(c=>!/frame|render|picture and the headline/.test(c.question)),'no render questions in the selection');
 assert.ok(!hero.checks.some(c=>c.question.startsWith('['))&&!end.checks.some(c=>c.question.startsWith('[')),'tags never reach the critic');
 const recompose=skills.find(s=>s.id==='frame-composition')!.checks.find(c=>c.startsWith('[extension]'))!;
 assert.ok(end.checks.some(c=>recompose.endsWith(c.question))&&!hero.checks.some(c=>recompose.endsWith(c.question)),'the per-format check stays out of the hero review');
 for(const id of ['variation-engine','layout-craft','motion-intent'])assert.ok(!hero.checks.some(c=>c.skill===id)&&end.checks.some(c=>c.skill===id),`${id}: end of draft only`);
 assert.equal(questions('ad-idea','hero').length,1);assert.equal(questions('ad-idea','ideas').length,4);
 assert.equal(questions('default-look','hero').length,4,'the critic stage\'s own checks join the hero review');assert.equal(questions('default-look','extension').length,4);
 for(const st of [hero,end,ideas])for(const id of new Set(st.checks.map(c=>c.skill)))assert.deepEqual(st.checks.filter(c=>c.skill===id).map(c=>c.n),st.checks.filter(c=>c.skill===id).map((_,i)=>i+1),`${id}: numbered within the stage`);
 assert.equal(stageChecksText(staged,'ideas'),`THE IDEAS AND PLANNING CHECKS\n${ideas.checks.map(c=>`- ${c.question}`).join('\n')}`);
});

test('Default checks: checks and signs go only to the critic and the selection, never to a creator', ()=>{
 const all=skills.flatMap(s=>[...s.checks.map(c=>checkTag(c).question),...s.signs.split('\n').filter(l=>l.trim().length>20)]);
 for(const stage of SKILL_STAGES.filter(x=>x!=='critic')){const text=creatorStageText(staged,stage);for(const line of all)assert.ok(!text.includes(line),`${stage}: "${line}"`);}
 for(const role of ['research','strategy','script','visual-direction','designer','creative-code','image'])for(const effort of [undefined,'design-hero','design-create'])assert.ok(!/Checks:|Signs of failure|THE CHECKS/.test(stageMessage(staged,role,effort)),`${role}/${effort}`);
 const critic=criticStageText(staged);assert.ok(critic.includes('SKILL final-check — ')&&critic.includes('Checks:\n- Can a stranger say what is sold'));
 assert.ok(!critic.includes('[ideas]')&&!critic.includes('Does the idea state one benefit'),'the older critic reads render checks only');
});

test('Default checks: the owner\'s saved text wins; contexts frozen at stage-skills@1 keep their exact reading', ()=>{
 const file=skills.find(s=>s.id==='ad-idea')!;
 const mine=withSavedText(file,{skill_id:'ad-idea',version:3,title:file.title,purpose:file.purpose,stages:file.stages,principles:file.principles,checks:['Is the promise the largest line?','[ideas] Does the idea name one viewer?','Is the product shown?'],signs:'Mine.'});
 const owned=buildStageSkills(skills.map(s=>s.id==='ad-idea'?mine:s),[]);
 assert.deepEqual(stageReviewMaterial(owned,'hero').checks.filter(c=>c.skill==='ad-idea').map(c=>c.question),['Is the promise the largest line?','Is the product shown?']);
 assert.deepEqual(stageReviewMaterial(owned,'ideas').checks.filter(c=>c.skill==='ad-idea').map(c=>c.question),['Does the idea name one viewer?']);
 assert.ok(stageReviewMaterial(owned,'hero').signs.includes('ad-idea: Mine.'));
 // @1: every check served every stage of its skill, and the critic stage's checks stayed out of the render reviews.
 const legacy={...staged,version:'stage-skills@1'};
 assert.deepEqual(stageReviewMaterial(legacy,'hero').checks.map(c=>c.question),(staged.stages.hero??[]).flatMap(s=>s.checks));
 assert.deepEqual(checksForStage(['[hero] Is it?','Is it?'],'ideas',legacy),['[hero] Is it?','Is it?']);
 assert.equal(staged.version,'stage-skills@2');
});

test('Default checks: the critic-side material stays within the stage budget', ()=>{
 const t=(s:string)=>s?estimateTokens(s):0,mat=(m:ReturnType<typeof stageReviewMaterial>)=>t(checksText(m.checks))+t(m.signs.length?`SIGNS OF FAILURE\n${m.signs.join('\n')}`:'');
 for(const n of [t(criticStageText(staged)),mat(stageReviewMaterial(staged,'hero')),mat(stageReviewMaterial(staged,'extension')),t(checksText(stageReviewMaterial(staged,'ideas').checks))])assert.ok(n<STAGE_SKILL_BUDGET,`${n} tokens`);
});
