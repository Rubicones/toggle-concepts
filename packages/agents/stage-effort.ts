// Effort per stage (docs/plans/2026-11-11-local-chat-shaped-runs.md, LC6), for 'shared' Local runs: high where the
// visual idea is invented, medium for repair turns, check-driven edits and roles that do not invent. The owner can
// change any stage in Models & agents; the values are frozen with the run context.
/** The efforts the Claude Code CLI takes. */
export type Effort='low'|'medium'|'high'|'xhigh'|'max';

export const STAGES=[
 {id:'planning-create',label:'Strategy, script and visual planning',default:'high'},
 {id:'supporting',label:'Research, brand reading, variants and localization',default:'medium'},
 {id:'design-create',label:'Designing a frame (first design, hero frame, recomposition)',default:'high'},
 {id:'design-hero',label:'The hero frame as a chat (stage H)',default:'high'},
 {id:'design-revise',label:'Revising after a render or measured findings',default:'medium'},
 {id:'code-build',label:'Building the component from the design (coder)',default:'medium'},
 {id:'code-repair',label:'Code repairs',default:'medium'},
 {id:'critic',label:'Critic review',default:'medium'},
] as const satisfies readonly {id:string;label:string;default:Effort}[];
export type StageId=typeof STAGES[number]['id'];
export const DEFAULT_STAGE_EFFORT=Object.fromEntries(STAGES.map(s=>[s.id,s.default])) as Record<StageId,Effort>;

const PLANNING=new Set(['strategy','script','asset-plan','visual-direction','layout']);
/** The stage of a request from its role and what the turn does. */
export function stageOf(role:string,detail:{revising?:boolean;repair?:boolean;hero?:boolean;extension?:boolean}={}):StageId{
 if(role==='critic')return 'critic';
 // C5: stage H (designerVersion 4) runs at its own effort, high by default, every turn of the hero conversation.
 if(role==='designer'&&detail.hero)return 'design-hero';
 // C7: stage E of a version 4 designer keeps one effort for the whole conversation: a change of thinking settings drops
 // the cached messages (Anthropic's documented behaviour), so revise turns do not flip it.
 if(role==='designer'&&detail.extension)return 'design-create';
 if(role==='designer')return detail.revising?'design-revise':'design-create';
 // The coder implements the director's design; it does not invent it, so its turns are not the inventing stage.
 if(role==='assembler'||role==='coder'||role==='creative-code')return detail.repair?'code-repair':'code-build';
 if(role==='director')return 'design-create';
 return PLANNING.has(role)?'planning-create':'supporting';
}
export function stageEffort(stage:StageId,overrides:Partial<Record<string,string>>={}):Effort{
 const o=overrides[stage];return (o&&['low','medium','high','xhigh','max'].includes(o)?o:DEFAULT_STAGE_EFFORT[stage]) as Effort;
}
