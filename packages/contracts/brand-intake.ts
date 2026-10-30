import {z} from "zod";
import {briefSuggestionFields} from "./brief";
import {brandIntakeProfile,brandIntakeOutputProfile,universalIntakeProfile,expandCompactIntake} from "../brand/intake-output";
import {brandProposalSchema,requiredBrandRules,type BrandDraft} from "./brand-kit";
export const brandFileExtensions=["png","jpg","jpeg","webp","gif","svg","avif","heic","pdf","docx","doc","rtf","txt","md","csv","json","ttf","otf","woff","woff2"] as const;
export const materialPathSchema=z.string().min(1).max(500).refine(p=>!p.startsWith("/")&&!p.includes("\\")&&!p.split("/").some(s=>!s||s==="."||s==="..")&&!/[\x00-\x1f]/.test(p),"Use a relative folder path.");
// Chromium serializes directory-picked files with webkitRelativePath as the multipart
// filename unless an explicit filename is supplied. Keep that path as metadata only.
export const brandUploadMetadataSchema=z.strictObject({
 filename:materialPathSchema.transform(name=>name.split('/').at(-1)!).pipe(z.string().min(1).max(120).regex(/^[^\r\n/\\]+$/)),
 relativePath:materialPathSchema,
 requestId:z.uuid(),
}).superRefine((value,ctx)=>{if(value.relativePath.split('/').at(-1)!==value.filename)ctx.addIssue({code:'custom',path:['relativePath'],message:'The folder path must end with the uploaded file name.'});});
export function brandUploadForm(file:File,path:string,requestId:string){
 const form=new FormData();form.set('file',file,file.name.split('/').at(-1)!);form.set('relativePath',path);form.set('requestId',requestId);return form;
}
export const materialImageSchema=z.strictObject({objectKey:z.string().regex(/^media\/[a-zA-Z0-9/.-]+$/).refine(s=>!s.includes("..")),sha256:z.string().regex(/^[a-f0-9]{64}$/),page:z.number().int().positive(),width:z.number().int().positive().max(1024),height:z.number().int().positive().max(1024)});
export const materialExtractionSchema=z.strictObject({schemaVersion:z.literal("1.0"),kind:z.enum(["image","pdf","document","font","text"]),text:z.string().max(160000),images:z.array(materialImageSchema).max(120),warnings:z.array(z.string().max(1000)).max(30),metadata:z.record(z.string(),z.unknown())});
export type MaterialExtraction=z.infer<typeof materialExtractionSchema>;
export type BrandMaterial={id:string;filename:string;relative_path:string;mime:string;bytes:number;sha256:string;state:"uploaded"|"processing"|"ready"|"failed"|"unsupported";included:boolean;error_code:string|null;extraction_sha:string|null;extraction:MaterialExtraction|null;created_at:string;extractedChars?:number};
export {briefSuggestionFields} from "./brief";
const suggestionLimits:Record<typeof briefSuggestionFields[number],number>={product:1500,objective:1200,audience:1500,markets:500,offer:1000,cta:300,destination:500,immutables:2000,synthesis:1000,rightsNotes:1500,variationNotes:3000};
export const intakeProposalSchema=z.strictObject({summary:z.string().max(3000),kit:brandProposalSchema.extend({instructions:z.string().max(8000),boundaries:z.string().max(3000),fontRights:z.string().max(2000)}),briefSuggestions:z.array(z.strictObject({field:z.enum(briefSuggestionFields),value:z.string().min(1).max(3000),status:z.enum(["provided","inferred","proposed"]),sourceIds:z.array(z.uuid()).min(1).max(100),reason:z.string().max(1000)})).max(11),questions:z.array(z.string().max(1000)).max(30),sourceCoverage:z.array(z.strictObject({id:z.uuid(),whatWasRead:z.string().max(1500)})).max(100)}).superRefine((v,ctx)=>{if(new Set(v.briefSuggestions.map(s=>s.field)).size!==v.briefSuggestions.length)ctx.addIssue({code:"custom",message:"Duplicate suggested field"});for(const s of v.briefSuggestions)if(s.value.length>suggestionLimits[s.field])ctx.addIssue({code:"custom",message:`Suggested ${s.field} is too long`});});
export type IntakeProposal=z.infer<typeof intakeProposalSchema>;
export function parseIntakeProposal(output:string,materials:Pick<BrandMaterial,"id">[]){if(new TextEncoder().encode(output).length>131072)throw new Error('OUTPUT_TOO_LARGE');const raw=JSON.parse(output),p=intakeProposalSchema.parse(([brandIntakeProfile,brandIntakeOutputProfile,universalIntakeProfile].includes(raw?.profile))?expandCompactIntake(raw,materials.map(m=>m.id)):z.object({role:z.literal("brand-kit"),status:z.enum(["draft","needs_review"]),deliverable:z.object({brandIntake:intakeProposalSchema})}).parse(raw).deliverable.brandIntake),ids=new Set(materials.map(m=>m.id));
 if(p.sourceCoverage.length!==ids.size||new Set(p.sourceCoverage.map(s=>s.id)).size!==ids.size||p.sourceCoverage.some(s=>!ids.has(s.id)))throw new Error("INCOMPLETE_SOURCE_COVERAGE");
 const keys=p.kit.rules.map(r=>`${r.category}.${r.key}`);if(new Set(keys).size!==keys.length||requiredBrandRules.some(([c,k])=>!keys.includes(`${c}.${k}`)))throw new Error("INCOMPLETE_BRAND_RULES");
 for(const rule of p.kit.rules){const ref=rule.provenance;if(ref.kind==='proposal'&&ref.sourceId===null&&['unknown','proposed'].includes(rule.status))continue;if(ref.kind!=='material'||!ref.sourceId||!ids.has(ref.sourceId))throw new Error("FOREIGN_MATERIAL_SOURCE");}
 if(p.briefSuggestions.some(s=>s.sourceIds.some(id=>!ids.has(id))))throw new Error("FOREIGN_MATERIAL_SOURCE");return p;}
export function intakeKitDraft(proposal:IntakeProposal,base:BrandDraft,materials:BrandMaterial[],stepId:string,makeId:()=>string):BrandDraft{return {...base,instructions:proposal.kit.instructions,boundaries:proposal.kit.boundaries,fontRights:proposal.kit.fontRights,fontRightsConfirmed:false,sourceMaterialIds:materials.map(m=>m.id),proposalStepId:null,intakeStepId:stepId,rules:proposal.kit.rules.map(r=>({...r,id:makeId(),status:r.status==="confirmed"?"provided":r.status,decision:"unreviewed",sourceVerified:false})),conflicts:proposal.kit.conflicts.map(text=>({id:makeId(),text,resolved:false,resolution:""})),localeChecks:base.localeChecks.map(l=>({...l,verified:false,note:""}))};}
export type BrandIntakeView={schemaReady:boolean;updatesReady?:boolean;recoveryReady?:boolean;outputAllowanceReady?:boolean;notesDraft?:string;campaignVersion?:number;materials:BrandMaterial[];fingerprint:string;hasC1:boolean;a1Accepted:boolean;briefVersion:number;brief:Record<string,unknown>;proposals:{id:string;status:string;error_code:string|null;output:string|null;proposal:IntakeProposal|null;current:boolean;cost_micro_usd:number|null;outputTokens?:number;recoverable?:boolean;recovered?:boolean;diagnostic?:IntakeOutputDiagnostic|null}[];run:{id:string;cap_micro_usd:number;charged_micro_usd:number;reserved_micro_usd:number;status:string;outputTokens?:number|null}|null};

// Only a complete, known-cost validation failure can be reconsidered locally.
// Unknown submissions, provider errors and token-limited output never qualify.
export function canRecoverIntake(step:{status:string;error_code:string|null;output:string|null;cost_micro_usd:number|null;usage?:{_studio?:{finishReason?:string|null}}|null},materials:Pick<BrandMaterial,'id'>[]){
 if(step.status!=='failed'||step.error_code!=='INVALID_OUTPUT_SCHEMA'||step.cost_micro_usd===null||!step.output||step.usage?._studio?.finishReason==='length')return false;
 try{parseIntakeProposal(step.output,materials);return true;}catch{return false;}
}

export type IntakeOutputDiagnostic={code:string;message:string;issues:string[]};
export function diagnoseIntakeOutput(output:string|null,materials:Pick<BrandMaterial,'id'>[],maxOutputTokens?:number,finishReason?:string|null):IntakeOutputDiagnostic|null{
 const limit=maxOutputTokens?` Saved output limit: ${maxOutputTokens} tokens.`:'';
 if(finishReason==='length')return {code:'OUTPUT_TOKEN_LIMIT',message:'The provider stopped at the output token limit. The response is incomplete; no kit was imported.'+limit,issues:[]};
 if(!output)return null;
 let raw;try{raw=JSON.parse(output);}catch{return {code:'INCOMPLETE_JSON',message:'The response ended before the JSON document was complete. No kit was imported.'+limit,issues:[]};}
 if(raw?.status==='blocked'&&raw?.role==='brand-kit')return {code:'AGENT_INPUT_BLOCKED',message:'The agent reported missing inputs. Review the response and questions before another paid request.',issues:[]};
 try{parseIntakeProposal(output,materials);return null;}catch(error){const issues=error instanceof z.ZodError?error.issues.slice(0,6).map(i=>`${i.path.join('.')||'response'}: ${i.message}`):[error instanceof Error?error.message:'Invalid response'];return {code:'INVALID_OUTPUT_SCHEMA',message:'The response does not match the complete cited Brand Kit contract. No kit was imported.',issues};}
}
