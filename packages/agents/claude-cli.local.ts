// Local / OpenRouter (docs/plans/2026-11-06-local-claude-pipeline-plan.md, §7): runs one model call through the
// official Claude Code CLI on the user's own device, under their own subscription. Node only: imported by local
// workers, never by the browser or a hosted route. One process per call; no resume; the request is written to stdin
// as stream-json, never put on the command line.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

export type CliPart={type:'text';text:string}|{type:'image';mediaType:string;dataBase64:string};

/** The launch profile: what isolates the call and what the CLI is asked to do. Recorded with every result. */
export type CliProfile={
 bin:string;model:string;systemPromptFile:string;emptyMcpConfigFile:string;cwd:string;
 /** Flags qualified for the installed version (S0); each is optional because versions differ. */
 isolation:{safeMode?:boolean;restricted?:boolean;noSessionPersistence?:boolean;settingSources?:string;disableSlashCommands?:boolean};
 jsonSchema?:unknown;includePartialMessages?:boolean;effort?:string;
 /** LC1: the most turns one call may take (hidden but accepted CLI flag; used only when the device qualified it). */
 maxTurns?:number;
 /** LC3: continue a stored session (its history is the cached prefix); fork it to branch without changing it. */
 resume?:string;forkSession?:boolean;
};

/** Arguments for one call. Never contains the request itself. */
export function cliArgs(profile:CliProfile):string[]{
 const i=profile.isolation;
 return ['-p','--input-format','stream-json','--output-format','stream-json','--verbose',
  '--model',profile.model,'--system-prompt-file',profile.systemPromptFile,
  '--tools','','--strict-mcp-config','--mcp-config',profile.emptyMcpConfigFile,
  ...(i.safeMode?['--safe-mode']:[]),...(i.restricted?['--restricted']:[]),...(i.noSessionPersistence?['--no-session-persistence']:[]),
  ...(i.settingSources!==undefined?['--setting-sources',i.settingSources]:[]),...(i.disableSlashCommands?['--disable-slash-commands']:[]),
  ...(profile.effort?['--effort',profile.effort]:[]),
  ...(profile.maxTurns?['--max-turns',String(profile.maxTurns)]:[]),
  ...(profile.resume?['--resume',profile.resume,...(profile.forkSession?['--fork-session']:[])]:[]),
  ...(profile.includePartialMessages?['--include-partial-messages']:[]),
  ...(profile.jsonSchema!==undefined?['--json-schema',JSON.stringify(profile.jsonSchema)]:[])];
}

/** Variables the CLI may see. An allowlist: application keys (OpenRouter, R2, Supabase, Anthropic API) never reach it,
 * so the call cannot switch to API billing or touch the studio's storage. Login works through the user's own
 * keychain / config directory. */
// Windows keeps its own names (Path, PATHEXT, ComSpec…) and Claude Code there needs Git Bash (CLAUDE_CODE_GIT_BASH_PATH);
// names are matched without case because Windows environment names are case-insensitive. BROWSER and the WSL
// variables let the sign-in open the Windows browser from Ubuntu, so no code has to be pasted.
const CHILD_ENV=/^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|LANG|LC_[A-Z_]+|TZ|TERM|COLORTERM|XDG_[A-Z_]+|CLAUDE_CONFIG_DIR|CLAUDE_CODE_GIT_BASH_PATH|BROWSER|WSL_DISTRO_NAME|WSL_INTEROP|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|PATHEXT|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|COMMONPROGRAMFILES|APPDATA|LOCALAPPDATA|USERPROFILE|USERNAME|USERDOMAIN|COMPUTERNAME|HOMEDRIVE|HOMEPATH|OS|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|HTTPS_PROXY|HTTP_PROXY|NO_PROXY)$/i;
export type Env=Record<string,string|undefined>;
export function childEnv(parent:Env,extra:Record<string,string>={}):NodeJS.ProcessEnv{
 const env:Env={};for(const [k,v] of Object.entries(parent))if(v!==undefined&&CHILD_ENV.test(k))env[k]=v;
 return {...env,...extra} as NodeJS.ProcessEnv;
}

/** Variables in a person's shell that would move Claude Code off the subscription. childEnv never passes them on. */
export const BILLING_VARIABLES=['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY'];

/** One user message in stream-json, with text and base64 images in the order given. */
export function streamUserMessage(parts:CliPart[]){
 return JSON.stringify({type:'user',message:{role:'user',content:parts.map(p=>p.type==='text'?{type:'text',text:p.text}:{type:'image',source:{type:'base64',media_type:p.mediaType,data:p.dataBase64}})}})+'\n';
}

export type CliEvent=Record<string,unknown>&{type?:string;subtype?:string};

/** The CLI registers StructuredOutput itself when launched with --json-schema. */
export function hasUnexpectedCliTools(tools: unknown, mcpServers: unknown, withSchema: boolean): boolean {
 const allowedTools = tools == null || Array.isArray(tools) && (
  tools.length === 0 || withSchema && tools.length === 1 && tools[0] === 'StructuredOutput'
 );
 return !allowedTools || !(mcpServers == null || Array.isArray(mcpServers) && mcpServers.length === 0);
}

export type CliResult={
 outcome:'succeeded'|'failed'|'cancelled'|'unknown';
 /** The final text, and the structured output when the CLI enforced a schema. */
 text:string|null;structured?:unknown;
 /** From the init event: what the process could actually see. */
 init?:{model?:string;tools?:unknown[];mcpServers?:unknown[];apiKeySource?:string;cliVersion?:string;sessionId?:string};
 usage?:{input_tokens?:number;output_tokens?:number;cache_creation_input_tokens?:number;cache_read_input_tokens?:number};
 /** Internal attempts the CLI made inside this one call (StructuredOutput tool calls), separate from engine retries. */
 internalAttempts:number;numTurns?:number;stopReason?:string|null;resultSubtype?:string;isError?:boolean;
 /** The CLI's own API-equivalent price of the call (total_cost_usd). On a subscription this is a relative measure, not money spent. */
 apiEquivalentUsd?:number;
 /** Set when the CLI reports a subscription limit; the task waits instead of failing. */
 limitReached?:boolean;failure?:string;durationMs:number;exitCode:number|null;
 events:CliEvent[];stderr:string;
};

const LIMIT=/usage limit|rate limit|limit reached|out of (?:extra )?usage|5-hour limit|weekly limit/i;

/** Runs one call: spawn without a shell, write the message to stdin, read events until the terminal result. */
export async function runCli(args:{bin:string;argv:string[];cwd:string;env:NodeJS.ProcessEnv;stdin:string;timeoutMs:number;signal?:AbortSignal;onEvent?:(e:CliEvent)=>void}):Promise<CliResult>{
 const started=Date.now(),events:CliEvent[]=[];let stderr='',internalAttempts=0,result:CliEvent|undefined,init:CliResult['init'],partialText='';
 const child=spawn(args.bin,args.argv,{cwd:args.cwd,env:args.env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
 // Cancellation and the time limit end the whole process group, so no descendant keeps working.
 const kill=()=>{try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM');}catch{/* already gone */}};
 let reason:'cancelled'|'timeout'|undefined;
 const timer=setTimeout(()=>{reason='timeout';kill();},args.timeoutMs);
 const abort=()=>{reason='cancelled';kill();};args.signal?.addEventListener('abort',abort,{once:true});
 child.stderr.on('data',c=>{if(stderr.length<16000)stderr+=String(c);});
 const lines=createInterface({input:child.stdout});
 lines.on('line',line=>{
  if(!line.trim())return;let e:CliEvent;try{e=JSON.parse(line);}catch{e={type:'unparsed',line:line.slice(0,2000)};}
  events.push(e);args.onEvent?.(e);
  if(e.type==='system'&&e.subtype==='init')init={model:e.model as string,tools:e.tools as unknown[],mcpServers:e.mcp_servers as unknown[],apiKeySource:e.apiKeySource as string,cliVersion:(e.claude_code_version??e.version) as string|undefined,sessionId:e.session_id as string};
  if(e.type==='assistant'){const content=((e.message as {content?:{type:string;name?:string;text?:string}[]})?.content)??[];for(const c of content){if(c.type==='tool_use'&&c.name==='StructuredOutput')internalAttempts++;if(c.type==='text'&&c.text)partialText+=c.text;}}
  if(e.type==='result')result=e;
 });
 // Backpressure: wait for the pipe to drain before closing stdin.
 await new Promise<void>((done,fail)=>{child.stdin.on('error',()=>done());if(child.stdin.write(args.stdin))child.stdin.end(done);else child.stdin.once('drain',()=>child.stdin.end(done));child.once('error',fail);}).catch(()=>undefined);
 const exitCode=await new Promise<number|null>(done=>{child.once('close',code=>done(code));child.once('error',()=>done(null));});
 clearTimeout(timer);args.signal?.removeEventListener('abort',abort);
 const durationMs=Date.now()-started,base={events,stderr,durationMs,exitCode,internalAttempts,init};
 if(reason==='cancelled')return {...base,outcome:'cancelled',text:null,failure:'CANCELLED'};
 // A terminal result event establishes completion; an exit code alone does not.
 if(!result){const limited=LIMIT.test(stderr);return {...base,outcome:'unknown',text:partialText||null,failure:reason==='timeout'?'CLI_TIMEOUT':limited?'SUBSCRIPTION_LIMIT':'CLI_NO_RESULT',...(limited?{limitReached:true}:{})};}
 const isError=result.is_error===true,text=typeof result.result==='string'?result.result:null,limited=isError&&LIMIT.test(`${text??''} ${stderr}`);
 return {...base,outcome:isError?'failed':'succeeded',text,...(result.structured_output!==undefined?{structured:result.structured_output}:{}),
  usage:result.usage as CliResult['usage'],numTurns:result.num_turns as number|undefined,...(typeof result.total_cost_usd==='number'?{apiEquivalentUsd:result.total_cost_usd}:{}),stopReason:(result.stop_reason as string|null|undefined)??null,resultSubtype:result.subtype as string|undefined,isError,
  ...(limited?{limitReached:true,failure:'SUBSCRIPTION_LIMIT'}:isError?{failure:`CLI_${String(result.subtype??'error').toUpperCase()}`}:{})};
}
