// Pipeline bench: the production designer loop (runDesigner, the real instructions, response schema, build, render and
// measurement) against the real Claude Code CLI, with no database. What passes here is what a studio run executes.
//
// LIVE: every run spends the signed-in Claude subscription. Never part of `npm test`; run it by hand:
//   node --import tsx scripts/bench/pipeline-bench.ts <brand> [--turns=12] [--model=claude-sonnet-5-5] [--effort=high] [--version=3]
import {mkdir,writeFile,readFile,copyFile,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {brands,benchInput} from './brands';
import {createWorkspace,writeResources} from '../../apps/local-runner/director/workspace';
import {designerTools,provisionalDesign} from '../../apps/local-runner/director/designer-run';
import {designerViews,screenshotForDesigner,runDesigner,newDesignerState} from '../../apps/local-runner/director/designer-loop';
import {cliArgs,runCli,childEnv,streamUserMessage} from '../../packages/agents/claude-cli.local';
import {readSkills} from '../../packages/agents/skill-files';
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

async function main(){
 const brand=brands.find(b=>b.id===process.argv[2]);if(!brand)throw new Error(`Brand: ${brands.map(b=>b.id).join(' | ')}`);
 const maxTurns=Number(arg('turns','12')),model=arg('model','claude-sonnet-5-5'),effort=arg('effort','high'),version=Number(arg('version','3'));
 const out=resolve(arg('out','artifacts/bench'),`${brand.id}-pipeline-v${version}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'')}`);
 await mkdir(out,{recursive:true});
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
 const skills=readSkills().filter(s=>s.defaultRoles.includes('designer'));
 const dir=await mkdtemp(join(tmpdir(),'bench-cli-')),systemFile=join(dir,'system.txt'),mcpFile=join(dir,'mcp.json'),work=resolve(out,'cli');
 await mkdir(work,{recursive:true});await writeFile(mcpFile,'{"mcpServers":{}}');
 await writeFile(systemFile,designerInstructionsFor(input)+'\n\nSKILLS\n'+skills.map(s=>`## ${s.title}\n${s.text.trim()}`).join('\n\n'));
 const log:{turn:number;seconds:number;usage:Usage;usd?:number}[]=[];let session:string|undefined,usd=0;
 // The CLI's validator has no meta-schema to resolve.
 const {$schema:_meta,...schema}=designerTurnResponseFor(input).schema;void _meta;
 // The hero frame's review, as in a run: the critic sees the render and the measured findings and returns notes.
 const heroReviews=Number(arg('reviews','2')),criticFile=join(dir,'critic.txt');
 await writeFile(criticFile,liveCriticInstructionsFor(input.brief)+'\n\nSKILLS\n'+readSkills().filter(s=>s.defaultRoles.includes('critic')).map(s=>`## ${s.title}\n${s.text.trim()}`).join('\n\n'));
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
 await runDesigner({input,state,maxTurns,maxPictures,heroReviews,timeMs:3600000,tools,save:async()=>{},
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
 // The sweep a person looks at: every scene in every format, in each language and hook.
 const sweep=resolve(out,'sweep');await mkdir(sweep,{recursive:true});let hard=0,soft=0;
 try{for(const scene of input.storyboard){const formats=input.formats.map(f=>f.id),views=[...new Set(input.variants.map(v=>`${v.locale}|${v.hook}`))].flatMap(k=>{const [locale,hook]=k.split('|');return designerViews({...input,variants:input.variants.filter(v=>v.locale===locale&&v.hook===hook)},scene.id,formats).filter(v=>v.shot);});
   const r=await tools.render(views);hard+=r.summary.hard;soft+=r.summary.soft;
   await writeFile(join(sweep,`${scene.id}-findings.json`),JSON.stringify(r.summary.reports.flatMap(x=>x.findings),null,1));
   for(const shot of r.shots){const jpeg=await screenshotForDesigner(shot.file,540);await writeFile(join(sweep,`${shot.key.replace(/[^\w.-]+/g,'_')}.jpg`),Buffer.from(jpeg.split(',')[1],'base64'));}}
 }catch(error){console.error('sweep:',error instanceof Error?error.message:error);}
 const total=log.reduce((t,l)=>({seconds:t.seconds+l.seconds,input:t.input+(l.usage.input_tokens??0)+(l.usage.cache_creation_input_tokens??0),cached:t.cached+(l.usage.cache_read_input_tokens??0),output:t.output+(l.usage.output_tokens??0)}),{seconds:0,input:0,cached:0,output:0});
 const summary={brand:brand.id,version,model,effort,turns:state.turn,complete:state.complete,hero:state.hero?.acceptedBy,...total,usd:Math.round(usd*100)/100,criticUsd:Math.round(criticUsd*100)/100,criticSeconds,sweep:{hard,soft},frame:await readFile(join(folder,'Frame.tsx'),'utf8').then(s=>s.length,()=>0),log};
 await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,1));
 console.log(JSON.stringify({...summary,log:undefined,out}));
 await rm(dir,{recursive:true,force:true});
}

main().catch(error=>{console.error(error instanceof Error?error.stack:error);process.exitCode=1;});
