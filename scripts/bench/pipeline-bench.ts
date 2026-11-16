// Pipeline bench: the production designer loop (runDesigner, the real instructions, response schema, build, render and
// measurement) against the real Claude Code CLI, with no database. What passes here is what a studio run executes.
//
// LIVE: every run spends the signed-in Claude subscription. Never part of `npm test`; run it by hand:
//   node --import tsx scripts/bench/pipeline-bench.ts <brand> [--turns=12] [--model=claude-sonnet-5-5] [--effort=high] [--version=3]
import {mkdir,writeFile,readFile,copyFile,rm,mkdtemp,cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {brands,benchInput,benchInputV5,benchBrandPack,benchCatalogue,type BenchBrand} from './brands';
import {runV5Direction} from './v5-direction';
import {runChatBaseline,brandFactsFromPack,chatBaselineMessage} from './chat-baseline';
import {measureLogos,logoFactLines,referenceFactLines,suppliedFactLines} from '../../apps/local-runner/director/logo-facts';
import {assetNames} from '../../packages/director/asset-names';
import {designerDigestText} from '../../packages/director/designer-digest';
import {heroTask} from '../../packages/director/hero-chat';
import {buildStageSkills,creatorStageText} from '../../packages/agents/stage-skills';
import {reviewMaterialFor} from '../../packages/director/quality';
import {localMaterialEntries,fileDropPictures,missingBrandFiles,fillBrandFonts,missingBrandFilesMessage,prepareBrandWorkspace} from './export-files';
import {DEFAULT_MATERIAL_BUDGET} from '../../packages/agents/materials';
import type {RunContext} from '../../packages/agents/run-context';
import {createWorkspace,writeResources} from '../../apps/local-runner/director/workspace';
import {designerTools,provisionalDesign} from '../../apps/local-runner/director/designer-run';
import {designerViews,screenshotForDesigner,runDesigner,newDesignerState} from '../../apps/local-runner/director/designer-loop';
import {cliArgs,runCli,childEnv,streamUserMessage} from '../../packages/agents/claude-cli.local';
import {readSkills} from '../../packages/agents/skill-files';
import {withoutSkill} from '../../packages/agents/skill-measure';
import {designerInstructionsFor} from '../../packages/agents/prompts/designer-v1';
import {designerTurnResponseFor} from '../../packages/director/designer';
import {designerContext} from '../../packages/director/designer-context';
import {liveCriticInstructionsFor,liveCriticSchema} from '../../packages/agents/prompts/director-critic-v1';
import {readLiveCritique} from '../../packages/director/live-review';
import {loadImage} from '@napi-rs/canvas';
import type {DirectionInput,CatalogEntry,Resource} from '../../packages/director/types';

type Part={type:'text';text:string}|{type:'image';mediaType:string;dataBase64:string};
type Usage={input_tokens?:number;output_tokens?:number;cache_creation_input_tokens?:number;cache_read_input_tokens?:number};
const arg=(name:string,fallback:string)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=')[1]??fallback;
// Ablation switches for the version 5/6 path, to find which addition changes the result (one off at a time):
//   --no-critic=1   no selection of ideas (the first idea is built), no hero review, no end review
//   --no-ideas=1    no ideas turn and no selection: the designer builds straight from the hero task
//   --v3-context=1  the designer reads the version 3 brief (the whole input as JSON) instead of the planning-shaped digest
//   --advisory-critic=1  the reviewer chooses the idea, reviews the hero once (its notes go to one last turn) and reviews
//                         the finished draft once; the end review's notes are listed and no repair round follows
//   --full-critic=1      the full review rounds (the default for designer versions before 6; version 6 is advisory by default,
//                         as production freezes it unless STUDIO_CRITIC_MODE=full)
//   --refuse-pictures-after=N  every picture after the first N is refused as a payment refusal (PROVIDER_402)
const advisory=arg('full-critic','0')!=='1'&&(arg('advisory-critic','0')==='1'||arg('designer','0')==='6');
const refusal=arg('refuse-pictures-after','')!==''?{refuseAfter:Number(arg('refuse-pictures-after','0'))}:{};
const noCritic=arg('no-critic','0')==='1',ablation={...(advisory?{endRepair:false}:{}),...(arg('no-ideas','0')==='1'?{noIdeas:true}:{}),...(arg('v3-context','0')==='1'?{v3Context:true}:{})};
const ablationName=`${noCritic?'-nocritic':''}${advisory?'-advisory':''}${arg('no-ideas','0')==='1'?'-noideas':''}${arg('v3-context','0')==='1'?'-v3context':''}`;

async function main(){
 // E0 reproduction: the hero stage (or the whole direction) of a real run, from its export folder. Nothing of the export
 // is copied into the repository; the run folder is read where it is.
 //   node --import tsx scripts/bench/pipeline-bench.ts --from-export=<export folder> [--hero-only=1] [--direction=0]
 //     [--designer=6] the designer version to run (default: the export's own)  [--fonts=<folder>] font files the export lacks
 //     [--allow-missing=1] run although brand files are missing (the summary names them)
 const exported=arg('from-export','');
 // Propose mode writes new lines for a bench brand; an export's words are its run's approved copy and are never rewritten.
 if(exported&&arg('propose','0')==='1')throw new Error('--propose=1 cannot run on an export: the export holds the run\'s approved words, and propose mode writes new ones. Use it with a bench brand.');
 if(exported){await benchFromExport(resolve(exported));return;}
 const brand=brands.find(b=>b.id===process.argv[2]);if(!brand)throw new Error(`Brand: ${brands.map(b=>b.id).join(' | ')}`);
 const maxTurns=Number(arg('turns','12')),model=arg('model','claude-sonnet-5-5'),effort=arg('effort','high'),version=Number(arg('version','3'));
 // D6: --without-skill=<id> runs the same brief without exactly one skill (designer and critic), for a blind pair.
 const without=arg('without-skill','')||undefined;if(without&&!readSkills().some(s=>s.id===without))throw new Error(`--without-skill: no skill ${without}`);
 const out=resolve(arg('out','artifacts/bench'),`${brand.id}-${arg('chat-baseline','0')==='1'?'chat':`pipeline-v${version}${Number(arg('designer','0'))?`d${arg('designer','0')}`:''}`}${without?`-without-${without}`:''}${ablationName}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'')}`);
 await mkdir(out,{recursive:true});
 // Mode "propose": the client gave no words. One request writes the hooks and each scene's line together with its
 // visual event, from the planning skills; the designer then builds that proposal.
 if(arg('propose','0')==='1'){
  const pdir=await mkdtemp(join(tmpdir(),'bench-propose-')),pfile=join(pdir,'system.txt'),pmcp=join(pdir,'mcp.json');await writeFile(pmcp,'{"mcpServers":{}}');
  await writeFile(pfile,'You are the creative team for one brand: you write the advertising idea, the lines and what each frame shows, together. Three static scenes: the tension the audience knows, the product as proof, the offer with the call to action. Two hooks: two different ways into the same idea. The line and the picture complete each other: either alone says less. Lines are short (two lines per scene, a few words each), in the brand\'s voice, and say only what the brief supports. Write each line natively in every language, never as a literal translation. The last scene carries the offer exactly as given. Answer with JSON only: {"idea":"one sentence","hooks":{"primary":"what it is about","hook-1":"what it is about"},"cta":{"en-GB":"","de-DE":"","tr-TR":""},"scenes":[{"shows":{"primary":"what the frame shows for this hook, as one precise visual event","hook-1":""},"copy":{"primary":{"en-GB":["",""],"de-DE":["",""],"tr-TR":["",""]},"hook-1":{"en-GB":["",""],"de-DE":["",""],"tr-TR":["",""]}}}]} with exactly three scenes.\n\nSKILLS\n'+readSkills().filter(x=>x.defaultRoles.includes('strategy')||x.defaultRoles.includes('script')).map(x=>`## ${x.title}\n${x.text.trim()}`).join('\n\n'));
  const argv=cliArgs({bin:'claude',model,systemPromptFile:pfile,emptyMcpConfigFile:pmcp,cwd:out,effort:'high',isolation:{safeMode:true,restricted:true,noSessionPersistence:true,disableSlashCommands:true}});
  const r=await runCli({bin:'claude',argv,cwd:out,env:childEnv(process.env,{CLAUDE_CODE_MAX_OUTPUT_TOKENS:'32000'}),stdin:streamUserMessage([{type:'text',text:JSON.stringify({brand:brand.name,category:brand.category,character:brand.character,voice:brand.tokens['voice.tone'],product:brand.product,offer:brand.offer,audience:brand.audience,languages:['en-GB','de-DE','tr-TR']})}]),timeoutMs:900000,idleMs:300000});
  if(r.outcome!=='succeeded'||!r.text)throw new Error(`propose: ${r.failure??r.outcome}`);
  const p=JSON.parse(r.text.slice(r.text.indexOf('{'),r.text.lastIndexOf('}')+1)) as {idea:string;hooks:Record<string,string>;cta:Record<string,string>;scenes:{shows:Record<string,string>;copy:Record<string,Record<string,string[]>>}[]};
  await writeFile(join(out,'proposal.json'),JSON.stringify({...p,usd:r.apiEquivalentUsd,seconds:Math.round(r.durationMs/1000)},null,1));
  brand.hooks=p.hooks;brand.cta=Object.fromEntries(Object.entries(p.cta).map(([l,v])=>[l,[v]]));
  brand.scenes=p.scenes.slice(0,3).map((x,i)=>({id:`scene-${i+1}`,notes:`Idea: ${p.idea} This frame shows: ${x.shows.primary}${x.shows['hook-1']&&x.shows['hook-1']!==x.shows.primary?` With the second hook it shows: ${x.shows['hook-1']}`:''}`,copy:x.copy}));
  await rm(pdir,{recursive:true,force:true});
 }
 // Version 5: the production wiring of a new shared Local run's designer block (scripts/bench/v5-direction.ts).
 if(version===5){await benchV5(brand,out,{maxTurns:Number(arg('turns','24')),designerModel:arg('designer-model','anthropic/claude-opus-5.5'),criticModel:arg('critic-model','google/gemini-4-argon'),sonnet:arg('sonnet','claude-sonnet-5-5'),heroReviews:Number(arg('reviews','2')),endReview:arg('endreview','1')==='1',maxPictures:Number(arg('pictures','4')),waitMs:Number(arg('wait','900'))*1000});return;}
 const base=benchInput(brand),input={...base,brief:{...base.brief,designerVersion:version},brand:{...base.brand,tokens:{...base.brand.tokens,'brand.character':brand.character}}} as DirectionInput;
 const folder=await createWorkspace(resolve(out,'workspace'),input),pub=join(folder,'public');
 for(const f of brand.fonts)await copyFile(f.source,join(pub,f.file));
 await writeFile(join(pub,'logo.svg'),brand.logoSvg);
 // Pictures: the request is written to <out>/pictures/<id>.request.json and the bench waits for <id>.png or <id>.jpg to
 // be put next to it (made by hand through the owner's image account), then hands it to the designer as the pipeline would.
 const pictures=resolve(out,'pictures'),catalog:CatalogEntry[]=[],maxPictures=Number(arg('pictures','0')),waitMs=Number(arg('wait','900'))*1000;await mkdir(pictures,{recursive:true});
 const buy=async(resource:Resource)=>{
  await writeFile(join(pictures,`${resource.id}.request.json`),JSON.stringify({id:resource.id,scene:resource.scene,purpose:resource.purpose,prompt:resource.prompt,aspect:resource.aspect,cutout:!!resource.cutout,mustNotContain:resource.mustNotContain},null,1));
  const until=Date.now()+waitMs;let file:string|undefined;
  while(!file&&Date.now()<until){for(const ext of ['png','jpg'])if(await readFile(join(pictures,`${resource.id}.${ext}`)).then(()=>true,()=>false))file=`${resource.id}.${ext}`;if(!file)await new Promise(r=>setTimeout(r,3000));}
  if(!file)return undefined;
  const bytes=await readFile(join(pictures,file)),image=await loadImage(bytes);await writeFile(join(pub,file),bytes);
  // A cutout made by hand sits next to the picture as <id>.cutout.png.
  const cut=resource.cutout?await readFile(join(pictures,`${resource.id}.cutout.png`)).catch(()=>undefined):undefined,cutImage=cut?await loadImage(cut):undefined;
  if(cut)await writeFile(join(pub,`${resource.id}.cutout.png`),cut);
  const entry={id:resource.id,url:file,thumbnail:file,width:image.width,height:image.height,sha256:'',mime:file.endsWith('png')?'image/png':'image/jpeg',revisionId:'bench',...(cutImage?{cutout:{url:`${resource.id}.cutout.png`,sha256:'',width:cutImage.width,height:cutImage.height,box:[0,0,1,1]}}:resource.cutout?{cutoutFailed:'not available on the bench'}:{})} as CatalogEntry;
  catalog.push(entry);await writeResources(folder,input,catalog);return entry;
 };
 const design=provisionalDesign(input),tools=designerTools({folder,input,design,deadline:()=>Date.now()+600000,preview:async()=>{},facts:()=>({}),save:async()=>{},buy});
 const skills=withoutSkill(readSkills(),without).filter(s=>s.defaultRoles.includes('designer'));
 const dir=await mkdtemp(join(tmpdir(),'bench-cli-')),systemFile=join(dir,'system.txt'),mcpFile=join(dir,'mcp.json'),work=resolve(out,'cli');
 await mkdir(work,{recursive:true});await writeFile(mcpFile,'{"mcpServers":{}}');
 await writeFile(systemFile,designerInstructionsFor(input)+'\n\nSKILLS\n'+skills.map(s=>`## ${s.title}\n${s.text.trim()}`).join('\n\n'));
 const log:{turn:number;seconds:number;usage:Usage;usd?:number}[]=[];let session:string|undefined,usd=0;
 // The CLI's validator has no meta-schema to resolve.
 const {$schema:_meta,...schema}=designerTurnResponseFor(input).schema;void _meta;
 // The hero frame's review, as in a run: the critic sees the render and the measured findings and returns notes.
 const heroReviews=Number(arg('reviews','2')),criticFile=join(dir,'critic.txt');
 await writeFile(criticFile,liveCriticInstructionsFor(input.brief)+'\n\nSKILLS\n'+withoutSkill(readSkills(),without).filter(s=>s.defaultRoles.includes('critic')).map(s=>`## ${s.title}\n${s.text.trim()}`).join('\n\n'));
 const {$schema:_m2,...criticSchema}=liveCriticSchema.schema;void _m2;let criticUsd=0,criticSeconds=0;
 if(heroReviews>0)tools.reviewHero=async(round,shots,measured)=>{
  try{
   const hero=input.storyboard.find(s=>s.id===state.hero?.sceneId),parts:Part[]=[{type:'text',text:JSON.stringify({task:'Review the hero frame: the scene that proves the promise, in the reference format. Judge it as the frame every other scene will follow.',hero:{copy:hero?.copy,notes:hero?.visualNotes},product:input.brief.product,offer:input.brief.offer,audience:input.brief.audience,brandTokens:input.brand.tokens,measured:{findings:measured.slice(0,20)},views:shots.map(x=>x.label),round})}];
   for(const shot of shots){const url=await screenshotForDesigner(shot.file,1024),[head,data]=url.split(',');parts.push({type:'text',text:shot.label},{type:'image',mediaType:head.slice(5,head.indexOf(';')),dataBase64:data});}
   const argv=cliArgs({bin:'claude',model,systemPromptFile:criticFile,emptyMcpConfigFile:mcpFile,cwd:work,includePartialMessages:true,effort:'medium',jsonSchema:criticSchema,isolation:{safeMode:true,restricted:true,noSessionPersistence:true,disableSlashCommands:true}});
   const r=await runCli({bin:'claude',argv,cwd:work,env:childEnv(process.env,{CLAUDE_CODE_MAX_OUTPUT_TOKENS:'32000'}),stdin:streamUserMessage(parts),timeoutMs:900000,idleMs:300000});
   if(r.outcome!=='succeeded')throw new Error(r.failure??r.outcome);
   criticUsd+=r.apiEquivalentUsd??0;criticSeconds+=Math.round(r.durationMs/1000);
   const review=readLiveCritique(r.structured!==undefined?JSON.stringify(r.structured):r.text??'');
   await writeFile(join(out,`hero-review-${round}.json`),JSON.stringify(review,null,1));return review;
  }catch(error){console.error('hero review failed:',error instanceof Error?error.message:error);return undefined;}
 };
 const state=newDesignerState();
 let turnLimit=maxTurns;
 const loop=()=>runDesigner({input,state,maxTurns:turnLimit,maxPictures,heroReviews,timeMs:3600000,tools,save:async()=>{},
  conversation:{continuing:()=>!!session,accept:async()=>{}},
  onTurn:async(turn,results)=>{await writeFile(join(out,`turn-${state.turn}.json`),JSON.stringify({focus:turn.focus,seen:turn.seen,notes:turn.notes,render:turn.render,settleHero:turn.settleHero,finish:turn.finish,files:turn.files.map(f=>`${f.path} ${f.source.length}`),edits:turn.edits.length,results},null,1));},
  call:async(request,images)=>{
   const parts:Part[]=[{type:'text',text:JSON.stringify(session?request:{input:designerContext(input),request})}];
   for(const image of images){const [head,data]=image.url.split(',');parts.push({type:'text',text:image.label},{type:'image',mediaType:head.slice(5,head.indexOf(';')),dataBase64:data});}
   const argv=cliArgs({bin:'claude',model,systemPromptFile:systemFile,emptyMcpConfigFile:mcpFile,cwd:work,includePartialMessages:true,effort,jsonSchema:schema,
    isolation:{safeMode:true,restricted:true,noSessionPersistence:false,disableSlashCommands:true},...(session?{resume:session}:{})});
   const r=await runCli({bin:'claude',argv,cwd:work,env:childEnv(process.env,{CLAUDE_CODE_MAX_OUTPUT_TOKENS:'64000'}),stdin:streamUserMessage(parts),timeoutMs:1500000,idleMs:300000});
   if(r.outcome!=='succeeded')throw new Error(`CLI ${r.failure??r.outcome}: ${(r.text??r.stderr).slice(0,400)}`);
   session=r.init?.sessionId??session;usd=Math.max(usd,r.apiEquivalentUsd??0);
   log.push({turn:request.turn,seconds:Math.round(r.durationMs/1000),usage:(r.usage??{}) as Usage,usd:r.apiEquivalentUsd});
   return r.structured!==undefined?JSON.stringify(r.structured):r.text??'';
  }});
 await loop();
 // The end review, as in a run: the reviewer sees every scene in every ordered format and its notes go back to the
 // designer for one repair round.
 const endReview=Number(arg('endreview','1'));
 if(endReview&&state.complete){
  try{
   const parts:Part[]=[],measured:unknown[]=[];
   for(const scene of input.storyboard){const views=designerViews(input,scene.id,input.formats.map(f=>f.id)),r=await tools.render(views);measured.push(...r.summary.reports.flatMap(x=>x.findings).slice(0,10));
    for(const shot of r.shots){const url=await screenshotForDesigner(shot.file,640),[head,data]=url.split(',');parts.push({type:'text',text:`scene ${input.storyboard.indexOf(scene)+1} · ${views.find(v=>v.key===shot.key)?.label}`},{type:'image',mediaType:head.slice(5,head.indexOf(';')),dataBase64:data});}}
   parts.unshift({type:'text',text:JSON.stringify({task:'Review the finished draft: every scene in every ordered format.',scenes:input.storyboard.map((x,i)=>({scene:i+1,copy:x.copy,notes:x.visualNotes})),product:input.brief.product,offer:input.brief.offer,audience:input.brief.audience,brandTokens:input.brand.tokens,measured:{findings:measured}})});
   const argv=cliArgs({bin:'claude',model,systemPromptFile:criticFile,emptyMcpConfigFile:mcpFile,cwd:work,includePartialMessages:true,effort:'medium',jsonSchema:criticSchema,isolation:{safeMode:true,restricted:true,noSessionPersistence:true,disableSlashCommands:true}});
   const r=await runCli({bin:'claude',argv,cwd:work,env:childEnv(process.env,{CLAUDE_CODE_MAX_OUTPUT_TOKENS:'32000'}),stdin:streamUserMessage(parts),timeoutMs:900000,idleMs:300000});
   if(r.outcome!=='succeeded')throw new Error(r.failure??r.outcome);
   criticUsd+=r.apiEquivalentUsd??0;criticSeconds+=Math.round(r.durationMs/1000);
   const review=readLiveCritique(r.structured!==undefined?JSON.stringify(r.structured):r.text??'');
   await writeFile(join(out,'end-review.json'),JSON.stringify(review,null,1));
   if(!review.accepted&&review.notes.length){
    state.complete=false;delete state.finish;state.renders={};turnLimit=state.turn+Number(arg('repair','6'));
    state.transcript.push({from:'tool',text:JSON.stringify({review:{notes:review.notes.map(n=>`[${n.priority}] ${n.view}: ${n.problem} Wanted: ${n.fix}`)},ask:'The reviewer looked at every scene in every format. Apply these notes, render what you changed, look, then finish again.'})});
    await loop();
   }
  }catch(error){console.error('end review failed:',error instanceof Error?error.message:error);}
 }
 // The sweep a person looks at: every scene in every format, in each language and hook.
 const sweep=resolve(out,'sweep');await mkdir(sweep,{recursive:true});let hard=0,soft=0;
 try{for(const scene of input.storyboard){const formats=input.formats.map(f=>f.id),views=[...new Set(input.variants.map(v=>`${v.locale}|${v.hook}`))].flatMap(k=>{const [locale,hook]=k.split('|');return designerViews({...input,variants:input.variants.filter(v=>v.locale===locale&&v.hook===hook)},scene.id,formats).filter(v=>v.shot);});
   const r=await tools.render(views);hard+=r.summary.hard;soft+=r.summary.soft;
   await writeFile(join(sweep,`${scene.id}-findings.json`),JSON.stringify(r.summary.reports.flatMap(x=>x.findings),null,1));
   for(const shot of r.shots){const jpeg=await screenshotForDesigner(shot.file,540);await writeFile(join(sweep,`${shot.key.replace(/[^\w.-]+/g,'_')}.jpg`),Buffer.from(jpeg.split(',')[1],'base64'));}}
 }catch(error){console.error('sweep:',error instanceof Error?error.message:error);}
 const total=log.reduce((t,l)=>({seconds:t.seconds+l.seconds,input:t.input+(l.usage.input_tokens??0)+(l.usage.cache_creation_input_tokens??0),cached:t.cached+(l.usage.cache_read_input_tokens??0),output:t.output+(l.usage.output_tokens??0)}),{seconds:0,input:0,cached:0,output:0});
 const summary={brand:brand.id,...(without?{withoutSkill:without}:{}),version,model,effort,turns:state.turn,complete:state.complete,hero:state.hero?.acceptedBy,...total,usd:Math.round(usd*100)/100,criticUsd:Math.round(criticUsd*100)/100,criticSeconds,sweep:{hard,soft},frame:await readFile(join(folder,'Frame.tsx'),'utf8').then(s=>s.length,()=>0),log};
 await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,1));
 console.log(JSON.stringify({...summary,log:undefined,out}));
 await rm(dir,{recursive:true,force:true});
}

/** --dry=1: everything up to the first request, and nothing sent. Sets up the workspace, checks the brand's files,
 * builds what the first request would hold and prints its sizes, so a command can be checked before a live run. */
async function dryRun(input:DirectionInput,folder:string,facts:{brand:string;pack:string;materials:{name:string;kind?:string;line?:string;materialId?:string}[];brandName?:string},out:string){
 const chat=arg('chat-baseline','0')==='1',missing=missingBrandFiles(input,join(folder,'public'));
 const logoLines=logoFactLines(await measureLogos(folder,input,facts.materials),input),referenceLines=await referenceFactLines(folder,input,facts.materials),suppliedFacts=await suppliedFactLines(folder,input,assetNames(input));
 const staged=buildStageSkills(readSkills(),[]),digest=designerDigestText(input,{sceneIds:false,heroOnly:true,logoLines,referenceLines,suppliedFacts}),task=heroTask(input,{pictures:Number(arg('pictures','4'))});
 const message=chatBaselineMessage(input,{brand:facts.brand,brandName:facts.brandName},{logos:input.brand.logos.map(l=>l.url),supplied:assetNames(input).map(n=>input.assets.find(a=>a.id===n.id)!.url)});
 const report={dry:true,mode:chat?'chat-baseline':'pipeline',designerVersion:Number(input.brief.designerVersion),switches:{noCritic,advisory,...ablation},out,missingBrandFiles:missing.map(m=>m.label),logos:logoLines.length,brandPictures:referenceLines.length,drawableBrandPictures:referenceLines.filter(l=>/· use it$/.test(l)).length,suppliedFiles:Object.keys(suppliedFacts).length,
  ...(chat?{firstMessageCharacters:message.length}:{brandPackCharacters:facts.pack.length,digestCharacters:digest.length,heroTaskCharacters:task.length,heroSkillsCharacters:creatorStageText(staged,'hero').length,heroChecks:reviewMaterialFor(input,staged,'hero',{chosenIdea:arg('no-ideas','0')!=='1'}).checks.length,ideasTurn:arg('no-ideas','0')!=='1',heroReviews:noCritic?0:advisory?1:Number(arg('reviews','2'))})};
 await writeFile(join(out,'dry.json'),JSON.stringify(report,null,1));console.log(JSON.stringify(report));
}
async function writeV5Summary(out:string,label:Record<string,unknown>,started:number,result:Awaited<ReturnType<typeof runV5Direction>>|undefined,stopped:string|undefined){
 if(!result){await writeFile(join(out,'summary.json'),JSON.stringify({...label,stopped},null,1));return;}
 await writeFile(join(out,'timeline.txt'),result.timeline.join('\n')+'\n');
 const hero=result.state.hero?.shots?.[0]?.file;if(hero)await copyFile(hero,join(out,'hero.png')).catch(()=>undefined);
 const first=result.calls.find(c=>c.role==='designer'),renderTurn=result.timeline.findIndex(l=>/^Turn \d+:.*Rendered/.test(l));
 const summary={...label,turns:result.state.turn,complete:result.state.complete,hero:result.state.hero?.acceptedBy,heroReviews:result.state.hero?.reviews,ideas:{picked:result.state.ideas?.picked,rounds:result.state.ideas?.rounds,unreviewed:result.state.ideas?.unreviewed},pictures:result.state.pictures,pictureWaitSeconds:Math.round((result.state.pictureWaitMs??0)/1000),edits:{applied:result.timeline.join('\n').match(/Changed [^ ]+ \(\d+ edit/g)?.length??0,refusedTurns:result.timeline.filter(l=>/edits? (was|were) not applied/.test(l)).length},designerOutputPerTurn:result.calls.filter(c=>c.role==='designer').map(c=>c.usage?.output??0),
  firstTurnInput:(first?.usage?.input??0)+(first?.usage?.cacheCreation??0)+(first?.usage?.cacheRead??0),firstRenderLine:renderTurn>=0?result.timeline[renderTurn].slice(0,80):null,
  endReview:result.endReview,gaps:result.gaps,status:result.status,seconds:Math.round((Date.now()-started)/1000),apiEquivalentUsd:Math.round(result.apiEquivalentUsd*100)/100,calls:result.calls.map(c=>({role:c.role,stage:c.stage,conversation:c.conversation,model:c.usage?.model,effort:c.usage?.effort,input:(c.usage?.input??0)+(c.usage?.cacheCreation??0),cached:c.usage?.cacheRead,output:c.usage?.output,usd:c.usage?.apiEquivalentUsd}))};
 await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,1));console.log(JSON.stringify({...summary,calls:summary.calls.length,out}));
}
/** A real run's designer direction, rebuilt from its export: the block's own input (planning outputs, copy, brand in
 * code), its brand pack and brief from the frozen run context, and the workspace's public files. The compact brand
 * sheet pictures are not in an export (bytes are never exported), so the run context here has the pack text only. */
/** The compact brand sheet as the run froze it: the export keeps each picture's facts in run-context.json and its bytes by hash. */
async function exportedPackImages(folder:string,images:unknown){
 const out:NonNullable<RunContext['images']>=[];
 for(const i of Array.isArray(images)?images as NonNullable<RunContext['images']>:[]){const file=join(folder,'device','pictures',`${String(i.sha256).replace(/[^a-f0-9]/g,'')}.jpg`);if(existsSync(file))out.push({...i,dataBase64:(await readFile(file)).toString('base64')});}
 return out;
}
async function benchFromExport(folder:string){
 const read=async(p:string)=>JSON.parse(await readFile(join(folder,p),'utf8'));
 const blocks=await read('database/studio_director_blocks.json') as {snapshot:{inputs:DirectionInput[]}}[],input=structuredClone(blocks.at(-1)!.snapshot.inputs[Number(arg('direction','0'))]);
 if(!input)throw new Error('The export has no direction at that index.');
 // --direction-name=<words>: rename the direction (an experiment switch, for a direction whose name fixes the subject).
 {const d=input.creativeHandoff?.intent.direction as {name?:string}|undefined;if(d&&arg('direction-name',''))d.name=arg('direction-name','');}
 const context=await read('device/run-context.json') as {system:string;brief:string;materials?:RunContext['materials'];images?:unknown},packText=context.system.slice(context.system.indexOf('\n',context.system.indexOf('BRAND PACK'))+1),
  // --pack-aesthetic=<file>: a stand-in for the AESTHETIC label of a pack written before the label existed (an experiment switch).
  pack=arg('pack-aesthetic','')?packText.replace('\n\nDEVICES:',`\n\n${(await readFile(resolve(arg('pack-aesthetic','')),'utf8')).trim()}\n\nDEVICES:`):packText,brief=context.brief.slice(context.brief.indexOf('\n')+1);
 const out=resolve(arg('out','artifacts/bench'),`export-${input.directionId.slice(0,8)}-${arg('chat-baseline','0')==='1'?'chat':`v${Number(arg('designer','0'))||5}`}${arg('hero-only','0')==='1'?'-hero':''}${ablationName}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'')}`);await mkdir(out,{recursive:true});
 process.env.TOGGLE_HOME??=resolve(out,'home');
 const workspace=await createWorkspace(resolve(out,'workspace'),input),pub=join(workspace,'public'),source=join(folder,'designer',input.directionId.slice(0,8),'workspace','public');
 await cp(source,pub,{recursive:true}).catch(()=>{throw new Error(`The export has no workspace files at ${source}: export the run on the computer that made the draft.`);});
 // Brand files: the fonts, logos and references the direction's input names must be in the workspace, or the frame is
 // not the brand's (a missing font file draws every line in a fallback and the designer spends turns finding out why).
 // Font files the export lacks: first the app's own font files (public/fixtures; taken only when their bytes are the
 // stored file's), then the folder given with --fonts.
 const fontsFrom=arg('fonts',''),filled=[...await fillBrandFonts(input,pub,resolve('public/fixtures')),...(fontsFrom?await fillBrandFonts(input,pub,resolve(fontsFrom)):[])];
 if(filled.length)console.error(`[bench] font files filled: ${filled.map(f=>`${f.from}${f.exact?'':' (stand-in, not the stored file)'}`).join(', ')}`);
 // The catalogue's pictures of this workspace's own brand files are read from those files.
 if(context.materials)context.materials={...context.materials,entries:localMaterialEntries(context.materials.entries,input,pub)};
 const missing=missingBrandFiles(input,pub,filled.filter(f=>!f.exact).map(f=>f.url));
 if(missing.length&&arg('allow-missing','0')!=='1'){console.error(`[bench] stopped before any request:\n${missingBrandFilesMessage(missing)}`);await writeFile(join(out,'summary.json'),JSON.stringify({source:'export',stopped:'BRAND_FILES_MISSING',missingBrandFiles:missing},null,1));process.exitCode=2;return;}
 const designerVersion=Number(arg('designer','0'));if(designerVersion)input.brief={...input.brief,designerVersion} as DirectionInput['brief'];
 const catalog:CatalogEntry[]=[],pictures=resolve(out,'pictures');await mkdir(pictures,{recursive:true});await writeResources(workspace,input,catalog);
 if(arg('dry','0')==='1'){await dryRun(input,workspace,{brand:brandFactsFromPack(pack),pack,materials:context.materials?.entries??[]},out);return;}
 // The chat baseline: one plain conversation on the designer's model instead of the pipeline (scripts/bench/chat-baseline.ts).
 if(arg('chat-baseline','0')==='1'){const summary=await runChatBaseline({input,folder:workspace,out,facts:{brand:brandFactsFromPack(pack)},designerModel:arg('designer-model','anthropic/claude-opus-5.5'),sonnet:arg('sonnet','claude-sonnet-5-5'),bin:arg('bin','claude'),buy:fileDropPictures(pictures,pub,workspace,input,catalog,Number(arg('wait','900'))*1000,refusal)});console.log(JSON.stringify({...summary,perTurn:undefined,out}));return;}
 const started=Date.now();let result,stopped:string|undefined;
 try{result=await runV5Direction({input,folder:workspace,out,brandPack:pack,briefText:brief,designerModel:arg('designer-model','anthropic/claude-opus-5.5'),criticModel:arg('critic-model','google/gemini-4-argon'),maxTurns:Number(arg('turns','24')),heroReviews:noCritic?0:advisory?1:Number(arg('reviews','2')),endReview:!noCritic&&arg('endreview','1')==='1',heroOnly:arg('hero-only','0')==='1',...ablation,
  maxPictures:Number(arg('pictures','4')),buy:fileDropPictures(pictures,pub,workspace,input,catalog,Number(arg('wait','900'))*1000,refusal),catalog,recordRequests:true,materials:context.materials,brandFileEntries:true,...(existsSync(join(folder,'device','pictures'))?{storedPictures:join(folder,'device','pictures'),packImages:await exportedPackImages(folder,context.images)}:{}),...(arg('hold','')?{pictureHoldMs:Number(arg('hold','180'))*1000}:{}),
  setup:{bin:arg('bin','claude'),cliVersion:'bench',isolation:{safeMode:true,restricted:true,noSessionPersistence:false,disableSlashCommands:true},sonnet:arg('sonnet','claude-sonnet-5-5'),schemaMode:'cli',visual:true,deviceId:'bench'}});}
 catch(error){stopped=`${error instanceof Error?error.message:error}${(error as {detail?:string})?.detail?`: ${(error as {detail?:string}).detail}`:''}`;console.error('[bench] stopped:',stopped);}
 await writeV5Summary(out,{source:'export',direction:input.directionId.slice(0,8),version:5,designerVersion:Number(input.brief.designerVersion),heroOnly:arg('hero-only','0')==='1',missingBrandFiles:missing.map(m=>m.label),fontsFilled:filled,catalogueEntries:context.materials?.entries.length??0},started,result,stopped);
}
/** One version 5 direction on the real CLI. Pictures: the request is written to <out>/pictures/<id>.request.json and the
 * bench waits for <id>.png or <id>.jpg beside it (made by hand); without it the designer is told the picture failed. */
async function benchV5(brand:BenchBrand,out:string,o:{maxTurns:number;designerModel:string;criticModel:string;sonnet:string;heroReviews:number;endReview:boolean;maxPictures:number;waitMs:number}){
 process.env.TOGGLE_HOME??=resolve(out,'home');
 const base=benchInputV5(brand),designerVersion=Number(arg('designer','0')),input=designerVersion?{...base,brief:{...base.brief,designerVersion}} as DirectionInput:base;
 const folder=await createWorkspace(resolve(out,'workspace'),input),pub=join(folder,'public'),pictures=resolve(out,'pictures'),catalog:CatalogEntry[]=[];
 try{await prepareBrandWorkspace(brand,pub,resolve(arg('supplied',`artifacts/bench/supplied/${brand.id}`)));}
 catch(error){console.error(`[bench] stopped before any request:\n${error instanceof Error?error.message:error}`);await writeFile(join(out,'summary.json'),JSON.stringify({brand:brand.id,stopped:'BENCH_SUPPLIED_FILE_MISSING'},null,1));process.exitCode=2;return;}
 await mkdir(pictures,{recursive:true});await writeResources(folder,input,catalog);
 const entries=benchCatalogue(brand,pub);
 if(arg('dry','0')==='1'){await dryRun(input,folder,{brand:benchBrandPack(brand),pack:benchBrandPack(brand),materials:entries,brandName:brand.name},out);return;}
 if(arg('chat-baseline','0')==='1'){const summary=await runChatBaseline({input,folder,out,facts:{brand:benchBrandPack(brand),brandName:brand.name},designerModel:o.designerModel,sonnet:o.sonnet,bin:arg('bin','claude'),buy:fileDropPictures(pictures,pub,folder,input,catalog,o.waitMs,refusal)});console.log(JSON.stringify({...summary,perTurn:undefined,brand:brand.id,out}));return;}
 const started=Date.now();let result,stopped:string|undefined;
 try{result=await runV5Direction({input,folder,out,brandPack:benchBrandPack(brand),designerModel:o.designerModel,criticModel:o.criticModel,maxTurns:o.maxTurns,heroReviews:noCritic?0:advisory?1:o.heroReviews,endReview:!noCritic&&o.endReview,...ablation,heroOnly:arg('hero-only','0')==='1',maxPictures:o.maxPictures,buy:fileDropPictures(pictures,pub,folder,input,catalog,o.waitMs,refusal),catalog,recordRequests:true,...(entries.length?{materials:{entries,budget:DEFAULT_MATERIAL_BUDGET} as unknown as RunContext['materials']}:{}),...(arg('hold','')?{pictureHoldMs:Number(arg('hold','180'))*1000}:{}),
  setup:{bin:arg('bin','claude'),cliVersion:'bench',isolation:{safeMode:true,restricted:true,noSessionPersistence:false,disableSlashCommands:true},sonnet:o.sonnet,schemaMode:'cli',visual:true,deviceId:'bench'}});}
 catch(error){stopped=`${error instanceof Error?error.message:error}${(error as {detail?:string})?.detail?`: ${(error as {detail?:string}).detail}`:''}`;console.error('[bench] stopped:',stopped);}
 await writeV5Summary(out,{brand:brand.id,version:5,designerVersion:Number(input.brief.designerVersion),heroOnly:arg('hero-only','0')==='1',ablation:{noCritic,...ablation},designerModel:o.designerModel,criticModel:o.criticModel},started,result,stopped);
}

main().catch(error=>{console.error(error instanceof Error?error.stack:error);process.exitCode=1;});
