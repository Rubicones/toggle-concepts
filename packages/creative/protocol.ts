import {validateFillValues} from './value-validation';
import {mergeCreativeFill} from './fill';
import {isEngineFinding} from './critic';
import {normalizeTreatmentRaw,normalizeScenesRaw,normalizeMediaRaw,normalizeScriptDataRaw} from './normalize';
import {z} from 'zod';
import {scriptSpecV2Schema,sourceSceneSchema,treatmentSchema,sceneSpecV2Schema,mediaPlanSchema,criticSchema,type BrandSystem,type CopyBudget,type CreativeIssue} from '../contracts/creative-drafts';
import type {CampaignScope,VariantEntry} from '../contracts/campaign';
import type {CreativeDirection} from '../contracts/frame-program';
import type {CreativeStage} from '../agents/prompts/creative-v1';
import {validateScript,validateTreatment,validateScenes,validateMedia,validateCritic,resolveCreativePath,type ProtectedCopy} from './validate';
import {repairCopyL0,repairSceneL0,normalizeScriptL0} from './repair';
import {creativePatchSchema} from '../agents/prompts/creative-repair-v1';
export type CreativeInputs={protocol?:'creative@1'|'creative@2';skeleton?:import('../contracts/creative-drafts').DirectionSkeleton;checkpointId:string;direction:number;directionId:string;brand:BrandSystem;budget:CopyBudget;scope:CampaignScope;brief?:Partial<Pick<import('../contracts/brief').BriefDraft,'product'|'offer'|'cta'|'immutables'|'synthesis'|'rights'|'facts'|'variationNotes'|'showPrice'|'price'|'currency'|'priceSource'>>;variants:VariantEntry[];protectedCopy:ProtectedCopy[];criticSceneCount?:number;mediaEstimate?:{stillCount:number;perStillMicroUsd:number;totalMicroUsd:number};assetAliases:{key:string;revisionId:string;sha256:string;mime:string;width:number;height:number;summary:string}[];repairRequest?:{slots?:string[];previousFill?:unknown;issues:CreativeIssue[];previous:unknown};};
export type CreativeResult={fill?:unknown;version:'creative-result@1';stage:CreativeStage;value:unknown;issues:CreativeIssue[];repairLog:import('../contracts/creative-drafts').CreativeRepair[]};
/** Native union objects carry nullable fields; remove only unused null transport fields. */
const kindSynonyms:[RegExp,string][]=[[/^(text|copy|headline|subhead\w*|title|caption|body|cta|label|tagline|legal|offer|hook|quote|line|price)$/,'text'],[/^(logo|wordmark|brand\w*|logotype|lockup)$/,'logo'],[/^(product|device|phone|mockup|packshot|hardware)$/,'product'],[/^(ui|screen|screenshot|interface|app|demo|feature|dashboard|editor|timeline)$/,'ui'],[/^(media|image|photo\w*|video|footage|clip|picture|still)$/,'media']];
/** Maps common synonyms of beat element kinds to the closed vocabulary; anything else becomes a graphic. */
export function normalizeElementKinds(input:unknown):unknown{
 if(!input||typeof input!=='object'||!Array.isArray((input as {beats?:unknown}).beats))return input;
 const allowed=['text','logo','product','ui','graphic','media'];
 for(const beat of (input as {beats:unknown[]}).beats){const elements=(beat as {elements?:unknown})?.elements;if(!Array.isArray(elements))continue;
  for(const element of elements){if(!element||typeof element!=='object')continue;const row=element as {kind?:unknown};if(typeof row.kind!=='string'||allowed.includes(row.kind))continue;const raw=row.kind.trim().toLowerCase().replace(/[\s-]+/g,'_');row.kind=allowed.includes(raw)?raw:kindSynonyms.find(([re])=>re.test(raw))?.[1]??'graphic';}}
 return input;
}
const keyPattern=/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,keyFields=new Set(['key','focal','beat','element','ground','reference','source']),keyLists=new Set(['beats','copyKeys']);
const cleanKey=(value:string)=>{const cleaned=value.trim().replace(/[^a-zA-Z0-9_.-]+/g,'_').replace(/^[^a-zA-Z0-9]+/,'').slice(0,120);return cleaned||'missing';};
/**
 * App-owned local keys must match a simple pattern. Models sometimes return spaces, symbols or empty strings;
 * those are cleaned here so the stage can still be parsed. Re-keying and reference checks happen afterwards.
 */
export function sanitizeLocalKeys(input:unknown):unknown{
 if(Array.isArray(input))return input.map(sanitizeLocalKeys);
 if(!input||typeof input!=='object')return input;
 const row=input as Record<string,unknown>,out:Record<string,unknown>={};
 for(const [field,value] of Object.entries(row)){
  if(keyFields.has(field)&&typeof value==='string'&&!keyPattern.test(value))out[field]=cleanKey(value);
  else if(keyLists.has(field)&&Array.isArray(value)&&value.every(v=>typeof v==='string'))out[field]=value.map(v=>keyPattern.test(v)?v:cleanKey(v));
  else out[field]=sanitizeLocalKeys(value);
 }
 // A beat without a usable focal points at its first element; the validator re-checks it.
 if(Array.isArray(out.elements)&&'focal' in out&&(typeof out.focal!=='string'||out.focal==='missing')){const first=(out.elements as {key?:unknown}[])[0]?.key;if(typeof first==='string')out.focal=first;}
 return out;
}
export function normalizeFlatRequirements(input:unknown):unknown{
 if(Array.isArray(input))return input.map(normalizeFlatRequirements);
 if(!input||typeof input!=='object')return input;
 return Object.fromEntries(Object.entries(input).map(([key,value])=>{
  if(key==='requirement'&&value&&typeof value==='object'){
   const row=value as Record<string,unknown>,allowed=row.kind==='video'?['kind','requiredDurationSeconds','trimStartSeconds','motionIntent']:row.kind==='model3d'?['kind','cameraRecipeId','boundsMeters']:Object.keys(row);
   return [key,Object.fromEntries(Object.entries(row).filter(([field,v])=>v!==null||allowed.includes(field)).map(([field,v])=>[field,normalizeFlatRequirements(v)]))];
  }
  return [key,normalizeFlatRequirements(value)];
 }));
}
/** Resolves a dotted path to its [container, property] steps; array items may be addressed by index or key. */
function steps(root:unknown,parts:string[]){
 const out:{parent:object;key:string}[]=[];let node=root;
 for(const part of parts){if(Array.isArray(node)){const index=/^\d+$/.test(part)?Number(part):node.findIndex(v=>v?.key===part||v?.id===part||v?.element===part);if(index<0||index>=node.length)break;out.push({parent:node,key:String(index)});node=node[index];}
  else if(node&&typeof node==='object'&&Object.hasOwn(node,part)){out.push({parent:node,key:part});node=(node as Record<string,unknown>)[part];}else break;}
 return out;
}
export function applyCreativePatch(previous:unknown,output:unknown,issues:CreativeIssue[]){
 const patch=creativePatchSchema.parse(output),result=structuredClone(previous);let applied=0,skipped=0;
 for(const replacement of patch.repairs){
  const parts=replacement.path.split('.');if(parts.some(p=>['__proto__','constructor','prototype'].includes(p)))throw new Error('REPAIR_PATH_OUTSIDE_ISSUE');
  // A replacement may touch any field in the same section as a reported issue. Edits elsewhere are ignored, not fatal:
  // the full stage validator (and the free L0 normalization) re-checks the whole result afterwards.
  // Paths are compared by what they point at, so `beats.b0` (key) and `beats.0` (index) are the same beat.
  const chain=steps(result,parts);
  if(!issues.some(i=>{if(['response',''].includes(i.path))return true;const target=steps(result,i.path.split('.')).at(-1);return !!target&&chain.some(step=>step.parent===target.parent&&step.key===target.key);})){skipped++;continue;}
  let target:unknown=result,found=true;
  for(const part of parts.slice(0,-1)){if(Array.isArray(target))target=/^\d+$/.test(part)?target[Number(part)]:target.find(v=>v?.key===part||v?.id===part||v?.element===part);else if(target&&typeof target==='object'&&Object.hasOwn(target,part))target=(target as Record<string,unknown>)[part];else {found=false;break;}}
  const last=parts.at(-1)!;if(!found||!target||typeof target!=='object'||(!Object.hasOwn(target,last)&&!Array.isArray(target))){skipped++;continue;}
  let value:unknown;try{value=JSON.parse(replacement.valueJson);}catch{skipped++;continue;}
  if(Array.isArray(target)&&!/^\d+$/.test(last)){const index=target.findIndex(v=>v?.key===last||v?.id===last||v?.element===last);if(index<0){skipped++;continue;}target[index]=value;}else (target as Record<string,unknown>)[last]=value;applied++;
 }
 if(!applied&&skipped)throw new Error('REPAIR_PATH_OUTSIDE_ISSUE');
 return result;
}
export function creativeTransportUpstream(upstream:{jobId:string;sha256:string;output:string}[],direction:number){
 return upstream.map(parent=>{let output:unknown;try{output=JSON.parse(parent.output);}catch{return parent;}
  const result=output as CreativeResult;
  if(result.version==='creative-result@1'){
   if(result.stage==='compile'){const value=result.value as {direction:unknown;contactFrames:unknown};output={direction:value.direction,contactFrames:value.contactFrames,sceneStrips:(result.value as {sceneStrips?:unknown}).sceneStrips};}
   else output={stage:result.stage,value:result.value};
  }else{
   // Planning output is reused, selecting the requested territory rather than
   // asking the creative role to regenerate three directions in one call.
    const select=(value:unknown):unknown=>{if(Array.isArray(value))return value.map(select);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['threeDirections','threeTerritories','treatments'].includes(key)&&Array.isArray(item)?item[direction]:select(item)]));return value;};output=select(output);
  }
  return {...parent,output:JSON.stringify(output)};
 });
}
export function upstreamValues(upstream:{output:string}[]):Partial<CreativeDirection>{
 const value:Partial<CreativeDirection>={};for(const parent of upstream){let result:CreativeResult;try{result=JSON.parse(parent.output);}catch{continue;}if(result.version==='creative-result@1'&&['script','treatment','scenes','media'].includes(result.stage))Object.assign(value,{[result.stage]:result.value});}return value;
}
/** Freeze the selected planning storyboard; a provider cannot rewrite this evidence. */
export function sourceStoryboard(upstream:{output:string}[],direction:number){
 for(const parent of upstream){let output;try{output=JSON.parse(parent.output);}catch{continue;}
  const directions=output?.deliverable?.threeDirections,selected=Array.isArray(directions)?directions[direction]:directions;
  const scenes=sourceSceneSchema.array().safeParse(selected?.timedStoryboard);
  if(scenes.success&&scenes.data.length)return scenes.data;
  if(selected?.timedStoryboard)throw new Error('SOURCE_STORYBOARD_INVALID');
 }
 return [];
}
export function prepareCreativeOutput(output:string,stage:Exclude<CreativeStage,'compile'>,input:CreativeInputs,upstream:{output:string}[]):CreativeResult{
 if(input.protocol==='creative@2'){
  try{if(new TextEncoder().encode(output).length>131072)throw new Error('OUTPUT_TOO_LARGE');const prior=upstreamValues(upstream),result=mergeCreativeFill(stage,JSON.parse(output),input,prior);result.issues.push(...validateFillValues(stage,result.value,input,prior));return result;}
  catch(error){return {version:'creative-result@1',stage,value:null,issues:[{code:'INVALID_FILL_VALUES',path:'response',owner:'ad',severity:'block',message:error instanceof Error?error.message:'Invalid JSON values.',fix:'Review the saved response and refill the issued values; never alter the skeleton.'}],repairLog:[]};}
 }
 const result:CreativeResult={version:'creative-result@1',stage,value:null,issues:[],repairLog:[]};
 try{
  if(new TextEncoder().encode(output).length>131072)throw new Error('OUTPUT_TOO_LARGE');let raw=JSON.parse(output);const prior=upstreamValues(upstream);
  if(input.repairRequest?.previous&&raw.repairs){
   // A patch that cannot be placed must not discard the saved work: fall back to the previous result,
   // which the free L0 normalization and the validator below re-check from scratch.
   try{raw=applyCreativePatch(input.repairRequest.previous,raw,input.repairRequest.issues);}
   catch(error){const code=error instanceof Error&&/^REPAIR_PATH_/.test(error.message)?error.message:'REPAIR_PATCH_INVALID';raw=structuredClone(input.repairRequest.previous);result.repairLog.push({direction:input.direction,level:'L0',path:'response',code,action:'The targeted patch did not match the saved result; kept the previous version and re-checked it.',costMicroUsd:0,attempt:0});}
  }
  raw=normalizeFlatRequirements(raw);
  raw=sanitizeLocalKeys(raw);
  if(stage==='script')raw=normalizeScriptDataRaw(normalizeElementKinds(raw));
  if(stage==='script'&&raw&&typeof raw==='object'&&!Array.isArray(raw)){raw.direction=input.direction;raw.sourceScenes=sourceStoryboard(upstream,input.direction);}
  // Kit bindings (palette, styles, compositions, zones, sources) are resolved locally before strict parsing.
  {const safe=<T,>(schema:{parse:(v:unknown)=>T},value:unknown)=>{try{return schema.parse(value);}catch{return undefined;}},priorScript=safe(scriptSpecV2Schema,prior.script),priorTreatment=safe(treatmentSchema,prior.treatment);
   if(stage==='treatment')raw=normalizeTreatmentRaw(raw,input.brand,priorScript);
   else if(stage==='scenes')raw=normalizeScenesRaw(raw,input.brand,priorScript,priorTreatment);
   else if(stage==='media')raw=normalizeMediaRaw(raw,input.brand,priorScript,input.assetAliases);}
  if(stage==='script'){const parsed=scriptSpecV2Schema.parse(raw),structural=normalizeScriptL0(parsed,input.scope,input.brand,input.protectedCopy),repaired=repairCopyL0(structural.script,input.budget,input.brand,input.protectedCopy);result.value=repaired.script;result.repairLog=[...result.repairLog,...structural.log,...repaired.log];result.issues=validateScript(repaired.script,input.brand,input.budget,input.scope,input.protectedCopy,input.variants);
   if(parsed.direction!==input.direction)result.issues.push({code:'DIRECTION_MISMATCH',severity:'block',path:'direction',owner:'script',message:'The direction number is app-owned.',fix:`Return direction ${input.direction}.`});
  }else if(stage==='treatment'){const parsed=treatmentSchema.parse(raw);result.value=parsed;result.issues=validateTreatment(parsed,scriptSpecV2Schema.parse(prior.script),input.brand);
  }else if(stage==='scenes'){const parsed=sceneSpecV2Schema.parse(raw),repaired=repairSceneL0(parsed,treatmentSchema.parse(prior.treatment),input.brand);result.value=repaired.scenes;result.repairLog=[...result.repairLog,...repaired.log];result.issues=validateScenes(repaired.scenes,scriptSpecV2Schema.parse(prior.script),input.brand);
  }else if(stage==='media'){const parsed=mediaPlanSchema.parse(raw);result.value=parsed;result.issues=validateMedia(parsed,scriptSpecV2Schema.parse(prior.script),input.brand,input.assetAliases.map(a=>a.key));
   // Map app-issued short aliases to immutable revisions only after validation.
   if(!result.issues.length){for(const row of parsed.elements){if(row.source==='asset')row.reference=input.assetAliases.find(a=>a.key===row.reference)!.revisionId;if(row.ui)row.ui.referenceRevisionId=input.assetAliases.find(a=>a.key===row.ui!.referenceRevisionId)!.revisionId;if(row.promptPack)row.promptPack.references=row.promptPack.references.map(key=>{const ref=input.assetAliases.find(a=>a.key===key);if(!ref)throw new Error('UNKNOWN_REFERENCE');return ref.revisionId;});}}
  }else{
   // Bad paths require a corrected critic response; they cannot turn blockers into a clean review.
   const rawCritic=raw as {findings?:unknown[]},roots:Record<string,string>={script:'script',treatment:'visual',scenes:'compositor',media:'media'};
   const findings=(Array.isArray(rawCritic?.findings)?rawCritic.findings:[]).map(f=>f&&typeof f==='object'?f as Record<string,unknown>:{}).map(f=>{const path=String(f.path??'').replace(/^\$\.?/,'').replace(/\[(\d+)\]/g,'.$1'),owner=roots[path.split('.')[0]]??(['code','script','visual','compositor','media','ad'].includes(String(f.owner))?String(f.owner):'ad');return {rule:String(f.rule??'note')||'note',path,owner,fix:String(f.fix??'Review this item.')||'Review this item.',severity:f.severity==='block'?'block':'warn'};});
   // Paths resolve against the direction the critic actually saw: the compiled one (scenes re-read at build time), else the saved stages.
   // A path naming something the build made up (a planner group such as together_l1_le11) is narrowed to its nearest real ancestor.
   let root:unknown=prior;for(const parent of upstream){try{const r=JSON.parse(parent.output);if(r?.version==='creative-result@1'&&r.stage==='compile'&&r.value?.direction)root=r.value.direction;}catch{/* not a result */}}
   for(const f of findings){const parts=f.path.split('.');while(parts.length>2&&!resolveCreativePath(root,parts.join('.')))parts.pop();if(parts.join('.')!==f.path&&resolveCreativePath(root,parts.join('.'))){result.repairLog.push({direction:input.direction,level:'L0',path:f.path,code:'CRITIC_PATH',action:`Narrowed to ${parts.join('.')}.`,costMicroUsd:0,attempt:0});f.path=parts.join('.');}}
   const sceneReports=criticSchema.shape.scenes.parse(raw.scenes),semantic=findings.filter(f=>!isEngineFinding(f.rule));
   for(const report of sceneReports??[]){if(isEngineFinding(report.fix))report.fix='Restore this scene’s approved visual, copy and motion. Code owns the measured geometry.';}
   for(const report of sceneReports??[])if(report.result!=='match')semantic.push({rule:`SCENE_${report.result.toUpperCase()}`,path:report.path,owner:report.owner,fix:report.fix,severity:report.result==='miss'?'block':'warn'});
   const parsed=criticSchema.parse({version:'critic@1',findings:semantic,...(sceneReports?{scenes:sceneReports}:{})});
   if(input.criticSceneCount!==undefined){const expected=(root as CreativeDirection)?.script?.sourceScenes?.map(s=>s.sceneId)??[],ids=sceneReports?.map(s=>s.sceneId)??[];
    if(ids.length!==expected.length||new Set(ids).size!==ids.length||expected.some(id=>!ids.includes(id)))result.issues.push({code:'CRITIC_SCENE_COVERAGE',severity:'block',owner:'ad',path:'scenes',message:'The one paid critic round did not return exactly one assessment per approved scene.',fix:'Review the saved response and scene evidence. Do not automatically buy another critic round.'});
   }
   for(const report of sceneReports??[])if(!resolveCreativePath(root,report.path))result.issues.push({code:'CRITIC_SCENE_PATH',severity:'block',owner:'ad',path:'scenes',message:`${report.sceneId} has no resolvable repair path.`,fix:'Correct the saved assessment path before routing its single repair.'});
   // Only a blocking finding that cannot be placed stops the review; an unplaceable warning stays visible as a note.
   result.value=parsed;result.issues.push(...parsed.findings.flatMap((f,i)=>f.severity!=='block'?[]:validateCritic({...parsed,findings:[f]},root).map(issue=>({...issue,path:`findings.${i}.path`,owner:'ad' as const,message:`The critic finding was retained but cannot be applied: ${f.rule}`,fix:'Correct its path to a real script, treatment, scenes or media field. Preserve the finding until it is resolved.'}))));}
 }catch(error){result.issues=[{code:'INVALID_CREATIVE_OUTPUT',severity:'block',path:'response',owner:stage==='script'?'script':stage==='treatment'?'visual':stage==='scenes'?'compositor':stage==='media'?'media':'visual',message:error instanceof z.ZodError?error.issues.slice(0,5).map(i=>`${i.path.join('.')}: ${i.message}`).join('; '):error instanceof Error?error.message:'Invalid creative response.',fix:'Return a complete object matching this stage’s native schema and issued keys.'}];}
 return result;
}
