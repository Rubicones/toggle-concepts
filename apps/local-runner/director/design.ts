import type {DirectionInput} from '../../../packages/director/types';
import type {WorkState} from '../../../packages/director/state';
import type {Design} from '../../../packages/director/contract';
import {recoverSavedDesign} from '../../../packages/director/saved-design';
import {readDesign} from '../../../packages/director/contract';
import {resourceRequest} from '../../../packages/director/resources';
import {directorAttemptAvailable,DIRECTOR_OUTPUT_FEEDBACK} from '../../../packages/director/design-attempts';
/** Saved attempts keep their identities across restarts and additional priced allowances. */
export async function designDirection(args:{input:DirectionInput;state:WorkState;approvedRequests:number;perStillMicroUsd:number;call:(attempt:number,feedback:string[])=>Promise<{text:string}>;ready:(design:Design)=>Promise<void>;save:()=>Promise<void>}){
 const {state,input}=args;state.directorFeedback??=[];
 if(!state.design){const saved=recoverSavedDesign(input,state,args.perStillMicroUsd);if(saved){state.design=saved.design;state.events=[...(state.events??[]),{at:Date.now(),text:'Recovered a complete saved director answer after reference validation; no new director request.'}];await args.ready(saved.design);await args.save();return saved.design;}}

 while(!state.design&&directorAttemptAvailable(state.directorFeedback.length,args.approvedRequests)){
  const attempt=state.directorFeedback.length;let response:{text:string};
  try{response=await args.call(attempt,state.directorFeedback);}catch(error){
   if(!(error instanceof Error&&error.message==='OUTPUT_TOKEN_LIMIT'))throw error;
   state.directorFeedback.push(JSON.stringify({error:'OUTPUT_TOKEN_LIMIT',detail:DIRECTOR_OUTPUT_FEEDBACK}));await args.save();continue;
  }
  let design:Design;
  try{design=readDesign(JSON.parse(response.text),input);for(const resource of design.resources)resourceRequest(resource,{...input,materialMemory:design.materialMemory??input.materialMemory},args.perStillMicroUsd);}
  catch(error){state.directorFeedback.push(JSON.stringify({savedOutput:response.text,error:error instanceof Error?error.message:'Invalid contract'}));await args.save();continue;}
  state.design=design;await args.ready(design);await args.save();
 }
 if(!state.design)throw new Error('DIRECTOR_ALLOWANCE_EXHAUSTED');return state.design;
}
