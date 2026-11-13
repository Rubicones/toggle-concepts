// Chat-shaped plan C9: the planning chain as a chat. In run contexts frozen from C9 on, strategy, script and visual
// direction read the run context (the brand pack and the brief, once, in the shared prefix), the campaign context as
// plain text without what that prefix already holds, and each earlier stage IN SHORT (its C4 digest, keeping the short
// ids the next stage answers with). The full result of each earlier stage is a material the role may ask for by name
// (C3). Pure: the transport applies it to what is sent, never to what is stored or compared at admission.
import {deliverableOf,plainText,DIGEST_MAX_CHARS,FULL_MAX_CHARS} from '../director/digest';
import {CHAIN_ROLES} from './local-session';
import type {MaterialEntry} from './materials';

export const PLANNING_CHAT_VERSION='planning-chat@1';
/** Whether a request of this role reads the planning chain as a chat: contexts frozen with C9, chain roles only. */
export const usesPlanningChat=(ctx:{planningChat?:string}|null|undefined,role?:string)=>!!ctx?.planningChat&&!!role&&CHAIN_ROLES.has(role);

const LONG_LIST=12;
/** A long list of like records (a variant manifest of 128 entries) becomes its count and the values each field takes;
 * a field that differs on every record (its id) is left out. Shorter lists stay as they are. */
export function compactLists(v:unknown):unknown{
 if(Array.isArray(v)){
  if(v.length>LONG_LIST&&v.every(x=>x&&typeof x==='object'&&!Array.isArray(x))){
   const values:Record<string,string[]>={};
   for(const x of v)for(const [k,y] of Object.entries(x as Record<string,unknown>)){if(y===null||typeof y==='object')continue;const s=String(y);const list=values[k]??=[];if(!list.includes(s))list.push(s);}
   const fields=Object.entries(values).filter(([,list])=>list.length<v.length).map(([k,list])=>[k,list.length>LONG_LIST?`${list.slice(0,LONG_LIST).join(' · ')} … (${list.length} values)`:list.join(' · ')]);
   return {count:`${v.length} in all`,...Object.fromEntries(fields)};
  }
  return v.map(compactLists);
 }
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v as Record<string,unknown>).map(([k,x])=>[k,compactLists(x)]));
 return v;
}

/** Parts of the campaign context the shared prefix already holds (brief, brand) or that are bookkeeping only. */
const NOT_SENT=new Set(['submittedBrief','acceptedBrandKit','acceptedA1','campaignId','checkpointId','reuseGeneratedOutputs']);
/** The campaign context as plain labelled text: what this run adds to the brief and the brand pack above. */
export function planningContextText(context:unknown):string{
 const rest=context&&typeof context==='object'&&!Array.isArray(context)?Object.fromEntries(Object.entries(context as Record<string,unknown>).filter(([k])=>!NOT_SENT.has(k))):context;
 return `The brief and the brand pack are in the run context above. This run adds:\n${plainText(compactLists(rest),DIGEST_MAX_CHARS,1200,{keepIds:true})}`;
}

type Upstream={jobId:string;sha256:string;output:string}[];
const parsed=(output:string):unknown=>{try{return JSON.parse(output);}catch{return output;}};
const roleOf=(output:string)=>{const r=(parsed(output) as {role?:unknown}|null)?.role;return typeof r==='string'&&/^[a-z][a-z-]*$/.test(r)?r:null;};
/** The material name of an earlier stage's full result. */
export const stageName=(role:string)=>`stage-${role}`;
const stages=(upstream:Upstream|undefined)=>(upstream??[]).map((u,i)=>({u,name:stageName(roleOf(u.output)??`earlier-${i+1}`),role:roleOf(u.output)??`earlier stage ${i+1}`}));

/** Each earlier stage in short, by rule (no model call), with the names its full result can be asked for by. */
export function planningUpstreamText(upstream:Upstream|undefined):string{
 const list=stages(upstream);if(!list.length)return 'None: this is the first planning stage.';
 return [`Earlier stages, in short. The full result of each is a material you can ask for by name: ${list.map(s=>s.name).join(', ')}.`,
  ...list.map(s=>`${s.role.toUpperCase()} (${s.name})\n${plainText(compactLists(deliverableOf(s.u.output)),DIGEST_MAX_CHARS,400,{keepIds:true})}`)].join('\n\n');
}
/** The full results of the earlier stages as materials the role can ask for (inside its frozen budget). */
export function planningMaterials(upstream:Upstream|undefined):MaterialEntry[]{
 return stages(upstream).map(s=>{const detail=plainText(deliverableOf(s.u.output),FULL_MAX_CHARS,4000,{keepIds:true});return {name:s.name,kind:'planning',line:`the full ${s.role} result`,size:`~${Math.ceil(detail.length/4)} tokens`,detail};});
}

/** C9: the one line that asks visual direction for its concept (the schema's first field) before its structured answer. */
export const VISUAL_CONCEPT_TASK='CONCEPT FIRST: deliverable.concept comes first, in prose: the visual idea of what you write here and why it is right for this brand and this line. Then the structured fields exactly as asked.';

/** C9: the full brand sheet's pages as materials visual direction may ask for by name; the compact sheet is in the
 * shared prefix. Only pages stored under their own hash are offered (the same check as when they were sent whole). */
export function sheetMaterials(refs:unknown):MaterialEntry[]{
 if(!Array.isArray(refs))return [];
 return refs.flatMap(r=>{
  const x=(r??{}) as {section?:unknown;slice?:unknown;objectKey?:unknown;sha256?:unknown;width?:unknown;height?:unknown};
  if(typeof x.section!=='string'||typeof x.sha256!=='string'||x.objectKey!==`staging/brand-sheet/${x.sha256}.png`)return [];
  const slice=Number(x.slice)||0,section=x.section.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'page';
  return [{name:`sheet-${section}${slice?`-${slice+1}`:''}`,kind:'brand sheet page',line:`the full brand sheet: ${x.section}${slice?`, part ${slice+1}`:''}`,size:'picture',picture:{objectKey:x.objectKey,sha256:x.sha256,page:slice+1,width:Number(x.width)||1024,height:Number(x.height)||1024}}];
 });
}
/** The line that names the full sheet's pages for visual direction (none when there is no sheet). */
export const sheetOnRequestLine=(entries:MaterialEntry[])=>entries.length?`THE FULL BRAND SHEET: the compact sheet is in the run context above; each page of the full sheet is a material you can ask for by name: ${entries.map(e=>e.name).join(', ')}.`:'';
