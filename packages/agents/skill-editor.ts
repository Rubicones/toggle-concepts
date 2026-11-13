// D2 (docs/plans/2026-11-13-skills-critic-image-owner.md): the skill editor. The owner writes a skill's three parts in
// Models & agents; the saved text (table studio_skill_texts, migration 20261113000600) replaces the file's for new runs.
// The checks on save, the token counts and the preview of what a stage will receive. Pure.
import {buildStageSkills,checkTag,CHECK_STAGES,creatorStageText,criticStageText,stageBudgetProblems,stageTokens,SKILL_STAGES,STAGE_LABELS,STAGE_SKILL_BUDGET,type SkillStage} from './stage-skills';
import type {SkillFile} from './skill-files';

export type SkillDraft={title:string;purpose:string;stages:string[];principles:string;checks:string[];signs:string};
export type SavedSkillText=SkillDraft&{skill_id:string;version:number};
const tokens=(text:string)=>Math.ceil(Buffer.byteLength(text,'utf8')/4);
/** Plan 1a: Principles at most about 600 tokens, three to six checks, Signs at most about 300; one skill at most 2,000.
 * "About": above the size a warning, above the ceiling a refusal (the converted signs of default-look are about 371). */
export const SKILL_PART_LIMITS={principles:600,signs:300,checks:6,skill:2000} as const,SKILL_PART_CEILINGS={principles:800,signs:400} as const;
export function draftTokens(d:Pick<SkillDraft,'principles'|'checks'|'signs'>){
 const principles=d.principles.trim()?tokens(d.principles.trim()):0,checks=d.checks.length?tokens(d.checks.join('\n')):0,signs=d.signs.trim()?tokens(d.signs.trim()):0;
 return {principles,checks,signs,total:principles+checks+signs};
}

const EXAMPLES=/for example|e\.g\.|such as|like this|in the style of|\binspired by\b/i;
const LINKS=/https?:|®|™/i;
/** Names of fonts, brands and design systems (capitalised; the plain words stay ordinary vocabulary). */
const NAMES=/\b(Helvetica|Arial|Inter|Roboto|Futura|Garamond|Montserrat|Poppins|Lato|Open Sans|Times New Roman|Material Design|Bootstrap|Tailwind|Ant Design|Apple|Google|Nike|Coca-Cola|Figma)\b/;
/** A yes/no question: it opens with an auxiliary verb and ends with a question mark. */
const YES_NO=/^(is|are|was|were|does|do|did|can|could|will|would|should|has|have|had|may|might|must)\b[^?]*\?$/i;
/** A prohibition: what not to do, without what to do. */
const PROHIBITION=/^(?:-\s*)?(never|don['’]t|do not|avoid|no\b|not\b|stop)\b|\b(never|must not|should not|don['’]t|do not|avoid)\b/i;

export type SkillCheck={errors:string[];warnings:{line:string;message:string}[]};
/** The checks on save. Errors stop the save; warnings are shown and the owner may keep the line. */
export function checkSkillDraft(d:SkillDraft):SkillCheck{
 const errors:string[]=[],warnings:SkillCheck['warnings']=[],parts=[['For the designer',d.principles],['Questions the reviewer answers',d.checks.join('\n')],['How the reviewer spots a problem',d.signs],['Title',d.title],['Purpose',d.purpose]] as const;
 for(const [label,text] of parts){
  if(EXAMPLES.test(text))errors.push(`${label}: write the principle itself, without examples ("for example", "such as", "in the style of").`);
  if(LINKS.test(text))errors.push(`${label}: no links or trademark signs.`);
  const name=NAMES.exec(text);if(name)errors.push(`${label}: no brand, font or design-system names ("${name[1]}").`);
 }
 if(!d.title.trim())errors.push('Give the skill a title.');if(!d.purpose.trim())errors.push('Say in one line what the skill is for.');
 if(!d.principles.trim()&&!d.signs.trim())errors.push('Write the part for the designer, or how the reviewer spots a problem.');
 const t=draftTokens(d);
 for(const [key,name] of [['principles','For the designer'],['signs','How the reviewer spots a problem']] as const){
  const n=t[key],about=SKILL_PART_LIMITS[key],most=SKILL_PART_CEILINGS[key];
  if(n>most)errors.push(`"${name}" is about ${n} tokens; it should be about ${about} and at most ${most}.`);
  else if(n>about)warnings.push({line:'',message:`"${name}" is about ${n} tokens; about ${about} reads best.`});
 }
 if(t.total>SKILL_PART_LIMITS.skill)errors.push(`The skill is about ${t.total} tokens; the limit is ${SKILL_PART_LIMITS.skill}.`);
 if(d.checks.length>SKILL_PART_LIMITS.checks)errors.push(`Write at most ${SKILL_PART_LIMITS.checks} questions for the reviewer.`);
 for(const c of d.checks){
  const t=checkTag(c);
  if(t.stages){
   const unknown=t.stages.filter(x=>!(CHECK_STAGES as readonly string[]).includes(x));
   if(unknown.length||!t.stages.length)errors.push(`"${c.trim().slice(0,80)}": a check's stage tag names ideas, hero or extension ("[hero] Is …?").`);
   else for(const x of t.stages)if(!d.stages.includes(x)&&!(x!=='ideas'&&d.stages.includes('critic')))warnings.push({line:c.trim().slice(0,200),message:`This check is for ${x}, a stage the skill is not used in: no reviewer will read it.`});
  }else if(!['hero','extension','critic'].some(x=>d.stages.includes(x)))warnings.push({line:c.trim().slice(0,200),message:'A check without a tag goes to the reviews of the hero frame and the end of the draft, stages this skill is not used in: tag it [ideas] or add a stage.'});
  if(!YES_NO.test(t.question))errors.push(`"${c.trim().slice(0,80)}": write it as a question the reviewer answers yes or no: start with "Is", "Does" or "Can" and end with "?".`);
 }
 if(d.checks.length&&d.checks.length<3)warnings.push({line:'',message:'Three to six questions give the reviewer enough to go on.'});
 for(const stage of d.stages)if(!(SKILL_STAGES as readonly string[]).includes(stage))errors.push(`Unknown stage "${stage}".`);
 for(const line of d.principles.split(/\n|(?<=[.!?])\s+/).map(l=>l.trim()).filter(Boolean))if(PROHIBITION.test(line))warnings.push({line:line.slice(0,200),message:'This tells what not to do: write what to do instead (you may keep it).'});
 return {errors,warnings};
}
/** A file's skill with the owner's saved text over it (the stages chosen in the editor win over role attachments). */
export function withSavedText(file:SkillFile,saved:SavedSkillText|undefined):SkillFile{
 if(!saved)return file;
 const principles=saved.principles.trim(),signs=saved.signs.trim(),text=principles||signs;
 return {...file,title:saved.title,purpose:saved.purpose,version:`${file.version}.${saved.version}`,principles,checks:saved.checks.map(c=>c.trim()).filter(Boolean),signs,text,tokens:tokens(text),stages:saved.stages,stagesChosen:true};
}
export const withSavedTexts=(files:SkillFile[],saved:SavedSkillText[])=>files.map(f=>withSavedText(f,saved.find(s=>s.skill_id===f.id)));

/** What the editor shows for a draft: its tokens, the stages it serves, each stage's total, and the preview of a stage. */
export function skillPreview(files:SkillFile[],attachments:{skill_id:string;role:string}[],skillId:string,draft:SkillDraft,stage:SkillStage){
 const next=files.map(f=>f.id===skillId?withSavedText(f,{...draft,skill_id:skillId,version:0}):f),staged=buildStageSkills(next,attachments);
 const totals=SKILL_STAGES.map(s=>({stage:s,label:STAGE_LABELS[s],tokens:stageTokens(staged.stages[s]),budget:STAGE_SKILL_BUDGET}));
 return {check:checkSkillDraft(draft),tokens:draftTokens(draft),usedIn:SKILL_STAGES.filter(s=>staged.stages[s]?.some(x=>x.id===skillId)),totals,over:stageBudgetProblems(staged),
  creator:stage==='critic'?'':creatorStageText(staged,stage),critic:criticStageText(staged)};
}
