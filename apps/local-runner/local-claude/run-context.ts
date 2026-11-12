// LC2: the run context of a 'shared' Local run, frozen once on the run's own device (Local runs never leave it) and
// read back byte for byte by every later request. It is built from the approved brief (C1) and the accepted brand
// (A1); before A1 there is no run context and requests keep the fresh layout.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {SupabaseClient} from '@supabase/supabase-js';
import {buildRunContext,type RunContext,type Skill} from '../../../packages/agents/run-context';
import {toggleHome} from './device';

const dir=()=>join(toggleHome(),'local-claude','run-context');
export const runContextPath=(runId:string)=>join(dir(),`${runId}.json`);

export async function readRunContext(runId:string):Promise<RunContext|null>{
 try{return JSON.parse(await readFile(runContextPath(runId),'utf8')) as RunContext;}catch{return null;}
}

/** First write wins: a context once frozen is never rebuilt, whatever changes later. */
export async function freezeRunContext(runId:string,ctx:RunContext):Promise<RunContext>{
 await mkdir(dir(),{recursive:true});
 try{await writeFile(runContextPath(runId),JSON.stringify(ctx),{flag:'wx',mode:0o600});return ctx;}
 catch{return (await readRunContext(runId))??ctx;}
}

/** The frozen context, or one built now from the approved brief and the accepted brand; null before A1. */
export async function loadRunContext(admin:SupabaseClient,runId:string,commonSkills:()=>Promise<Skill[]>=async()=>[]):Promise<RunContext|null>{
 const frozen=await readRunContext(runId);if(frozen)return frozen;
 const c1=await admin.from('studio_c1_checkpoints').select('brief_text').eq('run_id',runId).maybeSingle();
 if(c1.error||!c1.data?.brief_text)return null;
 const a1=await admin.from('studio_a1_reviews').select('brand_revision_id,round_no').eq('run_id',runId).eq('decision','accepted').order('round_no',{ascending:false}).limit(1).maybeSingle();
 if(a1.error||!a1.data?.brand_revision_id)return null;
 const brand=await admin.from('studio_brand_revisions').select('canonical_text').eq('id',a1.data.brand_revision_id).maybeSingle();
 if(brand.error||!brand.data?.canonical_text)return null;
 return freezeRunContext(runId,buildRunContext({briefText:c1.data.brief_text,brandText:brand.data.canonical_text,commonSkills:await commonSkills()}));
}
