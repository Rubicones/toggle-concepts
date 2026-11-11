import {prefillBrandbookBrief} from '@/lib/server/brandbook-brief';
import type {BrandVisualSource} from '@/packages/brand/finding-presentation';
import {brandWorkspaceMetrics,fieldPreviews,type BrandUsageRow} from '@/packages/brand/workspace-metrics';
import {z} from 'zod';
import {api,body,json,ApiError} from '@/lib/server/api';
import {campaignRecord,studioContext,checked} from '@/lib/server/studio';
import {schemaMissing} from '@/lib/server/brief';
import {brandFields,brandFieldKeys,fieldCatalogVersion,type BrandAnalysisView} from '@/packages/brand/field-extraction';
import {startLocalWorkflow,requireLocalDevice} from '@/lib/server/local-compute';
import {brandScope} from '@/lib/server/brand-source';
import {fieldsOutsideRole,materialRoles} from '@/packages/brand/material-roles';
import {materialRoleRows} from '@/lib/server/brand-roles';
import {brandDecisions} from '@/packages/brand/source-priority';
import {singleChoiceFields} from '@/packages/brand/finding-selection';
import {buildBrandCard} from '@/packages/brand/brand-card';
import {inkColours,logoInkVariants} from '@/packages/brand/normalize';
import {objectStore} from '@/packages/media/s3.server';
import {brandSheetHtml,brandSheetSections} from '@/packages/brand/brand-sheet';
import {loadBrandSheetSource} from '@/packages/brand/brand-sheet-data';
import {brandSheetView,requestBrandSheet} from '@/lib/server/brand-sheet';
const commands=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('submit'),requestId:z.uuid()}),
 z.strictObject({action:z.literal('prefill')}),
 z.strictObject({action:z.literal('buildSheet')}),
 z.strictObject({action:z.literal('useBrand'),sourceCampaignId:z.uuid().nullable()}),
 z.strictObject({action:z.literal('setRole'),materialId:z.uuid(),role:z.enum(materialRoles).nullable()}),
 z.strictObject({action:z.literal('startSelected'),requestId:z.uuid(),materialIds:z.array(z.uuid()).min(1),requestCap:z.number().int().min(100).max(10000000),runCap:z.number().int().min(10000).max(10000000)}),
 z.strictObject({action:z.literal('continue'),analysisId:z.uuid(),requestCap:z.number().int().min(100).max(10000000)}),
 z.strictObject({action:z.literal('start'),requestId:z.uuid(),requestCap:z.number().int().min(100).max(10000000),runCap:z.number().int().min(10000).max(10000000)}),
 z.strictObject({action:z.enum(['pause','resume','cancel','skip']),analysisId:z.uuid(),requestCap:z.number().int().min(100).max(10000000).optional()}),
 z.strictObject({action:z.literal('review'),findingId:z.uuid(),expectedVersion:z.number().int().positive(),decision:z.enum(['unreviewed','keep','reject']),editedValue:z.string().nullable()}),
]);
function analysisError(error:{code?:string;message:string}|null){if(!error)return;if(schemaMissing(error))throw new ApiError(503,'BRAND_FIELDS_SCHEMA_REQUIRED','Enable the required Brand Kit update in Settings. Submission and continuation use migration 014.');const messages:Record<string,string>={SOURCE_ALREADY_QUEUED:'This source already has saved work. Continue its existing analysis to retain its exact position.',INTAKE_BUILD_ACTIVE:'A source is currently being read. Wait for it to finish, then analyze the new notes only.',NO_BRAND_FINDINGS:'Collect or keep at least one finding before submitting the brandbook.',ANALYSIS_EXISTS:'An analysis already exists. Resume it to retain its budget and saved findings.',MATERIALS_NOT_READY:'Finish file reading or explicitly exclude unreadable files before analysis.',REVIEW_REQUIRED:'This part has an uncertain or invalid result. Saved findings are retained; inspect its activity before another paid request.',STALE_FINDING:'This finding changed. Reload before saving your decision.',RUN_NOT_ACTIVE:'The run is closed. Saved findings remain available; reconcile unknown charges before continuing.',RUN_CAP_REACHED:'The analysis budget is exhausted. All completed findings remain saved.',STEP_CAP_REACHED:'The cumulative brand-agent allowance is exhausted. All completed findings remain saved.'};const code=Object.keys(messages).find(c=>error.message.includes(c));if(code)throw new ApiError(409,code,messages[code]);throw new Error(error.message);}
export async function GET(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/brand-fields'>){return api(async()=>{
 const campaign=await campaignRecord((await ctx.params).id),{admin,tenant}=await studioContext(),url=new URL(request.url),scope=await brandScope(campaign.id);
 // The brand sheet (designer pipeline plan, point 1): what the designing agents see, its pages and its images.
 if(url.searchParams.has('sheets'))return json(await brandSheetView(admin,tenant,scope));
 const sheetImage=url.searchParams.get('sheetImage');if(sheetImage){
  const sha=z.string().regex(/^[a-f0-9]{64}$/).parse(sheetImage);
  const own=(checked(await admin.from('studio_brand_sheet_builds').select('submission_id').eq('tenant_id',tenant).eq('campaign_id',scope).limit(50))??[]).map(b=>b.submission_id);
  const row=own.length?checked(await admin.from('studio_brand_sheets').select('object_key').eq('sha256',sha).in('submission_id',own).limit(1).maybeSingle()):null;
  if(!row)throw new ApiError(404,'BRAND_SHEET_NOT_FOUND','This sheet image is not part of this brand.');
  return new Response(new Uint8Array((await objectStore().get(row.object_key)).body),{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=86400, immutable','X-Content-Type-Options':'nosniff'}});
 }
 const sheet=url.searchParams.get('sheet');if(sheet){
  const section=z.enum(brandSheetSections).parse(sheet),self=`/api/studio/campaigns/${campaign.id}/brand-fields`;
  const source=await loadBrandSheetSource(admin,tenant,scope,async key=>(await objectStore().get(key)).body);
  const html=brandSheetHtml(section,source,{file:(id,ground)=>`${self}?asset=${id}${ground?`&ground=${ground}`:''}`});
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src 'self' data:; font-src 'self' data:; style-src 'unsafe-inline'; sandbox"}});
 }
 const assetId=url.searchParams.get('asset');if(assetId){
  // Brand card previews: a logo (optionally with currentColor resolved for a ground) or a font file, from this brand only.
  const m=checked(await admin.from('studio_brand_materials').select('id,mime,object_key,sha256').eq('id',z.uuid().parse(assetId)).eq('tenant_id',tenant).eq('campaign_id',scope).eq('state','ready').maybeSingle());if(!m)throw new ApiError(404,'MATERIAL_NOT_FOUND','File not found in this brand.');
  let bytes=Buffer.from((await objectStore().get(m.object_key)).body),type=m.mime;
  const ground=url.searchParams.get('ground');
  if(m.mime==='image/svg+xml'&&(ground==='dark'||ground==='light')){const colours=checked(await admin.from('studio_brand_findings').select('value').eq('tenant_id',tenant).eq('campaign_id',scope).in('field',['primaryColors','secondaryColors','semanticColors']).neq('decision','reject').limit(500))??[];const v=logoInkVariants(bytes.toString('utf8'),inkColours(colours.flatMap(c=>String(c.value).match(/#[0-9a-f]{6}\b/gi)??[])));if(v)bytes=Buffer.from(ground==='dark'?v.onDark:v.onLight,'utf8');}
  if(!type.startsWith('image/'))type=/woff2/.test(m.mime)||bytes.subarray(0,4).toString('latin1')==='wOF2'?'font/woff2':bytes.subarray(0,4).toString('latin1')==='wOFF'?'font/woff':'font/ttf';
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':type,'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
 }
 if(url.searchParams.has('card')){
  const roles=new Map((await materialRoleRows(scope)).map(r=>[r.id,r]));
  const rows=checked(await admin.from('studio_brand_materials').select('id,filename,mime,object_key,metadata:extraction->metadata').eq('tenant_id',tenant).eq('campaign_id',scope).eq('state','ready').limit(500))??[];
  const materials=await Promise.all(rows.map(async r=>{const role=roles.get(r.id);const svgText=role?.role==='logo'&&r.mime==='image/svg+xml'?Buffer.from((await objectStore().get(r.object_key)).body).toString('utf8').slice(0,200000):null;return {id:r.id,filename:r.filename,mime:r.mime,role:role?.role??'unknown',sure:role?.sure??false,metadata:r.metadata as Record<string,unknown>|null,svgText};}));
  const findings:Parameters<typeof buildBrandCard>[0]=[];for(let offset=0;offset<10000;offset+=1000){const page=checked(await admin.from('studio_brand_findings').select('id,field,value,edited_value,decision,version,material_id,evidence,locator').eq('tenant_id',tenant).eq('campaign_id',scope).order('seq').range(offset,offset+999))??[];findings.push(...page);if(page.length<1000)break;}
  return json(buildBrandCard(findings,materials));
 }
 const materialId=url.searchParams.get('materialState');if(materialId){const material=checked(await admin.from('studio_brand_materials').select('id,state,error_code').eq('id',z.uuid().parse(materialId)).eq('tenant_id',tenant).eq('campaign_id',scope).maybeSingle());if(!material)throw new ApiError(404,'MATERIAL_NOT_FOUND','Brand source not found.');return json(material);}
 const ready=await admin.from('studio_brand_analyses').select('id').limit(0);if(ready.error){analysisError(schemaMissing(ready.error)?null:ready.error);return json({schemaReady:false,fields:[],analyses:[],files:[],run:null});}
 const submissionId=url.searchParams.get('submission');if(submissionId){
  const submission=checked(await admin.from('studio_brandbook_submissions').select('*').eq('id',z.uuid().parse(submissionId)).eq('tenant_id',tenant).eq('campaign_id',scope).maybeSingle());if(!submission)throw new ApiError(404,'BRANDBOOK_NOT_FOUND','Submitted brandbook not found.');
  const encoder=new TextEncoder();let after=0,buffer:{source_seq:number;payload:unknown}[]=[],finished=false,header=false;
  const stream=new ReadableStream({async pull(controller){try{if(!header){header=true;controller.enqueue(encoder.encode(JSON.stringify({submission,fields:brandFields})+'\n'));return;}if(!buffer.length&&!finished){buffer=checked(await admin.from('studio_brandbook_submission_items').select('source_seq,payload').eq('submission_id',submission.id).gt('source_seq',after).order('source_seq').limit(100))??[];finished=buffer.length<100;}const row=buffer.shift();if(row){after=row.source_seq;controller.enqueue(encoder.encode(JSON.stringify(row.payload)+'\n'));}else controller.close();}catch(error){controller.error(error);}}});return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Content-Disposition':`attachment; filename="brandbook-v${submission.version_no}.ndjson"`,'Cache-Control':'private, no-store'}});
 }
 const field=url.searchParams.get('field');if(field){z.enum(brandFieldKeys).parse(field);const after=z.coerce.number().int().nonnegative().parse(url.searchParams.get('after')??0);const findings=checked(await admin.from('studio_brand_findings').select('*,material:studio_brand_materials(relative_path)').eq('tenant_id',tenant).eq('campaign_id',campaign.id).eq('field',field).gt('seq',after).order('seq').limit(100))??[];const visualSources:BrandVisualSource[]=[];
  for(let offset=0;;offset+=1000){const page=checked(await admin.from('studio_brand_materials').select('id,relative_path').eq('tenant_id',tenant).eq('campaign_id',campaign.id).eq('state','ready').order('id').range(offset,offset+999))??[];visualSources.push(...page.filter(m=>/\.(svg|png|jpe?g|webp|gif|avif|bmp|tiff?)$/i.test(m.relative_path)));if(page.length<1000)break;}
  return json({findings,visualSources,next:findings.length===100?findings.at(-1)?.seq:null});}
 if(url.searchParams.has('export')){
  const encoder=new TextEncoder();let after=0,buffer:Record<string,unknown>[]=[],finished=false,header=false;
  const stream=new ReadableStream({async pull(controller){try{if(!header){header=true;controller.enqueue(encoder.encode(JSON.stringify({catalog:fieldCatalogVersion,fields:brandFields,campaignId:campaign.id})+'\n'));return;}if(!buffer.length&&!finished){buffer=checked(await admin.from('studio_brand_findings').select('*,material:studio_brand_materials(relative_path)').eq('tenant_id',tenant).eq('campaign_id',campaign.id).gt('seq',after).order('seq').limit(100))??[];finished=buffer.length<100;}const finding=buffer.shift();if(finding){after=Number(finding.seq);controller.enqueue(encoder.encode(JSON.stringify(finding)+'\n'));}else controller.close();}catch(error){controller.error(error);}}});return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="brand-kit-findings.ndjson"','Cache-Control':'private, no-store'}});
 }
 const brandOptions=await brandSourceOptions(admin,tenant,campaign.id);
 if(scope!==campaign.id){
  const source=checked(await admin.from('campaigns').select('id,name,brand').eq('id',scope).eq('tenant_id',tenant).single()),head=checked(await admin.from('studio_brandbook_heads').select('submission_id').eq('campaign_id',scope).maybeSingle());
  const submission=head?checked(await admin.from('studio_brandbook_submissions').select('id,version_no,created_at,is_partial,sha256,summary').eq('id',head.submission_id).eq('tenant_id',tenant).eq('campaign_id',scope).single()):null;
  return json({schemaReady:true,workspaceReady:true,updatesReady:true,submission,usage:null,fields:[],analyses:[],files:[],run:null,brandSource:source,brandOptions});
 }
 const analyses=checked(await admin.from('studio_brand_analyses').select('*').eq('tenant_id',tenant).eq('campaign_id',campaign.id).order('created_at',{ascending:false}).limit(30))??[],ids=analyses.map(a=>a.id);
 const files:BrandAnalysisView['files']=[];if(ids.length)for(let offset=0;;offset+=1000){const page=checked(await admin.from('studio_brand_file_progress').select('*').in('analysis_id',ids).order('analysis_id').order('position').order('id').range(offset,offset+999))??[];files.push(...page);if(page.length<1000)break;}
 const counts=checked(await admin.rpc('studio_brand_field_counts',{target_campaign:campaign.id}))??[];
 const c1=checked(await admin.from('studio_c1_checkpoints').select('run_id').eq('tenant_id',tenant).eq('campaign_id',campaign.id).maybeSingle()),preparation=checked(await admin.from('studio_brand_intake_runs').select('run_id').eq('campaign_id',campaign.id).maybeSingle());
 const runId=analyses.find(a=>!['completed','cancelled'].includes(a.status))?.run_id??c1?.run_id??preparation?.run_id;
 const run=runId?checked(await admin.from('studio_runs').select('cap_micro_usd,charged_micro_usd,reserved_micro_usd').eq('id',runId).eq('tenant_id',tenant).single()):null;
 const update=await admin.from('studio_brandbook_submissions').select('id').limit(0);if(update.error&&!schemaMissing(update.error))analysisError(update.error);const workspaceReady=!update.error;
 const improvements=await admin.from('studio_brandbook_brief_prefills').select('submission_id').limit(0);if(improvements.error&&!schemaMissing(improvements.error))analysisError(improvements.error);const updatesReady=!improvements.error;
 const head=workspaceReady?checked(await admin.from('studio_brandbook_heads').select('submission_id').eq('campaign_id',campaign.id).maybeSingle()):null;
 const submission=head?checked(await admin.from('studio_brandbook_submissions').select('id,version_no,created_at,is_partial,sha256,summary').eq('id',head.submission_id).eq('tenant_id',tenant).eq('campaign_id',campaign.id).single()):null;
 const steps:BrandUsageRow[]=[];if(runId)for(let offset=0;;offset+=1000){const rows=checked(await admin.from('studio_agent_steps').select('role,status,cost_micro_usd,reserve_micro_usd,usage,maxOutputTokens:config_snapshot->maxOutputTokens,pricing:config_snapshot->pricing').eq('tenant_id',tenant).eq('run_id',runId).order('created_at',{ascending:false}).order('id').range(offset,offset+999))??[];steps.push(...rows as BrandUsageRow[]);if(rows.length<1000)break;}
 const materials=await materialRoleRows(campaign.id),byId=new Map(materials.map(m=>[m.id,{file:m.filename,role:m.role}]));
 const choiceRows=checked(await admin.from('studio_brand_findings').select('id,field,value,edited_value,decision,version,material_id').eq('tenant_id',tenant).eq('campaign_id',campaign.id).in('field',[...singleChoiceFields]).limit(2000))??[];
 const decisions=brandDecisions(choiceRows,id=>byId.get(id));
 // First findings of each field for the collapsed cards (bounded; a field with more is opened for the rest).
 const previewRows=checked(await admin.from('studio_brand_findings').select('field,value,edited_value,decision').eq('tenant_id',tenant).eq('campaign_id',campaign.id).neq('decision','reject').order('seq').limit(3000))??[],previews=fieldPreviews(previewRows,singleChoiceFields);
 return json({schemaReady:true,workspaceReady,updatesReady,submission,materials,decisions,usage:run?brandWorkspaceMetrics(run,steps):null,fields:brandFields.map(([key,label,merge])=>({key,label,merge,count:counts.find((c:{field:string})=>c.field===key)?.count??0,kept:counts.find((c:{field:string})=>c.field===key)?.kept??0,unreviewed:counts.find((c:{field:string})=>c.field===key)?.unreviewed,rejected:counts.find((c:{field:string})=>c.field===key)?.rejected,preview:previews.get(key)??[]})),analyses,brandSource:null,brandOptions,files:files.map(f=>({...f,status:f.status==='completed'||f.status==='skipped'?f.status:analyses.find(a=>a.id===f.analysis_id)?.status==='active'?f.status:analyses.find(a=>a.id===f.analysis_id)?.status??f.status})),run});
});}
export async function POST(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/brand-fields'>){return api(async()=>{
 const campaign=await campaignRecord((await ctx.params).id),{admin,tenant,actorId}=await studioContext(),input=await body(request,commands,1000000);
 if(input.action==='useBrand'){const result=await admin.rpc('studio_set_brand_source',{target_campaign:campaign.id,source_campaign:input.sourceCampaignId,acting_user:actorId});if(result.error){if(schemaMissing(result.error)||/studio_set_brand_source/.test(result.error.message))throw new ApiError(503,'BRAND_SOURCE_SCHEMA_REQUIRED','Apply migration 20261102000200_brand_source first.');const known:Record<string,string>={A1_ALREADY_ACCEPTED:'This campaign already accepted its Brand Kit; its brand can no longer change.',BRANDBOOK_REQUIRED:'That campaign has no submitted brandbook yet.',BRAND_SOURCE_IS_NOT_A_BRAND:'That campaign itself uses another brand; choose the original.',CAMPAIGN_IS_A_BRAND_SOURCE:'Other campaigns use this campaign as their brand.',INVALID_BRAND_SOURCE:'Choose a brand from this workspace.'};const code=Object.keys(known).find(k=>result.error!.message.includes(k));throw new ApiError(409,code??'BRAND_SOURCE_FAILED',code?known[code]:'The brand could not be changed.');}return json({message:input.sourceCampaignId?'This campaign now uses the chosen brand. Its brandbook is read from there.':'This campaign uses its own brandbook again.'});}
 if(input.action==='setRole'){
  if(await brandScope(campaign.id)!==campaign.id)throw new ApiError(409,'BRAND_FROM_SOURCE','This campaign uses a brand from the library. Edit that brand instead.');
  const material=checked(await admin.from('studio_brand_materials').select('id').eq('id',input.materialId).eq('tenant_id',tenant).eq('campaign_id',campaign.id).maybeSingle());if(!material)throw new ApiError(404,'MATERIAL_NOT_FOUND','File not found in this brand.');
  const reject=input.role&&input.role!=='unknown'?fieldsOutsideRole(input.role):[];
  const result=await admin.rpc('studio_set_brand_material_role',{target_material:input.materialId,material_role:input.role,reject_fields:reject,acting_user:actorId});
  if(result.error){if(input.role==='uikit'&&/INVALID_MATERIAL_ROLE|role_check/.test(result.error.message))throw new ApiError(503,'MATERIAL_ROLE_SCHEMA_REQUIRED','Apply migration 20261103000100_brand_uikit_components first.');if(/studio_set_brand_material_role|schema cache/.test(result.error.message))throw new ApiError(503,'MATERIAL_ROLE_SCHEMA_REQUIRED','Apply migration 20261102000300_brand_material_roles first.');analysisError(result.error);}
  const n=Number(result.data??0);return json({message:`Saved.${n?` ${n} unreviewed ${n===1?'finding':'findings'} this kind of file cannot state ${n===1?'was':'were'} excluded; you can bring any back.`:''} Files read from now on use this role.`});
 }
 if(input.action==='buildSheet'){
  const scope=await brandScope(campaign.id);
  if(!await requestBrandSheet(admin,scope,actorId))throw new ApiError(409,'BRAND_SHEET_UNAVAILABLE','Submit the brandbook first. If it is submitted, apply migration 20261103000200_brand_sheet in Settings.');
  await startLocalWorkflow();return json({message:'Building the brand sheet. It appears here in about a minute.'});
 }
 if(input.action!=='review'&&await brandScope(campaign.id)!==campaign.id)throw new ApiError(409,'BRAND_FROM_SOURCE','This campaign uses a brand from the library. Edit that brand, or stop using it here first.');
 if(input.action==='review'){
  const finding=checked(await admin.from('studio_brand_findings').select('id').eq('id',input.findingId).eq('tenant_id',tenant).eq('campaign_id',campaign.id).maybeSingle());if(!finding)throw new ApiError(404,'FINDING_NOT_FOUND','Finding not found in this campaign.');
  const result=await admin.rpc('studio_review_brand_finding',{target_finding:input.findingId,expected_version:input.expectedVersion,decision:input.decision,edited_value:input.editedValue,acting_user:actorId});analysisError(result.error);return json({version:result.data,message:'Field decision saved to Supabase. Original extracted evidence is retained.'});
 }
 if(input.action==='submit'||input.action==='prefill'||input.action==='startSelected'){
  const ready=await admin.from('studio_brandbook_brief_prefills').select('submission_id').limit(0);if(ready.error&&schemaMissing(ready.error))throw new ApiError(503,'BRANDBOOK_UPDATES_REQUIRED','Enable Brandbook updates in Settings to fill the brief and analyze individual sources.');analysisError(ready.error);
 }
 if(input.action==='submit'||input.action==='prefill'){
  let submission;
  if(input.action==='submit'){const result=await admin.rpc('studio_submit_brandbook',{target_campaign:campaign.id,request_key:input.requestId,acting_user:actorId});analysisError(result.error);submission=result.data;
   // Every submission gets its brand sheet; a missing migration only means no sheet yet.
   if(await requestBrandSheet(admin,campaign.id,actorId).catch(()=>false))await startLocalWorkflow().catch(()=>undefined);}
  else {const head=checked(await admin.from('studio_brandbook_heads').select('submission_id').eq('campaign_id',campaign.id).maybeSingle());submission=head?checked(await admin.from('studio_brandbook_submissions').select('id,created_at,version_no,is_partial').eq('id',head.submission_id).eq('tenant_id',tenant).eq('campaign_id',campaign.id).single()):null;if(!submission)throw new ApiError(409,'BRANDBOOK_REQUIRED','Submit your current brandbook first.');}
  const prefill=await prefillBrandbookBrief(campaign,submission);
  const message=prefill.fixed?'C1 is already submitted; its questionnaire stays fixed.':`${prefill.filled.length} unanswered brief ${prefill.filled.length===1?'field':'fields'} filled from saved evidence.${prefill.conflicts.length?` ${prefill.conflicts.length} conflicting answers left for review.`:''} Existing answers and approvals are unchanged.`;
  return json({message:`${input.action==='submit'?`Brandbook version ${submission.version_no} submitted. `:''}${message}`,submission,prefill},input.action==='submit'?201:200);
 }
 requireLocalDevice();
 if(input.action==='startSelected'){
  const run=await admin.rpc('studio_intake_run',{target_campaign:campaign.id,cap:input.runCap,acting_user:actorId});analysisError(run.error);
  const result=await admin.rpc('studio_start_selected_brand_analysis',{target_campaign:campaign.id,request_key:input.requestId,request_cap:input.requestCap,material_ids:[...new Set(input.materialIds)].sort(),acting_user:actorId});analysisError(result.error);if(result.data.status==='active')await startLocalWorkflow();return json({message:result.data.status==='completed'?'This source has already been processed. Saved findings are retained.':'Only the selected new source is queued. Earlier findings, charges and unfinished work are retained.',analysisId:result.data.id},202);
 }
 if(input.action==='continue'){
  const analysis=checked(await admin.from('studio_brand_analyses').select('id').eq('id',input.analysisId).eq('tenant_id',tenant).eq('campaign_id',campaign.id).maybeSingle());if(!analysis)throw new ApiError(404,'ANALYSIS_NOT_FOUND','Analysis not found.');
  const result=await admin.rpc('studio_continue_brand_analysis',{target_analysis:input.analysisId,request_cap:input.requestCap,acting_user:actorId});analysisError(result.error);await startLocalWorkflow();return json({message:'Continuing from the saved position. Earlier findings and charges are retained.'},202);
 }
 if(input.action==='start'){
  const run=await admin.rpc('studio_intake_run',{target_campaign:campaign.id,cap:input.runCap,acting_user:actorId});analysisError(run.error);
  const result=await admin.rpc('studio_start_brand_analysis',{target_campaign:campaign.id,request_key:input.requestId,request_cap:input.requestCap,acting_user:actorId});analysisError(result.error);if(result.data.status==='active')await startLocalWorkflow();return json({message:result.data.status==='completed'?'All included files have already been analyzed. Saved findings remain available.':'File-by-file analysis queued. Each response is saved before the next request.',analysisId:result.data.id},202);
 }
 const analysis=checked(await admin.from('studio_brand_analyses').select('id').eq('id',input.analysisId).eq('tenant_id',tenant).eq('campaign_id',campaign.id).maybeSingle());if(!analysis)throw new ApiError(404,'ANALYSIS_NOT_FOUND','Analysis not found.');
 const result=await admin.rpc('studio_control_brand_analysis',{target_analysis:input.analysisId,command:input.action,acting_user:actorId,request_cap:input.requestCap??null});analysisError(result.error);if(input.action==='resume'||input.action==='skip')await startLocalWorkflow();return json({message:input.action==='pause'?'Analysis pauses after the current admitted request. Saved findings remain available.':input.action==='cancel'?'Remaining work cancelled. Completed findings and charges are retained.':'Analysis resumed from the next unfinished part.'});
});}

/** Brands in this workspace: campaigns with a submitted brandbook that do not themselves borrow another brand. */
async function brandSourceOptions(admin:Awaited<ReturnType<typeof studioContext>>['admin'],tenant:string,self:string){
 const heads=await admin.from('studio_brandbook_heads').select('campaign_id');if(heads.error)return [];
 const ids=[...new Set((heads.data??[]).map(h=>h.campaign_id as string))].filter(id=>id!==self);if(!ids.length)return [];
 const rows=await admin.from('campaigns').select('id,name,brand,brand_source_campaign_id').eq('tenant_id',tenant).in('id',ids);if(rows.error)return [];
 return (rows.data??[]).filter(r=>!r.brand_source_campaign_id).map(r=>({id:r.id as string,name:r.name as string,brand:r.brand as string}));
}

