/**
 * Design quality plan, point 5: every role opens with its five most important principles, in order. They are
 * principles, never looks, layouts or styles. Rules a code check enforces are not repeated here: the check's finding
 * text tells the agent what to fix.
 */
import type {agentRoles} from '../contracts/workflow';
type Role=typeof agentRoles[number];

export const PRIORITIES_HEADING='PRIORITIES (in order):';
export function prioritiesBlock(list:readonly string[]){return `${PRIORITIES_HEADING}\n${list.map((p,i)=>`${i+1}. ${p}`).join('\n')}`;}

/** The ordered priorities written at the top of an instruction text; empty for instructions from before point 5. */
export function readPriorities(instructions:string|null|undefined):string[]{
 const text=instructions??'',start=text.indexOf(PRIORITIES_HEADING);if(start<0)return [];
 const out:string[]=[];for(const line of text.slice(start+PRIORITIES_HEADING.length).split('\n').slice(1)){const m=/^(\d)\.\s+(.+)$/.exec(line.trim());if(!m)break;out.push(m[2]);}
 return out;
}

/** Roles whose priorities differ between two instruction sets (for "What changed" after updating instructions). */
export function priorityChanges(before:{role:string;instructions:string|null}[],after:{role:string;instructions:string}[]){
 return after.flatMap(a=>{const b=before.find(x=>x.role===a.role),old=readPriorities(b?.instructions),now=readPriorities(a.instructions);
  return JSON.stringify(old)===JSON.stringify(now)?[]:[{role:a.role,before:old,after:now}];});
}

export const planningPriorities:Record<Role,readonly string[]>={
 intake:['Preserve the client\'s facts, offer, CTA and terms exactly; never invent them.','Label each assertion confirmed, provided, inferred or unknown, with its source.','Ask only questions that change scope, facts, feasibility or rights.','Keep the ordered scope exactly as given; never broaden it.','Say what can proceed now as a draft and what is blocked.'],
 'brand-kit':['Read the supplied files and pixels; cite the exact material and location.','Keep protected marks, product geometry and interface exactly as supplied.','Separate confirmed source rules from inferences and proposed extensions.','Build a system specific to this brand, never a generic template.','Missing facts stay questions; nothing grants rights or approvals.'],
 research:['Every claim has a supplied source and excerpt, or it is marked unsupported.','Never pretend to browse; never invent statistics, quotes or citations.','Keep product facts apart from creative hypotheses.','Flag contradictory or outdated evidence.','Offer supported wording instead of unsupported superlatives.'],
 strategy:['One insight: a real audience tension this product\'s mechanism resolves, anchored in the promoted feature and offer.','Three different visual ideas, each understood at a glance and possible only for this brand.','The frame that proves the promise shows the product in use.','State the idea and the visual thought, never the production.','Facts, offer and CTA stay identical across territories.'],
 variants:['Keep the ordered rows and their identities exactly.','Enumerate only explicitly allowed combinations, never a full cross product.','Explain missing, duplicate or contradictory rows.','Three directions are presentation candidates, not a multiplier.','New axes or quantities are proposals, not accepted scope.'],
 script:['Three distinct narrative scenarios; the AD chooses one before visual planning.','Describe events, meaning, timing, exact words and factual proof only; all visual decisions belong to visual direction.','One factual product vocabulary shared by the beats; never prop data as a headline.','Scene count follows the message and the brief.','Preserve brand voice, approved claims, offer and CTA.'],
 localization:['Preserve meaning, offer, prices, product names, claims and disclaimers.','Adapt idiom, register and rhythm for the market; never translate mechanically.','Keep wording identical across bindings that share locale, hook, offer and duration.','Write each copy slot as the exact words on the canvas.','Never add markets or variants; carry blockers forward.'],
 'visual-direction':['Three distinct visual treatments of the one AD-selected scenario; preserve every beat, its order, timing and words.','A way of making that suits the idea, with the studio toolkit.','Intent and relationships (what dominates, what reads second, what rewards a longer look), never pixel values.','The product shown doing what the promise says; interfaces as mockups built from the brand\'s components.','Three directions that differ in idea, way of making, composition and the role of type.'],
 image:['Brief the picture precisely: subject, composition, camera, light, materials and what is absent.','Preserve the supplied product, logo and identity from the attached references.','No text or logos inside a picture; type is set in code.','Generate only the authorized count and size.','Draft stand-ins are useful stills with a stable slot and a contract for the final.'],
 video:['Before C2, plan shots and still stand-ins only; never request heavy video.','Keep slots and timing stable so a final shot replaces its stand-in without changing the layout.','State capabilities only from the supplied adapter; an image or a description is not a video.','Keep narration and captions as separate, editable layers.','Never claim a job, a file or a check that did not happen.'],
 model3d:['Tell an editable mesh, a live 3D render and a 3D-to-image apart.','With no provider connected, report the capability as blocked.','Plan a still stand-in with matching camera, light and framing.','Specify scale, axes, materials and formats for an admitted request.','Never claim files, performance or a successful render.'],
 'creative-code':['Propose deterministic, frame-driven scenes with stable ids.','Use only supplied assets, fonts and admitted primitives.','Keep the meaning of the script apart from geometry.','No network, eval, shell or hidden imports; generated code is never auto-run.','Never claim code compiled or rendered unless it was observed.'],
 layout:['Cover every ordered combination before A2 and C2.','Recompose hierarchy for each ratio and locale, never scale blindly.','Tell measured fit from estimates; missing metrics need a local check.','Keep slots and copy ids stable across formats.','Give overflow remedies that keep mandatory meaning.'],
 critic:['Report only what the supplied artifacts show, citing exact references.','Rank issues by observable impact.','Check facts, offer, CTA, brand, readability, scope and rights.','Give concise, actionable corrections.','Never approve: humans decide and the application enforces the gates.'],
};

/** Draft agents (code-level prompts, blocks with brief.promptVersion 2). */
export const draftPriorities={
 director:['Develop the handoff\'s visual idea into frames that show something only this product has; never the category\'s first thought or a familiar ad layout.','The frame that proves each line shows the product doing it (the scene\'s proof, the direction\'s world); interfaces are simplified mockups built in code from the brand\'s components.','Each frame works alone within two seconds on a silent feed: one focal point, a clear reading order, what is offered and whose brand it is.','Scenes vary within the direction\'s system and never repeat one layout; design a square base and say how each format is recomposed.','Pictures only for the physical world, briefed as a precise shot; stand-ins for what the final renders in 3D or films.'],
 coder:['Implement the design\'s visual idea, way of making and per-scene plan, finished: everything the key frames name exists in code before you finish.','Render each scene\'s approved copy verbatim for the selected locale, hook, CTA and length, with a clear reading order; add no words.','Use the supplied product, logo, fonts and pictures as they are; build interfaces as simplified mockups from the brand\'s components; never redraw marks.','Recompose each format for its shape; copy never fights the subject.','Fix every hard finding the measurement reports; attached rendered views are the truth.'],
 critic:['Judge whether each frame works alone within two seconds: what is offered and whose ad it is.','The frame shows what its words say and proves its line with the product.','It looks like this direction\'s idea and the brand\'s own language, not a familiar or generic layout.','Each format is recomposed for its shape, with a precise, finished execution.','Rank notes P0, P1, P2, name the exact view, and never change approved words.'],
 designer:['Develop the direction\'s idea into finished frames that show something only this product has.','The hero frame proves the promise with the product in use; every other scene follows its decisions.','Each frame works alone within two seconds on a silent feed, with one focal point and a clear reading order.','Use the brand\'s own components, palette, type and files; interfaces are mockups built in code; never redraw marks.','Look before you change: name what a viewer reads and the weakest point, then fix that.'],
} as const;
