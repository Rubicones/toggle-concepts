// The Claude Code CLI as a text transport (plan §7, S2). Same signature as submitText, so paidText and the workflow
// can take it without a second prompt builder: the prepared request is built by the shared builder, checked against
// its CLI projection, and sent through stdin. The receipt is typed (provider 'claude-cli'); it is never dressed up as
// an OpenRouter generation, and its zero money cost does not hide tokens, attempts or time.
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cliArgs,childEnv,hasUnexpectedCliTools,runCli,streamUserMessage,type CliEvent,type CliProfile,type CliResult} from '../../../packages/agents/claude-cli.local';
import {SINGLE_ANSWER_ROLES,budgetLeft,materialBudgetFor,materialRequestInstruction,readWrapped,withMaterialRequest,type MaterialEntry} from '../../../packages/agents/materials';
import {fetchMaterials,materialsUsed} from './materials';
import type {PictureReader} from './pack-images';
import {createHash} from 'node:crypto';
import {parseDataUrl,prepareTextRequest,projectCli,projectPrepared,projectionDifferences,toCliRequest,type ImageInput,type PreparedTextRequest,type CliTextRequest} from '../../../packages/agents/prepared-request';
import {localModelFor,type LocalModelChoice} from '../../../packages/agents/local-models';
import {sharedLayout,sharedLayoutDifferences,continuingLayout,type RunContext} from '../../../packages/agents/run-context';
import type {Plan} from '../../../packages/agents/local-session';
import {lastCallSize} from '../../../packages/agents/local-session';
import {stageMessage,stageSkillIds,requestStage} from '../../../packages/agents/stage-skills';
import {positiveText,POSITIVE_VERSION} from '../../../packages/agents/positive-instructions';
import {usesSchemaInText,schemaIssues,readJsonAnswer,answerFormatText,repairText,MATERIALS_ANSWER_FORMAT} from '../../../packages/agents/schema-in-text';
import {usesPlanningChat,planningContextText,planningUpstreamText,planningMaterials} from '../../../packages/agents/planning-chat';
import {withoutBrandDuplicates} from '../../../packages/brand/brand-pack';
import {largestInputParts} from '../../../packages/agents/local-usage';
import {stageEffort,type StageId} from '../../../packages/agents/stage-effort';
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
 internalAttempts:number;/** C1: the conversation's size after the last model call (summed usage over-counts) */conversationSize?:number;numTurns?:number;stopReason?:string|null;durationMs:number;exitCode:number|null;limitReached?:boolean;
 /** LC0: the effort asked for and the CLI's API-equivalent price (subscription quota, not money). */
 effort?:string;apiEquivalentUsd?:number;
 usage?:CliResult['usage'];events:CliEvent[];stderr:string;recordPath?:string;
 /** Hypothetical text cost on the target model (plan §9, quantity 3): Sonnet's tokens at the target's prices. A forecast
  * with an unmeasured error, never an actual cost or a receipt. */
 forecast?:{targetModel:string;microUsd:number;method:'cli-tokens-x-target-price@1';errorMeasured:false};
 /** LC2: the shared run context this request started with ('shared' runs); C2: the stored pack version it froze. */
 sharedContext?:{sha256:string;tokens:number;holds:RunContext['holds'];images:number;pack?:RunContext['pack']};
 /** LC3/LC4: how this request used a stored conversation. */
 conversation?:{kind:'new'|'continued'|'branched'|'condensed'|'restarted';resumedFrom?:string};
 /** LC5: the skills this request carried (common and its role's own). */
 skills?:string[];
 /** LC6: the stage whose effort this request used. */
 stage?:StageId;
 /** The first try did not answer in time; this is the second. */
 retriedAfterTimeout?:boolean;
 /** C7: the prompt-cache lifetime the CLI wrote in this request, read from its usage ('1h' when any one-hour write). */
 cacheTtl?:'1h'|'5m';
 /** C3: the one round of materials a single-answer role asked for (names attached and refused with the reason). */
 materials?:{asked:string[];attached:string[];refused:string[]};
 /** C7 follow-up: a text answer that did not fit its format at first (repaired in the same conversation) or at all. */
 schemaCheck?:{repaired:boolean;issues:string[]};
 /** C7b: the answer format travelled as text (the C10 report counts these answers for the repair rate). */
 answerFormat?:'text';
};
export type LocalTextReceipt=TextReceipt&{provider:'claude-cli';local?:LocalTextDetails};

/** C2 (second part): a request's pictures without those the run context's pack already opens with (same stored bytes). */
export function withoutPackPictures(images:ImageInput[],ctx:RunContext|null){
 const sources=new Set((ctx?.images??[]).map(i=>i.source));if(!sources.size)return images;
 return images.filter(i=>{const d=parseDataUrl(i.url);return !d||!sources.has(createHash('sha256').update(Buffer.from(d.dataBase64,'base64')).digest('hex'));});
}

/** C7: which cache lifetime a call wrote, from the API usage the CLI passes on (cache_creation.ephemeral_1h/5m). */
export function cacheLifetime(usage:unknown):'1h'|'5m'|undefined{
 const c=(usage as {cache_creation?:{ephemeral_1h_input_tokens?:number;ephemeral_5m_input_tokens?:number}}|undefined)?.cache_creation;
 return c?.ephemeral_1h_input_tokens?'1h':c?.ephemeral_5m_input_tokens?'5m':undefined;
}

/** C3: two calls of one request (the material round and the answer) as one result: the answer, the summed usage. */
export function mergeCalls(a:CliResult,b:CliResult):CliResult{
 const add=(k:'input_tokens'|'output_tokens'|'cache_creation_input_tokens'|'cache_read_input_tokens')=>(a.usage?.[k]??0)+(b.usage?.[k]??0);
 return {...b,usage:a.usage||b.usage?{input_tokens:add('input_tokens'),output_tokens:add('output_tokens'),cache_creation_input_tokens:add('cache_creation_input_tokens'),cache_read_input_tokens:add('cache_read_input_tokens')}:undefined,
  internalAttempts:a.internalAttempts+b.internalAttempts,numTurns:(a.numTurns??0)+(b.numTurns??0),durationMs:a.durationMs+b.durationMs,events:[...a.events,...b.events],stderr:a.stderr+b.stderr,
  ...(a.apiEquivalentUsd!==undefined||b.apiEquivalentUsd!==undefined?{apiEquivalentUsd:(a.apiEquivalentUsd??0)+(b.apiEquivalentUsd??0)}:{})};
}

const finishOf=(stop:string|null|undefined)=>stop==='end_turn'||stop==='stop_sequence'?'stop':stop==='max_tokens'?'length':stop==='refusal'?'content_filter':stop??null;

/** Token counts in the shape the existing allowance accounting reads, plus the CLI's own numbers unchanged. */
function usageOf(r:CliResult,d:Omit<LocalTextDetails,'events'|'stderr'>){
 const u=r.usage??{},cacheRead=u.cache_read_input_tokens??0,cacheWrite=u.cache_creation_input_tokens??0;
 return r.usage?{prompt_tokens:(u.input_tokens??0)+cacheRead+cacheWrite,completion_tokens:u.output_tokens??0,prompt_tokens_details:{cached_tokens:cacheRead,cache_write_tokens:cacheWrite},_local:d}:{_local:d};
}

/** How many tokens one model turn may produce. Claude Code counts thinking and the answer against one limit, so a
 * request sized for its answer alone (32,768 for a designer turn) was cut off mid-answer once thinking at high effort
 * had used part of it; the CLI then asked again in a new internal turn, re-reading the whole input each time (measured
 * on 12 November: one designer request read 532k tokens and wrote 66k for one answer). The limit is the answer plus
 * room to think at the request's effort, up to 64,000. */
export const CLI_OUTPUT_CEILING=64000;
export function cliOutputRoom(answerTokens:number,effort?:string){
 const thinking=({low:4000,medium:12000,high:32000,xhigh:48000,max:48000} as Record<string,number>)[effort??'']??0;
 return Math.max(answerTokens,Math.min(CLI_OUTPUT_CEILING,answerTokens+thinking));
}
/** A Local request is bounded by what it may write (its output-token limit) and by the role's token and request
 * allowances. Time is only a guard against a stuck process: five minutes of complete silence once the answer has
 * started streaming, and a total limit as the last resort. */
export const CLI_SILENCE_MS=300000;
/** How long one Local answer may take. The OpenRouter limit for a plain request is sized by its answer length, but
 * Claude Code also spends time thinking (not counted in the answer) and reading a large context, so a Local request
 * gets at least fifteen minutes; an explicit limit on the request still applies, up to thirty minutes. */
export function cliTimeoutMs(cfg:Pick<TextSnapshot,'stream'|'timeoutMs'|'maxOutputTokens'>){
 if(cfg.stream)return Math.max(1,Math.min(cfg.timeoutMs??600000,1800000));
 return Math.max(1,Math.min(cfg.timeoutMs??Math.max(900000,60000+cfg.maxOutputTokens*16),1800000));
}
export function cliTextTransport(setup:LocalCliSetup,options:{signal?:AbortSignal;record?:(p:PreparedTextRequest)=>Promise<string>;onEvent?:(e:CliEvent)=>void;
 /** LC2: the frozen run context of a 'shared' run; null keeps the fresh layout (for example before the brand is accepted). */
 shared?:()=>Promise<RunContext|null>;
 /** LC3/LC4: continue (or branch from) a stored conversation; null starts a new, persisted one. Shared runs only. */
 session?:()=>Promise<Plan>;
 /** LC5: the requesting role's skill key, so its own skills follow its instructions. LC6: the stage of a request. */
 role?:string;stage?:StageId;
 /** C3: the run whose material budget a single-answer role spends (its context must hold materials). */
 runId?:string;readPicture?:PictureReader;
 /** C7: ask the CLI for its one-hour prompt cache (CLAUDE_CODE_PROMPT_CACHE_TTL, found in the installed CLI 2.1.x); the
  * usage then shows which lifetime was written. Long conversations whose turns wait for renders and pictures. */
 longCache?:boolean;
 /** C9: more materials this request may ask for by name (visual direction: the full brand sheet's pages). */
 materials?:MaterialEntry[]}={}){
 return async function cliText(model:string,prompt:string,cfg:TextSnapshot,images:ImageInput[]=[],requestTag?:string):Promise<LocalTextReceipt>{
  // The version 4/5 designer's own role line travels beside the frozen instructions (which the database admits the
  // request against) and is what the request sends.
  if(cfg.roleInstructions!==undefined){const {roleInstructions,...rest}=cfg;cfg={...rest,instructions:roleInstructions};}
  const refuse=(failure:string):LocalTextReceipt=>({provider:'claude-cli',outcome:'failed',cost:0,text:null,generation:null,usage:null,failure});
  // The same refusals as submitText, before anything is sent.
  if(cfg.outputFormat==='json_schema'&&!cfg.responseSchema)return refuse('RESPONSE_SCHEMA_REQUIRED');
  if(cfg.requestInputCap&&textRequestQuote(prompt,cfg,'',images.length).inputTokenBound>cfg.requestInputCap)return refuse('DRAFT_REQUEST_SIZE_CAP');
  if(images.length&&!setup.visual)return refuse('LOCAL_VISUAL_NOT_QUALIFIED');
  let mapping:LocalModelChoice;try{mapping=localModelFor(model,{sonnet:setup.sonnet});}catch(error){return refuse((error as Error).message);}
  // C2: with a brand pack in the run context, the request does not repeat the brand (the frozen snapshot is unchanged).
  const packed=options.shared?await options.shared():null,unpacked=packed?.holds.brandPack&&cfg.campaignContext!==undefined?{...cfg,campaignContext:withoutBrandDuplicates(cfg.campaignContext)}:cfg;
  // C9: in contexts frozen with the planning chat, a chain role reads the campaign context as plain text and the earlier
  // stages in short; their full results are materials it may ask for. The frozen snapshot is unchanged.
  const planningChat=usesPlanningChat(packed,options.role),sent=planningChat?{...unpacked,contextText:planningContextText(unpacked.campaignContext),upstreamText:planningUpstreamText(cfg.upstream as Parameters<typeof planningUpstreamText>[0])}:unpacked;
  // C2 (second part): the pack's pictures open every request; a request's own copy of one of them is not sent again.
  // D3: in contexts frozen with positive instructions, the instruction sentences are sent as targets (only what is sent).
  const positive=packed?.instructionsVersion===POSITIVE_VERSION,said=positive?positiveText(prompt):prompt,told=positive?{...sent,instructions:positiveText(sent.instructions),...(sent.protocolInstructions?{protocolInstructions:positiveText(sent.protocolInstructions)}:{})}:sent;
  const prepared=prepareTextRequest(model,said,told,withoutPackPictures(images,packed),{requestTag});
  // C7 follow-up (C0 6d): in contexts frozen with it, a planning role's answer format travels as text, not as a
  // per-role tool before the system prompt, so every role reads the same cached prefix; the app checks the answer below.
  const textSchema=usesSchemaInText(packed,options.role)&&!!prepared.output.schema,schemaMode=textSchema?'plain' as const:setup.schemaMode;
  let cli:CliTextRequest;try{cli=toCliRequest(prepared,{executionModel:mapping.execution,schemaMode});}catch(error){return refuse((error as Error).message);}
  // The input check of plan §3.2 runs on every call, not only in tests.
  if(projectionDifferences(projectPrepared(prepared),projectCli(cli,prepared.output.schema?.schema)).length)return refuse('LOCAL_CONTEXT_MISMATCH');
  // LC2: in a 'shared' run every request starts with the same run context; the role's instructions and input follow it.
  const ctx=packed;
  // D1: in contexts with skills by stage, the stage's skill message follows the role heading (principles for creators,
  // checks and signs for the critic).
  // D5: a critic@2 request carries its own stage's checks and signs in its context, so no D1 critic message is added.
  const stageText=ctx?.stageSkills&&!(options.role==='critic'&&ctx.criticVersion)?stageMessage(ctx.stageSkills,options.role,options.stage):'';
  if(ctx){const original=cli;cli=sharedLayout(original,prepared,ctx,options.role,stageText);if(sharedLayoutDifferences(cli,original,prepared,ctx,options.role,stageText).length)return refuse('LOCAL_CONTEXT_MISMATCH');}
  // LC6: in a shared run the effort follows the stage (frozen with the run context), after the layout checks above.
  const stage=ctx&&options.stage&&!prepared.reasoning.disabled?options.stage:undefined;if(stage)cli={...cli,effort:stageEffort(stage,ctx!.stageEffort)};
  const skillsUsed=ctx?.stageSkills?stageSkillIds(ctx.stageSkills,options.role,options.stage):ctx?[...ctx.holds.skills,...(options.role?ctx.roleSkills?.[options.role]??[]:[]).map(s=>s.id)]:[];
  // LC3/LC4: a shared run's conversations are persisted; a continuation sends only what the history does not hold yet.
  const plan=ctx&&options.session?await options.session():null;let fullShared=cli;
  let conversation:LocalTextDetails['conversation']|undefined=ctx&&options.session?{kind:plan?.condensed?'condensed':'new'}:undefined;
  if(ctx&&plan&&!plan.condensed&&plan.resume){cli=continuingLayout(toCliRequest(prepared,{executionModel:mapping.execution,schemaMode}),prepared,ctx,plan,options.role,requestStage(options.role,options.stage)==='ideas'?'':stageText);if(stage)cli={...cli,effort:stageEffort(stage,ctx.stageEffort)};conversation={kind:plan.fork?'branched':'continued',resumedFrom:plan.resume};}
  // C3: a single-answer role in a run with materials may first ask for up to four catalogue entries (one round); its
  // schema then has two branches, and the app answers in the same conversation with the role's own schema.
  const original=textSchema?prepared.output.schema!.schema:cli.jsonSchema,budget=ctx?.materials&&options.role?materialBudgetFor(options.role,ctx.materials.budget):null;
  const materialsOn=!!(ctx?.materials&&options.runId&&original&&budget&&budget.count>0&&(SINGLE_ANSWER_ROLES as readonly string[]).includes(options.role??''));
  let left={count:0};
  if(materialsOn){left=budgetLeft(options.role!,budget!,await materialsUsed(options.runId!));
   const offer=(c:CliTextRequest):CliTextRequest=>({...c,...(textSchema?{}:{jsonSchema:withMaterialRequest(original!)}),parts:[...c.parts,{type:'text',text:materialRequestInstruction(left)}]});cli=offer(cli);fullShared=offer(fullShared);}
  // The answer format closes the role's message, after the shared prefix (with materials: the two-branch format).
  const answerSchema=textSchema?(materialsOn?withMaterialRequest(original!):original!):undefined;
  if(answerSchema){const add=(c:CliTextRequest):CliTextRequest=>({...c,parts:[...c.parts,{type:'text',text:answerFormatText(answerSchema)}]});cli=add(cli);fullShared=add(fullShared);}
  const persist=!!conversation||materialsOn||textSchema;let resume=plan&&!plan.condensed&&plan.resume?{resume:plan.resume,fork:plan.fork}:null;
  const inputParts=largestInputParts((sent as {campaignContext?:unknown}).campaignContext);
  const recordPath=options.record?await options.record(prepared):undefined;
  const dir=await mkdtemp(join(tmpdir(),'toggle-cli-')),work=setup.workDir??join(dir,'work');
  try{
   await mkdir(work,{recursive:true});const systemFile=join(dir,'system.txt'),mcpFile=join(dir,'mcp.json');
   await writeFile(systemFile,cli.systemPrompt,{mode:0o600});await writeFile(mcpFile,'{"mcpServers":{}}');
   // A stored conversation is resumed (and branched); a missing one (another device, cleared history) starts again once.
   let r:Awaited<ReturnType<typeof runCli>>,leak:string|undefined,timedOut=false;const stop=new AbortController();
   for(let attempt=0;;attempt++){
   const argv=cliArgs({includePartialMessages:true,bin:setup.bin,model:cli.model,systemPromptFile:systemFile,emptyMcpConfigFile:mcpFile,cwd:work,isolation:persist?{...setup.isolation,noSessionPersistence:false}:setup.isolation,...(resume?{resume:resume.resume,forkSession:resume.fork}:{}),...(setup.turnLimit?{maxTurns:cli.jsonSchema?TURN_LIMIT.schema:TURN_LIMIT.plain}:{}),...(cli.jsonSchema?{jsonSchema:cli.jsonSchema}:{}),...(cli.effort?{effort:cli.effort}:{})});
   // Streamed requests keep the OpenRouter limits; plain ones get the time Claude Code needs to think (cliTimeoutMs).
   const timeoutMs=cliTimeoutMs(cfg);
   // A leaked tool, MCP server or API key ends the call at once: the answer would not be comparable.
   const relay=()=>stop.abort();options.signal?.addEventListener('abort',relay,{once:true});
   r=await runCli({bin:setup.bin,argv,cwd:work,env:childEnv(process.env,{CLAUDE_CODE_MAX_OUTPUT_TOKENS:String(cliOutputRoom(cli.maxOutputTokens,cli.effort)),...(options.longCache?{CLAUDE_CODE_PROMPT_CACHE_TTL:'1h'}:{})}),stdin:streamUserMessage(cli.parts),timeoutMs,idleMs:CLI_SILENCE_MS,signal:stop.signal,
    onEvent:e=>{if(e.type==='system'&&e.subtype==='init'){if(hasUnexpectedCliTools(e.tools,e.mcp_servers,cli.jsonSchema!==undefined))leak='LOCAL_ISOLATION_BROKEN';else if(e.apiKeySource&&e.apiKeySource!=='none')leak='LOCAL_NOT_SUBSCRIPTION';if(leak)stop.abort();}options.onEvent?.(e);}});
   options.signal?.removeEventListener('abort',relay);
   if(attempt===0&&resume&&r.outcome==='failed'&&/no conversation found/i.test(`${r.text??''} ${r.stderr}`)){
    // C1: a request that carries only what the stored conversation lacked would start over without the work: the
    // caller rebuilds the full request instead (CONVERSATION_MISSING, nothing charged).
    if(plan&&!plan.condensed&&plan.shortPayload)return {provider:'claude-cli',outcome:'failed',cost:0,text:null,generation:null,usage:null,failure:'CONVERSATION_MISSING'};
    cli=fullShared;resume=null;conversation={kind:'restarted'};continue;}
   // An answer that did not arrive in time cost nothing on the subscription: ask once more before giving up.
   if(attempt===0&&(r.failure==='CLI_TIMEOUT'||r.failure==='CLI_STALLED')&&!options.signal?.aborted){timedOut=true;continue;}
   break;}
   // A further call in the same stored conversation (materials, or the answer format's one repair turn).
   const again=async(sessionId:string,parts:CliTextRequest['parts'],jsonSchema?:Record<string,unknown>)=>{
    const argv=cliArgs({includePartialMessages:true,bin:setup.bin,model:cli.model,systemPromptFile:systemFile,emptyMcpConfigFile:mcpFile,cwd:work,isolation:{...setup.isolation,noSessionPersistence:false},resume:sessionId,forkSession:false,...(setup.turnLimit?{maxTurns:jsonSchema?TURN_LIMIT.schema:TURN_LIMIT.plain}:{}),...(jsonSchema?{jsonSchema}:{}),...(cli.effort?{effort:cli.effort}:{})});
    const relay=()=>stop.abort();options.signal?.addEventListener('abort',relay,{once:true});
    const next=await runCli({bin:setup.bin,argv,cwd:work,env:childEnv(process.env,{CLAUDE_CODE_MAX_OUTPUT_TOKENS:String(cliOutputRoom(cli.maxOutputTokens,cli.effort)),...(options.longCache?{CLAUDE_CODE_PROMPT_CACHE_TTL:'1h'}:{})}),stdin:streamUserMessage(parts),timeoutMs:cliTimeoutMs(cfg),idleMs:CLI_SILENCE_MS,signal:stop.signal,
     onEvent:e=>{if(e.type==='system'&&e.subtype==='init'){if(hasUnexpectedCliTools(e.tools,e.mcp_servers,jsonSchema!==undefined))leak='LOCAL_ISOLATION_BROKEN';else if(e.apiKeySource&&e.apiKeySource!=='none')leak='LOCAL_NOT_SUBSCRIPTION';if(leak)stop.abort();}options.onEvent?.(e);}});
    options.signal?.removeEventListener('abort',relay);return next;
   };
   // C7 follow-up: a text answer must fit the schema the CLI used to enforce. One repair turn in the same conversation,
   // as the CLI's own check did; an answer that still does not fit fails with the workflow's own code.
   let schemaCheck:LocalTextDetails['schemaCheck'];
   const settle=async(schema:Record<string,unknown>)=>{
    if(!textSchema||r.outcome!=='succeeded'||leak||finishOf(r.stopReason)!=='stop')return;
    const check=(text:string|null|undefined):{value:unknown}|{issues:string[]}=>{const read=readJsonAnswer(text);if('error' in read)return {issues:['answer: not one JSON object']};const issues=schemaIssues(read.value,schema);return issues.length?{issues}:{value:read.value};};
    let c=check(r.text);
    if('issues' in c&&r.init?.sessionId){const first=c.issues;r=mergeCalls(r,await again(r.init.sessionId,[{type:'text',text:repairText(first)}]));schemaCheck={repaired:true,issues:first};
     if(r.outcome!=='succeeded'||leak||finishOf(r.stopReason)!=='stop')return;c=check(r.text);}
    if('value' in c){r={...r,structured:c.value};return;}
    schemaCheck={repaired:!!schemaCheck,issues:c.issues};r={...r,outcome:'failed',failure:'INVALID_OUTPUT_SCHEMA'};
   };
   if(answerSchema)await settle(answerSchema);
   // C3: the answer, or one round of materials and then the answer in the same conversation.
   let materials:LocalTextDetails['materials'];
   if(materialsOn&&r.outcome==='succeeded'&&!leak){
    const read=readWrapped(r.structured);
    if(read&&'answer' in read)r={...r,structured:read.answer};
    else if(read&&r.init?.sessionId){
     const fetched=await fetchMaterials(ctx!,{runId:options.runId!,role:options.role!,requests:read.request,read:options.readPicture,...(planningChat?{extra:[...planningMaterials(cfg.upstream as Parameters<typeof planningMaterials>[0]),...(options.materials??[])]}:{})});
     materials={asked:fetched.plan.map(p=>p.name),attached:fetched.plan.filter(p=>p.status==='attached').map(p=>p.name),refused:fetched.plan.filter(p=>p.status!=='attached').map(p=>`${p.name}: ${p.status}`)};
     const parts:CliTextRequest['parts']=[{type:'text',text:`${fetched.text}\nNow answer: requestMaterials is closed.${textSchema?`\n${MATERIALS_ANSWER_FORMAT}`:''}`},...fetched.images.flatMap(i=>[{type:'text' as const,text:i.label},{type:'image' as const,mediaType:'image/jpeg',dataBase64:i.url.split(',')[1]}])];
     r=mergeCalls(r,await again(r.init.sessionId,parts,textSchema?undefined:original!));
     if(textSchema)await settle(original!);
    }else if(r.structured!==undefined)r={...r,structured:undefined,text:''};
   }
   const u=r.usage,p=cfg.pricing,forecast=u?{targetModel:model,microUsd:Math.ceil(((u.input_tokens??0)*p.inputPrice+(u.cache_read_input_tokens??0)*(p.cacheReadPrice??p.inputPrice)+(u.cache_creation_input_tokens??0)*(p.cacheWritePrice??p.inputPrice)+(u.output_tokens??0)*p.outputPrice)*1e6),method:'cli-tokens-x-target-price@1' as const,errorMeasured:false as const}:undefined;
   const ttl=cacheLifetime(r.usage);
   const details:Omit<LocalTextDetails,'events'|'stderr'>={...(materials?{materials}:{}),...(schemaCheck?{schemaCheck}:{}),...(textSchema?{answerFormat:'text' as const}:{}),...(ttl?{cacheTtl:ttl}:{}),transport:'claude-cli',mapping,semanticInputHash:prepared.semanticInputHash,schemaMode:cli.schemaMode,unsupported:cli.unsupported,cliVersion:r.init?.cliVersion??setup.cliVersion,
    ...(r.init?.model?{executedModel:r.init.model}:{}),...(r.init?.sessionId?{sessionId:r.init.sessionId}:{}),...(r.init?.apiKeySource?{apiKeySource:r.init.apiKeySource}:{}),
    internalAttempts:r.internalAttempts,...(()=>{const size=lastCallSize(r.events);return size!==undefined?{conversationSize:size}:{};})(),...(r.numTurns!==undefined?{numTurns:r.numTurns}:{}),...(cli.effort?{effort:cli.effort}:{}),...(r.apiEquivalentUsd!==undefined?{apiEquivalentUsd:r.apiEquivalentUsd}:{}),stopReason:r.stopReason??null,durationMs:r.durationMs,exitCode:r.exitCode,...(r.limitReached?{limitReached:true}:{}),...(r.usage?{usage:r.usage}:{}),...(recordPath?{recordPath}:{}),...(forecast?{forecast}:{}),...(ctx?{sharedContext:{...(ctx.instructionsVersion?{instructions:ctx.instructionsVersion}:{}),sha256:ctx.sha256,tokens:ctx.tokens,holds:ctx.holds,images:ctx.images?.length??prepared.attachments.filter(a=>a.prefix).length,...(ctx.pack?{pack:ctx.pack}:{})}}:{}),...(conversation?{conversation}:{}),...(skillsUsed.length?{skills:skillsUsed}:{}),...(stage?{stage}:{}),...(timedOut?{retriedAfterTimeout:true}:{}),...(inputParts.length?{inputParts}:{})};
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
