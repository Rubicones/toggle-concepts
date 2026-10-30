import {recipeNames,cameraNames,transitionNames} from '../creative/motion-recipes';
import {paintSchema,treatmentSchema as graphicTreatmentSchema,markSchema,iconSchema} from './graphic-vocabulary';
import {z} from 'zod';
import {sha256, rect} from './common';
import {finalResourceContractSchema} from './scene';

export const creativeOwners=['code','script','visual','compositor','media','ad'] as const;
export const creativeIssueSchema=z.strictObject({code:z.string().min(1),severity:z.enum(['block','warn']),path:z.string(),owner:z.enum(creativeOwners),message:z.string().min(1),fix:z.string().min(1),limit:z.record(z.string(),z.union([z.number(),z.string()])).optional()});
export type CreativeIssue=z.infer<typeof creativeIssueSchema>;
const key=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/).max(120);
const hex=z.string().regex(/^#[a-fA-F0-9]{6}$/);
const zone=z.tuple([z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1),z.number().min(0).max(1)]).refine(v=>v[2]>v[0]&&v[3]>v[1],'Zone must have positive area');
export const cueVocabulary=['fade','rise','drop','move','pop','scale','draw','type_on','float','sway','rock','edge','edge_mark','items','ui','clip'] as const;
export const fontFileSchema=z.strictObject({revisionId:key,sha256,weight:z.number().int().min(1).max(1000),style:z.enum(['normal','italic']),objectKey:z.string().min(1)});
const styleSchema=z.strictObject({font:key,sizeU:z.tuple([z.number().positive(),z.number().positive()]),weight:z.number().int().min(1).max(1000),tracking:z.number(),case:z.enum(['none','upper','lower','title']),lineHeight:z.number().positive()});
export const brandSystemSchema=z.strictObject({version:z.literal('brand@1'),revisionId:key,
 fonts:z.array(z.strictObject({role:z.enum(['headline','body','accent']),family:z.string().min(1),files:z.array(fontFileSchema).nonempty(),unitsPerEm:z.number().positive(),glyphCoverage:z.array(z.number().int().nonnegative()),averageAdvance:z.number().positive(),averageAdvanceByScript:z.record(z.string(),z.number().positive()).default({})})),
 paints:z.record(z.string(),paintSchema).default({}),treatments:z.record(z.string(),graphicTreatmentSchema).default({}),marks:z.record(z.string(),markSchema).default({}),icons:z.record(z.string(),iconSchema).default({}),
 logos:z.array(z.strictObject({id:key,role:z.enum(['primary','wordmark','icon']),revisionId:key,sha256,objectKey:z.string().min(1),mime:z.enum(['image/svg+xml','image/png','image/webp','image/jpeg']),ground:z.enum(['light','dark','any']),mode:z.enum(['as_drawn','one_colour']),svg:z.string().max(65536).optional(),viewBox:z.tuple([z.number(),z.number(),z.number().positive(),z.number().positive()]).optional()})),
 palette:z.array(z.strictObject({id:key,hex,roles:z.array(z.enum(['field','surface','ink','accent','cta']))})).nonempty(),
 contrastPairs:z.array(z.strictObject({ink:key,ground:key,ratio:z.number().nonnegative()})),
 styles:z.strictObject({headline:styleSchema,subhead:styleSchema,body:styleSchema,cta:styleSchema,legal:styleSchema}),
 motion:z.strictObject({durations:z.strictObject({fast:z.number().positive(),medium:z.number().positive(),slow:z.number().positive()}),easing:z.tuple([z.number(),z.number(),z.number(),z.number()]),allowedCues:z.array(z.enum(cueVocabulary)),movingMax:z.number().int().positive()}),
 limits:z.strictObject({readingCps:z.number().positive(),hookWords:z.number().int().positive(),ctaWords:z.number().int().positive(),colorsMax:z.number().int().positive(),offerByS:z.number().nonnegative(),minTextPxByPlacement:z.record(z.string(),z.number().positive()),safeZonesByPlacement:z.record(z.string(),z.strictObject({top:z.number().min(0).max(.4),right:z.number().min(0).max(.4),bottom:z.number().min(0).max(.4),left:z.number().min(0).max(.4)})).default({})}),
 compositions:z.array(z.strictObject({id:key,label:z.string(),technique:z.enum(['split','panel','window','object','transition','full']),regions:z.array(z.strictObject({id:key,area:z.enum(['full','edge','shape']),side:z.enum(['top','right','bottom','left']).optional(),depth:z.tuple([z.number(),z.number()]),paints:z.array(z.string())})),zones:z.record(z.string(),zone),formats:z.array(z.string()),notes:z.string()})).nonempty(),
 product:z.strictObject({name:z.string(),immutables:z.array(z.string()),media:z.array(key)}),voice:z.strictObject({tone:z.string(),say:z.array(z.string()),never:z.array(z.string())}),imagery:z.strictObject({treatment:z.string()}),prohibitions:z.array(z.string()),fallbacks:z.array(z.strictObject({path:z.string(),reason:z.string(),value:z.string()}))});
export type BrandSystem=z.infer<typeof brandSystemSchema>;
export const copyBudgetSchema=z.strictObject({version:z.literal('budget@1'),entries:z.array(z.strictObject({beatRole:z.enum(['hook','demo','proof','offer','cta']),durationSeconds:z.number().positive(),placementId:key,locale:key,maxChars:z.number().int().nonnegative(),maxLines:z.number().int().positive(),minFontPx:z.number().positive(),readingSeconds:z.number().nonnegative()}))});
export type CopyBudget=z.infer<typeof copyBudgetSchema>;
export const sourceSceneSchema=z.strictObject({sceneId:key,startTime:z.number().nonnegative(),endTime:z.number().positive(),visualNotes:z.string(),onScreenCopy:z.string(),narration:z.string()});
export const dataFormats=['int','dec1','percent','money'] as const;
export const dataFactSchema=z.strictObject({key,label:z.string().min(1).max(80),value:z.number().finite(),unit:z.string().max(16),from:z.number().finite(),format:z.enum(dataFormats),sourceRef:z.string().min(1).max(400)});
export type DataFact=z.infer<typeof dataFactSchema>;
export const graphicTypes=['stat','chart','icon','pattern','standin'] as const;
export const sceneGraphicSchema=z.strictObject({type:z.enum(graphicTypes),chart:z.enum(['ring','bar','none']),data:z.string().max(120),icon:z.string().max(120)});
export type SceneGraphic=z.infer<typeof sceneGraphicSchema>;
export const scriptSpecV2Schema=z.strictObject({version:z.literal('script@2'),direction:z.number().int().min(0).max(2),oneLine:z.string().min(1),technique:z.string().min(1),
 sourceScenes:z.array(sourceSceneSchema).optional(),
 cutdowns:z.array(z.strictObject({durationSeconds:z.number().positive(),beats:z.array(key).nonempty(),beatSeconds:z.array(z.number().positive()).optional()})).nonempty(),
 beats:z.array(z.strictObject({key,role:z.enum(['hook','demo','proof','offer','cta']),objective:z.string(),focal:key,sourceSceneIds:z.array(key).optional(),elements:z.array(z.strictObject({key,kind:z.enum(['text','logo','product','ui','graphic','media']),what:z.string()})).nonempty()})).nonempty(),
 copy:z.array(z.strictObject({key,beat:key,slot:z.enum(['hook','body','proof','cta','legal']),locale:key,text:z.string().min(1),short:z.array(z.string().min(1))})),
 hooks:z.array(z.strictObject({hookAxisId:key,angle:z.string().min(1),beat:key})).nonempty(),
 /** Numbers an infographic may show. Each must be quoted from an approved fact; the compiler verifies it. */
 data:z.array(dataFactSchema).max(8).default([]),
 bindings:z.array(z.strictObject({hookAxisId:key,offerAxisId:key,beatSequenceId:key,durationSeconds:z.number().positive(),beats:z.array(key).nonempty(),beatSeconds:z.array(z.number().positive()).optional(),copyKeys:z.array(key).nonempty()})).default([]),questions:z.array(z.string())});
export type ScriptSpecV2=z.infer<typeof scriptSpecV2Schema>;
export const treatmentSchema=z.strictObject({version:z.literal('treatment@1'),technique:z.string(),compositionsByBeat:z.array(key),palette:z.strictObject({field:key,surface:key,ink:key,accent:key}),typeRoles:z.array(z.strictObject({element:key,style:key})),imagery:z.strictObject({style:z.string(),crop:z.enum(['cover','contain']),treatment:z.string()}),motionCharacter:z.string(),beatValues:z.array(z.strictObject({beat:key,composition:key,technique:z.string(),imagery:z.string(),motionCharacter:z.string(),palette:z.strictObject({field:key,surface:key,ink:key,accent:key})})).optional(),transitions:z.array(z.string()),signature:z.strictObject({mode:z.enum(['use','candidates','none']),ids:z.array(key).max(3)})});
export type CreativeTreatment=z.infer<typeof treatmentSchema>;
export const sceneSpecV2Schema=z.strictObject({version:z.literal('scene@2'),stage:z.enum(['draft','final']),direction:z.number().int().min(0).max(2),
 beats:z.array(z.strictObject({key,recipe:z.enum(recipeNames).optional(),transitionOut:z.enum(transitionNames).optional(),composition:key,regions:z.array(z.strictObject({id:key,area:z.enum(['full','edge','shape']),paint:key})),
 layers:z.array(z.strictObject({key,element:key,kind:z.enum(['text','logo','image','video-proxy','ui','graphic','mark','group','component']),zone:key,order:z.number().int(),style:key,color:key,source:key,registryId:z.string(),camera:z.enum(cameraNames).optional(),treatment:key.optional(),fill:key.optional(),shape:z.enum(['rect','round','circle','arch']).optional(),align:z.enum(['left','center','right']).optional(),valign:z.enum(['top','center','bottom']).optional(),on:key.optional(),graphic:sceneGraphicSchema.nullable().optional()})).nonempty(),
 cues:z.array(z.strictObject({target:key,type:z.enum(cueVocabulary),at:z.number().nonnegative(),duration:z.enum(['fast','medium','slow']),amount:z.number(),period:z.number().positive()})),never:z.array(key)})).nonempty(),resourceContracts:z.array(finalResourceContractSchema)});
export type SceneSpecV2=z.infer<typeof sceneSpecV2Schema>;
export const uiSpecSchema=z.strictObject({device:z.enum(['phone','tablet','desktop','none']),aspect:z.number().positive(),referenceRevisionId:key,panels:z.array(z.strictObject({key,label:z.string(),value:z.string(),kind:z.enum(['label','bar','line','button','number','chip']),progress:z.number().min(0).max(1)}))});
export const promptPackSchema=z.strictObject({purpose:z.string().min(1),references:z.array(key),compositionMap:z.string().min(1),protectedArea:rect,cropMargins:rect,lighting:z.string().min(1),prohibitions:z.array(z.string()).nonempty(),prompt:z.string().min(1)});
export const mediaPlanSchema=z.strictObject({version:z.literal('media@1'),elements:z.array(z.strictObject({element:key,source:z.enum(['asset','logo','generate','ui','proxy']),reference:key,fit:z.enum(['cover','contain']),ground:key,shots:z.array(z.string().min(1)).max(24).optional(),shotReferences:z.array(key).optional(),generation:z.strictObject({status:z.enum(['pending','failed','ready']),reason:z.string(),packHash:sha256}).optional(),promptPack:promptPackSchema.nullable(),ui:uiSpecSchema.nullable(),contract:finalResourceContractSchema.nullable()}))});
export type MediaPlan=z.infer<typeof mediaPlanSchema>;
export const criticSceneSchema=z.strictObject({sceneId:key,result:z.enum(['match','partial','miss']),path:z.string().min(1),owner:z.enum(creativeOwners),fix:z.string().min(1)});
export const criticSchema=z.strictObject({version:z.literal('critic@1'),scenes:z.array(criticSceneSchema).optional(),findings:z.array(z.strictObject({slot:z.string().optional(),rule:z.string().min(1),path:z.string().min(1),owner:z.enum(creativeOwners),fix:z.string().min(1),severity:z.enum(['block','warn'])}))});
export type CreativeCritic=z.infer<typeof criticSchema>;
export const repairLogSchema=z.strictObject({direction:z.number().int().min(0).max(2),level:z.enum(['L0','L1','L2','L3']),path:z.string(),code:z.string(),action:z.string(),costMicroUsd:z.number().int().nonnegative(),attempt:z.number().int().nonnegative()});
export type CreativeRepair=z.infer<typeof repairLogSchema>;

/** Provider constraints are intentionally broader; local validators own all invariants. */
export function flatProviderSchema(schema:z.ZodType):Record<string,unknown>{
 const walk=(node:Record<string,unknown>):Record<string,unknown>=>{
  if(node.anyOf||node.oneOf){const choices=(node.anyOf??node.oneOf) as Record<string,unknown>[],nonNull=choices.filter(c=>c.type!=='null'),nullable=nonNull.length!==choices.length;
   if(nonNull.every(c=>c.type==='object')){const keys=[...new Set(nonNull.flatMap(c=>Object.keys((c.properties??{}) as object)))],properties=Object.fromEntries(keys.map(key=>{const fields=nonNull.map(c=>(c.properties as Record<string,Record<string,unknown>>|undefined)?.[key]),field=walk(fields.find(Boolean)!);return [key,fields.some(f=>!f)?{...field,type:[...(Array.isArray(field.type)?field.type:[field.type]),'null'].filter((v,i,a)=>a.indexOf(v)===i)}:field];}));return {type:nullable?['object','null']:'object',properties,required:keys,additionalProperties:false};}
   const selected=nonNull[0];if(!selected)return {type:'string'};const result=walk(selected);return nullable?{...result,type:[selected.type,'null']}:result;
  }
  if(node.type==='object'){const properties=Object.fromEntries(Object.entries((node.properties??{}) as Record<string,Record<string,unknown>>).map(([name,value])=>[name,walk(value)]));return {type:'object',properties,required:Object.keys(properties),additionalProperties:false};}
  if(node.type==='array')return {type:'array',items:node.items?walk(node.items as Record<string,unknown>):{type:'number'}};
  // Keep small closed vocabularies (proven safe with Gemini, like the planning role enum); without them the model invents
 // values such as element kinds. Large vocabularies and count/length limits stay local-only (P5).
 if(Array.isArray(node.enum)&&node.enum.length<=12)return {type:node.type??'string',enum:node.enum};
 if(node.const!==undefined)return {type:node.type??typeof node.const,enum:[node.const]};
 return {type:node.type??'string'};
 };
 return walk(z.toJSONSchema(schema) as Record<string,unknown>);
}

export type CreativeQuestion={direction:number;question:string;owners:string[];options:{action:string;label:string;priceMicroUsd:number}[];nextActions:string[];jobId?:string;quoteId?:string;maxCostMicroUsd?:number;runCapMicroUsd?:number;agentCapMicroUsd?:number;limitsVersion?:number;issues?:CreativeIssue[];status?:'set-aside';kind?:'build-repair';targetInputHash?:string};
export const quoteBuildRepairCommand=z.strictObject({action:z.literal('quoteBuildRepair'),direction:z.number().int().min(0).max(2)});
export const creativeBlockCommand=z.strictObject({action:z.enum(['start','tick','quoteRebuild','rebuild']),quoteId:z.string().regex(/^[a-f0-9]{64}$/).optional(),maxCostMicroUsd:z.number().int().nonnegative().optional()});
/** Quote responses can include display-only price details; confirmation sends only the approved identity and limit. */
export function creativeRebuildRequest(quote:{quoteId:string;maxCostMicroUsd:number}|null){
 return quote?{action:'rebuild' as const,quoteId:quote.quoteId,maxCostMicroUsd:quote.maxCostMicroUsd}:{action:'quoteRebuild' as const};
}
export type BuildRepairQuote={direction:number;jobId:string;quoteId:string;maxCostMicroUsd:number;runCapMicroUsd:number;agentCapMicroUsd:number;stageLabel:string;rebuild:string[];message:string};
export type CreativeProgressData={counters?:import('../creative/counters').CreativeCounters;stale?:boolean;staleReasons?:string[];estimateMicroUsd:number;repairAllowanceMicroUsd:number;repairSpentMicroUsd?:number;repairCharges?:{stepId:string;role:string;direction:number;costMicroUsd:number|null;status:string}[];repairLog:CreativeRepair[];questions:CreativeQuestion[]};

/** App-owned authoring identity. Never a provider response schema. */
export const directionSkeletonSchema=z.strictObject({version:z.literal('DirectionSkeleton@1'),direction:z.number().int(),beats:z.array(z.strictObject({key:z.string(),label:z.string(),sourceSceneIds:z.array(z.string()),start:z.number(),end:z.number(),role:z.enum(['hook','demo','proof','offer','cta']),visualNotes:z.string(),motionNotes:z.string(),recipe:z.enum(recipeNames).optional(),camera:z.enum(cameraNames).optional(),transitionOut:z.enum(transitionNames).optional(),visuals:z.array(z.strictObject({id:z.string(),label:z.string(),kind:z.enum(['ui','people','place','footage','object','logo','graphic']),description:z.string(),montage:z.boolean()})),copy:z.array(z.strictObject({id:z.string(),label:z.string(),locale:z.string(),slot:z.enum(['hook','body','proof','cta','legal']),text:z.string(),locked:z.boolean(),hookAxis:z.string().optional()}))})),hooks:z.array(z.strictObject({id:z.string(),label:z.string(),slotId:z.string().optional()})),cutdowns:z.array(z.strictObject({durationSeconds:z.number(),beats:z.array(z.string()),beatSeconds:z.array(z.number())})),slotIds:z.array(z.string())});
export type DirectionSkeleton=z.infer<typeof directionSkeletonSchema>;
