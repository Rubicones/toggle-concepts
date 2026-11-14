// Run export (scripts/export-run.ts): the pure parts. What is written never holds a key, a token or a picture's
// bytes: every string is redacted, data URLs become a size and a hash, and signed links lose their signature. Pure.
import {createHash} from 'node:crypto';
import {tokenPricedUsd} from '../agents/local-usage';

const REDACTED='[redacted]';
/** Secrets by their shape: provider and platform keys, JWTs, bearer headers, private keys. */
const KEY_PATTERNS:RegExp[]=[
 /\bsk-(?:ant-|or-|proj-)?[A-Za-z0-9_-]{16,}/g,
 /\b(?:sb_secret|sb_publishable|sbp|ghp|gho|ghu|ghs|github_pat|tsk|xox[abprs]|AIza|pk_live|sk_live|rk_live)[_-]?[A-Za-z0-9_-]{16,}/g,
 /\bAKIA[0-9A-Z]{16}\b/g,
 /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
 /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi,
 /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
/** NAME=value and "name": "value" where the name says it is a secret. */
/** "token" but not the plural: maxOutputTokens, prompt_tokens and brand.tokens are counts and rules, not secrets. */
const SECRET_NAME='(?:api[_-]?key|apikey|secret|token(?!s)|password|passwd|authorization|service[_-]?role[_-]?key|access[_-]?key|private[_-]?key|credential)';
const ASSIGNMENT=new RegExp(`\\b([A-Za-z0-9_.-]*${SECRET_NAME}[A-Za-z0-9_.-]*)("?\\s*[=:]\\s*)("?)(?=[^\\s"',;&]*[A-Za-z])([^\\s"',;&]{12,})`,'gi');
/** Signed links: the query values that grant access. */
const SIGNED=/([?&](?:token|signature|sig|X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|key|apikey|access_token)=)[^&\s"']+/gi;
const DATA_URL=/data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]{64,})/gi;
const LONG_BASE64=/[A-Za-z0-9+/]{2000,}={0,2}/g;
const SECRET_FIELD=new RegExp(`^(?:.*${SECRET_NAME}.*)$`,'i');

/** A string with every secret-shaped part replaced. Pictures as data URLs become "[image type, N bytes, sha256 …]". */
export function redactText(text:string):string{
 let out=text.replace(DATA_URL,(_m,mime:string,b64:string)=>`[image ${mime}, ${Math.floor(b64.length*3/4)} bytes, sha256 ${createHash('sha256').update(b64).digest('hex').slice(0,16)}]`);
 out=out.replace(LONG_BASE64,m=>`[base64 ${Math.floor(m.length*3/4)} bytes]`);
 for(const p of KEY_PATTERNS)out=out.replace(p,m=>/^(Bearer|Basic)\s/i.test(m)?`${m.split(/\s/)[0]} ${REDACTED}`:REDACTED);
 out=out.replace(SIGNED,`$1${REDACTED}`);
 return out.replace(ASSIGNMENT,(_m,name:string,sep:string,quote:string)=>`${name}${sep}${quote}${REDACTED}`);
}
/** Any JSON value, redacted in depth; a text field whose name says it is a secret loses its value (numbers stay). */
export function redactValue<T>(value:T):T{
 const walk=(v:unknown,key?:string):unknown=>{
  if(typeof v==='string')return key&&SECRET_FIELD.test(key)&&v.length>0?REDACTED:redactText(v);
  if(Array.isArray(v))return v.map(x=>walk(x));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v as Record<string,unknown>).map(([k,x])=>[k,walk(x,k)]));
  return v;
 };
 return walk(value) as T;
}
/** Files the export never reads, whatever folder they are in. */
export const neverExported=(name:string)=>/(^|[\\/])(\.env[^\\/]*|.*\.pem|.*\.key|id_rsa[^\\/]*|credentials[^\\/]*|\.npmrc|\.netrc|device\.json|auth\.json|\.credentials\.json)$/i.test(name)||/(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(name);

const size=(v:unknown)=>v===undefined||v===null?0:Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v),'utf8');
export type StepRow={id:string;role:string;status:string;model_id?:string|null;prompt?:string|null;output?:string|null;error_code?:string|null;created_at?:string;updated_at?:string;reserve_micro_usd?:number|null;cost_micro_usd?:number|null;usage?:Record<string,unknown>|null;config_snapshot?:Record<string,unknown>|null};
/** What one request was made of, by size (bytes; tokens are roughly bytes ÷ 4), largest first, and what the model
 * reported: the answer to "what is actually in this request". */
export function requestComposition(step:StepRow){
 const s=step.config_snapshot??{},parts:Record<string,number>={};
 const add=(name:string,v:unknown)=>{const n=size(v);if(n>0)parts[name]=n;};
 add('prompt',step.prompt);for(const k of ['instructions','roleInstructions','protocolInstructions','contextText','upstreamText','transportTask','responseSchema'])add(k,s[k]);
 const ctx=s.campaignContext;if(ctx&&typeof ctx==='object')for(const [k,v] of Object.entries(ctx as Record<string,unknown>))add(`campaignContext.${k}`,v);
 if(Array.isArray(s.upstream))(s.upstream as {jobId?:string;output?:unknown}[]).forEach((u,i)=>add(`upstream[${i}]`,u?.output??u));
 for(const k of ['brandSheetImages','brandVisionImages','imageReferences'])if(Array.isArray(s[k]))parts[`${k} (count)`]=(s[k] as unknown[]).length;
 const u=(step.usage??{}) as {prompt_tokens?:number;completion_tokens?:number;prompt_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number};_local?:Record<string,unknown>},local=u._local??{};
 const sorted=Object.fromEntries(Object.entries(parts).sort((a,b)=>b[1]-a[1]));
 return {id:step.id,role:step.role,directorRole:(s.directorRole as string|undefined)??null,status:step.status,error:step.error_code??null,model:step.model_id??null,at:step.created_at??null,finishedAt:step.updated_at??null,
  snapshotBytes:Object.values(parts).reduce((n,x)=>n+x,0),roughTokens:Math.ceil(Object.entries(parts).filter(([k])=>!k.endsWith('(count)')).reduce((n,[,x])=>n+x,0)/4),parts:sorted,
  usage:{input:u.prompt_tokens??null,cached:u.prompt_tokens_details?.cached_tokens??null,cacheWrite:u.prompt_tokens_details?.cache_write_tokens??null,output:u.completion_tokens??null},
  local:{stage:local.stage??null,effort:local.effort??null,turns:local.numTurns??null,internalAttempts:local.internalAttempts??null,conversation:local.conversation??null,conversationSize:local.conversationSize??null,sessionId:local.sessionId??null,skills:local.skills??null,materials:local.materials??null,schemaCheck:local.schemaCheck??null,cacheTtl:local.cacheTtl??null,/** the CLI's figure: a running total of the conversation, not this request */cliRunningUsd:local.apiEquivalentUsd??null,/** this request, from its tokens at its model's prices */apiEquivalentUsd:(local.usage&&s.pricing?tokenPricedUsd(local.usage as Parameters<typeof tokenPricedUsd>[0],s.pricing as Parameters<typeof tokenPricedUsd>[1]):undefined)??null,durationMs:local.durationMs??null,stopReason:local.stopReason??null,recordPath:local.recordPath??null,unknownFailure:local.unknownFailure??null},
  directorCallId:s.directorCallId??null,maxOutputTokens:s.maxOutputTokens??null,requestInputCap:s.requestInputCap??null,directorRawInputBound:s.directorRawInputBound??null};
}
const csv=(v:unknown)=>{const t=v===null||v===undefined?'':typeof v==='object'?JSON.stringify(v):String(v);return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t;};
/** One line per request for a spreadsheet. */
export function requestsCsv(rows:ReturnType<typeof requestComposition>[]):string{
 const head=['at','role','directorRole','status','error','stage','conversation','turns','input','cached','cacheWrite','output','apiEquivalentUsd','roughTokens','largest parts','id'];
 return [head.join(','),...rows.map(r=>[r.at,r.role,r.directorRole,r.status,r.error,r.local.stage,(r.local.conversation as {kind?:string}|null)?.kind??'',r.local.turns,r.usage.input,r.usage.cached,r.usage.cacheWrite,r.usage.output,typeof r.local.apiEquivalentUsd==="number"?Number(r.local.apiEquivalentUsd.toFixed(4)):null,r.roughTokens,Object.entries(r.parts).slice(0,5).map(([k,n])=>`${k} ${n}`).join('; '),r.id].map(csv).join(','))].join('\n')+'\n';
}
/** The frozen run context without its pictures' bytes: the texts, versions and flags, and each picture's size. */
export function slimRunContext(ctx:Record<string,unknown>|null){
 if(!ctx)return null;const images=Array.isArray(ctx.images)?(ctx.images as Record<string,unknown>[]).map(i=>Object.fromEntries(Object.entries(i).map(([k,v])=>[k,typeof v==='string'&&v.length>2000?`[${Math.floor(v.length*3/4)} bytes]`:v]))):undefined;
 const flags=Object.fromEntries(['version','base','sha256','tokens','holds','planningChat','schemaInText','instructionsVersion','imageOwner','criticVersion','withoutSkill','stageEffort'].filter(k=>k in ctx).map(k=>[k,ctx[k]]));
 return redactValue({flags,system:ctx.system,brief:ctx.brief,stageSkills:ctx.stageSkills,roleSkills:ctx.roleSkills,materials:ctx.materials,...(images?{images}:{})});
}
/** The export's layout: every file it may write, so the owner and the reader know where to look. */
export const EXPORT_LAYOUT={
 'README.txt':'what this folder is, how it was made and what is left out',
 'summary/overview.json':'the run, its blocks, versions and flags, counts and the questions the export answers at a glance',
 'summary/requests.csv':'one line per model request: role, stage, conversation, tokens, largest parts',
 'summary/composition.json':'each request by the size of its parts',
 'database/<table>.json':'the run\'s rows of each table (redacted)',
 'steps/<n>-<role>-<id>.json':'one request: snapshot (redacted), prompt, output, usage',
 'device/run-context.json':'the frozen run context: system text, brief, stage skills, versions and flags (no picture bytes)',
 'device/sessions/<session>.jsonl':'the Local Claude conversation transcripts found on this computer (pictures removed)',
 'device/requests/<n>-<role>.json':'the complete request as it was sent (pictures by hash, no bytes), when its record is on this computer',
 'device/materials.jsonl':'which materials each role asked for',
 'designer/<direction>/state.json':'the designer\'s saved state: turns, ideas, hero, reviews, notes',
 'designer/<direction>/workspace/…':'the final source (Frame.tsx and the files beside it), reports and the hero render',
} as const;
/** A file name safe on Windows and Linux. */
export const safeName=(text:string)=>text.replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'x';
/** Which workspace files are worth exporting: source, small reports, renders and pictures up to a size. */
export function workspaceFileWanted(path:string,bytes:number):boolean{
 if(neverExported(path))return false;
 if(/\.(tsx?|jsx?|json|css|md|txt|svg)$/i.test(path))return bytes<=2_000_000;
 if(/\.(png|jpe?g|webp)$/i.test(path))return bytes<=6_000_000;
 return false;
}
