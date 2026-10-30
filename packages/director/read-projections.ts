import type {BlockSnapshot} from './state';
import type {Design} from './contract';
import type {CatalogEntry} from './types';

/** Progress reads exclude source archives, model prompts and seeds used only by execution. */
export const directorViewBlockColumns='id,run_id,round_id,status,approved_at,quote_hash,created_by,inputs:snapshot->inputs,protocol:snapshot->>protocol,checkpointId:snapshot->>checkpointId,a1Id:snapshot->>a1Id,planning:snapshot->planning,estimates:snapshot->estimates';
export function directorViewBlock<T extends Record<string,unknown>>(row:T){
 return {...row,snapshot:{protocol:row.protocol,checkpointId:row.checkpointId,a1Id:row.a1Id,planning:row.planning,inputs:row.inputs as BlockSnapshot['inputs'],estimates:row.estimates as BlockSnapshot['estimates']}};
}

/** The saved-version list needs descriptions and checks; source is fetched on explicit access. */
export const directorViewIterationColumns='id,block_id,direction_id,source_hash,created_at,design:payload->design,catalog:payload->catalog,reports:payload->reports,presentation:payload->>presentation,unchecked:payload->unchecked';
export function directorViewIteration<T extends Record<string,unknown>>(row:T){
 return {...row,payload:{design:row.design as Design,catalog:(row.catalog??[]) as CatalogEntry[],reports:row.reports??{},presentation:row.presentation,unchecked:row.unchecked}};
}
