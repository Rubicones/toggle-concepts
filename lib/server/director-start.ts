import 'server-only';
import {draftLineage,isCurrentDraftBlock,matchesDraftLineage,draftWorkProgress} from '@/packages/director/draft-lineage';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {draftContext} from './drafts';
import {checked} from './studio';
import {ApiError} from './api';
import {approveDirectorQuote} from './director';
import {effectiveRunAgents} from '@/packages/data/run-limits';
import {modelCatalog} from '@/packages/agents/catalog';
import {quoteImage} from '@/packages/agents/image-provider';
import {providerJsonSchema} from '@/packages/director/provider-schema';
import {directorTask} from '@/packages/director/design-attempts';
import {textRequestQuote} from '@/packages/agents/text-quote';
import {staticDirectorPrompt as directorPrompt} from '@/packages/agents/prompts/director-v1';
import {imageAspectRatios} from '@/packages/contracts/image-generation';
import {readPlanningDirections,readPlanningLocalization,selectPlanningJob,localizationForDirection} from '@/packages/director/planning';
import {buildCreativeHandoff,withCreativeHandoff} from '@/packages/director/creative-handoff';
import {createMaterialMemory} from '@/packages/director/material-memory';
import {slimDirectorInput} from '@/packages/director/inputs';
import {compactDraftRequest,draftRequestCap} from '@/packages/director/request-size';
import {sourceFilename,approvedBrandModule,approvedScenes,directorFormats,variantFacts,type BrandMaterial,type ApprovedLocalization} from '@/packages/director/inputs';
import {digest,requestId,estimateLiveDirection,roleNames,type Estimate} from '@/packages/director/money';
import type {DirectionInput,BrandKit,Variant} from '@/packages/director/types';
import type {BlockSnapshot} from '@/packages/director/state';
import {staticRoleInstructions as directorRoleInstructions,directorRoleLabels,staticOutputCaps} from '@/packages/director/roles';
import {synthesisPermitted} from '@/packages/director/resources';
function priced<T>(estimate:()=>T){try{return estimate();}catch(error){const code=error instanceof Error?error.message:'';if(code==='ESTIMATE_EXCEEDS_RUN_LIMIT')throw new ApiError(409,code,'One direction would cost more than the $100 limit of a run with these models. Choose less expensive models for the creative roles in Settings → Agents.');if(code==='MODEL_PRICE_UNAVAILABLE')throw new ApiError(409,code,'The provider did not publish a price for one of the creative models. Choose another model in Settings → Agents.');throw error;}}
function schema(error:{code?:string;message:string}|null){if(!error)return;if(['42P01','PGRST202','PGRST205','42883'].includes(error.code??''))throw new ApiError(503,'M08_SCHEMA_REQUIRED','The director workspace is not enabled yet. Apply the supplied M08 migrations.');throw new ApiError(409,'DIRECTOR_ADMISSION_FAILED',error.message.slice(0,300));}
/** Free planning output and brand data are checked before any price is shown; each stop says what to fix. */
function plainStartError(error:unknown,index:number):Error{
 if(error instanceof ApiError||!(error instanceof Error))return error as Error;
 const detail=(error as Error&{detail?:string}).detail,n=`Direction ${index+1}`;
 const messages:Record<string,string>={
  PLANNING_SOURCE_AMBIGUOUS:`${n}: more than one current planning source is selected. Refresh the planning revisions before starting. Nothing was charged.`,
  PLANNING_INPUT_TOO_LARGE:`${n}: a planning source exceeds the local evidence-reader limit. Shorten or partition it before starting. Nothing was charged.`,
  PLANNING_TREATMENT_UNBOUND:`${n}: ${detail??'the visual treatment is not linked to this scenario.'} Request a Visual direction correction. Nothing was charged.`,
  PLANNING_DIRECTION_AMBIGUOUS:`${n}: a planning record points to different directions. Request a Visual direction correction. Nothing was charged.`,
  LOCALIZATION_DUPLICATE_COPY_SLOT:`${n}: conflicting copy rows share the same binding and slot. Request a Localization correction. Nothing was charged.`,
  LOCALIZATION_BINDING_MISMATCH:`${n}: the saved copy has an invalid variant or language binding. Request a Localization correction. Nothing was charged.`,
  REQUIRED_REFERENCE_IMAGE_CAP:`${n}: the selected treatment requires more than six source images in one request. Narrow its references before starting. Nothing was charged.`,
  APPROVED_STORYBOARD_REQUIRED:`${n}: the approved storyboard ${detail??'could not be read'}. Request a Scenarios correction on the run page. Nothing was charged.`,
  APPROVED_LOCALIZED_SCENE_COPY_REQUIRED:`${n}: ${detail??'an ordered language variant has no localized on-screen line for one of the scenes.'} Request a Localization correction on the run page. Nothing was charged.`,
  AMBIGUOUS_LOCALIZED_SCENE_COPY:`${n}: more than one approved on-screen line is bound to the same scene and variant. Request a Localization correction to resolve the conflict. Nothing was charged.`,
  APPROVED_VARIANT_COPY_REQUIRED:`${n}: an ordered variant has no approved copy. Request a Localization correction on the run page. Nothing was charged.`,
  AMBIGUOUS_ORDERED_VARIANTS:`${n}: two ordered variants have the same format, language, hook, CTA and length but different copy. Check the ordered variants in the brief.`,
  APPROVED_FONT_FILES_REQUIRED:'The approved brand kit has no font files. Add the brand font (or allow the draft fallback font) in the brand step.',
  APPROVED_LOGO_FILE_REQUIRED:'The approved brand kit has no logo file. Add the logo in the brand step.',
  APPROVED_LOGO_CLEAR_SPACE_REQUIRED:'The logo clear-space rule in the brand kit is not a number of pixels. Fix it in the brand step.',
  APPROVED_CONTRAST_VALUE_REQUIRED:'The minimum contrast rule in the brand kit is not a number between 1 and 21. Fix it in the brand step.',
  DRAFT_REQUEST_SIZE_CAP:`${n}: the required draft material still exceeds the request limit after compaction. Shorten the source summaries before trying again. Nothing was charged.`,
 };
 return new ApiError(409,error.message.split(':')[0].slice(0,60)||'DIRECTOR_INPUT_INVALID',messages[error.message]??`${n} could not be prepared (${error.message.slice(0,200)}). Nothing was charged.`);
}
/** directions: build only the first N ordered directions (e.g. one for a cheaper test); omitted = all ordered. */
export async function directorStart(campaignId:string,approval?:{quoteId:string;maxCostMicroUsd:number},rebuild=false,directionLimit?:number){
 const saved=await draftContext(campaignId),protocol=await saved.admin.rpc('studio_director_protocol_version');schema(protocol.error);if(protocol.data!=='director@1')throw new ApiError(503,'M08_SCHEMA_REQUIRED','Enable the director workspace before starting a new draft.');
 const sizePolicy=await saved.admin.rpc('studio_draft_request_policy_version');if(sizePolicy.error||sizePolicy.data!=='draft-size@2')throw new ApiError(503,'DRAFT_SIZE_SCHEMA_REQUIRED','Apply migration 058 to align the worker and database request limits, then retry. No new allowance is needed for this update.');
 const sourceHash=digest({round:saved.round.id,a1:saved.round.a1_id,context:{scope:saved.context.scope,manifest:saved.context.manifest,submittedBrief:saved.context.submittedBrief,brand:saved.context.brand},planning:saved.jobs.filter(j=>['research','strategy','variants','script','localization','asset-plan'].includes(j.job_key)).map(j=>({id:j.id,hash:j.output_hash,contentHash:digest(j.output)}))});
 const blocks=checked(await saved.admin.from('studio_director_blocks').select('*').eq('round_id',saved.round.id).eq('tenant_id',saved.tenant).order('created_at',{ascending:false}))??[];
 const lineage=draftLineage(saved.round,saved.jobs);
 if(approval){const quoted=blocks.find(b=>b.quote_hash===approval.quoteId);if(!quoted||!matchesDraftLineage(quoted.snapshot,lineage)||quoted.snapshot.sourceHash!==sourceHash)throw new ApiError(409,'DIRECTOR_PRICE_CHANGED','The approved inputs changed. Review a current draft price.');await approveDirectorQuote(campaignId,approval.quoteId,approval.maxCostMicroUsd);return {started:true,block:quoted,message:'The approved director draft is running.'};}
 const active=blocks.find(b=>isCurrentDraftBlock(b,lineage)&&b.snapshot.sourceHash===sourceHash);if(active&&!rebuild)return {started:false,block:active,message:'Review the current draft versions below.'};
 if((saved.context.planningRefs??[]).length<6)throw new ApiError(409,'PLANNING_REQUIRED','Finish the approved campaign planning and localized copy first.');
 let planning,localization,visual,strategy,directions;
 try{planning=selectPlanningJob(saved.jobs,'script',saved.context.planningRefs);localization=selectPlanningJob(saved.jobs,'localization',saved.context.planningRefs);visual=selectPlanningJob(saved.jobs,'asset-plan',saved.context.planningRefs);strategy=selectPlanningJob(saved.jobs,'strategy',saved.context.planningRefs);directions=readPlanningDirections(planning.output);}catch(error){throw plainStartError(error,0);}
 if(directions.length<saved.context.scope.draftConceptCount)throw new ApiError(409,'APPROVED_STORYBOARD_REQUIRED',`The approved scenarios contain ${directions.length} directions but the brief orders ${saved.context.scope.draftConceptCount}. Re-run the Scenarios step from the run page.`);
 if(process.platform!=='darwin')throw new ApiError(409,'DIRECTOR_REQUIRES_STUDIO_MAC','Static drafts are built and rendered by the local worker on the studio Mac. Open the studio on that Mac to start them.');
 const agents=await effectiveRunAgents(saved.admin,saved.run),catalog=await modelCatalog(),models={} as BlockSnapshot['models'];
 // The AD's current Settings models are used for the active creative roles; their briefs are director@1 briefs (not the planning-era SceneSpec texts).
 const settings=(checked(await saved.admin.from('studio_agents').select('role,model_id').eq('tenant_id',saved.tenant).in('role',Object.values(roleNames)))??[]) as {role:string;model_id:string|null}[];
 for(const role of ['director','assembler'] as const){
  const label=directorRoleLabels[role],modelId=settings.find(a=>a.role===roleNames[role])?.model_id??agents.find(a=>a.role===roleNames[role])?.model_id,model=catalog.find(m=>m.id===modelId);
  if(!modelId)throw new ApiError(409,'AGENT_NOT_CONFIGURED',`Choose a model for “${label}” (${roleNames[role]}) in Settings → Agents, then review the price again.`);
  if(!model)throw new ApiError(409,'MODEL_UNAVAILABLE',`The model ${modelId} chosen for “${label}” is not available from the provider right now. Choose another model in Settings → Agents.`);
  if(model.outputModalities.length!==1||model.outputModalities[0]!=='text')throw new ApiError(409,'AGENT_NOT_CONFIGURED',`“${label}” needs a text model; ${model.name} returns ${model.outputModalities.join(', ')}.`);
  if(role!=='assembler'&&!model.inputModalities?.includes('image'))throw new ApiError(409,'VISION_MODEL_REQUIRED',`“${label}” must see pictures and rendered frames. ${model.name} cannot read images: choose a vision model in Settings → Agents.`);
  if(!model.supportedParameters.includes('structured_outputs'))throw new ApiError(409,'STRUCTURED_OUTPUT_MODEL_REQUIRED',`“${label}” answers in a strict format; ${model.name} does not support structured outputs on the provider. Choose another model in Settings → Agents.`);
  if(model.contextLength<64000)throw new ApiError(409,'DIRECTOR_CONTEXT_TOO_LARGE',`“${label}” needs a model with a context of at least 64k tokens; ${model.name} has ${model.contextLength}.`);
  models[role]={modelId:model.id,instructions:directorRoleInstructions[role],maxOutputTokens:Math.min(staticOutputCaps[role],model.maxOutput),modelMaxOutputTokens:model.maxOutput,pricing:{inputPrice:model.inputPrice,outputPrice:model.outputPrice,cacheReadPrice:model.cacheReadPrice,cacheWritePrice:model.cacheWritePrice},contextLength:model.contextLength,vision:model.inputModalities?.includes('image')??false};
 }
 // The stored protocol has a critic slot, but live drafts never call or price it. A dormant slot must not
 // block the two active creative roles or depend on the workspace's later motion-stage model selection.
 models.critic={...models.director,instructions:directorRoleInstructions.critic,maxOutputTokens:Math.min(staticOutputCaps.critic,models.director.modelMaxOutputTokens??staticOutputCaps.critic)};
 const kit=saved.context.brand.kit,rows=checked(await saved.admin.from('studio_brand_materials').select('id,filename,mime,sha256,object_key,extraction').eq('tenant_id',saved.tenant).eq('campaign_id',campaignId).eq('state','ready'))??[],selected=new Set([...(kit.sourceMaterialIds??[]),...kit.rules.filter(r=>r.decision==='accepted').map(r=>r.provenance.sourceId).filter(Boolean)]),materials:BrandMaterial[]=rows.filter(m=>selected.has(m.id)).map(m=>({id:m.id,filename:m.filename,mime:m.mime,sha256:m.sha256,objectKey:m.object_key,metadata:m.extraction?.metadata??{},text:m.extraction?.text}));
 if(kit.rules.some(r=>r.decision==='accepted'&&r.category==='typography'&&r.key==='draftFallback'&&r.value==='Noto Sans'))for(const name of ['noto-latin.woff2','noto-cyrillic.woff2']){const bytes=await readFile(`public/fixtures/${name}`);materials.push({id:requestId({font:name}),filename:name,mime:'font/woff2',sha256:createHash('sha256').update(bytes).digest('hex'),objectKey:`fixtures/${name}`,metadata:{family:'Noto Sans',weight:400,style:'normal'}});}
 const assets=checked(await saved.admin.from('asset_revisions').select('id,filename,mime,sha256,object_key,inspection').eq('tenant_id',saved.tenant).eq('campaign_id',campaignId))??[],assetFiles=assets.filter(a=>a.mime.startsWith('image/'));for(const asset of assetFiles.filter(a=>kit.sourceAssetIds.includes(a.id)))if(!materials.some(m=>m.id===asset.id))materials.push({id:asset.id,filename:asset.filename,mime:asset.mime,sha256:asset.sha256,objectKey:asset.object_key,metadata:{}});
 const files=[...materials,...assets.map(a=>({id:a.id,filename:a.filename,mime:a.mime,sha256:a.sha256,objectKey:a.object_key,metadata:{}}))].filter((m,i,all)=>all.findIndex(x=>x.sha256===m.sha256)===i).map(m=>({url:sourceFilename(m),objectKey:m.objectKey,sha256:m.sha256,mime:m.mime}));
 const brief=(saved.context.submittedBrief as {questionnaire?:Record<string,unknown>}).questionnaire??{},protectedCopy:Record<string,Record<string,string>>={};for(const key of ['cta','offer','legal'])if(typeof brief[key]==='string'&&brief[key])protectedCopy[key]=Object.fromEntries(saved.context.scope.locales.map(locale=>[locale,String(brief[key])]));
 let localizationRows:ApprovedLocalization[];try{localizationRows=readPlanningLocalization(localization.output,saved.context.manifest.entries);}catch(error){throw plainStartError(error,0);}
 const formats=directorFormats(saved.context.scope.placements),variants:Variant[]=saved.context.manifest.entries.map(v=>({id:v.id,format:v.placementId,locale:v.locale,hook:v.hook,cta:v.offer,length:v.durationSeconds}));variants.sort((a,b)=>Number(b.format===saved.context.scope.referencePlacement&&b.locale===saved.context.scope.referenceLocale)-Number(a.format===saved.context.scope.referencePlacement&&a.locale===saved.context.scope.referenceLocale));
 const imageAgent=agents.find(a=>a.role==='image'),imageModel=catalog.find(m=>m.id===imageAgent?.model_id);if(!imageModel?.outputModalities.includes('image'))throw new ApiError(409,'IMAGE_AGENT_REQUIRED','This run has no image model for draft pictures. Choose an image model for the image role in Settings → Agents and start a new run.');let perStill=0;for(const aspect of imageAspectRatios)perStill=Math.max(perStill,(await quoteImage(imageModel.id,aspect,imageModel.inputPrice,80000,imageModel.outputPrice,imageModel.maxOutput,undefined,{count:3,tokens:12672})).reservation);
 const blockId=randomUUID(),inputs:DirectionInput[]=[],estimates:Record<string,Estimate>={};for(const [index,direction]of directions.slice(0,Math.max(1,Math.min(saved.context.scope.draftConceptCount,directionLimit??saved.context.scope.draftConceptCount))).entries()){try{
  const directionId=requestId({roundId:saved.round.id,direction:index}),scenes=approvedScenes(direction.storyboard,directionId),copy:BrandKit['copy']={...protectedCopy,hook:{[saved.context.scope.referenceLocale]:scenes[0].copy[0]??''}};for(const row of localizationRows)copy[requestId({directionId,field:row.copySlot,variants:row.variantIds})]={[row.locale]:row.text};
  const brand=approvedBrandModule(kit,materials,copy,Object.fromEntries([...(Array.isArray(brief.facts)?brief.facts.filter(f=>f&&['confirmed','provided'].includes(f.status)).map(f=>[String(f.id),String(f.claim)]):[]),...Object.entries(brief).filter(([key])=>['product','immutables'].includes(key)||brief.priceConfirmed===true&&['price','currency','priceSource'].includes(key)).map(([key,value])=>[key,String(value)])])),input:DirectionInput={protocol:'director@1',stage:'draft',runId:saved.run.id,roundId:saved.round.id,directionId,iterationId:randomUUID(),storyboard:scenes,brand,brief:{...brief,referenceReconstructionAllowed:true,draftConstructionVersion:1,resourceBindingVersion:1,approvedDirection:direction.value,suppliedAssetMetadata:assets.map(a=>({id:a.id,name:a.filename,mime:a.mime,inspection:a.inspection})),synthesisAllowed:synthesisPermitted(String(brief.synthesis??'')),synthesisPermission:String(brief.synthesis??'')},assets:assets.map(a=>({id:a.id,url:sourceFilename(a),thumbnail:a.mime.startsWith('image/')?sourceFilename(a):'',width:a.inspection.width??0,height:a.inspection.height??0,sha256:a.sha256,mime:a.mime,revisionId:a.id})),formats,variants:[...variants].sort((a,b)=>Number(Object.hasOwn((direction.value.variantBindings??{}) as object,`hook-${b.hook}`))-Number(Object.hasOwn((direction.value.variantBindings??{}) as object,`hook-${a.hook}`))),resourceIds:Array.from({length:4},(_,i)=>requestId({directionId,resource:i})),variantFacts:variantFacts({variants,scenes,directionIndex:index,sourceDirections:directions,referenceLocale:saved.context.scope.referenceLocale,localization:localizationForDirection(localizationRows,direction,directions),protectedCopy})};
  input.materialMemory=createMaterialMemory(input);
  input.creativeHandoff=buildCreativeHandoff({brief,direction,directions,script:planning,visual,strategy,input});
  if(input.creativeHandoff.referenceAssetIds.length>6)throw new Error('REQUIRED_REFERENCE_IMAGE_CAP');
  const compact=compactDraftRequest(directorTask(directorPrompt.prompt,[]),{instructions:models.director.instructions,protocolInstructions:withCreativeHandoff(input,'director',directorPrompt.instructions),maxOutputTokens:models.director.maxOutputTokens,pricing:models.director.pricing,cachePrompt:true,requestInputCap:draftRequestCap(models.director.contextLength,models.director.maxOutputTokens),responseSchema:{name:directorPrompt.responseSchema.name,schema:providerJsonSchema(directorPrompt.responseSchema.schema) as Record<string,unknown>},campaignContext:{checkpointId:saved.round.origin_c1_id,input:slimDirectorInput(input)}},input.creativeHandoff.referenceAssetIds.map(id=>({url:'',label:id,required:true})));const bound=textRequestQuote(compact.prompt,compact.snapshot,'',compact.images.length);if(bound.inputTokenBound+models.director.maxOutputTokens>models.director.contextLength)throw new ApiError(409,'DIRECTOR_CONTEXT_TOO_LARGE','The complete brand kit and approved inputs exceed the configured director model’s context. Choose a model with enough context in a new run.');if(Buffer.byteLength(JSON.stringify(input))*2>2*1024*1024)throw new ApiError(409,'DIRECTOR_CONTEXT_TOO_LARGE','The complete approved input exceeds this worker’s source snapshot limit.');
  const estimate=priced(()=>estimateLiveDirection({director:models.director.pricing,assembler:models.assembler.pricing,critic:models.critic.pricing},perStill,input.resourceIds.length,{sourceHash,directionId}));inputs.push(input);estimates[directionId]=estimate;
 }catch(error){throw plainStartError(error,index);}}
 const snapshot:BlockSnapshot={protocol:'director@1',resourceModelId:imageModel.id,checkpointId:saved.round.origin_c1_id,a1Id:saved.round.a1_id,sourceHash,inputs,estimates,models,files,planning:saved.context.planningRefs??[]},quoteId=digest(snapshot),maximum=Object.values(estimates).reduce((s,e)=>s+e.maxCostMicroUsd,0);if(maximum>100000000)throw new ApiError(409,'ESTIMATE_EXCEEDS_RUN_LIMIT',`The maximum price for all directions ($${(maximum/1e6).toFixed(2)}) is above the $100 limit of one run. Choose less expensive models for the creative roles in Settings → Agents.`);const quoted=await saved.admin.rpc('studio_quote_director',{target_round:saved.round.id,block_id:blockId,source:snapshot,quote_hash:quoteId,max_cost:maximum,acting_user:saved.actorId});schema(quoted.error);
 const roles=Object.fromEntries((['director','resources','assembler','critic'] as const).map(role=>[role,{maxCostMicroUsd:Object.values(estimates).reduce((sum,e)=>sum+e.roles[role].maxCostMicroUsd,0)}]));return {started:false,quote:{quoteId,maxCostMicroUsd:maximum,roles,directions:inputs.length,models:Object.fromEntries((['director','assembler','critic'] as const).map(role=>[role,catalog.find(m=>m.id===models[role].modelId)?.name??models[role].modelId]))},message:`${inputs.length} direction${inputs.length===1?'':'s'}. Review the maximum price before starting: director $${(roles.director.maxCostMicroUsd/1e6).toFixed(2)}, pictures $${(roles.resources.maxCostMicroUsd/1e6).toFixed(2)}, layout/code $${(roles.assembler.maxCostMicroUsd/1e6).toFixed(2)}.`};
}
export async function directorTick(campaignId:string){
 const saved=await draftContext(campaignId),lineage=draftLineage(saved.round,saved.jobs),result=await saved.admin.from('studio_director_blocks').select('id,run_id,round_id,snapshot,status').eq('round_id',saved.round.id).eq('tenant_id',saved.tenant).neq('status','quoted').order('created_at',{ascending:false});schema(result.error);
 const blocks=(result.data??[]).filter(block=>isCurrentDraftBlock(block,lineage));
 if(!blocks.length)return {state:'review' as const,needsPrice:true,questions:[{question:'Review a new draft price to build from the current planning. Earlier previews remain saved.'}]};
 const latest=new Map<string,{status:string;question:unknown}>(),directions=new Set<string>();
 for(const block of blocks){
  const inputIds=new Set((block.snapshot as BlockSnapshot).inputs.map(i=>i.directionId));inputIds.forEach(id=>directions.add(id));
  const works=checked(await saved.admin.from('studio_director_work').select('direction_id,status,question').eq('block_id',block.id))??[];
  for(const work of works)if(inputIds.has(work.direction_id)&&!latest.has(work.direction_id))latest.set(work.direction_id,{status:work.status,question:work.question});
 }
 const progress=draftWorkProgress([...latest.values()],directions.size);
 return progress.state==='complete'?{...progress,batchId:blocks[0].id}:progress;
}
