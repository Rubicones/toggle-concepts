import type {CreativeInputs} from '../../creative/protocol';
import type {CreativeStage} from './creative-v1';
import {creativePromptV2} from './creative-v2';
/** The app restricts the view to issued slots; the provider never authors a patch path. */
export function creativeRepairV2(stage:Exclude<CreativeStage,'compile'>,input:CreativeInputs){return creativePromptV2(stage,input);}
