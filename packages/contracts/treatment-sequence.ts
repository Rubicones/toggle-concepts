// Treatment sequence (docs/reviews/2026-11-09-treatment-sequence.md): the three visual treatments of the AD-selected
// scenario are written in three requests of one visual-direction step, one treatment per request. A later request sees
// the treatments already written and must leave their visual world. The stable prefix (instructions, campaign context,
// upstream, brand sheet) is cached; only the task text changes between requests. The step keeps one reservation and one
// receipt, so money, freezing, retries and the idea review work as before.
import {instructionVersion,outputDiagnostic} from './agent-output';
import {canonicalJson} from '../agents/prepared-request';
import type {ScenarioSelection} from './scenario-selection';
import {textRequestQuote} from '../agents/text-quote';
import type {TextSnapshot} from '../agents/text-provider';

/** Runs whose frozen instructions are this version or later write treatments one per request. */
export const TREATMENT_SEQUENCE_VERSION='2026-11-09.3';
export const TREATMENT_SLOTS=[1,2,3] as const;
export type TreatmentSlot=typeof TREATMENT_SLOTS[number];
/** UTF-8 bytes of each field of an earlier treatment shown to a later request (a fixed bound, so the quote is an upper bound). */
export const PRIOR_FIELD_MAX=900;
const PRIOR_FIELDS=['name','visualIdea','makingTechnique','composition','typographyTreatment','paletteAndLighting'] as const;
export const PRIOR_TREATMENT_MAX=PRIOR_FIELDS.length*(PRIOR_FIELD_MAX+40);

export function usesTreatmentSequence(instructions?:string|null){
 const found=instructionVersion(instructions??undefined);if(!found)return false;const [date,n]=TREATMENT_SEQUENCE_VERSION.split('.');
 return found[1]>date||found[1]===date&&Number(found[2])>=Number(n);
}

type Treatment=Record<string,unknown>;
/** Clipped by UTF-8 bytes, so any script stays within the quoted bound. */
const clip=(v:unknown)=>{const s=typeof v==='string'?v:v==null?'':JSON.stringify(v);if(Buffer.byteLength(s)<=PRIOR_FIELD_MAX)return s;let out=s.slice(0,PRIOR_FIELD_MAX);while(Buffer.byteLength(out)>PRIOR_FIELD_MAX-3)out=out.slice(0,-1);return out+'…';};
/** What a later request needs to know of an earlier treatment to leave its world: its idea, making, composition, type and light. */
export function priorTreatmentSummary(t:Treatment){return PRIOR_FIELDS.map(k=>`${k}: ${clip(t[k])}`).join('\n');}

/** The per-request contract, appended after the step's task. */
export function treatmentSequenceTask(slot:TreatmentSlot,scenarioId:string,priors:Treatment[]){
 const head=`TREATMENT SEQUENCE: The three treatments are written in three separate requests, one per request, so each gets the whole answer. This request writes treatment ${slot} of 3 only: deliverable.treatments holds exactly one item, conceptId "concept-${slot}", scenarioId "${scenarioId}". This overrides any instruction above to return three treatments. productionConstraints lists only what this treatment adds.`;
 if(!priors.length)return `${head}\nTwo more treatments follow in later requests and must leave your visual world, so commit fully to one clear visual idea instead of hedging toward the average.`;
 return `${head}\nTREATMENTS ALREADY WRITTEN for the same scenario (read them to leave them, never to continue them):\n${priors.map((t,i)=>`[concept-${i+1}]\n${priorTreatmentSummary(t)}`).join('\n')}\nYours is a different visual world: it differs from each of them in visual idea, way of making, composition principle and the role of type. A variation, a palette or light swap, or a recombination of their parts is not a different world.${slot===3?' Both earlier treatments must be left, not only the last one.':''}`;
}
/** The same contract with every earlier treatment at its maximum size: the quote for a request is an upper bound. */
export function treatmentSequenceQuoteTask(slot:TreatmentSlot,scenarioId:string){
 const filler:Treatment=Object.fromEntries(PRIOR_FIELDS.map(k=>[k,'x'.repeat(PRIOR_FIELD_MAX)]));
 return treatmentSequenceTask(slot,scenarioId,Array.from({length:slot-1},()=>filler));
}

export type SequencePart={kind:'treatment';envelope:Record<string,unknown>;treatment:Treatment}|{kind:'blocked';text:string};
/** One request's answer: its single treatment, or the agent's blocked envelope (passed on unchanged). */
export function readSequencePart(text:string,slot:TreatmentSlot):SequencePart{
 const parsed=JSON.parse(text);
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('INVALID_OUTPUT_SCHEMA');
 if(parsed.status==='blocked')return {kind:'blocked',text};
 const treatments=parsed.deliverable?.treatments;
 if(!Array.isArray(treatments)||!treatments.length||!treatments[0]||typeof treatments[0]!=='object')throw new Error('DELIVERABLE_MISSING');
 // A model in plain-JSON mode may return more than asked; only the first item is this slot's treatment.
 return {kind:'treatment',envelope:parsed,treatment:{...treatments[0],conceptId:`concept-${slot}`}};
}

const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];
const union=(lists:unknown[])=>[...new Set(lists.flatMap(strings))];
/** One visual-direction answer from the three requests, in the shape a single request returns. */
export function mergeTreatmentSequence(parts:Extract<SequencePart,{kind:'treatment'}>[],selection:ScenarioSelection){
 if(parts.length!==3)throw new Error('THREE_DIRECTIONS_REQUIRED');
 const first=parts[0].envelope,envelopes=parts.map(p=>p.envelope),deliverables=envelopes.map(e=>(e.deliverable??{}) as Record<string,unknown>);
 const handoff=(first.handoff??{}) as Record<string,unknown>;
 return canonicalJson({...first,
  status:envelopes.some(e=>e.status==='needs_review')?'needs_review':'draft',
  summary:envelopes.map((e,i)=>`concept-${i+1}: ${typeof e.summary==='string'?e.summary:''}`).join('\n'),
  deliverable:{treatments:parts.map(p=>({...p.treatment,scenarioId:selection.scenarioId})),productionConstraints:union(deliverables.map(d=>d.productionConstraints))},
  inputRefs:union(envelopes.map(e=>e.inputRefs)),assumptions:union(envelopes.map(e=>e.assumptions)),
  blockingQuestions:union(envelopes.map(e=>e.blockingQuestions)),warnings:union(envelopes.map(e=>e.warnings)),
  handoff:{...handoff,checks:union(envelopes.map(e=>(e.handoff as Record<string,unknown>|undefined)?.checks))},
 });
}

/** Numbers are added field by field (tokens, cost, cache details); anything else is taken from the latest request. */
export function sumUsage(a:unknown,b:unknown):unknown{
 if(typeof a==='number'&&typeof b==='number')return a+b;
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
  const out:Record<string,unknown>={...a as Record<string,unknown>};
  for(const [k,v] of Object.entries(b as Record<string,unknown>))out[k]=k in out?sumUsage(out[k],v):v;
  return out;
 }
 return b??a;
}

type Receipt={outcome:string;cost:number|null;text:string|null;generation:string|null;usage:unknown;failure:string|null;finishReason?:string|null;providerError?:unknown;local?:{events:unknown[];stderr?:string}};
/**
 * The step's receipt for its requests. Cost is the sum, unknown when any request's cost is unknown. No single provider
 * generation id stands for the step (a receipt looked up by one id would undercount it), so the ids are kept as usage
 * diagnostics and the generation is empty, which keeps the conservative charge for an unconfirmed outcome.
 */
export function combineSequenceReceipts<R extends Receipt>(receipts:R[],final:{outcome:string;text:string|null;failure:string|null}):R{
 const last=receipts[receipts.length-1];
 const cost=receipts.some(r=>r.cost===null)?null:receipts.reduce((n,r)=>n+(r.cost??0),0);
 const usage={...(receipts.reduce<unknown>((u,r)=>r.usage?sumUsage(u,r.usage):u,null) as Record<string,unknown>|null),
  treatmentSequence:receipts.map((r,i)=>({slot:i+1,outcome:r.outcome,cost:r.cost,generation:r.generation,finishReason:r.finishReason??null}))};
 const local=receipts.some(r=>r.local)?{events:receipts.flatMap(r=>r.local?.events??[]),stderr:receipts.map(r=>r.local?.stderr).filter(Boolean).join('\n')}:undefined;
 return {...last,...final,cost,generation:null,usage,...(local?{local}:{})};
}

/**
 * Runs the three requests in order. The first request that does not succeed, cannot be read or is blocked ends the
 * sequence; its result becomes the step's result, with the cost of every request sent so far.
 */
export async function runTreatmentSequence<R extends Receipt>(send:(task:string,slot:TreatmentSlot)=>Promise<R>,selection:ScenarioSelection):Promise<R&{validation?:unknown}>{
 const receipts:R[]=[],parts:Extract<SequencePart,{kind:'treatment'}>[]=[];
 for(const slot of TREATMENT_SLOTS){
  const r=await send(treatmentSequenceTask(slot,selection.scenarioId,parts.map(p=>p.treatment)),slot);receipts.push(r);
  if(r.outcome!=='succeeded'||!r.text)return combineSequenceReceipts(receipts,{outcome:r.outcome,text:r.text,failure:r.failure});
  let part:SequencePart;
  try{part=readSequencePart(r.text,slot);}catch(error){return {...combineSequenceReceipts(receipts,{outcome:'failed',text:r.text,failure:'INVALID_OUTPUT_SCHEMA'}),validation:outputDiagnostic(error)};}
  if(part.kind==='blocked')return combineSequenceReceipts(receipts,{outcome:'succeeded',text:part.text,failure:null});
  parts.push(part);
 }
 return combineSequenceReceipts(receipts,{outcome:'succeeded',text:mergeTreatmentSequence(parts,selection),failure:null});
}

/**
 * Output allowance of one request. One treatment is a third of the old three-treatment answer, so half the step's
 * allowance still leaves each treatment (and its reasoning) more room than it had before.
 */
export const sequenceRequestOutput=(stepMaxOutput:number)=>Math.min(stepMaxOutput,Math.max(8192,Math.ceil(stepMaxOutput/2)));

/**
 * One reservation for the three requests. Request 1 writes the cached prefix; requests 2 and 3 read it, so their prefix
 * is quoted at the cache-read rate (the input rate when the model has none) and only their task text at the input rate.
 * The prefix is counted in UTF-8 bytes, about three times its real tokens, so the total still covers a cache miss on
 * requests 2 and 3 (for example when request 1 thinks past the cache lifetime).
 */
export function treatmentSequenceReservation(prompt:string,cfg:TextSnapshot,transportTask:string,visionCount:number,scenarioId:string){
 const per={...cfg,maxOutputTokens:sequenceRequestOutput(cfg.maxOutputTokens)},read=cfg.pricing.cacheReadPrice??cfg.pricing.inputPrice;
 const quotes=TREATMENT_SLOTS.map(slot=>{
  const task=transportTask+'\n'+treatmentSequenceQuoteTask(slot,scenarioId),q=textRequestQuote(prompt,per,task,visionCount);
  if(slot===1)return q;
  const taskBytes=Buffer.byteLength(prompt+task,'utf8'),prefix=q.inputTokenBound-taskBytes;
  return {inputTokenBound:q.inputTokenBound,reservationMicroUsd:Math.max(1,Math.ceil((prefix*read+taskBytes*cfg.pricing.inputPrice+per.maxOutputTokens*cfg.pricing.outputPrice)*1000000*1.1))};
 });
 return {reservationMicroUsd:quotes.reduce((n,q)=>n+q.reservationMicroUsd,0),inputTokenBound:Math.max(...quotes.map(q=>q.inputTokenBound)),maxOutputTokens:per.maxOutputTokens};
}
