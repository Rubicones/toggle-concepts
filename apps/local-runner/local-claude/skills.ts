// Skills attached to roles (LC5). LC2 only needs the common skills (attached to every role), which go into the shared
// run context. Filled in by LC5; until then no skills are attached.
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Skill} from '../../../packages/agents/run-context';
export async function commonSkills(admin:SupabaseClient,runId:string):Promise<Skill[]>{void admin;void runId;return [];}
