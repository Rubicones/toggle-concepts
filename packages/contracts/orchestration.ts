import {z} from "zod";
export const workflowCommandSchema=z.discriminatedUnion("action",[
 z.strictObject({action:z.literal("start"),runId:z.uuid()}),
 z.strictObject({action:z.enum(["pause","resume","cancel"]),roundId:z.uuid()}),
 z.strictObject({action:z.literal("retry"),roundId:z.uuid(),jobId:z.uuid(),confirmPaidRetry:z.literal(true)}),
]);
export type WorkflowRound={id:string;campaign_id:string;run_id:string;kind:"draft"|"manual";round_no:number;phase:string;blocker:string|null;status:string;created_at:string};
export type WorkflowJob={id:string;round_id:string;campaign_id:string;run_id:string;job_key:string;role:string;kind:"text"|"capability"|"compile";state:string;blocker:string|null;attempt_count:number;lease_until:string|null;output:string|null;output_hash:string|null;initial_step_id:string|null;created_at:string};
export type WorkflowAttempt={id:string;job_id:string;attempt_no:number;state:string;step_id:string|null;error_code:string|null;created_at:string;finished_at:string|null;late_receipt:unknown|null};
export type WorkflowView={schemaReady:boolean;rounds:WorkflowRound[];jobs:WorkflowJob[];attempts:WorkflowAttempt[];dependencies:{job_id:string;requires_id:string}[];devices:{id:string;state:string;heartbeat_at:string;name:string;online:boolean}[]};
const envelope=z.object({schemaVersion:z.literal("1.0"),role:z.string(),status:z.enum(["draft","blocked","needs_review"]),summary:z.string().min(1).max(6000),deliverable:z.record(z.string(),z.unknown()),inputRefs:z.array(z.unknown()),assumptions:z.array(z.unknown()),blockingQuestions:z.array(z.unknown()),warnings:z.array(z.unknown()),handoff:z.object({nextRole:z.string().nullable(),requiredInputs:z.array(z.unknown()),checks:z.array(z.unknown())})});
export const agentEnvelopeSchema=envelope;
const required:Record<string,string>={research:"evidenceLedger",strategy:"threeTerritories",variants:"manifest",script:"threeDirections",localization:"localizedCopy","visual-direction":"treatments"};
export function validateWorkflowOutput(text:string,role:string,production:boolean,manifest?:{entries:Record<string,unknown>[]}) {
 if(new TextEncoder().encode(text).length>131072)throw new Error("OUTPUT_TOO_LARGE");
 const parsed:unknown=JSON.parse(text);
 if(!production){if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("INVALID_OUTPUT_JSON");return {blocked:false};}
 const output=envelope.parse(parsed);if(output.role!==role)throw new Error("OUTPUT_ROLE_MISMATCH");
 // Only an explicit "blocked" status stops the run; questions on a complete draft stay visible in the saved output.
 if(output.status==="blocked")return {blocked:true};
 if(required[role]&&!(required[role] in output.deliverable))throw new Error("DELIVERABLE_MISSING");
 if(role==="strategy"&&(!Array.isArray(output.deliverable.threeTerritories)||output.deliverable.threeTerritories.length!==3))throw new Error("THREE_TERRITORIES_REQUIRED");
 if(role==="research"&&!Array.isArray(output.deliverable.evidenceLedger))throw new Error("EVIDENCE_LEDGER_REQUIRED");
 if(role==="script"&&(!Array.isArray(output.deliverable.threeDirections)||output.deliverable.threeDirections.length!==3))throw new Error("THREE_DIRECTIONS_REQUIRED");
 if(role==="localization"){
  const copy=output.deliverable.localizedCopy;
  if(!manifest||!Array.isArray(copy)||!copy.length)throw new Error("LOCALIZATION_COVERAGE_MISMATCH");
  const expected=new Map(manifest.entries.map(row=>[row.id,row.locale]));
  const covered=new Set();
  for(const row of copy){const ids=row?.variantIds??(row?.variantId?[row.variantId]:[]);if(!row||typeof row.text!=="string"||!row.text.trim()||!Array.isArray(ids)||!ids.length||ids.some((id:unknown)=>typeof id!=="string"||expected.get(id)!==row.locale))throw new Error("LOCALIZATION_BINDING_MISMATCH");for(const id of ids)covered.add(id);}
  if(covered.size!==expected.size)throw new Error("LOCALIZATION_COVERAGE_MISMATCH");
 }
 if(role==="variants"){
  const d=output.deliverable,entries=(d.manifest as {entries?:unknown[]})?.entries;
  if(!manifest||!entries||entries.length!==manifest.entries.length||d.orderedCount!==entries.length)throw new Error("MANIFEST_COVERAGE_MISMATCH");
  for(let i=0;i<entries.length;i++){
   const got=entries[i] as Record<string,unknown>,expected=manifest.entries[i];
   for(const key of ["id","conceptSlot","locale","hook","beatSequence","offer","durationSeconds","placementId"])if(!got||got[key]!==expected[key])throw new Error("MANIFEST_BINDING_MISMATCH");
  }
 }
 return {blocked:false};
}
