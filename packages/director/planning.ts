import {readKnowledge,resolveReference} from '../agents/knowledge';
import {bindLocalizedCopy,type LocalizationVariant} from '../contracts/localization';
import type {ApprovedLocalization} from './inputs';
export const planningObject=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const key=(s:string)=>s.replace(/[^a-z0-9]/gi,'').toLowerCase();
/** Semantic aliases live at this boundary; consumers receive one stable shape. */
export function planningField(value:unknown,names:string[]){const o=planningObject(value);for(const name of names){const entry=Object.entries(o).find(([k])=>key(k)===key(name));if(entry)return entry[1];}return undefined;}
export type PlanningNode={value:Record<string,unknown>;path:string;key:string;parents:Record<string,unknown>[]};
export function planningNodes(raw:unknown){
 const evidence=readKnowledge(raw);if(evidence.limited)throw Object.assign(new Error('PLANNING_INPUT_TOO_LARGE'),{detail:'The planning document exceeds the bounded evidence reader. Nothing was submitted.'});
 const nodes:PlanningNode[]=[];
 const visit=(v:unknown,path:string,k:string,parents:Record<string,unknown>[])=>{if(Array.isArray(v)){v.forEach((item,i)=>visit(item,`${path}/${i}`,String(i),parents));return;}const o=planningObject(v);if(!Object.keys(o).length)return;nodes.push({value:o,path,key:k,parents});for(const [name,item]of Object.entries(o))visit(item,`${path}/${name.replace(/~/g,'~0').replace(/\//g,'~1')}`,name,[...parents,o]);};
 visit(evidence.content,'','',[]);return {raw:evidence.raw,content:evidence.content,nodes};
}
export type PlanningJob={id:string;job_key:string;state:string;output:unknown;output_hash?:string|null};
export function selectPlanningJob(jobs:PlanningJob[],kind:string,refs?:{id:string}[]){
 const selected=jobs.filter(j=>j.job_key===kind&&j.state==='succeeded'&&(!refs||refs.some(r=>r.id===j.id)));
 if(selected.length!==1||!selected[0].output)throw Object.assign(new Error(selected.length>1?'PLANNING_SOURCE_AMBIGUOUS':'PLANNING_REQUIRED'),{detail:`Select one current ${kind} source; found ${selected.length}. Nothing was submitted.`});return selected[0];
}
const time=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&/^(?:\d+(?:\.\d+)?\s*(?:s(?:ec(?:onds?)?)?)?|\d+:\d+(?:\.\d+)?)$/i.test(v.trim());
const timed=(v:unknown)=>{const t=planningField(v,['timing','time'])??v;return time(planningField(t,['start','startTime','startTimeSeconds','startSeconds','from']))&&(time(planningField(t,['end','endTime','endTimeSeconds','endSeconds','to']))||time(planningField(t,['duration','durationSeconds'])));};
const identity=(v:unknown)=>planningField(v,['conceptId','directionId','territoryId','id','key']);
const strings=(...values:unknown[])=>[...new Set(values.filter((v):v is string=>typeof v==='string'&&!!v.trim()))];
export type PlanningDirection={id:string;aliases:string[];value:Record<string,unknown>;storyboard:unknown[];path:string};
export function readPlanningDirections(raw:unknown):PlanningDirection[]{
 const {nodes}=planningNodes(raw),found:{node:PlanningNode;owner:Record<string,unknown>;sequence:unknown[];name:string}[]=[];
 for(const node of nodes){const sequences=Object.entries(node.value).filter(([,v])=>Array.isArray(v)&&v.length&&v.every(timed));if(!sequences.length)continue;
  const owner=identity(node.value)!==undefined?node.value:[...node.parents].reverse().find(v=>identity(v)!==undefined)??node.value;
  if(found.some(f=>f.owner===owner)&&/(?:^|\/)(?:cutdowns|durationchecks|subtitles|subtitlesegments|voiceover|audio|proxycontracts|assetneeds)(?:\/|$)/i.test(node.path))continue;
  const preferred=sequences.filter(([k])=>['timedstoryboard','storyboard','scenes','shots','beats'].includes(key(k))),top=preferred.filter(([k])=>key(k)==='timedstoryboard'),second=top.length===1?top:preferred.filter(([k])=>key(k)==='storyboard'),choices=second.length===1?second:preferred.length?preferred:sequences;
  if(choices.length!==1)throw Object.assign(new Error('APPROVED_STORYBOARD_REQUIRED'),{detail:`has ambiguous timed sequences at ${node.path||'root'}`});
  if(found.some(f=>f.owner===owner))throw Object.assign(new Error('APPROVED_STORYBOARD_REQUIRED'),{detail:'has more than one storyboard for the same direction'});
  found.push({node,owner,sequence:choices[0][1] as unknown[],name:choices[0][0]});
 }
 const rawId=({node,owner}:{node:PlanningNode;owner:Record<string,unknown>},index:number)=>{const source=identity(owner);return typeof source==='string'||typeof source==='number'?String(source):/^\d+$/.test(node.key)||!node.key?`direction-${index+1}`:node.key;};
 const explicitSlot=(owner:Record<string,unknown>,id:string)=>{const rawSlot=planningField(owner,['conceptSlot','directionSlot']);return rawSlot!==undefined&&/^\d+$/.test(String(rawSlot).trim())?String(rawSlot).trim():id.match(/^(?:concept|direction|territory)[ _-]?(\d+)$/i)?.[1]??(/^\d+$/.test(id)?id:undefined);};
 const claimedSlots=new Set(found.map((item,index)=>explicitSlot(item.owner,rawId(item,index))).filter((v):v is string=>v!==undefined));
 const directions=found.map((item,index)=>{
  const {node,owner,sequence}=item,id=rawId(item,index);
  const slot=explicitSlot(owner,id)??(!claimedSlots.has(String(index+1))?String(index+1):undefined);
  const aliases=strings(id,planningField(owner,['name','title']),...(slot!==undefined?[String(slot),`concept-${slot}`,`concept_${slot}`,`concept ${slot}`,`concept${slot}`,`direction-${slot}`,`direction_${slot}`,`direction ${slot}`,`direction${slot}`]:[]),!/^\d+$/.test(node.key)?node.key:undefined);
  return {id,aliases,value:{...owner,id,timedStoryboard:sequence},storyboard:sequence,path:node.path};
 });
 if(new Set(directions.map(d=>d.id)).size!==directions.length)throw new Error('PLANNING_DIRECTION_AMBIGUOUS');
 return directions;
}

/** Existing application localization bindings remain authoritative; exact words are never translated here. */
export function readPlanningLocalization(raw:unknown,entries:LocalizationVariant[]):ApprovedLocalization[]{
 const {nodes}=planningNodes(raw),rows:Record<string,unknown>[]=[];
 for(const {value:o}of nodes){const text=planningField(o,['text','copy','translation','localizedText']),slot=planningField(o,['copySlot','slot','semanticSlot']);if(typeof text!=='string'||typeof slot!=='string')continue;
  const direction=planningField(o,['conceptId','directionId','conceptSlot','direction']);
  const binding=planningField(o,['binding','bindingIndex']);
  if(binding!==undefined){const ids=planningField(o,['variantIds','variantId']),locale=planningField(o,['locale','language','languageTag']);if(ids!==undefined||locale!==undefined)throw new Error('LOCALIZATION_BINDING_MISMATCH');rows.push({binding,copySlot:slot,text,...(direction!==undefined?{direction:String(direction)}:{}),...(planningField(o,['sceneId','scene'])!==undefined?{sceneId:planningField(o,['sceneId','scene'])}:{})});}
  else{const ids=planningField(o,['variantIds','variants','variantId','variant']),locale=planningField(o,['locale','language','languageTag']),scene=planningField(o,['sceneId','scene']);rows.push({copySlot:slot,text,locale,variantIds:Array.isArray(ids)?ids:[ids],...(direction!==undefined?{direction:String(direction)}:{}),...(scene!==undefined?{sceneId:scene}:{})});}
 }
 const bound=bindLocalizedCopy({localizedCopy:rows},entries).deliverable.localizedCopy as ApprovedLocalization[];
 if(!bound.length)throw new Error('APPROVED_VARIANT_COPY_REQUIRED');
 for(const row of bound)if(!row.text.trim()||!row.variantIds?.length||row.variantIds.some(id=>!entries.some(e=>e.id===id&&e.locale===row.locale)))throw new Error('LOCALIZATION_BINDING_MISMATCH');
 if(new Set(entries.map(e=>e.conceptSlot)).size>1){
  const byId=new Map(entries.map(e=>[e.id,e]));
  for(const row of bound){
   const matched=row.variantIds.map(id=>byId.get(id)).filter((e):e is LocalizationVariant=>!!e);
   const siblings=entries.filter(candidate=>matched.some(m=>m.locale===candidate.locale&&m.hook===candidate.hook&&m.beatSequence===candidate.beatSequence&&m.offer===candidate.offer&&m.durationSeconds===candidate.durationSeconds&&m.placementId===candidate.placementId));
   for(const sibling of siblings){
    const alreadyCovered=bound.some(other=>other.locale===row.locale&&other.copySlot===row.copySlot&&(other.direction??'')===(row.direction??'')&&(other.sceneId??'')===(row.sceneId??'')&&other.variantIds.includes(sibling.id));
    if(!alreadyCovered)row.variantIds.push(sibling.id);
   }
  }
 }
 return bound;
}
export function localizationForDirection(rows:ApprovedLocalization[],direction:PlanningDirection,directions:PlanningDirection[]){
 const index=directions.indexOf(direction),entities=directions.map(d=>({id:d.id,aliases:d.aliases}));
 return rows.filter(row=>{if(row.direction!==undefined){const resolved=resolveReference(row.direction,entities);if(resolved.status!=='resolved')throw new Error('LOCALIZATION_BINDING_MISMATCH');return resolved.id===direction.id;}
  const legacy=/^(?:onscreen(?:copy)?|narration|voiceover|scene|beat|shot)[_. -](\d+)[_. -]\d+$/i.exec(row.copySlot)??/(?:^|[_. -])(?:concept|direction|dir)[_. -]?(\d+)(?:$|[_. -])/i.exec(row.copySlot);return !legacy||Number(legacy[1])===index+1;});
}

/** Normalized times/words are an input adapter, never a new storyboard or copywriter. */
export function planningScene(value:unknown):Record<string,unknown>{
 const o=planningObject(value),timing=planningField(o,['timing','time'])??o;
 return {...o,id:planningField(o,['sceneId','shotId','beatId','beatKey','sceneKey','slotId','slot','id','key']),start:planningField(timing,['start','startTime','startTimeSeconds','startSeconds','from']),end:planningField(timing,['end','endTime','endTimeSeconds','endSeconds','to']),duration:planningField(timing,['duration','durationSeconds']),onScreenCopy:planningField(o,['onScreenCopy','onScreenText','onScreen','headline','caption','super','overlayText','displayCopy','copy','text']),visualNotes:planningField(o,['visualNotes','visual','visuals','description','shot','scene','action','staging','imagery','visualDescription']),motionNotes:planningField(o,['motionNotes','motion']),narration:planningField(o,['narration','voiceover'])};
}
