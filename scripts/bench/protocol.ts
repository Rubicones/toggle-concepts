// Bench protocol: what the designer is told and how its answer is read. The lean version of the designer's work:
// a small creative part on top of the engine kit, the hero frame first, tagged text instead of JSON.
// Principles only: no layouts, example styles or brand names live here.
import type {SkillFile} from '../../packages/agents/skill-files';
import type {DirectionInput} from '../../packages/director/types';
import type {BenchBrand} from './brands';

const KIT=`ENGINE KIT ('./kit', read-only). Mechanics only; everything visible is yours.
- stage(width,height) -> {W,H,u,shape,pick,byRatio}. u = 1/100 of the shorter side: write sizes as multiples of u. shape = 'square'|'portrait'|'tall'|'wide'. pick({base, tall?, wide?, portrait?, square?}) = a value per shape. byRatio(atTall,atWide) = a number that changes smoothly with the proportion.
- fitText(text | lines[], {width,height?,maxLines?}, {family,weight?,italic?,tracking?,uppercase?,max,min,lineHeight?}) -> {size,lines,widths,width,height,fits}. The largest size between max and min at which the words fit the box, measured with the real font. A string is broken into lines by sense; an array keeps its lines. widths = each line's measured width (for shapes that hug a line). fits=false means the composition must change for this case.
- measure(text,{family,weight,...},size) -> width in px.
- selected(props,{variants,variantFacts}) -> {variant, lines(sceneId)}: the approved words of the selected variation.
- contrast(a,b), readableOn(ground,[candidates]) for #rrggbb colours.
- useFonts(): call once at the top of Frame, so measuring uses the brand fonts.`;

const FILES=`FILES. You write Frame.tsx (and, if it helps, small modules next to it). Frame.tsx default-exports one pure React component with props {width,height,format,locale,hook,cta,length,sceneId,moment} that draws the scene named by sceneId at exactly width x height px (a root element of that size, overflow hidden). Also export a literal: export const previewOptions={hooks:[...],ctas:[...],locales:[...],lengths:[...],scenes:[...],adaptive:true} naming every ordered value.
Imports allowed: react (no state, effects or timers of your own), remotion (Img, staticFile, AbsoluteFill), './brand', './kit'. From './brand': brand.tokens (a flat record: brand.tokens['colour.x'] is a string), brand.fonts (already loaded under their family names), brand.logos, variants, variantFacts, resources. The logo is <Img src={staticFile(logo.url)} data-brand-logo={logo.id}/>; an SVG logo takes its colour from the CSS color of its box. Never redraw or restyle the logo.
Every word shown comes from selected(props,...).lines(sceneId), verbatim, for every locale and hook: never type copy into the code. Words inside a depicted object (a label on a product, a number on a door) are props, not copy: allowed when they are not a claim, price or call to action.
Statics only: no animation.`;

const ANSWER=`ANSWER FORMAT. Plain text with tags, nothing else:
<say>Two or three sentences: the idea of the frame and what you changed this turn.</say>
<file path="Frame.tsx">
...the whole file...
</file>
<render scene="scene-id" formats="square,vertical"/>
<done/>   only when every scene works in every format, locale and hook
Send a file whole each time you change it; do not resend unchanged files. Name in <render> the scene and the formats you want to see next (at most four formats). No markdown fences, no JSON.`;

const WORK=`HOW YOU WORK. You are the designer and the builder of an advertising engine for one brand: one design that renders every ordered scene, format, language and hook as data.
1. Idea first. Before code, decide the one visual idea: something only this product and this brand could do, that makes the words land harder than the words alone. A reader gives the frame two seconds on a silent feed. If the idea is the category's first thought, find another.
2. Hero frame first. Your first answer builds only the hero scene, finished, in the reference format. You then see its render and the measured findings. Fix what is weak. Do not start other scenes until the hero frame is one you would sign.
3. Then extend: the other scenes in the same system (each its own composition, never one layout repeated), then every format as its own composition of the same idea, never a squeezed copy. Languages and hooks are data: the same code must hold the longest and the shortest words.
4. Look before you change. When a render is attached, say what a viewer reads first, second, third and name the weakest point; then fix that.
The measured findings (clipping, overlap, small text, safe area, contrast) are facts: fix every hard one.
Keep the code small: shared pieces written once, one set of rules, per scene only what differs.`;

/** The cached part of every request: how to work, the craft skills, the kit, the file rules, the answer format. */
export function benchInstructions(skills:SkillFile[]){
 return [WORK,'CRAFT KNOWLEDGE\n'+skills.map(s=>`## ${s.title}\n${s.text.trim()}`).join('\n\n'),KIT,FILES,ANSWER].join('\n\n');
}

const tokenLines=(tokens:Record<string,string|number>)=>Object.entries(tokens).map(([k,v])=>`- ${k}: ${v}`).join('\n');

/** The first message: the brand as a character, the product, the words, the formats. Nothing else. */
export function benchBrief(brand:BenchBrand,input:DirectionInput,mode:'client'|'propose',pictures:'none'|'ask'='none'){
 const locales=[...new Set(input.variants.map(v=>v.locale))],hooks=Object.keys(brand.hooks),reference=input.variants[0];
 const copy=brand.scenes.map(s=>`${s.id} (${s.notes})\n`+hooks.map(h=>locales.map(l=>`  ${h} / ${l}: ${(input.variantFacts?.[`square.${l}.${h}`]?.sceneCopy[s.id]??[]).map(x=>`"${x}"`).join(' | ')}`).join('\n')).join('\n')).join('\n');
 return [
  `BRAND: ${brand.name} — ${brand.category}`,
  `CHARACTER\n${brand.character}`,
  `BRAND TOKENS (brand.tokens)\n${tokenLines(brand.tokens)}`,
  `FONTS (loaded): ${brand.fonts.map(f=>`"${f.family}" ${f.weight}${f.style==='italic'?' italic':''}`).join(', ')}. LOGO: brand.logos[0] (SVG, takes currentColor).`,
  `PRODUCT\n${brand.product}\nOFFER: ${brand.offer}\nAUDIENCE: ${brand.audience}`,
  `HOOKS: ${hooks.map(h=>`${h} = ${brand.hooks[h]}`).join('; ')}`,
  mode==='client'
   ?`THE WORDS ARE THE CLIENT'S: keep every line verbatim, invent the visual that makes them land. Lines of the last scene end with the call to action.`
   :`THE WORDS WERE PROPOSED TOGETHER WITH THE VISUAL: keep the approved lines verbatim; the visual must complete the line (the line alone or the picture alone should say less than both).`,
  `APPROVED COPY (already in variantFacts; shown here so you can design for the longest and the shortest)\n${copy}`,
  `FORMATS: ${input.formats.map(f=>`${f.id} ${f.width}x${f.height} (min text ${f.minTextPx}px; safe area left ${Math.round(f.safe.left)} right ${Math.round(f.safe.right)} top ${Math.round(f.safe.top)} bottom ${Math.round(f.safe.bottom)})`).join('; ')}. Reference: ${reference.format}, ${reference.locale}, hook ${reference.hook}.`,
  `SCENES: ${input.storyboard.map(s=>s.id).join(', ')}. Hero scene: ${heroScene(input)}.`,
  `PREVIEW OPTIONS, exactly: export const previewOptions=${JSON.stringify({hooks,ctas:[...new Set(input.variants.map(v=>v.cta))],locales,lengths:[...new Set(input.variants.map(v=>v.length))],scenes:input.storyboard.map(s=>s.id),adaptive:true})};`,
  pictures==='none'
   ?`PICTURES: none in this pass. Everything is made in code: type, colour, the brand's own graphic devices, drawn shapes. Do not fake a photograph or draw a stand-in for one.`
   :`PICTURES: you may ask for up to ${input.resourceIds?.length??3} generated pictures of things from the physical world: <picture id="${input.resourceIds?.[0]??'picture-1'}" ratio="1:1|3:4|4:3|9:16|16:9" cutout="true|false">a precise shot: subject, position, camera, light, ground, materials, colour, what is absent</picture>. No text, logos or interfaces in pictures. Read resources[id] in Frame: when ready, <Img src={staticFile(res.url)}/>; until then keep its place calm. Pictures arrive on a later turn.`,
  `Now: the idea, then the hero frame (${heroScene(input)}) in ${reference.format}, finished.`,
 ].join('\n\n');
}

/** The scene that proves the promise: the second when there are three or more, else the first. */
export const heroScene=(input:Pick<DirectionInput,'storyboard'>)=>(input.storyboard[1]??input.storyboard[0]).id;

type Report={build:string;findings?:unknown;views?:string[];pictures?:string[]};
/** What comes back after an answer: the build, the measured findings, and the renders (attached as images). */
export function benchTurn(report:Report,turn:number,maxTurns:number){
 const left=maxTurns-turn;
 if(!report.build.startsWith('passed'))return `BUILD ${report.build}\n\nFix the build and send the corrected file whole. Turns left: ${left}.`;
 const findings=(report.findings as {view?:string;severity?:string;detail?:string}[]|undefined)??[];
 return [
  `BUILD passed. Rendered: ${(report.views??[]).join('; ')}. The reference renders are attached.`,
  findings.length?`MEASURED FINDINGS\n${findings.map(f=>`- [${f.severity}] ${f.view}: ${f.detail}`).join('\n')}`:'MEASURED FINDINGS: none.',
  report.pictures?.length?`PICTURES READY: ${report.pictures.join(', ')}.`:'',
  `Look first: what does a viewer read first, second, third; what is the weakest point? Then ${left<=1?'make the last corrections and finish with <done/>':'fix it, or if this frame is signed, extend to the next scene or formats'}. Turns left: ${left}.`,
 ].filter(Boolean).join('\n\n');
}

export type BenchAnswer={files:{path:string;source:string}[];say:string;scene?:string;formats:string[];done:boolean;pictures:{id:string;ratio:string;cutout:boolean;brief:string}[]};
/** Reads the tagged answer. Tolerates a code fence around a file body. */
export function readBenchAnswer(text:string):BenchAnswer{
 const files=[...text.matchAll(/<file\s+path="([^"]+)"\s*>\n?([\s\S]*?)\n?<\/file>/g)].map(m=>({path:m[1].trim(),source:m[2].replace(/^```[a-z]*\n/,'').replace(/\n```\s*$/,'')+'\n'}));
 const outside=text.replace(/<file\s[\s\S]*?<\/file>/g,''),render=outside.match(/<render\s+scene="([^"]+)"(?:\s+formats="([^"]*)")?\s*\/?>/);
 const pictures=[...outside.matchAll(/<picture\s+id="([^"]+)"(?:\s+ratio="([^"]*)")?(?:\s+cutout="([^"]*)")?\s*>([\s\S]*?)<\/picture>/g)].map(m=>({id:m[1],ratio:m[2]||'1:1',cutout:m[3]==='true',brief:m[4].trim()}));
 return {files,say:(outside.match(/<say>([\s\S]*?)<\/say>/)?.[1]??'').trim(),scene:render?.[1],formats:(render?.[2]??'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,4),done:/<done\s*\/?>/.test(outside),pictures};
}
