// Chat-shaped plan C6: the extension (designerVersion 4, stage E). After the hero frame is accepted the same
// conversation continues, the way a person in a chat asks "now the other scenes": first the other scenes (up to four
// per render, carrying the hero's system), then each ordered format as its own composition, then languages, hooks,
// calls to action and lengths as data. The mechanics arrive once, as one message. The full hard findings return per
// format and language, grouped so the designer fixes the rule behind them, not each case. Pure functions.
import {z} from 'zod';
import {pictureSchema} from './hero-chat';
import {designerInstructionsV3} from '../agents/prompts/designer-v1';
import {copyTable} from './designer-context';
import type {Finding} from './layout-inspection';
import type {DirectionInput,Variant} from './types';

export const extensionActionsSchema=z.strictObject({
 render:z.union([z.boolean(),z.strictObject({scenes:z.array(z.string().min(1).max(100)).max(4).optional(),formats:z.array(z.string().min(1).max(100)).max(8).optional(),languages:z.array(z.string().min(1).max(20)).max(6).optional()})]).optional(),
 pictures:z.array(pictureSchema).max(4).optional(),
 materials:z.array(z.strictObject({name:z.string().min(1).max(80),why:z.string().min(1).max(200)})).max(4).optional(),
 /** The designer's own record of the draft (decisions, what was tried, what remains); it seeds a condensed conversation. */
 notes:z.string().min(1).max(1500).optional(),
 finish:z.strictObject({intent:z.string().min(80).max(4000),scenes:z.array(z.strictObject({scene:z.string().min(1).max(100),moment:z.string().min(1).max(200),motion:z.string().max(240).optional(),sound:z.string().max(200).optional()})).min(1).max(40)}).optional(),
});
export type ExtensionActions=z.infer<typeof extensionActionsSchema>;
export type ExtensionPhase='scenes'|'formats'|'variations';
export const phaseLabels:Record<ExtensionPhase,string>={scenes:'Now extending the hero to the other scenes',formats:'Formats',variations:'Languages and variations'};

/** "Scene 2", "scene 2", "2" or an id → the scene's id; undefined when it names no scene. */
export function sceneIdOf(name:string,input:Pick<DirectionInput,'storyboard'>){
 const t=name.trim(),n=/^(?:scene\s*)?(\d+)$/i.exec(t)?.[1];
 return n?input.storyboard[Number(n)-1]?.id:input.storyboard.find(s=>s.id===t)?.id;
}
export const sceneLabel=(id:string,input:Pick<DirectionInput,'storyboard'>)=>`Scene ${input.storyboard.findIndex(s=>s.id===id)+1}`;

/** The phase of the work: the first one whose renders are not all done. */
export function extensionPhase(input:Pick<DirectionInput,'storyboard'|'formats'|'variants'>,renders:Record<string,number>):ExtensionPhase{
 const reference=input.variants[0]?.format??input.formats[0]?.id;
 if(input.storyboard.some(s=>!(renders[`${s.id}@${reference}`]>0)))return 'scenes';
 if(input.storyboard.some(s=>input.formats.some(f=>!(renders[`${s.id}@${f.id}`]>0))))return 'formats';
 return 'variations';
}
/** What the next render should cover in a phase, when the designer does not say: up to four scenes not yet rendered. */
export function nextRender(input:Pick<DirectionInput,'storyboard'|'formats'|'variants'>,renders:Record<string,number>,phase:ExtensionPhase){
 const reference=input.variants[0]?.format??input.formats[0]?.id??'';
 if(phase==='scenes')return {scenes:input.storyboard.filter(s=>!(renders[`${s.id}@${reference}`]>0)).slice(0,4).map(s=>s.id),formats:[reference]};
 if(phase==='formats'){const f=input.formats.find(x=>input.storyboard.some(s=>!(renders[`${s.id}@${x.id}`]>0)))??input.formats[0];return {scenes:input.storyboard.filter(s=>!(renders[`${s.id}@${f.id}`]>0)).slice(0,4).map(s=>s.id),formats:[f.id]};}
 return {scenes:input.storyboard.slice(0,4).map(s=>s.id),formats:[reference]};
}
/** The variants a variations render shows: one per language (reference hook) and one per hook (reference language), at most six. */
export function variationVariants(input:Pick<DirectionInput,'variants'>,languages?:string[]):Variant[]{
 const ref=input.variants[0];if(!ref)return [];const out:Variant[]=[ref];
 const add=(v?:Variant)=>{if(v&&!out.some(o=>o.id===v.id)&&out.length<6)out.push(v);};
 for(const l of [...new Set(input.variants.map(v=>v.locale))].filter(l=>!languages?.length||languages.includes(l)))add(input.variants.find(v=>v.locale===l&&v.hook===ref.hook&&v.format===ref.format)??input.variants.find(v=>v.locale===l));
 for(const h of new Set(input.variants.map(v=>v.hook)))add(input.variants.find(v=>v.hook===h&&v.locale===ref.locale&&v.format===ref.format));
 return out;
}

/** The full hard set, per format and language, grouped by problem so the designer fixes the rule, not each case. */
export function extensionNote(findings:Pick<Finding,'code'|'severity'|'detail'|'view'>[],shots:number){
 const group=(list:typeof findings)=>{const by=new Map<string,{detail:string;views:Set<string>}>();for(const f of list){const g=by.get(f.code)??{detail:f.detail,views:new Set<string>()};g.views.add(f.view);by.set(f.code,g);}return [...by.values()];};
 const hard=group(findings.filter(f=>f.severity==='hard')),soft=group(findings.filter(f=>f.severity!=='hard'));
 const line=(g:{detail:string;views:Set<string>})=>`- ${g.detail}${g.views.size>1?` (in ${g.views.size} views: ${[...g.views].slice(0,4).join('; ')}${g.views.size>4?'; …':''})`:''}`;
 return [`Here is the render (${shots} view${shots===1?'':'s'} attached).`,hard.length?`Must fix — change the rule that causes each one, not each case:\n${hard.slice(0,10).map(line).join('\n')}`:'Nothing must be fixed.',soft.length?`Also measured:\n${soft.slice(0,8).map(line).join('\n')}`:''].filter(Boolean).join('\n\n');
}

const section=(name:string)=>{const t=designerInstructionsV3,start=t.indexOf(`${name}`),ends=['\n\nENGINE KIT','\n\nWORDS ARE DATA','\n\nCODE.','\n\nFORMATS.','\n\nWORK.'].map(e=>t.indexOf(e,start+1)).filter(i=>i>start);return start<0?'':t.slice(start,ends.length?Math.min(...ends):undefined).trim();};
/** The mechanics of stage E, sent once as one message (and again only to seed a condensed conversation). */
export function stageEMechanics(input:DirectionInput){
 const table=copyTable(input),scenes=input.storyboard;
 const copy=Object.entries(table).map(([id,hooks])=>`${sceneLabel(id,input)}:\n${Object.entries(hooks).map(([hook,locales])=>Object.entries(locales).map(([locale,l])=>`  ${hook} · ${locale}: ${l.join(' / ')}`).join('\n')).join('\n')}`).join('\n');
 return `HOW THE DRAFT WORKS FROM NOW ON
Scene names and the ids your code and actions use:
${scenes.map((s,i)=>`Scene ${i+1} = ${s.id}`).join('\n')}
Ordered formats: ${input.formats.map(f=>`${f.id} ${f.width}×${f.height}`).join(', ')}.

${section('ENGINE KIT')}

${section('WORDS ARE DATA').replace('copyByScene lists every ordered line per scene, hook and language','The copy table below lists every ordered line per scene, hook and language')}

${section('CODE.')}

${section('FORMATS.')}

THE ORDER. First the other scenes, carrying the hero's system (its type, hierarchy, the product's presence and the brand's system); then each ordered format as its own composition; then the languages, hooks, calls to action and lengths, which are data the code reads. Render with {"render":{"scenes":["Scene 2","Scene 3"],"formats":["…"]}} (up to four scenes at a time; formats default to the reference one; {"render":{"languages":["…"]}} shows the variations). From now on every hard problem is measured per format and language: fix the rule that causes it, not each case. Keep notes in the actions block ({"notes":"…"}): the decisions that hold, what you tried and what remains. When every scene, format and option works, finish with {"finish":{"intent":"…","scenes":[{"scene":"Scene 1","moment":"…"}]}}.

COPY TABLE
${copy||'(only the reference words)'}`;
}
/** The seed of a condensed conversation: everything the work needs, so the new conversation continues it. */
export function compactionSeed(args:{mechanics:string;notes?:string;files:{path:string;source:string}[];done:string[];lastNote?:string}){
 return [`THIS CONVERSATION CONTINUES A DRAFT IN PROGRESS. The hero frame is accepted (its render is attached first).`,args.mechanics,args.notes?`YOUR NOTES\n${args.notes}`:'',`DONE SO FAR\n${args.done.length?args.done.join('\n'):'Only the hero frame.'}`,`YOUR FILES\n${args.files.map(f=>`\`\`\`tsx ${f.path}\n${f.source}\n\`\`\``).join('\n')}`,args.lastNote??''].filter(Boolean).join('\n\n');
}
