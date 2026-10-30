import {z} from 'zod';
const variant=z.string().min(1),file=z.string().min(1).max(160);
export const assemblerActionSchema=z.discriminatedUnion('tool',[
 z.strictObject({tool:z.literal('write'),path:file,source:z.string().max(524288)}),z.strictObject({tool:z.literal('read'),path:file,offset:z.number().int().nonnegative().optional()}),
 ...(['typecheck','bundle','lint','checks','listResources','brand','finish'] as const).map(tool=>z.strictObject({tool:z.literal(tool)})),
 z.strictObject({tool:z.literal('renderStill'),variantId:variant,frame:z.number().int().nonnegative().optional(),sceneId:z.string().optional(),moment:z.string().optional()}),
 z.strictObject({tool:z.literal('preview'),variantId:variant}),z.strictObject({tool:z.literal('determinism'),variantId:variant})
]);
export const assemblerResponse=z.strictObject({calls:z.array(assemblerActionSchema).min(1).max(6)});
export type AssemblerAction=z.infer<typeof assemblerActionSchema>;
const tools=['write','read','typecheck','bundle','lint','checks','listResources','brand','finish','renderStill','preview','determinism'] as const;
const fields:Record<(typeof tools)[number],string[]>={write:['path','source'],read:['path','offset'],typecheck:[],bundle:[],lint:[],checks:[],listResources:[],brand:[],finish:[],renderStill:['variantId','frame','sceneId','moment'],preview:['variantId'],determinism:['variantId']};
/**
 * The provider gets one flat call object (a union of twelve tool shapes is rejected or too complex for some
 * structured-output engines). The app turns each call back into its exact tool shape and validates it fully.
 */
export const assemblerProviderSchema={name:'assembler_tools_v2',schema:{type:'object',properties:{calls:{type:'array',minItems:1,items:{type:'object',properties:{tool:{type:'string',enum:[...tools]},path:{type:'string',description:'write/read: file path in your folder'},source:{type:'string',description:'write: complete file text'},offset:{type:'integer',description:'read: character offset'},variantId:{type:'string',description:'renderStill/preview/determinism: issued variant id'},frame:{type:'integer',description:'motion-stage renderStill: frame number'},sceneId:{type:'string',description:'static renderStill: issued scene id'},moment:{type:'string',description:'static renderStill: director-issued moment id'}},required:['tool'],additionalProperties:false}}},required:['calls'],additionalProperties:false} as Record<string,unknown>};
export function readAssemblerReply(value:unknown){
 const reply=value as {calls?:unknown};
 const calls=Array.isArray(reply?.calls)?reply.calls.map(call=>{const c=call as Record<string,unknown>,tool=c?.tool as (typeof tools)[number];return fields[tool]?Object.fromEntries([['tool',tool],...fields[tool].filter(k=>c[k]!==undefined&&c[k]!==null).map(k=>[k,c[k]])]):call;}):reply?.calls;
 return assemblerResponse.parse({calls});
}
export const MAX_CALLS_PER_TURN=6;
/**
 * Lenient turn reader: valid calls run even when a sibling call is malformed or the reply has more calls than one turn
 * allows; each rejected call gets its own plain explanation instead of discarding the whole turn.
 */
export function parseAssemblerReply(text:string){
 let value:unknown;
 try{value=JSON.parse(text);}catch{const start=text.indexOf('{'),end=text.lastIndexOf('}');if(start<0||end<=start)throw new Error('The reply was not JSON. Return only {"calls":[...]}.');try{value=JSON.parse(text.slice(start,end+1));}catch{throw new Error('The reply was not valid JSON (often an unescaped quote or newline inside "source"). Return only {"calls":[...]}.');}}
 const raw=(value as {calls?:unknown})?.calls;if(!Array.isArray(raw)||!raw.length)throw new Error('Return {"calls":[...]} with at least one tool call.');
 const calls:AssemblerAction[]=[],rejected:{index:number;tool:string;error:string}[]=[];
 raw.forEach((call,index)=>{const c=call as Record<string,unknown>,tool=String(c?.tool??'');
  if(index>=MAX_CALLS_PER_TURN){rejected.push({index,tool,error:`Not run: at most ${MAX_CALLS_PER_TURN} calls per reply. Send it again in your next reply.`});return;}
  const shaped=fields[tool as (typeof tools)[number]]?Object.fromEntries([['tool',tool],...fields[tool as (typeof tools)[number]].filter(k=>c[k]!==undefined&&c[k]!==null&&c[k]!=='').map(k=>[k,c[k]])]):c;
  const parsed=assemblerActionSchema.safeParse(shaped);
  if(parsed.success)calls.push(parsed.data);else rejected.push({index,tool,error:`Not run: ${parsed.error.issues.slice(0,3).map(i=>`${i.path.join('.')||'call'} ${i.message}`).join('; ')}. Required fields — ${fields[tool as (typeof tools)[number]]?`${tool}: ${fields[tool as (typeof tools)[number]].join(', ')||'none'}`:`unknown tool; use one of ${tools.join(', ')}`}.`});
 });
 return {calls,rejected};
}
export const assemblerInstructions=`You are a senior creative coding artist implementing the director's film, not a slot filler. Write ONE parametric Remotion React/TSX default-export composition in Composition.tsx with props format, locale, hook, cta, length. Recompose each format yourself from the design document. Every visual and motion choice is yours within that document and the approved storyboard and brand. Read copy, variants and variantFacts from ./brand; variantFacts binds each issued variant to its exact localized scene copy and protected required strings. Select facts by the five props, and use their approved timing where present. Use the issued copy module verbatim; never invent copy, claims, identities, assets or local file ids.
All React/CSS/SVG/canvas techniques and installed Remotion transitions, paths, shapes, noise, lottie, media-utils and layout-utils are available. Import useGsapTimeline, gsap and plugins from ./runtime; the hook builds a paused timeline and seeks frame/fps. Key DOM nodes by their text/scene when using SplitText so its cleanup cannot restore obsolete text into a reused React node. GSAP SplitText, MorphSVG, DrawSVG, MotionPath, CustomEase and Flip are registered. Use frame-derived transforms with ThreeCanvas from @remotion/three and React Three Fiber. The frame is a pure function of useCurrentFrame() and props. No requestAnimationFrame, timers, Date, Math.random, CSS animations/transitions, R3F useFrame clocks, network requests, Node APIs or dynamic imports. Use Remotion random(seed). FontFace loading is supplied in brand.ts. Resources use local staticFile URLs; do not edit immutable brand.ts, runtime.ts, input.json, entry.tsx, catalog.json, toolchain.json or public resources. Mark each displayed logo image with data-brand-logo equal to its issued logo id so the render can measure it.
You have tools to write/read your own source files, typecheck, bundle, lint, renderStill(variantId,frame), preview(variantId), checks, determinism(variantId), listResources and brand. Tool results are observations: fix code yourself; the host will never move, resize or re-time anything. Use those tools to see failures and repair them until all objective checks pass. Always typecheck and bundle after source changes. checks includes per-format foreground/background pixel checks and out-of-order repeat frames. Only finish after checks pass for the current complete source version. If approved copy cannot be made legible, explain this in your source/tool context; do not change it. Return JSON calls matching the provided tools schema: at most 6 calls per reply, and only the fields a tool uses (write: path, source; read: path; renderStill: variantId, frame; preview/determinism: variantId). Write Composition.tsx first, then typecheck and bundle. Never return a layout plan instead of executable source.`;
