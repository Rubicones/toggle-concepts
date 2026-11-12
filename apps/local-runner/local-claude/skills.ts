// Skills and stage effort for a 'shared' Local run (LC5, LC6): skill texts from the repository, their role attachments
// and the effort per stage from Models & agents. Read once, when the run context is frozen: later changes affect new
// runs only. A database without migration 20261111000400 reads as no attachments and the default efforts.
import type {SupabaseClient} from '@supabase/supabase-js';
import {readSkills,splitSkills} from '../../../packages/agents/skill-files';
import type {ContextExtras} from './run-context';

export async function contextExtras(admin:SupabaseClient,runId:string):Promise<ContextExtras>{
 const run=await admin.from('studio_runs').select('tenant_id').eq('id',runId).maybeSingle();const tenant=run.data?.tenant_id;
 if(!tenant)return {commonSkills:[]};
 const [att,eff]=await Promise.all([admin.from('studio_skill_attachments').select('skill_id,role').eq('tenant_id',tenant),admin.from('studio_stage_effort').select('stage,effort').eq('tenant_id',tenant)]);
 let files:ReturnType<typeof readSkills>=[];try{files=readSkills();}catch{files=[];}
 const {common,byRole}=splitSkills(files,att.error?[]:att.data??[]);
 const stageEffort=Object.fromEntries((eff.error?[]:eff.data??[]).map(r=>[r.stage,r.effort]));
 return {commonSkills:common,...(Object.keys(byRole).length?{roleSkills:byRole}:{}),...(Object.keys(stageEffort).length?{stageEffort}:{})};
}
