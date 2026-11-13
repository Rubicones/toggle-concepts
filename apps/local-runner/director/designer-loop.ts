// The designer's working loop (designer pipeline plan, point 4b): one conversation per direction, scene by scene —
// write → render → look → revise. Every tool is injected, so the loop is tested without paid calls; the worker (4e)
// supplies the real ones (live build, browser inspection, priced pictures inside the approved count).
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {usesEngineKit,readDesignerTurn,heroFirst,heroScene,type DesignerPicture,type DesignerTurn} from '../../../packages/director/designer';
import {applySourceEdits} from '../../../packages/director/source-edits';
import {liveFormat} from '../../../packages/director/live-preview';
import {propagateExecutionFailure} from '../../../packages/director/execution-failures';
import type {InspectionView,InspectionSummary} from '../../../packages/director/layout-inspection';
import type {DirectionInput,Variant} from '../../../packages/director/types';

/** Saved render counts are keyed by scene and format. */
export const renderKey=(sceneId:string,format:string)=>`${sceneId}@${format}`;
/** First render of a scene in a format plus at most three revisions. */
export const DESIGNER_REVISIONS_PER_SCENE=3;
export type {DesignerLoopState} from '../../../packages/director/designer';
import type {DesignerLoopState} from '../../../packages/director/designer';
export const newDesignerState=(now=Date.now()):DesignerLoopState=>({turn:0,startedAt:now,complete:false,pictures:0,transcript:[],renders:{}});
export type PictureResult={id:string;status:'ready'|'failed'|'refused';detail?:string;cutout?:boolean};
export type DesignerTools={
 /** Authored files only (no generated modules). */
 files:()=>Promise<{path:string;source:string}[]>;
 write:(path:string,source:string)=>Promise<unknown>;
 /** Typecheck and live build of the current source. */
 build:()=>Promise<{ok:true}|{ok:false;issue:string}>;
 /** Measures the views in the browser; shots are JPEG files. */
 render:(views:InspectionView[])=>Promise<{summary:InspectionSummary;shots:{key:string;file:string}[]}>;
 /** Records the picture in the work state, then buys it inside the approved count (admission decides). */
 requestImage:(picture:DesignerPicture)=>Promise<PictureResult>;
 /** After a restart: recorded pictures whose result never reached the designer. `settle` returns the saved entry or
  * finishes the purchase under the same identity, so a paid picture is reused, never bought twice. */
 resumePictures?:(reported:string[])=>Promise<{id:string;settle:()=>Promise<PictureResult>}[]>;
 /** The live tools' finish: every ordered option implemented, typechecked and built. */
 finish:()=>Promise<{complete:true}|{complete:false;issue:string}>;
 /** Point 3 (designerVersion 2): one critic request on the hero frame's render; undefined when the quote has no critic. */
 reviewHero?:(round:number,shots:{label:string;file:string}[],findings:{view:string;severity:string;detail:string}[])=>Promise<{accepted:boolean;notes:{recipient:string;priority:string;view:string;problem:string;fix:string}[]}|undefined>;
};
/** Point 3d: hero frame milestones for the timeline. */
export type HeroEvent={kind:'started'|'reviewed'|'accepted';sceneId:string;format:string;notes?:number;by?:'critic'|'reviews-used'|'no-critic'|'review-failed';looked?:string};
export type DesignerCall=(request:{turn:number;budget:{turnsLeft:number;picturesLeft:number};scenes:{sceneId:string;formats:{format:string;renders:number;revisionsLeft:number}[]}[];toolResults:{from:'agent'|'tool';text:string}[];currentFiles:{path:string;source:string}[];/** Point 4a: the designer's own notes, always sent. */notes?:string;/** Point 4b: set when the attached images are a render the designer must look at first. */lookFirst?:boolean;/** Point 3: the hero frame to settle first (designerVersion 2). */hero?:{sceneId:string;format:string;settled:boolean;reviewsLeft:number};lastRender?:{sceneId:string;views:string[];findings:{view:string;severity:string;detail:string}[]}},images:{url:string;label:string}[])=>Promise<string>;

/** The views the designer asked for: the reference copy in each requested format (default: the reference format),
 * plus the longest copy in the same formats so overflow shows up while the scene is designed. Screenshots only for
 * the reference copy. */
export function designerViews(input:Pick<DirectionInput,'variants'|'formats'|'variantFacts'>,sceneId:string,formats:string[]):InspectionView[]{
 const reference=input.variants[0];if(!reference)return [];
 const wanted=(formats.length?formats:[reference.format]).map(id=>input.formats.find(f=>f.id===id)).filter((f):f is DirectionInput['formats'][number]=>!!f);
 const length=(v:Variant)=>Object.values(input.variantFacts?.[v.id]?.sceneCopy??{}).flat().join(' ').length;
 const longest=[...input.variants].sort((a,b)=>length(b)-length(a))[0];
 const view=(v:Variant,f:DirectionInput['formats'][number],shot:boolean):InspectionView=>({key:`${v.id}|${f.id}|${sceneId}`,label:`${f.id} ${f.width}×${f.height} · ${v.locale}/${v.hook}/${v.cta}/${v.length}s`,variantId:v.id,ordered:true,shot,group:shot?'reference':'longest',
  props:{format:liveFormat(f.width,f.height),locale:v.locale,hook:v.hook,cta:v.cta,length:v.length,width:f.width,height:f.height,sceneId,moment:'key-frame'}});
 return [...wanted.map(f=>view(reference,f,true)),...(longest&&longest.id!==reference.id?wanted.map(f=>view(longest,f,false)):[])];
}

/** Screenshots go to the designer as JPEG at about 1080 px on the long side (point 6b): enough to judge, cheap to send. */
/** LC4 (shared Local runs): renders reach the designer at a fixed size that is enough to judge (long side 1024 px, JPEG). */
export const RENDER_LONG_SIDE=1024;
export async function screenshotForDesigner(file:string,maxSide=1080){
 const bytes=await readFile(file);let image;try{image=await loadImage(bytes);}catch{return `data:image/jpeg;base64,${bytes.toString('base64')}`;}
 const scale=Math.min(1,maxSide/Math.max(image.width,image.height));if(scale===1)return `data:image/jpeg;base64,${bytes.toString('base64')}`;
 const canvas=createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
 return `data:image/jpeg;base64,${canvas.toBuffer('image/jpeg',82).toString('base64')}`;
}
/** LC4: build errors as their first lines, never a file dump. */
export const shortIssue=(issue:string)=>issue.split('\n').filter(l=>l.trim()).slice(0,12).join('\n').slice(0,1200);
/** Tool results since the designer's last answer: what a continued conversation does not hold yet. */
export function sinceLastTurn(transcript:{from:'agent'|'tool';text:string}[]){let i=transcript.length;while(i>0&&transcript[i-1].from!=='agent')i--;return transcript.slice(i);}
const hash=(text:string)=>createHash('sha256').update(text).digest('hex').slice(0,16);
export const fileHashes=(files:{path:string;source:string}[])=>Object.fromEntries(files.map(f=>[f.path,hash(f.source)]));
/** Files the conversation has not seen in their current form (changed by the app or new). */
export function changedFiles(files:{path:string;source:string}[],seen?:Record<string,string>){return seen?files.filter(f=>seen[f.path]!==hash(f.source)):files;}
const short=(value:unknown,max=4096)=>JSON.stringify(value).slice(0,max);

export async function runDesigner(args:{input:DirectionInput;state:DesignerLoopState;maxTurns:number;maxPictures:number;timeMs:number;call:DesignerCall;tools:DesignerTools;/** LC4: a continued conversation (shared Local runs): send only what it does not hold, and accept readable turns into it. */conversation?:{continuing:()=>boolean;accept:()=>Promise<void>;/** C1: decides this turn's conversation before the request is built; true only on a real continuation of the designer's own conversation. */decide?:()=>Promise<boolean>;/** C1: the stored conversation is missing on this computer. */lost?:()=>void};save:(state:DesignerLoopState)=>Promise<void>;/** For the timeline: the turn, its results and the screenshot the designer looked at when it wrote the turn. *//** Point 3: at most this many critic reviews of the hero frame (from the quote). */heroReviews?:number;onHero?:(event:HeroEvent)=>Promise<void>;onTurn?:(turn:DesignerTurn,results:unknown[],looked?:string)=>Promise<void>;now?:()=>number}){
 const {input,state,tools}=args,now=args.now??Date.now,scenes=input.storyboard.map(s=>s.id),referenceFormat=input.variants[0]?.format??input.formats[0]?.id??'';
 const pending=new Map<string,Promise<PictureResult>>(),arrived=new Map<string,PictureResult>();
 // A control or lease failure inside a background purchase stops the loop at the next step instead of escaping unseen.
 let fatal:unknown;const stopIfFatal=()=>{if(fatal)throw fatal;};
 const log=async(entry:unknown)=>{state.transcript.push({from:'tool',text:short(entry)});await args.save(state);};
 // Pictures that arrived since the last turn are reported to the designer; `all` waits for the rest (before finishing).
 const collect=async(all=false)=>{if(all)await Promise.all(pending.values());for(const [key,result] of [...arrived]){arrived.delete(key);pending.delete(key);if(result.id)(state.reported??=[]).push(result.id);await log({picture:result});}};
 const track=(key:string,purchase:Promise<PictureResult>)=>{pending.set(key,purchase.then(result=>{arrived.set(key,result);return result;},error=>{
  // A control or lease failure is not the picture's result: it stays unreported, so the next start settles it again.
  if(propagateExecutionFailure(error)){fatal??=error;return {id:'',status:'failed' as const};}
  const id=(error as {resourceId?:unknown})?.resourceId,result={id:typeof id==='string'?id:'',status:'failed' as const,detail:(error instanceof Error?error.message:'The picture could not be made.').slice(0,300)};
  arrived.set(key,result);return result;}));};
 // A restart loses the background purchases in memory; recorded pictures are settled again and reported as usual.
 if(tools.resumePictures)for(const p of await tools.resumePictures(state.reported??[]))track(`resume:${p.id}`,p.settle());
 // Point 3a: the hero frame (the scene that proves the promise, in the reference format) comes first.
 const heroOn=heroFirst(input),ratio=(id:string)=>{const f=input.formats.find(x=>x.id===id);if(!f)return id;const g=(a:number,b:number):number=>b?g(b,a%b):a,d=g(f.width,f.height);return `${f.width/d}:${f.height/d}`;};
 if(heroOn&&!state.hero){state.hero={sceneId:heroScene(input),format:referenceFormat,state:'designing',reviews:0};await args.save(state);await args.onHero?.({kind:'started',sceneId:state.hero.sceneId,format:state.hero.format});}
 const heroOpen=()=>heroOn&&state.hero?.state!=='accepted';
 const heroAsk=()=>`Finish the hero frame first: scene ${scenes.indexOf(state.hero!.sceneId)+1} in ${ratio(state.hero!.format)}. Render it, then set settleHero for its review.`;
 const accept=async(by:'critic'|'reviews-used'|'no-critic'|'review-failed')=>{state.hero!.state='accepted';state.hero!.acceptedBy=by;await args.save(state);await args.onHero?.({kind:'accepted',sceneId:state.hero!.sceneId,format:state.hero!.format,by});};
 let missingRetried=false;
 while(!state.complete&&state.turn<args.maxTurns&&now()-state.startedAt<args.timeMs){
  await collect();stopIfFatal();
  const files=await tools.files(),last=state.lastRender;
  const images=last?await Promise.all(last.views.map(async v=>({url:await screenshotForDesigner(v.file,args.conversation?RENDER_LONG_SIDE:1080),label:`${v.label} (rendered, scene ${scenes.indexOf(last.sceneId)+1})`}))):[];
  let text:string;
  // C1: the short payload only when this turn really continues the designer's own conversation; a condensed, new or
  // restarted turn gets the full payload (every file, recent results, notes and the latest render).
  const short=args.conversation?(args.conversation.decide?await args.conversation.decide():args.conversation.continuing()):false;
  try{text=await args.call({...(heroOn?{notes:state.notes??'',...(last?{lookFirst:true}:{})}:{}),turn:state.turn,budget:{turnsLeft:args.maxTurns-state.turn,picturesLeft:Math.max(0,args.maxPictures-state.pictures)},
   scenes:scenes.map(sceneId=>({sceneId,formats:input.formats.map(f=>({format:f.id,renders:state.renders[renderKey(sceneId,f.id)]??0,revisionsLeft:Math.max(0,DESIGNER_REVISIONS_PER_SCENE+1-(state.renders[renderKey(sceneId,f.id)]??0))})).filter(f=>f.renders>0||f.format===referenceFormat)})),
   // LC4: in a continued conversation the history holds everything earlier: only new results and changed files go.
   ...(short?{toolResults:sinceLastTurn(state.transcript),currentFiles:changedFiles(files,state.filesSeen)}:{toolResults:state.transcript.slice(-12),currentFiles:files}),
   ...(state.hero?{hero:{sceneId:state.hero.sceneId,format:state.hero.format,settled:state.hero.state==='accepted',reviewsLeft:Math.max(0,(args.heroReviews??0)-state.hero.reviews)}}:{}),
   ...(last?{lastRender:{sceneId:last.sceneId,views:last.views.map(v=>v.label),findings:last.findings.slice(0,30).map(f=>({view:f.view,severity:f.severity,detail:f.detail}))}}:{})},images);}
  catch(error){if(error instanceof Error&&error.message==='OUTPUT_TOKEN_LIMIT'){state.turn++;await log({error:'Your answer was cut off. Return a smaller turn: fewer files, exact edits.'});continue;}
   // C1: the stored conversation is not on this computer: start over once with the full payload (same turn).
   if(error instanceof Error&&error.message==='CONVERSATION_MISSING'&&args.conversation?.lost&&!missingRetried){missingRetried=true;args.conversation.lost();continue;}
   throw error;}
  missingRetried=false;
  const looked=last?.views[0]?.file;state.turn++;state.transcript.push({from:'agent',text:text.slice(0,2000)});delete state.lastRender;await args.save(state);
  let turn:DesignerTurn;
  try{turn=readDesignerTurn(JSON.parse(text),input);}catch(error){
   // C1: an unreadable answer is not accepted into the conversation: it is not the last agent turn there, so the results
   // it was answering stay due for the next short payload, and its files are not marked as seen.
   if(args.conversation)state.transcript.pop();
   await log({error:(error instanceof Error?error.message:'Unreadable answer').slice(0,600)});continue;}
  // LC4: a readable turn becomes part of the direction's conversation; an unreadable one is left out of it.
  await args.conversation?.accept();
  if(args.conversation)state.filesSeen=fileHashes(files);
  // Point 4: notes are working memory; a turn after a render must first say what it saw (look, name, then fix).
  if(heroOn&&turn.notes){state.notes=turn.notes;await args.save(state);}
  // Refused once per render: a second turn without seen is applied, so a model that keeps omitting it cannot burn
  // the allowance on refusals.
  // Version 3: a turn that changes no code (it only renders, settles or finishes) is not refused for a missing seen.
  if(heroOn&&last&&!turn.seen&&!state.seenRefused&&!(usesEngineKit(input)&&!turn.files.length&&!turn.edits.length)){state.seenRefused=true;await log({error:'Look before you change: write seen (what a viewer reads first, second and third in the render, and its weakest points, the measured findings included). Nothing was applied.'});await args.onTurn?.(turn,[{refused:'seen'}],looked);
   // The render stays attached for the retry.
   state.lastRender=last;await args.save(state);continue;}
  if(state.seenRefused){delete state.seenRefused;await args.save(state);}
  const results:unknown[]=[];
  try{
   // 1. Code: exact edits against the files this turn saw, then whole files.
   if(turn.edits.length||turn.files.length){
    const latest=await tools.files();if(turn.edits.some(e=>latest.find(f=>f.path===e.path)?.source!==files.find(f=>f.path===e.path)?.source))throw new Error('EDIT_SOURCE_CHANGED: the source changed while this turn was written; use the refreshed currentFiles.');
    for(const file of [...turn.files,...applySourceEdits(latest,turn.edits)]){await tools.write(file.path,file.source);results.push({written:file.path});}
   }
   const built=await tools.build();results.push(built.ok?{build:'passed'}:{build:'failed',issue:args.conversation?shortIssue(built.issue):built.issue.slice(0,1600)});
   if(args.conversation)state.filesSeen=fileHashes(await tools.files());
   // 2. Pictures: recorded and bought in the background inside the approved count; they arrive on later turns.
   for(const picture of turn.pictures){
    if(state.pictures>=args.maxPictures){results.push({picture:'refused',detail:'The approved number of pictures is used. Build the rest in code or with the pictures you have.'});continue;}
    state.pictures++;await args.save(state);const key=`${state.turn}:${state.pictures}`;
    track(key,tools.requestImage(picture));
    // Version 3: the result names the resource id the picture will have, so the frame binds it without guessing.
    const issued=usesEngineKit(input)?input.resourceIds[state.pictures-1]:undefined;
    results.push({picture:'requested',...(issued?{id:issued,read:`resources['${issued}']`}:{}),scene:picture.scene,purpose:picture.purpose.slice(0,120)});
   }
   // 3. Render: only a building source; the first render designs the scene, later ones are revisions.
   if(turn.render&&built.ok){
    // Revisions count per scene AND format (point 5): recomposing a new format is a first design, not a revision.
    const sceneId=turn.render.sceneId,formats=turn.render.formats.length?[...turn.render.formats]:[referenceFormat],limit=usesEngineKit(input)&&heroOpen()&&sceneId===state.hero!.sceneId?DESIGNER_REVISIONS_PER_SCENE*2:DESIGNER_REVISIONS_PER_SCENE,spent=formats.filter(f=>(state.renders[renderKey(sceneId,f)]??0)>limit);
    if(heroOpen()&&(sceneId!==state.hero!.sceneId||formats.some(f=>f!==state.hero!.format)))results.push({render:'refused',detail:heroAsk()});
    // Version 3: formats whose revisions are used are left out; the others still render (a scene revised in the
    // reference format can still be recomposed in the rest).
    else if(spent.length&&(!usesEngineKit(input)||spent.length===formats.length))results.push({render:'refused',detail:`Three revisions of this scene in ${spent.join(', ')} are used. Move on and say in the finish what remains.`});
    else{
     if(spent.length){formats.splice(0,formats.length,...formats.filter(f=>!spent.includes(f)));results.push({render:'partly refused',detail:`Three revisions in ${spent.join(', ')} are used; the other formats were rendered.`});}
     // Version 3: up to three more scenes in the same formats, so several scenes are judged in one turn. While the hero is
     // open only the hero is rendered.
     const more=heroOpen()?[]:[...new Set(turn.render.more??[])].filter(id=>id!==sceneId&&formats.every(f=>(state.renders[renderKey(id,f)]??0)<=DESIGNER_REVISIONS_PER_SCENE));
     const label=(id:string,text:string)=>more.length?`scene ${scenes.indexOf(id)+1} · ${text}`:text;
     const views=[sceneId,...more].flatMap(id=>designerViews(input,id,formats).map(v=>({...v,label:label(id,v.label)}))),out=await tools.render(views);for(const id of [sceneId,...more])for(const f of formats)state.renders[renderKey(id,f)]=(state.renders[renderKey(id,f)]??0)+1;
     const findings=out.summary.reports.flatMap(r=>r.findings).sort((a,b)=>Number(b.severity==='hard')-Number(a.severity==='hard'));
     state.lastRender={sceneId,findings,views:views.filter(v=>v.shot).flatMap(v=>{const shot=out.shots.find(s=>s.key===v.key);return shot?[{label:v.label,file:shot.file,width:v.props.width,height:v.props.height}]:[];})};
     results.push({render:sceneId,views:views.length,hard:out.summary.hard,soft:out.summary.soft});
     if(heroOpen()&&sceneId===state.hero!.sceneId){state.hero!.shots=state.lastRender.views.map(v=>({label:v.label,file:v.file}));await args.save(state);}
    }
   }
   // Point 3b: settling the hero runs one critic review of its render; its notes come back as the next turn's input.
   if(turn.settleHero&&heroOpen()){
    const hero=state.hero!;
    if(!hero.shots?.length)results.push({hero:'refused',detail:'Render the hero frame before asking for its review.'});
    // Version 3: a hero frame is not judged while a picture it asked for is still being made (the reviewer would see
    // an empty place). The loop waits for the pictures here, so no turn is spent on waiting.
    else if(usesEngineKit(input)&&pending.size>arrived.size){await Promise.all(pending.values());stopIfFatal();results.push({hero:'refused',detail:'The pictures you requested have arrived now. Render the hero frame with them, look, then set settleHero.'});}
    else if(hero.reviews>=(args.heroReviews??0)||!tools.reviewHero){await accept(tools.reviewHero&&(args.heroReviews??0)>0?'reviews-used':'no-critic');results.push({hero:'accepted',detail:'Design the other scenes and formats now.'});}
    else{
     const review=await tools.reviewHero(hero.reviews+1,hero.shots,(state.lastRender?.findings??[]).map(f=>({view:f.view,severity:f.severity,detail:f.detail})));hero.reviews++;await args.save(state);
     if(!review){await accept('review-failed');results.push({hero:'accepted',detail:'The review could not run. Design the other scenes and formats now; the end review still runs.'});}
     else{
      await args.onHero?.({kind:'reviewed',sceneId:hero.sceneId,format:hero.format,notes:review.notes.length,looked:hero.shots[0]?.file});
      if(review.accepted||!review.notes.length){await accept('critic');results.push({hero:'accepted',detail:'The review accepted the hero frame. Design the other scenes and formats now.'});}
      else results.push({heroReview:{round:hero.reviews,notes:review.notes.map(n=>`[${n.priority}] ${n.view}: ${n.problem} Wanted: ${n.fix}`)},ask:hero.reviews>=(args.heroReviews??0)?'Apply these notes; the next settleHero accepts the hero frame.':'Apply these notes, render the hero again, then set settleHero.'});
     }
    }
   }
   // 4. Finish: every picture settled, every option implemented, typechecked and built.
   if(turn.finish&&heroOpen())results.push({finish:'refused',issue:heroAsk()});
   else if(turn.finish){
    await collect(true);stopIfFatal();const done=built.ok?await tools.finish():{complete:false as const,issue:'The source does not build yet.'};
    if(done.complete){state.finish=turn.finish;state.complete=true;results.push({finish:'complete'});}else results.push({finish:'refused',issue:done.issue.slice(0,1200)});
   }
  }catch(error){if(propagateExecutionFailure(error))throw error;results.push({error:(error instanceof Error?error.message:'This step needs repair').slice(0,1200)});}
  await log({results});await args.onTurn?.(turn,results,looked);
 }
 await collect(true);stopIfFatal();
 return state;
}
