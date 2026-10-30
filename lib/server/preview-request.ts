import {textRequestQuote} from '@/packages/agents/text-quote';
import 'server-only';
import {previewProtocol,PREVIEW_PROTOCOL} from '@/packages/contracts/preview-proposal';
import {effectiveRunAgents} from '@/packages/data/run-limits';
import {modelCatalog} from '@/packages/agents/catalog';
import {buildSnapshot,draftContext} from './drafts';
import {ApiError} from './api';
import {draftHash} from '@/packages/creative/compiler';
/** The art-director request attached to every reference-selection preview request. */
export const PREVIEW_SELECTION_REQUEST='Select saved copy and real media references for all three directions and every binding. Never regenerate copy, scope or resource names.';
export async function previewRequest(saved:Awaited<ReturnType<typeof draftContext>>,correction:string){
 const assembly=buildSnapshot(saved),assets=saved.context.assets;
 if(!assets.some(a=>a.mime.startsWith('image/')&&a.inspection.width&&a.inspection.height))throw new ApiError(409,'ASSETS_REQUIRED','Add validated product and logo images before building previews.');
 if(saved.context.planningRefs?.length!==6)throw new ApiError(409,'PLANNING_REQUIRED','Finish the six planning jobs first.');
 const agent=(await effectiveRunAgents(saved.admin,saved.run)).find(a=>a.role==='creative-code'),model=agent?.model_id?(await modelCatalog()).find(m=>m.id===agent.model_id):null;
 if(!agent?.model_id||!model||model.outputModalities.join()!=='text')throw new Error('MODEL_UNAVAILABLE');
 if(!model.supportedParameters.some(p=>['structured_outputs','response_format'].includes(p)))throw new Error('STRUCTURED_OUTPUT_UNAVAILABLE');
 const planning=saved.jobs.filter(j=>saved.context.planningRefs?.some(r=>r.id===j.id)).map(j=>({id:j.id,role:j.job_key,output:j.output!}));
 const protocol=previewProtocol({plan:assembly.plan,entries:saved.context.manifest.entries,assets,planning});
 const campaignContext={checkpointId:saved.round.origin_c1_id,draftAssembly:assembly,availableAssets:assets,planning};
 const prompt=protocol.task+'\nART DIRECTOR REQUEST: '+correction;
 const maxOutput=Math.min(model.maxOutput,agent.max_output_tokens,protocol.maxOutputTokens);
 const snapshot={stream:true,previewProtocol:PREVIEW_PROTOCOL,protocolInstructions:protocol.protocolInstructions,responseSchema:protocol.responseSchema,instructions:agent.instructions,maxOutputTokens:maxOutput,stepCapMicroUsd:agent.step_cap_micro_usd,pricing:model,campaignContext,budgetScopeId:`budget-step-${saved.run.id}-creative-code`,outputFormat:'json_schema',disableReasoning:model.id==='google/gemini-2.5-flash',draftPlanVersion:saved.plan!.version,draftInputHash:draftHash(assembly),draftCorrection:correction};
 const quote=textRequestQuote(prompt,snapshot);
 if(quote.inputTokenBound+maxOutput>model.contextLength)throw new Error('PROMPT_TOO_LONG');
 return {model:agent.model_id,prompt,snapshot,reservation:quote.reservationMicroUsd};
}
