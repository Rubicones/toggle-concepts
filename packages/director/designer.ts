// The designer's turn (designer pipeline plan, point 4): one structured answer per request. The app applies the code
// changes, buys the requested pictures inside the approved count, renders the requested views and returns what it
// measured and the screenshots on the next turn. `finish` closes the draft with the intent and point 3's notes.
import {z} from 'zod';
import {imageMethodSchemas} from './contract';
import type {DirectionInput,Resource} from './types';

/** Blocks quoted with the designer (brief.designerVersion 1). Earlier blocks keep the director and the coder. */
export const usesDesigner=(input:Pick<DirectionInput,'brief'|'stage'>)=>input.stage==='draft'&&input.brief.designerVersion===1;

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
export type DesignerTurn=z.infer<typeof designerTurnSchema>;
export type DesignerPicture=z.infer<typeof designerPictureSchema>;

/** The provider sees the portable core; the full zod contract checks every answer afterwards. */
export const designerTurnResponse={name:'designer_turn_v1',schema:z.toJSONSchema(designerTurnSchema,{io:'input'}) as Record<string,unknown>};

/**
 * Reads one answer. Ids must be issued (scenes, formats, reference assets); a picture without a known scene or a
 * finish that omits a scene is refused with a sentence the designer can act on next turn. Sound needs an audio file.
 */
export function readDesignerTurn(value:unknown,input:Pick<DirectionInput,'storyboard'|'formats'|'assets'>):DesignerTurn{
 const turn=designerTurnSchema.parse(value),scenes=new Set(input.storyboard.map(s=>s.id)),formats=new Set(input.formats.map(f=>f.id)),assets=new Set(input.assets.map(a=>a.id));
 const audio=input.assets.some(a=>a.mime.startsWith('audio/'));
 if(!scenes.has(turn.focus.sceneId))throw new Error(`DESIGNER_UNKNOWN_SCENE: focus.sceneId must be one of ${[...scenes].join(', ')}.`);
 for(const p of turn.pictures){
  if(!scenes.has(p.scene))throw new Error(`DESIGNER_UNKNOWN_SCENE: a picture's scene must be one of ${[...scenes].join(', ')}.`);
  const unknown=p.referenceAssetIds.find(a=>!assets.has(a));if(unknown)throw new Error(`DESIGNER_UNKNOWN_REFERENCE: ${unknown} is not a supplied file.`);
  if(p.becomes&&!p.proxyFor)delete p.becomes;
 }
 if(turn.render){if(!scenes.has(turn.render.sceneId))throw new Error('DESIGNER_UNKNOWN_SCENE: render.sceneId must be an issued scene.');const f=turn.render.formats.find(x=>!formats.has(x));if(f)throw new Error(`DESIGNER_UNKNOWN_FORMAT: ${f} is not an ordered format (${[...formats].join(', ')}).`);}
 if(turn.finish){
  const named=turn.finish.scenes.map(s=>s.sceneId),missing=[...scenes].filter(s=>!named.includes(s));
  if(missing.length||new Set(named).size!==named.length||named.some(s=>!scenes.has(s)))throw new Error(`DESIGNER_FINISH_SCENES: finish names every scene exactly once (${[...scenes].join(', ')}).`);
  if(!audio)for(const s of turn.finish.scenes)delete s.sound;
 }
 if(!turn.files.length&&!turn.edits.length&&!turn.pictures.length&&!turn.render&&!turn.finish)throw new Error('DESIGNER_EMPTY_TURN: change the code, request a picture, ask for a render or finish.');
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
