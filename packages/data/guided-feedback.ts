/** Appending feedback is idempotent; a progress-heartbeat race can safely refresh its version. */
export async function appendGuidedFeedback<T>(readVersion:()=>Promise<number>,append:(version:number)=>Promise<{data:T;error:{code?:string;message:string}|null}>){
 let last:{data:T;error:{code?:string;message:string}|null}|undefined;
 for(let attempt=0;attempt<3;attempt++){
  last=await append(await readVersion());if(!last.error||!(last.error.code==='40001'||last.error.message.includes('STALE_GUIDED_RUN')))return last;
 }
 return last!;
}
