import { z } from "zod";
import {buildStageSkills,stageTokens,stageBudgetProblems,SKILL_STAGES,STAGE_LABELS,STAGE_SKILL_BUDGET} from "@/packages/agents/stage-skills";
import { api, body, json, ApiError } from "@/lib/server/api";
import { studioContext, checked } from "@/lib/server/studio";
import { readSkills, splitSkills, SKILL_ROLES, SKILL_TOKEN_LIMIT, ROLE_SKILLS_TOKEN_LIMIT, NO_ROLE } from "@/packages/agents/skill-files";
import { STAGES, DEFAULT_STAGE_EFFORT } from "@/packages/agents/stage-effort";
import { MATERIAL_ROLES, DEFAULT_MATERIAL_BUDGET } from "@/packages/agents/materials";

// LC5/LC6, Models & agents: skills (craft principles in packages/agents/skills), which roles they are attached to,
// and the effort per stage of shared Local runs. Changes apply to new runs: each run freezes them with its context.
export async function GET(){return api(async()=>{
 const {admin,tenant}=await studioContext(),ready=!(await admin.rpc("studio_skills_version")).error;
 const skills=readSkills();
 const attachments=ready?checked(await admin.from("studio_skill_attachments").select("skill_id,role").eq("tenant_id",tenant))??[]:[];
 const efforts=ready?checked(await admin.from("studio_stage_effort").select("stage,effort").eq("tenant_id",tenant))??[]:[];
 // C3: per-role material budgets (migration 20261113000300); null before it, the defaults shown.
 const budgets=await admin.from("studio_material_budgets").select("role,count,tokens").eq("tenant_id",tenant),budgetsReady=!budgets.error;
 // D1: skills by stage (new runs): each stage's sum of principles against its budget.
 const staged=buildStageSkills(skills,attachments),stageSums=SKILL_STAGES.map(x=>({stage:x,label:STAGE_LABELS[x],tokens:stageTokens(staged.stages[x]),budget:STAGE_SKILL_BUDGET}));
 const {common,byRole}=splitSkills(skills,attachments),size=(ids:string[])=>skills.filter(s=>ids.includes(s.id)).reduce((n,s)=>n+s.tokens,0);
 return json({ready,stageSums,roles:SKILL_ROLES,limits:{skill:SKILL_TOKEN_LIMIT,role:ROLE_SKILLS_TOKEN_LIMIT},
  skills:skills.map(s=>({id:s.id,title:s.title,purpose:s.purpose,version:s.version,tokens:s.tokens,checks:s.checks.length,signs:!!s.signs,stages:SKILL_STAGES.filter(x=>staged.stages[x]?.some(t=>t.id===s.id)),roles:attachments.some(a=>a.skill_id===s.id)?attachments.filter(a=>a.skill_id===s.id&&a.role!==NO_ROLE).map(a=>a.role):s.defaultRoles})),
  common:common.map(s=>s.id),commonTokens:size(common.map(s=>s.id)),
  byRole:Object.fromEntries(SKILL_ROLES.map(r=>[r,{skills:(byRole[r]??[]).map(s=>s.id),tokens:size((byRole[r]??[]).map(s=>s.id))}])),
  stages:STAGES.map(s=>({...s,effort:efforts.find(e=>e.stage===s.id)?.effort??DEFAULT_STAGE_EFFORT[s.id]})),
  materials:{ready:budgetsReady,roles:MATERIAL_ROLES.map(role=>{const saved=(budgets.data??[]).find(b=>b.role===role);return {role,count:saved?.count??DEFAULT_MATERIAL_BUDGET[role].count,tokens:saved?.tokens??DEFAULT_MATERIAL_BUDGET[role].tokens,default:DEFAULT_MATERIAL_BUDGET[role]};})}});
});}
const input=z.union([
 z.strictObject({skillId:z.string().regex(/^[a-z0-9-]{2,60}$/),roles:z.array(z.enum(SKILL_ROLES)).max(SKILL_ROLES.length)}),
 z.strictObject({stage:z.enum(STAGES.map(s=>s.id) as [string,...string[]]),effort:z.enum(["low","medium","high","xhigh","max"])}),
 z.strictObject({materialRole:z.enum(MATERIAL_ROLES),count:z.number().int().min(0).max(20),tokens:z.number().int().min(0).max(100000)}),
]);
export async function PUT(request:Request){return api(async()=>{
 const parsed=await body(request,input),{admin,tenant}=await studioContext();
 if("materialRole" in parsed){const r=await admin.from("studio_material_budgets").upsert({tenant_id:tenant,role:parsed.materialRole,count:parsed.count,tokens:parsed.tokens,updated_at:new Date().toISOString()});if(r.error)throw new ApiError(503,"MATERIALS_SCHEMA_REQUIRED","Apply the materials migration (20261113000300_material_budgets.sql) in Supabase first.");return json({message:"Saved. New shared Local runs use this budget; runs already started keep theirs."});}
 if((await admin.rpc("studio_skills_version")).error)throw new ApiError(503,"SKILLS_SCHEMA_REQUIRED","Apply the skills migration (20261111000400_skills_and_stage_effort.sql) in Supabase first.");
 if("stage" in parsed){checked(await admin.from("studio_stage_effort").upsert({tenant_id:tenant,stage:parsed.stage,effort:parsed.effort,updated_at:new Date().toISOString()}));return json({message:"Saved. New shared Local runs use this effort; runs already started keep theirs."});}
 const skills=readSkills(),skill=skills.find(s=>s.id===parsed.skillId);if(!skill)throw new ApiError(404,"SKILL_NOT_FOUND","This skill is not in the studio.");
 // A role's own skills stay within the size limit (common skills are counted once, in the shared context).
 const current=checked(await admin.from("studio_skill_attachments").select("skill_id,role").eq("tenant_id",tenant))??[];
 const next=[...current.filter(a=>a.skill_id!==skill.id),...parsed.roles.map(role=>({skill_id:skill.id,role}))],{byRole}=splitSkills(skills,next);
 for(const [role,list] of Object.entries(byRole)){const t=list.reduce((n,s)=>n+(skills.find(f=>f.id===s.id)?.tokens??0),0);if(t>ROLE_SKILLS_TOKEN_LIMIT)throw new ApiError(422,"ROLE_SKILLS_TOO_LARGE",`${role} would carry ${t} tokens of skills; the limit is ${ROLE_SKILLS_TOKEN_LIMIT}.`);}
 // D1: no stage may go over its budget (new runs read the skills by stage).
 const over=stageBudgetProblems(buildStageSkills(skills,next));if(over.length)throw new ApiError(422,"STAGE_SKILLS_TOO_LARGE",over.join(' '));
 checked(await admin.from("studio_skill_attachments").delete().eq("tenant_id",tenant).eq("skill_id",skill.id));
 // An empty choice is saved too, so the skill's default roles do not come back.
 checked(await admin.from("studio_skill_attachments").insert((parsed.roles.length?parsed.roles:[NO_ROLE]).map(role=>({tenant_id:tenant,skill_id:skill.id,role}))));
 return json({message:parsed.roles.length?`${skill.title} is attached to ${parsed.roles.length===SKILL_ROLES.length?"every role (common: in the shared context)":parsed.roles.join(", ")}. New runs use it.`:`${skill.title} is attached to no role.`});
});}
