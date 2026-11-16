// Chat-shaped plan C5: the hero frame as a chat (designerVersion 4, stage H). The designer answers as it would in a
// chat: prose first (the idea, why it fits this brand and line, the way of making, what stops the scroll), then whole
// files in fenced code blocks with their paths, then at most one fenced `actions` block. The app answers like a person
// in a chat: the render, a short plain note of what it measured (observations), and what has arrived. Pure functions.
import {PICTURE_REFERENCES_DESIGNER} from './picture-references';
import {BRAND_SPIRIT} from './image-ideas';
import {z} from 'zod';
import type {Finding} from './layout-inspection';
import type {DirectionInput} from './types';
import {heroScene,usesEngineKit,heroMeaning} from './designer';

/** Blocks quoted with designerVersion 4: the hero frame is designed as a chat (stage H), then extended (stage E). */
export const heroChat=(input:Pick<DirectionInput,'brief'>)=>usesEngineKit(input)&&Number(input.brief.designerVersion)>=4;

const PATH=/^(?!\/)(?!.*\.\.)[\w-]+(?:\/[\w.-]+)*\.(?:tsx|ts|jsx|js|css|json|svg)$/;
export const pictureSchema=z.strictObject({purpose:z.string().min(1).max(600),prompt:z.string().min(1).max(4000),aspect:z.string().regex(/^\d{1,3}:\d{1,3}$/),
 references:z.array(z.string().min(1).max(120)).max(3).optional(),mustNotContain:z.array(z.string().min(1).max(300)).max(20).optional(),cutout:z.boolean().optional(),proxyFor:z.enum(['3d','video']).optional(),becomes:z.string().max(160).optional()});
export const heroActionsSchema=z.strictObject({render:z.boolean().optional(),review:z.boolean().optional(),pictures:z.array(pictureSchema).max(4).optional(),materials:z.array(z.strictObject({name:z.string().min(1).max(80),why:z.string().min(1).max(200)})).max(4).optional(),
 /** C8 follow-up: a 3D model of a picture it already has, when code cannot build that object (see the 3D mechanics). */
 models:z.array(z.strictObject({picture:z.string().min(1).max(80),why:z.string().min(1).max(200)})).max(2).optional()});
export type HeroActions=z.infer<typeof heroActionsSchema>;
/** Plan E4 (designerVersion 6): one exact edit of a file the designer already wrote. */
export type FileEdit={path:string;current:string;replacement:string;/** the block could not be read as an edit */problem?:string};
export type ChatAnswer<A>={prose:string;files:{path:string;source:string}[];/** version 6 only: exact edits, in the order written */edits?:FileEdit[];actions:A|null;actionsError?:string;raw:{actions?:string}};
export type HeroAnswer=ChatAnswer<HeroActions>;
export const parseHeroAnswer=(text:string):HeroAnswer=>parseChatAnswer(text,heroActionsSchema);

/** Reads an actions block as forgivingly as its meaning allows (bench run of 2026-11-14: a first build answer asked for
 * its photograph, a render and a material in one block; `materials` held a bare name and the picture an extra `id`, the
 * whole block was refused and the picture was asked a turn later). A material given as a bare name is that name; keys
 * the app does not know are dropped; a part that still does not read is reported, and the parts that do are carried out. */
function readActions<A>(raw:unknown,schema:z.ZodType<A>):{actions:A|null;error?:string}{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {actions:null,error:'block: it must be one JSON object'};
 const block={...(raw as Record<string,unknown>)};
 if(Array.isArray(block.materials))block.materials=block.materials.map(m=>typeof m==='string'?{name:m,why:'asked by name'}:m&&typeof m==='object'&&typeof (m as {name?:unknown}).name==='string'&&!(m as {why?:unknown}).why?{...m as object,why:'asked by name'}:m);
 const strip=(value:unknown,issues:z.core.$ZodIssue[],at:PropertyKey[]):unknown=>{
  const out=structuredClone(value);
  for(const issue of issues)if(issue.code==='unrecognized_keys'){let node=out as Record<PropertyKey,unknown>|undefined;for(const key of issue.path.slice(at.length))node=node?.[key] as Record<PropertyKey,unknown>|undefined;if(node&&typeof node==='object')for(const key of (issue as {keys:string[]}).keys)delete (node as Record<string,unknown>)[key];}
  return out;};
 const whole=schema.safeParse(block);if(whole.success)return {actions:whole.data};
 // An unknown key inside a part (an extra field of a picture) is dropped quietly; an unknown part is dropped and said,
 // because it may be something the designer expected to happen.
 const unknown=whole.error.issues.filter(i=>i.code==='unrecognized_keys'&&i.path.length===0).flatMap(i=>(i as {keys:string[]}).keys),said=unknown.length?`Unrecognized key${unknown.length===1?'':'s'} ${unknown.map(k=>`"${k}"`).join(', ')}: ignored`:undefined;
 const cleaned=strip(block,whole.error.issues,[]),second=schema.safeParse(cleaned);if(second.success)return {actions:second.data,...(said?{error:said}:{})};
 // Part by part: each top-level key on its own, so one unreadable part does not lose the others.
 const kept:Record<string,unknown>={},problems:string[]=[];
 for(const [key,value] of Object.entries(cleaned as Record<string,unknown>)){const one=schema.safeParse({[key]:value});if(one.success)kept[key]=value;else problems.push(...one.error.issues.slice(0,2).map(i=>`${i.path.join('.')||key}: ${i.message}`));}
 const partial=Object.keys(kept).length?schema.safeParse(kept):null;
 return {actions:partial?.success?partial.data:null,error:[...(said?[said]:[]),...problems.slice(0,3)].join('; ')||'it could not be read'};
}
/** Reads a chat answer. Files without a readable path and a malformed actions block are reported, never fatal. */
export function parseChatAnswer<A>(text:string,schema:z.ZodType<A>,options:{/** version 6: read ```edit blocks as exact edits */edits?:boolean}={}):ChatAnswer<A>{
 const fence=/```([^\n`]*)\n([\s\S]*?)```/g,files:{path:string;source:string}[]=[],edits:FileEdit[]=[],prose:string[]=[];let last=0,actionsText:string|undefined,m:RegExpExecArray|null;
 while((m=fence.exec(text))){
  const before=text.slice(last,m.index);last=m.index+m[0].length;
  const info=m[1].trim(),tokens=info.split(/\s+/).filter(Boolean),body=m[2];
  if(tokens[0]?.toLowerCase()==='actions'){prose.push(before);actionsText=body.trim();continue;}
  if(options.edits&&tokens[0]?.toLowerCase()==='edit'){
   prose.push(before);const path=tokens.slice(1).map(t=>t.replace(/^(?:path|file)=/,'').replace(/^["'`]|["'`]$/g,'')).find(t=>PATH.test(t))??'Frame.tsx',parts=body.split(/^={5,}[ \t]*\r?\n?/m);
   if(parts.length!==2)edits.push({path,current:'',replacement:'',problem:parts.length<2?'it has no line of ======= between the current text and its replacement':'it has more than one line of =======; write one edit per block'});
   else edits.push({path,current:parts[0].replace(/\r?\n$/,''),replacement:parts[1].replace(/\s+$/,'')});
   continue;}
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
 if(actionsText!==undefined){
  let raw:unknown;try{raw=JSON.parse(actionsText);}catch{actionsError='it is not valid JSON';}
  // Version 6: a finish description over its length is shortened by the app (live run of 15 November: a scene moment
  // of more than 200 characters cost a whole turn). These are the designer's own descriptions, not approved copy.
  if(actionsError===undefined&&options.edits)raw=fitFinish(raw);
  if(actionsError===undefined){const read=readActions(raw,schema);actions=read.actions;if(read.error)actionsError=read.error;}
 }
 return {prose:prose.join('').replace(/\n{3,}/g,'\n\n').trim(),files,...(options.edits?{edits}:{}),actions,...(actionsError?{actionsError}:{}),raw:actionsText!==undefined?{actions:actionsText}:{}};
}
const clipWords=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length<=max)return v;const cut=v.slice(0,max-1),at=cut.lastIndexOf(' ');return `${(at>max*0.6?cut.slice(0,at):cut).trimEnd()}…`;};
/** The finish block's descriptions inside their lengths (moment 200, motion 240, sound 200, intent 4000). */
export function fitFinish(raw:unknown):unknown{
 const finish=(raw as {finish?:{intent?:unknown;scenes?:unknown}}|null)?.finish;if(!finish||typeof finish!=='object'||!Array.isArray(finish.scenes))return raw;
 return {...(raw as object),finish:{...finish,intent:clipWords(finish.intent,4000),scenes:finish.scenes.map(x=>x&&typeof x==='object'?{...x,...('moment' in x?{moment:clipWords((x as {moment:unknown}).moment,200)}:{}),...('motion' in x?{motion:clipWords((x as {motion:unknown}).motion,240)}:{}),...('sound' in x?{sound:clipWords((x as {sound:unknown}).sound,200)}:{})}:x)}};
}
/** Plan E4 (designerVersion 6): later answers send exact edits instead of whole files. */
export const usesEdits=(input:Pick<DirectionInput,'brief'>)=>heroMeaning(input);
const nearest=(source:string,wanted:string)=>{
 const lines=source.split('\n'),first=wanted.split('\n').map(l=>l.trim()).find(Boolean)??'';if(!first||!lines.length)return '';
 const score=(l:string)=>{const t=l.trim();if(t===first)return 1e6;let n=0;while(n<t.length&&n<first.length&&t[n]===first[n])n++;return n;};
 let best=0;for(let i=1;i<lines.length;i++)if(score(lines[i])>score(lines[best]))best=i;
 if(score(lines[best])<4)return '';
 return lines.slice(Math.max(0,best-1),best+2).map(l=>l.slice(0,160)).join('\n');
};
/** Applies exact edits in order to the files as they stand (plan E4b). An edit whose current text is not in its file
 * exactly once is refused with a one-line correction that quotes the nearest current lines; the other edits of the
 * answer still apply. Returns the files that changed, whole, and what was refused. */
export function applyEdits(files:{path:string;source:string}[],edits:FileEdit[]):{changed:{path:string;source:string;edits:number}[];refused:string[]}{
 const now=new Map(files.map(f=>[f.path,f.source])),count=new Map<string,number>(),refused:string[]=[];
 for(const e of edits){
  const source=now.get(e.path);
  if(e.problem){refused.push(`An edit to ${e.path} was not applied: ${e.problem}.`);continue;}
  if(source===undefined){refused.push(`An edit to ${e.path} was not applied: there is no such file yet; write it whole.`);continue;}
  if(!e.current.trim()){refused.push(`An edit to ${e.path} was not applied: its current text is empty.`);continue;}
  const hits=source.split(e.current).length-1;
  if(hits===1){now.set(e.path,source.replace(e.current,()=>e.replacement));count.set(e.path,(count.get(e.path)??0)+1);continue;}
  const near=hits===0?nearest(source,e.current):'';
  refused.push(hits===0?`An edit to ${e.path} was not applied: its current text is not in the file as written${near?`. The nearest lines in the file now:\n${near}`:'.'}`:`An edit to ${e.path} was not applied: its current text is in the file ${hits} times; include more of the text around it so it is found once.`);
 }
 return {changed:[...count.entries()].map(([path,n])=>({path,source:now.get(path)!,edits:n})),refused};
}
/** The one-line correction for a malformed actions block: the files of that answer were applied. */
export const actionsCorrection=(reason:string)=>`Your actions block could not be read (${reason}); your files were applied. If you need it, write it again as JSON, for example {"render":true}, {"review":true}, {"pictures":[{"purpose":"…","prompt":"…","aspect":"4:5"}]} or {"materials":[{"name":"…","why":"…"}]}.`;

/** Stage H: only these stop the hero frame; everything else is an observation the designer weighs against its idea. */
export const STAGE_H_HARD=new Set(['COPY_MISSING','RENDER_ERROR','LOGO_MISSING','LOGO_LOW_CONTRAST','FONT_NOT_BRAND','IMAGE_NOT_LOADED']);
export const stageHFindings=<F extends Pick<Finding,'code'|'severity'>>(findings:F[]):F[]=>findings.map(f=>({...f,severity:STAGE_H_HARD.has(f.code)?'hard':'soft'}));

/** The app's next message after a render: what it measured, written as observations. */
export function renderNote(findings:Pick<Finding,'severity'|'detail'|'view'>[],views:number){
 const hard=findings.filter(f=>f.severity==='hard'),soft=findings.filter(f=>f.severity!=='hard');
 return [`Here is the hero frame as it rendered (${views} view${views===1?'':'s'} attached).`,
  hard.length?`Must fix:\n${hard.slice(0,8).map(f=>`- ${f.detail}`).join('\n')}`:'Nothing must be fixed.',
  soft.length?`Measured, for you to weigh against your idea (a deliberate choice stays; say so in your prose):\n${soft.slice(0,12).map(f=>`- ${f.detail}`).join('\n')}`:''].filter(Boolean).join('\n\n');
}

/** The hero scene's brief as data: what it must make the viewer understand (the script's words), what proves it, and its
 * approved words in the reference copy. Used by the version 6 hero task and by the timeline's "Key frame brief". */
export function heroBrief(input:DirectionInput){
 const hero=heroScene(input),index=input.storyboard.findIndex(s=>s.id===hero),scene=input.storyboard[index],reference=input.variants[0];
 const format=input.formats.find(f=>f.id===reference?.format)??input.formats[0],lines=(reference?input.variantFacts?.[reference.id]?.sceneCopy[hero]:undefined)??scene?.copy??[];
 return {number:index+1,of:input.storyboard.length,format,locale:reference?.locale,meaning:scene?.visualNotes.replace(/\s+/g,' ').slice(0,400)??'',proof:scene?.proof??'',lines};
}
/** The timeline's line when a version 6 hero stage starts. */
export function heroBriefLine(input:DirectionInput){
 const b=heroBrief(input);
 return `Key frame brief: what this scene must say. ${b.meaning}${b.proof?` Proof: ${b.proof}`:''} Words: ${b.lines.length?b.lines.map(l=>`"${l}"`).join(' / '):'none'}`.slice(0,900);
}
/** Version 6: a device the brand's own kit names is the brand's. The general advice of the skills against added
 * depth, gloss and gradients is about devices a brand does not own; without this sentence a brand whose identity is a
 * glossy mark or a gradient was steered away from its own identity (bench runs of 15 November). */
export const BRAND_DEVICES_DESIGNER=`THE BRAND'S OWN DEVICES
A finish, a material, a gradient, a shape or a mark that the brand's own kit names is this brand's: use it with confidence, as the kit describes it. What your skills say against depth, gloss, glows or gradients added to make a frame look finished is about devices the brand does not own.`;
/** Version 6 (live run 4): a device keeps the role and the scale the brand gives it. */
/** The owner, 16 November: frames read "as if there were a ban on spaces and visuals with volume". There is none: the
 * skills argue against depth faked over flat shapes, and the designer read that as a rule for flatness; it also asked
 * for empty grounds and laid the subject over them in code. This only removes the misreading; it prefers no way. */
export const SPACE_DESIGNER='No way of making is forbidden. What your skills say against depth is about glows, blurs and shadows laid over flat shapes to make them look finished; it is not about real space, volume or light. When a picture carries the idea, ask for the whole of it, with its subject in it, and not for an empty ground to lay the subject over in code.';
export const DEVICE_USE_DESIGNER='Use each of the brand\'s devices in the role and at the scale its own materials give it; where the brand pack lists DEVICES IN USE, follow that, and where it says "not stated", choose the role yourself and say which.';
/** Plan E4c (version 6): the edit format, said once in the hero task and once in the stage E opening. */
export const EDITS_NOTE=`CHANGING A FILE YOU HAVE WRITTEN
Your first build writes each file whole. After that, change a file with edits, not by writing it again: one fenced block per edit, opened with \`\`\`edit and the file's path, holding the exact current text, then a line of =======, then the text that replaces it. The current text must be in the file exactly as you quote it, and only once: quote enough of it to be found once. Edits are applied in the order you write them. Write a file whole again only when most of it changes.`;
const HERO_CODE_NOTE=(pictures:string)=>`WHAT YOUR CODE CAN USE
Frame.tsx default-exports one React component with props {width,height} that draws this frame at exactly that size. From './brand': brand.tokens (the accepted rules as strings), brand.logos (draw one with <Img src={staticFile(logo.url)} data-brand-logo={logo.id}/>), resources (pictures you asked for, by the id the app gives you). The brand's fonts are loaded by family name. './kit' has optional helpers (fitText, measure, contrast); './kit3d' draws a code-built 3D object or scene (ask for the material kit-3d to see how). Any CSS, SVG, masks, blend modes and filters work. Do not write a previewOptions export for this frame: the app lists the variations itself.

PICTURES IN CODE
Every picture file is drawn the same way: <Img src={staticFile(url)}/>. The url of a picture you asked for is resources[id].url (resources[id].cutoutUrl for its cutout, when it has one); the url of a supplied file is given with its name under SUPPLIED FILES; the url of a brand picture marked "use it" is given with it under BRAND IN CODE; the url of a logo is brand.logos[n].url. Only these files load. A picture that does not load is reported with the render.${pictures}

Answer as you would in a chat: first your idea in prose, then the complete files in fenced code blocks with their paths (\`\`\`tsx Frame.tsx), then, if you need it, one fenced actions block with JSON: {"render":true} to see it, {"pictures":[…]} to ask for pictures (purpose, prompt, aspect, references by file name, cutout), {"materials":[…]} to look at brand materials by name, {"review":true} when the frame is finished. Every change of code is rendered for you.

${EDITS_NOTE}`;
/** Version 6: the hero review also sees the frame at the size it has in a feed, so the checks that name thumbnail
 * size are judged on a picture, not imagined from the full-size render. */
export const HERO_THUMBNAIL_SIDE=180;
export const HERO_THUMBNAIL_LABEL='The same hero frame at thumbnail size, as it appears in a feed';
/** Plan E5: the timeline's line while a hero render waits for its pictures. */
export const pictureWaitLine=(pictures:number,holdMs:number)=>`Waiting for ${pictures===1?'the picture':`${pictures} pictures`} for the key frame (up to ${Math.round(holdMs/1000)} s).`;
/** Plan E5: the bound of the picture hold as the task states it (apps/local-runner/director/hero-chat-loop.ts). */
export const PICTURE_HOLD_SECONDS=180;
/** Version 6 (plan E1b): the task names the scene's meaning, its proof and its words; nothing from planning says what
 * the frame looks like. `pictures` is the approved number of pictures for the direction, when the caller knows it. */
function heroTaskV6(input:DirectionInput,o:{pictures?:number}){
 const b=heroBrief(input),p=o.pictures;
 const ids=input.resourceIds.slice(0,Math.min(p??0,4));
 const pictures=p===undefined?'':p>0?`\n\nPICTURES\nYou may ask for up to ${p} picture${p===1?'':'s'} in this direction, for all its scenes together.${ids.length?` In the order you ask, they are ${ids.map(id=>`resources['${id}']`).join(', ')}.`:''} When an answer asks for a picture and changes the code, its render waits for the picture (up to about ${Math.round(PICTURE_HOLD_SECONDS/60)} minutes), so you see the frame with the picture in place: ask for the pictures this frame needs in the same answer as the code that draws them.`:'\n\nPICTURES\nNo pictures are approved for this direction: build everything in code and from the supplied files.';
 return `THE HERO FRAME
Make Scene ${b.number} of ${b.of} as one finished frame in ${b.format?`${b.format.width}×${b.format.height}`:'the reference format'}. This frame alone, in this one size, with these words; the other scenes, formats and variations come after it is accepted.
What it must make the viewer understand: ${b.meaning}${b.proof?`\nWhat proves it: ${b.proof}`:''}
Its approved words${b.locale?` (${b.locale})`:''}, exactly as written, nothing added: ${b.lines.length?b.lines.map(l=>`"${l}"`).join(' / '):'none'}
What the frame shows is yours to decide.

${BRAND_SPIRIT}
${SPACE_DESIGNER}

${BRAND_DEVICES_DESIGNER}
${DEVICE_USE_DESIGNER}
${PICTURE_REFERENCES_DESIGNER}

${HERO_CODE_NOTE(pictures)}`;
}
/** The first message of stage H: the task, the hero's words and what the code can use. Scenes by name only. */
export function heroTask(input:DirectionInput,o:{pictures?:number}={}){
 if(heroMeaning(input))return heroTaskV6(input,o);
 const hero=heroScene(input),index=input.storyboard.findIndex(s=>s.id===hero),scene=input.storyboard[index],reference=input.variants[0];
 const format=input.formats.find(f=>f.id===reference?.format)??input.formats[0],lines=(reference?input.variantFacts?.[reference.id]?.sceneCopy[hero]:undefined)??scene?.copy??[];
 return `THE HERO FRAME
Make Scene ${index+1} of ${input.storyboard.length} as one finished frame in ${format?`${format.width}×${format.height}`:'the reference format'}: ${scene?.visualNotes.replace(/\s+/g,' ').slice(0,400)??''}${scene?.proof?`\nWhat proves its line: ${scene.proof}`:''}
Its approved words${reference?` (${reference.locale})`:''}, exactly as written, nothing added: ${lines.length?lines.map(l=>`"${l}"`).join(' / '):'none'}

WHAT YOUR CODE CAN USE
Frame.tsx default-exports one React component with props {width,height} that draws this frame at exactly that size. From './brand': brand.tokens (the accepted rules as strings), brand.logos (draw one with <Img src={staticFile(logo.url)} data-brand-logo={logo.id}/>), resources (pictures you asked for, by the id the app gives you). The brand's fonts are loaded by family name. './kit' has optional helpers (fitText, measure, contrast); './kit3d' draws a code-built 3D object or scene (ask for the material kit-3d to see how). Any CSS, SVG, masks, blend modes and filters work. Do not write a previewOptions export for this frame: the app lists the variations itself.

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
