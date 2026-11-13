// Chat-shaped plan C6 (designerVersion 4, stage E): the extension continues the hero's conversation. The designer
// keeps answering in prose with whole files and an actions block; the app opens stage E once with the mechanics,
// renders what it asks for (up to four scenes, in the formats and languages it names), and answers with the render
// and the full hard findings grouped by problem. When the conversation was condensed, the new one is seeded with the
// mechanics, the designer's notes, the current files, the accepted hero render and what is done, and then continues.
import {parseChatAnswer,actionsCorrection} from '../../../packages/director/hero-chat';
import {extensionActionsSchema,extensionNote,extensionPhase,nextRender,phaseLabels,sceneIdOf,sceneLabel,stageEMechanics,compactionSeed,variationVariants,type ExtensionPhase} from '../../../packages/director/extension-chat';
import {resolveAssetReferences} from '../../../packages/director/asset-names';
import {propagateExecutionFailure} from '../../../packages/director/execution-failures';
import type {DirectionInput} from '../../../packages/director/types';
import type {InspectionView} from '../../../packages/director/layout-inspection';
import {designerViews,renderKey,screenshotForDesigner,RENDER_LONG_SIDE,shortIssue,DESIGNER_REVISIONS_PER_SCENE,type DesignerLoopState,type DesignerTools,type PictureResult} from './designer-loop';
import type {HeroCall,HeroTurnEvent} from './hero-chat-loop';
import {liveFormat} from '../../../packages/director/live-preview';

/** Views for a render: the reference copy and the longest copy per scene and format; in the variations phase one per
 * language and hook as well. Screenshots for the reference copy only, at most six. */
export function extensionViews(input:DirectionInput,sceneIds:string[],formats:string[],phase:ExtensionPhase,languages?:string[]):InspectionView[]{
 const views=sceneIds.flatMap(id=>designerViews(input,id,formats).map(v=>({...v,label:`${sceneLabel(id,input)} · ${v.label}`})));
 if(phase!=='variations')return views;
 const extra=variationVariants(input,languages).slice(1).flatMap(v=>sceneIds.flatMap(id=>formats.map(fid=>{const f=input.formats.find(x=>x.id===fid);if(!f)return null;
  return {key:`${v.id}|${f.id}|${id}`,label:`${sceneLabel(id,input)} · ${f.id} · ${v.locale}/${v.hook}/${v.cta}/${v.length}s`,variantId:v.id,ordered:true,shot:true,group:'reference' as const,props:{format:liveFormat(f.width,f.height),locale:v.locale,hook:v.hook,cta:v.cta,length:v.length,width:f.width,height:f.height,sceneId:id,moment:'key-frame'}} as InspectionView;}))).filter((v):v is InspectionView=>!!v);
 return [...views,...extra];
}

export async function runExtensionChat(args:{input:DirectionInput;state:DesignerLoopState;maxTurns:number;maxPictures:number;timeMs:number;tools:DesignerTools;call:HeroCall;save:(s:DesignerLoopState)=>Promise<void>;
 conversation?:{decide:()=>Promise<boolean>;accept:()=>Promise<void>;lost?:()=>void};onTurn?:(e:HeroTurnEvent)=>Promise<void>;onPhase?:(phase:ExtensionPhase,label:string)=>Promise<void>;now?:()=>number}):Promise<DesignerLoopState>{
 const {input,state,tools}=args,now=args.now??Date.now,mechanics=stageEMechanics(input);
 const pending=new Map<string,Promise<PictureResult>>(),arrived:PictureResult[]=[];let missingRetried=false;
 let phase=extensionPhase(input,state.renders);if(state.extensionPhase!==phase){state.extensionPhase=phase;await args.save(state);await args.onPhase?.(phase,phaseLabels[phase]);}
 while(!state.complete&&state.turn<args.maxTurns&&now()-state.startedAt<args.timeMs){
  const pictures=arrived.splice(0).map(p=>p.status==='ready'?`The picture ${p.id} has arrived: read resources['${p.id}'].`:`The picture ${p.id} could not be made${p.detail?` (${p.detail})`:''}.`);
  const continued=args.conversation?await args.conversation.decide():true;
  const due=tools.materials&&state.materialsDue?.length?await tools.materials.load(state.materialsDue):null;
  const files=await tools.files(),last=state.lastRender;
  const shots=last?await Promise.all(last.views.map(async v=>({url:await screenshotForDesigner(v.file,RENDER_LONG_SIDE),label:`${v.label} (rendered)`}))):[];
  // The mechanics arrive once, when stage E opens; a condensed or restarted conversation is seeded with everything.
  const done=Object.entries(state.renders).filter(([,n])=>n>0).map(([k,n])=>{const [id,f]=k.split('@');return `${sceneLabel(id,input)} in ${f}: rendered ${n} time${n===1?'':'s'}`;});
  const seed=!continued?compactionSeed({mechanics,notes:state.notes,files,done,lastNote:state.heroNote}):'';
  const opening=continued&&!state.stageEOpened?`THE HERO FRAME IS ACCEPTED. ${phaseLabels.scenes.toUpperCase()}.\n\n${mechanics}`:'';
  const heroShot=!continued&&state.hero?.shots?.[0]?[{url:await screenshotForDesigner(state.hero.shots[0].file,RENDER_LONG_SIDE),label:'The accepted hero frame'}]:[];
  const message=[seed||opening,!seed?state.heroNote??'':'',...pictures,due?.text??''].filter(Boolean).join('\n\n');
  let text:string;
  try{text=await args.call(message,[...heroShot,...shots,...(due?.images??[])]);}
  catch(error){
   if(error instanceof Error&&error.message==='OUTPUT_TOKEN_LIMIT'){state.turn++;state.heroNote='Your answer was cut off. Answer shorter: a few sentences and only the files that change.';await args.save(state);continue;}
   if(error instanceof Error&&error.message==='CONVERSATION_MISSING'&&args.conversation?.lost&&!missingRetried){missingRetried=true;args.conversation.lost();continue;}
   throw error;}
  missingRetried=false;state.turn++;state.stageEOpened=true;delete state.heroNote;delete state.lastRender;
  await args.conversation?.accept();
  if(due&&state.materialsDue?.length){state.materialsSeen=[...new Set([...(state.materialsSeen??[]),...state.materialsDue])];state.materialsDue=[];}
  state.transcript.push({from:'agent',text:text.slice(0,2000)});await args.save(state);
  const answer=parseChatAnswer(text,extensionActionsSchema),actions=answer.actions??{},results:string[]=[],notes:string[]=[];let looked:string|undefined;
  try{
   for(const f of answer.files){await tools.write(f.path,f.source);results.push(`Saved ${f.path}.`);}
   const built=await tools.build();if(!built.ok){results.push('The code does not build yet.');notes.push(`The code does not build:\n${shortIssue(built.issue)}`);}
   if(answer.actionsError){results.push('The actions block could not be read.');notes.push(actionsCorrection(answer.actionsError));}
   if(actions.notes){state.notes=actions.notes;}
   if(actions.materials?.length&&tools.materials){const asked=await tools.materials.fetch(actions.materials,[...(state.materialsSeen??[]),...(state.materialsDue??[])]);state.materialsDue=[...new Set([...(state.materialsDue??[]),...asked.attached])];notes.push(asked.lines.join('\n'));}
   for(const p of actions.pictures??[]){
    if(state.pictures>=args.maxPictures){notes.push('The approved number of pictures is used: build the rest in code or with the pictures you have.');break;}
    state.pictures++;await args.save(state);const id=input.resourceIds[state.pictures-1],key=`${state.turn}:${state.pictures}`;
    const picture={purpose:p.purpose,scene:input.storyboard[0].id,prompt:p.prompt,aspect:p.aspect,referenceAssetIds:resolveAssetReferences(p.references??[],input),mustNotContain:p.mustNotContain??[],...(p.cutout?{cutout:true}:{}),...(p.proxyFor?{proxyFor:p.proxyFor}:{}),...(p.becomes&&p.proxyFor?{becomes:p.becomes}:{})};
    pending.set(key,tools.requestImage(picture).then(r=>{arrived.push(r);pending.delete(key);return r;},error=>{if(propagateExecutionFailure(error))throw error;const r={id:id??'',status:'failed' as const};arrived.push(r);pending.delete(key);return r;}));
    notes.push(`Asked for a picture (${p.purpose.slice(0,80)}): it will be resources['${id}'] and arrives in a later message.`);
   }
   // The render: what the designer names, else what the phase needs next; never past the revisions of a scene and format.
   if(built.ok&&(actions.render||answer.files.length)){
    const asked=typeof actions.render==='object'?actions.render:{},next=nextRender(input,state.renders,phase);
    const named=(asked.scenes??[]).map(n=>sceneIdOf(n,input)),unknown=(asked.scenes??[]).filter((_,i)=>!named[i]);
    if(unknown.length)notes.push(`Not a scene: ${unknown.join(', ')}. Scenes are Scene 1 to Scene ${input.storyboard.length}.`);
    const scenes=[...new Set((named.filter(Boolean) as string[]).length?named.filter(Boolean) as string[]:next.scenes)].slice(0,4),formats=(asked.formats?.length?asked.formats.filter(f=>input.formats.some(x=>x.id===f)):next.formats);
    const open=scenes.filter(id=>formats.some(f=>(state.renders[renderKey(id,f)]??0)<=DESIGNER_REVISIONS_PER_SCENE)),spent=scenes.filter(id=>!open.includes(id));
    if(spent.length)notes.push(`The revisions of ${spent.map(id=>sceneLabel(id,input)).join(', ')} in ${formats.join(', ')} are used: move on and say in the finish what remains.`);
    if(open.length&&formats.length){
     const views=extensionViews(input,open,formats,phase,asked.languages),out=await tools.render(views);
     for(const id of open)for(const f of formats)state.renders[renderKey(id,f)]=(state.renders[renderKey(id,f)]??0)+1;
     const findings=out.summary.reports.flatMap(r=>r.findings).sort((a,b)=>Number(b.severity==='hard')-Number(a.severity==='hard'));
     state.lastRender={sceneId:open[0],findings,views:views.filter(v=>v.shot).slice(0,6).flatMap(v=>{const s=out.shots.find(x=>x.key===v.key);return s?[{label:v.label,file:s.file,width:v.props.width,height:v.props.height}]:[];})};
     looked=state.lastRender.views[0]?.file;notes.push(extensionNote(findings,state.lastRender.views.length));results.push(`Rendered ${open.map(id=>sceneLabel(id,input)).join(', ')} in ${formats.join(', ')}: ${out.summary.hard} to fix.`);
    }
   }
   // The phase moves on when its renders are done; the next note says what comes now.
   const nextPhase=extensionPhase(input,state.renders);
   if(nextPhase!==phase){phase=nextPhase;state.extensionPhase=phase;await args.onPhase?.(phase,phaseLabels[phase]);notes.push(phase==='formats'?'Every scene is drawn in the reference format. Now each ordered format as its own composition.':'Every scene works in every format. Now the languages, hooks, calls to action and lengths: render them with {"render":{"languages":[…]}} and fix the rules that break.');}
   if(actions.finish){
    await Promise.allSettled(pending.values());
    const scenes=actions.finish.scenes.map(s=>({...s,sceneId:sceneIdOf(s.scene,input)}));
    const missing=input.storyboard.filter(s=>!scenes.some(x=>x.sceneId===s.id)).map(s=>sceneLabel(s.id,input));
    if(missing.length||scenes.some(s=>!s.sceneId))notes.push(`Not finished: the finish names every scene exactly once (missing ${missing.join(', ')||'none'}).`);
    else{const done=built.ok?await tools.finish():{complete:false as const,issue:'The source does not build yet.'};
     if(done.complete){state.finish={intent:actions.finish.intent,scenes:scenes.map(s=>({sceneId:s.sceneId!,moment:s.moment.slice(0,160),...(s.motion?{motion:s.motion.slice(0,240)}:{}),...(s.sound?{sound:s.sound.slice(0,200)}:{})}))};state.complete=true;results.push('The draft is finished.');}
     else notes.push(`Not finished yet: ${done.issue.slice(0,1200)}`);}
   }
  }catch(error){if(propagateExecutionFailure(error))throw error;notes.push(`This step needs another attempt: ${(error instanceof Error?error.message:'').slice(0,300)}`);}
  if(!answer.files.length&&!answer.actions&&!answer.actionsError)notes.push('No files and no actions in your answer: write the complete files in fenced code blocks with their paths.');
  state.heroNote=notes.filter(Boolean).join('\n\n');state.transcript.push({from:'tool',text:state.heroNote.slice(0,2000)});await args.save(state);
  await args.onTurn?.({turn:state.turn,idea:answer.prose.split(/\n\s*\n/)[0]?.slice(0,600)??'',prose:answer.prose.slice(0,6000),files:answer.files.map(f=>f.path),...(answer.raw.actions?{actions:answer.raw.actions.slice(0,4000)}:{}),results,...(looked?{looked}:{})});
 }
 await Promise.allSettled(pending.values());
 return state;
}
