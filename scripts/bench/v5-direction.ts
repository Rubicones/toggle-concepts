// One version 5 designer direction, wired as a new shared Local run's designer block wires it, without a database:
// the frozen run context (brand pack, stage-skills@2, positive@1, lean context, image owner, critic@2), the direction's
// digest with its territory whole, the ideas turn, the selection (critic@2 on the Local model), the build in the SAME
// conversation, the hero render, the hero review with checks and memory (at most two rounds), stage E, and the end
// review with one repair round. Every request goes through the production builders and the production Local transport
// (directorRequestSnapshot, compaction, cliTextTransport with the shared layout and the conversation plan).
//
// Used by scripts/bench/pipeline-bench.ts (--version=5, the real CLI: LIVE) and by tests/v5-rehearsal.test.ts (the fake
// CLI with recorded answers: no model). What it does NOT run, because they need the database or a paid provider: the
// worker's lease, ledger and admission (allowances, the database's own rules), the timeline table and its event rows,
// the picture purchase through OpenRouter (the bench's `buy` stands in), 3D models, the planning chain before the
// designer (the territory is given), and the compact brand sheet pictures of a stored brand pack.
import {usesQuality,reviewMaterialFor,chosenIdeaNote,strictRound,HERO_REVIEW_INSTRUCTIONS_V3,SELECTION_INSTRUCTIONS_V3} from '../../packages/director/quality';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {referenceEntries,sheetEntries} from '../../apps/local-runner/director/assets';
import {measureLogos,logoFactLines,referenceFactLines} from '../../apps/local-runner/director/logo-facts';
import {designerTools,provisionalDesign,finishDesign} from '../../apps/local-runner/director/designer-run';
import {screenshotForDesigner,newDesignerState,designerViews,RENDER_LONG_SIDE,type DesignerLoopState,type DesignerTools} from '../../apps/local-runner/director/designer-loop';
import {runHeroChat,HERO_TURN_SHARE} from '../../apps/local-runner/director/hero-chat-loop';
import {runExtensionChat} from '../../apps/local-runner/director/extension-chat-loop';
import {cliTextTransport,type LocalCliSetup,type LocalTextReceipt} from '../../apps/local-runner/local-claude/transport';
import {fetchMaterials,loadMaterials,materialsUsed} from '../../apps/local-runner/local-claude/materials';
import {compactStaticCriticRequest} from '../../apps/local-runner/director/static-evidence';
import {recordPreparedRequest} from '../../apps/local-runner/local-claude/record';
import {buildRunContext,type RunContext} from '../../packages/agents/run-context';
import {readSkills,skillRoleOf} from '../../packages/agents/skill-files';
import {buildStageSkills,creatorStageText,stageSkillTitles} from '../../packages/agents/stage-skills';
import {DEFAULT_MATERIAL_BUDGET,budgetLeft,materialBudgetFor} from '../../packages/agents/materials';
import {POSITIVE_DEFAULT} from '../../packages/agents/positive-instructions';
import {stageOf} from '../../packages/agents/stage-effort';
import {localCallUsage,usageTotals,usageLine,type LocalCallUsage} from '../../packages/agents/local-usage';
import {designerPlan,storedSize,continuesOwnConversation,relativeCap,type Plan,type StoredPoint} from '../../packages/agents/local-session';
import {directorRequestSnapshot,criticAllowanceUsed} from '../../packages/director/admission';
import {compactDraftRequest,designerRequestCap} from '../../packages/director/request-size';
import {designerRoleLine,staticRoleInstructions} from '../../packages/director/roles';
import {STAGE_H_INSTRUCTIONS,heroBriefLine,pictureWaitLine,HERO_THUMBNAIL_SIDE,HERO_THUMBNAIL_LABEL} from '../../packages/director/hero-chat';
import {heroMeaning} from '../../packages/director/designer';
import {reviewRepairMessage} from '../../packages/director/extension-chat';
import {IDEAS_TASK,SELECTION_INSTRUCTIONS,selectionSchema,readSelection,selectionContext,wayOfMakingNote} from '../../packages/director/image-ideas';
import {checksText,stageReviewMaterial,REVIEW_INSTRUCTIONS,HERO_REVIEW_WHAT,END_REVIEW_WHAT,reviewSchemaV2,reviewContextText,readReview,withAllRulings,toDesignerNotes,settleHeroReview,HERO_REVIEW_ROUNDS} from '../../packages/director/critic-review';
import {designerDigestText,designerDigestEntries,territoryText} from '../../packages/director/designer-digest';
import {reviewGaps,reviewReason,unreviewedStatus} from '../../packages/director/review-gaps';
import {DESIGNER_TURNS,estimateDesignerDirection} from '../../packages/director/money';
import {roleReasoning} from '../../packages/agents/effort';
import type {DirectionInput,CatalogEntry,Resource} from '../../packages/director/types';

/** The output limits of the live block (run limits: 16,384 for the designer's agent, the critic's 16,000). */
const OUTPUT_LIMIT={designer:16384,critic:16000};
const PRICING={inputPrice:4e-6,outputPrice:2e-5,cacheReadPrice:2e-7,cacheWritePrice:5e-6},CRITIC_PRICING={inputPrice:2e-6,outputPrice:1e-5,cacheReadPrice:1e-7,cacheWritePrice:2.5e-6};
export type V5Options={
 input:DirectionInput;folder:string;out:string;setup:LocalCliSetup;
 /** The brand pack text of the run context (the brand's character and rules). */
 brandPack:string;
 /** Target models, as Models & agents would hold them; the Local mapping decides what the CLI runs. */
 designerModel?:string;criticModel?:string;
 maxTurns?:number;heroReviews?:number;endReview?:boolean;maxPictures?:number;
 /** Stands in for the picture purchase (OpenRouter through the ledger): returns the picture's catalogue entry. */
 buy:(resource:Resource)=>Promise<CatalogEntry|undefined>;catalog:CatalogEntry[];
 /** Write every assembled request (as sent, pictures by hash) under <out>/requests. */
 recordRequests?:boolean;
 /** Make the critic unavailable, to rehearse the "not reviewed" paths. */
 criticFails?:string;
 /** Stop when the hero frame is accepted (the E0 reproduction: the hero stage only). */
 heroOnly?:boolean;
 /** The brief text of the run context, when it comes from a real run (default: the input's product, offer, audience). */
 briefText?:string;
 /** The run's own material catalogue and budgets (an export's device/run-context.json). Default: no catalogue entries. */
 materials?:RunContext['materials'];
 /** Offer the workspace's own brand references, logos and full sheet pages by name, as the worker does when the run
  * has a compact brand sheet. Files that are not in the workspace are left out. */
 brandFileEntries?:boolean;
 /** Plan E5 (version 6): how long a hero render waits for its pictures (default: the production bound). */
 pictureHoldMs?:number;
 /** Rehearsals without a browser: replace build and render (everything else stays the production code). */
 tools?:(real:DesignerTools)=>DesignerTools;
};
export type V5Call={role:string;stage:string;usage:LocalCallUsage|null;conversation?:string;record?:string};
export type V5Result={state:DesignerLoopState;context:RunContext;calls:V5Call[];timeline:string[];gaps:string[];status:string;apiEquivalentUsd:number;endReview?:{accepted:boolean;notes:number;rounds:number;skipped?:string}};

/** The run context a new shared Local run freezes (apps/local-runner/local-claude/run-context.ts), for one brand. */
export function benchRunContext(input:DirectionInput,brandPack:string,briefText?:string,materials?:RunContext['materials']):RunContext{
 return buildRunContext({briefText:briefText??JSON.stringify({product:input.brief.product,offer:input.brief.offer,audience:input.brief.audience,cta:input.brief.cta},null,1),brandPack,packVersion:1,commonSkills:[],
  materials:materials??{entries:[],budget:DEFAULT_MATERIAL_BUDGET},planningChat:true,schemaInText:true,leanContext:true,stageSkills:buildStageSkills(readSkills(),[]),positive:POSITIVE_DEFAULT,imageOwner:true,critic:true});
}

/** The bench has no object store: a stored catalogue picture is answered as unreadable, never fetched. */
const noStoredPictures=async():Promise<Buffer>=>{throw new Error('BENCH_NO_STORED_PICTURES');};
export async function runV5Direction(o:V5Options):Promise<V5Result>{
 const {input,folder}=o,ctx=benchRunContext(input,o.brandPack,o.briefText,o.materials),staged=ctx.stageSkills!,calls:V5Call[]=[],timeline:string[]=[],say=(line:string)=>{timeline.push(line);};
 const models={designer:{modelId:o.designerModel??'anthropic/claude-opus-5.5',instructions:staticRoleInstructions.director,maxOutputTokens:32000,pricing:PRICING,contextLength:1000000},critic:{modelId:o.criticModel??'anthropic/claude-sonnet-5.5',instructions:staticRoleInstructions.critic,maxOutputTokens:16000,pricing:CRITIC_PRICING,contextLength:1000000}};
 const requests=Math.min(o.maxTurns??DESIGNER_TURNS.requests,DESIGNER_TURNS.requests),maxPictures=o.maxPictures??input.resourceIds.length,heroReviews=o.heroReviews??HERO_REVIEW_ROUNDS;
 // The quote a version 5 block is approved with: 24 designer turns, two end reviews, two hero reviews, one selection.
 const quote=estimateDesignerDirection({designer:PRICING,critic:CRITIC_PRICING},0,0,{bench:input.directionId},{criticRequests:heroReviews>0?2:0,heroReviews,ideasSelection:true,requestInputCap:designerRequestCap(1000000,32000)});
 const state:DesignerLoopState=newDesignerState(),design=provisionalDesign(input);
 if(o.recordRequests)await mkdir(join(o.out,'requests'),{recursive:true});
 // The designer's own conversation, as the worker keeps it: each turn continues the last accepted one.
 const conversation=(()=>{let pending:StoredPoint|null=null,decided:Plan|undefined;
  const compute=async():Promise<Plan>=>designerPlan({session:state.session},null,relativeCap(state.session?.seed));
  return {plan:async()=>decided!==undefined?decided:compute(),decide:async()=>{decided=await compute();return continuesOwnConversation(decided);},
   answered:(usage:unknown)=>{const l=(usage as {_local?:{sessionId?:string;conversationSize?:number;usage?:Parameters<typeof storedSize>[0] extends infer T?T extends {usage?:infer U}?U:never:never;conversation?:{kind:string}}}|null)?._local;decided=undefined;
    pending=l?.sessionId&&l.conversation?{role:'designer',sessionId:l.sessionId,tokens:storedSize(l as never),seed:l.conversation.kind==='continued'?state.session?.seed??storedSize(l as never):storedSize(l as never)}:null;},
   accept:async()=>{if(pending){state.session=pending;pending=null;}},lost:()=>{delete state.session;delete state.filesSeen;decided=undefined;},continuing:()=>!!state.session};})();
 let n=0;
 const call=async(role:'designer'|'critic',prompt:string,protocol:string,schema:{name:string;schema:Record<string,unknown>}|null,context:unknown,images:{url:string;label:string;required?:boolean;prefix?:boolean}[]=[])=>{
  if(role==='critic'&&o.criticFails)throw new Error(o.criticFails);
  const config=models[role],agentRole=role==='designer'?'visual-direction':'critic';
  // The quoted block's allowances, as the ledger enforces them: requests, and for the designer its full answer room.
  const mine=calls.filter(c=>c.role===role),outUsed=mine.reduce((t,c)=>t+(c.usage?.output??0),0),allowance=role==='designer'?{requests,outputTokens:DESIGNER_TURNS.outputTokens}:{requests:quote.roles.critic.requests,outputTokens:quote.roles.critic.outputTokens};
  if(mine.length>=allowance.requests||role==='designer'&&allowance.outputTokens-outUsed<OUTPUT_LIMIT.designer)throw Object.assign(new Error('ROLE_ALLOWANCE_EXHAUSTED'),{detail:`${role}: requests ${mine.length} of ${allowance.requests}; output ${outUsed} of ${allowance.outputTokens}`});
  const outputLimit=role==='designer'?OUTPUT_LIMIT.designer:Math.min(OUTPUT_LIMIT.critic,Math.max(128,allowance.outputTokens-outUsed));
  const base=directorRequestSnapshot({draft:true,blockId:'bench-block',directionId:input.directionId,iterationId:input.iterationId,runId:input.runId,role,agentRole,designerRequestInputCap:designerRequestCap(config.contextLength,config.maxOutputTokens),config,outputLimit,remainingMs:3600000,
   roleLine:designerRoleLine({role,heroChat:true,prior:false,mode:'local_claude',contextMode:'shared',stageSkills:true}),protocolInstructions:protocol,context,checkpointId:'bench-checkpoint',stepCapMicroUsd:1,responseSchema:schema});
  // Role effort, as the worker sets it for a Local draft request.
  Object.assign(base,roleReasoning(role,undefined,'local_claude'));
  const compacted=role==='critic'&&images.length?await compactStaticCriticRequest(prompt,base,images):compactDraftRequest(prompt,base,images,base.requestInputCap,base.requestInputCap,{fullCap:role==='designer'});
  const stage=stageOf(role,{hero:role==='designer'&&state.hero?.state!=='accepted',extension:role==='designer'&&state.hero?.state==='accepted'});
  let record:string|undefined;const index=++n;
  const transport=cliTextTransport(o.setup,{shared:async()=>ctx,role:skillRoleOf(role),stage,...(role==='designer'?{longCache:true,session:conversation.plan}:{}),
   ...(o.recordRequests?{record:async p=>{record=await recordPreparedRequest(p,join(o.out,'requests'));return record;}}:{})});
  const r=await transport(config.modelId,compacted.prompt,{...base,...compacted.snapshot},compacted.images) as LocalTextReceipt;
  if(role==='designer')conversation.answered(r.usage);
  const usage=localCallUsage({role,usage:r.usage,config_snapshot:{pricing:config.pricing}});
  calls.push({role,stage,usage,...(usage?.conversation?{conversation:usage.conversation}:{}),...(record?{record}:{})});
  if(usage)say(`${role} (Claude subscription): ${usageLine(usage)}`);
  if(o.recordRequests)await writeFile(join(o.out,'requests',`${String(index).padStart(2,'0')}-${role}-${stage}.answer.txt`),r.text??`FAILED: ${r.failure}`);
  if(r.outcome!=='succeeded'||r.text===null)throw new Error(r.failure??'LOCAL_RESULT_MISSING');
  return r.text;
 };
 const tools:DesignerTools=(o.tools??(t=>t))(designerTools({folder,input,design,preview:async()=>{},deadline:()=>Date.now()+600000,facts:()=>Object.fromEntries(o.catalog.filter(c=>c.image).map(c=>[c.url,c.image])),save:async()=>{},buy:o.buy}));
 // Materials on request: the direction's own planning results and the copy table, by name (C3/C4).
 const references=[...(o.brandFileEntries?referenceEntries(folder,input):[]),...designerDigestEntries(input),...(o.brandFileEntries?sheetEntries(folder,input):[])].filter(e=>!('file' in e)||existsSync((e as {file:string}).file)),budget=materialBudgetFor('designer',ctx.materials!.budget);
 tools.materials={references:references.map(e=>`- ${e.name} · ${e.kind} · ${e.line}`),
  fetch:async(asked,seen)=>{const f=await fetchMaterials(ctx,{runId:input.runId,role:'designer',requests:asked,extra:references,seen,read:noStoredPictures});const attached=f.plan.filter(p=>p.status==='attached').map(p=>p.name);if(attached.length)say(`The designer looked at: ${attached.join(', ')}.`);
   return {attached,lines:f.plan.map(p=>p.status==='attached'?`Asked to see ${p.name}; it arrives with the next turn.`:`${p.name}: ${p.status}.`)};},
  load:names=>loadMaterials(ctx,names,references,noStoredPictures),left:async()=>budgetLeft('designer',budget,await materialsUsed(input.runId)).count};
 // The hero review (critic@2): the hero checks with evidence, its own earlier rounds as text, a stop by rule.
 const reviewHero:NonNullable<DesignerTools['reviewHero']>=async(round,shots,measured)=>{
  const memory=state.heroMemory??[],quality=usesQuality(input),chosen=quality?chosenIdeaNote(state.ideas):'',material=reviewMaterialFor(input,staged,'hero',{chosenIdea:!!chosen}),hard=measured.filter(f=>f.severity==='hard').map(f=>`${f.view}: ${f.detail}`);
  const text=await call('critic','Review this hero frame.',quality?HERO_REVIEW_INSTRUCTIONS_V3:REVIEW_INSTRUCTIONS(HERO_REVIEW_WHAT),reviewSchemaV2,{contextText:reviewContextText({territory:designerDigestText(input,{sceneIds:false}),...(territoryText(input)||chosen?{work:[territoryText(input)?wayOfMakingNote(territoryText(input)):'',chosen].filter(Boolean).join('\n\n')}:{}),checks:material.checks,signs:material.signs,hard,memory})},[...(shots[0]?[{url:await screenshotForDesigner(shots[0].file,RENDER_LONG_SIDE),label:'The hero frame now, at full size'}]:[]),...(shots[0]&&heroMeaning(input)?[{url:await screenshotForDesigner(shots[0].file,HERO_THUMBNAIL_SIDE),label:HERO_THUMBNAIL_LABEL}]:[])]);
  const settled=settleHeroReview(text,round,memory,hard.length,Math.min(HERO_REVIEW_ROUNDS,heroReviews),quality?strictRound:undefined);if(!settled)return undefined;
  state.heroMemory=[...memory,settled.round];return settled.result;};
 if(heroReviews>0)tools.reviewHero=async(...a)=>{try{const r=await reviewHero(...a);if(!r&&state.hero)state.hero.reviewError='UNREADABLE';return r;}catch(error){const code=error instanceof Error?error.message:'REVIEW_FAILED';if(state.hero)state.hero.reviewError=code.slice(0,120);say(`The hero frame was NOT reviewed: ${reviewReason(code)}. It is accepted as it is.`);return undefined;}};
 const working=(stage:'hero'|'extension')=>{const titles=stageSkillTitles(staged,stage);if(titles.length)say(`The designer is working with: ${titles.join(', ')}.`);};
 const logoLines=heroMeaning(input)?logoFactLines(await measureLogos(folder,input,ctx.materials?.entries??[]),input):undefined;
 const referenceLines=heroMeaning(input)?await referenceFactLines(folder,input,ctx.materials?.entries??[]):undefined;
 const designerCall=(stage:'H'|'E')=>async(message:string,images:{url:string;label:string}[])=>call('designer',message,STAGE_H_INSTRUCTIONS,null,{contextText:designerDigestText(input,stage==='H'?{sceneIds:false,heroOnly:true,logoLines,referenceLines}:{logoLines,referenceLines})},images.map(i=>({...i,required:true})));
 const turnLine=async(e:{turn:number;idea:string;results:string[]})=>{say(`Turn ${e.turn}: ${e.idea.slice(0,160)||'(no words)'} — ${e.results.join(' ')}`);};
 const owned=input.creativeHandoff?.intent.direction;
 // Stage H: three ideas, the independent choice, the build in the same conversation, the hero review.
 working('hero');
 await runHeroChat({input,state,maxTurns:Math.min(requests,Math.ceil(requests*HERO_TURN_SHARE)+(state.heroExtraTurns??0)),maxPictures,timeMs:3600000,tools,heroReviews,conversation,
  ideas:{task:`${owned?`You own treatment ${owned.id}${owned.name?`: ${owned.name}`:''}; the other treatments are not yours.\n\n`:''}${IDEAS_TASK}\n\n${creatorStageText(staged,'ideas')}`,unreviewedReason:()=>heroReviews>0?undefined:'NO_REVIEW_IN_QUOTE',
   select:async(text)=>{if(heroReviews<1)return null;try{return readSelection(await call('critic','Choose one of the three ideas.',usesQuality(input)?SELECTION_INSTRUCTIONS_V3:SELECTION_INSTRUCTIONS,selectionSchema,{contextText:selectionContext(designerDigestText(input,{sceneIds:false}),text,checksText(reviewMaterialFor(input,staged,'ideas').checks),territoryText(input))}));}catch(error){if(criticAllowanceUsed(error))return null;throw error;}},
   onIdeas:async()=>{say('Three ideas for the key frame.');},
   onChosen:async(pick,reason)=>{if(state.ideas?.unreviewed)say(`The three ideas were NOT reviewed: ${reviewReason(state.ideas.unreviewed)}. The first idea is built.`);say(`Chosen: idea ${pick} — ${reason}`);}},
  onPictureWait:async e=>{say(pictureWaitLine(e.pictures,e.holdMs));},...(o.pictureHoldMs!==undefined?{pictureHoldMs:o.pictureHoldMs}:{}),
  onHero:async e=>{say(e.kind==='started'?(heroMeaning(input)?`Hero frame started. ${heroBriefLine(input)}`:'Hero frame started.'):e.kind==='reviewed'?`Hero frame reviewed: ${e.notes} note${e.notes===1?'':'s'}.`:`Hero frame accepted (${e.by}). Designing the other scenes.`);},
  save:async()=>{},call:designerCall('H'),onTurn:turnLine});
 if(o.heroOnly){const gaps=reviewGaps({expects:{ideas:true,hero:true,end:false},ideas:state.ideas,hero:state.hero});if(gaps.length)say(unreviewedStatus(gaps));
  return {state,context:ctx,calls,timeline,gaps,status:'Hero stage only.',apiEquivalentUsd:usageTotals(calls.flatMap(c=>c.usage?[c.usage]:[])).apiEquivalentUsd};}
 // Stage E: the same conversation continues with the other scenes, the formats and the variations.
 working('extension');
 const extend=()=>runExtensionChat({input,state,maxTurns:requests,maxPictures,timeMs:3600000,tools,skills:creatorStageText(staged,'extension'),conversation,save:async()=>{},onPhase:async(_p,label)=>{say(`${label}.`);},call:designerCall('E'),onTurn:turnLine});
 await extend();
 if(!state.complete)say('The designer used its approved turns or time before finishing. The draft is shown as it is; continue within a new allowance to finish it.');
 // The end review (critic@2) with one repair round, as the worker's live review does for a designer block.
 let end:V5Result['endReview'];
 if(o.endReview!==false){
  end={accepted:false,notes:0,rounds:0};
  for(let round=1;round<=2&&state.complete!==false;round++){
   try{
    const shots:{url:string;label:string}[]=[],hard:string[]=[];
    for(const scene of input.storyboard){const views=designerViews(input,scene.id,input.formats.map(f=>f.id)),r=await tools.render(views);
     hard.push(...r.summary.reports.flatMap(x=>x.findings).filter(f=>f.severity==='hard').map(f=>`${f.view}: ${f.detail}`));
     for(const shot of r.shots.slice(0,2))shots.push({url:await screenshotForDesigner(shot.file,768),label:`Scene ${input.storyboard.indexOf(scene)+1} · ${views.find(v=>v.key===shot.key)?.label??''}`});}
    const material=stageReviewMaterial(staged,'extension'),memory=state.endMemory??[];
    const text=await call('critic','Review these rendered views of the draft.',REVIEW_INSTRUCTIONS(END_REVIEW_WHAT),reviewSchemaV2,{contextText:reviewContextText({territory:designerDigestText(input),...(territoryText(input)?{work:wayOfMakingNote(territoryText(input))}:{}),checks:material.checks,signs:material.signs,hard:hard.slice(0,20),memory})},shots);
    const read=readReview(text,round);if(!read){end.skipped='UNREADABLE';say('The creative review could not run; the draft is delivered with the measured findings only.');break;}
    const r=withAllRulings(read,memory);state.endMemory=[...memory,r];end.rounds=round;end.accepted=r.accepted;end.notes=r.notes.length;
    say(r.accepted?'The creative review accepted the current views.':`The creative review returned ${r.notes.length} note${r.notes.length===1?'':'s'}.`);
    const notes=toDesignerNotes(r);if(r.accepted||!notes.length||round===2||state.turn>=requests)break;
    state.complete=false;delete state.finish;state.heroNote=reviewRepairMessage({kind:'critic',round,note:notes.map((x,i)=>`${i+1}. [${x.priority}] ${x.view}: ${x.problem} Wanted: ${x.fix}`).join('\n')});await extend();
   }catch(error){end.skipped=error instanceof Error?error.message.slice(0,200):'CRITIC_FAILED';say('The creative review could not run; the draft is delivered with the measured findings only.');break;}
  }
 }
 if(state.finish)finishDesign(design,state.finish);
 const gaps=reviewGaps({expects:{ideas:true,hero:true,end:o.endReview!==false},ideas:state.ideas,hero:state.hero,end:end?{criticRounds:end.rounds,skipped:end.skipped}:undefined});
 if(gaps.length)say(unreviewedStatus(gaps));
 const status=gaps.length?'Source checks complete. No automatic review ran; look closely yourself.':'Source checks complete. Ready for your review.';
 return {state,context:ctx,calls,timeline,gaps,status,apiEquivalentUsd:usageTotals(calls.flatMap(c=>c.usage?[c.usage]:[])).apiEquivalentUsd,...(end?{endReview:end}:{})};
}
