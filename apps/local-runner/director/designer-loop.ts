// The designer's working loop (designer pipeline plan, point 4b): one conversation per direction, scene by scene —
// write → render → look → revise. Every tool is injected, so the loop is tested without paid calls; the worker (4e)
// supplies the real ones (live build, browser inspection, priced pictures inside the approved count).
import {readFile} from 'node:fs/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {readDesignerTurn,heroFirst,heroScene,type DesignerPicture,type DesignerTurn} from '../../../packages/director/designer';
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
export async function screenshotForDesigner(file:string,maxSide=1080){
 const bytes=await readFile(file);let image;try{image=await loadImage(bytes);}catch{return `data:image/jpeg;base64,${bytes.toString('base64')}`;}
 const scale=Math.min(1,maxSide/Math.max(image.width,image.height));if(scale===1)return `data:image/jpeg;base64,${bytes.toString('base64')}`;
 const canvas=createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
 return `data:image/jpeg;base64,${canvas.toBuffer('image/jpeg',82).toString('base64')}`;
}
const jpeg=(file:string)=>screenshotForDesigner(file);
const short=(value:unknown,max=4096)=>JSON.stringify(value).slice(0,max);

export async function runDesigner(args:{input:DirectionInput;state:DesignerLoopState;maxTurns:number;maxPictures:number;timeMs:number;call:DesignerCall;tools:DesignerTools;save:(state:DesignerLoopState)=>Promise<void>;/** For the timeline: the turn, its results and the screenshot the designer looked at when it wrote the turn. *//** Point 3: at most this many critic reviews of the hero frame (from the quote). */heroReviews?:number;onHero?:(event:HeroEvent)=>Promise<void>;onTurn?:(turn:DesignerTurn,results:unknown[],looked?:string)=>Promise<void>;now?:()=>number}){
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
 while(!state.complete&&state.turn<args.maxTurns&&now()-state.startedAt<args.timeMs){
  await collect();stopIfFatal();
  const files=await tools.files(),last=state.lastRender;
  const images=last?await Promise.all(last.views.map(async v=>({url:await jpeg(v.file),label:`${v.label} (rendered, scene ${scenes.indexOf(last.sceneId)+1})`}))):[];
  let text:string;
  try{text=await args.call({...(heroOn?{notes:state.notes??'',...(last?{lookFirst:true}:{})}:{}),turn:state.turn,budget:{turnsLeft:args.maxTurns-state.turn,picturesLeft:Math.max(0,args.maxPictures-state.pictures)},
   scenes:scenes.map(sceneId=>({sceneId,formats:input.formats.map(f=>({format:f.id,renders:state.renders[renderKey(sceneId,f.id)]??0,revisionsLeft:Math.max(0,DESIGNER_REVISIONS_PER_SCENE+1-(state.renders[renderKey(sceneId,f.id)]??0))})).filter(f=>f.renders>0||f.format===referenceFormat)})),
   toolResults:state.transcript.slice(-12),currentFiles:files,
   ...(state.hero?{hero:{sceneId:state.hero.sceneId,format:state.hero.format,settled:state.hero.state==='accepted',reviewsLeft:Math.max(0,(args.heroReviews??0)-state.hero.reviews)}}:{}),
   ...(last?{lastRender:{sceneId:last.sceneId,views:last.views.map(v=>v.label),findings:last.findings.slice(0,30).map(f=>({view:f.view,severity:f.severity,detail:f.detail}))}}:{})},images);}
  catch(error){if(error instanceof Error&&error.message==='OUTPUT_TOKEN_LIMIT'){state.turn++;await log({error:'Your answer was cut off. Return a smaller turn: fewer files, exact edits.'});continue;}throw error;}
  const looked=last?.views[0]?.file;state.turn++;state.transcript.push({from:'agent',text:text.slice(0,2000)});delete state.lastRender;await args.save(state);
  let turn:DesignerTurn;
  try{turn=readDesignerTurn(JSON.parse(text),input);}catch(error){await log({error:(error instanceof Error?error.message:'Unreadable answer').slice(0,600)});continue;}
  // Point 4: notes are working memory; a turn after a render must first say what it saw (look, name, then fix).
  if(heroOn&&turn.notes){state.notes=turn.notes;await args.save(state);}
  // Refused once per render: a second turn without seen is applied, so a model that keeps omitting it cannot burn
  // the allowance on refusals.
  if(heroOn&&last&&!turn.seen&&!state.seenRefused){state.seenRefused=true;await log({error:'Look before you change: write seen (what a viewer reads first, second and third in the render, and its weakest points, the measured findings included). Nothing was applied.'});await args.onTurn?.(turn,[{refused:'seen'}],looked);
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
   const built=await tools.build();results.push(built.ok?{build:'passed'}:{build:'failed',issue:built.issue.slice(0,1600)});
   // 2. Pictures: recorded and bought in the background inside the approved count; they arrive on later turns.
   for(const picture of turn.pictures){
    if(state.pictures>=args.maxPictures){results.push({picture:'refused',detail:'The approved number of pictures is used. Build the rest in code or with the pictures you have.'});continue;}
    state.pictures++;await args.save(state);const key=`${state.turn}:${state.pictures}`;
    track(key,tools.requestImage(picture));
    results.push({picture:'requested',scene:picture.scene,purpose:picture.purpose.slice(0,120)});
   }
   // 3. Render: only a building source; the first render designs the scene, later ones are revisions.
   if(turn.render&&built.ok){
    // Revisions count per scene AND format (point 5): recomposing a new format is a first design, not a revision.
    const sceneId=turn.render.sceneId,formats=turn.render.formats.length?turn.render.formats:[referenceFormat],spent=formats.filter(f=>(state.renders[renderKey(sceneId,f)]??0)>DESIGNER_REVISIONS_PER_SCENE);
    if(heroOpen()&&(sceneId!==state.hero!.sceneId||formats.some(f=>f!==state.hero!.format)))results.push({render:'refused',detail:heroAsk()});
    else if(spent.length)results.push({render:'refused',detail:`Three revisions of this scene in ${spent.join(', ')} are used. Move on and say in the finish what remains.`});
    else{
     const views=designerViews(input,sceneId,formats),out=await tools.render(views);for(const f of formats)state.renders[renderKey(sceneId,f)]=(state.renders[renderKey(sceneId,f)]??0)+1;
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
