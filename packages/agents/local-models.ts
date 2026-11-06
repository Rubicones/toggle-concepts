// Local model mapping (docs/plans/2026-11-06-local-claude-pipeline-plan.md, §5). The owner's rule: every current Flash
// text role runs on Sonnet. The list is explicit; a model id is never classified by finding "flash" in it, and image
// generation never reaches this mapping (it stays on OpenRouter). A missing mapping blocks the call.
export const LOCAL_MODEL_MAPPING_VERSION='local-models@1';

/** Current Flash text models from configuration (studio agents and the route defaults). Add new ids here explicitly. */
export const FLASH_TEXT_MODELS=['google/gemini-2.5-flash'] as const;

export type LocalModelChoice={target:string;execution:string;rule:'flash-to-sonnet'|'same-claude-model';version:typeof LOCAL_MODEL_MAPPING_VERSION};

/**
 * The model the CLI runs for a target model. `sonnet` is the concrete Sonnet id pinned by the device's qualified
 * profile (never a floating alias). Claude targets run as the same Claude model under its CLI id.
 */
export function localModelFor(target:string,pinned:{sonnet:string}):LocalModelChoice{
 if(!pinned.sonnet||!/^claude-/.test(pinned.sonnet))throw new Error('LOCAL_MODEL_NOT_PINNED');
 if((FLASH_TEXT_MODELS as readonly string[]).includes(target))return {target,execution:pinned.sonnet,rule:'flash-to-sonnet',version:LOCAL_MODEL_MAPPING_VERSION};
 const claude=/^anthropic\/(claude-[a-z]+-\d+(?:\.\d+)?)$/.exec(target);
 if(claude)return {target,execution:claude[1].replace(/\./g,'-'),rule:'same-claude-model',version:LOCAL_MODEL_MAPPING_VERSION};
 throw new Error('LOCAL_MODEL_MAPPING_REQUIRED');
}
