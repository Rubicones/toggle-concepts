import type {GuidedRunControl} from './guided-run';
/** A saved preview from earlier planning cannot complete an unpublished current draft. Read-only. */
export function visibleDraftControl(control:GuidedRunControl|null,round:{phase:string}|null,draft:{active:boolean;status?:string}){
 if(!control||control.stage!=='draft_review'||!['review','running'].includes(control.status)||round?.phase!=='ready_for_draft_assembly')return control;
 if(draft.active&&draft.status==='ready')return control;
 return {...control,stage:'assembly' as const,status:draft.active&&['queued','running'].includes(draft.status??'')?'running' as const:'review' as const,blocker:null};
}
/** Financial admission and submitted requests outrank a stale coordinator cursor. Read-only. */
export function visibleRunControl(control:GuidedRunControl|null,run:{status:string;closure_reason?:string|null}|null,steps:{status:string;role?:string;error_code?:string|null}[]){
 if(!control)return null;
 if(steps.some(s=>s.status==='unknown')||run?.status==='closed'&&run.closure_reason==='provider_status_unknown')return {...control,status:'blocked' as const,blocker:'UNRESOLVED_PROVIDER_RECEIPT'};
 if(run&&run.status!=='active'&&control.status==='running')return {...control,status:'blocked' as const,blocker:run.closure_reason??'RUN_NOT_ACTIVE'};
 const failed=control.stage==='assembly'?steps.find(s=>s.role==='creative-code'&&s.status==='failed'):null;
 if(failed&&control.status==='running')return {...control,status:'blocked' as const,blocker:failed.error_code??'INVALID_DRAFT_PROPOSAL'};
 return control;
}
