// Chat-shaped plan C4: digests between stages. A planning stage's result is passed on as a short digest (about
// 1–2k tokens) built by rule from its structured output: plain labelled text in the order the agent wrote it, without
// ids, hashes, provenance, sources, issues or actions. The full output stays saved and is a catalogue entry agents can
// ask for by name (C3). No model call: every stage's output is JSON the rule can read. Pure, no Node imports.

/** About 1.5k tokens: a digest that reaches this size stops with a pointer to the full output. */
export const DIGEST_MAX_CHARS=6000;
/** The full output of a stage as a catalogue entry: a little more room, still plain text. */
export const FULL_MAX_CHARS=16000;

const SKIP=/^(?:id|.*Ids?|uuid|sha256|.*Hash|hash|revision|provenance|sources?|issues|actions|inputRefs|sourceCopyRef|suppliedSourceRef|claimId|schemaVersion|role|status|handoff|objectKey|url|.*Url|path|requestId|stepId|jobId|checkpointId|scenarioSelection|binding|variantIds|owner|version)$/i;
const ID_LIKE=/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,}|sha256:\S+)$/i;
/** A field name as words: "visualHierarchy" → "Visual hierarchy". */
export const label=(key:string)=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').trim().toLowerCase().replace(/^./,s=>s.toUpperCase());
const clean=(v:string)=>v.replace(/\s+/g,' ').trim();

/** Any structured value as labelled plain text, deterministic, within `max` characters. */
/** C9: a planning stage keeps the short ids the next stage must answer with ("concept-2", "territory-1", "scene-3"):
 * a key that names one id is kept; id-like values (uuids, hashes) are still left out. */
const ONE_ID=/^(?:id|(?!step|job|request|checkpoint|run|campaign|revision)[a-z]+Id)$/;
export function plainText(value:unknown,max=DIGEST_MAX_CHARS,stringMax=400,options:{keepIds?:boolean}={}):string{
 const lines:string[]=[];let size=0,full=false;
 const push=(line:string)=>{if(full)return;if(size+line.length+1>max){lines.push('… (more in the full output, available by name)');full=true;return;}lines.push(line);size+=line.length+1;};
 const scalar=(v:unknown):string|undefined=>{if(typeof v==='string'){const t=clean(v);return !t||ID_LIKE.test(t)?undefined:t.length>stringMax?`${t.slice(0,stringMax-1)}…`:t;}if(typeof v==='number'||typeof v==='boolean')return String(v);return undefined;};
 const visit=(v:unknown,depth:number,key?:string)=>{
  if(full)return;const pad='  '.repeat(Math.max(0,depth-1)),name=key?label(key):'';
  const s=scalar(v);if(s!==undefined){push(`${pad}${name?`${name}: `:''}${s}`);return;}
  if(Array.isArray(v)){
   if(v.every(x=>x===null||typeof x!=='object')){const list=v.map(scalar).filter((x):x is string=>!!x);if(list.length)push(`${pad}${name?`${name}: `:''}${list.join(' · ')}`);return;}
   if(name&&v.length)push(`${pad}${name}:`);v.forEach((item,i)=>{if(item&&typeof item==='object'&&!Array.isArray(item))push(`${pad}  ${i+1}.`);visit(item,depth+1);});return;}
  if(v&&typeof v==='object'){
   const entries=Object.entries(v as Record<string,unknown>).filter(([k,x])=>(!SKIP.test(k)||!!options.keepIds&&ONE_ID.test(k))&&x!=null&&x!==''&&!(Array.isArray(x)&&!x.length));
   if(name&&entries.length)push(`${pad}${name}:`);for(const [k,x] of entries)visit(x,depth+1,k);}
 };
 visit(value,0);return lines.join('\n');
}

/** The envelope's deliverable (or the value itself), as the agent wrote it. */
export function deliverableOf(output:unknown):unknown{
 let v=output;if(typeof v==='string'){try{v=JSON.parse(v);}catch{return v;}}
 const o=v as {deliverable?:unknown;summary?:unknown}|null;return o&&typeof o==='object'&&o.deliverable&&typeof o.deliverable==='object'?{...(typeof o.summary==='string'?{summary:o.summary}:{}),...(o.deliverable as object)}:v;
}
/** What a planning stage passes on to the next agents: its result in short, by rule. */
export const stageDigest=(output:unknown)=>plainText(deliverableOf(output),DIGEST_MAX_CHARS);
/** The full result of a stage as plain text (a catalogue entry). */
export const stageFull=(output:unknown)=>plainText(deliverableOf(output),FULL_MAX_CHARS,4000);
