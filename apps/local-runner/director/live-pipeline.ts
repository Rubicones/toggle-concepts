import {access,constants} from 'node:fs/promises';
import type {DirectionInput} from '../../../packages/director/types';
export const usesLiveDraft=(input:Pick<DirectionInput,'stage'>):boolean=>input.stage==='draft';
export async function ensureLivePreviewToolchain(){if(process.platform!=='darwin')throw new Error('DIRECTOR_OS_SANDBOX_UNAVAILABLE');await access('/usr/bin/sandbox-exec',constants.X_OK);}
/** Both approved lanes settle before the lease is released. A failure prevents subsequent requests in either lane. */
export async function livePipeline(resources:(guard:()=>Promise<void>)=>Promise<void>,coder:(guard:()=>Promise<void>)=>Promise<void>,controls:()=>Promise<void>){
 let failure:unknown;const guard=async()=>{if(failure)throw failure;await controls();if(failure)throw failure;};
 const lane=async(run:(guard:()=>Promise<void>)=>Promise<void>)=>{try{await run(guard);}catch(error){failure??=error;throw error;}};
 await Promise.allSettled([lane(resources),lane(coder)]);if(failure)throw failure;
}
