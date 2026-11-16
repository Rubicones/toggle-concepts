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
/** The one rule for every stage that decides what a frame shows (version 6), in the owner's words of 16 November:
 * "attractive visuals in the brand\'s own style that show the idea as vividly as possible". It replaces the narrower
 * rules written that day from single frames (the kit as subject, real things only, photographs, depth), which the
 * owner refused as fixes of one request: what a frame is made with depends on the brand and on the idea. It names no
 * brand, no look, no arrangement and no preferred way of making. */
export const BRAND_SPIRIT='THE AIM OF EVERY FRAME: an attractive picture, in the brand\'s own style, that shows the idea as vividly as it can be shown. Attractive: a stranger wants to look at it. In the brand\'s own style: made as the brand\'s own designers would make it, in its aesthetic (the brand pack gives it under AESTHETIC and FEEL, and the brand\'s own pictures show it); it is a new picture, not the parts of the kit set side by side. It also belongs to the world of the brand: the subject, the setting and the taste of the picture are ones this brand would choose, as modern or as traditional, as playful or as serious as the brand is. A subject from another world does not become the brand\'s by being given its colours. Vivid: the idea is seen in the picture at once, before the words are read. Every way of making is open to you (photograph, render, drawing, type, flat or with depth, real or imagined), and none is preferred: choose what makes this idea most vivid for this brand.';
/** The owner, 16 November: "write out what a vivid showing of an idea and an attractive picture are, as fuller general
 * rules". Principles that hold for any brand and any way of making; they name no look, no arrangement and no medium.
 * For the owner to approve. */
export const VIVID_IDEA=`AN IDEA SHOWN VIVIDLY
- One thought. The picture says one thing, and everything in it serves that thing; what does not is taken out.
- Shown, not told. The picture does the work of the idea itself: a stranger who cannot read the words still gets the point. The words finish the thought; they do not carry it.
- A turn. Something in the picture is not as expected: two things meet that do not usually meet, a familiar thing behaves in an unfamiliar way, or a size, a place or a moment is wrong on purpose. The turn is the idea made visible.
- Its strongest form. Take the idea as far as it goes: the largest difference, the clearest contrast, the most telling moment. A mild version of an idea is seen as no idea.
- Its own image. Pass over the first image everyone reaches for: the stock symbol that many ads have already used for this theme is not a turn. Look for the image that only this brand, with this message, would arrive at.
- Read at once. The viewer knows straight away what they are looking at; the surprise is in what it means, never in working out what it is.
- About the viewer. The idea touches something the viewer wants, fears or knows from their own life.
- Retold in one sentence. A stranger can tell it to a friend, and the friend reacts.`;
export const ATTRACTIVE_PICTURE=`AN ATTRACTIVE PICTURE
- One hero. One element leads by size, light or contrast; the eye lands on it first and knows where to go next.
- Scale with courage. The main thing takes as much of the frame as its importance; large and small are plainly different, and nothing is medium by default.
- Contrast. The frame has one strongest contrast (light against dark, large against small, sharp against soft, colour against quiet), and it sits on the subject.
- Light. It has a direction and a mood, and it shapes the subject.
- Colour as a decision. Few colours, one of them leading, taken from the brand.
- Material and detail. Surfaces, textures and finishes are made well enough to reward a second look.
- A decided composition. Where the weight sits and where the air is were chosen for this idea; nothing is placed where it is by habit.
- Finish. Everything is made with care at the size it is seen, with one light and clean edges; nothing looks unfinished, cheap or like a stand-in.
- Feeling. The picture has a mood a viewer could name, and they want to look a little longer.`;
/** The aim with its two fuller parts, as one block. */
/** The owner, 16 November: "the next stages are animation; it must be known in advance what will be animated and
 * how"; and the same day: it may be motion between scenes, inside a scene, travelling light or one principle of the
 * whole piece, and not everything must move: what matters is that it is planned. Prefers no kind of motion. */
export const MOTION_AHEAD='THE WORK WILL MOVE. Later stages animate it, so have a plan for its motion now and say it in a line or two. Motion can be the passage from one scene to the next, movement inside a scene, light that travels, or one principle that runs through the whole piece, the way a collage is put together and taken apart; not everything has to move, and stillness can be the choice. What matters is that the plan exists and the frames are made for it. The plan never costs the picture: the photograph or the render that carries the idea stays, and a whole picture can move too (the camera travels, the light changes). When one element has to move by itself, ask for it as its own picture or cutout of the same scene; do not redraw a picture in code only so that its parts can move.';
export const AIM_IN_FULL=`${VIVID_IDEA}\n\n${ATTRACTIVE_PICTURE}`;
/** What each of the three ideas owes, version 6: the brand's spirit, a subject of its own and a turn worth retelling. */
export const IDEAS_SUBJECT='The three ideas differ in their subject. Each idea has a turn with wit in it: something a stranger would retell to a friend in one sentence. Each idea also says its plan for motion in one line. Each is judged by the aim above.';
export const IDEAS_TASK_V6=IDEAS_TASK.replace('2. Push each one to be bolder and more distinct from the others.',`2. Push each one to be bolder and more distinct from the others. ${IDEAS_RANGE} ${IDEAS_SUBJECT}`);
/** The territory of a direction, version 6: the same rule where the visual idea is first written. */
export const TERRITORY_SPIRIT=`In visualIdea and productRole: ${BRAND_SPIRIT}`;
/** The owner, 16 November: attractiveness cannot be read from a description, so the three ideas are chosen by looking.
 * Each idea carries the request for one picture of it; the three are made and
 * the reviewer chooses by what it sees. The three are quoted on their own line, apart from the designer's pictures. */
export const IDEAS_SKETCHES='After the three ideas add three lines that begin SKETCH 1:, SKETCH 2: and SKETCH 3:. Each is the request for one picture of that idea as the viewer would see it, written as you would ask for the finished picture, in the aesthetic of the brand, with no words in it. The three pictures are made, and the reviewer chooses one idea by looking at them. They are made apart from your own pictures, and the picture of the chosen idea stays yours to use.';
/** How many idea sketches a direction is quoted: three for version 6 when generated pictures are permitted (STUDIO_IDEA_SKETCHES=0 turns them off). */
export const IDEA_SKETCHES=3;
export const ideaSketchCount=(brief:{designerVersion?:unknown;synthesisAllowed?:unknown},env:Record<string,string|undefined>=process.env)=>Number(brief.designerVersion)>=6&&brief.synthesisAllowed===true&&env.STUDIO_IDEA_SKETCHES!=='0'?IDEA_SKETCHES:0;
/** The three sketch requests of an ideas answer, in order; fewer than three means the ideas are chosen from the text. */
export function sketchPrompts(text:string):string[]{
 const marks=[...text.matchAll(/^[\s>*_#-]*SKETCH\s*([123])\s*[*_]*\s*[:.]\s*[*_]*/gim)],out:string[]=[];
 for(const n of [1,2,3]){const i=marks.findIndex(m=>Number(m[1])===n);if(i<0)return [];const from=marks[i].index!+marks[i][0].length,fence=text.indexOf('```',from),next=marks[i+1]?.index??text.length,to=fence>=0&&fence<next?fence:next;const prompt=text.slice(from,to).replace(/\s+/g,' ').trim();if(prompt.length<40)return [];out.push(prompt.slice(0,3800));}
 return out;
}
/** What the reviewer reads when the sketches are attached. */
export const SKETCH_SELECTION='A picture of each idea is attached, in order: sketch 1, sketch 2 and sketch 3. Choose by what you see in them: which picture is the most attractive, is in the brand\'s own aesthetic and shows its idea at once. The written ideas say what each picture was meant to be; a good description does not rescue a weak picture.';
/** Version 6, only when the brand has no picture of its product or its work that the frame may show (live run of
 * 15 November: a service brand with no cleared work; every idea became "the ad shows itself", a blank plate carrying the
 * headline). A rule about what the subject may be, not a look. For the owner to approve. */
export const IDEAS_WITHOUT_PRODUCT_PICTURE='This brand has no picture of its product or its work that the frame may show. Do not put an empty stand-in in its place (a blank plate, an empty frame, a placeholder screen), and do not make the ad itself the subject. Each idea shows one of these instead, and the three do not all choose the same one: the viewer\'s situation before the product (the problem as it looks in their day); the result the product leaves (what is different afterwards, as a thing or a moment a stranger can see); or a made scene that stands for the promise (a place, an object or an action that reads as the promise with no product in it).';
/** Whether the frame may show the product or its work as a picture: a supplied picture, a kit picture the art director
 * marked "Use this", or an interface the brand supplied (which code can build). */
export function hasShowablePicture(input:{assets?:{url:string}[];brand?:{references?:{url?:string;use?:boolean}[];interface?:unknown[]}}):boolean{
 return (input.assets??[]).some(a=>/\.(png|jpe?g|webp)$/i.test(a.url))||(input.brand?.references??[]).some(r=>r.use===true)||(input.brand?.interface??[]).length>0;
}
export const ideasTaskFor=(input:{brief:{designerVersion?:unknown};assets?:{url:string}[];brand?:{references?:{url?:string;use?:boolean}[];interface?:unknown[]}},options:{sketches?:boolean}={})=>Number(input.brief.designerVersion)>=6?(hasShowablePicture(input)?IDEAS_TASK_V6:IDEAS_TASK_V6.replace(IDEAS_SUBJECT,`${IDEAS_SUBJECT} ${IDEAS_WITHOUT_PRODUCT_PICTURE}`))+(options.sketches?`\n${IDEAS_SKETCHES}`:''):IDEAS_TASK;
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
