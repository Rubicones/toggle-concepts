// Skills (docs/plans/2026-11-11-local-chat-shaped-runs.md, LC5): markdown files of craft principles for a role, in
// packages/agents/skills/<id>.md with frontmatter id, title, purpose, version. The owner attaches them to roles in
// Models & agents. Skills attached to every text role are common and go into the shared run context; the others follow
// the role's own instructions. The text a run uses is frozen with its run context.
import {readdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {Skill} from './run-context';

export type SkillFile=Skill&{title:string;purpose:string;tokens:number};
/** Size limits, in estimated tokens (4 bytes each). */
export const SKILL_TOKEN_LIMIT=2000,ROLE_SKILLS_TOKEN_LIMIT=6000;
export const estimateTokens=(text:string)=>Math.ceil(Buffer.byteLength(text,'utf8')/4);
/** Text roles that can take skills (the roles that write with a model). */
export const SKILL_ROLES=['intake','brand-kit','research','strategy','variants','script','localization','visual-direction','layout','creative-code','critic','designer'] as const;
/** The skill role of a director request: the designer has its own, the others use their agent's role. */
export const skillRoleOf=(role:string)=>role==='director'?'visual-direction':role==='assembler'?'creative-code':role;

export function parseSkill(source:string):SkillFile{
 const m=/^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g,'\n'));if(!m)throw new Error('SKILL_FRONTMATTER_REQUIRED');
 const meta=Object.fromEntries(m[1].split('\n').map(l=>{const i=l.indexOf(':');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
 if(!/^[a-z0-9-]{2,60}$/.test(meta.id??''))throw new Error('SKILL_ID_INVALID');
 const text=m[2].trim();
 return {id:meta.id,title:meta.title??meta.id,purpose:meta.purpose??'',version:String(meta.version??'1'),text,tokens:estimateTokens(text)};
}
/** The runner and the app both start in the repository root. */
export const SKILLS_DIR=resolve(process.cwd(),'packages/agents/skills');
export function readSkills(dir=SKILLS_DIR):SkillFile[]{
 return readdirSync(dir).filter(f=>f.endsWith('.md')).sort().map(f=>parseSkill(readFileSync(join(dir,f),'utf8')));
}
/** Attachments as {skillId: roles}; common = attached to every text role. */
export function splitSkills(skills:SkillFile[],attachments:{skill_id:string;role:string}[]){
 const roles=(id:string)=>attachments.filter(a=>a.skill_id===id).map(a=>a.role);
 const common=skills.filter(s=>SKILL_ROLES.every(r=>roles(s.id).includes(r)));
 const byRole:Record<string,Skill[]>={};
 for(const s of skills)if(!common.includes(s))for(const r of roles(s.id))(byRole[r]??=[]).push({id:s.id,version:s.version,text:s.text});
 return {common:common.map(s=>({id:s.id,version:s.version,text:s.text})),byRole};
}
