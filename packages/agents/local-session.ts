// Shared conversations in 'shared' Local runs (docs/plans/2026-11-11-local-chat-shaped-runs.md, LC3/LC4). Pure rules:
// which stored conversation a request continues, when it branches, and when a conversation is condensed instead.
import type {SessionPlan} from './run-context';

/** Planning stages that continue one conversation (each is a branch from the previous stage's stored point). */
export const CHAIN_ROLES:ReadonlySet<string>=new Set(['strategy','script','asset-plan','visual-direction']);
/** Roles that never join a creator's conversation: they judge it from the run context and the artefacts only. */
export const INDEPENDENT_ROLES:ReadonlySet<string>=new Set(['critic','research','intake','brand-kit','variants','localization']);
/** A conversation above this size is condensed: the next request starts a new one with earlier stages as their results. */
export const CONVERSATION_CAP=120000;

/** A stored point of a conversation: the session after a succeeded request, and how large the conversation was then. */
export type StoredPoint={role:string;sessionId:string;tokens:number;at?:string;/** C6: the size of the conversation's first request */seed?:number};
/** C6 (chat-shaped plan): how much a designer conversation may grow beyond its seed before it is condensed. */
export const WORKING_ROOM=100000;
/** C6: the cap of a conversation is relative: its seed (one full request) plus a working room, never below the seed,
 * so a condensed conversation is never condensed again at once (B2). Without a known seed, the fixed cap. */
export const relativeCap=(seed:number|undefined,room=WORKING_ROOM)=>seed===undefined?CONVERSATION_CAP:Math.max(seed,0)+room;
export type Plan=(SessionPlan&{condensed?:false;/** C1: the request carries only what the stored conversation lacks (designer turns): a missing conversation must not be restarted with it */shortPayload?:boolean})|{condensed:true;resume?:undefined;fork?:undefined;sameRole?:undefined}|null;

/**
 * Size of the conversation after a request, from its LAST model call (chat-shaped plan C1): what that call read (new,
 * cache read, cache write) plus what it wrote. A request with several internal calls reports its usage summed over
 * all of them, so the summed usage over-counts the history; it stays for billing only.
 */
export function lastCallSize(events:readonly unknown[]|undefined):number|undefined{
 for(let i=(events?.length??0)-1;i>=0;i--){const e=events![i] as {type?:string;message?:{usage?:Parameters<typeof conversationTokens>[0]}};if(e?.type==='assistant'&&e.message?.usage)return conversationTokens(e.message.usage);}
 return undefined;
}
/** The stored size of a request's conversation: the last call's size when the events had it, else the summed usage. */
export const storedSize=(l:{conversationSize?:number;usage?:Parameters<typeof conversationTokens>[0]}|undefined)=>l?.conversationSize??conversationTokens(l?.usage);

/** Size of the conversation after a request: everything it read plus what it wrote. */
export function conversationTokens(u:{input_tokens?:number;cache_creation_input_tokens?:number;cache_read_input_tokens?:number;output_tokens?:number}|undefined){
 return (u?.input_tokens??0)+(u?.cache_creation_input_tokens??0)+(u?.cache_read_input_tokens??0)+(u?.output_tokens??0);
}

/**
 * A planning stage: branch from the latest stored point of the previous chain stage it depends on. Independent roles
 * (the critic) and stages without a stored parent start a new conversation. A retry branches from the same point, so
 * a failed attempt is never part of the history; a restart finds the point again from the saved steps.
 */
export function planningPlan(role:string,parents:StoredPoint[],cap=CONVERSATION_CAP):Plan{
 if(!CHAIN_ROLES.has(role))return null;
 const parent=[...parents].filter(p=>CHAIN_ROLES.has(p.role)&&p.sessionId).sort((a,b)=>(a.at??'').localeCompare(b.at??'')).at(-1);
 if(!parent)return null;
 if(parent.tokens>cap)return {condensed:true};
 return {resume:parent.sessionId,fork:true,sameRole:parent.role===role};
}

/**
 * A designer turn: continue the direction's own conversation from its last accepted turn (a branch, so a refused or
 * unreadable answer never stays in the history); the first turn branches from the approved planning point.
 */
/** C1: whether a designer turn may send only what its conversation lacks: a real continuation of its own conversation.
 * A condensed, new, branched-from-planning or restarted turn sends the full payload (all files, results, notes, render). */
export const continuesOwnConversation=(plan:Plan)=>!!plan&&!plan.condensed&&!!plan.resume&&plan.sameRole===true;

export function designerPlan(state:{session?:StoredPoint},planningPoint:StoredPoint|null,cap=CONVERSATION_CAP):Plan{
 if(state.session)return state.session.tokens>cap?{condensed:true}:{resume:state.session.sessionId,fork:true,sameRole:true,shortPayload:true};
 return planningPoint&&planningPoint.tokens<=cap?{resume:planningPoint.sessionId,fork:true,sameRole:false}:null;
}

/** Plain words for the timeline. */
export function conversationLabel(kind:'new'|'continued'|'branched'|'condensed'|'restarted',role:string){
 // C1: the designer's turns say whether it kept its conversation or started over with the full draft, and why.
 if(role==='designer'&&kind!=='new')return ({continued:'Continued the conversation',branched:'Continued the conversation',condensed:'Started over with the full draft: the conversation was too long',restarted:'Started over with the full draft: the conversation was not found on this computer'} as const)[kind];
 return ({new:'Started a new conversation',continued:'Continuing the conversation',branched:role==='designer'?'Continuing the direction’s conversation from its last accepted turn':CHAIN_ROLES.has(role)?'Continuing the planning conversation':'Branched from the approved planning point',condensed:'Conversation condensed: earlier stages kept as their results',restarted:'The stored conversation was not found on this computer; started again with the shared context'} as const)[kind];
}
