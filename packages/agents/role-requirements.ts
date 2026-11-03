import type {CatalogModel} from './catalog';
import {FLASH_MODEL,IMAGE_MODEL} from './defaults';
import {draftModelProblem,type DirectorModelRole} from '../director/role-models';

/** Roles that also run in live drafts, where their model must meet the draft rules. */
const draftRoles:Record<string,DirectorModelRole>={'visual-direction':'director','creative-code':'assembler',critic:'critic'};

/** What each role needs from its model, in plain words for Models & agents. */
export function roleRequirement(role:string){
 if(role==='image')return `Runs through the image adapter, which executes ${IMAGE_MODEL} only.`;
 if(role==='brand-kit')return `Brand vision reading runs through an adapter that requires ${FLASH_MODEL}.`;
 if(role==='video'||role==='model3d')return 'No generation provider is connected; no model is used.';
 if(role==='visual-direction')return 'Text model that reads images, supports structured outputs and has at least 64k context (also used as the live-draft visual director).';
 if(role==='creative-code')return 'Text model that supports structured outputs and has at least 64k context (also used as the live-draft coder).';
 if(role==='critic')return 'Text model that reads images, supports structured outputs and has at least 32k context (the live-draft creative review).';
 return 'Text model.';
}

/** Why a model cannot work in a role, or undefined when it can. The same rules the runs apply. */
export function agentModelProblem(role:string,model:CatalogModel|undefined,modelId:string|null):string|undefined{
 if(role==='video'||role==='model3d')return modelId===null?undefined:'No generation provider is connected for this role.';
 if(!modelId)return 'Choose a model.';
 if(!model)return `The model ${modelId} is not available from the provider right now.`;
 if(role==='image')return model.id===IMAGE_MODEL?undefined:`The image adapter executes ${IMAGE_MODEL} only; ${model.name} would never run.`;
 if(model.outputModalities.length!==1||model.outputModalities[0]!=='text')return `This role needs a text model; ${model.name} returns ${model.outputModalities.join(', ')}.`;
 if(role==='brand-kit'&&model.id!==FLASH_MODEL)return `Brand vision reading requires ${FLASH_MODEL}; ${model.name} would stop brand preparation.`;
 const draft=draftRoles[role];
 return draft?draftModelProblem(draft,model,modelId)?.message:undefined;
}
