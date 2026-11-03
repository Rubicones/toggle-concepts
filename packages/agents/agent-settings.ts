import {defaultAgentSettings,AGENT_INSTRUCTION_VERSION} from './defaults';

export type StoredAgent={role:string;model_id:string|null;instructions:string;max_output_tokens:number;step_cap_micro_usd:number};
/**
 * Models & agents is the source of truth for models, output limits and step caps. Shipping new default instructions
 * changes only the instruction text of existing roles; a role that does not exist yet gets the complete default row.
 */
export function instructionUpdateRows(existing:StoredAgent[],tenant:string,stamp:string){
 return defaultAgentSettings.map(defaults=>{
  const current=existing.find(a=>a.role===defaults.role);
  return current?{tenant_id:tenant,role:current.role,model_id:current.model_id,instructions:defaults.instructions,max_output_tokens:current.max_output_tokens,step_cap_micro_usd:current.step_cap_micro_usd,updated_at:stamp}:{...defaults,tenant_id:tenant,updated_at:stamp};
 });
}
/** Roles whose saved instructions differ from the instructions shipped with this version of the app. */
export function outdatedInstructionRoles(existing:StoredAgent[]){
 return defaultAgentSettings.filter(d=>{const current=existing.find(a=>a.role===d.role);return !current||current.instructions!==d.instructions;}).map(d=>d.role);
}
export {AGENT_INSTRUCTION_VERSION};
