import {z} from 'zod';
import type {RoutedNote,ADQuestion} from './state';
import {requestId} from './money';
export const critiqueSchema=z.strictObject({accepted:z.boolean(),summary:z.string().min(1).max(6000),notes:z.array(z.strictObject({recipient:z.enum(['director','assembler']),text:z.string().min(1).max(6000)})).max(40)});
export type Critique=z.infer<typeof critiqueSchema>;
export function readCritique(value:unknown){const result=critiqueSchema.parse(value);if(!result.accepted&&!result.notes.length)throw new Error('CRITIC_NOTES_REQUIRED');return result;}
export function critiqueDecision(critique:Critique,round:number,context:{directionId:string;iterationIds:string[]}){
 if(!Number.isInteger(round)||round<1||round>2)throw new Error('CRITIC_ROUND_LIMIT');
 if(critique.accepted)return {state:'accepted' as const,notes:critique.notes};
 if(round<2)return {state:'revise' as const,director:critique.notes.filter(n=>n.recipient==='director'),assembler:critique.notes.filter(n=>n.recipient==='assembler'),notes:critique.notes};
 const question:ADQuestion={id:requestId({directionId:context.directionId,iterations:context.iterationIds}),directionId:context.directionId,reason:'convergence',question:'Two versions are ready to compare. The creative review still has concerns. Which version should we keep, or should we review another allowance?',options:[...context.iterationIds.map((id,i)=>({action:`keep:${id}`,label:`Keep version ${i+1}`,priceMicroUsd:0})),{action:'quote-revision',label:'Review another allowance',priceMicroUsd:0}]};
 return {state:'question' as const,question,notes:critique.notes};
}
export function routeNotes(notes:RoutedNote[]){return {director:notes.filter(n=>n.recipient==='director'),assembler:notes.filter(n=>n.recipient==='assembler')};}
