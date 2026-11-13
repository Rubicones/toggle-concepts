/**
 * director@1 role briefs. They replace the planning-era role texts (SceneSpec, slots, "code is never executed") for the
 * three creative roles of an approved director block; the detailed protocol instructions are sent alongside.
 */
export const directorRoleInstructions={
 director:'ROLE: Film director and designer of this advertisement. You decide the idea of every shot, all layers, typography, framing, camera, motion, transitions, rhythm and how each format is recomposed. You are not filling a template. Follow the protocol instructions and the response schema exactly.',
 assembler:'ROLE: Senior creative coder and motion designer. You implement the director\'s film as real, running Remotion code (React/TSX, CSS, SVG, canvas, GSAP via the frame-scrubbed timeline, Three.js via @remotion/three) and you verify it with the provided tools until every objective check passes. Your code is compiled, rendered and checked. Follow the protocol instructions and the tool schema exactly.',
 critic:'ROLE: Demanding art director and motion-design critic. You look at real rendered frames and judge whether the ad works as a film in every format, then route precise notes to the director (idea, staging, rhythm) or the coder (spacing, timing, readability). Follow the protocol instructions and the response schema exactly.',
} as const;
export const directorRoleLabels={director:'Creative direction',assembler:'Animation and code',critic:'Creative review'} as const;

export const staticRoleInstructions={director:'ROLE: Film & art director of pre-final Hero Styleframes for a motion advertisement. Design rich layers, staging and format adaptations; describe motion choreography for the next stage. Follow the static protocol and approved facts.',assembler:'ROLE: Creative layout coder. Write executable Frame.tsx first, rendering generated images (including proxy stills), official SVG/image logos, and rich CSS/SVG craft across continuous responsive ratios and ready options. Repair source errors and follow AD notes. No runtime motion, video or Three.js in drafts.',critic:'ROLE: Art director reviewing static key frames in every format before the AD. Judge concept clarity, legibility, hierarchy, brand-specific craft and format adaptation from real views and measurements; route notes to director or coder. Motion is for a later stage.'} as const;
/** D1 (owner's answer to D0): the version 4 designer's own role line, in runs with skills by stage. */
export const DESIGNER_ROLE_V4='ROLE: The designer of this ad. You turn its approved idea and words into finished frames in code, one conversation from the hero frame to every scene, format and variation; every visual decision is yours.';
/** The role line a designer request sends in place of its frozen instructions: the version 4 designer's own line in
 * shared Local runs with skills by stage; undefined otherwise (and for a request already admitted, which keeps its own). */
export function designerRoleLine(a:{role:string;heroChat:boolean;prior:boolean;mode:string|null|undefined;contextMode:string|null|undefined;stageSkills:boolean}):string|undefined{
 return a.role==='designer'&&a.heroChat&&!a.prior&&a.mode==='local_claude'&&a.contextMode==='shared'&&a.stageSkills?DESIGNER_ROLE_V4:undefined;
}
/** The frozen-config rule of app_private.reserve_step_before_creative, in the part the runner can see: a request is
 * admitted only with its agent's frozen instructions and a step cap within the agent's (CHECKPOINT_CONFIG_MISMATCH).
 * Returns the problem in plain words, or null. */
export function frozenAdmissionProblem(snapshot:{instructions?:unknown;stepCapMicroUsd?:unknown},agent:{role:string;instructions:string;step_cap_micro_usd:number}):string|null{
 if(snapshot.instructions!==agent.instructions)return `the request's instructions differ from the frozen ${agent.role} agent's.`;
 const cap=Number(snapshot.stepCapMicroUsd);if(!Number.isFinite(cap)||cap<1||cap>agent.step_cap_micro_usd)return `the request's step cap is outside the frozen ${agent.role} agent's.`;
 return null;
}
export const staticOutputCaps={director:12000,assembler:8000,critic:8000} as const;
/** Role effort (brief.effortVersion 1): thinking counts toward the output limit, so draft roles at high effort get room
 * for both the thinking and the answer. Earlier blocks keep staticOutputCaps. */
export const thinkingOutputCaps={director:32000,assembler:32000,critic:16000} as const;
