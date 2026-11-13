// Draft bench: a designer run against the real Claude Code CLI, with the real build, render and measurement, and no
// database. It exists so a change to instructions, skills or the kit can be judged by its frames, time and tokens
// before it reaches a studio run.
//
// LIVE: every run spends the signed-in Claude subscription. Never part of `npm test`; run it by hand:
//   node --import tsx scripts/bench/draft-bench.ts <brand> [--mode=client|propose] [--turns=6] [--out=artifacts/bench]
import {mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {brands,benchInput,type BenchBrand} from './brands';
import {createWorkspace} from '../../apps/local-runner/director/workspace';
import {designerTools,provisionalDesign} from '../../apps/local-runner/director/designer-run';
import {designerViews,screenshotForDesigner} from '../../apps/local-runner/director/designer-loop';
import {cliArgs,runCli,childEnv,streamUserMessage} from '../../packages/agents/claude-cli.local';
import {readSkills} from '../../packages/agents/skill-files';
import {benchInstructions,benchBrief,benchTurn,readBenchAnswer} from './protocol';
import type {DirectionInput} from '../../packages/director/types';

type Part={type:'text';text:string}|{type:'image';mediaType:string;dataBase64:string};
type Usage={input_tokens?:number;output_tokens?:number;cache_creation_input_tokens?:number;cache_read_input_tokens?:number};
const arg=(name:string,fallback:string)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.split('=')[1]??fallback;

async function main(){
 const brand=brands.find(b=>b.id===process.argv[2]);if(!brand)throw new Error(`Brand: ${brands.map(b=>b.id).join(' | ')}`);
 const mode=arg('mode','client') as 'client'|'propose',maxTurns=Number(arg('turns','6')),model=arg('model','claude-sonnet-5-5'),effort=arg('effort','high');
 const out=resolve(arg('out','artifacts/bench'),`${brand.id}-${mode}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'')}`);
 await mkdir(out,{recursive:true});
 const input=benchInput(brand),folder=await workspace(brand,input,out);
 const design=provisionalDesign(input),tools=designerTools({folder,input,design,deadline:()=>Date.now()+600000,preview:async()=>{},facts:()=>({}),save:async()=>{},buy:async()=>undefined});
 // The cached part of every request: the role, its craft skills and the kit's interface.
 const skills=readSkills().filter(s=>s.defaultRoles.includes('designer'));
 const dir=await mkdtemp(join(tmpdir(),'bench-cli-')),systemFile=join(dir,'system.txt'),mcpFile=join(dir,'mcp.json'),work=resolve(out,'cli');
 await mkdir(work,{recursive:true});await writeFile(systemFile,benchInstructions(skills));await writeFile(mcpFile,'{"mcpServers":{}}');
 const log:{turn:number;seconds:number;usage:Usage;usd?:number;turns?:number;note:string}[]=[];let session:string|undefined;
 const ask=async(parts:Part[],turn:number)=>{
  const argv=cliArgs({bin:'claude',model,systemPromptFile:systemFile,emptyMcpConfigFile:mcpFile,cwd:work,includePartialMessages:true,effort,
   isolation:{safeMode:true,restricted:true,noSessionPersistence:false,disableSlashCommands:true},...(session?{resume:session}:{})});
  const r=await runCli({bin:'claude',argv,cwd:work,env:childEnv(process.env,{CLAUDE_CODE_MAX_OUTPUT_TOKENS:'64000'}),stdin:streamUserMessage(parts),timeoutMs:1500000,idleMs:300000});
  if(r.outcome!=='succeeded'||!r.text)throw new Error(`CLI ${r.failure??r.outcome}: ${(r.text??r.stderr).slice(0,400)}`);
  session=r.init?.sessionId??session;
  log.push({turn,seconds:Math.round(r.durationMs/1000),usage:(r.usage??{}) as Usage,usd:r.apiEquivalentUsd,turns:r.numTurns,note:''});
  await writeFile(join(out,`turn-${turn}.txt`),r.text);
  return r.text;
 };
 let parts:Part[]=[{type:'text',text:benchBrief(brand,input,mode,arg('pictures','none') as 'none'|'ask')}],shots:string[]=[];
 for(let turn=1;turn<=maxTurns;turn++){
  const answer=readBenchAnswer(await ask(parts,turn));
  log[log.length-1].note=answer.say.slice(0,200);
  for(const f of answer.files)await tools.write(f.path,f.source);
  if(answer.done&&!answer.files.length)break;
  const built=await tools.build();
  let report:{build:string;findings?:unknown;views?:string[]}={build:built.ok?'passed':`failed: ${built.issue.split('\n').slice(0,12).join('\n')}`};
  const images:Part[]=[];
  if(built.ok){
   const scenes=(answer.scenes.length?answer.scenes:[input.storyboard[0].id]).filter(id=>input.storyboard.some(x=>x.id===id)),per=Math.max(1,Math.floor(6/Math.max(1,scenes.length)));
   const views=scenes.flatMap(id=>designerViews(input,id,answer.formats.slice(0,per)));
   const rendered=await tools.render(views);shots=[];
   for(const shot of rendered.shots){const file=join(out,`turn-${turn}-${shot.key.replace(/[^\w.-]+/g,'_')}.jpg`),jpeg=await screenshotForDesigner(shot.file,768);await writeFile(file,Buffer.from(jpeg.split(',')[1],'base64'));shots.push(file);
    images.push({type:'text',text:`Render: ${shot.key.split('|')[2]} · ${views.find(v=>v.key===shot.key)?.label??shot.key}`},{type:'image',mediaType:'image/jpeg',dataBase64:jpeg.split(',')[1]});}
   report={build:'passed',findings:rendered.summary.reports.flatMap(r=>r.findings).sort((a,b)=>Number(b.severity==='hard')-Number(a.severity==='hard')).slice(0,20),views:[...new Set(views.map(v=>`${v.key.split('|')[2]} ${v.label}`))]};
  }
  await writeFile(join(out,`turn-${turn}-report.json`),JSON.stringify(report,null,1));
  if(answer.done&&built.ok)break;
  parts=[{type:'text',text:benchTurn(report,turn,maxTurns)},...images];
 }
 // The sweep a person looks at: every scene in every format, in each language (not sent to the model).
 const sweep=resolve(out,'sweep');await mkdir(sweep,{recursive:true});let hard=0,soft=0;
 try{for(const scene of input.storyboard){const formats=input.formats.map(f=>f.id),views=[...new Set(input.variants.map(v=>`${v.locale}|${v.hook}`))].flatMap(k=>{const [locale,hook]=k.split('|'),first=input.variants.filter(v=>v.locale===locale&&v.hook===hook);return designerViews({...input,variants:first},scene.id,formats).filter(v=>v.shot);});
   const r=await tools.render(views);hard+=r.summary.hard;soft+=r.summary.soft;
   await writeFile(join(sweep,`${scene.id}-findings.json`),JSON.stringify(r.summary.reports.flatMap(x=>x.findings),null,1));
   for(const shot of r.shots){const jpeg=await screenshotForDesigner(shot.file,540);await writeFile(join(sweep,`${shot.key.replace(/[^\w.-]+/g,'_')}.jpg`),Buffer.from(jpeg.split(',')[1],'base64'));}}
 }catch(error){console.error('sweep:',error instanceof Error?error.message:error);}
 const total=log.reduce((t,l)=>({seconds:t.seconds+l.seconds,input:t.input+(l.usage.input_tokens??0)+(l.usage.cache_creation_input_tokens??0),cached:t.cached+(l.usage.cache_read_input_tokens??0),output:t.output+(l.usage.output_tokens??0),usd:t.usd+(l.usd??0)}),{seconds:0,input:0,cached:0,output:0,usd:0});
 const summary={brand:brand.id,mode,model,effort,turns:log.length,...total,usd:Math.round(total.usd*100)/100,log,shots,workspace:folder,sweep:{hard,soft},frame:await readFile(join(folder,'Frame.tsx'),'utf8').then(s=>s.length,()=>0)};
 await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,1));
 console.log(JSON.stringify({out,turns:summary.turns,seconds:summary.seconds,input:summary.input,cached:summary.cached,output:summary.output,usd:summary.usd,frameChars:summary.frame,hard,soft,shots:shots.length}));
 await rm(dir,{recursive:true,force:true});
}

/** A draft workspace with the brand's files and the engine kit, as the runner would prepare it. */
async function workspace(brand:BenchBrand,input:DirectionInput,out:string){
 const folder=await createWorkspace(resolve(out,'workspace'),input),pub=join(folder,'public');
 for(const f of brand.fonts)await copyFile(f.source,join(pub,f.file));
 await writeFile(join(pub,'logo.svg'),brand.logoSvg);
 await copyFile(resolve('remotion/director/kit.ts'),join(folder,'kit.ts'));
 return folder;
}

main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
