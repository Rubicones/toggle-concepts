// Skills, stage effort and material budgets for a 'shared' Local run (LC5, LC6, C3): skill texts from the repository, their role attachments
// and the effort per stage from Models & agents. Read once, when the run context is frozen: later changes affect new
// runs only. A database without migration 20261111000400 reads as no attachments and the default efforts.
import type {SupabaseClient} from '@supabase/supabase-js';
import {readSkills,splitSkills} from '../../../packages/agents/skill-files';
import {buildStageSkills} from '../../../packages/agents/stage-skills';
import {withSavedTexts,type SavedSkillText} from '../../../packages/agents/skill-editor';
import type {ContextExtras} from './run-context';

export async function contextExtras(admin:SupabaseClient,runId:string):Promise<ContextExtras>{
 const run=await admin.from('studio_runs').select('tenant_id').eq('id',runId).maybeSingle();const tenant=run.data?.tenant_id;
 if(!tenant)return {commonSkills:[]};
 const [att,eff,mat]=await Promise.all([admin.from('studio_skill_attachments').select('skill_id,role').eq('tenant_id',tenant),admin.from('studio_stage_effort').select('stage,effort').eq('tenant_id',tenant),admin.from('studio_material_budgets').select('role,count,tokens').eq('tenant_id',tenant)]);
 let files:ReturnType<typeof readSkills>=[];try{files=readSkills();}catch{files=[];}
 // D2: the owner's saved texts (migration 20261113000600) replace the files' for runs frozen from now on.
 const texts=await admin.from('studio_skill_texts').select('skill_id,version,title,purpose,stages,principles,checks,signs').eq('tenant_id',tenant);
 if(!texts.error)files=withSavedTexts(files,(texts.data??[]) as SavedSkillText[]);
 const {common,byRole}=splitSkills(files,att.error?[]:att.data??[]);
 const stageEffort=Object.fromEntries((eff.error?[]:eff.data??[]).map(r=>[r.stage,r.effort]));
 // C3: per-role material budgets (migration 20261113000300); without it, the defaults.
 const materialBudget=Object.fromEntries((mat.error?[]:mat.data??[]).map(r=>[r.role,{count:Number(r.count),tokens:Number(r.tokens)}]));
 // D1: the same files and saved attachments as skills by stage; used only by contexts frozen with a stored pack.
 const stageSkills=buildStageSkills(files,att.error?[]:att.data??[]);
 return {commonSkills:common,stageSkills,...(Object.keys(byRole).length?{roleSkills:byRole}:{}),...(Object.keys(stageEffort).length?{stageEffort}:{}),...(Object.keys(materialBudget).length?{materialBudget}:{})};
}
