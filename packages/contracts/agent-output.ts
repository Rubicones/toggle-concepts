import {bindLocalizedCopy,localizationBindings,type LocalizationVariant} from './localization';
import {agentEnvelopeSchema,validateWorkflowOutput} from './orchestration';
import {canonicalJson} from './common';
import {resolveAgentRole} from './agent-role';
import {bindVariantIdentities,expandProvidedManifest} from './variant-identities';
export const OUTPUT_PROTOCOL_VERSION='agent-output-1.3';
const deliverableAliases:Record<string,string[]>={research:['ledger','claims','claimsLedger','evidence'],strategy:['territories','strategicTerritories'],script:['directions','concepts','scenarios','scripts','storyboards'],localization:['copy','translations','localizedStrings','entries'],'visual-direction':['visualTreatments','directionTreatments','conceptTreatments']};
const canonicalDeliverableKey:Record<string,string>={research:'evidenceLedger',strategy:'threeTerritories',script:'threeDirections',localization:'localizedCopy','visual-direction':'treatments'};
const mapItemIdKey:Record<string,string>={research:'claimId',strategy:'territoryId',script:'conceptId'};
function normalizeDeliverableShape(deliverable:Record<string,unknown>,role:string){
 const target=canonicalDeliverableKey[role];if(!target)return {deliverable,changed:false};
 const next={...deliverable};let changed=false;
 if(!(target in next)){
  const matches=(deliverableAliases[role]??[]).filter(k=>k in next&&next[k]!==undefined);
  if(matches.length===1){next[target]=next[matches[0]];delete next[matches[0]];changed=true;}
 }
 const value=next[target];
 if(['research','strategy','script'].includes(role)&&value&&typeof value==='object'&&!Array.isArray(value)){
  const entries=Object.entries(value as Record<string,unknown>);
  if(entries.length&&entries.every(([,v])=>v&&typeof v==='object'&&!Array.isArray(v))){
   const idKey=mapItemIdKey[role]??'id';
   next[target]=entries.map(([k,v])=>{const o=v as Record<string,unknown>;return ('id' in o||idKey in o)?o:{[idKey]:k,...o};});
   changed=true;
  }
 }
 return {deliverable:next,changed};
}
/** Only known wire-label aliases. Never edit creative content, facts, scope or a different canonical role. */
export function canonicalizeAgentRole(text:string,role:string){
 const parsed=JSON.parse(text),changes:string[]=[];
 if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&parsed.role!==role&&resolveAgentRole(parsed.role)===role){parsed.role=role;changes.push('canonical-role-label');}
 return {text:changes.length?canonicalJson(parsed):text,changes};
}
export function prepareAgentOutput(text:string,role:string,production:boolean,manifest?:{entries:Record<string,unknown>[]}){
 const normalized=canonicalizeAgentRole(text,role);
 if(production){const parsed=JSON.parse(normalized.text);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&parsed.status!=='blocked'&&parsed.deliverable&&typeof parsed.deliverable==='object'&&!Array.isArray(parsed.deliverable)){const shaped=normalizeDeliverableShape(parsed.deliverable as Record<string,unknown>,role);if(shaped.changed){parsed.deliverable=shaped.deliverable;normalized.text=canonicalJson(parsed);normalized.changes.push('canonical-deliverable-shape');}}}
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
/** True when every object in a JSON schema is closed (`additionalProperties:false`), as strict providers require. */
export function closedSchema(node:unknown):boolean{
 if(Array.isArray(node))return node.every(closedSchema);if(!node||typeof node!=='object')return true;
 const o=node as Record<string,unknown>;return (o.type!=='object'||o.additionalProperties===false)&&Object.values(o).every(closedSchema);
}
/**
 * Whether a draft planning request carries the strict agent envelope schema. Gemini 2.5 Flash always did and keeps the
 * exact earlier rule; any other model gets it when it supports structured outputs and the schema is fully closed (an
 * open deliverable, e.g. localization without a manifest, would be rejected by strict providers). The schema pins
 * `role` to the job's machine ID, so a model cannot answer with a job title or an invented label.
 */
export function planningEnvelopeSchema(model:{id:string;supportedParameters:string[]},schema:{schema:unknown}){
 const structured=model.supportedParameters.includes('structured_outputs');
 if(model.id==='google/gemini-2.5-flash'){if(!structured&&!model.supportedParameters.includes('response_format'))throw new Error('STRUCTURED_OUTPUT_UNAVAILABLE');return true;}
 return structured&&closedSchema(schema.schema);
}
/** Plain-text fallback for models without structured outputs: the literal value, never a job title. */
export const envelopeRoleInstruction=(role:string)=>`OUTPUT ROLE: the JSON "role" field must be exactly "${role}" (the machine ID, not a job title or a description).`;
export function agentResponseSchema(role:string,manifest?:{entries:Record<string,unknown>[]}){
 const string={type:'string'},strings={type:'array',items:string},list={type:'array',items:{type:'object',additionalProperties:true}};
 const hooks=[...new Set(['primary',...(manifest?.entries??[]).map(e=>typeof e.hook==='string'&&e.hook.trim()?e.hook.trim():'primary')])];
 const localized=manifest?{type:'array',items:{type:'object',additionalProperties:false,properties:{binding:{type:'integer',enum:localizationBindings(manifest.entries as LocalizationVariant[]).map(g=>g.binding)},copySlot:string,text:string},required:['binding','copySlot','text']}}:list;
 const deliverables:Record<string,{type:'object';additionalProperties:boolean;properties:Record<string,unknown>;required?:string[]}>={
  research:{type:'object',additionalProperties:false,properties:{evidenceLedger:{type:'array',items:{type:'object',additionalProperties:false,properties:{claimId:string,claim:string,status:{type:'string',enum:['confirmed','provided','inferred','proposed','unsupported']},suppliedSourceRef:string,supportingExcerpt:string,relevance:string,limitations:string},required:['claimId','claim','status','suppliedSourceRef','supportingExcerpt','relevance','limitations']}},supportedClaims:strings,unsupportedClaims:strings,safeAlternatives:strings,contradictions:strings},required:['evidenceLedger','supportedClaims','unsupportedClaims','safeAlternatives','contradictions']},
  strategy:{type:'object',additionalProperties:false,properties:{strategicBrief:string,audienceSituation:string,supportedProof:string,threeTerritories:{type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'string',enum:['territory-1','territory-2','territory-3']},name:string,promise:string,hook:string,story:string,visualPremise:string,hypothesis:string,measurementPlan:string,invalidation:string},required:['id','name','promise','hook','story','visualPremise','hypothesis','measurementPlan','invalidation']}},channelRationale:string,constraints:strings},required:['strategicBrief','audienceSituation','supportedProof','threeTerritories','channelRationale','constraints']},
  variants:{type:'object',additionalProperties:false,properties:{scopeSummary:string,manifest:{type:'object',additionalProperties:false,properties:{useProvided:{type:'boolean',enum:[true]}},required:['useProvided']},countExplanation:string,coverage:string,proposedAmendments:strings},required:['scopeSummary','manifest','countExplanation','coverage','proposedAmendments']},
  script:{type:'object',additionalProperties:false,properties:{threeDirections:{type:'array',items:{type:'object',additionalProperties:false,properties:{conceptId:{type:'string',enum:['concept-1','concept-2','concept-3']},conceptSlot:{type:'integer',enum:[1,2,3]},name:string,premise:string,hook:{type:'object',additionalProperties:false,properties:Object.fromEntries(hooks.map(h=>[h,string])),required:hooks},cta:string,timedStoryboard:{type:'array',items:{type:'object',additionalProperties:false,properties:{sceneId:string,startSeconds:{type:'number'},endSeconds:{type:'number'},copy:string,narration:string,visualNotes:string,motionNotes:string,audioIntent:string},required:['sceneId','startSeconds','endSeconds','copy','narration','visualNotes','motionNotes','audioIntent']}},assetNeeds:strings,proxyContracts:strings},required:['conceptId','conceptSlot','name','premise','hook','cta','timedStoryboard','assetNeeds','proxyContracts']}},durationChecks:strings,claimReferences:strings},required:['threeDirections','durationChecks','claimReferences']},
  localization:{type:'object',additionalProperties:false,properties:{localizedCopy:localized,terminologyNotes:strings,expansionRisks:strings},required:['localizedCopy','terminologyNotes','expansionRisks']},
  'visual-direction':{type:'object',additionalProperties:false,properties:{treatments:{type:'array',items:{type:'object',additionalProperties:false,properties:{conceptId:{type:'string',enum:['concept-1','concept-2','concept-3']},name:string,composition:string,visualHierarchy:string,paletteAndLighting:string,lensAndCamera:string,productScale:string,typographyTreatment:string,motionLanguage:string,formatAdaptation:string,assetPromptBriefs:strings,proxyContracts:strings},required:['conceptId','name','composition','visualHierarchy','paletteAndLighting','lensAndCamera','productScale','typographyTreatment','motionLanguage','formatAdaptation','assetPromptBriefs','proxyContracts']}},productionConstraints:strings},required:['treatments','productionConstraints']},
 };
 const deliverable=deliverables[role]??{type:'object',properties:{},additionalProperties:true};
 return {name:'agent_output_v1_2',schema:{type:'object',additionalProperties:false,properties:{schemaVersion:{type:'string',enum:['1.0']},role:{type:'string',enum:[role]},status:{type:'string',enum:['draft','blocked','needs_review']},summary:string,deliverable,inputRefs:strings,assumptions:strings,blockingQuestions:strings,warnings:strings,handoff:{type:'object',additionalProperties:false,properties:{nextRole:{type:['string','null']},requiredInputs:strings,checks:strings},required:['nextRole','requiredInputs','checks']}},required:['schemaVersion','role','status','summary','deliverable','inputRefs','assumptions','blockingQuestions','warnings','handoff']}};
}
export function planningRecovery(text:string,role:string,manifest:{entries:Record<string,unknown>[]}){
 const prepared=prepareAgentOutput(text,role,true,manifest);agentEnvelopeSchema.parse(JSON.parse(prepared.text));
 if(prepared.blocked||!prepared.changes.length||prepared.changes.some(change=>!['canonical-role-label','canonical-deliverable-shape','application-variant-identities','application-provided-manifest','application-localization-bindings'].includes(change)))throw new Error('NO_METADATA_RECOVERY');return prepared;
}
