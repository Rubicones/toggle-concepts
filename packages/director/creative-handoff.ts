import {createHash} from 'node:crypto';
import {readKnowledge,resolveReference} from '../agents/knowledge';
import {planningObject,planningField,planningNodes,type PlanningDirection,type PlanningJob} from './planning';
import type {DirectionInput} from './types';
import {squareFirstDraft} from './construction';
import {independentResourceBindings} from './resources';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export type CreativeHandoff={version:1;owner:'draft-director';revision:string;intent:{goal:unknown;audience:unknown;adNotes:unknown;direction:{id:string;name?:string;premise?:unknown}};strategy:unknown;visual:unknown;sources:{id:string;role:string;hash:string;contentHash:string;raw:unknown}[];referenceAssetIds:string[];issues:string[];actions:string[]};
const content=(v:unknown)=>readKnowledge(v).content;
function scopeEvidence(raw:unknown,direction:PlanningDirection,directions:PlanningDirection[],source:'visual'|'strategy'='visual'){
 const entities=directions.map(d=>({id:d.id,aliases:d.aliases})),fragments:{path:string;evidence:unknown}[]=[];let matched=0,foreign=0,unknown=0;
 const selector=(o:Record<string,unknown>,key:string)=>{
  const explicit=planningField(o,['conceptId','directionId','territoryId','conceptSlot','directionSlot']);
  const id=planningField(o,['id','slotId','slot']),qualified=typeof id==='string'?id.match(/(?:^|\.)(concept-\d+|direction-\d+|territory-\d+)(?:\.|$)/i)?.[1]:undefined;
  const values=explicit!==undefined?[String(explicit),id,key]:[key,id,...Object.values(o).filter(v=>typeof v==='string'&&!/^\d+$/.test(v))];if(qualified)values.push(qualified);
  const resolutions=values.map(v=>resolveReference(v,entities)),ids=new Set(resolutions.flatMap(r=>r.status==='resolved'?[r.id]:[]));
  const found=ids.size>1||resolutions.some(r=>r.status==='ambiguous')?{status:'ambiguous' as const}:ids.size?{status:'resolved' as const,id:[...ids][0]}:{status:'missing' as const};
  // Strategy territories are a separate namespace. An unlinked territory is shared evidence,
  // not a foreign scenario and never an implicit territory-N -> concept-N assignment.
  if(source==='strategy'&&found.status==='missing'&&planningField(o,['conceptId','directionId','conceptSlot','directionSlot'])===undefined&&(planningField(o,['territoryId'])!==undefined||/^territory-\d+$/i.test(qualified??'')||/^territory[ _-]?\d+$/i.test(key)))return found;
  if((explicit!==undefined||qualified||/^(concept|direction|territory)[ _-]?\d+$/i.test(key))&&found.status==='missing'){unknown++;return {status:'foreign' as const};}
  if(found.status==='missing'){
   const names=typeof id==='string'?entities.filter(e=>[e.id,...e.aliases].some(alias=>/^[a-z]/i.test(alias)&&id.startsWith(alias+'.'))):[];
   if(names.length===1)return {status:'resolved' as const,id:names[0].id};
  }
  return found;
 };
 const prune=(v:unknown,key:string,path='',insideSelected=false):unknown=>{
  if(typeof v==='string'){const named=[...v.matchAll(/\b(?:concept|direction|territory)-\d+\b/gi)].map(m=>m[0]).filter(name=>!(source==='strategy'&&/^territory-/i.test(name)&&resolveReference(name,entities).status==='missing'));if(named.length&&!named.some(name=>{const r=resolveReference(name,entities);return r.status==='resolved'&&r.id===direction.id;})){foreign++;return undefined;}return v;}
  if(Array.isArray(v))return v.map((item,index)=>prune(item,'',`${path}/${index}`,insideSelected)).filter(item=>item!==undefined);
  const o=planningObject(v);if(!Object.keys(o).length)return v;
  const resolved=selector(o,key);if(resolved.status==='foreign')return undefined;if(resolved.status==='ambiguous')throw Object.assign(new Error('PLANNING_DIRECTION_AMBIGUOUS'),{detail:'A planning record points to multiple directions; nothing was submitted.'});
  if(resolved.status==='resolved'){if(resolved.id!==direction.id){foreign++;return undefined;}matched++;}
  const selected=resolved.status==='resolved';
  const out:Record<string,unknown>={};for(const [k,item]of Object.entries(o)){const keyRef=resolveReference(k,entities);if(keyRef.status==='resolved'){if(keyRef.id!==direction.id){foreign++;continue;}matched++;}else if(/^(concept|direction|territory)[ _-]?\d+$/i.test(k)&&!(source==='strategy'&&/^territory[ _-]?\d+$/i.test(k))){foreign++;continue;}const kept=prune(item,k,`${path}/${k}`,insideSelected||selected);if(kept!==undefined){out[k]=kept;if(keyRef.status==='resolved'&&typeof kept==='string'&&!insideSelected&&!selected)fragments.push({path:`${path}/${k}`,evidence:kept});}}
  if(selected&&!insideSelected)fragments.push({path,evidence:out});return out;
 };
 const scoped=prune(content(raw),'');
 // A multi-direction source with identifiable other directions cannot silently become a shared treatment.
 if((foreign||unknown)&&!matched)throw Object.assign(new Error('PLANNING_TREATMENT_UNBOUND'),{detail:`The visual/strategy source has no unambiguous treatment for ${direction.id}. Nothing was submitted.`});
 return {scoped,shared:matched===0,fragments};
}
function deliverable(raw:unknown){
 const parsed=content(raw),nodes=planningNodes(parsed).nodes;
 const envelope=nodes.find(n=>typeof n.value.role==='string'&&n.value.deliverable&&typeof n.value.deliverable==='object');
 // The standard envelope is metadata, but its unresolved assumptions remain evidence.
 if(envelope){const o=envelope.value;return {content:o.deliverable,...(Array.isArray(o.assumptions)&&o.assumptions.length?{assumptions:o.assumptions}:{}),...(Array.isArray(o.blockingQuestions)&&o.blockingQuestions.length?{questions:o.blockingQuestions}:{}),...(Array.isArray(o.warnings)&&o.warnings.length?{warnings:o.warnings}:{})};}
 return parsed;
}
export function buildCreativeHandoff(args:{brief:Record<string,unknown>;direction:PlanningDirection;directions:PlanningDirection[];script:PlanningJob;visual:PlanningJob;strategy?:PlanningJob;input:DirectionInput}):CreativeHandoff{
 const {direction}=args,visual=scopeEvidence(deliverable(args.visual.output),direction,args.directions),strategy=args.strategy?scopeEvidence(deliverable(args.strategy.output),direction,args.directions,'strategy'):undefined;
 const sources=[args.script,args.visual,...(args.strategy?[args.strategy]:[])].filter((job,index,all)=>all.findIndex(j=>j.id===job.id)===index).map(j=>({id:j.id,role:j.job_key,hash:j.output_hash??hash(j.output),contentHash:hash(j.output),raw:j.output}));
 const intent={goal:args.brief.objective??args.brief.goal??null,audience:args.brief.audience??null,adNotes:args.brief.variationNotes??null,direction:{id:direction.id,...(typeof planningField(direction.value,['name','title'])==='string'?{name:String(planningField(direction.value,['name','title']))}:{}),premise:planningField(direction.value,['premise','idea','concept','summary'])}};
 const assetEntities=args.input.assets.filter(a=>a.mime.startsWith('image/')).map(a=>({id:a.id,aliases:[a.url,a.sha256,...(args.input.materialMemory?.materials.find(m=>m.id===a.id)?.aliases??[])]})),references=new Set<string>();
 for(const passage of readKnowledge(visual.scoped).passages){const found=resolveReference(passage.text,assetEntities);if(found.status==='resolved')references.add(found.id);}
 const actions:string[]=[],pack=(source:typeof visual,role:string)=>{
  if(JSON.stringify(source.scoped).length<=8000||!source.fragments.length)return source.scoped;
  // Keep decision evidence even when it lives outside the selected treatment's wrapper.
  // These remain unresolved source proposals; normalization never approves an exception.
  const decisionKeys=new Set(['adjudgment','decisions','decisionnotes','rationale','reasons','assumptions','questions','blockingquestions','warnings']);
  const decisions: {path:string;evidence:unknown}[]=[];
  for(const node of planningNodes(source.scoped).nodes)for(const [key,evidence]of Object.entries(node.value)){
   const path=`${node.path}/${key}`;
   if(decisionKeys.has(key.replace(/[^a-z0-9]/gi,'').toLowerCase())&&!source.fragments.some(f=>path===f.path||path.startsWith(f.path+'/'))&&!decisions.some(d=>path.startsWith(d.path+'/')))decisions.push({path,evidence});
  }
  actions.push(`Kept the complete selected ${role} fragments and decision notes; omitted the unscoped production dossier from model context. Full source and provenance remain saved.`);
  return {selected:source.fragments,decisions,sharedSource:'Full shared planning details remain in the saved source. Current approved brand, scope and generation permissions are authoritative.'};
 };
 const core={intent,strategy:strategy?pack(strategy,'strategy'):undefined,visual:pack(visual,'visual'),referenceAssetIds:[...references]},issues=[...(visual.shared?['Visual source is shared prose; no separate per-direction treatment was identified.']:[]),...(strategy?.shared?['Strategy is shared evidence. Its unlinked territories are proposals, not scenario bindings; the selected scenario and visual treatment remain authoritative.']:[])];
 return {version:1,owner:'draft-director',revision:hash({core,sources:sources.map(({raw,...ref})=>{void raw;return ref;})}),...core,sources,issues,actions};
}
export function creativeHandoffContext(input:DirectionInput,role:'director'|'coder'){
 const h=input.creativeHandoff;if(!h)return undefined;
 return {version:h.version,owner:h.owner,revision:h.revision,intent:h.intent,...(role==='director'?{strategy:h.strategy,visual:h.visual,referenceAssetIds:h.referenceAssetIds,issues:h.issues,sources:h.sources.map(({raw,...ref})=>{void raw;return ref;})}:{})};
}
export function withCreativeHandoff(input:DirectionInput,role:'director'|'coder',instructions:string){
 if(!input.creativeHandoff)return instructions;
 const construction=squareFirstDraft(input)?role==='director'?' Resolve each scene as a strong square first: hierarchy, product staging, typography, image/copy relationship and spacing. Explain how these relationships change continuously with width/height. Keep later motion intent separate from static implementation.':' Work square first, then adapt that design in the same source. construction.focus identifies the next step; it is technical progress, not visual approval. A complete first request is allowed. Preserve working design during repairs.':'';
 const images=independentResourceBindings(input)?role==='director'?' Keep existing image prompts, references and aspect unchanged for copy/layout edits. Change an image brief only when its visual material must change; do not multiply photographs for variant axes.':' Image arrivals update resources data; do not rewrite source just to insert a URL.':'';
 return instructions+'\n'+(role==='director'?'You own this direction. Develop the selected creativeHandoff treatment and intent; do not invent a competing territory. Current approved facts/copy, scope, generation permissions and AD notes outrank older planning hypotheses. Explain necessary departures and reasons in the design document. Planning slot IDs are evidence, never runtime resource IDs.':'Implement the director design and creativeHandoff intent. Do not reinterpret raw planning into a second direction. Use application IDs and report conflicts.')+construction+images;
}
