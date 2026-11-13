// Chat-shaped plan C5: the hero frame as a chat (designerVersion 4, stage H). The designer answers as it would in a
// chat: prose first (the idea, why it fits this brand and line, the way of making, what stops the scroll), then whole
// files in fenced code blocks with their paths, then at most one fenced `actions` block. The app answers like a person
// in a chat: the render, a short plain note of what it measured (observations), and what has arrived. Pure functions.
import {z} from 'zod';
import type {Finding} from './layout-inspection';
import type {DirectionInput} from './types';
import {heroScene,usesEngineKit} from './designer';

/** Blocks quoted with designerVersion 4: the hero frame is designed as a chat (stage H), then extended (stage E). */
export const heroChat=(input:Pick<DirectionInput,'brief'>)=>usesEngineKit(input)&&Number(input.brief.designerVersion)>=4;

const PATH=/^(?!\/)(?!.*\.\.)[\w-]+(?:\/[\w.-]+)*\.(?:tsx|ts|jsx|js|css|json|svg)$/;
export const pictureSchema=z.strictObject({purpose:z.string().min(1).max(600),prompt:z.string().min(1).max(4000),aspect:z.string().regex(/^\d{1,3}:\d{1,3}$/),
 references:z.array(z.string().min(1).max(120)).max(3).optional(),mustNotContain:z.array(z.string().min(1).max(300)).max(20).optional(),cutout:z.boolean().optional(),proxyFor:z.enum(['3d','video']).optional(),becomes:z.string().max(160).optional()});
export const heroActionsSchema=z.strictObject({render:z.boolean().optional(),review:z.boolean().optional(),pictures:z.array(pictureSchema).max(4).optional(),materials:z.array(z.strictObject({name:z.string().min(1).max(80),why:z.string().min(1).max(200)})).max(4).optional()});
export type HeroActions=z.infer<typeof heroActionsSchema>;
export type ChatAnswer<A>={prose:string;files:{path:string;source:string}[];actions:A|null;actionsError?:string;raw:{actions?:string}};
export type HeroAnswer=ChatAnswer<HeroActions>;
export const parseHeroAnswer=(text:string):HeroAnswer=>parseChatAnswer(text,heroActionsSchema);

/** Reads a chat answer. Files without a readable path and a malformed actions block are reported, never fatal. */
export function parseChatAnswer<A>(text:string,schema:z.ZodType<A>):ChatAnswer<A>{
 const fence=/```([^\n`]*)\n([\s\S]*?)```/g,files:{path:string;source:string}[]=[],prose:string[]=[];let last=0,actionsText:string|undefined,m:RegExpExecArray|null;
 while((m=fence.exec(text))){
  const before=text.slice(last,m.index);last=m.index+m[0].length;
  const info=m[1].trim(),tokens=info.split(/\s+/).filter(Boolean),body=m[2];
  if(tokens[0]?.toLowerCase()==='actions'){prose.push(before);actionsText=body.trim();continue;}
  const named=tokens.map(t=>t.replace(/^(?:path|file|title)=/,'').replace(/^["'`]|["'`]$/g,'')).find(t=>PATH.test(t));
  // A path on the line just before the block ("Frame.tsx:", "**Frame.tsx**", "`Frame.tsx`").
  const lead=before.trim().split('\n').at(-1)?.replace(/[*`:#]/g,'').trim().split(/\s+/).at(-1)??'';
  const path=named??(PATH.test(lead)?lead:/^(tsx|ts|jsx|js)$/i.test(tokens[0]??'')&&!files.some(f=>f.path==='Frame.tsx')?'Frame.tsx':undefined);
  // The path line itself is not prose.
  prose.push(!named&&path===lead&&PATH.test(lead)?before.replace(/[^\n]*\s*$/,''):before);
  if(path)files.push({path,source:body.replace(/\s+$/,'')+'\n'});else prose.push(m[0]);
 }
 prose.push(text.slice(last));
 let actions:A|null=null,actionsError:string|undefined;
 if(actionsText!==undefined){try{actions=schema.parse(JSON.parse(actionsText));}catch(error){actionsError=error instanceof SyntaxError?'it is not valid JSON':error instanceof z.ZodError?error.issues.slice(0,3).map(i=>`${i.path.join('.')||'block'}: ${i.message}`).join('; '):'it could not be read';}}
 return {prose:prose.join('').replace(/\n{3,}/g,'\n\n').trim(),files,actions,...(actionsError?{actionsError}:{}),raw:actionsText!==undefined?{actions:actionsText}:{}};
}
/** The one-line correction for a malformed actions block: the files of that answer were applied. */
export const actionsCorrection=(reason:string)=>`Your actions block could not be read (${reason}); your files were applied. If you need it, write it again as JSON, for example {"render":true}, {"review":true}, {"pictures":[{"purpose":"…","prompt":"…","aspect":"4:5"}]} or {"materials":[{"name":"…","why":"…"}]}.`;

/** Stage H: only these stop the hero frame; everything else is an observation the designer weighs against its idea. */
export const STAGE_H_HARD=new Set(['COPY_MISSING','RENDER_ERROR','LOGO_MISSING','LOGO_LOW_CONTRAST','FONT_NOT_BRAND']);
export const stageHFindings=<F extends Pick<Finding,'code'|'severity'>>(findings:F[]):F[]=>findings.map(f=>({...f,severity:STAGE_H_HARD.has(f.code)?'hard':'soft'}));

/** The app's next message after a render: what it measured, written as observations. */
export function renderNote(findings:Pick<Finding,'severity'|'detail'|'view'>[],views:number){
 const hard=findings.filter(f=>f.severity==='hard'),soft=findings.filter(f=>f.severity!=='hard');
 return [`Here is the hero frame as it rendered (${views} view${views===1?'':'s'} attached).`,
  hard.length?`Must fix:\n${hard.slice(0,8).map(f=>`- ${f.detail}`).join('\n')}`:'Nothing must be fixed.',
  soft.length?`Measured, for you to weigh against your idea (a deliberate choice stays; say so in your prose):\n${soft.slice(0,12).map(f=>`- ${f.detail}`).join('\n')}`:''].filter(Boolean).join('\n\n');
}

/** The first message of stage H: the task, the hero's words and what the code can use. Scenes by name only. */
export function heroTask(input:DirectionInput){
 const hero=heroScene(input),index=input.storyboard.findIndex(s=>s.id===hero),scene=input.storyboard[index],reference=input.variants[0];
 const format=input.formats.find(f=>f.id===reference?.format)??input.formats[0],lines=(reference?input.variantFacts?.[reference.id]?.sceneCopy[hero]:undefined)??scene?.copy??[];
 return `THE HERO FRAME
Make Scene ${index+1} of ${input.storyboard.length} as one finished frame in ${format?`${format.width}×${format.height}`:'the reference format'}: ${scene?.visualNotes.replace(/\s+/g,' ').slice(0,400)??''}${scene?.proof?`\nWhat proves its line: ${scene.proof}`:''}
Its approved words${reference?` (${reference.locale})`:''}, exactly as written, nothing added: ${lines.length?lines.map(l=>`"${l}"`).join(' / '):'none'}

WHAT YOUR CODE CAN USE
Frame.tsx default-exports one React component with props {width,height} that draws this frame at exactly that size. From './brand': brand.tokens (the accepted rules as strings), brand.logos (draw one with <Img src={staticFile(logo.url)} data-brand-logo={logo.id}/>), resources (pictures you asked for, by the id the app gives you). The brand's fonts are loaded by family name. './kit' has optional helpers (fitText, measure, contrast). Any CSS, SVG, masks, blend modes and filters work.

Answer as you would in a chat: first your idea in prose, then the complete files in fenced code blocks with their paths (\`\`\`tsx Frame.tsx), then, if you need it, one fenced actions block with JSON: {"render":true} to see it, {"pictures":[…]} to ask for pictures (purpose, prompt, aspect, references by file name, cutout), {"materials":[…]} to look at brand materials by name, {"review":true} when the frame is finished. Every change of code is rendered for you.`;
}

export const STAGE_H_INSTRUCTIONS=`You are the designer of one advertising direction. Right now you make one frame: the hero frame, the moment that proves the promise. Make it the way you would in a conversation with an art director: think, decide, draw, look, refine.

What matters, in this order:
1. It stops the scroll. In the first half second a viewer on a busy feed sees something they did not expect and wants to look closer. A frame that is merely tidy has failed.
2. It carries one idea. One clear visual thought that makes the line true, specific to this product and this brand. If the frame would still work after swapping the logo for another one, the idea is not there yet.
3. It belongs to this brand. Read the brand character, the compact sheet and the rules as a character, not a checklist: its temperament, its signature, its proportions of colour, how it speaks. Build with them; never imitate their layout.
4. It is crafted. Type set with intent: scale, weight, rhythm and contrast that make the words land in order. A composition with a real hierarchy and a real focal point. Space used on purpose. Pictures that look made, not found.

Invent your own visual language for this direction. Do not reach for a familiar arrangement because it is safe; ask what only this idea could look like, then commit to it. Large, cropped, overlapping or unusual can be right when the idea asks for it; say so, and keep the approved words readable.

Choose the way of making on purpose. Every means is open: a photograph, a rendered 3D object or scene, graphics and type built in code, an interface built in code or shown on a device, an infographic made from the product's real figures, gradients and light as surfaces, a collage of cutouts and type, or a mix. Pick it from the idea and the brand's character, never because it is the easiest to build. A physical subject — the product, people, hands, places, materials — is usually a photograph or a rendered object you ask for as a picture: brief it as a precise shot (situation, composition, subject position, camera, light, ground, materials, colour, what is absent), never with adjectives, and never with words, numbers, interfaces or logos inside it. Interfaces, data and diagrams are built in code from the brand's own components and the product's real structure. The product, the logo and the brand's marks are used as supplied, never redrawn.

The words are the approved ones, exactly, and nothing else is written except text that belongs inside a depicted product or interface.

Work like this. Write your thinking first: the idea, why it is right for this brand and this line, the way of making, and what makes it stop the scroll. Then the complete files. You will see each render with what was measured. Look at it as a viewer would: what is read first, second and third, and what is weakest. Change what serves the idea; a measured observation that your idea deliberately breaks can stay when you say why. When the frame is the best you can make it, ask for its review; the reviewer's notes come back to you, and you decide how to answer them in the work.`;

/** Stage H's hero review (designerVersion 4): idea and craft first, then the hard findings; a separate request with no
 * designer history, reading the brand pack and the digest. */
export const HERO_CRITIC_INSTRUCTIONS=`You review one hero frame of an advertising direction: the frame every other scene will follow. You see it rendered, with the direction in short and what was measured. Judge in this order: does it stop the scroll in the first half second; is there one clear idea that makes the line true and could only belong to this brand and product; is it crafted (type, hierarchy, focal point, space, picture quality, the brand's character); then the measured problems that must be fixed (approved words missing, a render error, the logo missing or unreadable, text not in a brand font). Accept the frame when it is strong and nothing must be fixed. Otherwise give at most five notes, most important first, each naming what you see and what it should achieve; never prescribe a layout, a style or an example, and never ask to make it safer or more conventional. Write notes for the designer (recipient director). Answer only in the requested format.`;

/** The hero review's context as plain text: the direction in short, the hero's words and the measured findings. */
export function heroReviewContext(digest:string,findings:{severity:string;detail:string}[]){
 const hard=findings.filter(f=>f.severity==='hard');
 return `${digest}\n\nMEASURED IN THE RENDER\n${hard.length?hard.slice(0,10).map(f=>`- must fix: ${f.detail}`).join('\n'):'- nothing that must be fixed'}${findings.length>hard.length?`\n- ${findings.length-hard.length} other observation${findings.length-hard.length===1?'':'s'} for the designer to weigh`:''}`;
}
