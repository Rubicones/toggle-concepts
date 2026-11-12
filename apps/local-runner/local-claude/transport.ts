// The Claude Code CLI as a text transport (plan §7, S2). Same signature as submitText, so paidText and the workflow
// can take it without a second prompt builder: the prepared request is built by the shared builder, checked against
// its CLI projection, and sent through stdin. The receipt is typed (provider 'claude-cli'); it is never dressed up as
// an OpenRouter generation, and its zero money cost does not hide tokens, attempts or time.
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cliArgs,childEnv,hasUnexpectedCliTools,runCli,streamUserMessage,type CliEvent,type CliProfile,type CliResult} from '../../../packages/agents/claude-cli.local';
import {prepareTextRequest,projectCli,projectPrepared,projectionDifferences,toCliRequest,type ImageInput,type PreparedTextRequest} from '../../../packages/agents/prepared-request';
import {localModelFor,type LocalModelChoice} from '../../../packages/agents/local-models';
import {sharedLayout,sharedLayoutDifferences,type RunContext} from '../../../packages/agents/run-context';
import {textRequestQuote} from '../../../packages/agents/text-quote';
import type {TextReceipt,TextSnapshot} from '../../../packages/agents/text-provider';
import type {CapabilityProfile} from './qualify';

/** What a qualified device profile allows. Built once per runner start; a changed CLI needs a new qualification. */
export type LocalCliSetup={bin:string;cliVersion:string;isolation:CliProfile['isolation'];sonnet:string;schemaMode:'cli'|'plain';visual:boolean;deviceId:string;
 /** LC1: the device's CLI accepts --max-turns (qualified). */
 turnLimit?:boolean;
 /** LC1: every call runs in this one empty folder outside git (stable for the prompt cache and for sessions). */
 workDir?:string};
/** LC1: one plain answer is one turn; CLI-enforced structured output may take a few StructuredOutput attempts. */
export const TURN_LIMIT={plain:1,schema:4};
export function localSetupFrom(profile:CapabilityProfile):LocalCliSetup{
 if(profile.verdict.textRoles!=='ready')throw new Error('LOCAL_PROFILE_BLOCKED');
 const sonnet=profile.model.actual;if(!sonnet||!/^claude-sonnet-/.test(sonnet))throw new Error('LOCAL_MODEL_NOT_PINNED');
 const schema=profile.checks.find(c=>c.id==='schema-cli')?.status==='pass'?'cli':'plain';
 return {bin:profile.cli.bin,cliVersion:profile.cli.version,isolation:profile.isolation,sonnet,schemaMode:schema,visual:profile.verdict.visualRoles==='ready',deviceId:profile.device.id,...(profile.capabilities?.maxTurns==='exact'?{turnLimit:true}:{})};
}

/** Everything the CLI call showed, kept apart from the receipt fields the ledger already stores. */
export type LocalTextDetails={
 transport:'claude-cli';mapping:LocalModelChoice;semanticInputHash:string;schemaMode:'cli'|'plain'|'none';unsupported:string[];
 cliVersion:string;executedModel?:string;sessionId?:string;apiKeySource?:string;
 internalAttempts:number;numTurns?:number;stopReason?:string|null;durationMs:number;exitCode:number|null;limitReached?:boolean;
 /** LC0: the effort asked for and the CLI's API-equivalent price (subscription quota, not money). */
 effort?:string;apiEquivalentUsd?:number;
 usage?:CliResult['usage'];events:CliEvent[];stderr:string;recordPath?:string;
 /** Hypothetical text cost on the target model (plan §9, quantity 3): Sonnet's tokens at the target's prices. A forecast
  * with an unmeasured error, never an actual cost or a receipt. */
 forecast?:{targetModel:string;microUsd:number;method:'cli-tokens-x-target-price@1';errorMeasured:false};
 /** LC2: the shared run context this request started with ('shared' runs). */
 sharedContext?:{sha256:string;tokens:number;holds:RunContext['holds'];images:number};
};
export type LocalTextReceipt=TextReceipt&{provider:'claude-cli';local?:LocalTextDetails};

const finishOf=(stop:string|null|undefined)=>stop==='end_turn'||stop==='stop_sequence'?'stop':stop==='max_tokens'?'length':stop==='refusal'?'content_filter':stop??null;

/** Token counts in the shape the existing allowance accounting reads, plus the CLI's own numbers unchanged. */
function usageOf(r:CliResult,d:Omit<LocalTextDetails,'events'|'stderr'>){
 const u=r.usage??{},cacheRead=u.cache_read_input_tokens??0,cacheWrite=u.cache_creation_input_tokens??0;
 return r.usage?{prompt_tokens:(u.input_tokens??0)+cacheRead+cacheWrite,completion_tokens:u.output_tokens??0,prompt_tokens_details:{cached_tokens:cacheRead,cache_write_tokens:cacheWrite},_local:d}:{_local:d};
}

export function cliTextTransport(setup:LocalCliSetup,options:{signal?:AbortSignal;record?:(p:PreparedTextRequest)=>Promise<string>;onEvent?:(e:CliEvent)=>void;
 /** LC2: the frozen run context of a 'shared' run; null keeps the fresh layout (for example before the brand is accepted). */
 shared?:()=>Promise<RunContext|null>}={}){
 return async function cliText(model:string,prompt:string,cfg:TextSnapshot,images:ImageInput[]=[],requestTag?:string):Promise<LocalTextReceipt>{
  const refuse=(failure:string):LocalTextReceipt=>({provider:'claude-cli',outcome:'failed',cost:0,text:null,generation:null,usage:null,failure});
  // The same refusals as submitText, before anything is sent.
  if(cfg.outputFormat==='json_schema'&&!cfg.responseSchema)return refuse('RESPONSE_SCHEMA_REQUIRED');
  if(cfg.requestInputCap&&textRequestQuote(prompt,cfg,'',images.length).inputTokenBound>cfg.requestInputCap)return refuse('DRAFT_REQUEST_SIZE_CAP');
  if(images.length&&!setup.visual)return refuse('LOCAL_VISUAL_NOT_QUALIFIED');
  let mapping:LocalModelChoice;try{mapping=localModelFor(model,{sonnet:setup.sonnet});}catch(error){return refuse((error as Error).message);}
  const prepared=prepareTextRequest(model,prompt,cfg,images,{requestTag});
  let cli;try{cli=toCliRequest(prepared,{executionModel:mapping.execution,schemaMode:setup.schemaMode});}catch(error){return refuse((error as Error).message);}
  // The input check of plan §3.2 runs on every call, not only in tests.
  if(projectionDifferences(projectPrepared(prepared),projectCli(cli,prepared.output.schema?.schema)).length)return refuse('LOCAL_CONTEXT_MISMATCH');
  // LC2: in a 'shared' run every request starts with the same run context; the role's instructions and input follow it.
  const ctx=options.shared?await options.shared():null;
  if(ctx){const original=cli;cli=sharedLayout(original,prepared,ctx);if(sharedLayoutDifferences(cli,original,prepared,ctx).length)return refuse('LOCAL_CONTEXT_MISMATCH');}
  const recordPath=options.record?await options.record(prepared):undefined;
  const dir=await mkdtemp(join(tmpdir(),'toggle-cli-')),work=setup.workDir??join(dir,'work');
  try{
   await mkdir(work,{recursive:true});const systemFile=join(dir,'system.txt'),mcpFile=join(dir,'mcp.json');
   await writeFile(systemFile,cli.systemPrompt,{mode:0o600});await writeFile(mcpFile,'{"mcpServers":{}}');
   const argv=cliArgs({bin:setup.bin,model:cli.model,systemPromptFile:systemFile,emptyMcpConfigFile:mcpFile,cwd:work,isolation:setup.isolation,...(setup.turnLimit?{maxTurns:cli.jsonSchema?TURN_LIMIT.schema:TURN_LIMIT.plain}:{}),...(cli.jsonSchema?{jsonSchema:cli.jsonSchema}:{}),...(cli.effort?{effort:cli.effort}:{})});
   // Same time limits as the OpenRouter path for the same snapshot.
   const timeoutMs=cfg.stream?Math.max(1,Math.min(cfg.timeoutMs??600000,1800000)):Math.max(1,Math.min(cfg.timeoutMs??Math.max(100000,60000+cfg.maxOutputTokens*16),900000));
   // A leaked tool, MCP server or API key ends the call at once: the answer would not be comparable.
   const stop=new AbortController();let leak:string|undefined;const relay=()=>stop.abort();options.signal?.addEventListener('abort',relay,{once:true});
   const r=await runCli({bin:setup.bin,argv,cwd:work,env:childEnv(process.env,{CLAUDE_CODE_MAX_OUTPUT_TOKENS:String(cli.maxOutputTokens)}),stdin:streamUserMessage(cli.parts),timeoutMs,signal:stop.signal,
    onEvent:e=>{if(e.type==='system'&&e.subtype==='init'){if(hasUnexpectedCliTools(e.tools,e.mcp_servers,cli.jsonSchema!==undefined))leak='LOCAL_ISOLATION_BROKEN';else if(e.apiKeySource&&e.apiKeySource!=='none')leak='LOCAL_NOT_SUBSCRIPTION';if(leak)stop.abort();}options.onEvent?.(e);}});
   options.signal?.removeEventListener('abort',relay);
   const u=r.usage,p=cfg.pricing,forecast=u?{targetModel:model,microUsd:Math.ceil(((u.input_tokens??0)*p.inputPrice+(u.cache_read_input_tokens??0)*(p.cacheReadPrice??p.inputPrice)+(u.cache_creation_input_tokens??0)*(p.cacheWritePrice??p.inputPrice)+(u.output_tokens??0)*p.outputPrice)*1e6),method:'cli-tokens-x-target-price@1' as const,errorMeasured:false as const}:undefined;
   const details:Omit<LocalTextDetails,'events'|'stderr'>={transport:'claude-cli',mapping,semanticInputHash:prepared.semanticInputHash,schemaMode:cli.schemaMode,unsupported:cli.unsupported,cliVersion:r.init?.cliVersion??setup.cliVersion,
    ...(r.init?.model?{executedModel:r.init.model}:{}),...(r.init?.sessionId?{sessionId:r.init.sessionId}:{}),...(r.init?.apiKeySource?{apiKeySource:r.init.apiKeySource}:{}),
    internalAttempts:r.internalAttempts,...(r.numTurns!==undefined?{numTurns:r.numTurns}:{}),...(cli.effort?{effort:cli.effort}:{}),...(r.apiEquivalentUsd!==undefined?{apiEquivalentUsd:r.apiEquivalentUsd}:{}),stopReason:r.stopReason??null,durationMs:r.durationMs,exitCode:r.exitCode,...(r.limitReached?{limitReached:true}:{}),...(r.usage?{usage:r.usage}:{}),...(recordPath?{recordPath}:{}),...(forecast?{forecast}:{}),...(ctx?{sharedContext:{sha256:ctx.sha256,tokens:ctx.tokens,holds:ctx.holds,images:prepared.attachments.filter(a=>a.prefix).length}}:{})};
   const local:LocalTextDetails={...details,events:r.events,stderr:r.stderr},usage=usageOf(r,details),base={provider:'claude-cli' as const,generation:null,usage,local};
   if(leak)return {...base,outcome:'failed',cost:0,text:null,failure:leak};
   if(r.outcome==='cancelled')return {...base,outcome:'unknown',cost:null,text:null,failure:'CANCELLED'};
   // No terminal result: whether the model worked is not known. Never retried blindly; partial text stays diagnostic.
   if(r.outcome==='unknown')return {...base,outcome:'unknown',cost:null,text:null,failure:r.failure??'CLI_NO_RESULT'};
   if(r.outcome==='failed')return {...base,outcome:'failed',cost:0,text:null,failure:r.failure??'CLI_ERROR'};
   const text=r.structured!==undefined?JSON.stringify(r.structured):r.text;
   // Claude Code can finish with StructuredOutput as the final tool call and return its JSON in the terminal event.
   const structuredToolStop=cli.jsonSchema!==undefined&&r.resultSubtype==='success'&&r.stopReason==='tool_use'&&r.structured!=null;
   const finishReason=structuredToolStop?'stop':finishOf(r.stopReason);
   // The same failure codes as the OpenRouter path, so the existing validation and recovery paths apply.
   const failure=!text?'TEXT_MISSING':finishReason==='length'?'OUTPUT_TOKEN_LIMIT':finishReason==='content_filter'?'PROVIDER_CONTENT_FILTER':finishReason!=='stop'?'PROVIDER_FINISH_REASON_UNEXPECTED':null;
   return {...base,outcome:failure?'failed':'succeeded',cost:0,text:text||null,finishReason,failure};
  }finally{await rm(dir,{recursive:true,force:true});}
 };
}
