// D4 (docs/plans/2026-11-13-skills-critic-image-owner.md, designerVersion 5): one owner for the image. Visual direction
// sets the territory; the designer opens stage H with three image ideas for the hero scene, step by step, in prose; an
// independent selection request (the critic role, the minimum of D5's selection mode) checks each idea against the
// territory, the brand and the `ideas` stage checks, picks one and says why; the choice is the next message of the
// designer's conversation, which then builds it. One more ideas round at most. The run never waits for the AD. Pure.

import {CRITIC_BASE,SELECTION_WHAT} from './critic-review';

export const usesImageIdeas=(input:{brief:{designerVersion?:unknown}})=>Number(input.brief.designerVersion)>=5;
/** At most one extra ideas round. */
export const MAX_IDEA_ROUNDS=2;

export const IDEAS_TASK=`FIRST, THREE IMAGE IDEAS FOR THE HERO FRAME (no code yet). Work inside the territory of your direction, in three steps, in prose:
1. Write rough ideas for this frame.
2. Push each one to be bolder and more distinct from the others.
3. Give the final three as IDEA 1, IDEA 2 and IDEA 3, each with: what the viewer sees; the turn or surprise; the way of making (photo, rendered 3D, code-built graphics or interface, or a mix); why it stops the scroll for this product.
Keep the answer short, about 600 to 1,000 tokens. An independent reviewer picks one; you then build it in this conversation.`;
/** Version 6: the three ideas must differ in kind. Bench runs of 15 November: for a restrained brand all three ideas
 * of every run were one object alone on a plain ground, and the owner asked for live photographs and fuller frames. A
 * range rule, not a look: it asks that one of three be a whole scene when the direction allows a photograph. */
export const IDEAS_RANGE='Make the three differ in kind, not in detail: in what is shown, in how close the viewer is to it, and in how much of the frame it takes. When the direction allows a photograph, at least one idea is a whole scene, a place or a moment with the subject in it, and not the subject alone on a plain ground.';
/** The owner, 16 November, after bench runs 14 and 15 (every direction and all three ideas of each run took the
 * brand's own mark as the subject of the frame): "each time there is an attempt to put the picture together from the
 * parts of the brand; it must be in the spirit of the brand". The rule for every stage that decides what a frame shows:
 * a new picture with the brand's character, never an arrangement of the kit's parts; a mark of the brand may be
 * the subject (the owner's correction the same day). Names no brand, no look and no arrangement. */
export const BRAND_SPIRIT='Work in the spirit of the brand, not out of its parts. The kit of the brand shows its character: how it looks, sounds and feels. Make a new picture that has this character and an idea of its own. Do not put a picture together by arranging what the kit already holds (its marks, shapes, colours and gradients side by side): that gives a page of the brand book, not an ad. A mark or a device of the brand may be the subject of a frame when the idea does something with it that the kit does not already show. The idea and the picture are new; the character is the brand\'s.';
/** What each of the three ideas owes, version 6: the brand's spirit, a subject of its own and a turn worth retelling. */
export const IDEAS_SUBJECT=`${BRAND_SPIRIT} The three ideas do not all take the same subject. Each idea has a turn with wit in it: something a stranger would retell to a friend in one sentence.`;
export const IDEAS_TASK_V6=IDEAS_TASK.replace('2. Push each one to be bolder and more distinct from the others.',`2. Push each one to be bolder and more distinct from the others. ${IDEAS_RANGE} ${IDEAS_SUBJECT}`);
/** The territory of a direction, version 6: the same rule where the visual idea is first written. */
export const TERRITORY_SPIRIT=`In visualIdea and productRole: ${BRAND_SPIRIT}`;
/** Version 6, only when the brand has no picture of its product or its work that the frame may show (live run of
 * 15 November: a service brand with no cleared work; every idea became "the ad shows itself", a blank plate carrying the
 * headline). A rule about what the subject may be, not a look. For the owner to approve. */
export const IDEAS_WITHOUT_PRODUCT_PICTURE='This brand has no picture of its product or its work that the frame may show. Do not put an empty stand-in in its place (a blank plate, an empty frame, a placeholder screen), and do not make the ad itself the subject. Each idea shows one of these instead, and the three do not all choose the same one: the viewer\'s situation before the product (the problem as it looks in their day); the result the product leaves (what is different afterwards, as a thing or a moment a stranger can see); or a made scene that stands for the promise (a place, an object or an action that reads as the promise with no product in it).';
/** Whether the frame may show the product or its work as a picture: a supplied picture, a kit picture the art director
 * marked "Use this", or an interface the brand supplied (which code can build). */
export function hasShowablePicture(input:{assets?:{url:string}[];brand?:{references?:{url?:string;use?:boolean}[];interface?:unknown[]}}):boolean{
 return (input.assets??[]).some(a=>/\.(png|jpe?g|webp)$/i.test(a.url))||(input.brand?.references??[]).some(r=>r.use===true)||(input.brand?.interface??[]).length>0;
}
export const ideasTaskFor=(input:{brief:{designerVersion?:unknown};assets?:{url:string}[];brand?:{references?:{url?:string;use?:boolean}[];interface?:unknown[]}})=>Number(input.brief.designerVersion)>=6?(hasShowablePicture(input)?IDEAS_TASK_V6:IDEAS_TASK_V6.replace(IDEAS_SUBJECT,`${IDEAS_SUBJECT} ${IDEAS_WITHOUT_PRODUCT_PICTURE}`)):IDEAS_TASK;
export const ideasAgain=(notes:string[])=>`None of the three ideas passes the key checks:\n${notes.map(n=>`- ${n}`).join('\n')}\nWrite three new ideas the same way (IDEA 1, IDEA 2, IDEA 3), bolder and closer to the territory. This is the last ideas round.`;
/** The chosen idea in the designer's own words (the whole of its IDEA n section); when the sections cannot be told
 * apart, the whole ideas answer, so the build never starts without the idea's text. */
export function ideaText(ideas:string,pick:number):string{
 const parts=ideas.split(/^\s*(?:#+\s*)?(?:\*\*)?IDEA\s*([123])\b[:.)\s*-]*/im);
 for(let i=parts.length-2;i>=1;i-=2)if(Number(parts[i])===pick&&parts[i+1].trim())return parts[i+1].trim().slice(0,3000);
 return ideas.trim().slice(0,6000);
}
/** Live run 2026-11-14: the build started in a new conversation that had never seen the ideas, and a different frame was
 * built. The message now quotes the chosen idea, whatever conversation reads it. */
export const chosenMessage=(pick:number,reason:string,by:'reviewer'|'fallback',ideas='')=>`THE CHOSEN IDEA: IDEA ${pick}. ${by==='reviewer'?`Why: ${reason}`:reason}${ideas.trim()?`\n\nIDEA ${pick}, AS YOU WROTE IT\n${ideaText(ideas,pick)}`:''}\n\nBuild it now: write the files of the hero frame for this idea, in the way of making it names. If you change the way of making, say so and why in your first sentence.`;

/** The selection request: a reviewer who did not write the ideas. */
/** D5 (5e): the selection is the critic's request shape with the three ideas as the work and the `ideas` checks. */
export const SELECTION_INSTRUCTIONS=`${CRITIC_BASE} ${SELECTION_WHAT}`;
export const selectionSchema={name:'idea_selection_v1',schema:{type:'object',additionalProperties:false,properties:{
 ideas:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,properties:{idea:{type:'integer',enum:[1,2,3]},passes:{type:'boolean'},why:{type:'string'}},required:['idea','passes','why']}},
 pick:{type:'integer',enum:[0,1,2,3]},reason:{type:'string'}},required:['ideas','pick','reason']}};
export type Selection={pick:number|null;reason:string;notes:string[]};
/** Reads the reviewer's answer; null when it is not readable. */
export function readSelection(text:string|null|undefined):Selection|null{
 try{const v=JSON.parse(text??'') as {ideas?:{idea?:number;passes?:boolean;why?:string}[];pick?:number;reason?:string};
  if(!Array.isArray(v.ideas)||typeof v.reason!=='string')return null;
  const pick=[1,2,3].includes(Number(v.pick))?Number(v.pick):null;
  return {pick,reason:v.reason.trim().slice(0,600),notes:v.ideas.filter(i=>!i.passes).map(i=>`Idea ${i.idea}: ${String(i.why??'').trim().slice(0,300)}`)};
 }catch{return null;}
}
/** The selection request's context: the territory, the three ideas and the stage's checks, as plain text. */
export const selectionContext=(territory:string,ideas:string,checks:string,making='')=>`THE TERRITORY OF THIS DIRECTION\n${territory.trim()}${making.trim()?`\n\n${wayOfMakingNote(making)}`:''}\n\nTHE THREE IDEAS\n${ideas.trim()}${checks.trim()?`\n\n${checks.trim()}`:''}`;
/** What the direction asked for, so a reviewer can say when the work was made another way (photography asked for, a
 * code-drawn frame delivered). */
export const wayOfMakingNote=(territory:string)=>`WHAT THE DIRECTION ASKED FOR\n${territory.trim()}\nIf the work is made another way than this way of making (a photograph asked for, the frame drawn in code; or the reverse) and the designer gave no reason, say so in a P1 note.`;
/** The three ideas as short cards for the timeline. */
export function ideaCards(text:string):string[]{
 const parts=text.split(/^\s*(?:\*\*)?IDEA\s*([123])\b[:.)\s*-]*/im);const cards:string[]=[];
 for(let i=1;i<parts.length;i+=2)cards[Number(parts[i])-1]=parts[i+1].replace(/\*\*/g,'').replace(/\s+/g,' ').trim().slice(0,400);
 return cards.filter(Boolean).length===3?cards:[];
}

/** Visual direction's contract for version 5 (with the territory schema): the territory, the frames are the designer's. */
export const TERRITORY_TASK='TERRITORY CONTRACT: each treatment is the territory of its direction, which replaces the treatment fields described above. visualIdea: the visual idea in words and why it fits this brand and this line. twoSeconds: what the viewer feels and understands in two seconds. productRole: the product\'s role in the picture. makingTechnique: one to three ways of making (photo, rendered 3D, code-built graphics or interface, a mix) and why. success: what success looks like. Compositions, layouts, colours per scene and what each frame shows are the designer\'s.';
export const IMAGE_OWNER_VERSION='image-owner@1';
/** A saved visual direction written as territories (version 5 planning). */
export function isTerritoryOutput(output:unknown){
 try{const v=(typeof output==='string'?JSON.parse(output):output) as {deliverable?:{treatments?:{twoSeconds?:unknown}[]}};return Array.isArray(v?.deliverable?.treatments)&&v.deliverable.treatments.length>0&&v.deliverable.treatments.every(t=>typeof t?.twoSeconds==='string');}catch{return false;}
}
