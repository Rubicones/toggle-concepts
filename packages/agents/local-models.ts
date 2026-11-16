// Local model mapping (docs/plans/2026-11-06-local-claude-pipeline-plan.md, §5). The owner's rule: every current Flash
// text role runs on Sonnet. The list is explicit; a model id is never classified by finding "flash" in it, and image
// generation never reaches this mapping (it stays on OpenRouter). A missing mapping blocks the call.
export const LOCAL_MODEL_MAPPING_VERSION='local-models@1';

/** Current Flash text models from configuration (studio agents and the route defaults). Add new ids here explicitly. */
export const FLASH_TEXT_MODELS=['google/gemini-2.5-flash'] as const;

const NOT_TEXT=/image|video|audio|speech|tts|embedding|veo|imagen|sora|flux|tripo/i;
export type LocalModelChoice={target:string;execution:string;rule:'flash-to-sonnet'|'same-claude-model'|'other-text-to-sonnet';version:typeof LOCAL_MODEL_MAPPING_VERSION};

/**
 * The model the CLI runs for a target model. `sonnet` is the concrete Sonnet id pinned by the device's qualified
 * profile (never a floating alias). Claude targets run as the same Claude model under its CLI id.
 */
export function localModelFor(target:string,pinned:{sonnet:string}):LocalModelChoice{
 if(!pinned.sonnet||!/^claude-/.test(pinned.sonnet))throw new Error('LOCAL_MODEL_NOT_PINNED');
 if((FLASH_TEXT_MODELS as readonly string[]).includes(target))return {target,execution:pinned.sonnet,rule:'flash-to-sonnet',version:LOCAL_MODEL_MAPPING_VERSION};
 const claude=/^anthropic\/(claude-[a-z]+-\d+(?:\.\d+)?)$/.exec(target);
 if(claude)return {target,execution:claude[1].replace(/\./g,'-'),rule:'same-claude-model',version:LOCAL_MODEL_MAPPING_VERSION};
 // Live run 2026-11-14: the critic's saved model had no mapping, and every review of a Local run failed mid-run. A
 // Local run sends no text to another provider, so any other text model runs on the pinned Sonnet too. A model that
 // makes pictures, video or sound is never a text role's model and stays refused.
 if(!NOT_TEXT.test(target))return {target,execution:pinned.sonnet,rule:'other-text-to-sonnet',version:LOCAL_MODEL_MAPPING_VERSION};
 throw new Error('LOCAL_MODEL_MAPPING_REQUIRED');
}

/** Plan E3b: what a role set to `target` runs on in a Local run, in words (no device needed: the pinned Sonnet is named
 * as "Sonnet"). Replaces the silent mapping with a visible one: Models & agents and the draft price show it. */
export function localRunsAs(target:string|null|undefined):{kind:'same'|'sonnet'|'none'|'unset';runsAs:string;line:string}{
 if(!target)return {kind:'unset',runsAs:'',line:'no model is set'};
 if((FLASH_TEXT_MODELS as readonly string[]).includes(target))return {kind:'sonnet',runsAs:'Sonnet',line:`set: ${target} · runs as: Sonnet in Local runs`};
 const claude=/^anthropic\/(claude-[a-z]+-\d+(?:\.\d+)?)$/.exec(target);
 if(claude)return {kind:'same',runsAs:claude[1].replace(/\./g,'-'),line:`set: ${target} · runs as: the same model (${claude[1].replace(/\./g,'-')}) in Local runs`};
 if(!NOT_TEXT.test(target))return {kind:'sonnet',runsAs:'Sonnet',line:`set: ${target} · runs as: Sonnet in Local runs (a Local run sends no text to another provider)`};
 return {kind:'none',runsAs:'',line:`set: ${target} · cannot run in Local runs (it is not a text model)`};
}
/** Plan E3a: the roles of the creative chain. The designer runs on the visual-direction agent's model, so one
 * conversation from strategy to the key frame needs these three on one model. */
export const CHAIN_MODEL_ROLES=['strategy','script','visual-direction'] as const;
const ROLE_WORDS:Record<string,string>={strategy:'Strategy',script:'Script','visual-direction':'Visual direction and the designer',critic:'Creative review'};
/** What the owner is told about models before a Local draft starts: each role's set and executed model, whether the
 * chain is on one model (and what follows when it is not), and the roles that cannot run locally. */
export function localModelNotes(agents:{role:string;model_id:string|null|undefined}[]):{lines:string[];oneModel:boolean;chainNotice:string;unrunnable:string[]}{
 const of=(role:string)=>agents.find(a=>a.role===role)?.model_id??null,roles=[...CHAIN_MODEL_ROLES,'critic'];
 const lines=roles.map(r=>`${ROLE_WORDS[r]}: ${localRunsAs(of(r)).line}`),runs=CHAIN_MODEL_ROLES.map(r=>localRunsAs(of(r)));
 const oneModel=runs.every(r=>r.runsAs&&r.runsAs===runs[0].runsAs),unrunnable=roles.filter(r=>['none','unset'].includes(localRunsAs(of(r)).kind)).map(r=>ROLE_WORDS[r]);
 const chainNotice=oneModel?`Strategy, script, visual direction and the designer run on one model (${runs[0].runsAs}), so the designer can continue the planning conversation.`:`Strategy, script and visual direction run on different models (${CHAIN_MODEL_ROLES.map((r,i)=>`${r}: ${runs[i].runsAs||'none'}`).join(', ')}). A conversation cannot move between models, so the designer will start a new conversation with the key frame brief instead of continuing the planning. Set all three to one model in Models & agents to keep one conversation.`;
 return {lines,oneModel,chainNotice,unrunnable};
}
