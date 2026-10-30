import {createHash} from 'node:crypto';
import {readKnowledge,resolveReference} from '../agents/knowledge';
import type {DirectionInput} from './types';

export type MaterialRole='reference'|'product'|'interface'|'photo'|'logo'|'font'|'unknown';
export type MaterialRecord={id:string;sha256:string;url:string;name:string;mime:string;aliases:string[];role:MaterialRole;referenceOnly:boolean;width?:number;height?:number;font?:{family:string;weights:number[];range?:[number,number];style:string};issues:string[]};
export type MaterialObservation={id:string;sourceId:string;sourceHash:string;role:MaterialRole;description:string;raw:unknown;status:'agent-reported'};
export type MaterialMemory={version:1;revision:string;materials:MaterialRecord[];rules:unknown[];preferences:unknown;issues:string[];observations:MaterialObservation[];evidence?:unknown;reconstruction:{allowed:boolean;instruction:string}};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const string=(v:unknown)=>typeof v==='string'?v:'';
export function createMaterialMemory(input:DirectionInput):MaterialMemory{
 const raw=record(input.brand.rawKit),metadata=Array.isArray(input.brief.suppliedAssetMetadata)?input.brief.suppliedAssetMetadata:[],sources=[...(Array.isArray(raw.materials)?raw.materials:[]),...metadata].map(record);
 const materials:MaterialRecord[]=[];
 const add=(source:{id?:string;url:string;mime?:string;sha256?:string;width?:number;height?:number},role:MaterialRole)=>{
  const prior=materials.find(m=>m.url===source.url),meta=sources.find(m=>source.id&&m.id===source.id)||sources.find(m=>source.sha256&&m.sha256===source.sha256)||{},name=string(meta.filename??meta.name)||source.url;
  const id=source.id??`material-${hash(source.url).slice(0,24)}`,sha256=source.sha256??source.url.match(/^[a-f0-9]{64}/)?.[0]??'',aliases=[id,source.url,name,sha256].filter(Boolean);
  if(prior){prior.aliases=[...new Set([...prior.aliases,...aliases])];if(['logo','font'].includes(role)||prior.role==='unknown')prior.role=role;if(role==='reference')prior.referenceOnly=true;return;}
  // A filename is evidence of origin, never evidence of the depicted subject.
  const referenceOnly=role==='reference'||/screen[ _-]?(?:shot|record)|video[ _-]?frame|скриншот|кадр/i.test(name);
  materials.push({id,sha256,url:source.url,name,mime:source.mime??(role==='font'?'font/unknown':'image/unknown'),aliases:[...new Set(aliases)],role,referenceOnly,width:source.width,height:source.height,issues:referenceOnly?['Source reference; inspect its subject before choosing a new representation.']:[]});
 };
 input.assets.forEach(a=>add(a,'unknown'));input.brand.references.forEach(r=>add(r,'reference'));input.brand.logos.forEach(l=>add(l,'logo'));input.brand.fonts.forEach(f=>add(f,'font'));
 const rules=(Array.isArray(raw.rules)?raw.rules:[]).filter(value=>record(value).decision==='accepted'),issues:string[]=[],seen=new Map<string,string>();
 for(const value of rules){const r=record(value),key=`${r.category}.${r.key}`,text=string(r.value);if(seen.has(key)&&seen.get(key)!==text)issues.push(`Conflicting accepted values for ${key}.`);seen.set(key,text);if(r.sourceVerified===false)issues.push(`Accepted rule ${key} has no verified source.`);}
 const allowed=input.brief.referenceReconstructionAllowed===true;
 return {version:1,revision:hash({materials,rules,notes:input.brief.variationNotes,allowed}),materials,rules,preferences:input.brief.variationNotes??null,issues,observations:[],reconstruction:{allowed,instruction:allowed?'A supplied product photo, video crop or interface screenshot is identity evidence. Create a fresh polished still through the priced image path, preserving observed product/interface details and approved facts. Do not place the reference screenshot into the composition or invent unseen features. Logos remain supplied artwork. Draft resolution and proxy rules still apply.':'Follow the frozen synthesis permission. Reference reconstruction has not been enabled for this saved run.'}};
}

/** Accept lists, maps and nested agent envelopes; preserve unrecognised content verbatim. */
export function importMaterialObservations(value:unknown,memory:MaterialMemory){
 const observations:MaterialObservation[]=[],issues:string[]=[];let count=0;
 const visit=(node:unknown,context?:string,depth=0)=>{
  if(++count>1024||depth>16){issues.push('Material observations exceeded the bounded reader; original response remains saved.');return;}
  if(Array.isArray(node)){node.forEach(v=>visit(v,context,depth+1));return;}
  const o=record(node),explicit=o.source??o.sourceId??o.asset??o.assetId??o.reference??o.ref??context;
  // An unknown field name may still carry an exact source reference. Inspect only
  // this record's scalar values, never blend references from unrelated child records.
  const inferred=explicit===undefined?resolveReference(Object.values(o).filter(v=>typeof v==='string'),memory.materials):undefined;
  const reference=explicit??(inferred?.status==='resolved'?inferred.id:undefined);
  if(inferred?.status==='ambiguous'){issues.push('A material reference is ambiguous; no source was guessed.');return;}
  const resolved=resolveReference(reference,memory.materials);
  if(resolved.status==='resolved'){
   const source=memory.materials.find(m=>m.id===resolved.id)!,rawRole=string(o.role??o.kind??o.type).toLowerCase(),role:MaterialRole=({product:'product',interface:'interface',ui:'interface',screenshot:'interface',photo:'photo',photograph:'photo',reference:'reference',logo:'logo',font:'font'} as Record<string,MaterialRole>)[rawRole]??'unknown';
   const description=typeof node==='string'?node:string(o.description??o.observation??o.summary??o.text)||readKnowledge(node).passages.map(p=>p.text).join('\n');
   if(!['logo','font'].includes(source.role)&&role!=='unknown'){source.role=role;if(['product','interface'].includes(role))source.referenceOnly=true;}
   const observation={id:`observation-${hash({source:source.id,hash:source.sha256,node}).slice(0,24)}`,sourceId:source.id,sourceHash:source.sha256,role,description:description.slice(0,2000),raw:node,status:'agent-reported' as const};
   if(!observations.some(p=>p.id===observation.id))observations.push(observation);return;
  }
  if(reference!==undefined){issues.push(resolved.status==='ambiguous'?'A material reference is ambiguous; no source was guessed.':'A material reference could not be linked; its content remains saved.');return;}
  for(const [key,item]of Object.entries(o)){const keyMatch=resolveReference(key,memory.materials);visit(item,keyMatch.status==='resolved'?key:undefined,depth+1);}
 };
 let content=value;if(typeof value==='string')try{content=JSON.parse(value);}catch{/* unstructured notes remain original evidence */}
 visit(content);return {observations,issues:[...new Set(issues)]};
}

/** Source references stay available to generators, but are never shipped as final preview artwork. */
export function previewMaterialAllowed(memory:MaterialMemory|undefined,url:string){
 if(!memory?.reconstruction.allowed)return true;
 const source=memory.materials.find(m=>m.url===url);return !source||!source.referenceOnly||['logo','font'].includes(source.role);
}

/** All roles receive this same small view; full source/provenance remains in the saved memory. */
export function materialMemoryContext(memory:MaterialMemory|undefined,includePreferences=true){
 if(!memory)return undefined;
 // Existing brand/asset fields already carry the inventory. Send only additional knowledge.
 return {version:memory.version,revision:memory.revision,reconstruction:{allowed:memory.reconstruction.allowed},materials:memory.materials.filter(m=>m.referenceOnly||m.font||m.name!==m.url||m.issues.length).map(m=>({id:m.id,name:m.name!==m.url?m.name:undefined,role:m.role,referenceOnly:m.referenceOnly,font:m.font?{family:m.font.family,weights:m.font.weights,range:m.font.range,style:m.font.style}:undefined,issues:m.issues.filter(issue=>!issue.startsWith('Source reference;')).map(issue=>issue.match(/weight (\d+)/)?`Missing weight ${issue.match(/weight (\d+)/)![1]}`:issue.match(/lacks (\d+) distinct/)?`Missing copy characters: ${issue.match(/lacks (\d+) distinct/)![1]}`:issue)})),rules:memory.rules.map(value=>{const r=record(value);return {key:`${r.category}.${r.key}`,status:r.status,sourceVerified:r.sourceVerified,sourceId:record(r.provenance).sourceId};}),preferences:includePreferences?memory.preferences??undefined:undefined,issues:memory.issues.length?memory.issues:undefined,observations:memory.observations.length?memory.observations.map(o=>({sourceId:o.sourceId,role:o.role,description:o.description,status:o.status})):undefined};
}
