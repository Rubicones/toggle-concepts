import {bindLocalizedCopy,localizationBindings,type LocalizationVariant} from './localization';
import {agentEnvelopeSchema,validateWorkflowOutput} from './orchestration';
import {canonicalJson} from './common';
import {resolveAgentRole} from './agent-role';
import {bindVariantIdentities,expandProvidedManifest} from './variant-identities';
export const OUTPUT_PROTOCOL_VERSION='agent-output-1.3';
/** Only known wire-label aliases. Never edit creative content, facts, scope or a different canonical role. */
export function canonicalizeAgentRole(text:string,role:string){
 const parsed=JSON.parse(text),changes:string[]=[];
 if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&parsed.role!==role&&resolveAgentRole(parsed.role)===role){parsed.role=role;changes.push('canonical-role-label');}
 return {text:changes.length?canonicalJson(parsed):text,changes};
}
export function prepareAgentOutput(text:string,role:string,production:boolean,manifest?:{entries:Record<string,unknown>[]}){
 const normalized=canonicalizeAgentRole(text,role);
 if(production&&role==='variants'&&manifest){const parsed=JSON.parse(normalized.text);if(parsed.status!=='blocked'&&parsed.deliverable){const provided=expandProvidedManifest(parsed.deliverable,manifest),binding=bindVariantIdentities(provided.deliverable,manifest);if(provided.changed||binding.changed){parsed.deliverable=binding.deliverable;normalized.text=canonicalJson(parsed);normalized.changes.push(provided.changed?'application-provided-manifest':'application-variant-identities');}}}
 if(production&&role==='localization'&&manifest){const parsed=JSON.parse(normalized.text);if(parsed.status!=='blocked'&&parsed.deliverable){const binding=bindLocalizedCopy(parsed.deliverable,manifest.entries as LocalizationVariant[]);if(binding.changed){parsed.deliverable=binding.deliverable;normalized.text=canonicalJson(parsed);normalized.changes.push('application-localization-bindings');}}}
 const {blocked}=validateWorkflowOutput(normalized.text,role,production,manifest);
 return {...normalized,blocked,protocolVersion:OUTPUT_PROTOCOL_VERSION};
}

export function outputDiagnostic(error:unknown){
 if(error&&typeof error==='object'&&'issues' in error&&Array.isArray(error.issues))return {code:'INVALID_OUTPUT_SCHEMA',message:'The response did not match the required agent output fields.',issues:error.issues.slice(0,12).map(i=>`${i.path.join('.')||'response'}: ${i.message}`)};
 const code=error instanceof SyntaxError?'INCOMPLETE_JSON':error instanceof Error?error.message:'INVALID_OUTPUT_SCHEMA';
 const messages:Record<string,string>={INCOMPLETE_JSON:'The response is incomplete or invalid JSON.',OUTPUT_ROLE_MISMATCH:'The response identifies a different or unrecognized agent role.',DELIVERABLE_MISSING:'The agent omitted the deliverable required for this step.',THREE_DIRECTIONS_REQUIRED:'The response must contain exactly three creative directions.',LOCALIZATION_BINDING_MISMATCH:'Localized copy contains a foreign, malformed or mismatched binding. The saved text is retained, but cannot be assigned to the ordered outputs safely.',LOCALIZATION_DUPLICATE_COPY_SLOT:'The agent returned conflicting entries for the same binding and copy slot.',LOCALIZATION_COVERAGE_MISMATCH:'Localized copy does not cover the complete ordered scope.',MANIFEST_BINDING_MISMATCH:'The response changed an ordered variant binding.',OUTPUT_TOO_LARGE:'The response exceeds the local artifact size limit.'};
 return {code,message:messages[code]??code.replaceAll('_',' '),issues:[] as string[]};
}
/** Keep the native schema small; runtime validators own factual and cross-artifact invariants. */
export function agentResponseSchema(role:string,manifest?:{entries:Record<string,unknown>[]}){
 const string={type:'string'},list={type:'array',items:{type:'object',additionalProperties:true}};
 const key:Record<string,string>={research:'evidenceLedger',strategy:'threeTerritories',script:'threeDirections',localization:'localizedCopy','visual-direction':'treatments'};
 const localized=manifest?{type:'array',items:{type:'object',additionalProperties:false,properties:{binding:{type:'integer',enum:localizationBindings(manifest.entries as LocalizationVariant[]).map(g=>g.binding)},copySlot:string,text:string},required:['binding','copySlot','text']}}:list;
 const properties:Record<string,unknown>=role==='localization'&&manifest?{localizedCopy:localized}:key[role]?{[key[role]]:list}:role==='variants'?{manifest:{type:'object',properties:{useProvided:{type:'boolean'},entries:list},additionalProperties:true},orderedCount:{type:'integer'}}:{};
 return {name:'agent_output_v1_2',schema:{type:'object',additionalProperties:false,properties:{schemaVersion:{type:'string',enum:['1.0']},role:{type:'string',enum:[role]},status:{type:'string',enum:['draft','blocked','needs_review']},summary:string,deliverable:{type:'object',properties,additionalProperties:true},inputRefs:list,assumptions:{type:'array',items:string},blockingQuestions:{type:'array',items:string},warnings:{type:'array',items:string},handoff:{type:'object',additionalProperties:false,properties:{nextRole:{type:['string','null']},requiredInputs:{type:'array',items:string},checks:{type:'array',items:string}},required:['nextRole','requiredInputs','checks']}},required:['schemaVersion','role','status','summary','deliverable','inputRefs','assumptions','blockingQuestions','warnings','handoff']}};
}
export function planningRecovery(text:string,role:string,manifest:{entries:Record<string,unknown>[]}){
 const prepared=prepareAgentOutput(text,role,true,manifest);agentEnvelopeSchema.parse(JSON.parse(prepared.text));
 if(prepared.blocked||!prepared.changes.length||prepared.changes.some(change=>!['canonical-role-label','application-variant-identities'].includes(change)))throw new Error('NO_METADATA_RECOVERY');return prepared;
}
