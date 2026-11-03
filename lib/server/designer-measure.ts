import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {designerMeasurements,type DesignerRun} from '@/packages/director/money';

/** Measured designer directions (designer pipeline plan, point 6c): the most recent sealed designer drafts. */
export async function loadDesignerMeasurements(admin:SupabaseClient){
 const rows=await admin.from('studio_director_iterations').select('designer:payload->designer').not('payload->designer','is',null).order('created_at',{ascending:false}).limit(40);
 if(rows.error)return designerMeasurements([]);
 return designerMeasurements(((rows.data??[]) as {designer:DesignerRun|null}[]).flatMap(r=>r.designer?[r.designer]:[]));
}
