import {canonicalJson} from '@/packages/contracts/common';
import {submittedBrandbook,submittedBrandbookItems,validateBrandbookReferences} from "@/lib/server/brandbook-a1";
import {importBrandbookToA1,brandbookRuleChoices} from "@/packages/brand/a1-handoff";
import {draftRoundFeedback} from "@/lib/server/draft-round";
import {readyBrandMaterialRefs} from "@/lib/server/brand-intake";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { api, body, json, ApiError } from "@/lib/server/api";
import { campaignRecord, studioContext, checked } from "@/lib/server/studio";
import { schemaMissing } from "@/lib/server/brief";
import { brandDbError, savedBrandInputs, importSavedBrandProposal } from "@/lib/server/brand-kit";
import { brandDraftSchema, emptyBrandDraft, brandInputErrors } from "@/packages/contracts/brand-kit";
import { brandSnapshot, a1ReviewSource } from "@/packages/data/brand-snapshot";

export async function GET(_:Request,ctx:RouteContext<"/api/studio/campaigns/[id]/brand-kit">){return api(async()=>{
 const {id}=await ctx.params;await campaignRecord(z.uuid().parse(id));const {admin,tenant}=await studioContext();
 const [cp,draft,revisions,reviews,assets]=await Promise.all([
  admin.from("studio_c1_checkpoints").select("id,run_id,payload").eq("tenant_id",tenant).eq("campaign_id",id).maybeSingle(),
  admin.from("studio_brand_drafts").select("version,round_no,payload,updated_at").eq("tenant_id",tenant).eq("campaign_id",id).maybeSingle(),
  admin.from("studio_brand_revisions").select("id,revision_no,source_draft_version,sha256,created_at,payload").eq("tenant_id",tenant).eq("campaign_id",id).order("revision_no",{ascending:false}).limit(20),
  admin.from("studio_a1_reviews").select("id,brand_revision_id,round_no,decision,sha256,created_at,payload").eq("tenant_id",tenant).eq("campaign_id",id).order("created_at",{ascending:false}).limit(20),
  admin.from("asset_revisions").select("id,filename,mime,bytes,sha256").eq("tenant_id",tenant).eq("campaign_id",id).order("created_at"),
 ]);
 for(const r of [cp,draft,revisions,reviews])if(r.error&&!schemaMissing(r.error))brandDbError(r.error);
 const ready=![cp,draft,revisions,reviews].some(r=>schemaMissing(r.error));
 const steps=cp.data?checked(await admin.from("studio_agent_steps").select("id,status,prompt,output,error_code,cost_micro_usd,config_snapshot,usage").eq("tenant_id",tenant).eq("run_id",cp.data.run_id).eq("role","brand-kit").order("created_at",{ascending:false}).limit(20)):[];
 const budget=cp.data?checked(await admin.from("studio_runs").select("status,cap_micro_usd,charged_micro_usd,reserved_micro_usd").eq("tenant_id",tenant).eq("id",cp.data.run_id).single()):null;
 const book=await submittedBrandbook(id),books=draft.data?await validateBrandbookReferences(id,brandDraftSchema.parse(draft.data.payload)):new Map();
 return json({creativeReadiness:null,submittedBrandbook:book,brandbookChoices:draft.data?brandbookRuleChoices(brandDraftSchema.parse(draft.data.payload),books):{},draftReplay:await draftRoundFeedback(id),schemaReady:ready,c1SchemaReady:!schemaMissing(cp.error),budget,c1:cp.data,draft:draft.data,revisions:revisions.data??[],reviews:reviews.data??[],assets:checked(assets)??[],materials:await readyBrandMaterialRefs(id),steps});
});}
export async function PUT(request:Request,ctx:RouteContext<"/api/studio/campaigns/[id]/brand-kit">){return api(async()=>{
 const {id}=await ctx.params;await campaignRecord(z.uuid().parse(id));const input=await body(request,z.strictObject({expectedVersion:z.number().int().nonnegative(),draft:brandDraftSchema}),196608);
 await validateBrandbookReferences(id,input.draft);
 const {admin,tenant,actorId}=await studioContext();const cp=checked(await admin.from("studio_c1_checkpoints").select("id").eq("tenant_id",tenant).eq("campaign_id",id).maybeSingle());if(!cp)throw new ApiError(409,"C1_REQUIRED","Submit C1 before saving the Brand Kit.");
 const assets=checked(await admin.from("asset_revisions").select("id,filename,mime,bytes,sha256").eq("tenant_id",tenant).eq("campaign_id",id))??[];const errors=brandInputErrors(input.draft,cp.id,assets,await readyBrandMaterialRefs(id),true);if(errors.length)throw new ApiError(409,"INVALID_BRAND_INPUTS",errors.join(" "));
 const result=await admin.rpc("studio_save_brand",{target_campaign:id,expected_version:input.expectedVersion,draft:input.draft,acting_user:actorId});brandDbError(result.error);return json({version:result.data.version});
});}
const command=z.discriminatedUnion("action",[
 z.strictObject({action:z.literal("publish"),expectedVersion:z.number().int().positive(),requestId:z.uuid()}),
 z.strictObject({action:z.literal("import"),expectedVersion:z.number().int().positive(),stepId:z.uuid()}),
 z.strictObject({action:z.literal("review"),revisionId:z.uuid(),requestId:z.uuid(),decision:z.enum(["accepted","changes_requested"]),reviewerName:z.string().trim().min(1).max(160),comments:z.string().trim().min(1).max(4000),attestations:z.strictObject({rules:z.boolean(),fonts:z.boolean(),c1Constraints:z.boolean()})}),
]);
export async function POST(request:Request,ctx:RouteContext<"/api/studio/campaigns/[id]/brand-kit">){return api(async()=>{
 const {id}=await ctx.params;await campaignRecord(z.uuid().parse(id));const input=await body(request,z.union([command,z.strictObject({action:z.literal("importBrandbook"),expectedVersion:z.number().int().nonnegative(),submissionId:z.uuid()})]));const {admin,tenant,actorId}=await studioContext();
 if(input.action==='importBrandbook'){
  const cp=checked(await admin.from('studio_c1_checkpoints').select('id,payload,brief_text').eq('tenant_id',tenant).eq('campaign_id',id).maybeSingle());if(!cp)throw new ApiError(409,'C1_REQUIRED','Submit C1 before loading its A1 working kit.');
  const current=checked(await admin.from('studio_brand_drafts').select('version,round_no,payload').eq('tenant_id',tenant).eq('campaign_id',id).maybeSingle());
  const accepted=checked(await admin.from('studio_a1_reviews').select('id').eq('tenant_id',tenant).eq('campaign_id',id).eq('round_no',current?.round_no??1).eq('decision','accepted').limit(1));if(accepted?.length)throw new ApiError(409,'A1_ALREADY_ACCEPTED','A1 already accepted this kit. Its revision remains fixed.');
  const book=await submittedBrandbook(id,input.submissionId);if(!book)throw new ApiError(409,'BRANDBOOK_REQUIRED','Submit your brandbook before loading it into A1.');
  const base=current?brandDraftSchema.parse(current.payload):emptyBrandDraft(cp.payload.scope.locales);
  const items=await submittedBrandbookItems(id,book),brief=JSON.parse(cp.brief_text).questionnaire;
  let draft;try{draft=importBrandbookToA1(base,book,items,{id:cp.id,immutables:brief?.immutables,sourceAssetIds:Array.isArray(brief?.sourceAssetIds)?brief.sourceAssetIds:[]},randomUUID);}catch{throw new ApiError(409,'BRANDBOOK_IMPORT_LIMIT','The A1 working kit cannot fit the added rules or material references. Existing data is unchanged; retain the full source book and curate the working kit.');}
  // Repeat imports only fill empty, unreviewed rules; an unchanged kit keeps its version.
  if(current&&canonicalJson(draft)===canonicalJson(base))return json({draft:base,version:current.version,message:`Brandbook v${book.version_no} is already loaded. Your current A1 edits are retained.`});
  if((current?.version??0)!==input.expectedVersion)throw new ApiError(409,'STALE_BRAND','The A1 working kit changed. Reload before importing.');
  await validateBrandbookReferences(id,draft);
  const materials=await readyBrandMaterialRefs(id),assets=checked(await admin.from('asset_revisions').select('id,filename,mime,bytes,sha256').eq('tenant_id',tenant).eq('campaign_id',id))??[];
  const errors=brandInputErrors(draft,cp.id,assets,materials,true);if(errors.length)throw new ApiError(409,'INVALID_BRAND_INPUTS',errors.join(' '));
  const saved=await admin.rpc('studio_save_brand',{target_campaign:id,expected_version:input.expectedVersion,draft,acting_user:actorId});brandDbError(saved.error);
  return json({draft,version:saved.data.version,message:`Brandbook v${book.version_no} loaded into A1 for review. All ${items.length} original findings remain in the source book. Imported rules, font rights and locale checks still need your review. No AI request was made.`});
 }
 if(input.action==="publish"){
  const prior=await admin.from("studio_brand_revisions").select("id,source_draft_version").eq("tenant_id",tenant).eq("campaign_id",id).eq("request_id",input.requestId).maybeSingle();brandDbError(prior.error);if(prior.data){if(prior.data.source_draft_version!==input.expectedVersion)throw new ApiError(409,"REQUEST_CONFLICT","This publish request belongs to another draft revision.");return json({id:prior.data.id});}
  const saved=await savedBrandInputs(id,input.expectedVersion);const previous=checked(await admin.from("studio_brand_revisions").select("id").eq("tenant_id",tenant).eq("campaign_id",id).order("revision_no",{ascending:false}).limit(1).maybeSingle());
  const snapshot=brandSnapshot(saved.c1,saved.draft,saved.assets,input.expectedVersion,previous?.id??null,saved.round,saved.materials);
  const result=await admin.rpc("studio_publish_brand",{target_campaign:id,expected_version:input.expectedVersion,request_key:input.requestId,source:snapshot.source,acting_user:actorId});brandDbError(result.error);return json({id:result.data.id},201);
 }
 if(input.action==="import"){
  return json(await importSavedBrandProposal(id,input.expectedVersion,input.stepId));
 }
 const r=await admin.from("studio_brand_revisions").select("*").eq("tenant_id",tenant).eq("campaign_id",id).eq("id",input.revisionId).maybeSingle();brandDbError(r.error);const revision=r.data;if(!revision)throw new ApiError(404,"BRAND_REVISION_REQUIRED","That Brand Kit revision does not belong to this campaign.");
 const source=a1ReviewSource(revision,actorId,{decision:input.decision,reviewerName:input.reviewerName,comments:input.comments,attestations:input.attestations});
 const result=await admin.rpc("studio_review_a1",{target_campaign:id,target_revision:input.revisionId,request_key:input.requestId,source,acting_user:actorId});brandDbError(result.error);return json({id:result.data.id},201);
});}
