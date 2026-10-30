import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createWorkspace} from '../../apps/local-runner/director/workspace';
import {staticStillTools as staticTools} from '../../apps/local-runner/director/static-tools';
import {assembleStatic} from '../../apps/local-runner/director/static-assembler';
import {staticCriticEvidence} from '../../apps/local-runner/director/static-evidence';
import {assemblerContext} from '../../packages/director/transcript';
import {compactDraftRequest,DRAFT_INPUT_CAP} from '../../packages/director/request-size';
import {staticCoderInstructions,staticFilesSchema} from '../../packages/agents/prompts/static-coder';
import {staticDirectorPrompt} from '../../packages/agents/prompts/director-v1';
import {staticCriticInstructions,directorCriticSchema} from '../../packages/agents/prompts/director-critic-v1';
import {slimDirectorInput} from '../../packages/director/inputs';
import {textRequestQuote} from '../../packages/agents/text-quote';
import {staticOutputCaps,staticRoleInstructions} from '../../packages/director/roles';
import {readDesign} from '../../packages/director/contract';
import {providerJsonSchema} from '../../packages/director/provider-schema';
import {estimateStaticDirection} from '../../packages/director/money';
import type {DirectionInput} from '../../packages/director/types';
import type {LoopState} from '../../packages/director/state';
import type {Role} from '../../packages/director/money';
/** Offline replay. Input bytes bound tokens conservatively; it does not invent provider usage or cache hits. */
async function main(){
 const input:DirectionInput=JSON.parse(await readFile('fixtures/director/static/input.json','utf8')),design=readDesign(JSON.parse(await readFile('fixtures/director/static/director-response.json','utf8')),input),source=await readFile('fixtures/director/static/Frame.tsx','utf8');
 input.roundId='m09-qualification';const folder=await createWorkspace('artifacts/m09/workspaces',input);await mkdir(resolve(folder,'.reports'),{recursive:true});await copyFile('public/fixtures/noto-latin.woff2',resolve(folder,'public/noto.woff2'));await copyFile('fixtures/director/static/logo.svg',resolve(folder,'public/logo.svg'));await writeFile(resolve(folder,'catalog.json'),'[]');await writeFile(resolve(folder,'draft.json'),JSON.stringify(design));
 const pricing={inputPrice:3e-6,outputPrice:15e-6,cacheReadPrice:.3e-6,cacheWritePrice:3.75e-6},calls:{role:string;inputTokenBound:number;outputTokenBound:number;reservationMicroUsd:number;cachedTokens:null}[]=[],state:LoopState={turn:0,startedAt:Date.now(),transcript:[],complete:false},tools=staticTools(folder,input,design,Date.now()+600000);
 const meter=(role:Exclude<Role,'resources'>,prompt:string,protocol:string,schema:{name:string;schema:Record<string,unknown>},context:unknown,output:string,images:{url:string;label:string}[]=[])=>{const prepared=compactDraftRequest(prompt,{instructions:staticRoleInstructions[role],protocolInstructions:protocol,campaignContext:{checkpointId:'fixture-checkpoint',...context as object},maxOutputTokens:staticOutputCaps[role],pricing,cachePrompt:true,responseSchema:{...schema,schema:providerJsonSchema(schema.schema) as Record<string,unknown>}},images),quote=textRequestQuote(prepared.prompt,prepared.snapshot,'',prepared.images.length);if(quote.inputTokenBound>DRAFT_INPUT_CAP)throw new Error('INPUT_CAP_FAILED');calls.push({role,inputTokenBound:quote.inputTokenBound,outputTokenBound:Buffer.byteLength(output),reservationMicroUsd:quote.reservationMicroUsd,cachedTokens:null});};
 meter('director',staticDirectorPrompt.prompt,staticDirectorPrompt.instructions,staticDirectorPrompt.responseSchema,{input:slimDirectorInput(input),notes:[],previousValidationFailures:[]},JSON.stringify(design));
 await assembleStatic({state,maxTurns:9,timeMs:600000,call:async loop=>{const answer=JSON.stringify({files:[{path:'Frame.tsx',source}]});meter('assembler',JSON.stringify({toolResults:loop.transcript}),staticCoderInstructions,staticFilesSchema,assemblerContext(input,design,[],[]),answer);return answer;},tool:tools.execute,save:async()=>{await writeFile(resolve(folder,'.reports','replay-state.json'),JSON.stringify(state));const last=state.transcript.at(-1);if(last?.from==='tool'&&last.text.includes('error'))console.error(last.text);}});
 const evidence=await staticCriticEvidence(folder,input);meter('critic','Review these static scene moments in every format.',staticCriticInstructions,directorCriticSchema,{input:slimDirectorInput(input),resources:design.resources,keyFrames:design.keyFrames,designDocument:design.designDocument,objectiveReports:tools.reports,evidence:evidence.manifest},JSON.stringify({accepted:true,summary:'Recorded contract response; no visual judgement claimed.',notes:[]}),evidence.images);
 const result={direction:input.directionId,complete:state.complete,coderRequests:calls.filter(c=>c.role==='assembler').length,firstFile:'Frame.tsx',calls,cachedTokenShare:null,cachedTokenShareReason:'No live provider request: cache usage cannot be measured. Cache-hit/write accounting is tested separately with explicit synthetic receipts.',totalCostMicroUsd:0,totalReservationMicroUsd:calls.reduce((sum,c)=>sum+c.reservationMicroUsd,0),costMethod:'No provider billing. Per-call reservations use conservative UTF-8 input bounds including schemas and image bounds, and maximum output. No generated resources are needed by this fixture.',approvedMaximumMicroUsd:estimateStaticDirection({director:pricing,assembler:pricing,critic:pricing},100000,4,'fixture').maxCostMicroUsd,renderMs:Date.now()-state.startedAt,formats:Object.fromEntries(Object.entries(tools.reports).map(([id,r])=>[id,{...r,frames:r.sampledFrames.length,checks:['copy','safe-area','legibility','brand']}]))};
 await mkdir('docs/m09',{recursive:true});await writeFile('docs/m09/sonicdesk-static-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!state.complete||Object.values(tools.reports).some(r=>!r.passed))throw new Error('STATIC_FIXTURE_CHECKS_FAILED');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
