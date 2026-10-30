import {z} from 'zod';
import type {LiveFrameProps,LiveOptions} from './live-preview';
import {liveFormat} from './live-preview';
import type {Variant} from './types';
const hash=z.string().regex(/^[a-f0-9]{64}$/),word=z.string().min(1).max(160);
export const reviewViewSchema=z.strictObject({width:z.number().int().min(200).max(2400),height:z.number().int().min(200).max(2400),format:word,locale:word,hook:word,cta:word,length:z.number().positive().max(3600),sceneId:word,moment:word});
export const reviewIdentitySchema=z.strictObject({blockId:z.uuid(),directionId:z.uuid(),iterationId:z.uuid(),revision:hash,assetRevision:hash});
export const reviewTargetSchema=reviewIdentitySchema.extend({version:z.literal(1),view:reviewViewSchema,pending:z.array(z.string().min(1).max(160)).max(256)});
export type ReviewIdentity=z.infer<typeof reviewIdentitySchema>;
export type ReviewTarget=z.infer<typeof reviewTargetSchema>;
export const reviewCommand=z.strictObject({action:z.literal('review'),requestId:z.uuid(),kind:z.enum(['note','reviewed']),target:reviewTargetSchema,recipient:z.enum(['director','assembler']).optional(),text:z.string().trim().min(1).max(4000).optional()}).superRefine((value,ctx)=>{if(value.kind==='note'&&(!value.text||!value.recipient))ctx.addIssue({code:'custom',message:'Write a note and choose its recipient.'});if(value.kind==='reviewed'&&(value.text||value.recipient))ctx.addIssue({code:'custom',message:'A review mark does not route a note.'});});
export type ReviewCommand=z.infer<typeof reviewCommand>;
export type ReviewRecord={id:string;action:'note'|'reviewed';target:ReviewTarget;body?:string|null;recipient?:'director'|'assembler'|null;created_at:string;created_by?:string};
export type SourceChecks={revision:string;build:'passed';typecheck:'passed'|'not-checked';scope:'source-only'};
export type PreviewReview={identity:ReviewIdentity;enabled:boolean;route:'live'|'paused'|'quote';checks:SourceChecks;records:ReviewRecord[]};
export type PreviewEvidence={identity:ReviewIdentity;options:LiveOptions;legacy:boolean;variants:Variant[];scenes:{sceneId:string;moments:{id:string;description?:string}[]}[];assets:{name:string;sha256:string}[];formats:{id:string;width:number;height:number}[]};
/** Stable equality includes the displayed loading state; review never transfers to newly arrived pixels. */
export function reviewKey(target:ReviewTarget){const v=target.view;return JSON.stringify([target.blockId,target.directionId,target.iterationId,target.revision,target.assetRevision,v.width,v.height,v.format,v.locale,v.hook,v.cta,v.length,v.sceneId,v.moment,[...target.pending].sort()]);}
export function makeReviewTarget(identity:ReviewIdentity,view:LiveFrameProps,pending:string[]):ReviewTarget{return {...identity,version:1,view:{width:view.width,height:view.height,format:view.format,locale:view.locale,hook:view.hook,cta:view.cta,length:view.length,sceneId:view.sceneId,moment:view.moment},pending:[...new Set(pending)].sort()};}
export function declaredReviewView(options:LiveOptions,variants:Variant[],view:LiveFrameProps){return options.scenes.includes(view.sceneId)&&options.hooks.includes(view.hook)&&options.ctas.includes(view.cta)&&options.locales.includes(view.locale)&&options.lengths.includes(view.length)&&variants.some(v=>v.locale===view.locale&&v.hook===view.hook&&v.cta===view.cta&&v.length===view.length);}
export function validateReviewTarget(target:ReviewTarget,evidence:PreviewEvidence){
 const parsed=reviewTargetSchema.parse(target),{view}=parsed;
 if(Object.entries(evidence.identity).some(([key,value])=>parsed[key as keyof ReviewIdentity]!==value))throw new Error('REVIEW_EVIDENCE_MISMATCH');
 if(!declaredReviewView(evidence.options,evidence.variants,view)||!evidence.scenes.some(s=>s.sceneId===view.sceneId&&s.moments.some(m=>m.id===view.moment)))throw new Error('UNISSUED_REVIEW_VIEW');
 if(!evidence.options.adaptive){const sized=evidence.legacy?evidence.formats.some(f=>f.id===view.format&&f.width===view.width&&f.height===view.height):view.width===1080&&view.height===1080&&view.format==='square';if(!sized)throw new Error('UNISSUED_REVIEW_VIEW');}
 else if(view.format!==liveFormat(view.width,view.height))throw new Error('UNISSUED_REVIEW_VIEW');
 if(parsed.pending.some(name=>!evidence.assets.some(a=>a.name===name)))throw new Error('UNISSUED_REVIEW_ASSET');
 return parsed;
}
/** Exact targeting survives to agents without resending common block/direction identifiers. */
export function agentReviewNotes<T>(notes:T[]){
 const result:unknown[]=[],seen=new Map<string,{index:number;viewed:Record<string,unknown>}>();
 for(const note of notes){const n=note as T&{recipient?:string;text?:string;target?:ReviewTarget;sourceFile?:string};if(!n?.target){result.push(note);continue;}
  const t=n.target,viewed:Record<string,unknown>={source:t.revision,pictures:t.assetRevision,...t.view,...(t.pending.length?{pending:t.pending}:{})},key=JSON.stringify(viewed),prior=seen.get(key);
  if(prior){if(n.sourceFile)prior.viewed.sourceFile=n.sourceFile;result.push({recipient:n.recipient,text:n.text,viewed:{sameAsNote:prior.index+1}});}
  else{if(n.sourceFile)viewed.sourceFile=n.sourceFile;seen.set(key,{index:result.length,viewed});result.push({recipient:n.recipient,text:n.text,viewed});}
 }
 return result;
}
