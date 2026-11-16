// The review that an average frame fails (critic@3), for designerVersion 6 only. Bench run 2 of 2026-11-14 ended with
// "all checks passed" on a frame the owner would not show a client: the reviewer passed checks with hedged evidence,
// its notes prescribed the arrangement (the accepted frame was the reviewer's idea, not the chosen one), no check asked
// what an agency would ask, and a note that came with the acceptance never reached the designer. Everything here is
// frozen with the run by its designer version; version 5 runs read critic@2 exactly as before. Pure.
import {heroMeaning} from './designer';
import {CRITIC_BASE,SELECTION_WHAT,REVIEW_INSTRUCTIONS,END_REVIEW_WHAT,stageReviewMaterial,type CriticCheck,type ReviewRound} from './critic-review';
import {ideaText,AIM_IN_FULL} from './image-ideas';
import {heroBrief} from './hero-chat';
import type {StageSkills,SkillStage} from '../agents/stage-skills';
import type {DirectionInput} from './types';

export const QUALITY_VERSION='critic@3';
export const usesQuality=(input:Pick<DirectionInput,'brief'>)=>heroMeaning(input);

/** Checks added to a skill's own for one review stage. Each is a yes/no question with one reading, answerable from the
 * render at full size and at thumbnail size (or, for ideas, from the idea's text and the brand). With the skill's own
 * checks no skill has more than six (the skill editor's limit). */
export const QUALITY_CHECKS:{skill:string;stage:'hero'|'ideas'|'extension';question:string}[]=[
 {skill:'brand-character',stage:'hero',question:'Is each device of the brand used in the role and at the scale that the brand\'s own materials give it?'},
 {skill:'stopping-power',stage:'hero',question:'Does every large area of the frame do work for the idea: it shows the subject, carries words, or is space the idea needs?'},
 {skill:'layout-craft',stage:'extension',question:'Does each scene have its own composition for its own message, while the type, the colour and the marks stay one system?'},
 {skill:'ad-idea',stage:'hero',question:'Is everything the frame shows as the product or its work the real thing, with no placeholder standing in for it?'},
 {skill:'frame-composition',stage:'hero',question:'Do all parts of the frame share one direction of light, one perspective and one scale?'},
 {skill:'frame-composition',stage:'hero',question:'Is the outline of every element readable, with none hidden or cut by another element?'},
 {skill:'final-check',stage:'hero',question:'Is the place of the mark tied to another element of the frame, with a reason a viewer can see?'},
 {skill:'stopping-power',stage:'hero',question:'Can a viewer tell this frame apart from other ads for the same kind of product at thumbnail size?'},
 {skill:'type-as-voice',stage:'hero',question:'Is the word that carries the idea the first word a viewer reads in the headline?'},
 {skill:'revise-with-reason',stage:'hero',question:'Is the idea on the frame the chosen idea, as written under THE CHOSEN IDEA?'},
 {skill:'one-idea',stage:'ideas',question:'Can the idea be made from what the brand really has: its supplied files, pictures that can be generated, and code?'},
 // The owner, 16 November: pictures were put together from the brand's parts and had no witty idea. A mark of the
 // brand may be the subject; what fails is an arrangement of what the kit already holds.
 {skill:'brand-character',stage:'ideas',question:'Is the idea a new picture in the aesthetic of the brand, as its own designers would make it, and more than an arrangement of what its kit already holds?'},
 {skill:'one-idea',stage:'ideas',question:'Can a stranger retell the turn of the idea to a friend in one sentence?'},
 {skill:'final-check',stage:'hero',question:'Can a stranger, with the words covered, say what the picture shows and what is surprising in it?'},
 {skill:'one-idea',stage:'hero',question:'Is the frame, with the logo covered, known as the brand by its light, colour, materials and mood, and not only by parts of its kit?'},
];
/** A stage's checks and signs with the quality checks added after each skill's own (numbering continues). */
/** Whether the hero scene's approved words hold the call to action. */
export function heroHasCallToAction(input:DirectionInput):boolean{
 const lines=heroBrief(input).lines.map(l=>l.trim().toLowerCase()),cta=[input.brief.cta,...Object.values((input.brand.copy as {cta?:Record<string,unknown>}|undefined)?.cta??{})].flatMap(v=>Array.isArray(v)?v:[v]).filter((v):v is string=>typeof v==='string'&&!!v.trim()).map(v=>v.trim().toLowerCase());
 return lines.some(l=>cta.some(c=>l===c||l.includes(c)));
}
export function reviewMaterialFor(input:DirectionInput,st:StageSkills|undefined,stage:SkillStage,options:{/** the hero review was given THE CHOSEN IDEA */chosenIdea?:boolean}={}){
 const all=stageReviewMaterial(st,stage);if(!usesQuality(input)||(stage!=='hero'&&stage!=='ideas'&&stage!=='extension'))return all;
 // With the strict rule a check that cannot apply would always be a no: a hero scene without a call to action is not
 // asked about one. The other checks keep their numbers.
 const base=stage==='hero'&&!heroHasCallToAction(input)?{...all,checks:all.checks.filter(c=>!/call to action/i.test(c.question))}:all;
 const extra=QUALITY_CHECKS.filter(c=>c.stage===stage&&(c.skill!=='revise-with-reason'||options.chosenIdea)),checks:CriticCheck[]=[],skills=[...new Set([...base.checks.map(c=>c.skill),...extra.map(c=>c.skill)])];
 for(const skill of skills){const own=base.checks.filter(c=>c.skill===skill),last=Math.max(0,...all.checks.filter(c=>c.skill===skill).map(c=>c.n));checks.push(...own,...extra.filter(c=>c.skill===skill).map((c,i)=>({skill,n:last+i+1,question:c.question})));}
 return {checks,signs:base.signs};
}

/** Version 6, every review: a device the brand's own kit names never counts against the work. */
export const BRAND_DEVICES_REVIEWER='A finish, a material, a gradient, a shape or a mark that the brand\'s own kit names is the brand\'s device: it is never a sign of failure and never fails a check. The signs and checks about glows, gloss, gradients or added depth apply only to devices the brand does not own.';
/** The owner's one aim, 16 November, for the reviewer (see BRAND_SPIRIT). */
export const BRAND_SPIRIT_REVIEWER='The work is judged by one aim: an attractive picture, in the brand\'s own style, that shows the idea as vividly as it can be shown. In the brand\'s own style means made as its own designers would make it, in its aesthetic; the parts of its kit set side by side are not that. Vivid means the idea is seen in the picture at once, before the words are read. No way of making is preferred or forbidden. Work that misses one of the three (it is not attractive, it is not in the brand\'s own style, or its idea is not seen) fails, however well the other two are done, and a note names which.\n'+AIM_IN_FULL;
/** Version 6, every review (live run of 15 November: two review rounds each ended with the frame's subject or its way of
 * making replaced). A departure from plan D5, decided on live evidence. */
export const SUBJECT_AND_MAKING_REVIEWER='The frame\'s main subject and its way of making stay through a review: a photographed frame stays photographed, a frame built in code stays built in code. No note asks to remove the subject or to make the frame another way; when the subject or the way of making is itself the problem, say so in one note for the art director and ask the designer for nothing about it.';
/** Version 6, what the designer reads with every set of review notes. */
export const SUBJECT_AND_MAKING_STAY='The frame\'s main subject and its way of making stay: answer no note by removing the subject or by making the frame another way.';
/** Version 6, the end review (live run 3: it asked that the element carrying the chosen idea's turn be removed in every
 * scene, and the designer removed it). */
export const IDEA_TURN_REVIEWER='The element that carries the turn of the chosen idea (given under THE CHOSEN IDEA) stays in the work: no note asks to remove or replace it. When that element is itself the problem, say so in one note for the art director and ask the designer for nothing about it.';
/** Version 6, what the designer reads with the end review's notes. */
export const IDEA_TURN_STAYS='The element that carries the turn of your chosen idea stays as well: when a note asks for it to go, keep it and say that the note stays open.';
/** The hero review's instructions in critic@3. */
export const HERO_REVIEW_INSTRUCTIONS_V3=`${CRITIC_BASE} This is the hero frame, the frame every other scene follows: judge stopping power and the idea first, then craft. You see it at full size and at thumbnail size.
1. When your earlier review is given, rule on each earlier note first: fixed, open or worse.
2. Answer every check yes or no, with one line of evidence from the render (s = skill id, n = check number). Yes means the thing is plainly true of this frame as a stranger sees it. When your evidence needs a reservation (it is implied, partly so, acceptable, or the check does not apply), the answer is no.
3. Then add new notes. Each names its skill and check, has a priority (P0 blocks, P1 should, P2 could) and names the view. In problem, say what a viewer sees or fails to understand. In fix, say what must become true for the viewer and what must stay as it is. The solution is the designer's: a fix names no position, no added element, no arrangement and no other idea. A note that contradicts an earlier one names it in replaces and says why it no longer holds; otherwise replaces is empty.
${BRAND_DEVICES_REVIEWER}
${BRAND_SPIRIT_REVIEWER}
${SUBJECT_AND_MAKING_REVIEWER}
accepted is true when every check passes, no P0 or P1 note is open, and you would present this frame to the client as it is. When every check passes and you would still not present it, accepted is false and a note says what is missing. Approved words and facts stay as they are.`;
/** The selection's instructions in critic@3: the reason explains the choice and carries no advice on building it. */
export const SELECTION_INSTRUCTIONS_V3=`${CRITIC_BASE} ${SELECTION_WHAT} The reason says only why this idea is the strongest of the three. It gives no advice on how to build it: no position, no added element, no arrangement and no change to the idea. ${BRAND_DEVICES_REVIEWER} ${BRAND_SPIRIT_REVIEWER} Between two ideas that pass, the one that would show its idea most vividly wins; then the one with more wit.`;
/** The end review in version 6: the critic@2 text with the brand's own devices said once. */
export const END_REVIEW_INSTRUCTIONS_V3=`${REVIEW_INSTRUCTIONS(END_REVIEW_WHAT)}\n${BRAND_DEVICES_REVIEWER}\n${BRAND_SPIRIT_REVIEWER}\n${SUBJECT_AND_MAKING_REVIEWER}\n${IDEA_TURN_REVIEWER}`;
/** The chosen idea in the designer's own words, for the hero review (critic@3). */
export function chosenIdeaNote(ideas:{picked?:number;texts?:string[]}|undefined):string{
 const text=ideas?.picked&&ideas.texts?.length?ideaText(ideas.texts.at(-1)!,ideas.picked).slice(0,1600):'';
 return text?`THE CHOSEN IDEA (as the designer wrote it; the frame is reviewed as this idea)\n${text}`:'';
}
/** A selection's reason without advice on building: sentences that route or instruct are left out (the reviewer's role
 * line asks it to "route notes to the director", and in run 2 the reason ended with how to build the frame). */
export function reasonOnly(reason:string):string{
 const kept=reason.split(/(?<=[.!?])\s+/).filter(s=>!/^\s*(route\b|note (to|for)\b|to the (director|designer|coder)\b|keep\b|make sure\b|ensure\b|place\b|put\b|add\b|use\b|move\b|set\b|avoid\b)/i.test(s));
 return (kept.join(' ').trim()||reason.trim()).slice(0,600);
}

const HEDGE=/\b(impl(?:y|ies|ied)|though|although|acceptable|not applicable|does not apply|n\/a|partly|partially|somewhat|arguably|more or less|optional|could be (?:larger|stronger|clearer|better))\b/i;
/** critic@3, applied by the app as well as asked of the reviewer: a yes whose evidence is hedged is a no. Each such
 * answer becomes a P1 note, so the designer is told. */
export function strictRound(r:ReviewRound):ReviewRound{
 const flipped=r.answers.filter(a=>a.ok&&HEDGE.test(a.evidence));if(!flipped.length)return r;
 const noted=new Set(r.notes.map(n=>`${n.skill} ${n.check}`));
 return {...r,accepted:false,answers:r.answers.map(a=>flipped.includes(a)?{...a,ok:false}:a),
  notes:[...r.notes,...flipped.filter(a=>!noted.has(`${a.skill} ${a.n}`)).map((a,i)=>({id:`R${r.round}H${i+1}`,skill:a.skill,check:a.n,priority:'P1' as const,view:'hero',problem:`The reviewer could not confirm this check without a reservation: ${a.evidence}`,fix:'Make it plainly true for a stranger, inside the chosen idea.'}))]};
}
/** What the designer reads with the reviewer's notes (critic@3). */
export const NOTES_INSIDE_THE_IDEA:string='Each note names a problem; the answer is yours. Solve it inside the chosen idea, which stays. When a note cannot be solved inside the idea, say so and why, and leave the idea as it is. '+SUBJECT_AND_MAKING_STAY;
/** Bench run 14: twelve points in the one last turn and the designer rebuilt the frame as another arrangement than the
 * chosen idea's, with no review after it. */
export const STRUCTURE_STAYS='The frame keeps what the chosen idea says it is made of and how the idea arranges it. A point that would need another arrangement stays open: name it in one line and leave the frame as the idea has it.';
/** The one last turn after the review has finished with notes (critic@3): bounded, with no further review. */
export const lastTurnNote=(points:string[])=>`THE REVIEW IS FINISHED. The hero frame is accepted after this turn; there is no further review. This is one last turn for what stays open:\n${points.map(p=>`- ${p}`).join('\n')}\n${NOTES_INSIDE_THE_IDEA} Change only what these points need. ${STRUCTURE_STAYS}`;
