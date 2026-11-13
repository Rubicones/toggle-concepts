// The designer's turn (designer pipeline plan, point 4): one structured answer per request. The app applies the code
// changes, buys the requested pictures inside the approved count, renders the requested views and returns what it
// measured and the screenshots on the next turn. `finish` closes the draft with the intent and point 3's notes.
import {z} from 'zod';
import {imageMethodSchemas} from './contract';
import type {DirectionInput,Resource} from './types';
import type {Finding} from './layout-inspection';

/** Blocks quoted with the designer (brief.designerVersion 1). Earlier blocks keep the director and the coder. */
export const usesDesigner=(input:Pick<DirectionInput,'brief'|'stage'>)=>input.stage==='draft'&&Number(input.brief.designerVersion)>=1;
/** Design quality plan (designerVersion 2): the hero frame first, with the critic in the loop (point 3). Version 1 blocks
 * run exactly as before. */
export const heroFirst=(input:Pick<DirectionInput,'brief'>)=>Number(input.brief.designerVersion)>=2;
/** Engine rebuild (designerVersion 3): the draft is built on the neutral engine kit ('./kit'), and one render may show
 * several scenes. Earlier blocks run exactly as before. */
export const usesEngineKit=(input:Pick<DirectionInput,'brief'>)=>Number(input.brief.designerVersion)>=3;
/** The scene that proves the promise: the first with a proof from the script (point 1d), else the first scene. */
export function heroScene(input:Pick<DirectionInput,'storyboard'>){return (input.storyboard.find(s=>s.proof)??input.storyboard[0])?.id??'';}

const id=z.string().min(1).max(100),text=(max:number)=>z.string().min(1).transform(t=>t.trim().replace(/\s+/g,' ').slice(0,max));
export const designerActivities=['designing','looking','revising','recomposing','finishing'] as const;
export const designerPictureSchema=z.strictObject({
 purpose:z.string().min(1).max(600),scene:id,prompt:z.string().min(1).max(4000),aspect:z.string().regex(/^\d{1,3}:\d{1,3}$/),
 referenceAssetIds:z.array(id).max(3).default([]),mustNotContain:z.array(z.string().min(1).max(300)).max(20).default([]),
 proxyFor:z.enum(['3d','video']).optional(),cutout:z.boolean().optional(),becomes:text(160).optional(),
 sketch:imageMethodSchemas.sketch.optional(),
});
export const designerTurnSchema=z.strictObject({
 /** What this turn is about, for the activity timeline: "Designing scene 2", "Revising: headline overlaps the waveform". */
 focus:z.strictObject({sceneId:id,activity:z.enum(designerActivities),about:text(160)}),
 files:z.array(z.strictObject({path:z.string().min(1).max(200),source:z.string().max(400000)})).max(8).default([]),
 edits:z.array(z.strictObject({path:z.string().min(1).max(200),oldText:z.string().min(1),newText:z.string()})).max(32).default([]),
 pictures:z.array(designerPictureSchema).max(4).default([]),
 render:z.strictObject({sceneId:id,formats:z.array(id).max(8).default([])}).optional(),
 finish:z.strictObject({
  intent:z.string().min(80).max(4000),
  scenes:z.array(z.strictObject({sceneId:id,moment:text(160),motion:text(240).optional(),sound:text(200).optional()})).min(1).max(40),
 }).optional(),
});
export type DesignerTurn=Omit<z.infer<typeof designerTurnSchema>,'render'>&{render?:{sceneId:string;formats:string[];more?:string[]};settleHero?:boolean;notes?:string;seen?:z.infer<typeof seenSchema>};
export type DesignerPicture=z.infer<typeof designerPictureSchema>;

/** The provider sees the portable core; the full zod contract checks every answer afterwards. */
export const designerTurnResponse={name:'designer_turn_v1',schema:z.toJSONSchema(designerTurnSchema,{io:'input'}) as Record<string,unknown>};
/** Version 2 turns (design quality plan): settleHero asks for the hero frame's review (point 3). */
/** Design quality plan, point 4: what the designer saw in the last render, before it changes anything. */
export const seenSchema=z.strictObject({first:text(200),second:text(200),third:text(200),weakest:z.array(text(200)).min(1).max(3)});
export const designerTurnSchemaV2=designerTurnSchema.extend({settleHero:z.boolean().optional(),
 /** Point 4a: the designer's own running record (decisions, what it tried and rejected, what remains), rewritten whole each turn. */
 notes:text(1500).optional(),
 /** Point 4b: required on a turn that follows a render. */
 seen:seenSchema.optional()});
export const designerTurnResponseV2={name:'designer_turn_v2',schema:z.toJSONSchema(designerTurnSchemaV2,{io:'input'}) as Record<string,unknown>};
/** Version 3 turns (engine rebuild): one render may show up to three more scenes in the same formats. */
export const designerTurnSchemaV3=designerTurnSchemaV2.extend({render:z.strictObject({sceneId:id,formats:z.array(id).max(8).default([]),more:z.array(id).max(3).default([])}).optional()});
export const designerTurnResponseV3={name:'designer_turn_v3',schema:z.toJSONSchema(designerTurnSchemaV3,{io:'input'}) as Record<string,unknown>};
export const designerTurnResponseFor=(input:Pick<DirectionInput,'brief'>)=>usesEngineKit(input)?designerTurnResponseV3:heroFirst(input)?designerTurnResponseV2:designerTurnResponse;

/**
 * Reads one answer. Ids must be issued (scenes, formats, reference assets); a picture without a known scene or a
 * finish that omits a scene is refused with a sentence the designer can act on next turn. Sound needs an audio file.
 */
export function readDesignerTurn(value:unknown,input:Pick<DirectionInput,'storyboard'|'formats'|'assets'>&Partial<Pick<DirectionInput,'brief'>>):DesignerTurn{
 const turn:DesignerTurn=(input.brief&&usesEngineKit({brief:input.brief})?designerTurnSchemaV3:input.brief&&heroFirst({brief:input.brief})?designerTurnSchemaV2:designerTurnSchema).parse(value),scenes=new Set(input.storyboard.map(s=>s.id)),formats=new Set(input.formats.map(f=>f.id)),assets=new Set(input.assets.map(a=>a.id));
 const audio=input.assets.some(a=>a.mime.startsWith('audio/'));
 if(!scenes.has(turn.focus.sceneId))throw new Error(`DESIGNER_UNKNOWN_SCENE: focus.sceneId must be one of ${[...scenes].join(', ')}.`);
 for(const p of turn.pictures){
  if(!scenes.has(p.scene))throw new Error(`DESIGNER_UNKNOWN_SCENE: a picture's scene must be one of ${[...scenes].join(', ')}.`);
  const unknown=p.referenceAssetIds.find(a=>!assets.has(a));if(unknown)throw new Error(`DESIGNER_UNKNOWN_REFERENCE: ${unknown} is not a supplied file.`);
  if(p.becomes&&!p.proxyFor)delete p.becomes;
 }
 if(turn.render){if(!scenes.has(turn.render.sceneId))throw new Error('DESIGNER_UNKNOWN_SCENE: render.sceneId must be an issued scene.');const f=turn.render.formats.find(x=>!formats.has(x));if(f)throw new Error(`DESIGNER_UNKNOWN_FORMAT: ${f} is not an ordered format (${[...formats].join(', ')}).`);if(turn.render.more?.some(x=>!scenes.has(x)))throw new Error('DESIGNER_UNKNOWN_SCENE: render.more names issued scenes.');}
 if(turn.finish){
  const named=turn.finish.scenes.map(s=>s.sceneId),missing=[...scenes].filter(s=>!named.includes(s));
  if(missing.length||new Set(named).size!==named.length||named.some(s=>!scenes.has(s)))throw new Error(`DESIGNER_FINISH_SCENES: finish names every scene exactly once (${[...scenes].join(', ')}).`);
  if(!audio)for(const s of turn.finish.scenes)delete s.sound;
 }
 if(!turn.files.length&&!turn.edits.length&&!turn.pictures.length&&!turn.render&&!turn.finish&&!turn.settleHero&&!turn.notes)throw new Error('DESIGNER_EMPTY_TURN: change the code, request a picture, ask for a render or finish.');
 return turn;
}

/** The timeline line for a turn, in the AD's words (point 4d). */
export function designerActivityLine(turn:Pick<DesignerTurn,'focus'>,sceneNumber:(sceneId:string)=>number){
 const n=sceneNumber(turn.focus.sceneId),scene=n>0?`scene ${n}`:'the scene';
 const lead={designing:`Designing ${scene}`,looking:`Looking at ${scene}`,revising:`Revising ${scene}`,recomposing:`Recomposing ${scene}`,finishing:'Finishing the draft'}[turn.focus.activity];
 return turn.focus.about?`${lead}: ${turn.focus.about}`:lead;
}

/**
 * A requested picture as a director resource (point 4c), under the next issued id that no picture used yet. It is saved
 * in the work state before admission, which checks the saved resource, the count left and the price.
 */
export function pictureResource(picture:DesignerPicture,input:Pick<DirectionInput,'resourceIds'|'brief'>,used:string[]):Resource{
 const id=input.resourceIds.find(r=>!used.includes(r));if(!id)throw new Error('STILL_COUNT_EXHAUSTED');
 return {id,kind:'still',resolution:'low',proxy:!!picture.proxyFor,...(picture.proxyFor?{proxyFor:picture.proxyFor}:{}),purpose:picture.purpose,scene:picture.scene,prompt:picture.prompt,aspect:picture.aspect,
  referenceAssetIds:picture.referenceAssetIds,mustNotContain:picture.mustNotContain,
  ...(picture.cutout&&input.brief.pictureRulesVersion===1?{cutout:true}:{}),...(picture.becomes&&picture.proxyFor?{becomes:picture.becomes}:{}),
  ...(picture.sketch&&input.brief.imageMethodsVersion===1?{sketch:{shapes:picture.sketch.shapes}}:{})};
}

/** A turn's results as short lines for the timeline (point 4d): what was saved, asked for, seen and decided. */
export function designerTurnSummary(results:unknown[]):string[]{
 const lines:string[]=[],written:string[]=[];let asked=0,refused=0;
 for(const value of results){const r=value as Record<string,unknown>;
  if(typeof r.written==='string')written.push(r.written.split('/').at(-1)!);
  else if(r.build==='failed')lines.push('The code does not build yet; the designer repairs it next.');
  else if(r.picture==='requested')asked++;else if(r.picture==='refused')refused++;
  else if(typeof r.render==='string'&&typeof r.views==='number'){const hard=Number(r.hard??0);lines.push(`Rendered ${r.views} view${r.views===1?'':'s'}: ${hard?`${hard} objective issue${hard===1?'':'s'} to fix`:'no objective issues'}.`);}
  else if(r.render==='refused')lines.push('No more revisions for this scene; the designer moves on.');
  else if(r.finish==='complete')lines.push('The draft is finished.');else if(r.finish==='refused')lines.push('Not finished yet: some options still need work.');
  else if(typeof r.error==='string')lines.push('This step needs another attempt.');
 }
 if(results.some(r=>(r as {refused?:string})?.refused==='seen'))lines.push('Not applied: the designer must first say what it saw in the render.');
 if(written.length)lines.unshift(`Saved ${written.join(', ')}.`);
 if(asked)lines.push(`Asked for ${asked} picture${asked===1?'':'s'}.`);if(refused)lines.push('The approved number of pictures is used.');
 return lines;
}

/** The designer's saved progress in the work state (point 4b/4e). */
export type DesignerLoopState={
 /** LC4 (shared Local runs): the direction's stored conversation after its last accepted turn, and the files it has seen. */
 session?:{role:string;sessionId:string;tokens:number};filesSeen?:Record<string,string>;
 /** Point 4a: the designer's notes, sent at the top of every request (outside the 12-result window); a restart keeps them. */
 notes?:string;
 /** point 4b: the turn after this render was already refused once for a missing seen */
 seenRefused?:boolean;
 /** Design quality plan, point 3 (designerVersion 2): the hero frame and whether it is settled. Saved, so a restart keeps it. */
 hero?:{sceneId:string;format:string;state:'designing'|'accepted';reviews:number;acceptedBy?:'critic'|'reviews-used'|'no-critic'|'review-failed';shots?:{label:string;file:string}[]};turn:number;startedAt:number;complete:boolean;/** pictures requested so far (counted against the approved number) */pictures:number;/** picture ids whose result reached the designer (a restart settles the rest) */reported?:string[];transcript:{from:'agent'|'tool';text:string}[];renders:Record<string,number>;finish?:NonNullable<DesignerTurn['finish']>;lastRender?:{sceneId:string;views:{label:string;file:string;width:number;height:number}[];findings:Finding[]}};

/** Point 4d: the designer's look at a render, as timeline lines. */
export function seenLines(seen:NonNullable<DesignerTurn['seen']>){return [`Read first: ${seen.first}`,`Read second: ${seen.second}`,`Read third: ${seen.third}`,...seen.weakest.map((w,i)=>`${i===0?'Weakest point':'Also weak'}: ${w}`)];}
