// Chat-shaped plan C5 (designerVersion 4, stage H): the hero frame as a chat. One conversation per direction: the
// designer answers in prose with whole files and an optional actions block; the app writes and builds the files, renders
// the hero after every change, buys pictures inside the approved count, fetches materials by name, and answers with the
// render and a short plain note. The hero review is a separate request; its notes come back as the next message. When
// the hero is accepted, the extension (stage E) continues in the same conversation (runDesigner). Tools are injected,
// so the loop is tested without paid calls.
import {heroScene} from '../../../packages/director/designer';
import {actionsCorrection,heroTask,parseHeroAnswer,renderNote,stageHFindings,type HeroAnswer} from '../../../packages/director/hero-chat';
import {resolveAssetReferences} from '../../../packages/director/asset-names';
import {propagateExecutionFailure} from '../../../packages/director/execution-failures';
import {MODELS_NOT_SET_UP} from '../../../packages/director/tripo';
import type {DirectionInput} from '../../../packages/director/types';
import {designerViews,renderKey,screenshotForDesigner,RENDER_LONG_SIDE,shortIssue,type DesignerLoopState,type DesignerTools,type PictureResult} from './designer-loop';

export type HeroCall=(message:string,images:{url:string;label:string}[])=>Promise<string>;
export type HeroTurnEvent={turn:number;idea:string;prose:string;files:string[];actions?:string;results:string[];looked?:string};
/** How many turns stage H may use at most: the rest of the allowance is for the other scenes and formats. */
export const HERO_TURN_SHARE=0.5;

export async function runHeroChat(args:{input:DirectionInput;state:DesignerLoopState;maxTurns:number;maxPictures:number;timeMs:number;tools:DesignerTools;call:HeroCall;save:(s:DesignerLoopState)=>Promise<void>;heroReviews?:number;
 conversation?:{decide:()=>Promise<boolean>;accept:()=>Promise<void>;lost?:()=>void};onTurn?:(e:HeroTurnEvent)=>Promise<void>;onHero?:(e:{kind:'started'|'reviewed'|'accepted';sceneId:string;format:string;notes?:number;by?:'critic'|'reviews-used'|'turns-used'|'no-critic'|'review-failed';looked?:string})=>Promise<void>;now?:()=>number}):Promise<DesignerLoopState>{
 const {input,state,tools}=args,now=args.now??Date.now,referenceFormat=input.variants[0]?.format??input.formats[0]?.id??'';
 if(!state.hero){state.hero={sceneId:heroScene(input),format:referenceFormat,state:'designing',reviews:0};await args.save(state);await args.onHero?.({kind:'started',sceneId:state.hero.sceneId,format:state.hero.format});}
 const hero=state.hero,pending=new Map<string,Promise<PictureResult>>(),arrived:PictureResult[]=[];
 const accept=async(by:'critic'|'reviews-used'|'turns-used'|'no-critic'|'review-failed')=>{hero.state='accepted';hero.acceptedBy=by;await args.save(state);await args.onHero?.({kind:'accepted',sceneId:hero.sceneId,format:hero.format,by});};
 let missingRetried=false;
 while(hero.state!=='accepted'&&state.turn<args.maxTurns&&now()-state.startedAt<args.timeMs){
  // What arrived since the last answer; a continued conversation holds everything earlier.
  const pictures=arrived.splice(0).map(p=>p.status==='ready'?`The picture ${p.id} has arrived: read resources['${p.id}'].`:`The picture ${p.id} could not be made${p.detail?` (${p.detail})`:''}.`);
  const short=args.conversation?await args.conversation.decide():state.turn>0;
  const due=tools.materials&&state.materialsDue?.length?await tools.materials.load(state.materialsDue):null;
  const last=state.lastRender,shots=last?await Promise.all(last.views.map(async v=>({url:await screenshotForDesigner(v.file,RENDER_LONG_SIDE),label:`${v.label} (rendered)`}))):[];
  // A new or restarted conversation gets the task again, with the files so far and the last note.
  const files=await tools.files(),opening=state.turn===0||!short;
  const message=[opening?heroTask(input):'',opening&&state.turn>0?`YOUR FILES SO FAR\n${files.map(f=>`\`\`\`tsx ${f.path}\n${f.source}\n\`\`\``).join('\n')}`:'',state.heroNote??'',...pictures,due?.text??''].filter(Boolean).join('\n\n');
  let text:string;
  try{text=await args.call(message,[...shots,...(due?.images??[])]);}
  catch(error){
   if(error instanceof Error&&error.message==='OUTPUT_TOKEN_LIMIT'){state.turn++;state.heroNote='Your answer was cut off. Answer shorter: the idea in a few sentences and only the files that change.';await args.save(state);continue;}
   if(error instanceof Error&&error.message==='CONVERSATION_MISSING'&&args.conversation?.lost&&!missingRetried){missingRetried=true;args.conversation.lost();continue;}
   throw error;}
  missingRetried=false;state.turn++;delete state.heroNote;delete state.lastRender;
  await args.conversation?.accept();
  if(due&&state.materialsDue?.length){state.materialsSeen=[...new Set([...(state.materialsSeen??[]),...state.materialsDue])];state.materialsDue=[];}
  state.transcript.push({from:'agent',text:text.slice(0,2000)});await args.save(state);
  const answer:HeroAnswer=parseHeroAnswer(text),results:string[]=[],notes:string[]=[];let looked:string|undefined;
  try{
   // 1. Files: written whole, then built. A building change is rendered: the app shows it, as in a chat.
   for(const f of answer.files){await tools.write(f.path,f.source);results.push(`Saved ${f.path}.`);}
   const built=await tools.build();
   if(!built.ok){results.push('The code does not build yet.');notes.push(`The code does not build:\n${shortIssue(built.issue)}`);}
   if(answer.actionsError){results.push('The actions block could not be read.');notes.push(actionsCorrection(answer.actionsError));}
   const actions=answer.actions??{};
   // 2. Materials and pictures, inside their budgets; pictures arrive in a later message.
   if(actions.materials?.length){if(!tools.materials)notes.push('Materials are not available in this draft.');else{const asked=await tools.materials.fetch(actions.materials,[...(state.materialsSeen??[]),...(state.materialsDue??[])]);state.materialsDue=[...new Set([...(state.materialsDue??[]),...asked.attached])];notes.push(asked.lines.join('\n'));results.push(...asked.lines);}}
   for(const p of actions.pictures??[]){
    if(state.pictures>=args.maxPictures){notes.push('The approved number of pictures is used: build the rest in code or with the pictures you have.');break;}
    state.pictures++;await args.save(state);const id=input.resourceIds[state.pictures-1],key=`${state.turn}:${state.pictures}`;
    const picture={purpose:p.purpose,scene:hero.sceneId,prompt:p.prompt,aspect:p.aspect,referenceAssetIds:resolveAssetReferences(p.references??[],input),mustNotContain:p.mustNotContain??[],...(p.cutout?{cutout:true}:{}),...(p.proxyFor?{proxyFor:p.proxyFor}:{}),...(p.becomes&&p.proxyFor?{becomes:p.becomes}:{})};
    pending.set(key,tools.requestImage(picture).then(r=>{arrived.push(r);pending.delete(key);return r;},error=>{if(propagateExecutionFailure(error))throw error;const r={id:id??'',status:'failed' as const,detail:(error instanceof Error?error.message:'').slice(0,200)};arrived.push(r);pending.delete(key);return r;}));
    notes.push(`Asked for a picture (${p.purpose.slice(0,80)}): it will be resources['${id}'] and arrives in a later message.`);results.push('Asked for a picture.');
   }
   // C8 follow-up: a 3D model of a picture it already has, when code cannot build that object; the picture stays the fallback.
   for(const m of actions.models??[]){
    if(!tools.requestModel){notes.push(`No 3D model for ${m.picture}: ${MODELS_NOT_SET_UP}`);results.push('No 3D model.');continue;}
    const made=await tools.requestModel(m);results.push(made.status==='model'?'Made a 3D model.':'No 3D model.');
    notes.push(made.status==='model'?`The 3D model of ${made.id} is ready: draw it with <Scene3D model={resources['${made.id}']} …/>; its picture stays the fallback.`:`No 3D model for ${made.id}: ${made.detail??'it could not be made'}. Keep the picture, or build the object in code.`);
   }
   // 3. The render: after every building change, or when asked.
   if(built.ok&&(answer.files.length||actions.render)){
    const views=designerViews(input,hero.sceneId,[hero.format]),out=await tools.render(views);state.renders[renderKey(hero.sceneId,hero.format)]=(state.renders[renderKey(hero.sceneId,hero.format)]??0)+1;
    const findings=stageHFindings(out.summary.reports.flatMap(r=>r.findings)).sort((a,b)=>Number(b.severity==='hard')-Number(a.severity==='hard'));
    state.lastRender={sceneId:hero.sceneId,findings,views:views.filter(v=>v.shot).flatMap(v=>{const s=out.shots.find(x=>x.key===v.key);return s?[{label:v.label,file:s.file,width:v.props.width,height:v.props.height}]:[];})};
    hero.shots=state.lastRender.views.map(v=>({label:v.label,file:v.file}));looked=hero.shots[0]?.file;
    notes.push(renderNote(findings,state.lastRender.views.length));results.push(`Rendered: ${findings.filter(f=>f.severity==='hard').length} to fix, ${findings.filter(f=>f.severity!=='hard').length} observations.`);
   }
   // 4. The review: idea and craft first, then what must be fixed. Its notes are the next message.
   if(actions.review){
    if(!hero.shots?.length)notes.push('Render the frame before asking for its review.');
    else if(pending.size){await Promise.all(pending.values());notes.push('The pictures you asked for have arrived (see below): use them, then ask for the review again.');}
    else if(hero.reviews>=(args.heroReviews??0)||!tools.reviewHero){await accept(tools.reviewHero&&(args.heroReviews??0)>0?'reviews-used':'no-critic');results.push('The hero frame is accepted.');}
    else{
     const findings=(state.lastRender?.findings??[]).map(f=>({view:f.view,severity:f.severity,detail:f.detail}));
     const review=await tools.reviewHero(hero.reviews+1,hero.shots,findings);hero.reviews++;await args.save(state);
     if(!review){await accept('review-failed');results.push('The review could not run; the hero frame is accepted.');}
     else{await args.onHero?.({kind:'reviewed',sceneId:hero.sceneId,format:hero.format,notes:review.notes.length,looked:hero.shots[0]?.file});
      if(review.accepted||!review.notes.length){await accept('critic');results.push('The review accepted the hero frame.');}
      else{notes.push(`The reviewer's notes on your hero frame:\n${review.notes.map(n=>`- [${n.priority}] ${n.view}: ${n.problem} Wanted: ${n.fix}`).join('\n')}\n${hero.reviews>=(args.heroReviews??0)?'Apply what you agree with; the next review request accepts the frame.':'Apply what you agree with, then ask for the review again.'}`);results.push(`Review: ${review.notes.length} note${review.notes.length===1?'':'s'}.`);}}
    }
   }
  }catch(error){if(propagateExecutionFailure(error))throw error;notes.push(`This step needs another attempt: ${(error instanceof Error?error.message:'').slice(0,300)}`);}
  if(!answer.files.length&&!answer.actions&&!answer.actionsError)notes.push('No files and no actions in your answer: write the complete files in fenced code blocks with their paths.');
  state.heroNote=notes.filter(Boolean).join('\n\n');state.transcript.push({from:'tool',text:state.heroNote.slice(0,2000)});await args.save(state);
  await args.onTurn?.({turn:state.turn,idea:answer.prose.split(/\n\s*\n/)[0]?.slice(0,600)??'',prose:answer.prose.slice(0,6000),files:answer.files.map(f=>f.path),...(answer.raw.actions?{actions:answer.raw.actions.slice(0,4000)}:{}),results,...(looked?{looked}:{})});
 }
 // Stage H's share of turns used without an accepted review: the frame as it stands leads the other scenes.
 if(hero.state!=='accepted'&&state.turn>=args.maxTurns&&hero.shots?.length)await accept(hero.reviews>0?'reviews-used':'turns-used');
 // Pictures still being made are reported to the extension stage by the usual restart path.
 await Promise.allSettled(pending.values());
 if(arrived.length)state.reported=[...(state.reported??[]),...arrived.map(a=>a.id).filter(Boolean)];
 return state;
}
