// D6: the critic's check answers (critic@2) are stored per run, direction, stage, skill, check and round
// (migration 20261113000700). Best effort: a write never blocks or fails a run; without the table it warns once.
import type {SupabaseClient} from '@supabase/supabase-js';
import type {ReviewAnswer} from '../../../packages/director/critic-review';

let warned=false;
const warn=(why:string)=>{if(warned)return;warned=true;console.error(`[critic checks] not stored (${why}); apply migration 20261113000700_skill_measurement.sql to measure skills. Runs continue.`);};
export async function recordCheckAnswers(admin:SupabaseClient,row:{runId:string;directionId:string;stage:'hero'|'extension';round:number;answers:ReviewAnswer[];stop?:string|null}){
 const answers=row.answers.filter(a=>/^[a-z0-9-]{2,60}$/.test(a.skill)&&Number.isInteger(a.n)&&a.n>=1&&a.n<=12);
 if(!answers.length)return false;
 try{
  const tenant=(await admin.from('studio_runs').select('tenant_id').eq('id',row.runId).maybeSingle()).data?.tenant_id as string|undefined;if(!tenant)return false;
  const r=await admin.from('studio_critic_checks').upsert(answers.map(a=>({tenant_id:tenant,run_id:row.runId,direction_id:row.directionId,stage:row.stage,round:row.round,skill_id:a.skill,check_no:a.n,ok:a.ok,evidence:a.evidence.slice(0,600),stop:row.stop??null})),{onConflict:'run_id,direction_id,stage,round,skill_id,check_no'});
  if(r.error){warn(r.error.message);return false;}return true;
 }catch(error){warn(error instanceof Error?error.message:'unknown');return false;}
}
