import {z} from 'zod';
import type {AgentSetting} from './shared';
export const MAX_RUN_MICRO_USD=100_000_000;
export const runLimitChangeSchema=z.strictObject({
 requestId:z.uuid(),expectedVersion:z.number().int().nonnegative(),runCapMicroUsd:z.number().int().min(10000).max(MAX_RUN_MICRO_USD),
 agents:z.array(z.strictObject({role:z.string().min(1).max(60),maxOutputTokens:z.number().int().min(64).max(32768),capMicroUsd:z.number().int().min(1).max(MAX_RUN_MICRO_USD)})).max(14),
 continueRun:z.boolean(),retryJobId:z.uuid().nullable(),
});
export type RunLimitChange=z.infer<typeof runLimitChangeSchema>;
export type RunLimits={ready:boolean;version:number;agents:AgentSetting[];history:{id:string;created_at:string;previous_run_cap:number;run_cap:number;continue_run:boolean}[]};
/** Testing allowances, not a provider quote or a promise of total production cost. */
export function practicalLimits(agents:AgentSetting[]){return agents.filter(a=>a.model_id&&!['image','video','model3d'].includes(a.role)).map(a=>({role:a.role,maxOutputTokens:Math.max(a.max_output_tokens,['script','variants','localization','creative-code','layout'].includes(a.role)?32768:16384),capMicroUsd:Math.max(a.step_cap_micro_usd,500000)}));}
export function applyRunLimits(agents:AgentSetting[],overrides:{role:string;max_output_tokens:number;cap_micro_usd:number}[]){return agents.map(a=>{const override=overrides.find(o=>o.role===a.role);return override?{...a,max_output_tokens:override.max_output_tokens,step_cap_micro_usd:override.cap_micro_usd}:a;});}
export function canContinueFailure(code:string|null|undefined){return !!code&&['OUTPUT_TOKEN_LIMIT','INVALID_OUTPUT_SCHEMA','RUN_CAP_REACHED','STEP_CAP_REACHED','LOCAL_API_UNAVAILABLE','RUN_COORDINATOR_FAILED','paused_by_user','stopped_by_user','LEASE_LOST','CANCELLED_BEFORE_SUBMIT'].includes(code);}
