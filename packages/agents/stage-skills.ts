// D1 (docs/plans/2026-11-13-skills-critic-image-owner.md): skills as stage material. In run contexts frozen from D1 on,
// skills leave the shared system text: each stage gets one message with its skills' Principles (creators), and the
// critic gets the Checks and Signs of the skills it reviews against. Signs never reach a creator. The texts are frozen
// with the run context. Pure.
import {estimateTokens,NO_ROLE,type SkillFile} from './skill-files';

export const STAGE_SKILLS_VERSION='stage-skills@1';
export const SKILL_STAGES=['ideas','visual-direction','hero','extension','pictures','critic'] as const;
export type SkillStage=typeof SKILL_STAGES[number];
export const STAGE_LABELS:Record<SkillStage,string>={ideas:'ideas and planning','visual-direction':'visual direction',hero:'the hero frame',extension:'every scene, format and variation',pictures:'pictures',critic:'the review'};
/** About 4,000 tokens of principles per stage: the editor shows the sum against 4,000; a stage is refused above 4,400
 * ("about": the converted defaults of the extension stage come to about 4,040). */
export const STAGE_SKILL_BUDGET=4000,STAGE_SKILL_LIMIT=4400;
/** The owner's rule (D0 answers): the hero frame is one frame; these serve the extension and later stages. */
export const HERO_EXCLUDED:ReadonlySet<string>=new Set(['variation-engine','layout-craft','motion-intent']);
/** Today's roles, mechanically, as stages. */
export const ROLE_STAGES:Record<string,SkillStage[]>={intake:['ideas'],'brand-kit':['ideas'],research:['ideas'],strategy:['ideas'],variants:['ideas'],script:['ideas'],localization:['ideas'],
 'visual-direction':['visual-direction'],designer:['hero','extension'],'creative-code':['extension'],layout:['extension'],critic:['critic'],image:['pictures']};
export function stagesFromRoles(id:string,roles:string[]):SkillStage[]{
 const out=new Set<SkillStage>();for(const r of roles)for(const st of ROLE_STAGES[r]??[])if(!(st==='hero'&&HERO_EXCLUDED.has(id)))out.add(st);
 return SKILL_STAGES.filter(st=>out.has(st));
}

export type StageSkill={id:string;title:string;version:string;principles:string;checks:string[];signs:string};
export type StageSkills={version:string;stages:Partial<Record<SkillStage,StageSkill[]>>};
/** Each skill's stages: the owner's saved attachments (by role) when there are any, else its own frontmatter stages. */
export function buildStageSkills(skills:SkillFile[],attachments:{skill_id:string;role:string}[]):StageSkills{
 const stages:StageSkills['stages']={};
 for(const s of [...skills].sort((a,b)=>a.id.localeCompare(b.id))){
  const saved=attachments.filter(a=>a.skill_id===s.id);
  const list=s.stagesChosen?s.stages.filter((x):x is SkillStage=>(SKILL_STAGES as readonly string[]).includes(x)):saved.length?stagesFromRoles(s.id,saved.map(a=>a.role).filter(r=>r!==NO_ROLE)):(s.stages.length?s.stages.filter((x):x is SkillStage=>(SKILL_STAGES as readonly string[]).includes(x)):stagesFromRoles(s.id,s.defaultRoles));
  for(const st of list)(stages[st]??=[]).push({id:s.id,title:s.title,version:s.version,principles:s.principles,checks:s.checks,signs:s.signs});
 }
 return {version:STAGE_SKILLS_VERSION,stages};
}
export const stageTokens=(list:StageSkill[]=[])=>list.reduce((n,s)=>n+(s.principles?estimateTokens(s.principles):0),0);
/** Stages over the budget, in plain words; empty when every stage fits. */
export function stageBudgetProblems(st:StageSkills):string[]{
 return SKILL_STAGES.flatMap(stage=>{const n=stageTokens(st.stages[stage]);return n>STAGE_SKILL_LIMIT?[`The skills of ${STAGE_LABELS[stage]} come to about ${n} tokens; a stage holds about ${STAGE_SKILL_BUDGET} (at most ${STAGE_SKILL_LIMIT}).`]:[];});
}

/** The stage of a request, from its role and its effort stage (LC6). */
export function requestStage(role:string|undefined,effortStage?:string):SkillStage{
 if(role==='critic')return 'critic';
 if(role==='designer')return effortStage==='design-hero'?'hero':'extension';
 if(role==='visual-direction')return 'visual-direction';
 if(role==='creative-code'||role==='layout'||role==='assembler')return 'extension';
 if(role==='image')return 'pictures';
 return 'ideas';
}
/** What a creator of this stage reads: its skills' Principles only. */
export function creatorStageText(st:StageSkills,stage:SkillStage){
 const list=(st.stages[stage]??[]).filter(s=>s.principles);
 return list.length?`SKILLS FOR THIS STAGE (${STAGE_LABELS[stage]})\n\n${list.map(s=>`SKILL ${s.id} — ${s.title}\n${s.principles}`).join('\n\n')}`:'';
}
/** The stages a reviewer judges, and its own: their skills' Checks and Signs (a skill with neither adds nothing). */
export const REVIEWED_STAGES:SkillStage[]=['hero','extension','critic'];
export function criticStageText(st:StageSkills){
 const seen=new Set<string>(),list=REVIEWED_STAGES.flatMap(x=>st.stages[x]??[]).filter(s=>!seen.has(s.id)&&seen.add(s.id)&&(s.checks.length||s.signs));
 return list.length?`WHAT TO CHECK (the skills the work was made with)\n\n${list.map(s=>[`SKILL ${s.id} — ${s.title}`,...(s.checks.length?[`Checks:\n${s.checks.map(c=>`- ${c}`).join('\n')}`]:[]),...(s.signs?[`Signs of failure:\n${s.signs}`]:[])].join('\n')).join('\n\n')}`:'';
}
/** The one stage message of a request ('' when its stage has no skills). */
export function stageMessage(st:StageSkills,role:string|undefined,effortStage?:string){
 const stage=requestStage(role,effortStage);return stage==='critic'?criticStageText(st):creatorStageText(st,stage);
}
/** The ids a request carried, for its usage line. */
export function stageSkillIds(st:StageSkills,role:string|undefined,effortStage?:string){
 const stage=requestStage(role,effortStage);
 return stage==='critic'?[...new Set(REVIEWED_STAGES.flatMap(x=>st.stages[x]??[]).filter(s=>s.checks.length||s.signs).map(s=>s.id))]:(st.stages[stage]??[]).filter(s=>s.principles).map(s=>s.id);
}
export const stageSkillTitles=(st:StageSkills,stage:SkillStage)=>(st.stages[stage]??[]).filter(s=>s.principles).map(s=>s.title);
