// Skills (docs/plans/2026-11-11-local-chat-shaped-runs.md, LC5): markdown files of craft principles for a role, in
// packages/agents/skills/<id>.md with frontmatter id, title, purpose, version. The owner attaches them to roles in
// Models & agents. Skills attached to every text role are common and go into the shared run context; the others follow
// the role's own instructions. The text a run uses is frozen with its run context.
import {readdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {Skill} from './run-context';

export type SkillFile=Skill&{title:string;purpose:string;tokens:number;/** Roles the skill is attached to until the owner chooses otherwise (frontmatter `roles: all` or a comma list). */defaultRoles:string[];
 /** D1: the stages it serves (frontmatter `stages`), and its three parts: Principles for the creator, Checks and Signs for
  * the reviewer. `text` stays the text earlier layouts used (the principles, or for a signs-only skill its signs). */
 stages:string[];principles:string;checks:string[];signs:string};
/** Saved when the owner detaches a skill from every role, so its defaults do not return. */
export const NO_ROLE='none';
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
 const body=m[2].trim(),part=(name:string)=>{const r=new RegExp(`^## ${name}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`,'m').exec(body);return r?r[1].trim():undefined;};
 const principles=part('Principles')??body,checks=(part('Checks')??'').split('\n').map(l=>l.replace(/^\s*-\s*/,'').trim()).filter(Boolean),signs=part('Signs for the reviewer')??'';
 const text=principles||signs;
 const stages=(meta.stages??'').split(',').map(x=>x.trim()).filter(Boolean);
 const wanted=(meta.roles??'').split(',').map(r=>r.trim()).filter(Boolean),defaultRoles=wanted.includes('all')?[...SKILL_ROLES]:wanted.filter(r=>(SKILL_ROLES as readonly string[]).includes(r));
 return {id:meta.id,title:meta.title??meta.id,purpose:meta.purpose??'',version:String(meta.version??'1'),text,tokens:estimateTokens(text),defaultRoles,stages,principles,checks,signs};
}
/** The runner and the app both start in the repository root. */
export const SKILLS_DIR=resolve(process.cwd(),'packages/agents/skills');
export function readSkills(dir=SKILLS_DIR):SkillFile[]{
 return readdirSync(dir).filter(f=>f.endsWith('.md')).sort().map(f=>parseSkill(readFileSync(join(dir,f),'utf8')));
}
/** Attachments as {skillId: roles}; common = attached to every text role. */
export function splitSkills(skills:SkillFile[],attachments:{skill_id:string;role:string}[]){
 // The owner's saved choice for a skill wins; a skill never touched uses its own default roles.
 const roles=(id:string)=>{const saved=attachments.filter(a=>a.skill_id===id);return saved.length?saved.map(a=>a.role).filter(r=>r!==NO_ROLE):skills.find(s=>s.id===id)?.defaultRoles??[];};
 const common=skills.filter(s=>SKILL_ROLES.every(r=>roles(s.id).includes(r)));
 const byRole:Record<string,Skill[]>={};
 for(const s of skills)if(!common.includes(s))for(const r of roles(s.id))(byRole[r]??=[]).push({id:s.id,version:s.version,text:s.text});
 return {common:common.map(s=>({id:s.id,version:s.version,text:s.text})),byRole};
}
