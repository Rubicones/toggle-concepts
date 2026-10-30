import {prefillBrandbookBrief} from '@/lib/server/brandbook-brief';
import type {BrandVisualSource} from '@/packages/brand/finding-presentation';
import {brandWorkspaceMetrics,type BrandUsageRow} from '@/packages/brand/workspace-metrics';
import {z} from 'zod';
import {api,body,json,ApiError} from '@/lib/server/api';
import {campaignRecord,studioContext,checked} from '@/lib/server/studio';
import {schemaMissing} from '@/lib/server/brief';
import {brandFields,brandFieldKeys,type BrandAnalysisView} from '@/packages/brand/field-extraction';
import {startLocalWorkflow,requireLocalDevice} from '@/lib/server/local-compute';
const commands=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('submit'),requestId:z.uuid()}),
 z.strictObject({action:z.literal('prefill')}),
 z.strictObject({action:z.literal('startSelected'),requestId:z.uuid(),materialIds:z.array(z.uuid()).min(1),requestCap:z.number().int().min(100).max(10000000),runCap:z.number().int().min(10000).max(10000000)}),
 z.strictObject({action:z.literal('continue'),analysisId:z.uuid(),requestCap:z.number().int().min(100).max(10000000)}),
 z.strictObject({action:z.literal('start'),requestId:z.uuid(),requestCap:z.number().int().min(100).max(10000000),runCap:z.number().int().min(10000).max(10000000)}),
 z.strictObject({action:z.enum(['pause','resume','cancel','skip']),analysisId:z.uuid(),requestCap:z.number().int().min(100).max(10000000).optional()}),
 z.strictObject({action:z.literal('review'),findingId:z.uuid(),expectedVersion:z.number().int().positive(),decision:z.enum(['unreviewed','keep','reject']),editedValue:z.string().nullable()}),
]);
function analysisError(error:{code?:string;message:string}|null){if(!error)return;if(schemaMissing(error))throw new ApiError(503,'BRAND_FIELDS_SCHEMA_REQUIRED','Enable the required Brand Kit update in Settings. Submission and continuation use migration 014.');const messages:Record<string,string>={SOURCE_ALREADY_QUEUED:'This source already has saved work. Continue its existing analysis to retain its exact position.',INTAKE_BUILD_ACTIVE:'A source is currently being read. Wait for it to finish, then analyze the new notes only.',NO_BRAND_FINDINGS:'Collect or keep at least one finding before submitting the brandbook.',ANALYSIS_EXISTS:'An analysis already exists. Resume it to retain its budget and saved findings.',MATERIALS_NOT_READY:'Finish file reading or explicitly exclude unreadable files before analysis.',REVIEW_REQUIRED:'This part has an uncertain or invalid result. Saved findings are retained; inspect its activity before another paid request.',STALE_FINDING:'This finding changed. Reload before saving your decision.',RUN_NOT_ACTIVE:'The run is closed. Saved findings remain available; reconcile unknown charges before continuing.',RUN_CAP_REACHED:'The analysis budget is exhausted. All completed findings remain saved.',STEP_CAP_REACHED:'The cumulative brand-agent allowance is exhausted. All completed findings remain saved.'};const code=Object.keys(messages).find(c=>error.message.includes(c));if(code)throw new ApiError(409,code,messages[code]);throw new Error(error.message);}
export async function GET(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/brand-fields'>){return api(async()=>{
 const campaign=await campaignRecord((await ctx.params).id),{admin,tenant}=await studioContext(),url=new URL(request.url);
 const materialId=url.searchParams.get('materialState');if(materialId){const material=checked(await admin.from('studio_brand_materials').select('id,state,error_code').eq('id',z.uuid().parse(materialId)).eq('tenant_id',tenant).eq('campaign_id',campaign.id).maybeSingle());if(!material)throw new ApiError(404,'MATERIAL_NOT_FOUND','Brand source not found.');return json(material);}
 const ready=await admin.from('studio_brand_analyses').select('id').limit(0);if(ready.error){analysisError(schemaMissing(ready.error)?null:ready.error);return json({schemaReady:false,fields:[],analyses:[],files:[],run:null});}
 const submissionId=url.searchParams.get('submission');if(submissionId){
  const submission=checked(await admin.from('studio_brandbook_submissions').select('*').eq('id',z.uuid().parse(submissionId)).eq('tenant_id',tenant).eq('campaign_id',campaign.id).maybeSingle());if(!submission)throw new ApiError(404,'BRANDBOOK_NOT_FOUND','Submitted brandbook not found.');
  const encoder=new TextEncoder();let after=0,buffer:{source_seq:number;payload:unknown}[]=[],finished=false,header=false;
  const stream=new ReadableStream({async pull(controller){try{if(!header){header=true;controller.enqueue(encoder.encode(JSON.stringify({submission,fields:brandFields})+'\n'));return;}if(!buffer.length&&!finished){buffer=checked(await admin.from('studio_brandbook_submission_items').select('source_seq,payload').eq('submission_id',submission.id).gt('source_seq',after).order('source_seq').limit(100))??[];finished=buffer.length<100;}const row=buffer.shift();if(row){after=row.source_seq;controller.enqueue(encoder.encode(JSON.stringify(row.payload)+'\n'));}else controller.close();}catch(error){controller.error(error);}}});return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Content-Disposition':`attachment; filename="brandbook-v${submission.version_no}.ndjson"`,'Cache-Control':'private, no-store'}});
 }
 const field=url.searchParams.get('field');if(field){z.enum(brandFieldKeys).parse(field);const after=z.coerce.number().int().nonnegative().parse(url.searchParams.get('after')??0);const findings=checked(await admin.from('studio_brand_findings').select('*,material:studio_brand_materials(relative_path)').eq('tenant_id',tenant).eq('campaign_id',campaign.id).eq('field',field).gt('seq',after).order('seq').limit(100))??[];const visualSources:BrandVisualSource[]=[];
  for(let offset=0;;offset+=1000){const page=checked(await admin.from('studio_brand_materials').select('id,relative_path').eq('tenant_id',tenant).eq('campaign_id',campaign.id).eq('state','ready').order('id').range(offset,offset+999))??[];visualSources.push(...page.filter(m=>/\.(svg|png|jpe?g|webp|gif|avif|bmp|tiff?)$/i.test(m.relative_path)));if(page.length<1000)break;}
  return json({findings,visualSources,next:findings.length===100?findings.at(-1)?.seq:null});}
 if(url.searchParams.has('export')){
  const encoder=new TextEncoder();let after=0,buffer:Record<string,unknown>[]=[],finished=false,header=false;
  const stream=new ReadableStream({async pull(controller){try{if(!header){header=true;controller.enqueue(encoder.encode(JSON.stringify({catalog:'brand-fields-v1',fields:brandFields,campaignId:campaign.id})+'\n'));return;}if(!buffer.length&&!finished){buffer=checked(await admin.from('studio_brand_findings').select('*,material:studio_brand_materials(relative_path)').eq('tenant_id',tenant).eq('campaign_id',campaign.id).gt('seq',after).order('seq').limit(100))??[];finished=buffer.length<100;}const finding=buffer.shift();if(finding){after=Number(finding.seq);controller.enqueue(encoder.encode(JSON.stringify(finding)+'\n'));}else controller.close();}catch(error){controller.error(error);}}});return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Content-Disposition':'attachment; filename="brand-kit-findings.ndjson"','Cache-Control':'private, no-store'}});
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
 return json({schemaReady:true,workspaceReady,updatesReady,submission,usage:run?brandWorkspaceMetrics(run,steps):null,fields:brandFields.map(([key,label,merge])=>({key,label,merge,count:counts.find((c:{field:string})=>c.field===key)?.count??0,kept:counts.find((c:{field:string})=>c.field===key)?.kept??0,unreviewed:counts.find((c:{field:string})=>c.field===key)?.unreviewed,rejected:counts.find((c:{field:string})=>c.field===key)?.rejected})),analyses,files:files.map(f=>({...f,status:f.status==='completed'||f.status==='skipped'?f.status:analyses.find(a=>a.id===f.analysis_id)?.status==='active'?f.status:analyses.find(a=>a.id===f.analysis_id)?.status??f.status})),run});
});}
export async function POST(request:Request,ctx:RouteContext<'/api/studio/campaigns/[id]/brand-fields'>){return api(async()=>{
 const campaign=await campaignRecord((await ctx.params).id),{admin,tenant,actorId}=await studioContext(),input=await body(request,commands,1000000);
 if(input.action==='review'){
  const finding=checked(await admin.from('studio_brand_findings').select('id').eq('id',input.findingId).eq('tenant_id',tenant).eq('campaign_id',campaign.id).maybeSingle());if(!finding)throw new ApiError(404,'FINDING_NOT_FOUND','Finding not found in this campaign.');
  const result=await admin.rpc('studio_review_brand_finding',{target_finding:input.findingId,expected_version:input.expectedVersion,decision:input.decision,edited_value:input.editedValue,acting_user:actorId});analysisError(result.error);return json({version:result.data,message:'Field decision saved to Supabase. Original extracted evidence is retained.'});
 }
 if(input.action==='submit'||input.action==='prefill'||input.action==='startSelected'){
  const ready=await admin.from('studio_brandbook_brief_prefills').select('submission_id').limit(0);if(ready.error&&schemaMissing(ready.error))throw new ApiError(503,'BRANDBOOK_UPDATES_REQUIRED','Enable Brandbook updates in Settings to fill the brief and analyze individual sources.');analysisError(ready.error);
 }
 if(input.action==='submit'||input.action==='prefill'){
  let submission;
  if(input.action==='submit'){const result=await admin.rpc('studio_submit_brandbook',{target_campaign:campaign.id,request_key:input.requestId,acting_user:actorId});analysisError(result.error);submission=result.data;}
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
