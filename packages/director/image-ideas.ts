// D4 (docs/plans/2026-11-13-skills-critic-image-owner.md, designerVersion 5): one owner for the image. Visual direction
// sets the territory; the designer opens stage H with three image ideas for the hero scene, step by step, in prose; an
// independent selection request (the critic role, the minimum of D5's selection mode) checks each idea against the
// territory, the brand and the `ideas` stage checks, picks one and says why; the choice is the next message of the
// designer's conversation, which then builds it. One more ideas round at most. The run never waits for the AD. Pure.

export const usesImageIdeas=(input:{brief:{designerVersion?:unknown}})=>Number(input.brief.designerVersion)>=5;
/** At most one extra ideas round. */
export const MAX_IDEA_ROUNDS=2;

export const IDEAS_TASK=`FIRST, THREE IMAGE IDEAS FOR THE HERO FRAME (no code yet). Work inside the territory of your direction, in three steps, in prose:
1. Write rough ideas for this frame.
2. Push each one to be bolder and more distinct from the others.
3. Give the final three as IDEA 1, IDEA 2 and IDEA 3, each with: what the viewer sees; the turn or surprise; the way of making (photo, rendered 3D, code-built graphics or interface, or a mix); why it stops the scroll for this product.
Keep the answer short, about 600 to 1,000 tokens. An independent reviewer picks one; you then build it in this conversation.`;
export const ideasAgain=(notes:string[])=>`None of the three ideas passes the key checks:\n${notes.map(n=>`- ${n}`).join('\n')}\nWrite three new ideas the same way (IDEA 1, IDEA 2, IDEA 3), bolder and closer to the territory. This is the last ideas round.`;
export const chosenMessage=(pick:number,reason:string,by:'reviewer'|'fallback')=>`THE CHOSEN IDEA: IDEA ${pick}. ${by==='reviewer'?`Why: ${reason}`:reason}\nBuild it now: write the files of the hero frame for this idea.`;

/** The selection request: a reviewer who did not write the ideas. */
export const SELECTION_INSTRUCTIONS=`You choose which of three image ideas for an ad's hero frame gets built. You did not write them. Read the territory, the brand (in the run context) and the checks. For each idea answer the key questions: is it one clear idea; does it fit this brand and this territory; would it stop the scroll for this product; and the checks given. Then pick the strongest passing idea and give the reason in two sentences. When none passes the key questions, set pick to 0 and say for each what is missing.`;
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
export const selectionContext=(territory:string,ideas:string,checks:string)=>`THE TERRITORY OF THIS DIRECTION\n${territory.trim()}\n\nTHE THREE IDEAS\n${ideas.trim()}${checks.trim()?`\n\n${checks.trim()}`:''}`;
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
