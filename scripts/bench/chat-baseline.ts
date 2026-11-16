// The chat baseline of the bench: the owner's yardstick is "at least as good as a first-attempt ordinary Claude chat".
// ONE plain conversation on the designer's model: no roles, no skills, no reviewer, no stage instructions, no kit
// rules beyond what a file needs to render. The message is what a person would type: the brief in plain words, the
// brand's facts, the files (the logo and the supplied photographs as pictures), the scene's words, "make one finished
// frame", and the smallest technical contract that returns a renderable file. One answer, at most one repair turn if
// the file does not build, rendered by the same renderer as the pipeline. Nothing here is used by a studio run.
import {mkdir,mkdtemp,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {designerTools,provisionalDesign} from '../../apps/local-runner/director/designer-run';
import {designerViews,type DesignerTools} from '../../apps/local-runner/director/designer-loop';
import {heroBrief} from '../../packages/director/hero-chat';
import {heroScene} from '../../packages/director/designer';
import {assetNames} from '../../packages/director/asset-names';
import {localModelFor} from '../../packages/agents/local-models';
import {cliArgs,runCli,childEnv,streamUserMessage,type CliPart} from '../../packages/agents/claude-cli.local';
import type {DirectionInput,CatalogEntry,Resource} from '../../packages/director/types';

/** The one system line of the baseline: a chat has a system prompt of its own; this stands in for it and says nothing
 * about advertising, design or this app. */
export const CHAT_BASELINE_SYSTEM='You are Claude, a helpful assistant.';
export type ChatBaselineFacts={/** the brand in plain text: its character and rules, without the app's catalogue */brand:string;brandName?:string};

/** The brand part of the message from a run's brand pack text: everything before the material catalogue. */
export const brandFactsFromPack=(pack:string)=>pack.split(/\nMATERIAL CATALOGUE\b/)[0].trim();

/** The message a person would type, as text. Deterministic for the same input. */
export function chatBaselineMessage(input:DirectionInput,facts:ChatBaselineFacts,files:{logos:string[];supplied:string[]}):string{
 const b=heroBrief(input),brief=input.brief as Record<string,unknown>,line=(label:string,v:unknown)=>typeof v==='string'&&v.trim()?`${label}: ${v.trim()}`:'';
 const fonts=[...new Set(input.brand.fonts.map(f=>f.family))].map(f=>`${f} (${[...new Set(input.brand.fonts.filter(x=>x.family===f).map(x=>x.weight))].join(', ')})`).join('; ');
 const picture=input.resourceIds[0];
 return [
  `I need one finished ad frame, ${b.format?`${b.format.width}×${b.format.height}`:'1080×1080'} pixels, for a social feed. Please design it and write it as code I can render.`,
  ['THE PRODUCT AND THE BRIEF',line('Product',brief.product),line('Offer',brief.offer),line('Audience',brief.audience),line('What we want the viewer to do',brief.cta)].filter(Boolean).join('\n'),
  `THE BRAND${facts.brandName?` (${facts.brandName})`:''}\n${facts.brand.trim()}`,
  ['WHAT THIS FRAME MUST SAY',b.meaning,b.proof?`What backs it up: ${b.proof}`:'',`The words on the frame, exactly these and nothing else${b.locale?` (${b.locale})`:''}: ${b.lines.length?b.lines.map(l=>`"${l}"`).join(' / '):'(no words)'}`].filter(Boolean).join('\n'),
  ['THE FILES (attached as pictures below, and available to the code by these names)',...files.logos.map(n=>`- ${n} (logo)`),...files.supplied.map(n=>`- ${n} (our own picture: use it as it is)`),fonts?`The brand's fonts are installed under these family names: ${fonts}.`:''].filter(Boolean).join('\n'),
  ['HOW TO GIVE ME THE RESULT',
   'One complete file in a code block named Frame.tsx: a React component as the default export that takes {width,height} and draws the frame at exactly that size.',
   "It may import React and {AbsoluteFill, Img, staticFile} from 'remotion'. Draw a file with <Img src={staticFile('file name')}/>. Use the font family names above in CSS.",
   'It is a still picture: no animation, state, effects, timers or network requests. Any CSS and SVG is fine.',
   picture?`If the frame needs a photograph or illustration that I should make for you, add one more code block named picture with JSON {"prompt":"…","aspect":"1:1"}. I will make it and it will be the file '${picture}.png': write the code so that it draws that file.`:''].filter(Boolean).join('\n'),
 ].join('\n\n');
}
/** A logo or photograph as a picture a person would attach (an SVG is drawn to PNG first). */
async function attachment(file:string,max=1024):Promise<CliPart|null>{
 try{const image=await loadImage(await readFile(file)),scale=Math.min(1,max/Math.max(image.width,image.height))||1,c=createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));c.getContext('2d').drawImage(image,0,0,c.width,c.height);
  return {type:'image',mediaType:'image/png',dataBase64:c.toBuffer('image/png').toString('base64')};}catch{return null;}
}
/** Reads the answer: the Frame.tsx block (the first code block with a default export) and the picture requests. */
export function readChatAnswer(text:string):{frame?:string;pictures:{prompt:string;aspect:string}[]}{
 const blocks=[...text.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)].map(m=>({info:m[1].trim().toLowerCase(),body:m[2]}));
 const frame=blocks.find(b=>/frame\.tsx/.test(b.info)&&/export default/.test(b.body))??blocks.find(b=>!/^picture\b/.test(b.info)&&/export default/.test(b.body));
 const pictures=blocks.filter(b=>/^picture\b|^json picture\b/.test(b.info)).flatMap(b=>{try{const v=JSON.parse(b.body) as {prompt?:unknown;aspect?:unknown};return typeof v.prompt==='string'&&v.prompt.trim()?[{prompt:v.prompt.trim().slice(0,4000),aspect:typeof v.aspect==='string'&&/^\d{1,3}:\d{1,3}$/.test(v.aspect)?v.aspect:'1:1'}]:[];}catch{return [];}});
 return {...(frame?{frame:frame.body.replace(/\s+$/,'')+'\n'}:{}),pictures};
}
export type ChatSend=(parts:CliPart[],resume?:string)=>Promise<{text:string;session?:string;usage?:{input_tokens?:number;output_tokens?:number;cache_creation_input_tokens?:number;cache_read_input_tokens?:number};usd?:number;seconds:number}>;
export type ChatBaselineOptions={input:DirectionInput;folder:string;out:string;facts:ChatBaselineFacts;
 /** Target model, as the designer's is set; the Local mapping decides what the CLI runs. */designerModel?:string;sonnet?:string;effort?:string;bin?:string;
 buy:(resource:Resource)=>Promise<CatalogEntry|undefined>;maxPictures?:number;
 /** Tests: the conversation and the build/render tools. */send?:ChatSend;tools?:(real:DesignerTools)=>DesignerTools};

/** Runs the baseline and writes chat.png, chat-message.txt, chat-answer-N.txt and chat.json under `out`. */
export async function runChatBaseline(o:ChatBaselineOptions){
 const {input,folder,out}=o,pub=join(folder,'public'),model=localModelFor(o.designerModel??'anthropic/claude-opus-5.5',{sonnet:o.sonnet??'claude-sonnet-5-5'}).execution,effort=o.effort??'high';
 await mkdir(out,{recursive:true});
 const logos=input.brand.logos.map(l=>l.url),supplied=assetNames(input).map(n=>input.assets.find(a=>a.id===n.id)!.url).filter(u=>/\.(png|jpe?g|webp|svg)$/i.test(u));
 const message=chatBaselineMessage(input,o.facts,{logos,supplied}),parts:CliPart[]=[{type:'text',text:message}];
 for(const name of [...logos,...supplied]){const image=await attachment(join(pub,name));if(image)parts.push({type:'text',text:name},image);}
 await writeFile(join(out,'chat-message.txt'),`${message}\n\n[attached pictures: ${parts.filter(p=>p.type==='text').slice(1).map(p=>(p as {text:string}).text).join(', ')||'none'}]\n[system line: ${CHAT_BASELINE_SYSTEM}]\n[model: ${model} · effort: ${effort}]\n`);
 const dir=await mkdtemp(join(tmpdir(),'chat-baseline-')),systemFile=join(dir,'system.txt'),mcpFile=join(dir,'mcp.json'),work=resolve(out,'cli');
 await mkdir(work,{recursive:true});await writeFile(systemFile,CHAT_BASELINE_SYSTEM);await writeFile(mcpFile,'{"mcpServers":{}}');
 const send:ChatSend=o.send??(async(content,resume)=>{
  const argv=cliArgs({bin:o.bin??'claude',model,systemPromptFile:systemFile,emptyMcpConfigFile:mcpFile,cwd:work,includePartialMessages:true,effort,isolation:{safeMode:true,restricted:true,noSessionPersistence:false,disableSlashCommands:true},...(resume?{resume}:{})});
  const r=await runCli({bin:o.bin??'claude',argv,cwd:work,env:childEnv(process.env,{CLAUDE_CODE_MAX_OUTPUT_TOKENS:'32000'}),stdin:streamUserMessage(content),timeoutMs:1500000,idleMs:300000});
  if(r.outcome!=='succeeded')throw new Error(`CLI ${r.failure??r.outcome}: ${(r.text??r.stderr).slice(0,400)}`);
  return {text:r.text??'',session:r.init?.sessionId,usage:r.usage as never,usd:r.apiEquivalentUsd,seconds:Math.round(r.durationMs/1000)};});
 const design=provisionalDesign(input),real=designerTools({folder,input,design,deadline:()=>Date.now()+600000,preview:async()=>{},facts:()=>({}),save:async()=>{},buy:o.buy}),tools=(o.tools??(t=>t))(real);
 const turns:{seconds:number;input:number;cached:number;output:number;usd?:number}[]=[],note=(r:Awaited<ReturnType<ChatSend>>)=>turns.push({seconds:r.seconds,input:(r.usage?.input_tokens??0)+(r.usage?.cache_creation_input_tokens??0),cached:r.usage?.cache_read_input_tokens??0,output:r.usage?.output_tokens??0,...(r.usd!==undefined?{usd:r.usd}:{})});
 let stopped:string|undefined,built=false,pictures=0,repaired=false;
 try{
  const first=await send(parts);note(first);await writeFile(join(out,'chat-answer-1.txt'),first.text);
  let answer=readChatAnswer(first.text);
  if(!answer.frame)stopped='The answer held no Frame.tsx code block.';
  else{
   // A picture it asked for is made the way a person would paste one: the request is written, the file is awaited.
   for(const p of answer.pictures.slice(0,Math.min(o.maxPictures??1,1))){const made=await tools.requestImage({purpose:'the picture the chat asked for',scene:heroScene(input),prompt:p.prompt,aspect:p.aspect,referenceAssetIds:[],mustNotContain:[]} as never);if(made.status==='ready')pictures++;}
   await tools.write('Frame.tsx',answer.frame);let build=await tools.build();
   if(!build.ok&&first.session){
    // One repair turn, as a person would paste the error back.
    const again=await send([{type:'text',text:`The file does not build:\n${build.issue.slice(0,1500)}\nPlease send the complete corrected Frame.tsx.`}],first.session);note(again);repaired=true;await writeFile(join(out,'chat-answer-2.txt'),again.text);
    answer=readChatAnswer(again.text);if(answer.frame){await tools.write('Frame.tsx',answer.frame);build=await tools.build();}
   }
   built=build.ok;if(!build.ok)stopped=`The file does not build: ${build.issue.slice(0,400)}`;
   if(built){const views=designerViews(input,heroScene(input),[input.variants[0]?.format??input.formats[0]?.id??'']).filter(v=>v.shot),render=await tools.render(views);
    const shot=render.shots[0]?.file;if(shot)await copyFile(shot,join(out,'chat.png'));else stopped='The frame did not render.';
    await writeFile(join(out,'chat-findings.json'),JSON.stringify(render.summary.reports.flatMap(r=>r.findings),null,1));}
  }
 }catch(error){stopped=error instanceof Error?error.message:String(error);}
 const usd=turns.length?Math.max(...turns.map(t=>t.usd??0)):0;
 const summary={mode:'chat-baseline',model,effort,system:CHAT_BASELINE_SYSTEM,messageCharacters:message.length,attachments:(parts.length-1)/2,turns:turns.length,repaired,pictures,built,...(stopped?{stopped}:{}),seconds:turns.reduce((n,t)=>n+t.seconds,0),input:turns.reduce((n,t)=>n+t.input,0),cached:turns.reduce((n,t)=>n+t.cached,0),output:turns.reduce((n,t)=>n+t.output,0),apiEquivalentUsd:Math.round(usd*100)/100,perTurn:turns};
 await writeFile(join(out,'chat.json'),JSON.stringify(summary,null,1));await rm(dir,{recursive:true,force:true});
 return summary;
}
