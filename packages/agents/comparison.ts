// Chat-shaped plan C10: the owner's blind comparison of a first-attempt chat result with a pipeline run of the same
// brief, and the run's numbers per stage. Pure and browser-safe: the server reads the rows, this file decides what is
// shown. The order of A and B is drawn once per pair and stored; it is shown only after every pair is judged.
import {localCallUsage,usageTotals,cacheReport,cacheLine,type LocalCallUsage,type UsageTotals} from './local-usage';
import {TEXT_SCHEMA_ROLES} from './schema-in-text';

export const BRIEF_KINDS=[{id:'restrained',label:'A restrained brand'},{id:'product',label:'A product brand'},{id:'interface',label:'A digital-interface brand'}] as const;
export type BriefKind=typeof BRIEF_KINDS[number]['id'];
export type Verdict='A'|'B'|'same';
export type StoredPair={id:string;position:number;label:string;chat_first:boolean;verdict:Verdict|null;note:string|null;judged_at?:string|null};
export type StoredComparison={id:string;run_id:string;brief_kind:BriefKind;title:string;chat_tokens:number|null;created_at:string;revealed_at:string|null;pairs:StoredPair[]};
export type Side='chat'|'pipeline';

/** Which result a label shows: A is the chat result when the pair drew the chat first. */
export const sideOf=(chatFirst:boolean,label:'A'|'B'):Side=>(label==='A')===chatFirst?'chat':'pipeline';
/** The order of a new pair: drawn once, then stored and never changed. */
export const drawChatFirst=(random:()=>number=Math.random)=>random()<0.5;
export const canReveal=(pairs:StoredPair[])=>pairs.length>0&&pairs.every(p=>!!p.verdict);

export type PairView={id:string;position:number;label:string;verdict:Verdict|null;note:string|null;/** after the reveal only */A?:Side;B?:Side;winner?:Side|'same'};
export type ComparisonView={id:string;runId:string;briefKind:BriefKind;title:string;chatTokens:number|null;createdAt:string;revealed:boolean;canReveal:boolean;pairs:PairView[];
 /** after the reveal only: how many pairs each side won */score?:{pipeline:number;chat:number;same:number}};
/** What the page may show: the stored order stays on the server until the owner reveals it. */
export function comparisonView(c:StoredComparison):ComparisonView{
 const revealed=!!c.revealed_at,pairs=[...c.pairs].sort((a,b)=>a.position-b.position).map((p):PairView=>{
  const base={id:p.id,position:p.position,label:p.label,verdict:p.verdict,note:p.note};
  if(!revealed)return base;
  const A=sideOf(p.chat_first,'A'),B=sideOf(p.chat_first,'B');
  return {...base,A,B,...(p.verdict?{winner:p.verdict==='same'?'same' as const:p.verdict==='A'?A:B}:{})};
 });
 const score=revealed?{pipeline:pairs.filter(p=>p.winner==='pipeline').length,chat:pairs.filter(p=>p.winner==='chat').length,same:pairs.filter(p=>p.winner==='same').length}:undefined;
 return {id:c.id,runId:c.run_id,briefKind:c.brief_kind,title:c.title,chatTokens:c.chat_tokens,createdAt:c.created_at,revealed,canReveal:!revealed&&canReveal(c.pairs),pairs,...(score?{score}:{})};
}

/** A saved frame of a run (a director event picture) in plain words; null for pictures that are not a frame. */
export function frameLabel(stepId:string):{key:string;label:string}|null{
 if(/:hero:(?:accepted|reviewed|started):\d+$/.test(stepId))return {key:'hero',label:'Hero frame'};
 const wrap=/:wrap:[^:]+:([^:]+):([^:]+)$/.exec(stepId);
 if(wrap){const n=/(\d+)$/.exec(wrap[1])?.[1];return {key:`scene:${wrap[1]}:${wrap[2]}`,label:`${n?`Scene ${n}`:wrap[1]}${wrap[2]&&wrap[2]!=='hero'?` (${wrap[2]})`:''}`};}
 return null;
}
export type FrameEvent={id:string;directionId:string;stepId:string;at:string};
export type Frame={eventId:string;label:string;directionNumber:number;at:string};
/** The latest picture of each frame per direction, the hero first: what the owner picks for a pair. */
export function runFrames(events:FrameEvent[]):Frame[]{
 const directions=[...new Set([...events].sort((a,b)=>a.at.localeCompare(b.at)).map(e=>e.directionId))],latest=new Map<string,FrameEvent&{label:string}>();
 for(const e of events){const f=frameLabel(e.stepId);if(!f)continue;const key=`${e.directionId}|${f.key}`,prior=latest.get(key);if(!prior||prior.at<e.at)latest.set(key,{...e,label:f.label});}
 return [...latest.values()].map(e=>({eventId:e.id,label:directions.length>1?`Direction ${directions.indexOf(e.directionId)+1} · ${e.label}`:e.label,directionNumber:directions.indexOf(e.directionId)+1,at:e.at}))
  .sort((a,b)=>a.directionNumber-b.directionNumber||Number(!a.label.endsWith('Hero frame'))-Number(!b.label.endsWith('Hero frame'))||a.label.localeCompare(b.label,undefined,{numeric:true}));
}

// ---- The run's numbers, per stage and in total (LC0 usage records, the C7 cache line, the C7b repair rate) ----
type Row={role:string;status?:string;created_at:string;usage?:unknown;config_snapshot?:unknown};
type Local={schemaMode?:string;answerFormat?:string;schemaCheck?:{repaired?:boolean;issues?:string[]};durationMs?:number};
export type StageNumbers={stage:string;label:string;totals:UsageTotals;turns:number;timeMs:number};
export type RunReport={stages:StageNumbers[];total:StageNumbers&{wallMs:number};cacheLine:string|null;
 /** C7b: planning answers whose format travelled as text; how many needed the repair turn, and how many still did not fit. */
 repair:{answers:number;repaired:number;notFitting:number;share:number|null}};
const turns=(l:LocalCallUsage[])=>l.reduce((n,c)=>n+(c.turns??1),0);
export function runReport(rows:Row[],label:(stage:string)=>string=s=>s):RunReport{
 const calls=rows.map(row=>({row,u:localCallUsage(row)})).filter((c):c is {row:Row;u:LocalCallUsage}=>!!c.u);
 const groups=new Map<string,LocalCallUsage[]>();for(const {u} of calls){const k=u.effortStage??u.stage??u.role;groups.set(k,[...(groups.get(k)??[]),u]);}
 const numbers=(stage:string,l:LocalCallUsage[]):StageNumbers=>({stage,label:label(stage),totals:usageTotals(l),turns:turns(l),timeMs:l.reduce((n,c)=>n+(c.durationMs??0),0)});
 const all=calls.map(c=>c.u),starts=calls.map(c=>Date.parse(c.row.created_at)).filter(Number.isFinite),ends=calls.map(c=>Date.parse(c.row.created_at)+(c.u.durationMs??0)).filter(Number.isFinite);
 const text=rows.filter(r=>TEXT_SCHEMA_ROLES.has(r.role)&&(r.usage as {_local?:Local}|null|undefined)?._local?.answerFormat==='text').map(r=>({row:r,l:(r.usage as {_local:Local})._local}));
 const repaired=text.filter(t=>t.l.schemaCheck?.repaired).length,notFitting=text.filter(t=>t.l.schemaCheck&&t.row.status!=='succeeded').length;
 return {stages:[...groups.entries()].map(([s,l])=>numbers(s,l)),total:{...numbers('total',all),label:'Total',wallMs:starts.length?Math.max(...ends)-Math.min(...starts):0},
  cacheLine:cacheLine(cacheReport(rows),label),repair:{answers:text.length,repaired,notFitting,share:text.length?repaired/text.length:null}};
}

/** A chat picture's type from its first bytes, never from its name: PNG, JPEG or WebP only. */
export function pictureType(bytes:Uint8Array):{mime:'image/png'|'image/jpeg'|'image/webp';ext:string}|null{
 const at=(i:number,list:number[])=>list.every((b,k)=>bytes[i+k]===b),ascii=(i:number,t:string)=>at(i,[...t].map(c=>c.charCodeAt(0)));
 if(at(0,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))return {mime:'image/png',ext:'png'};
 if(at(0,[0xff,0xd8,0xff]))return {mime:'image/jpeg',ext:'jpg'};
 if(ascii(0,'RIFF')&&ascii(8,'WEBP'))return {mime:'image/webp',ext:'webp'};
 return null;
}
