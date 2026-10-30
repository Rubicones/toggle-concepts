import type {DirectionInput} from './types';
import type {WorkState} from './state';
import {readDesign} from './contract';
import {resourceRequest} from './resources';
/** Only completed answers previously saved by the design validator; never partial token-limit output. */
export function recoverSavedDesign(input:DirectionInput,state:WorkState,perStillMicroUsd:number){
 for(const text of [...(state.directorFeedback??[])].reverse()){
  try{const record=JSON.parse(text);if(typeof record.savedOutput!=='string')continue;
   const design=readDesign(JSON.parse(record.savedOutput),input);
   for(const resource of design.resources)resourceRequest(resource,{...input,materialMemory:design.materialMemory??input.materialMemory},perStillMicroUsd);
   return {design,raw:record.savedOutput};
  }catch{/* retain the original failure; no fabricated or partial answer is activated */}
 }
 return null;
}
