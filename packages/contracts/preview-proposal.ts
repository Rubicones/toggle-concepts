import {selectionProtocol,expandPreviewSelection,SELECTION_PROTOCOL,type PlanningSource} from './preview-selection';
import {z} from 'zod';
import {canonicalJson} from './common';
import {draftPlanSchema,type DraftPlan,type DraftSource} from './drafts';
import {localizationBindings,type LocalizationVariant} from './localization';
export const PREVIEW_PROTOCOL=SELECTION_PROTOCOL;
export type PreviewInputs={plan:DraftPlan;entries:LocalizationVariant[];assets:DraftSource[];planning?:PlanningSource[]};
const string={type:'string'};
export function previewProtocol(input:PreviewInputs){return selectionProtocol(input);}
/** Historical transport, retained for regression tests and old receipts only. */
export function legacyPreviewProtocol(input:PreviewInputs){
 const groups=localizationBindings(input.entries),images=input.assets.flatMap((a,i)=>a.mime.startsWith('image/')&&a.inspection.width&&a.inspection.height?[i]:[]),audio=input.assets.flatMap((a,i)=>a.mime==='audio/wav'?[i]:[]);
 const binding={type:'object',additionalProperties:false,properties:{group:{type:'integer',enum:groups.map(g=>g.binding)},hook:string,proof:string,cta:string,legal:string,sequence:{type:'array',items:{type:'string',enum:['hook','proof','cta']}},weights:{type:'array',items:{type:'number'}},hero:{type:'integer',enum:images},logo:{type:'integer',enum:images},audio:{type:['integer','null'],enum:[...audio,null]},resource:{type:['object','null'],additionalProperties:true}},required:['group','hook','proof','cta','legal','sequence','weights','hero','logo','audio','resource']};
 const direction={type:'object',additionalProperties:false,properties:{direction:{type:'integer',enum:[0,1,2]},title:string,idea:string,bindings:{type:'array',items:binding}},required:['direction','title','idea','bindings']};
 const responseSchema={name:'preview_assembly_v1',schema:{type:'object',additionalProperties:false,properties:{role:{type:'string',enum:['creative-code']},status:{type:'string',enum:['draft','blocked','needs_review']},summary:string,mandatoryLegal:string,directions:{type:'array',items:direction},questions:{type:'array',items:string}},required:['role','status','summary','mandatoryLegal','directions','questions']}};
 const task=`PREVIEW ASSEMBLY TRANSPORT preview-assembly-1. Return exactly this request's compact preview response, not the general scene-planning deliverable. Return all three directions (0,1,2); each must cover EVERY group below once with actual concise hook/proof/CTA copy and three unique hook/proof/cta sequence entries, plus three positive timing weights. Use actual scenarios/localized copy; adapt to each group's duration and reading time. Use only numeric source indexes below for images/audio; do not output UUIDs, filenames, URLs or imaginary resources. App attaches stable direction/binding IDs, exact locale/variant IDs, recipes and packaged draft font. Resource is null for stills, or a complete supplied proxy contract matching the existing DraftPlan resource shape. Never claim asset approval. Return blocked with questions if a source is missing; never invent it.\nDIRECTIONS: ${JSON.stringify(input.plan.directions.map((d,direction)=>({direction,recipe:d.recipe})))}\nGROUPS: ${JSON.stringify(groups.map(({variantIds,...g})=>({...g,orderedOutputs:variantIds.length})))}\nSOURCES: ${JSON.stringify(input.assets.map((a,index)=>({index,name:a.filename,mime:a.mime,...a.inspection})))}`;
 return {responseSchema,task,protocolInstructions:`For this typed preview-assembly operation, the response schema and PREVIEW ASSEMBLY TRANSPORT task define the required output wire format. They replace the generic role deliverable headings only. Preserve all other frozen creative, evidence, source, scope, budget and human-review instructions. Do not emit a generic declarativeScenePlan instead of this operation's response.`};
}
const wireBinding=z.strictObject({group:z.number().int().nonnegative(),hook:z.string(),proof:z.string(),cta:z.string(),legal:z.string(),sequence:z.array(z.enum(['hook','proof','cta'])).length(3),weights:z.tuple([z.number(),z.number(),z.number()]),hero:z.number().int().nonnegative(),logo:z.number().int().nonnegative(),audio:z.number().int().nonnegative().nullable(),resource:draftPlanSchema.shape.directions.element.shape.bindings.element.shape.resource});
const wire=z.strictObject({role:z.literal('creative-code'),status:z.enum(['draft','blocked','needs_review']),summary:z.string(),mandatoryLegal:z.string(),directions:z.array(z.strictObject({direction:z.number().int().min(0).max(2),title:z.string(),idea:z.string(),bindings:z.array(wireBinding)})),questions:z.array(z.string())});
export function validatePreviewPlan(value:unknown,input:PreviewInputs){
 const plan=draftPlanSchema.parse(value),groups=new Set(input.entries.map(r=>r.id));
 if(new Set(plan.directions.map(d=>d.title.trim().toLowerCase())).size!==3||new Set(plan.directions.map(d=>d.idea.trim().toLowerCase())).size!==3||plan.directions.some(d=>!d.title.trim()||!d.idea.trim())||new Set(plan.directions.map(d=>d.id)).size!==3||plan.directions.some(d=>!input.plan.directions.some(expected=>expected.id===d.id&&expected.recipe===d.recipe)))throw new Error('PREVIEW_DIRECTION_MISMATCH');
 for(const d of plan.directions){const seen=new Set<string>();
  for(const b of d.bindings){if(new Set(b.sequence).size!==3||!b.hook.trim()||!b.proof.trim()||!b.cta.trim())throw new Error('PREVIEW_COPY_INCOMPLETE');
   for(const id of b.variantIds){const row=input.entries.find(r=>r.id===id);if(!row||seen.has(id)||row.locale!==b.locale)throw new Error('PREVIEW_SCOPE_MISMATCH');seen.add(id);}
   for(const [id,kind] of [[b.heroAssetId,'image/'],[b.logoAssetId,'image/'],...(b.audioAssetId?[[b.audioAssetId,'audio/wav']]:[])] as [string|null,string][]){if(!id||!input.assets.some(a=>a.id===id&&a.mime.startsWith(kind)))throw new Error('PREVIEW_ASSET_MISSING');}
  }
  if(seen.size!==groups.size)throw new Error('PREVIEW_SCOPE_MISMATCH');
 }
 return {...plan,assetUseConfirmed:false};
}
export function preparePreviewProposal(text:string,input:PreviewInputs){
 const parsed=JSON.parse(text);let plan:unknown,normalized=false;
 if(parsed?.d0){plan=expandPreviewSelection(parsed,input);normalized=true;}
 else if(parsed?.deliverable?.draftPlan){if(!['creative-code','Creative compositor engineer','creative-compositor-engineer'].includes(parsed.role))throw new Error('OUTPUT_ROLE_MISMATCH');if(!['draft','needs_review'].includes(parsed.status))throw new Error('PREVIEW_INPUT_BLOCKED');plan=parsed.deliverable.draftPlan;}
 else{
  if(!Array.isArray(parsed?.directions))throw new Error('PREVIEW_PLAN_MISSING');
  const compact=wire.parse(parsed);if(compact.status==='blocked'){if(!compact.questions.some(q=>q.trim()))throw new Error('PREVIEW_BLOCK_REASON_REQUIRED');return {text,blocked:true,normalized:false};}
  if(compact.questions.length)throw new Error('PREVIEW_INPUT_BLOCKED');
  if(compact.directions.length!==3||new Set(compact.directions.map(d=>d.direction)).size!==3)throw new Error('PREVIEW_DIRECTION_MISMATCH');
  const groups=localizationBindings(input.entries);
  plan={schemaVersion:'1.0',fontFamily:'Noto Sans',assetUseConfirmed:false,mandatoryLegal:compact.mandatoryLegal,directions:compact.directions.map(d=>{
   const original=input.plan.directions[d.direction];const seen=new Set<number>();
   return {...original,title:d.title,idea:d.idea,bindings:d.bindings.map(b=>{const group=groups[b.group];if(!group||seen.has(b.group))throw new Error('PREVIEW_SCOPE_MISMATCH');seen.add(b.group);
    const asset=(index:number|null,mime:string)=>{if(index===null)return null;const a=input.assets[index];if(!a||!a.mime.startsWith(mime))throw new Error('PREVIEW_ASSET_MISSING');return a.id;};
    const tail=(BigInt('0x'+original.id.slice(-12))^BigInt(b.group+1)).toString(16).padStart(12,'0');
    return {id:original.id.slice(0,-12)+tail,variantIds:group.variantIds,locale:group.locale,hook:b.hook,proof:b.proof,cta:b.cta,legal:b.legal,sequence:b.sequence,beatWeights:b.weights,heroAssetId:asset(b.hero,'image/'),logoAssetId:asset(b.logo,'image/'),audioAssetId:asset(b.audio,'audio/wav'),resource:b.resource};
   })};
  })};normalized=true;
 }
 const checked=validatePreviewPlan(plan,input);
 return {text:canonicalJson({schemaVersion:'1.0',role:'creative-code',status:parsed.status??'draft',summary:parsed.summary??'Preview assembled from saved localized copy and real media references.',deliverable:{draftPlan:checked}}),blocked:false,normalized};
}
export function previewDiagnostic(text:string,input:PreviewInputs){try{preparePreviewProposal(text,input);return [];}catch(error){if(error instanceof z.ZodError)return error.issues.slice(0,8).map(i=>`${i.path.join('.')}: ${i.message}`);const code=error instanceof Error?error.message:'INVALID_PROPOSAL';const messages:Record<string,string>={PREVIEW_PLAN_MISSING:'The agent returned a general scene-planning document instead of the required preview plan. No renderable plan was returned.',PREVIEW_SCOPE_MISMATCH:'The preview plan does not cover each exact ordered variant once per direction.',PREVIEW_ASSET_MISSING:'The plan refers to a missing or unsupported source asset.',PREVIEW_DIRECTION_MISMATCH:'The response changed the three saved direction identities or recipes.'};return [messages[code]??code.replaceAll('_',' ')];}}

export function needsPreviewUpgrade(step:{status:string;error_code?:string|null;config_snapshot:{previewProtocol?:string}}){return step.config_snapshot.previewProtocol!==PREVIEW_PROTOCOL&&(step.status==='succeeded'||step.status==='failed'&&['INVALID_OUTPUT_SCHEMA','OUTPUT_TOKEN_LIMIT'].includes(step.error_code??''));}
