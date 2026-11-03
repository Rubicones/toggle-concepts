// The designer's working loop (designer pipeline plan, point 4b): one conversation per direction, scene by scene —
// write → render → look → revise. Every tool is injected, so the loop is tested without paid calls; the worker (4e)
// supplies the real ones (live build, browser inspection, priced pictures inside the approved count).
import {readFile} from 'node:fs/promises';
import {readDesignerTurn,type DesignerPicture,type DesignerTurn} from '../../../packages/director/designer';
import {applySourceEdits} from '../../../packages/director/source-edits';
import {liveFormat} from '../../../packages/director/live-preview';
import {propagateExecutionFailure} from '../../../packages/director/execution-failures';
import type {InspectionView,InspectionSummary,Finding} from '../../../packages/director/layout-inspection';
import type {DirectionInput,Variant} from '../../../packages/director/types';

/** First render of a scene plus at most three revisions. */
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
 /** The live tools' finish: every ordered option implemented, typechecked and built. */
 finish:()=>Promise<{complete:true}|{complete:false;issue:string}>;
};
export type DesignerCall=(request:{turn:number;budget:{turnsLeft:number;picturesLeft:number};scenes:{sceneId:string;renders:number;revisionsLeft:number}[];toolResults:{from:'agent'|'tool';text:string}[];currentFiles:{path:string;source:string}[];lastRender?:{sceneId:string;views:string[];findings:{view:string;severity:string;detail:string}[]}},images:{url:string;label:string}[])=>Promise<string>;

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

const jpeg=async(file:string)=>`data:image/jpeg;base64,${(await readFile(file)).toString('base64')}`;
const short=(value:unknown,max=4096)=>JSON.stringify(value).slice(0,max);

export async function runDesigner(args:{input:DirectionInput;state:DesignerLoopState;maxTurns:number;maxPictures:number;timeMs:number;call:DesignerCall;tools:DesignerTools;save:(state:DesignerLoopState)=>Promise<void>;/** For the timeline: the turn, its results and the screenshot the designer looked at when it wrote the turn. */onTurn?:(turn:DesignerTurn,results:unknown[],looked?:string)=>Promise<void>;now?:()=>number}){
 const {input,state,tools}=args,now=args.now??Date.now,scenes=input.storyboard.map(s=>s.id);
 const pending=new Map<string,Promise<PictureResult>>(),arrived=new Map<string,PictureResult>();
 // A control or lease failure inside a background purchase stops the loop at the next step instead of escaping unseen.
 let fatal:unknown;const stopIfFatal=()=>{if(fatal)throw fatal;};
 const log=async(entry:unknown)=>{state.transcript.push({from:'tool',text:short(entry)});await args.save(state);};
 // Pictures that arrived since the last turn are reported to the designer; `all` waits for the rest (before finishing).
 const collect=async(all=false)=>{if(all)await Promise.all(pending.values());for(const [key,result] of [...arrived]){arrived.delete(key);pending.delete(key);await log({picture:result});}};
 while(!state.complete&&state.turn<args.maxTurns&&now()-state.startedAt<args.timeMs){
  await collect();stopIfFatal();
  const files=await tools.files(),last=state.lastRender;
  const images=last?await Promise.all(last.views.map(async v=>({url:await jpeg(v.file),label:`${v.label} (rendered, scene ${scenes.indexOf(last.sceneId)+1})`}))):[];
  let text:string;
  try{text=await args.call({turn:state.turn,budget:{turnsLeft:args.maxTurns-state.turn,picturesLeft:Math.max(0,args.maxPictures-state.pictures)},
   scenes:scenes.map(sceneId=>({sceneId,renders:state.renders[sceneId]??0,revisionsLeft:Math.max(0,DESIGNER_REVISIONS_PER_SCENE+1-(state.renders[sceneId]??0))})),
   toolResults:state.transcript.slice(-12),currentFiles:files,
   ...(last?{lastRender:{sceneId:last.sceneId,views:last.views.map(v=>v.label),findings:last.findings.slice(0,30).map(f=>({view:f.view,severity:f.severity,detail:f.detail}))}}:{})},images);}
  catch(error){if(error instanceof Error&&error.message==='OUTPUT_TOKEN_LIMIT'){state.turn++;await log({error:'Your answer was cut off. Return a smaller turn: fewer files, exact edits.'});continue;}throw error;}
  const looked=last?.views[0]?.file;state.turn++;state.transcript.push({from:'agent',text:text.slice(0,2000)});delete state.lastRender;await args.save(state);
  let turn:DesignerTurn;
  try{turn=readDesignerTurn(JSON.parse(text),input);}catch(error){await log({error:(error instanceof Error?error.message:'Unreadable answer').slice(0,600)});continue;}
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
    pending.set(key,tools.requestImage(picture).catch(error=>{if(propagateExecutionFailure(error)){fatal??=error;}return {id:'',status:'failed' as const,detail:(error instanceof Error?error.message:'The picture could not be made.').slice(0,300)};}).then(result=>{arrived.set(key,result);return result;}));
    results.push({picture:'requested',scene:picture.scene,purpose:picture.purpose.slice(0,120)});
   }
   // 3. Render: only a building source; the first render designs the scene, later ones are revisions.
   if(turn.render&&built.ok){
    const sceneId=turn.render.sceneId,count=state.renders[sceneId]??0;
    if(count>DESIGNER_REVISIONS_PER_SCENE)results.push({render:'refused',detail:'Three revisions of this scene are used. Move on and say in the finish what remains.'});
    else{
     const views=designerViews(input,sceneId,turn.render.formats),out=await tools.render(views);state.renders[sceneId]=count+1;
     const findings=out.summary.reports.flatMap(r=>r.findings).sort((a,b)=>Number(b.severity==='hard')-Number(a.severity==='hard'));
     state.lastRender={sceneId,findings,views:views.filter(v=>v.shot).flatMap(v=>{const shot=out.shots.find(s=>s.key===v.key);return shot?[{label:v.label,file:shot.file,width:v.props.width,height:v.props.height}]:[];})};
     results.push({render:sceneId,views:views.length,hard:out.summary.hard,soft:out.summary.soft});
    }
   }
   // 4. Finish: every picture settled, every option implemented, typechecked and built.
   if(turn.finish){
    await collect(true);stopIfFatal();const done=built.ok?await tools.finish():{complete:false as const,issue:'The source does not build yet.'};
    if(done.complete){state.finish=turn.finish;state.complete=true;results.push({finish:'complete'});}else results.push({finish:'refused',issue:done.issue.slice(0,1200)});
   }
  }catch(error){if(propagateExecutionFailure(error))throw error;results.push({error:(error instanceof Error?error.message:'This step needs repair').slice(0,1200)});}
  await log({results});await args.onTurn?.(turn,results,looked);
 }
 await collect(true);stopIfFatal();
 return state;
}
